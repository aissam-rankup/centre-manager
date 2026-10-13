-- =====================================================================
-- CentroManager — élève suspendu
--
-- Un élève qui ne paie plus encombrait les appels, les absences et les
-- relances. L'admin ou l'assistant peut désormais le suspendre (motif court)
-- depuis son profil, puis le réactiver d'un clic :
--  * le profil n'est ni supprimé ni anonymisé : inscriptions, factures et
--    historique restent ; les impayés existants restent dus ;
--  * suspendu, il disparaît des appels (professeur et accueil), des
--    absences et alertes d'absence, des relances et du suivi des impayés,
--    des campagnes de réinscription, de la facturation automatique et des
--    statistiques ; il ne compte plus dans la commission des professeurs ;
--    son accès à l'espace élève est coupé ;
--  * aucune inscription directe ni reprise tant qu'il est suspendu ;
--  * réactivé : de nouveau partout, facture du mois en cours émise ;
--  * « élèves actifs » : non suspendus, avec au moins une inscription en cours.
-- =====================================================================

alter table public.students
  add column suspended_at timestamptz,
  add column suspension_reason text check (suspension_reason is null or length(btrim(suspension_reason)) between 1 and 200),
  add column suspended_by uuid references public.profiles (id) on delete set null,
  add constraint students_suspension_check check ((suspended_at is null) = (suspension_reason is null));

create index students_suspended_idx on public.students (center_id) where suspended_at is not null;
create index students_suspended_by_idx on public.students (suspended_by);

-- Suspension : uniquement par les fonctions ci-dessous.
create function private.students_guard_suspension()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.suspended_at, new.suspension_reason, new.suspended_by) is distinct from (old.suspended_at, old.suspension_reason, old.suspended_by)
     and current_user in ('authenticated', 'anon') then
    raise exception 'Suspendez ou réactivez l''élève depuis son profil.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger students_guard_suspension
before update of suspended_at, suspension_reason, suspended_by on public.students
for each row execute function private.students_guard_suspension();

create function private.student_is_suspended(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select st.suspended_at is not null from public.students st where st.id = p_student_id), false);
$$;

revoke all on function private.student_is_suspended(uuid) from public, anon;
grant execute on function private.student_is_suspended(uuid) to authenticated, service_role;

-- Pas d'inscription directe, de souscription à un pack ni de reprise pour un
-- élève suspendu (les matières d'un pack suivent le pack : autorisées).
create function private.reject_suspended_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (to_jsonb(new) ->> 'pack_enrollment_id') is not null then
    return new;
  end if;
  if (tg_op = 'INSERT' or (new.active and not old.active)) and private.student_is_suspended(new.student_id) then
    raise exception 'Élève suspendu : réactivez-le avant de l''inscrire.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger enrollments_reject_suspended_student
before insert or update of active on public.enrollments
for each row execute function private.reject_suspended_student();

create trigger pack_enrollments_reject_suspended_student
before insert or update of active on public.pack_enrollments
for each row execute function private.reject_suspended_student();

-- ---------------------------------------------------------------------
-- Suspendre et réactiver (admin ou assistant du centre)
-- ---------------------------------------------------------------------
create function public.suspend_student(p_student_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  select * into v_student from public.students st where st.id = p_student_id for update;
  if v_student.id is null or not private.is_staff() or v_student.center_id is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_student.suspended_at is not null then
    raise exception 'Cet élève est déjà suspendu.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez le motif de la suspension.' using errcode = '22023';
  end if;
  if length(btrim(p_reason)) > 200 then
    raise exception 'Motif : 200 caractères au plus.' using errcode = '22023';
  end if;

  update public.students
  set suspended_at = now(), suspension_reason = btrim(p_reason), suspended_by = (select auth.uid())
  where id = p_student_id;

  -- Campagnes de réinscription en brouillon : ses lignes partent.
  perform private.refresh_student_billing_runs(p_student_id);

  perform private.log_center_event(v_student.center_id, 'student.suspended', p_student_id,
    jsonb_build_object('name', v_student.full_name, 'reason', btrim(p_reason)));
end;
$$;

create function public.reactivate_student(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_created integer := 0;
  v_id uuid;
begin
  select * into v_student from public.students st where st.id = p_student_id for update;
  if v_student.id is null or not private.is_staff() or v_student.center_id is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_student.suspended_at is null then
    return 0;
  end if;

  update public.students
  set suspended_at = null, suspension_reason = null, suspended_by = null
  where id = p_student_id;

  -- De nouveau facturé : facture du mois en cours (comme une reprise), puis
  -- campagnes de réinscription en brouillon.
  for v_id in
    select e.id from public.enrollments e
    where e.student_id = p_student_id and e.active and e.pack_enrollment_id is null and e.start_date <= private.today()
  loop
    if private.create_period_invoice(v_id, private.today(), true) then
      v_created := v_created + 1;
    end if;
  end loop;
  for v_id in
    select pe.id from public.pack_enrollments pe
    where pe.student_id = p_student_id and pe.active and pe.start_date <= private.today()
  loop
    if private.create_pack_period_invoice(v_id, private.today(), true) then
      v_created := v_created + 1;
    end if;
  end loop;
  perform private.refresh_student_billing_runs(p_student_id);

  perform private.log_center_event(v_student.center_id, 'student.reactivated', p_student_id,
    jsonb_build_object('name', v_student.full_name, 'suspended_at', v_student.suspended_at,
                       'reason', v_student.suspension_reason, 'invoices_created', v_created));
  return v_created;
end;
$$;

revoke all on function public.suspend_student(uuid, text), public.reactivate_student(uuid) from public, anon;
grant execute on function public.suspend_student(uuid, text), public.reactivate_student(uuid) to authenticated;

-- Jeton de l'espace élève : un élève suspendu n'a plus accès.
grant select (student_id) on public.student_accounts to supabase_auth_admin;
grant select (id, suspended_at) on public.students to supabase_auth_admin;

create policy students_select_auth_admin on public.students
for select to supabase_auth_admin
using (true);

-- =====================================================================
-- Listes, comptes et automatismes : élèves suspendus mis de côté
-- =====================================================================

-- Appel du professeur (RLS des présences) : élève non suspendu.
CREATE OR REPLACE FUNCTION private.is_enrolled(p_student_id uuid, p_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.enrollments e
    where e.student_id = p_student_id
      and e.subject_id = p_subject_id
      and e.active
      and not exists (select 1 from public.students sx where sx.id = e.student_id and sx.suspended_at is not null)
  );
$function$;

-- Appel par l'accueil : élève non suspendu.
CREATE OR REPLACE FUNCTION public.mark_session_attendance(p_slot_id uuid, p_session_date date, p_entries jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_slot public.schedule_slots;
  v_count integer;
begin
  if not private.is_staff() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_slot from public.schedule_slots s
  where s.id = p_slot_id and s.center_id = private.auth_center_id();
  if v_slot.id is null then
    raise exception 'Séance introuvable.' using errcode = 'P0002';
  end if;
  if p_session_date is null or p_session_date > private.today() or p_session_date < private.today() - 7 then
    raise exception 'L''appel se fait pour aujourd''hui ou les 7 derniers jours.' using errcode = '22023';
  end if;
  if extract(dow from p_session_date)::smallint <> v_slot.day_of_week then
    raise exception 'Cette séance n''a pas lieu ce jour-là.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Aucune présence à enregistrer.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) x
    where coalesce(x ->> 'status', '') not in ('present', 'absent')
       or coalesce(x ->> 'student_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or not exists (
         select 1 from public.enrollments e
         join public.students st on st.id = e.student_id
         where e.student_id = (x ->> 'student_id')::uuid
           and e.subject_id = v_slot.subject_id
           and e.active
           and e.start_date <= p_session_date
           and st.center_id = v_slot.center_id
           and st.suspended_at is null
       )
  ) then
    raise exception 'Élève non inscrit à cette séance, ou statut invalide.' using errcode = '22023';
  end if;

  insert into public.attendance as a (student_id, subject_id, teacher_id, session_date, status)
  select distinct on ((x ->> 'student_id')::uuid)
         (x ->> 'student_id')::uuid, v_slot.subject_id, v_slot.teacher_id, p_session_date,
         (x ->> 'status')::public.attendance_status
  from jsonb_array_elements(p_entries) x
  on conflict (student_id, subject_id, session_date) do update
  set status = excluded.status;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Séances du jour : élèves attendus hors suspendus.
CREATE OR REPLACE FUNCTION public.staff_day_sessions(p_date date)
 RETURNS TABLE(slot_id uuid, subject_id uuid, subject_name text, level_name text, teacher_name text, room text, start_time time without time zone, end_time time without time zone, student_count integer, marked_count integer, absent_count integer, teacher_marked integer, staff_marked integer, last_marked_at timestamp with time zone, open_conflicts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_center uuid := private.auth_center_id();
begin
  if not private.is_staff() or v_center is null then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
  select s.id, s.subject_id, sub.name, l.name, p.full_name, coalesce(r.name, s.room), s.start_time, s.end_time,
         (select count(*)::integer from public.enrollments e
          where e.subject_id = s.subject_id and e.active and e.start_date <= p_date and not exists (select 1 from public.students sx where sx.id = e.student_id and sx.suspended_at is not null)),
         count(a.id)::integer,
         (count(a.id) filter (where a.status = 'absent'))::integer,
         (count(a.id) filter (where a.marked_by_role = 'teacher'))::integer,
         (count(a.id) filter (where a.marked_by_role in ('assistant', 'admin')))::integer,
         max(a.marked_at),
         (select count(*)::integer from public.attendance_conflicts c
          join public.attendance ca on ca.id = c.attendance_id
          where c.resolved_at is null and ca.subject_id = s.subject_id and ca.session_date = p_date)
  from public.schedule_slots s
  join public.subjects sub on sub.id = s.subject_id
  join public.levels l on l.id = s.level_id
  left join public.profiles p on p.id = s.teacher_id
  left join public.rooms r on r.id = s.room_id
  left join public.attendance a on a.subject_id = s.subject_id and a.session_date = p_date
  where s.center_id = v_center
    and s.day_of_week = extract(dow from p_date)::smallint
  group by s.id, sub.name, l.name, p.full_name, r.name
  order by s.start_time, sub.name;
end;
$function$;

-- Aucune alerte d'absence pour un élève suspendu.
CREATE OR REPLACE FUNCTION private.refresh_absence_alert(p_student_id uuid, p_subject_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_last_present date;
  v_streak integer;
  v_streak_start date;
  v_last_absent date;
begin
  if private.student_is_suspended(p_student_id) then
    return;
  end if;

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
$function$;

-- Retards : la facture passe en retard, mais aucune alerte pour un élève suspendu.
CREATE OR REPLACE FUNCTION private.mark_overdue_invoices(p_date date DEFAULT private.today())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer;
begin
  with switched as (
    update public.invoices
    set status = 'overdue'
    where status = 'pending' and overdue_from <= p_date
    returning id, student_id, amount_due, due_date
  ),
  alerted as (
    insert into public.alerts (student_id, type, payload)
    select s.student_id, 'overdue_payment',
           jsonb_build_object('invoice_id', s.id, 'amount_due', s.amount_due, 'due_date', s.due_date)
    from switched s
    where not exists (select 1 from public.students sx where sx.id = s.student_id and sx.suspended_at is not null)
      and not exists (
      select 1 from public.alerts a
      where a.type = 'overdue_payment' and a.payload ->> 'invoice_id' = s.id::text
    )
    returning 1
  )
  select count(*)::integer into v_count from switched;
  return v_count;
end;
$function$;

-- Rappels de paiement : hors élèves suspendus.
CREATE OR REPLACE FUNCTION public.payment_reminder_queue(p_run_id uuid DEFAULT NULL::uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(billing_run_id uuid, period_year smallint, period_month smallint, student_id uuid, full_name text, photo_url text, level_name text, guardian_name text, guardian_phone text, due_date date, reminder_type payment_reminder_type, days_overdue integer, suggested boolean, amount_due numeric, invoice_ids uuid[], subject_names text[], pack_flags boolean[], last_sent_at timestamp with time zone, last_sent_by_name text, last_channel notification_channel, followed_up_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
      and not exists (select 1 from public.students sx where sx.id = i.student_id and sx.suspended_at is not null)
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
      and (private.local_time(f.created_at))::date >= t.overdue_from
  ) fu on true
  order by t.due_date, st.full_name;
end;
$function$;

-- Campagnes de réinscription : hors élèves suspendus.
CREATE OR REPLACE FUNCTION private.refresh_billing_run(p_run_id uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run public.billing_runs;
  v_due_day smallint;
  v_lines integer;
begin
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.id is null or v_run.status <> 'draft' then
    return 0;
  end if;
  select c.payment_due_day into v_due_day from public.centers c where c.id = v_run.center_id;

  delete from public.billing_run_lines l
  where l.billing_run_id = p_run_id and (p_student_id is null or l.student_id = p_student_id);

  insert into public.billing_run_lines (
    billing_run_id, center_id, student_id, enrollment_id, pack_enrollment_id, period_start, period_end, due_date,
    amount_full, discount_amount, amount_due, discount_id, discount_snapshot, discount_conflict
  )
  select p_run_id, v_run.center_id, d.student_id, d.enrollment_id, d.pack_enrollment_id, d.period_start, d.period_end,
         d.period_start + (v_due_day - 1), d.amount_full, d.discount_amount, d.amount_due, d.discount_id,
         d.discount_snapshot, d.discount_conflict
  from (
    select e.id as enrollment_id, null::uuid as pack_enrollment_id, e.student_id, e.price_agreed, e.billing_day, e.start_date
    from public.enrollments e
    join public.students st on st.id = e.student_id
    where st.center_id = v_run.center_id and e.active and e.pack_enrollment_id is null and st.suspended_at is null
      and (p_student_id is null or e.student_id = p_student_id)
    union all
    select null::uuid, pe.id, pe.student_id, pe.price_agreed, pe.billing_day, pe.start_date
    from public.pack_enrollments pe
    join public.students st on st.id = pe.student_id
    where st.center_id = v_run.center_id and pe.active and st.suspended_at is null
      and (p_student_id is null or pe.student_id = p_student_id)
  ) s
  cross join lateral (select make_date(v_run.period_year, v_run.period_month, s.billing_day) as period_start) p
  cross join lateral private.apply_invoice_discount(jsonb_populate_record(null::public.invoices, jsonb_build_object(
    'student_id', s.student_id,
    'enrollment_id', s.enrollment_id,
    'pack_enrollment_id', s.pack_enrollment_id,
    'period_start', p.period_start,
    'period_end', (p.period_start + interval '1 month' - interval '1 day')::date,
    'amount_full', s.price_agreed
  ))) d
  -- Inscription postérieure au début de la période : sa première facture vient de l'inscription.
  where s.start_date <= p.period_start
    -- Période déjà facturée (première facture, reprise, saisie manuelle) : pas de ligne.
    and not exists (
      select 1 from public.invoices i
      where i.period_start = p.period_start
        and (i.enrollment_id = s.enrollment_id or i.pack_enrollment_id = s.pack_enrollment_id)
    )
    -- Retirée d'une campagne précédente et pas encore arrêtée (cycle du 15) : elle part.
    and not exists (
      select 1
      from public.billing_run_lines ol
      join public.billing_runs ob on ob.id = ol.billing_run_id
      left join public.reenrollment_intents oi on oi.billing_run_id = ol.billing_run_id and oi.student_id = ol.student_id
      where ob.center_id = v_run.center_id
        and ob.status in ('confirmed', 'sent', 'closed')
        and (ob.period_year, ob.period_month) < (v_run.period_year, v_run.period_month)
        and ol.stopped_at is null
        and (ol.enrollment_id = s.enrollment_id or ol.pack_enrollment_id = s.pack_enrollment_id)
        and (coalesce(oi.intent, 'pending') in ('dropped', 'paused')
             or private.billing_line_dropped(oi.subjects_dropped, ol.enrollment_id, ol.pack_enrollment_id))
    );
  get diagnostics v_lines = row_count;

  -- Sans ligne ni décision : plus d'intention.
  delete from public.reenrollment_intents ri
  where ri.billing_run_id = p_run_id and ri.intent = 'pending'
    and (p_student_id is null or ri.student_id = p_student_id)
    and not exists (
      select 1 from public.billing_run_lines l where l.billing_run_id = p_run_id and l.student_id = ri.student_id
    );

  -- Une intention par élève : matières et packs reconduits ou retirés. La
  -- décision prise est gardée, y compris pour une matière retirée dont la
  -- ligne a disparu (arrêtée pendant le brouillon) : reprise, elle reste retirée.
  with items as (
    select l.student_id, l.enrollment_id, l.pack_enrollment_id,
           coalesce(su.name, pk.name) as name,
           jsonb_build_object(
             'kind', case when l.enrollment_id is not null then 'subject' else 'pack' end,
             'enrollment_id', l.enrollment_id,
             'pack_enrollment_id', l.pack_enrollment_id,
             'id', coalesce(e.subject_id, pe.pack_id),
             'name', coalesce(su.name, pk.name)
           ) as item
    from public.billing_run_lines l
    left join public.enrollments e on e.id = l.enrollment_id
    left join public.subjects su on su.id = e.subject_id
    left join public.pack_enrollments pe on pe.id = l.pack_enrollment_id
    left join public.packs pk on pk.id = pe.pack_id
    where l.billing_run_id = p_run_id and (p_student_id is null or l.student_id = p_student_id)
  ),
  per_student as (
    select i.student_id,
           coalesce(jsonb_agg(i.item order by i.name) filter (where not d.dropped), '[]'::jsonb) as kept,
           coalesce(jsonb_agg(i.item order by i.name) filter (where d.dropped), '[]'::jsonb) as dropped
    from items i
    left join public.reenrollment_intents ri on ri.billing_run_id = p_run_id and ri.student_id = i.student_id
    cross join lateral (
      select coalesce(ri.intent in ('dropped', 'paused'), false)
             or private.billing_line_dropped(ri.subjects_dropped, i.enrollment_id, i.pack_enrollment_id) as dropped
    ) d
    group by i.student_id
  ),
  preserved as (
    select ri.student_id, jsonb_agg(x.item) as items
    from public.reenrollment_intents ri
    cross join lateral jsonb_array_elements(ri.subjects_dropped) as x(item)
    where ri.billing_run_id = p_run_id and (p_student_id is null or ri.student_id = p_student_id)
      and not exists (
        select 1 from public.billing_run_lines l
        where l.billing_run_id = p_run_id and l.student_id = ri.student_id
          and (l.enrollment_id = (x.item ->> 'enrollment_id')::uuid
               or l.pack_enrollment_id = (x.item ->> 'pack_enrollment_id')::uuid)
      )
    group by ri.student_id
  )
  insert into public.reenrollment_intents as ri (center_id, billing_run_id, student_id, period_year, period_month,
                                                 subjects_kept, subjects_dropped)
  select v_run.center_id, p_run_id, ps.student_id, v_run.period_year, v_run.period_month, ps.kept,
         ps.dropped || coalesce(pr.items, '[]'::jsonb)
  from per_student ps
  left join preserved pr on pr.student_id = ps.student_id
  on conflict (billing_run_id, student_id) do update
    set subjects_kept = excluded.subjects_kept,
        subjects_dropped = excluded.subjects_dropped;

  perform private.refresh_billing_run_totals(p_run_id);
  return v_lines;
end;
$function$;

-- Facturation automatique : hors élèves suspendus.
CREATE OR REPLACE FUNCTION private.generate_invoices(p_date date DEFAULT private.today())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_created integer := 0;
  v_id uuid;
begin
  for v_id in
    select e.id from public.enrollments e
    where e.active and e.start_date <= p_date and e.pack_enrollment_id is null and not exists (select 1 from public.students sx where sx.id = e.student_id and sx.suspended_at is not null)
  loop
    if private.create_period_invoice(v_id, p_date) then
      v_created := v_created + 1;
    end if;
  end loop;

  for v_id in
    select pe.id from public.pack_enrollments pe where pe.active and pe.start_date <= p_date and not exists (select 1 from public.students sx where sx.id = pe.student_id and sx.suspended_at is not null)
  loop
    if private.create_pack_period_invoice(v_id, p_date) then
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$function$;

-- Tableau de bord de l'accueil : absences et alertes hors élèves suspendus.
CREATE OR REPLACE FUNCTION public.assistant_dashboard_stats()
 RETURNS TABLE(unpaid_count integer, unpaid_amount numeric, overdue_count integer, overdue_amount numeric, overdue_students integer, absences_today integer, open_absence_alerts integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    (select count(*)::integer from public.invoices i where i.status <> 'paid'),
    (select coalesce(sum(i.amount_due - i.amount_paid), 0) from public.invoices i where i.status <> 'paid'),
    (select count(*)::integer from public.invoices i where private.invoice_is_overdue(i.status, i.overdue_from)),
    (select coalesce(sum(i.amount_due - i.amount_paid), 0) from public.invoices i
      where private.invoice_is_overdue(i.status, i.overdue_from)),
    (select count(distinct i.student_id)::integer from public.invoices i
      where private.invoice_is_overdue(i.status, i.overdue_from)),
    (select count(*)::integer from public.attendance a
      where a.session_date = private.today() and a.status = 'absent' and not exists (select 1 from public.students sx where sx.id = a.student_id and sx.suspended_at is not null)),
    (select count(*)::integer from public.alerts al
      where al.type = 'consecutive_absences' and not al.resolved and not exists (select 1 from public.students sx where sx.id = al.student_id and sx.suspended_at is not null));
$function$;

-- « Élèves actifs » : non suspendus, avec au moins une inscription en cours.
CREATE OR REPLACE FUNCTION public.admin_month_revenue(p_level_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(month_start date, expected_amount numeric, collected_amount numeric, invoice_count integer, paid_count integer, student_count integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_month date := date_trunc('month', private.today()::timestamp)::date;
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    v_month,
    coalesce(sum(i.amount_due), 0)::numeric,
    coalesce(sum(i.amount_paid), 0)::numeric,
    count(i.id)::integer,
    (count(i.id) filter (where i.status = 'paid'))::integer,
    (select count(*)::integer from public.students s
     where (p_level_id is null or s.level_id = p_level_id) and s.suspended_at is null
       and (exists (select 1 from public.enrollments e where e.student_id = s.id and e.active)
            or exists (select 1 from public.pack_enrollments pe where pe.student_id = s.id and pe.active)))
  from public.invoices i
  join public.students st on st.id = i.student_id
  where i.period_start >= v_month
    and i.period_start < (v_month + interval '1 month')::date
    and (p_level_id is null or st.level_id = p_level_id);
end;
$function$;

-- Taux d'absence : hors élèves suspendus.
CREATE OR REPLACE FUNCTION public.admin_absence_rates(p_level_id uuid DEFAULT NULL::uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(subject_id uuid, subject_name text, level_id uuid, level_name text, level_sort integer, absent_count integer, total_count integer, absence_rate numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.name,
    l.id,
    l.name,
    l.sort_order,
    (count(a.id) filter (where a.status = 'absent'))::integer,
    count(a.id)::integer,
    case
      when count(a.id) = 0 then 0::numeric
      else round((count(a.id) filter (where a.status = 'absent'))::numeric / count(a.id), 4)
    end
  from public.subjects s
  join public.levels l on l.id = s.level_id
  left join public.attendance a
    on a.subject_id = s.id
   and a.session_date <= private.today()
   and (p_days is null or a.session_date > private.today() - p_days)
   and not exists (select 1 from public.students sx where sx.id = a.student_id and sx.suspended_at is not null)
  where p_level_id is null or s.level_id = p_level_id
  group by s.id, s.name, l.id, l.name, l.sort_order;
end;
$function$;

-- Effectifs et revenus : hors élèves suspendus.
CREATE OR REPLACE FUNCTION public.admin_enrollment_report()
 RETURNS TABLE(level_id uuid, level_name text, level_sort integer, level_students integer, subject_id uuid, subject_name text, monthly_price numeric, active_enrollments integer, agreed_revenue numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.name,
    l.sort_order,
    (select count(*)::integer from public.students st where st.level_id = l.id and st.suspended_at is null),
    s.id,
    s.name,
    s.monthly_price,
    (select count(*)::integer from public.enrollments e where e.subject_id = s.id and e.active and not exists (select 1 from public.students sx where sx.id = e.student_id and sx.suspended_at is not null)),
    -- Revenu mensuel réel des inscriptions actives : somme des prix convenus (remises incluses).
    (select coalesce(sum(e.price_agreed), 0) from public.enrollments e where e.subject_id = s.id and e.active and not exists (select 1 from public.students sx where sx.id = e.student_id and sx.suspended_at is not null))
  from public.levels l
  left join public.subjects s on s.level_id = l.id
  order by l.sort_order, l.name, s.name;
end;
$function$;

-- Packs : abonnés hors élèves suspendus.
CREATE OR REPLACE FUNCTION public.admin_pack_report()
 RETURNS TABLE(pack_id uuid, pack_name text, level_id uuid, level_name text, level_sort integer, monthly_price numeric, active boolean, subscribers integer, agreed_revenue numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.name,
    l.id,
    l.name,
    l.sort_order,
    p.monthly_price,
    p.active,
    (select count(*)::integer from public.pack_enrollments pe where pe.pack_id = p.id and pe.active and not exists (select 1 from public.students sx where sx.id = pe.student_id and sx.suspended_at is not null)),
    (select coalesce(sum(pe.price_agreed), 0) from public.pack_enrollments pe where pe.pack_id = p.id and pe.active and not exists (select 1 from public.students sx where sx.id = pe.student_id and sx.suspended_at is not null))
  from public.packs p
  join public.levels l on l.id = p.level_id
  order by l.sort_order, l.name, p.name;
end;
$function$;

-- Commission : un élève suspendu n'est plus compté parmi les inscrits.
CREATE OR REPLACE FUNCTION private.compute_teacher_pay(p_teacher_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(pay_mode pay_mode, amount numeric, detail jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start date := make_date(p_year, p_month, 1);
  v_end date := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  v_mode public.pay_mode;
  v_salary public.teacher_salaries;
  v_subjects jsonb;
begin
  select p.pay_mode into v_mode from public.profiles p where p.id = p_teacher_id;

  if v_mode = 'fixed_salary' then
    select * into v_salary
    from public.teacher_salaries s
    where s.teacher_id = p_teacher_id and s.effective_from <= v_end
      and (s.effective_to is null or s.effective_to >= v_start)
    order by s.effective_from desc
    limit 1;
    return query select v_mode, coalesce(v_salary.monthly_amount, 0)::numeric,
      jsonb_build_object('salary_id', v_salary.id, 'monthly_amount', v_salary.monthly_amount,
                         'effective_from', v_salary.effective_from);
    return;
  end if;

  if v_mode = 'commission' then
    with lines as (
      select
        s.id as subject_id, s.name as subject, l.id as level_id, l.name as level, l.sort_order,
        s.monthly_price,
        (select count(distinct e.student_id)
           from public.enrollments e
           where e.subject_id = s.id and e.active and e.start_date <= v_end
             and not exists (select 1 from public.students sx where sx.id = e.student_id and sx.suspended_at is not null))::integer as enrolled,
        (select c.rate_percent
           from public.teacher_commissions c
           where c.teacher_id = p_teacher_id and c.subject_id = s.id and c.effective_from <= v_end
             and (c.effective_to is null or c.effective_to >= v_start)
           order by c.effective_from desc
           limit 1) as rate_percent
      from public.teacher_assignments ta
      join public.subjects s on s.id = ta.subject_id
      join public.levels l on l.id = ta.level_id
      where ta.teacher_id = p_teacher_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'subject_id', subject_id, 'subject', subject, 'level_id', level_id, 'level', level,
             'monthly_price', monthly_price, 'enrolled', enrolled, 'rate_percent', rate_percent,
             'subtotal', round(monthly_price * enrolled * coalesce(rate_percent, 0) / 100, 2)
           ) order by sort_order, subject), '[]'::jsonb)
      into v_subjects
    from lines;

    return query select v_mode,
      coalesce((select sum((x ->> 'subtotal')::numeric) from jsonb_array_elements(v_subjects) as x), 0),
      jsonb_build_object('subjects', v_subjects);
    return;
  end if;

  return query select null::public.pay_mode, 0::numeric, '{}'::jsonb;
end;
$function$;

-- Console : élèves actifs hors suspendus.
CREATE OR REPLACE FUNCTION public.platform_centers_billing()
 RETURNS TABLE(center_id uuid, name text, slug text, plan_key text, plan_name text, status center_status, price numeric, billing_interval billing_interval, current_period_end date, days_overdue integer, periods_due integer, amount_due numeric, last_payment_at date, last_payment_amount numeric, active_students integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := private.today();
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.slug, c.plan_key, pl.name, c.status, c.price, c.billing_interval, c.current_period_end,
         case when c.status <> 'cancelled' and c.current_period_end < v_today then (v_today - c.current_period_end)::integer else 0 end,
         case when c.status <> 'cancelled' then private.periods_due(c.current_period_end, c.billing_interval, v_today) else 0 end,
         case when c.status <> 'cancelled'
              then private.periods_due(c.current_period_end, c.billing_interval, v_today) * coalesce(c.price, 0)
              else 0 end,
         lp.paid_at, lp.amount,
         -- Élève actif : au moins une inscription (matière ou pack) en cours.
         (select count(*)::integer from public.students st
           where st.center_id = c.id
             and st.suspended_at is null
             and (exists (select 1 from public.enrollments e where e.student_id = st.id and e.active)
                  or exists (select 1 from public.pack_enrollments pe where pe.student_id = st.id and pe.active))),
         c.created_at
  from public.centers c
  join public.plans pl on pl.key = c.plan_key
  left join lateral (
    select p.paid_at, p.amount from public.subscription_payments p
    where p.center_id = c.id
    order by p.paid_at desc, p.created_at desc
    limit 1
  ) lp on true
  order by c.name;
end;
$function$;

-- Console : élèves actifs hors suspendus.
CREATE OR REPLACE FUNCTION public.platform_center_overview(p_center_id uuid)
 RETURNS TABLE(students_count integer, active_students integer, teachers_count integer, assistants_count integer, admins_count integer, student_accounts_count integer, last_admin_sign_in_at timestamp with time zone, suspension_kind text, suspension_note text, suspended_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_super_admin();
  return query
  select
    (select count(*)::integer from public.students st where st.center_id = c.id),
    (select count(*)::integer from public.students st
      where st.center_id = c.id
        and st.suspended_at is null
        and (exists (select 1 from public.enrollments e where e.student_id = st.id and e.active)
             or exists (select 1 from public.pack_enrollments pe where pe.student_id = st.id and pe.active))),
    (select count(*)::integer from public.profiles p where p.center_id = c.id and p.role = 'teacher' and p.active),
    (select count(*)::integer from public.profiles p where p.center_id = c.id and p.role = 'assistant' and p.active),
    (select count(*)::integer from public.profiles p where p.center_id = c.id and p.role = 'admin' and p.active),
    (select count(*)::integer from public.student_accounts a where a.center_id = c.id and a.active),
    (select max(u.last_sign_in_at) from public.profiles p join auth.users u on u.id = p.id
      where p.center_id = c.id and p.role = 'admin'),
    c.suspension_kind, c.suspension_note, c.suspended_at
  from public.centers c
  where c.id = p_center_id;
end;
$function$;

-- Espace élève : coupé pendant la suspension.
CREATE OR REPLACE FUNCTION private.auth_student_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.student_id
  from public.student_accounts a
  join public.centers c on c.id = a.center_id
  where a.user_id = (select auth.uid())
    and a.active
    and not private.student_is_suspended(a.student_id)
    and c.status not in ('suspended', 'cancelled')
    and private.center_has_module(a.center_id, 'lms');
$function$;

-- Espace élève : coupé pendant la suspension.
CREATE OR REPLACE FUNCTION public.my_student_access()
 RETURNS TABLE(student_id uuid, full_name text, level_id uuid, level_name text, center_id uuid, center_name text, center_status center_status, active boolean, allowed boolean, vocabulary jsonb, branding jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select st.id, st.full_name, st.level_id, l.name, c.id, c.name, c.status, a.active,
         a.active and st.suspended_at is null and c.status not in ('suspended', 'cancelled') and private.center_has_module(c.id, 'lms'),
         ty.terms || c.custom_terms,
         private.applied_branding(c.id)
  from public.student_accounts a
  join public.students st on st.id = a.student_id
  join public.levels l on l.id = st.level_id
  join public.centers c on c.id = a.center_id
  join public.center_types ty on ty.code = c.center_type
  where a.user_id = (select auth.uid());
$function$;

-- Jeton de l'espace élève : inactif pendant la suspension.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_claims jsonb := event -> 'claims';
  v_user uuid := (event ->> 'user_id')::uuid;
  v_role public.user_role;
  v_center_id uuid;
  v_active boolean;
  v_status public.center_status;
  v_must_change boolean;
begin
  select p.role, p.center_id, p.active, c.status, p.must_change_password
    into v_role, v_center_id, v_active, v_status, v_must_change
  from public.profiles p
  left join public.centers c on c.id = p.center_id
  where p.id = v_user;

  if v_role is not null then
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{center_id}', coalesce(to_jsonb(v_center_id), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{center_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
    v_claims := jsonb_set(v_claims, '{must_change_password}', to_jsonb(coalesce(v_must_change, false)));
    return jsonb_set(event, '{claims}', v_claims);
  end if;

  -- Élève (aucun profil d'équipe).
  select a.center_id,
         a.active and not exists (select 1 from public.students st where st.id = a.student_id and st.suspended_at is not null),
         c.status, a.must_change_password
    into v_center_id, v_active, v_status, v_must_change
  from public.student_accounts a
  join public.centers c on c.id = a.center_id
  where a.user_id = v_user;

  if v_center_id is not null then
    v_claims := jsonb_set(v_claims, '{user_role}', '"student_user"'::jsonb);
    v_claims := jsonb_set(v_claims, '{center_id}', to_jsonb(v_center_id));
    v_claims := jsonb_set(v_claims, '{center_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
    v_claims := jsonb_set(v_claims, '{must_change_password}', to_jsonb(coalesce(v_must_change, false)));
  else
    -- Compte Auth sans profil ni accès élève : aucun accès applicatif.
    v_claims := v_claims - 'user_role' - 'center_id' - 'center_status' - 'must_change_password';
    v_claims := jsonb_set(v_claims, '{profile_active}', 'false'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$function$;

-- Listes d'appel du professeur : hors élèves suspendus.
create or replace view public.class_rosters with (security_barrier = true) as
SELECT e.id,
    e.student_id,
    e.subject_id,
    e.start_date,
    e.active
   FROM enrollments e
     JOIN students st ON st.id = e.student_id
  WHERE st.center_id = (( SELECT private.auth_center_id() AS auth_center_id)) AND st.suspended_at IS NULL AND (( SELECT private.is_staff() AS is_staff) OR private.teaches_subject(e.subject_id));

-- Alertes d'absence ouvertes : hors élèves suspendus.
create or replace view public.open_absence_alerts with (security_invoker = true) as
SELECT a.id,
    a.student_id,
    s.center_id,
    s.full_name,
    s.photo_url,
    l.name AS level_name,
    sub.name AS subject_name,
    COALESCE((a.payload ->> 'count'::text)::integer, 3) AS absence_count,
    (a.payload ->> 'last_session_date'::text)::date AS last_session_date,
    a.created_at,
    s.guardian_name,
    s.guardian_phone
   FROM alerts a
     JOIN students s ON s.id = a.student_id
     JOIN levels l ON l.id = s.level_id
     LEFT JOIN subjects sub ON sub.id = ((a.payload ->> 'subject_id'::text)::uuid)
  WHERE a.type = 'consecutive_absences'::alert_type AND NOT a.resolved AND s.suspended_at IS NULL;

-- Absences à signaler : hors élèves suspendus.
create or replace view public.absences_to_notify with (security_invoker = true) as
SELECT a.id AS attendance_id,
    a.student_id,
    st.center_id,
    st.full_name,
    st.photo_url,
    st.guardian_name,
    st.guardian_phone,
    l.name AS level_name,
    s.id AS subject_id,
    s.name AS subject_name,
    a.session_date,
    slot.start_time,
    slot.end_time,
    COALESCE(t.full_name, slot.teacher_name) AS teacher_name,
    (EXISTS ( SELECT 1
           FROM alerts al
          WHERE al.student_id = a.student_id AND al.type = 'consecutive_absences'::alert_type AND NOT al.resolved AND (al.payload ->> 'subject_id'::text) = s.id::text)) AS in_series,
    n.sent_at AS notified_at,
    n.channel AS notified_channel,
    n.sent_by_name AS notified_by
   FROM attendance a
     JOIN students st ON st.id = a.student_id
     JOIN subjects s ON s.id = a.subject_id
     JOIN levels l ON l.id = st.level_id
     LEFT JOIN profiles t ON t.id = a.teacher_id
     LEFT JOIN LATERAL ( SELECT ss.start_time,
            ss.end_time,
            p.full_name AS teacher_name
           FROM schedule_slots ss
             LEFT JOIN profiles p ON p.id = ss.teacher_id
          WHERE ss.subject_id = a.subject_id AND ss.level_id = s.level_id AND ss.day_of_week = EXTRACT(dow FROM a.session_date)::smallint
          ORDER BY ss.start_time
         LIMIT 1) slot ON true
     LEFT JOIN LATERAL ( SELECT an.sent_at,
            an.channel,
            pr.full_name AS sent_by_name
           FROM absence_notifications an
             LEFT JOIN profiles pr ON pr.id = an.sent_by
          WHERE an.attendance_id = a.id AND an.status = 'sent'::absence_notification_status
          ORDER BY an.sent_at DESC
         LIMIT 1) n ON true
  WHERE a.status = 'absent'::attendance_status AND a.session_date >= (private.today() - 7) AND st.suspended_at IS NULL;

-- Annuaire des élèves : date et motif de suspension ajoutés en fin de vue.
create or replace view public.student_directory with (security_invoker = true) as
SELECT s.id,
    s.center_id,
    s.full_name,
    s.search_name,
    s.level_id,
    l.name AS level_name,
    l.sort_order AS level_sort_order,
    s.photo_url,
    s.guardian_name,
    s.guardian_phone,
    s.created_at,
    COALESCE(b.overdue_count, 0) AS overdue_count,
    COALESCE(b.overdue_amount, 0::numeric)::numeric(10,2) AS overdue_amount,
    COALESCE(b.unpaid_amount, 0::numeric)::numeric(10,2) AS unpaid_amount,
    COALESCE(b.overdue_count, 0) > 0 AS is_overdue,
    COALESCE(d.discounts, '[]'::jsonb) AS discounts,
    s.suspended_at,
    s.suspension_reason
   FROM students s
     JOIN levels l ON l.id = s.level_id
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE private.invoice_is_overdue(i.status, i.overdue_from))::integer AS overdue_count,
            sum(i.amount_due - i.amount_paid) FILTER (WHERE private.invoice_is_overdue(i.status, i.overdue_from)) AS overdue_amount,
            sum(i.amount_due - i.amount_paid) FILTER (WHERE i.status <> 'paid'::invoice_status) AS unpaid_amount
           FROM invoices i
          WHERE i.student_id = s.id) b ON true
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('type', x.type, 'value', x.value, 'reason', x.reason, 'reason_note', x.reason_note, 'scope', x.scope, 'target', COALESCE(sub.name, p.name)) ORDER BY x.granted_at) AS discounts
           FROM discounts x
             LEFT JOIN subjects sub ON sub.id = x.subject_id
             LEFT JOIN packs p ON p.id = x.pack_id
          WHERE x.student_id = s.id AND x.is_active AND x.valid_from <= private.today() AND (x.valid_to IS NULL OR x.valid_to >= private.today())) d ON true;

-- Suivi des impayés : hors élèves suspendus.
create or replace view public.follow_up_queue with (security_invoker = true) as
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
    COALESCE(private.local_time(f.last_follow_up_at)::date = private.today(), false) AS followed_up_today
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
                  WHERE pr.student_id = d.id AND pr.reminder_type = 'overdue'::payment_reminder_type AND pr.status = 'sent'::payment_reminder_status) c) f ON true
  WHERE d.is_overdue AND d.suspended_at IS NULL;

-- Export des données du centre : date et motif de suspension des élèves.
CREATE OR REPLACE FUNCTION public.export_center_data(p_export_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_export public.center_exports;
  c uuid;
  f date;
  t date;
begin
  select * into v_export from public.center_exports e where e.id = p_export_id;
  if v_export.id is null or v_export.status <> 'pending' then
    raise exception 'Export introuvable ou déjà traité.' using errcode = 'P0002';
  end if;
  c := v_export.center_id;
  f := coalesce(v_export.period_from, '-infinity'::date);
  t := coalesce(v_export.period_to, 'infinity'::date);

  return json_build_object(
    'eleves', json_build_object('title', 'Élèves', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Nom', s.full_name,
        'Niveau', l.name,
        'Tuteur', s.guardian_name,
        'Téléphone du tuteur', s.guardian_phone,
        'Langue des messages', private.export_label('locale', coalesce(s.message_locale, 'center')),
        'Inscription en cours', exists (select 1 from public.enrollments e where e.student_id = s.id and e.active)
                                 or exists (select 1 from public.pack_enrollments pe where pe.student_id = s.id and pe.active),
        'Accès élève', exists (select 1 from public.student_accounts a where a.student_id = s.id and a.active),
        'Suspendu le', to_char(private.local_time(s.suspended_at), 'YYYY-MM-DD'),
        'Motif de la suspension', s.suspension_reason,
        'Notes', s.notes,
        'Créé le', private.export_time(s.created_at)
      ) order by s.full_name), '[]'::json)
      from public.students s
      join public.levels l on l.id = s.level_id
      where s.center_id = c)),

    'tuteurs', json_build_object('title', 'Tuteurs', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Tuteur', g.guardian_name,
        'Téléphone', g.guardian_phone,
        'Élèves', g.students,
        'Nombre d''élèves', g.n
      ) order by g.guardian_name nulls last, g.guardian_phone), '[]'::json)
      from (
        select s.guardian_name, s.guardian_phone, string_agg(s.full_name, ', ' order by s.full_name) as students, count(*)::integer as n
        from public.students s
        where s.center_id = c and (s.guardian_name is not null or s.guardian_phone is not null)
        group by s.guardian_name, s.guardian_phone
      ) g)),

    'inscriptions', json_build_object('title', 'Inscriptions', 'rows', (
      select coalesce(json_agg(r.row order by r.student, r.course), '[]'::json)
      from (
        select s.full_name as student, sub.name as course, json_build_object(
          'Élève', s.full_name,
          'Niveau', l.name,
          'Type', 'Matière',
          'Matière ou pack', sub.name,
          'Dans un pack', e.pack_enrollment_id is not null,
          'Début', e.start_date,
          'Prix convenu (MAD)', e.price_agreed,
          'Jour de facturation', e.billing_day,
          'Active', e.active
        ) as row
        from public.enrollments e
        join public.students s on s.id = e.student_id
        join public.subjects sub on sub.id = e.subject_id
        join public.levels l on l.id = sub.level_id
        where s.center_id = c
        union all
        select s.full_name, p.name, json_build_object(
          'Élève', s.full_name,
          'Niveau', l.name,
          'Type', 'Pack',
          'Matière ou pack', p.name,
          'Dans un pack', false,
          'Début', pe.start_date,
          'Prix convenu (MAD)', pe.price_agreed,
          'Jour de facturation', pe.billing_day,
          'Active', pe.active
        )
        from public.pack_enrollments pe
        join public.students s on s.id = pe.student_id
        join public.packs p on p.id = pe.pack_id
        left join public.levels l on l.id = p.level_id
        where s.center_id = c
      ) r)),

    'matieres', json_build_object('title', 'Matières et niveaux', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Niveau', l.name,
        'Ordre du niveau', l.sort_order,
        'Matière', sub.name,
        'Prix mensuel (MAD)', sub.monthly_price,
        'Archivée le', to_char(private.local_time(sub.archived_at), 'YYYY-MM-DD')
      ) order by l.sort_order, l.name, sub.name), '[]'::json)
      from public.levels l
      left join public.subjects sub on sub.level_id = l.id
      where l.center_id = c)),

    'packs', json_build_object('title', 'Packs', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Pack', p.name,
        'Niveau', l.name,
        'Prix mensuel (MAD)', p.monthly_price,
        'Matières', (select string_agg(sub.name, ', ' order by sub.name)
                     from public.pack_subjects ps join public.subjects sub on sub.id = ps.subject_id
                     where ps.pack_id = p.id),
        'Actif', p.active
      ) order by p.name), '[]'::json)
      from public.packs p
      left join public.levels l on l.id = p.level_id
      where p.center_id = c)),

    'equipe', json_build_object('title', 'Professeurs et assistants', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Nom', p.full_name,
        'Rôle', private.export_label('role', p.role::text),
        'Courriel', u.email,
        'Téléphone', p.phone,
        'Actif', p.active,
        'Rémunération', private.export_label('pay_mode', p.pay_mode::text),
        'Créé le', private.export_time(p.created_at),
        'Dernière connexion', private.export_time(u.last_sign_in_at)
      ) order by p.role, p.full_name), '[]'::json)
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.center_id = c)),

    'emploi_du_temps', json_build_object('title', 'Emploi du temps', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Jour', private.export_label('day', sl.day_of_week::text),
        'Début', to_char(sl.start_time, 'HH24:MI'),
        'Fin', to_char(sl.end_time, 'HH24:MI'),
        'Niveau', l.name,
        'Matière', sub.name,
        'Professeur', pr.full_name,
        'Salle', coalesce(ro.name, sl.room)
      ) order by (sl.day_of_week + 6) % 7, sl.start_time, l.name), '[]'::json)
      from public.schedule_slots sl
      join public.subjects sub on sub.id = sl.subject_id
      join public.levels l on l.id = sl.level_id
      left join public.profiles pr on pr.id = sl.teacher_id
      left join public.rooms ro on ro.id = sl.room_id
      where sl.center_id = c)),

    'salles', json_build_object('title', 'Salles', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Salle', ro.name,
        'Capacité', ro.capacity,
        'Étage', ro.floor,
        'Active', ro.is_active,
        'Notes', ro.notes
      ) order by ro.name), '[]'::json)
      from public.rooms ro
      where ro.center_id = c)),

    'factures', json_build_object('title', 'Paiements des élèves', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Élève', s.full_name,
        'Matière ou pack', coalesce(sub.name, p.name),
        'Période du', i.period_start,
        'Période au', i.period_end,
        'Échéance', i.due_date,
        'Montant plein (MAD)', i.amount_full,
        'Remise (MAD)', i.discount_amount,
        'Montant dû (MAD)', i.amount_due,
        'Montant payé (MAD)', i.amount_paid,
        'Statut', private.export_label('invoice', i.status::text),
        'Payé le', private.export_time(i.paid_at),
        'Mode de paiement', private.export_label('method', i.payment_method::text),
        'Reçu', r.receipt_number
      ) order by i.period_start, s.full_name), '[]'::json)
      from public.invoices i
      join public.students s on s.id = i.student_id
      left join public.enrollments e on e.id = i.enrollment_id
      left join public.subjects sub on sub.id = e.subject_id
      left join public.pack_enrollments pe on pe.id = i.pack_enrollment_id
      left join public.packs p on p.id = pe.pack_id
      left join public.receipts r on r.id = i.receipt_id
      where s.center_id = c and i.period_start between f and t)),

    'recus', json_build_object('title', 'Reçus', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Numéro', r.receipt_number,
        'Type', private.export_label('receipt', r.kind::text),
        'Émis le', private.export_time(r.issued_at),
        'Élève', r.student_name,
        'Niveau', r.level_name,
        'Période du', r.period_start,
        'Période au', r.period_end,
        'Montant plein (MAD)', r.amount_full,
        'Remise (MAD)', r.discount_applied,
        'Montant payé (MAD)', r.amount_paid,
        'Reste dû (MAD)', r.balance_due,
        'Mode de paiement', private.export_label('method', r.payment_method::text),
        'Émis par', r.issued_by_name,
        'Motif d''annulation', r.cancel_reason
      ) order by r.issued_at, r.receipt_number), '[]'::json)
      from public.receipts r
      where r.center_id = c and (private.local_time(r.issued_at))::date between f and t)),

    'presences', json_build_object('title', 'Présences et absences', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', a.session_date,
        'Élève', s.full_name,
        'Niveau', l.name,
        'Matière', sub.name,
        'Professeur', pr.full_name,
        'Statut', private.export_label('attendance', a.status::text),
        'Note', a.note,
        'Pointé le', private.export_time(a.marked_at)
      ) order by a.session_date, sub.name, s.full_name), '[]'::json)
      from public.attendance a
      join public.students s on s.id = a.student_id
      join public.levels l on l.id = s.level_id
      join public.subjects sub on sub.id = a.subject_id
      left join public.profiles pr on pr.id = a.teacher_id
      where s.center_id = c and a.session_date between f and t)),

    'remises', json_build_object('title', 'Remises', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Élève', s.full_name,
        'Type', private.export_label('discount_type', d.type::text),
        'Valeur', d.value,
        'Portée', private.export_label('discount_scope', d.scope::text),
        'Matière ou pack', coalesce(sub.name, p.name),
        'Motif', private.export_label('discount_reason', d.reason::text),
        'Précision', d.reason_note,
        'Du', d.valid_from,
        'Au', d.valid_to,
        'Active', d.is_active,
        'Accordée le', private.export_time(d.granted_at)
      ) order by s.full_name, d.valid_from), '[]'::json)
      from public.discounts d
      join public.students s on s.id = d.student_id
      left join public.subjects sub on sub.id = d.subject_id
      left join public.packs p on p.id = d.pack_id
      where d.center_id = c)),

    'charges', json_build_object('title', 'Charges', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', x.expense_date,
        'Catégorie', cat.name,
        'Libellé', x.label,
        'Montant (MAD)', x.amount,
        'Mode de paiement', private.export_label('method', x.payment_method::text),
        'Récurrente', x.is_recurring,
        'Statut', private.export_label('expense', x.status::text),
        'Notes', x.notes,
        'Supprimée le', private.export_time(x.deleted_at)
      ) order by x.expense_date, x.label), '[]'::json)
      from public.expenses x
      left join public.expense_categories cat on cat.id = x.category_id
      where x.center_id = c and x.expense_date between f and t)),

    'paie', json_build_object('title', 'Paie', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Année', pp.year,
        'Mois', pp.month,
        'Statut de la période', private.export_label('payroll', pp.status::text),
        'Membre', pl.teacher_name,
        'Rôle', private.export_label('role', pl.member_role::text),
        'Mode', private.export_label('pay_mode', pl.pay_mode::text),
        'Montant calculé (MAD)', pl.computed_amount,
        'Ajustement (MAD)', pl.adjustment_amount,
        'Motif de l''ajustement', pl.adjustment_reason,
        'Montant final (MAD)', pl.final_amount,
        'Payé le', pl.paid_at,
        'Mode de paiement', private.export_label('method', pl.payment_method::text)
      ) order by pp.year, pp.month, pl.teacher_name), '[]'::json)
      from public.payroll_periods pp
      join public.payroll_lines pl on pl.payroll_period_id = pp.id
      where pp.center_id = c and make_date(pp.year, pp.month, 1) between date_trunc('month', f)::date and t)),

    'recus_paie', json_build_object('title', 'Reçus de paie', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Numéro', sp.receipt_number,
        'Type', private.export_label('receipt', sp.kind::text),
        'Émis le', to_char(private.local_time(sp.issued_at), 'YYYY-MM-DD HH24:MI'),
        'Versé le', sp.paid_on,
        'Année', sp.period_year,
        'Mois', sp.period_month,
        'Membre', sp.member_name,
        'Rôle', private.export_label('role', sp.member_role::text),
        'Montant (MAD)', sp.amount,
        'Mode de paiement', private.export_label('method', sp.payment_method::text),
        'Note', sp.note,
        'Annule le reçu', (select o.receipt_number from public.salary_payments o where o.id = sp.cancels_payment_id),
        'Motif de l''annulation', sp.cancel_reason,
        'Émis par', sp.issued_by_name
      ) order by sp.issued_at, sp.receipt_year, sp.receipt_seq), '[]'::json)
      from public.salary_payments sp
      where sp.center_id = c and sp.paid_on between f and t)),

    'caisse', json_build_object('title', 'Sessions de caisse', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', cs.session_date,
        'Caisse partagée', cs.is_shared,
        'Accueil', ast.full_name,
        'Ouverte le', private.export_time(cs.opened_at),
        'Fond de caisse (MAD)', cs.opening_float,
        'Clôturée le', private.export_time(cs.closed_at),
        'Espèces attendues (MAD)', cs.expected_cash,
        'Espèces comptées (MAD)', cs.counted_cash,
        'Écart (MAD)', cs.variance,
        'Motif de l''écart', cs.variance_reason,
        'Statut', private.export_label('cash', cs.status::text),
        'Validée le', private.export_time(cs.validated_at),
        'Notes', cs.notes
      ) order by cs.session_date, cs.opened_at), '[]'::json)
      from public.cash_sessions cs
      left join public.profiles ast on ast.id = cs.assistant_id
      where cs.center_id = c and cs.session_date between f and t)),

    'mouvements_caisse', json_build_object('title', 'Mouvements de caisse', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date de la caisse', cs.session_date,
        'Heure', private.export_time(m.created_at),
        'Type', private.export_label('movement', m.kind::text),
        'Montant (MAD)', m.amount,
        'Motif', m.reason
      ) order by m.created_at), '[]'::json)
      from public.cash_movements m
      join public.cash_sessions cs on cs.id = m.cash_session_id
      where m.center_id = c and cs.session_date between f and t))
  );
end;
$function$;
