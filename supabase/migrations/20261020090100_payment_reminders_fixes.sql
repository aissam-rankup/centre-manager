-- =====================================================================
-- CentroManager — 040 : rappels de paiement, corrections de la revue
-- (page 8, phase 4)
--
--  * Un rappel ne s'écrit plus directement dans la table : seule la
--    fonction d'envoi le consigne (contrôles, journal du centre, passage de
--    la campagne à « rappels envoyés »).
--  * Le montant rappelé est conservé avec le rappel (historique figé).
--  * Une facture à 0 MAD (remise totale) n'est jamais rappelée.
-- =====================================================================

drop policy payment_reminders_insert_staff on public.payment_reminders;
revoke insert on public.payment_reminders from authenticated;

alter table public.payment_reminders
  add column amount_reminded numeric(10, 2) check (amount_reminded is null or amount_reminded >= 0);

comment on column public.payment_reminders.amount_reminded is
  'Reste dû sur la facture au moment du rappel.';

create or replace function public.payment_reminder_queue(p_run_id uuid default null, p_student_id uuid default null)
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
  -- Vague à traiter aujourd'hui (avant échéance : dans les jours réglés par le centre).
  suggested boolean,
  amount_due numeric,
  invoice_ids uuid[],
  subject_names text[],
  last_sent_at timestamptz,
  last_sent_by_name text,
  last_channel public.notification_channel
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
           array_agg(i.id order by coalesce(su.name, pk.name)) as invoice_ids,
           array_agg(coalesce(su.name, pk.name) order by coalesce(su.name, pk.name)) as names
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
         last.sent_at,
         last.by_name,
         last.channel
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
  order by t.due_date, st.full_name;
end;
$$;

create or replace function public.record_payment_reminder(
  p_run_id uuid,
  p_student_id uuid,
  p_due_date date,
  p_channel public.notification_channel,
  p_message text default null,
  p_phone text default null,
  p_template text default null,
  p_is_repeat boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.billing_runs;
  v_today date := private.today();
  v_message_id uuid := gen_random_uuid();
  v_type public.payment_reminder_type;
  v_overdue_from date;
  v_invoices uuid[];
  v_amount numeric;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not (select private.is_staff()) or not exists (
    select 1 from public.billing_runs br where br.id = p_run_id and br.center_id = (select private.auth_center_id())
  ) then
    raise exception 'Campagne introuvable.' using errcode = '42501';
  end if;
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.status not in ('confirmed', 'sent', 'closed') then
    raise exception 'Les rappels suivent la confirmation de la campagne.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.centers c where c.id = v_run.center_id and c.payment_reminders_enabled) then
    raise exception 'Les rappels de paiement sont désactivés dans les réglages.' using errcode = '22023';
  end if;
  if p_message is not null and length(p_message) > 2000 then
    raise exception 'Message trop long.' using errcode = '22023';
  end if;

  select array_agg(i.id order by i.id), min(i.overdue_from), sum(i.amount_due - i.amount_paid)
  into v_invoices, v_overdue_from, v_amount
  from (
    select i.* from public.invoices i
    where i.billing_run_id = p_run_id and i.student_id = p_student_id and i.due_date = p_due_date
      and i.status <> 'paid' and i.amount_due > i.amount_paid
    order by i.id
    for update
  ) i;
  if v_invoices is null then
    raise exception 'Facture déjà réglée : aucun rappel.' using errcode = '23514';
  end if;

  v_type := case when v_today >= v_overdue_from then 'overdue'
                 when v_today = p_due_date then 'due_today'
                 else 'upcoming' end;

  if not p_is_repeat and exists (
    select 1 from public.payment_reminders pr
    where pr.invoice_id = any(v_invoices) and pr.reminder_type = v_type and pr.status = 'sent' and not pr.is_repeat
  ) then
    raise exception 'Rappel déjà envoyé : utilisez « Relancer ».' using errcode = '22023';
  end if;

  -- Montant rappelé conservé : l'historique ne dépend pas des factures modifiées ensuite.
  insert into public.payment_reminders (
    student_id, invoice_id, message_id, reminder_type, channel, template_used, message_body,
    guardian_phone_used, days_overdue, status, is_repeat, amount_reminded
  )
  select p_student_id, i.id, v_message_id, v_type, p_channel, p_template, p_message,
         p_phone, case when v_type = 'overdue' then v_today - p_due_date end, 'sent', p_is_repeat,
         i.amount_due - i.amount_paid
  from public.invoices i
  where i.id = any(v_invoices);

  -- Premier rappel : la campagne passe à « rappels envoyés ».
  if v_run.status = 'confirmed' then
    update public.billing_runs br set status = 'sent', sent_at = now() where br.id = p_run_id;
  end if;

  perform private.log_center_event(v_run.center_id, 'payment_reminder.sent', p_student_id,
    jsonb_build_object('billing_run_id', p_run_id, 'message_id', v_message_id, 'reminder_type', v_type,
                       'channel', p_channel, 'invoices', cardinality(v_invoices), 'amount', v_amount,
                       'due_date', p_due_date, 'repeat', p_is_repeat));
  return v_message_id;
end;
$$;
