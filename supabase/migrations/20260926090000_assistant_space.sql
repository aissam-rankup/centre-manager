-- =====================================================================
-- CentroManager — 009 : espace Assistant
--
-- Règles de facturation validées :
--  * deux cycles : le 1er et le 15 du mois, déterminés par la date
--    d'inscription (jour 1–14 → cycle du 1er, jour 15–31 → cycle du 15) ;
--  * période d'un mois complet à partir du jour du cycle ;
--  * échéance : début de période + 5 jours (le 6 ou le 20) ;
--    première facture : date d'inscription + 5 jours ;
--  * première facture créée dès l'inscription, mois complet ;
--  * paiement intégral uniquement ;
--  * payer une facture résout l'alerte de retard liée.
--
-- Vues et fonctions publiques en « security invoker » : la RLS s'applique.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Cycles de facturation
-- ---------------------------------------------------------------------
alter table public.enrollments
  add column billing_day smallint
  generated always as ((case when extract(day from start_date) < 15 then 1 else 15 end)::smallint) stored;

comment on column public.enrollments.billing_day is
  'Jour du cycle de facturation (1 ou 15), déduit de la date d''inscription.';

-- Début de la période de facturation contenant p_date, pour un cycle donné.
create function private.billing_period_start(p_date date, p_billing_day smallint)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_billing_day = 1 then date_trunc('month', p_date::timestamp)::date
    when extract(day from p_date) >= 15 then (date_trunc('month', p_date::timestamp) + interval '14 days')::date
    else (date_trunc('month', p_date::timestamp) - interval '1 month' + interval '14 days')::date
  end;
$$;

-- Première facture, créée à l'inscription (mois complet, due 5 jours après l'inscription).
create function private.enrollments_create_first_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := private.billing_period_start(new.start_date, new.billing_day);
begin
  insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    new.id,
    new.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    new.price_agreed,
    'pending',
    new.start_date + 5
  )
  on conflict (enrollment_id, period_start) do nothing;
  return null;
end;
$$;

create trigger enrollments_after_insert_first_invoice
after insert on public.enrollments
for each row execute function private.enrollments_create_first_invoice();

-- ---------------------------------------------------------------------
-- Retard « effectif » : statut overdue, ou pending avec échéance dépassée
-- (robuste même avant le passage automatique en retard de la phase 7).
-- ---------------------------------------------------------------------
create function private.invoice_is_overdue(p_status public.invoice_status, p_due_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'overdue' or (p_status = 'pending' and p_due_date < private.today());
$$;

-- ---------------------------------------------------------------------
-- Payer une facture résout l'alerte de retard liée.
-- ---------------------------------------------------------------------
create function private.invoices_resolve_alerts_when_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.alerts
    set resolved = true
    where type = 'overdue_payment'
      and not resolved
      and payload ->> 'invoice_id' = new.id::text;
  end if;
  return null;
end;
$$;

create trigger invoices_after_update_resolve_alerts
after update of status on public.invoices
for each row execute function private.invoices_resolve_alerts_when_paid();

-- ---------------------------------------------------------------------
-- Recherche d'élève insensible à la casse et aux accents
-- ---------------------------------------------------------------------
create function private.normalize_search(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, '')));
$$;

alter table public.students
  add column search_name text generated always as (private.normalize_search(full_name)) stored;

drop index if exists public.students_full_name_trgm_idx;
create index students_search_name_trgm_idx on public.students using gin (search_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Vues de l'espace Assistant
-- ---------------------------------------------------------------------

-- Annuaire des élèves avec leur situation de paiement.
create view public.student_directory
with (security_invoker = true)
as
select
  s.id,
  s.center_id,
  s.full_name,
  s.search_name,
  s.level_id,
  l.name as level_name,
  l.sort_order as level_sort_order,
  s.photo_url,
  s.guardian_name,
  s.guardian_phone,
  s.created_at,
  coalesce(b.overdue_count, 0) as overdue_count,
  coalesce(b.overdue_amount, 0)::numeric(10, 2) as overdue_amount,
  coalesce(b.unpaid_amount, 0)::numeric(10, 2) as unpaid_amount,
  coalesce(b.overdue_count, 0) > 0 as is_overdue
from public.students s
join public.levels l on l.id = s.level_id
left join lateral (
  select
    count(*) filter (where private.invoice_is_overdue(i.status, i.due_date))::integer as overdue_count,
    sum(i.amount_due - i.amount_paid) filter (where private.invoice_is_overdue(i.status, i.due_date)) as overdue_amount,
    sum(i.amount_due - i.amount_paid) filter (where i.status <> 'paid') as unpaid_amount
  from public.invoices i
  where i.student_id = s.id
) b on true;

-- File de relance : élèves en retard, du plus ancien retard au plus récent.
create view public.follow_up_queue
with (security_invoker = true)
as
select
  d.id as student_id,
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
  (private.today() - o.oldest_due_date) as days_overdue,
  f.last_follow_up_at,
  coalesce((f.last_follow_up_at at time zone 'Africa/Casablanca')::date = private.today(), false) as followed_up_today
from public.student_directory d
join lateral (
  select i.id as oldest_invoice_id, i.due_date as oldest_due_date
  from public.invoices i
  where i.student_id = d.id and private.invoice_is_overdue(i.status, i.due_date)
  order by i.due_date, i.period_start
  limit 1
) o on true
left join lateral (
  select max(fu.created_at) as last_follow_up_at
  from public.follow_ups fu
  where fu.student_id = d.id and fu.type = 'payment'
) f on true
where d.is_overdue;

-- Alertes d'absences consécutives non résolues.
create view public.open_absence_alerts
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
  a.created_at
from public.alerts a
join public.students s on s.id = a.student_id
join public.levels l on l.id = s.level_id
left join public.subjects sub on sub.id = (a.payload ->> 'subject_id')::uuid
where a.type = 'consecutive_absences' and not a.resolved;

-- ---------------------------------------------------------------------
-- Indicateurs du tableau de bord Assistant
-- ---------------------------------------------------------------------
create function public.assistant_dashboard_stats()
returns table (
  unpaid_count integer,
  unpaid_amount numeric,
  overdue_count integer,
  overdue_amount numeric,
  overdue_students integer,
  absences_today integer,
  open_absence_alerts integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*)::integer from public.invoices i where i.status <> 'paid'),
    (select coalesce(sum(i.amount_due - i.amount_paid), 0) from public.invoices i where i.status <> 'paid'),
    (select count(*)::integer from public.invoices i where private.invoice_is_overdue(i.status, i.due_date)),
    (select coalesce(sum(i.amount_due - i.amount_paid), 0) from public.invoices i
      where private.invoice_is_overdue(i.status, i.due_date)),
    (select count(distinct i.student_id)::integer from public.invoices i
      where private.invoice_is_overdue(i.status, i.due_date)),
    (select count(*)::integer from public.attendance a
      where a.session_date = private.today() and a.status = 'absent'),
    (select count(*)::integer from public.alerts al
      where al.type = 'consecutive_absences' and not al.resolved);
$$;

-- ---------------------------------------------------------------------
-- Création d'un élève et de ses inscriptions, en une seule transaction.
-- La première facture de chaque inscription est créée par trigger.
-- ---------------------------------------------------------------------
create function public.create_student(
  p_student_id uuid,
  p_full_name text,
  p_level_id uuid,
  p_subject_ids uuid[],
  p_guardian_name text default null,
  p_guardian_phone text default null,
  p_notes text default null,
  p_photo_path text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
begin
  if v_center_id is null or not private.is_staff() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_subject_ids, 1), 0) = 0 then
    raise exception 'Choisissez au moins une matière.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_subject_ids) as sid
    where not exists (
      select 1 from public.subjects s where s.id = sid and s.level_id = p_level_id
    )
  ) then
    raise exception 'Les matières doivent appartenir au niveau choisi.' using errcode = '22023';
  end if;

  if p_photo_path is not null and p_photo_path not like v_center_id::text || '/%' then
    raise exception 'Chemin de photo invalide.' using errcode = '22023';
  end if;

  insert into public.students (id, center_id, full_name, level_id, photo_url, guardian_name, guardian_phone, notes, created_by)
  values (
    p_student_id,
    v_center_id,
    btrim(p_full_name),
    p_level_id,
    p_photo_path,
    nullif(btrim(p_guardian_name), ''),
    nullif(btrim(p_guardian_phone), ''),
    nullif(btrim(p_notes), ''),
    (select auth.uid())
  );

  -- Prix convenu = tarif de la matière (trigger enrollments_before_write).
  insert into public.enrollments (student_id, subject_id, start_date)
  select p_student_id, sid, private.today()
  from (select distinct unnest(p_subject_ids) as sid) as subjects;

  return p_student_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Paiement intégral d'une facture.
-- ---------------------------------------------------------------------
create function public.mark_invoice_paid(p_invoice_id uuid)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  update public.invoices
  set status = 'paid',
      amount_paid = amount_due,
      paid_at = now(),
      paid_by = (select auth.uid())
  where id = p_invoice_id and status <> 'paid'
  returning * into v_invoice;

  if v_invoice.id is null then
    raise exception 'Facture introuvable ou déjà payée.' using errcode = 'P0002';
  end if;

  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

revoke all on public.student_directory, public.follow_up_queue, public.open_absence_alerts from anon;
grant select on public.student_directory, public.follow_up_queue, public.open_absence_alerts to authenticated;

revoke execute on function public.assistant_dashboard_stats() from public, anon;
revoke execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text) from public, anon;
revoke execute on function public.mark_invoice_paid(uuid) from public, anon;
grant execute on function public.assistant_dashboard_stats() to authenticated;
grant execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text) to authenticated;
grant execute on function public.mark_invoice_paid(uuid) to authenticated;
