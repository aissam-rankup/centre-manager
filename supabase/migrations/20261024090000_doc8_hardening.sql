-- =====================================================================
-- CentroManager — 047 : réinscription et caisse, derniers correctifs
-- (page 8, constats mineurs des revues)
--
--  * File des rappels : une relance de paiement notée depuis le suivi
--    (appel, visite) compte pour la vague « en retard » ; les factures de
--    pack sont signalées (libellé « Pack … » côté application).
--  * Campagne confirmée : ses lignes et intentions ne changent ni d'auteur,
--    ni de remise, ni de facture (seul l'effacement, à la suppression, reste
--    possible) ; une ligne ne pointe que sur une facture de son élève.
--  * Statut d'une campagne et ses dates vont ensemble (envoi, clôture,
--    annulation).
--  * Références croisées entre centres bloquées par le schéma : remise,
--    reçu, charge, ligne de paie, campagne et auteurs du même centre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- File des rappels
-- ---------------------------------------------------------------------
drop function public.payment_reminder_queue(uuid, uuid);

create function public.payment_reminder_queue(p_run_id uuid default null, p_student_id uuid default null)
returns table (
  billing_run_id uuid,
  period_year smallint,
  period_month smallint,
  student_id uuid,
  full_name text,
  photo_url text,
  level_name text,
  guardian_name text,
  guardian_phone text,
  due_date date,
  reminder_type public.payment_reminder_type,
  days_overdue integer,
  suggested boolean,
  amount_due numeric,
  invoice_ids uuid[],
  subject_names text[],
  pack_flags boolean[],
  last_sent_at timestamptz,
  last_sent_by_name text,
  last_channel public.notification_channel,
  followed_up_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := private.today();
  v_days smallint;
  v_enabled boolean;
begin
  if not (select private.is_staff()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select c.reminder_days_before, c.payment_reminders_enabled into v_days, v_enabled
  from public.centers c where c.id = (select private.auth_center_id());
  if not coalesce(v_enabled, false) then
    return;
  end if;

  return query
  with items as (
    select i.billing_run_id, i.student_id, i.due_date,
           min(i.overdue_from) as overdue_from,
           sum(i.amount_due - i.amount_paid) as amount,
           array_agg(i.id order by coalesce(su.name, pk.name), i.id) as invoice_ids,
           array_agg(coalesce(su.name, pk.name) order by coalesce(su.name, pk.name), i.id) as names,
           array_agg(pk.id is not null order by coalesce(su.name, pk.name), i.id) as packs
    from public.invoices i
    join public.billing_runs br on br.id = i.billing_run_id and br.status in ('confirmed', 'sent', 'closed')
    left join public.enrollments e on e.id = i.enrollment_id
    left join public.subjects su on su.id = e.subject_id
    left join public.pack_enrollments pe on pe.id = i.pack_enrollment_id
    left join public.packs pk on pk.id = pe.pack_id
    -- Rien à rappeler pour une facture réglée, ou à 0 MAD (remise totale).
    where i.status <> 'paid' and i.amount_due > i.amount_paid
      and (p_run_id is null or i.billing_run_id = p_run_id)
      and (p_student_id is null or i.student_id = p_student_id)
    group by i.billing_run_id, i.student_id, i.due_date
  ),
  typed as (
    select it.*,
           (case when v_today >= it.overdue_from then 'overdue'
                 when v_today = it.due_date then 'due_today'
                 else 'upcoming' end)::public.payment_reminder_type as rtype
    from items it
  )
  select t.billing_run_id,
         br.period_year,
         br.period_month,
         t.student_id,
         st.full_name,
         st.photo_url,
         lv.name,
         st.guardian_name,
         st.guardian_phone,
         t.due_date,
         t.rtype,
         case when t.rtype = 'overdue' then v_today - t.due_date end,
         t.rtype <> 'upcoming' or t.due_date - v_today <= v_days,
         t.amount,
         t.invoice_ids,
         t.names,
         t.packs,
         last.sent_at,
         last.by_name,
         last.channel,
         fu.at
  from typed t
  join public.billing_runs br on br.id = t.billing_run_id
  join public.students st on st.id = t.student_id
  left join public.levels lv on lv.id = st.level_id
  left join lateral (
    select pr.sent_at, p.full_name as by_name, pr.channel
    from public.payment_reminders pr
    left join public.profiles p on p.id = pr.sent_by
    where pr.invoice_id = any(t.invoice_ids) and pr.reminder_type = t.rtype and pr.status = 'sent'
    -- À la même heure, la relance passe après l'envoi qu'elle relance.
    order by pr.sent_at desc, pr.is_repeat desc
    limit 1
  ) last on true
  -- En retard : une relance de paiement notée depuis le suivi (appel, visite)
  -- depuis le début du retard vaut un rappel de cette vague.
  left join lateral (
    select max(f.created_at) as at
    from public.follow_ups f
    where t.rtype = 'overdue' and f.student_id = t.student_id and f.type = 'payment'
      and (f.created_at at time zone 'Africa/Casablanca')::date >= t.overdue_from
  ) fu on true
  order by t.due_date, st.full_name;
end;
$$;

comment on function public.payment_reminder_queue(uuid, uuid) is
  'Rappels de paiement à envoyer (campagnes confirmées) : par élève et par échéance, vague du jour, dernier rappel, relance notée depuis le suivi.';

revoke all on function public.payment_reminder_queue(uuid, uuid) from public, anon;
grant execute on function public.payment_reminder_queue(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Lignes et intentions d'une campagne confirmée
-- ---------------------------------------------------------------------
create or replace function private.billing_run_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_status public.billing_run_status;
  v_new_status public.billing_run_status;
  v_free text[] := case tg_table_name
    when 'billing_run_lines' then array['invoice_id', 'discount_id', 'stopped_at']
    else array['applied_at', 'decided_by']
  end;
  v_link text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select br.status into v_old_status from public.billing_runs br where br.id = old.billing_run_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select br.status into v_new_status from public.billing_runs br where br.id = new.billing_run_id;
  end if;

  -- Une ligne ne se rattache qu'à une facture de son élève (les factures n'ont pas de centre).
  if tg_table_name = 'billing_run_lines' and tg_op in ('INSERT', 'UPDATE')
     and (to_jsonb(new) ->> 'invoice_id') is not null
     and (tg_op = 'INSERT' or (to_jsonb(new) ->> 'invoice_id') is distinct from (to_jsonb(old) ->> 'invoice_id'))
     and not exists (
       select 1 from public.invoices i
       where i.id = (to_jsonb(new) ->> 'invoice_id')::uuid and i.student_id = new.student_id
     ) then
    raise exception 'Une ligne de campagne ne se rattache qu''à une facture de son élève.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if v_new_status is not null and v_new_status <> 'draft' then
      raise exception 'Campagne confirmée : aucune ligne ne s''y ajoute.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_old_status is null or v_old_status = 'draft'
       or not exists (select 1 from public.students st where st.id = old.student_id)
       or (tg_table_name = 'billing_run_lines' and not exists (
             select 1 from public.enrollments e where e.id = (to_jsonb(old) ->> 'enrollment_id')::uuid
             union all
             select 1 from public.pack_enrollments pe where pe.id = (to_jsonb(old) ->> 'pack_enrollment_id')::uuid)) then
      return old;
    end if;
    raise exception 'Campagne confirmée : ses lignes ne se suppriment pas.' using errcode = '42501';
  end if;

  if new.billing_run_id is distinct from old.billing_run_id
     and (coalesce(v_old_status, 'draft') <> 'draft' or coalesce(v_new_status, 'draft') <> 'draft') then
    raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
  end if;
  if v_old_status is not null and v_old_status <> 'draft' then
    if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
    end if;
    -- Auteur, remise et facture : posés une fois, seulement effacés ensuite
    -- (suppression du compte, de la remise ou de la facture), jamais réattribués.
    foreach v_link in array array['decided_by', 'discount_id', 'invoice_id'] loop
      if (to_jsonb(old) ->> v_link) is not null and (to_jsonb(new) ->> v_link) is not null
         and (to_jsonb(new) ->> v_link) <> (to_jsonb(old) ->> v_link) then
        raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
      end if;
    end loop;
    if (to_jsonb(old) ->> 'discount_id') is null and (to_jsonb(new) ->> 'discount_id') is not null then
      raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Statut et dates d'une campagne
-- ---------------------------------------------------------------------
alter table public.billing_runs
  add constraint billing_runs_sent_at_status check (status in ('sent', 'closed') or sent_at is null),
  add constraint billing_runs_closed_at_status check (status = 'closed' or closed_at is null),
  add constraint billing_runs_cancel_status
    check (status = 'cancelled' or (cancelled_at is null and cancelled_by is null and cancel_reason is null));

-- ---------------------------------------------------------------------
-- Références du même centre
-- ---------------------------------------------------------------------
alter table public.discounts add constraint discounts_id_center_id_key unique (id, center_id);
alter table public.receipts add constraint receipts_id_center_id_key unique (id, center_id);
alter table public.expenses add constraint expenses_id_center_id_key unique (id, center_id);
alter table public.payroll_lines add constraint payroll_lines_id_center_id_key unique (id, center_id);

alter table public.billing_run_lines
  drop constraint billing_run_lines_discount_id_fkey,
  add constraint billing_run_lines_discount_id_center_id_fkey
    foreign key (discount_id, center_id) references public.discounts (id, center_id) on delete set null (discount_id);

alter table public.payment_reminders
  drop constraint payment_reminders_billing_run_id_fkey,
  add constraint payment_reminders_billing_run_id_center_id_fkey
    foreign key (billing_run_id, center_id) references public.billing_runs (id, center_id) on delete set null (billing_run_id),
  drop constraint payment_reminders_sent_by_fkey,
  add constraint payment_reminders_sent_by_center_id_fkey
    foreign key (sent_by, center_id) references public.profiles (id, center_id) on delete set null (sent_by);

alter table public.cash_movements
  drop constraint cash_movements_receipt_id_fkey,
  add constraint cash_movements_receipt_id_center_id_fkey
    foreign key (receipt_id, center_id) references public.receipts (id, center_id) on delete set null (receipt_id),
  drop constraint cash_movements_expense_id_fkey,
  add constraint cash_movements_expense_id_center_id_fkey
    foreign key (expense_id, center_id) references public.expenses (id, center_id) on delete set null (expense_id),
  drop constraint cash_movements_payroll_line_id_fkey,
  add constraint cash_movements_payroll_line_id_center_id_fkey
    foreign key (payroll_line_id, center_id) references public.payroll_lines (id, center_id) on delete set null (payroll_line_id),
  drop constraint cash_movements_created_by_fkey,
  add constraint cash_movements_created_by_center_id_fkey
    foreign key (created_by, center_id) references public.profiles (id, center_id) on delete set null (created_by);

alter table public.cash_sessions
  drop constraint cash_sessions_opened_by_fkey,
  add constraint cash_sessions_opened_by_center_id_fkey
    foreign key (opened_by, center_id) references public.profiles (id, center_id) on delete set null (opened_by),
  drop constraint cash_sessions_closed_by_fkey,
  add constraint cash_sessions_closed_by_center_id_fkey
    foreign key (closed_by, center_id) references public.profiles (id, center_id) on delete set null (closed_by),
  drop constraint cash_sessions_validated_by_fkey,
  add constraint cash_sessions_validated_by_center_id_fkey
    foreign key (validated_by, center_id) references public.profiles (id, center_id) on delete set null (validated_by);

alter table public.billing_runs
  drop constraint billing_runs_generated_by_fkey,
  add constraint billing_runs_generated_by_center_id_fkey
    foreign key (generated_by, center_id) references public.profiles (id, center_id) on delete set null (generated_by),
  drop constraint billing_runs_confirmed_by_fkey,
  add constraint billing_runs_confirmed_by_center_id_fkey
    foreign key (confirmed_by, center_id) references public.profiles (id, center_id) on delete set null (confirmed_by),
  drop constraint billing_runs_cancelled_by_fkey,
  add constraint billing_runs_cancelled_by_center_id_fkey
    foreign key (cancelled_by, center_id) references public.profiles (id, center_id) on delete set null (cancelled_by);

alter table public.reenrollment_intents
  drop constraint reenrollment_intents_decided_by_fkey,
  add constraint reenrollment_intents_decided_by_center_id_fkey
    foreign key (decided_by, center_id) references public.profiles (id, center_id) on delete set null (decided_by);
