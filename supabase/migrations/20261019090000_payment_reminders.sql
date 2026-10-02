-- =====================================================================
-- CentroManager — 037 : rappels de paiement au tuteur
-- (page 8, phase 4)
--
--  * File des rappels : pour chaque élève, les factures non réglées d'une
--    campagne confirmée, regroupées par échéance (un message couvre toutes
--    ses matières dues ce jour-là), avec la vague du jour : avant échéance,
--    jour de l'échéance, en retard. Une facture réglée n'y figure jamais.
--  * Envoi : WhatsApp (message rédigé par l'application), appel ou échange en
--    personne ; une ligne par facture couverte, un identifiant de message
--    commun, l'auteur et l'heure posés par la base, un événement au journal
--    du centre. Le premier rappel fait passer la campagne à « rappels
--    envoyés ». Un seul rappel de chaque type par facture, sauf relance.
--  * Un rappel « en retard » compte comme une relance de paiement (file des
--    relances du jour, statut « relance faite »).
-- =====================================================================

-- ---------------------------------------------------------------------
-- File des rappels (accueil et admin)
-- ---------------------------------------------------------------------
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
    where i.status <> 'paid'
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

comment on function public.payment_reminder_queue(uuid, uuid) is
  'Rappels à envoyer : factures non réglées des campagnes confirmées, par élève et par échéance, avec la vague du jour.';

-- ---------------------------------------------------------------------
-- Envoi d'un rappel (accueil et admin)
-- ---------------------------------------------------------------------
-- Les factures sont relues ici : celles réglées entre-temps sont écartées ;
-- s'il n'en reste aucune, rien n'est envoyé.
create function public.record_payment_reminder(
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
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.id is null or not (select private.is_staff())
     or v_run.center_id is distinct from (select private.auth_center_id()) then
    raise exception 'Campagne introuvable.' using errcode = '42501';
  end if;
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
    where i.billing_run_id = p_run_id and i.student_id = p_student_id and i.due_date = p_due_date and i.status <> 'paid'
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

  insert into public.payment_reminders (
    student_id, invoice_id, message_id, reminder_type, channel, template_used, message_body,
    guardian_phone_used, days_overdue, status, is_repeat
  )
  select p_student_id, invoice_id, v_message_id, v_type, p_channel, p_template, p_message,
         p_phone, case when v_type = 'overdue' then v_today - p_due_date end, 'sent', p_is_repeat
  from unnest(v_invoices) as invoice_id;

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

-- ---------------------------------------------------------------------
-- Un rappel « en retard » est une relance de paiement
-- ---------------------------------------------------------------------
create or replace view public.follow_up_queue
with (security_invoker = true)
as
SELECT d.id AS student_id,
    d.center_id,
    d.full_name,
    d.level_name,
    d.photo_url,
    d.guardian_name,
    d.guardian_phone,
    d.overdue_count,
    d.overdue_amount,
    o.oldest_invoice_id,
    o.oldest_due_date,
    private.today() - o.oldest_due_date AS days_overdue,
    f.last_follow_up_at,
    COALESCE((f.last_follow_up_at AT TIME ZONE 'Africa/Casablanca'::text)::date = private.today(), false) AS followed_up_today
   FROM student_directory d
     JOIN LATERAL ( SELECT i.id AS oldest_invoice_id,
            i.due_date AS oldest_due_date
           FROM invoices i
          WHERE i.student_id = d.id AND private.invoice_is_overdue(i.status, i.overdue_from)
          ORDER BY i.due_date, i.period_start
         LIMIT 1) o ON true
     LEFT JOIN LATERAL ( SELECT max(c.contacted_at) AS last_follow_up_at
           FROM ( SELECT fu.created_at AS contacted_at
                   FROM follow_ups fu
                  WHERE fu.student_id = d.id AND fu.type = 'payment'::follow_up_type
                UNION ALL
                 SELECT pr.sent_at
                   FROM payment_reminders pr
                  WHERE pr.student_id = d.id AND pr.reminder_type = 'overdue'::payment_reminder_type
                    AND pr.status = 'sent'::payment_reminder_status) c) f ON true
  WHERE d.is_overdue;

revoke all on function public.payment_reminder_queue(uuid, uuid),
  public.record_payment_reminder(uuid, uuid, date, public.notification_channel, text, text, text, boolean)
from public, anon;
grant execute on function public.payment_reminder_queue(uuid, uuid),
  public.record_payment_reminder(uuid, uuid, date, public.notification_channel, text, text, text, boolean)
to authenticated;
