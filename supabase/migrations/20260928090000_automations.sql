-- =====================================================================
-- CentroManager — 011 : automatisations
--
--  1. Factures : chaque jour, une facture est créée pour la période en
--     cours de chaque inscription active (cycles du 1er et du 15), au prix
--     convenu. Idempotent grâce à unique (enrollment_id, period_start).
--     Reprendre une inscription facture aussitôt la période en cours
--     (mois complet).
--  2. Retards : une facture « pending » dont l'échéance est dépassée passe
--     en « overdue » et ouvre une alerte overdue_payment.
--  3. Absences : un trigger sur attendance calcule la série d'absences en
--     cours par élève et par matière. À 3, il ouvre une alerte
--     consecutive_absences (mise à jour ensuite : 4, 5…).
--     L'alerte se ferme quand l'élève est de nouveau présent dans la
--     matière, ou quand une relance « absence » est enregistrée.
--  4. Planification : pg_cron exécute les tâches quotidiennes à 00:10 UTC
--     (01:10 ou 00:10 à Casablanca selon l'heure légale).
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------
-- 1. Génération des factures
-- ---------------------------------------------------------------------

-- Facture de la période contenant p_date pour une inscription.
-- Échéance : début de période + 5 jours. Pour une reprise en cours de
-- période (p_resumed), date de reprise + 5 jours, comme une inscription.
create function private.create_period_invoice(p_enrollment_id uuid, p_date date, p_resumed boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments;
  v_period_start date;
  v_inserted integer;
begin
  select * into v_enrollment from public.enrollments where id = p_enrollment_id;
  if v_enrollment.id is null or not v_enrollment.active or v_enrollment.start_date > p_date then
    return false;
  end if;

  v_period_start := private.billing_period_start(p_date, v_enrollment.billing_day);

  insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    v_enrollment.id,
    v_enrollment.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    v_enrollment.price_agreed,
    'pending',
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end + 5
  )
  on conflict (enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- Toutes les inscriptions actives : renvoie le nombre de factures créées.
create function private.generate_invoices(p_date date default private.today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer := 0;
  v_enrollment_id uuid;
begin
  for v_enrollment_id in
    select e.id from public.enrollments e where e.active and e.start_date <= p_date
  loop
    if private.create_period_invoice(v_enrollment_id, p_date) then
      v_created := v_created + 1;
    end if;
  end loop;
  return v_created;
end;
$$;

-- Reprise d'une inscription : la période en cours est facturée aussitôt.
create function private.enrollments_bill_on_resume()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.create_period_invoice(new.id, private.today(), true);
  return null;
end;
$$;

create trigger enrollments_after_resume_bill
after update of active on public.enrollments
for each row
when (new.active and not old.active)
execute function private.enrollments_bill_on_resume();

-- ---------------------------------------------------------------------
-- 2. Passage en retard et alertes de paiement
-- ---------------------------------------------------------------------
create function private.mark_overdue_invoices(p_date date default private.today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with switched as (
    update public.invoices
    set status = 'overdue'
    where status = 'pending' and due_date < p_date
    returning id, student_id, amount_due, due_date
  ),
  alerted as (
    insert into public.alerts (student_id, type, payload)
    select s.student_id, 'overdue_payment',
           jsonb_build_object('invoice_id', s.id, 'amount_due', s.amount_due, 'due_date', s.due_date)
    from switched s
    where not exists (
      select 1 from public.alerts a
      where a.type = 'overdue_payment' and a.payload ->> 'invoice_id' = s.id::text
    )
    returning 1
  )
  select count(*)::integer into v_count from switched;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Absences consécutives
-- ---------------------------------------------------------------------
create function private.refresh_absence_alert(p_student_id uuid, p_subject_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_present date;
  v_streak integer;
  v_streak_start date;
  v_last_absent date;
begin
  select max(session_date) into v_last_present
  from public.attendance
  where student_id = p_student_id and subject_id = p_subject_id and status = 'present';

  -- Série en cours : absences postérieures à la dernière présence.
  select count(*)::integer, min(session_date), max(session_date)
  into v_streak, v_streak_start, v_last_absent
  from public.attendance
  where student_id = p_student_id and subject_id = p_subject_id and status = 'absent'
    and session_date > coalesce(v_last_present, '-infinity'::date);

  if v_streak < 3 then
    -- Élève de nouveau présent (ou absence corrigée) : l'alerte n'a plus lieu d'être.
    update public.alerts
    set resolved = true
    where type = 'consecutive_absences' and not resolved
      and student_id = p_student_id and payload ->> 'subject_id' = p_subject_id::text;
    return;
  end if;

  -- Une série ne déclenche qu'une alerte : si elle a été traitée (relance),
  -- les absences suivantes de la même série n'en rouvrent pas.
  update public.alerts
  set payload = payload || jsonb_build_object('count', v_streak, 'last_session_date', v_last_absent)
  where type = 'consecutive_absences'
    and student_id = p_student_id
    and payload ->> 'subject_id' = p_subject_id::text
    and payload ->> 'streak_start' = v_streak_start::text;

  if not found then
    insert into public.alerts (student_id, type, payload)
    values (
      p_student_id,
      'consecutive_absences',
      jsonb_build_object(
        'subject_id', p_subject_id,
        'count', v_streak,
        'streak_start', v_streak_start,
        'last_session_date', v_last_absent
      )
    );
  end if;
end;
$$;

create function private.attendance_after_write_absence_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_absence_alert(new.student_id, new.subject_id);
  return null;
end;
$$;

create trigger attendance_after_write_absence_alerts
after insert or update of status, session_date on public.attendance
for each row execute function private.attendance_after_write_absence_alerts();

-- Une relance « absence » traite les alertes d'absences ouvertes de l'élève.
create function private.follow_ups_resolve_absence_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.alerts
  set resolved = true
  where type = 'consecutive_absences' and not resolved and student_id = new.student_id;
  return null;
end;
$$;

create trigger follow_ups_after_insert_resolve_absence_alerts
after insert on public.follow_ups
for each row
when (new.type = 'absence')
execute function private.follow_ups_resolve_absence_alerts();

-- ---------------------------------------------------------------------
-- 4. Tâches quotidiennes et planification
-- ---------------------------------------------------------------------
create function private.run_daily_automations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoices integer := private.generate_invoices();
  v_overdue integer := private.mark_overdue_invoices();
begin
  return jsonb_build_object('invoices_created', v_invoices, 'invoices_overdue', v_overdue);
end;
$$;

-- Tâches internes : exécutées par pg_cron (propriétaire), jamais par les utilisateurs.
revoke all on function
  private.create_period_invoice(uuid, date, boolean),
  private.generate_invoices(date),
  private.mark_overdue_invoices(date),
  private.refresh_absence_alert(uuid, uuid),
  private.run_daily_automations()
from public, anon, authenticated;

select cron.schedule(
  'centromanager-daily-automations',
  '10 0 * * *',
  $$select private.run_daily_automations()$$
);

-- ---------------------------------------------------------------------
-- Alertes d'absences : coordonnées du responsable, pour relancer depuis
-- le tableau de bord (colonnes ajoutées en fin de vue).
-- ---------------------------------------------------------------------
create or replace view public.open_absence_alerts
with (security_invoker = true)
as
select
  a.id,
  a.student_id,
  s.center_id,
  s.full_name,
  s.photo_url,
  l.name as level_name,
  sub.name as subject_name,
  coalesce((a.payload ->> 'count')::integer, 3) as absence_count,
  (a.payload ->> 'last_session_date')::date as last_session_date,
  a.created_at,
  s.guardian_name,
  s.guardian_phone
from public.alerts a
join public.students s on s.id = a.student_id
join public.levels l on l.id = s.level_id
left join public.subjects sub on sub.id = (a.payload ->> 'subject_id')::uuid
where a.type = 'consecutive_absences' and not a.resolved;
