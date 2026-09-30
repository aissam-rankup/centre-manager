-- =====================================================================
-- CentroManager — schéma complet pour Supabase hébergé (SQL Editor).
-- Généré à partir de supabase/migrations, dans l'ordre. Sans données de démo.
-- À exécuter UNE seule fois sur un projet vide. Pour les migrations futures via la CLI :
-- npx supabase migration repair --status applied <versions de supabase/migrations>.
-- =====================================================================


-- >>> 20260924100000_extensions_and_types.sql
-- =====================================================================
-- CentroManager — 001 : extensions et types énumérés
-- =====================================================================

-- Recherche instantanée des élèves par nom (index trigramme).
create extension if not exists pg_trgm with schema extensions;
-- Contraintes d'exclusion du planning (conflits de salle et de professeur).
create extension if not exists btree_gist with schema extensions;

create type public.user_role as enum ('admin', 'assistant', 'teacher');
create type public.invoice_status as enum ('pending', 'paid', 'overdue');
create type public.attendance_status as enum ('present', 'absent');
create type public.follow_up_type as enum ('payment', 'absence');
create type public.follow_up_channel as enum ('phone', 'whatsapp', 'in_person');
create type public.alert_type as enum ('consecutive_absences', 'overdue_payment');

-- Schéma privé : fonctions internes, jamais exposées par l'API REST.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Date du jour au fuseau de référence de l'application.
create function private.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Africa/Casablanca')::date;
$$;

-- >>> 20260924100100_tables.sql
-- =====================================================================
-- CentroManager — 002 : tables
--
-- Cloisonnement par centre garanti aussi par les clés étrangères :
-- les clés composites (id, center_id) empêchent de relier deux lignes
-- appartenant à des centres différents.
-- =====================================================================

create table public.centers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  center_id uuid not null references public.centers (id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  role public.user_role not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, center_id)
);

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  unique (center_id, name),
  unique (id, center_id)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  level_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  monthly_price numeric(10, 2) not null check (monthly_price >= 0),
  created_at timestamptz not null default now(),
  foreign key (level_id, center_id) references public.levels (id, center_id) on delete restrict,
  unique (level_id, name),
  unique (id, level_id),
  unique (id, center_id)
);

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null,
  level_id uuid not null,
  -- Le niveau doit être celui de la matière.
  foreign key (subject_id, level_id) references public.subjects (id, level_id) on delete cascade,
  unique (teacher_id, subject_id, level_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  level_id uuid not null,
  -- Chemin de l'objet dans le bucket « student-photos » : {center_id}/{fichier}.
  photo_url text,
  guardian_name text,
  guardian_phone text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (level_id, center_id) references public.levels (id, center_id) on delete restrict,
  unique (id, center_id)
);

-- Une ligne par matière payée.
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  start_date date not null default private.today(),
  price_agreed numeric(10, 2) not null check (price_agreed >= 0),
  active boolean not null default true,
  unique (id, student_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  student_id uuid not null,
  period_start date not null,
  period_end date not null,
  amount_due numeric(10, 2) not null check (amount_due >= 0),
  amount_paid numeric(10, 2) not null default 0 check (amount_paid >= 0),
  status public.invoice_status not null default 'pending',
  due_date date not null,
  paid_at timestamptz,
  paid_by uuid references public.profiles (id) on delete set null,
  -- L'élève de la facture est forcément celui de l'inscription.
  foreign key (enrollment_id, student_id) references public.enrollments (id, student_id) on delete cascade,
  check (period_end >= period_start),
  check (status <> 'paid' or paid_at is not null),
  -- Une seule facture par inscription et par période (génération mensuelle idempotente).
  unique (enrollment_id, period_start)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  teacher_id uuid default auth.uid() references public.profiles (id) on delete set null,
  session_date date not null,
  status public.attendance_status not null,
  marked_at timestamptz not null default now(),
  unique (student_id, subject_id, session_date)
);

create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  subject_id uuid not null,
  level_id uuid not null,
  teacher_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = dimanche
  start_time time not null,
  end_time time not null,
  room text not null check (length(btrim(room)) > 0),
  check (end_time > start_time),
  foreign key (subject_id, level_id) references public.subjects (id, level_id) on delete cascade,
  foreign key (level_id, center_id) references public.levels (id, center_id) on delete cascade,
  foreign key (teacher_id, center_id) references public.profiles (id, center_id) on delete restrict,
  -- Conflit de salle : deux créneaux ne peuvent pas se chevaucher dans la même salle.
  constraint schedule_slots_no_room_overlap exclude using gist (
    center_id with =,
    lower(btrim(room)) with =,
    day_of_week with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&
  ),
  -- Conflit de professeur : un professeur ne peut pas être à deux endroits à la fois.
  constraint schedule_slots_no_teacher_overlap exclude using gist (
    teacher_id with =,
    day_of_week with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&
  )
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  type public.follow_up_type not null,
  channel public.follow_up_channel not null,
  note text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  type public.alert_type not null,
  payload jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS activée sur toutes les tables, sans exception.
alter table public.centers enable row level security;
alter table public.profiles enable row level security;
alter table public.levels enable row level security;
alter table public.subjects enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;
alter table public.invoices enable row level security;
alter table public.attendance enable row level security;
alter table public.schedule_slots enable row level security;
alter table public.follow_ups enable row level security;
alter table public.alerts enable row level security;

-- >>> 20260924100200_indexes.sql
-- =====================================================================
-- CentroManager — 003 : index
-- Clés étrangères + colonnes de statut et de date lues par les dashboards.
-- =====================================================================

-- profiles
create index profiles_center_id_idx on public.profiles (center_id);
create index profiles_center_role_idx on public.profiles (center_id, role) where active;

-- levels / subjects
create index levels_center_sort_idx on public.levels (center_id, sort_order);
create index subjects_center_id_idx on public.subjects (center_id);
create index subjects_level_id_idx on public.subjects (level_id);

-- teacher_assignments
create index teacher_assignments_teacher_id_idx on public.teacher_assignments (teacher_id);
create index teacher_assignments_subject_id_idx on public.teacher_assignments (subject_id);
create index teacher_assignments_level_id_idx on public.teacher_assignments (level_id);

-- students
create index students_center_id_idx on public.students (center_id);
create index students_level_id_idx on public.students (level_id);
create index students_created_by_idx on public.students (created_by);
create index students_full_name_trgm_idx on public.students using gin (full_name extensions.gin_trgm_ops);

-- enrollments
create index enrollments_student_id_idx on public.enrollments (student_id);
create index enrollments_subject_id_idx on public.enrollments (subject_id);
-- Une seule inscription active par élève et par matière.
create unique index enrollments_one_active_idx on public.enrollments (student_id, subject_id) where active;

-- invoices
create index invoices_enrollment_id_idx on public.invoices (enrollment_id);
create index invoices_student_id_idx on public.invoices (student_id);
create index invoices_paid_by_idx on public.invoices (paid_by);
create index invoices_status_due_date_idx on public.invoices (status, due_date);
create index invoices_period_start_idx on public.invoices (period_start);
create index invoices_paid_at_idx on public.invoices (paid_at) where paid_at is not null;

-- attendance
create index attendance_subject_date_idx on public.attendance (subject_id, session_date);
create index attendance_teacher_id_idx on public.attendance (teacher_id);
create index attendance_session_date_status_idx on public.attendance (session_date, status);
create index attendance_student_subject_date_idx on public.attendance (student_id, subject_id, session_date desc);

-- schedule_slots
create index schedule_slots_center_day_idx on public.schedule_slots (center_id, day_of_week, start_time);
create index schedule_slots_subject_id_idx on public.schedule_slots (subject_id);
create index schedule_slots_level_id_idx on public.schedule_slots (level_id);
create index schedule_slots_teacher_id_idx on public.schedule_slots (teacher_id, day_of_week);

-- follow_ups
create index follow_ups_student_id_idx on public.follow_ups (student_id, created_at desc);
create index follow_ups_invoice_id_idx on public.follow_ups (invoice_id);
create index follow_ups_created_by_idx on public.follow_ups (created_by);
create index follow_ups_created_at_idx on public.follow_ups (created_at);

-- alerts
create index alerts_student_id_idx on public.alerts (student_id);
create index alerts_open_idx on public.alerts (type, created_at) where not resolved;

-- >>> 20260924100300_auth_helpers_and_integrity.sql
-- =====================================================================
-- CentroManager — 004 : fonctions d'autorisation et intégrité métier
--
-- Les fonctions private.* sont SECURITY DEFINER : elles lisent les tables
-- sans repasser par la RLS (pas de récursion) et ne renvoient que des
-- informations sur l'utilisateur connecté. Un compte désactivé
-- (profiles.active = false) n'obtient ni centre ni rôle, donc aucun accès.
-- =====================================================================

create function private.auth_center_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.center_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.active;
$$;

create function private.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.active;
$$;

create function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.auth_role() = 'admin', false);
$$;

-- Admin ou assistant.
create function private.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.auth_role() in ('admin', 'assistant'), false);
$$;

create function private.student_center_id(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id from public.students s where s.id = p_student_id;
$$;

create function private.subject_center_id(p_subject_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id from public.subjects s where s.id = p_subject_id;
$$;

-- Le professeur connecté enseigne-t-il cette matière ?
create function private.teaches_subject(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_role() = 'teacher'
    and exists (
      select 1
      from public.teacher_assignments ta
      where ta.teacher_id = (select auth.uid())
        and ta.subject_id = p_subject_id
    );
$$;

-- L'élève est-il inscrit (inscription active) à une matière du professeur connecté ?
create function private.teacher_sees_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_role() = 'teacher'
    and exists (
      select 1
      from public.enrollments e
      join public.teacher_assignments ta on ta.subject_id = e.subject_id
      where e.student_id = p_student_id
        and e.active
        and ta.teacher_id = (select auth.uid())
    );
$$;

create function private.is_enrolled(p_student_id uuid, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.student_id = p_student_id
      and e.subject_id = p_subject_id
      and e.active
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Triggers d'intégrité
-- ---------------------------------------------------------------------

-- Inscriptions : élève et matière du même centre ; prix par défaut = tarif
-- de la matière ; seul un administrateur peut fixer un prix différent.
create function private.enrollments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_price numeric(10, 2);
  v_subject_center uuid;
begin
  select s.monthly_price, s.center_id
    into v_subject_price, v_subject_center
  from public.subjects s
  where s.id = new.subject_id;

  if v_subject_center is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et la matière doivent appartenir au même centre.'
      using errcode = '23514';
  end if;

  if new.price_agreed is null then
    new.price_agreed := v_subject_price;
  end if;

  if private.auth_role() = 'assistant' and new.price_agreed <> v_subject_price then
    raise exception 'Seul un administrateur peut fixer un tarif.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger enrollments_before_write
before insert or update of student_id, subject_id, price_agreed on public.enrollments
for each row execute function private.enrollments_before_write();

-- Affectations : le compte doit être un professeur du même centre que la matière.
create function private.teacher_assignments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.teacher_id
      and p.role = 'teacher'
      and p.center_id = private.subject_center_id(new.subject_id)
  ) then
    raise exception 'Le compte affecté doit être un professeur du même centre que la matière.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger teacher_assignments_before_write
before insert or update on public.teacher_assignments
for each row execute function private.teacher_assignments_before_write();

-- Créneaux : le compte doit être un professeur.
create function private.schedule_slots_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.teacher_id and p.role = 'teacher') then
    raise exception 'Un créneau doit être assigné à un professeur.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger schedule_slots_before_write
before insert or update of teacher_id on public.schedule_slots
for each row execute function private.schedule_slots_before_write();

-- Présences : élève et matière du même centre.
create function private.attendance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.subject_center_id(new.subject_id) is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et la matière doivent appartenir au même centre.'
      using errcode = '23514';
  end if;
  -- Horodatage serveur pour toute saisie faite par un utilisateur connecté.
  if (select auth.uid()) is not null then
    new.marked_at := now();
  end if;
  return new;
end;
$$;

create trigger attendance_before_write
before insert or update on public.attendance
for each row execute function private.attendance_before_write();

-- Factures : un assistant ne modifie que les colonnes de paiement
-- (amount_paid, status, paid_at, paid_by).
create function private.invoices_guard_assistant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.auth_role() = 'assistant' and (
    new.enrollment_id is distinct from old.enrollment_id
    or new.student_id is distinct from old.student_id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.amount_due is distinct from old.amount_due
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Un assistant ne peut modifier que les informations de paiement d''une facture.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger invoices_guard_assistant_update
before update on public.invoices
for each row execute function private.invoices_guard_assistant_update();

-- >>> 20260924100400_rls_policies.sql
-- =====================================================================
-- CentroManager — 005 : Row Level Security
--
-- Règles :
--  * Tout est cloisonné par centre (private.auth_center_id()).
--  * ADMIN     : lecture et écriture sur tout son centre ; seul rôle à faire
--                UPDATE / DELETE sur students, subjects, levels, profiles,
--                schedule_slots ; seul rôle à fixer les tarifs.
--  * ASSISTANT : SELECT sur son centre ; INSERT students, enrollments,
--                follow_ups, comptes teacher (+ affectations) ; UPDATE des
--                colonnes de paiement des invoices (trigger dédié).
--  * TEACHER   : SELECT des élèves inscrits à ses matières ; INSERT / UPDATE
--                attendance pour ses matières et la date du jour ; SELECT de
--                ses propres créneaux ; aucun accès aux factures ni aux prix.
--  * anon      : aucun accès (aucune policy « to anon »).
--
-- Les appels sont enveloppés dans (select …) pour être évalués une seule
-- fois par requête et non une fois par ligne.
-- =====================================================================

-- ---------------------------------------------------------------------
-- centers
-- ---------------------------------------------------------------------
create policy centers_select on public.centers
for select to authenticated
using (id = (select private.auth_center_id()));

create policy centers_update_admin on public.centers
for update to authenticated
using (id = (select private.auth_center_id()) and (select private.is_admin()))
with check (id = (select private.auth_center_id()));

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
-- Chacun lit son propre profil (y compris désactivé, pour afficher le motif
-- du refus d'accès) ; admin et assistant lisent les profils de leur centre.
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (center_id = (select private.auth_center_id()) and (select private.is_staff()))
);

create policy profiles_insert on public.profiles
for insert to authenticated
with check (
  center_id = (select private.auth_center_id())
  and (
    (select private.is_admin())
    or ((select private.auth_role()) = 'assistant' and role = 'teacher')
  )
);

create policy profiles_update_admin on public.profiles
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy profiles_delete_admin on public.profiles
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- levels (aucun prix : lisibles par tous les rôles du centre)
-- ---------------------------------------------------------------------
create policy levels_select on public.levels
for select to authenticated
using (center_id = (select private.auth_center_id()));

create policy levels_insert_admin on public.levels
for insert to authenticated
with check (center_id = (select private.auth_center_id()) and (select private.is_admin()));

create policy levels_update_admin on public.levels
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy levels_delete_admin on public.levels
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- subjects (contient monthly_price : admin et assistant uniquement ;
-- les professeurs passent par la vue public.subject_catalog, sans prix)
-- ---------------------------------------------------------------------
create policy subjects_select_staff on public.subjects
for select to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_staff()));

create policy subjects_insert_admin on public.subjects
for insert to authenticated
with check (center_id = (select private.auth_center_id()) and (select private.is_admin()));

create policy subjects_update_admin on public.subjects
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy subjects_delete_admin on public.subjects
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- teacher_assignments
-- ---------------------------------------------------------------------
create policy teacher_assignments_select on public.teacher_assignments
for select to authenticated
using (
  teacher_id = (select auth.uid()) and (select private.auth_role()) = 'teacher'
  or (
    (select private.is_staff())
    and private.subject_center_id(subject_id) = (select private.auth_center_id())
  )
);

-- L'assistant affecte les matières lors de la création d'un professeur.
create policy teacher_assignments_insert_staff on public.teacher_assignments
for insert to authenticated
with check (
  (select private.is_staff())
  and private.subject_center_id(subject_id) = (select private.auth_center_id())
);

create policy teacher_assignments_update_admin on public.teacher_assignments
for update to authenticated
using (
  (select private.is_admin())
  and private.subject_center_id(subject_id) = (select private.auth_center_id())
)
with check (private.subject_center_id(subject_id) = (select private.auth_center_id()));

create policy teacher_assignments_delete_admin on public.teacher_assignments
for delete to authenticated
using (
  (select private.is_admin())
  and private.subject_center_id(subject_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------
create policy students_select on public.students
for select to authenticated
using (
  (center_id = (select private.auth_center_id()) and (select private.is_staff()))
  or private.teacher_sees_student(id)
);

create policy students_insert_staff on public.students
for insert to authenticated
with check (
  center_id = (select private.auth_center_id())
  and (select private.is_staff())
  and created_by = (select auth.uid())
);

create policy students_update_admin on public.students
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy students_delete_admin on public.students
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- enrollments (contient price_agreed : admin et assistant uniquement ;
-- les professeurs passent par la vue public.class_rosters, sans prix)
-- ---------------------------------------------------------------------
create policy enrollments_select_staff on public.enrollments
for select to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy enrollments_insert_staff on public.enrollments
for insert to authenticated
with check (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy enrollments_update_admin on public.enrollments
for update to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
)
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy enrollments_delete_admin on public.enrollments
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- invoices (aucun accès professeur)
-- ---------------------------------------------------------------------
create policy invoices_select_staff on public.invoices
for select to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy invoices_insert_admin on public.invoices
for insert to authenticated
with check (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- Assistant : restreint aux colonnes de paiement par le trigger
-- private.invoices_guard_assistant_update.
create policy invoices_update_staff on public.invoices
for update to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
)
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy invoices_delete_admin on public.invoices
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------
create policy attendance_select on public.attendance
for select to authenticated
using (
  (
    (select private.is_staff())
    and private.student_center_id(student_id) = (select private.auth_center_id())
  )
  or private.teaches_subject(subject_id)
);

create policy attendance_insert on public.attendance
for insert to authenticated
with check (
  (
    (select private.is_admin())
    and private.student_center_id(student_id) = (select private.auth_center_id())
  )
  or (
    private.teaches_subject(subject_id)
    and private.is_enrolled(student_id, subject_id)
    and teacher_id = (select auth.uid())
    and session_date = (select private.today())
  )
);

create policy attendance_update on public.attendance
for update to authenticated
using (
  (
    (select private.is_admin())
    and private.student_center_id(student_id) = (select private.auth_center_id())
  )
  or (private.teaches_subject(subject_id) and session_date = (select private.today()))
)
with check (
  (
    (select private.is_admin())
    and private.student_center_id(student_id) = (select private.auth_center_id())
  )
  or (
    private.teaches_subject(subject_id)
    and private.is_enrolled(student_id, subject_id)
    and teacher_id = (select auth.uid())
    and session_date = (select private.today())
  )
);

create policy attendance_delete_admin on public.attendance
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- schedule_slots
-- ---------------------------------------------------------------------
-- Le professeur voit automatiquement ses propres créneaux.
create policy schedule_slots_select on public.schedule_slots
for select to authenticated
using (
  (center_id = (select private.auth_center_id()) and (select private.is_staff()))
  or (teacher_id = (select auth.uid()) and (select private.auth_role()) = 'teacher')
);

create policy schedule_slots_insert_admin on public.schedule_slots
for insert to authenticated
with check (center_id = (select private.auth_center_id()) and (select private.is_admin()));

create policy schedule_slots_update_admin on public.schedule_slots
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy schedule_slots_delete_admin on public.schedule_slots
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- follow_ups
-- ---------------------------------------------------------------------
create policy follow_ups_select_staff on public.follow_ups
for select to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy follow_ups_insert_staff on public.follow_ups
for insert to authenticated
with check (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
  and created_by = (select auth.uid())
);

create policy follow_ups_update_admin on public.follow_ups
for update to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
)
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy follow_ups_delete_admin on public.follow_ups
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- alerts (créées et résolues automatiquement en phase 7)
-- ---------------------------------------------------------------------
create policy alerts_select_staff on public.alerts
for select to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy alerts_update_admin on public.alerts
for update to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
)
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy alerts_delete_admin on public.alerts
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- Privilèges : anon n'a aucun droit sur les tables applicatives.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;

-- >>> 20260924100500_teacher_safe_views.sql
-- =====================================================================
-- CentroManager — 006 : vues sans prix
--
-- Les professeurs n'ont aucun accès aux tables subjects et enrollments
-- (elles contiennent les tarifs). Ces vues exposent uniquement les colonnes
-- non financières. Elles s'exécutent avec les droits de leur propriétaire
-- (security_invoker = false) et appliquent donc elles-mêmes le filtrage :
-- toute ligne hors du centre de l'utilisateur est exclue.
-- =====================================================================

-- Catalogue des matières du centre, sans tarif.
create view public.subject_catalog
with (security_barrier = true)
as
select s.id, s.center_id, s.level_id, s.name
from public.subjects s
where s.center_id = (select private.auth_center_id());

-- Listes de classe : staff = tout le centre ; professeur = ses matières.
create view public.class_rosters
with (security_barrier = true)
as
select e.id, e.student_id, e.subject_id, e.start_date, e.active
from public.enrollments e
join public.students st on st.id = e.student_id
where st.center_id = (select private.auth_center_id())
  and ((select private.is_staff()) or private.teaches_subject(e.subject_id));

comment on view public.subject_catalog is
  'Matières du centre de l''utilisateur, sans tarif. Filtrage appliqué par la vue.';
comment on view public.class_rosters is
  'Inscriptions visibles par l''utilisateur, sans prix. Filtrage appliqué par la vue.';

revoke all on public.subject_catalog, public.class_rosters from anon, authenticated;
grant select on public.subject_catalog, public.class_rosters to authenticated;

-- Aucun droit par défaut pour anon sur les futurs objets du schéma public.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- >>> 20260924100600_storage_student_photos.sql
-- =====================================================================
-- CentroManager — 007 : bucket Storage « student-photos »
--
-- Bucket privé. Convention de chemin : {center_id}/{nom-de-fichier}.
-- Le premier segment du chemin sert au cloisonnement par centre.
-- Les photos sont servies par URL signée.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-photos',
  'student-photos',
  false,
  2097152, -- 2 Mo (les photos sont compressées côté client à 800 px)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Lecture : tous les utilisateurs actifs du même centre.
create policy student_photos_select_same_center on storage.objects
for select to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
);

-- Dépôt : admin et assistant, dans le dossier de leur centre.
create policy student_photos_insert_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_staff())
);

-- Remplacement et suppression : admin.
create policy student_photos_update_admin on storage.objects
for update to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_admin())
)
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
);

create policy student_photos_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_admin())
);

-- >>> 20260925090000_custom_access_token_hook.sql
-- =====================================================================
-- CentroManager — 008 : hook « custom access token »
--
-- Ajoute au JWT les claims user_role, center_id et profile_active.
-- Ils servent uniquement aux redirections rapides du proxy Next.js.
-- L'autorisation réelle reste portée par la RLS et par la lecture du
-- profil côté serveur (un changement de rôle ou une désactivation est
-- donc effectif immédiatement, même avant le renouvellement du jeton).
--
-- En production : activer le hook dans le tableau de bord Supabase
-- (Authentication > Hooks > Customize Access Token).
-- =====================================================================

create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_role public.user_role;
  v_center_id uuid;
  v_active boolean;
begin
  select p.role, p.center_id, p.active
    into v_role, v_center_id, v_active
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  if v_role is null then
    -- Compte Auth sans profil : aucun accès applicatif.
    v_claims := v_claims - 'user_role' - 'center_id';
    v_claims := jsonb_set(v_claims, '{profile_active}', 'false'::jsonb);
  else
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{center_id}', to_jsonb(v_center_id));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- Seul le service Auth peut exécuter le hook.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Le service Auth lit les profils (RLS active : policy dédiée).
grant select on table public.profiles to supabase_auth_admin;

create policy profiles_select_auth_admin on public.profiles
for select to supabase_auth_admin
using (true);

-- >>> 20260926090000_assistant_space.sql
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

-- >>> 20260927090000_admin_space.sql
-- =====================================================================
-- CentroManager — 010 : espace Admin
--
-- Définitions retenues :
--  * revenu attendu du mois = montants dus des factures dont la période
--    commence dans le mois civil en cours (cycles du 1er et du 15) ;
--  * revenu encaissé = montants payés sur ces mêmes factures ;
--  * taux d'absence = absences / présences saisies, sur une fenêtre glissante.
--
-- Fonctions réservées à l'administrateur (vérification explicite), en
-- « security invoker » : la RLS s'applique en plus.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Planning : le professeur d'un créneau doit enseigner la matière.
-- ---------------------------------------------------------------------
create or replace function private.schedule_slots_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.teacher_id and p.role = 'teacher') then
    raise exception 'Un créneau doit être assigné à un professeur.'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.teacher_assignments ta
    where ta.teacher_id = new.teacher_id and ta.subject_id = new.subject_id
  ) then
    raise exception 'Ce professeur n''enseigne pas cette matière.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger schedule_slots_before_write on public.schedule_slots;
create trigger schedule_slots_before_write
before insert or update of teacher_id, subject_id on public.schedule_slots
for each row execute function private.schedule_slots_before_write();

-- ---------------------------------------------------------------------
-- Cohérence niveau / inscriptions : un élève ne suit activement que des
-- matières de son niveau. Pour changer de niveau, on arrête d'abord ses
-- inscriptions (l'historique des factures et présences est conservé).
-- ---------------------------------------------------------------------
create function private.enrollments_level_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active and not exists (
    select 1
    from public.students st
    join public.subjects su on su.level_id = st.level_id
    where st.id = new.student_id and su.id = new.subject_id
  ) then
    raise exception 'Cette matière n''appartient pas au niveau de l''élève.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enrollments_level_check
before insert or update of student_id, subject_id, active on public.enrollments
for each row execute function private.enrollments_level_check();

create function private.students_level_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.enrollments e
    join public.subjects su on su.id = e.subject_id
    where e.student_id = new.id and e.active and su.level_id <> new.level_id
  ) then
    raise exception 'Pour changer de niveau, arrêtez d''abord les inscriptions de l''élève à son niveau actuel.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger students_level_check
before update of level_id on public.students
for each row
when (new.level_id is distinct from old.level_id)
execute function private.students_level_check();

-- ---------------------------------------------------------------------
-- Profils : pas d'auto-verrouillage, rôle professeur figé.
-- ---------------------------------------------------------------------
create function private.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = (select auth.uid()) and (not new.active or new.role is distinct from old.role) then
    raise exception 'Vous ne pouvez ni désactiver votre propre compte, ni changer votre rôle.'
      using errcode = '23514';
  end if;
  -- Un professeur porte des affectations et des créneaux : son rôle ne change pas.
  if new.role is distinct from old.role and (old.role = 'teacher' or new.role = 'teacher') then
    raise exception 'Le rôle professeur ne peut pas être attribué ni retiré à un compte existant.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_before_update
before update on public.profiles
for each row execute function private.profiles_before_update();

-- ---------------------------------------------------------------------
-- Indicateurs du mois
-- ---------------------------------------------------------------------
create function public.admin_month_revenue(p_level_id uuid default null)
returns table (
  month_start date,
  expected_amount numeric,
  collected_amount numeric,
  invoice_count integer,
  paid_count integer,
  student_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
    (select count(*)::integer from public.students s where p_level_id is null or s.level_id = p_level_id)
  from public.invoices i
  join public.students st on st.id = i.student_id
  where i.period_start >= v_month
    and i.period_start < (v_month + interval '1 month')::date
    and (p_level_id is null or st.level_id = p_level_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Taux d'absence par matière (p_days : fenêtre glissante ; null = tout)
-- ---------------------------------------------------------------------
create function public.admin_absence_rates(p_level_id uuid default null, p_days integer default 30)
returns table (
  subject_id uuid,
  subject_name text,
  level_id uuid,
  level_name text,
  level_sort integer,
  absent_count integer,
  total_count integer,
  absence_rate numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
  where p_level_id is null or s.level_id = p_level_id
  group by s.id, s.name, l.id, l.name, l.sort_order;
end;
$$;

-- ---------------------------------------------------------------------
-- Effectifs par niveau et par matière
-- ---------------------------------------------------------------------
create function public.admin_enrollment_report()
returns table (
  level_id uuid,
  level_name text,
  level_sort integer,
  level_students integer,
  subject_id uuid,
  subject_name text,
  monthly_price numeric,
  active_enrollments integer,
  agreed_revenue numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.name,
    l.sort_order,
    (select count(*)::integer from public.students st where st.level_id = l.id),
    s.id,
    s.name,
    s.monthly_price,
    (select count(*)::integer from public.enrollments e where e.subject_id = s.id and e.active),
    -- Revenu mensuel réel des inscriptions actives : somme des prix convenus (remises incluses).
    (select coalesce(sum(e.price_agreed), 0) from public.enrollments e where e.subject_id = s.id and e.active)
  from public.levels l
  left join public.subjects s on s.level_id = l.id
  order by l.sort_order, l.name, s.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Annuaire des comptes du centre (avec email, lu dans auth.users)
-- ---------------------------------------------------------------------
create function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  role public.user_role,
  phone text,
  active boolean,
  created_at timestamptz,
  email text,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.role, p.phone, p.active, p.created_at, u.email::text, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.center_id = private.auth_center_id()
  order by p.active desc, p.role, p.full_name;
end;
$$;

-- ---------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

revoke execute on function public.admin_month_revenue(uuid) from public, anon;
revoke execute on function public.admin_absence_rates(uuid, integer) from public, anon;
revoke execute on function public.admin_enrollment_report() from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_month_revenue(uuid) to authenticated;
grant execute on function public.admin_absence_rates(uuid, integer) to authenticated;
grant execute on function public.admin_enrollment_report() to authenticated;
grant execute on function public.admin_list_users() to authenticated;

-- >>> 20260928090000_automations.sql
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

-- >>> 20260929090000_packs.sql
-- =====================================================================
-- CentroManager — 012 : packs d'abonnement
--
-- Règles validées :
--  * un pack appartient à un niveau et regroupe des matières choisies par
--    l'administrateur, à un prix mensuel unique ;
--  * une seule facture par mois pour le pack (mêmes cycles et échéances
--    qu'une inscription) ;
--  * un élève a soit un pack, soit des matières à l'unité, jamais les deux,
--    et au plus un pack actif ;
--  * souscrire un pack inscrit l'élève à chaque matière du pack : il apparaît
--    dans les listes de classe, l'appel et les alertes d'absences. Ces
--    inscriptions (pack_enrollment_id renseigné) n'ont pas de prix propre et
--    ne sont jamais facturées ; elles suivent le pack (arrêt, reprise,
--    matières ajoutées ou retirées du pack).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.packs (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  level_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  monthly_price numeric(10, 2) not null check (monthly_price >= 0),
  -- Un pack désactivé n'est plus proposé ; les abonnements en cours continuent.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (level_id, center_id) references public.levels (id, center_id) on delete restrict,
  unique (level_id, name),
  unique (id, center_id)
);

create table public.pack_subjects (
  pack_id uuid not null references public.packs (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  primary key (pack_id, subject_id)
);

create table public.pack_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  pack_id uuid not null references public.packs (id) on delete restrict,
  start_date date not null default private.today(),
  price_agreed numeric(10, 2) not null check (price_agreed >= 0),
  active boolean not null default true,
  billing_day smallint generated always as ((case when extract(day from start_date) < 15 then 1 else 15 end)::smallint) stored,
  created_at timestamptz not null default now(),
  unique (id, student_id)
);

comment on column public.pack_enrollments.billing_day is
  'Jour du cycle de facturation (1 ou 15), déduit de la date de souscription.';

create unique index pack_enrollments_one_active_idx on public.pack_enrollments (student_id) where active;
create index pack_enrollments_pack_id_idx on public.pack_enrollments (pack_id);
create index packs_level_id_idx on public.packs (level_id);
create index pack_subjects_subject_id_idx on public.pack_subjects (subject_id);

-- Inscriptions couvertes par un pack.
alter table public.enrollments
  add column pack_enrollment_id uuid references public.pack_enrollments (id) on delete cascade;
create index enrollments_pack_enrollment_id_idx on public.enrollments (pack_enrollment_id);

-- Factures : soit d'une inscription, soit d'un abonnement pack.
alter table public.invoices alter column enrollment_id drop not null;
alter table public.invoices add column pack_enrollment_id uuid;
alter table public.invoices
  add constraint invoices_pack_enrollment_fkey
    foreign key (pack_enrollment_id, student_id) references public.pack_enrollments (id, student_id) on delete cascade,
  add constraint invoices_one_source_check check (num_nonnulls(enrollment_id, pack_enrollment_id) = 1),
  add constraint invoices_pack_enrollment_period_key unique (pack_enrollment_id, period_start);
create index invoices_pack_enrollment_id_idx on public.invoices (pack_enrollment_id);

-- ---------------------------------------------------------------------
-- Aide RLS
-- ---------------------------------------------------------------------
create function private.pack_center_id(p_pack_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.center_id from public.packs p where p.id = p_pack_id;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.packs enable row level security;
alter table public.pack_subjects enable row level security;
alter table public.pack_enrollments enable row level security;

-- packs : lecture admin et assistant (contient les prix), écriture admin.
create policy packs_select_staff on public.packs
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

create policy packs_insert_admin on public.packs
for insert to authenticated
with check ((select private.is_admin()) and center_id = (select private.auth_center_id()));

create policy packs_update_admin on public.packs
for update to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()))
with check (center_id = (select private.auth_center_id()));

create policy packs_delete_admin on public.packs
for delete to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()));

-- pack_subjects
create policy pack_subjects_select_staff on public.pack_subjects
for select to authenticated
using ((select private.is_staff()) and private.pack_center_id(pack_id) = (select private.auth_center_id()));

create policy pack_subjects_insert_admin on public.pack_subjects
for insert to authenticated
with check ((select private.is_admin()) and private.pack_center_id(pack_id) = (select private.auth_center_id()));

create policy pack_subjects_delete_admin on public.pack_subjects
for delete to authenticated
using ((select private.is_admin()) and private.pack_center_id(pack_id) = (select private.auth_center_id()));

-- pack_enrollments : l'assistant souscrit (au prix du pack), l'admin gère.
create policy pack_enrollments_select_staff on public.pack_enrollments
for select to authenticated
using ((select private.is_staff()) and private.student_center_id(student_id) = (select private.auth_center_id()));

create policy pack_enrollments_insert_staff on public.pack_enrollments
for insert to authenticated
with check ((select private.is_staff()) and private.student_center_id(student_id) = (select private.auth_center_id()));

create policy pack_enrollments_update_admin on public.pack_enrollments
for update to authenticated
using ((select private.is_admin()) and private.student_center_id(student_id) = (select private.auth_center_id()))
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy pack_enrollments_delete_admin on public.pack_enrollments
for delete to authenticated
using ((select private.is_admin()) and private.student_center_id(student_id) = (select private.auth_center_id()));

revoke all on public.packs, public.pack_subjects, public.pack_enrollments from anon;

-- ---------------------------------------------------------------------
-- Intégrité des packs
-- ---------------------------------------------------------------------

-- Les matières d'un pack sont celles de son niveau.
create function private.pack_subjects_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.packs p
    join public.subjects s on s.level_id = p.level_id
    where p.id = new.pack_id and s.id = new.subject_id
  ) then
    raise exception 'Les matières du pack doivent appartenir à son niveau.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pack_subjects_before_write
before insert or update on public.pack_subjects
for each row execute function private.pack_subjects_before_write();

-- Le niveau d'un pack ne change pas (ses matières et abonnés en dépendent).
create function private.packs_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.level_id is distinct from old.level_id then
    raise exception 'Le niveau d''un pack ne peut pas être modifié.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger packs_before_update
before update of level_id on public.packs
for each row execute function private.packs_before_update();

-- Souscription : même centre et même niveau que l'élève, prix du pack par
-- défaut (seul l'admin fixe un autre prix), pas de matière à l'unité active.
create function private.pack_enrollments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack public.packs;
begin
  select * into v_pack from public.packs where id = new.pack_id;

  if v_pack.center_id is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et le pack doivent appartenir au même centre.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and not v_pack.active then
    raise exception 'Ce pack n''est plus proposé.' using errcode = '23514';
  end if;

  if new.price_agreed is null then
    new.price_agreed := v_pack.monthly_price;
  end if;

  if private.auth_role() = 'assistant' and new.price_agreed <> v_pack.monthly_price then
    raise exception 'Seul un administrateur peut fixer un tarif.' using errcode = '42501';
  end if;

  if new.active then
    if not exists (
      select 1 from public.students st where st.id = new.student_id and st.level_id = v_pack.level_id
    ) then
      raise exception 'Ce pack n''appartient pas au niveau de l''élève.' using errcode = '23514';
    end if;

    if exists (
      select 1 from public.enrollments e
      where e.student_id = new.student_id and e.active and e.pack_enrollment_id is null
    ) then
      raise exception 'L''élève suit des matières à l''unité : arrêtez-les avant de souscrire un pack.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger pack_enrollments_before_write
before insert or update of student_id, pack_id, price_agreed, active on public.pack_enrollments
for each row execute function private.pack_enrollments_before_write();

-- ---------------------------------------------------------------------
-- Facturation des packs
-- ---------------------------------------------------------------------
create function private.create_pack_period_invoice(p_pack_enrollment_id uuid, p_date date, p_resumed boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.pack_enrollments;
  v_period_start date;
  v_inserted integer;
begin
  select * into v_subscription from public.pack_enrollments where id = p_pack_enrollment_id;
  if v_subscription.id is null or not v_subscription.active or v_subscription.start_date > p_date then
    return false;
  end if;

  v_period_start := private.billing_period_start(p_date, v_subscription.billing_day);

  insert into public.invoices (pack_enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    v_subscription.id,
    v_subscription.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    v_subscription.price_agreed,
    'pending',
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end + 5
  )
  on conflict (pack_enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- Souscription : inscriptions aux matières du pack et première facture
-- (due 5 jours après la souscription). Arrêt / reprise : les matières suivent,
-- et une reprise facture la période en cours.
create function private.pack_enrollments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.enrollments (student_id, subject_id, start_date, price_agreed, active, pack_enrollment_id)
    select new.student_id, ps.subject_id, new.start_date, 0, new.active, new.id
    from public.pack_subjects ps
    where ps.pack_id = new.pack_id;

    if new.active then
      perform private.create_pack_period_invoice(new.id, new.start_date, true);
    end if;
  elsif new.active is distinct from old.active then
    update public.enrollments set active = new.active where pack_enrollment_id = new.id;
    if new.active then
      perform private.create_pack_period_invoice(new.id, private.today(), true);
    end if;
  end if;
  return null;
end;
$$;

create trigger pack_enrollments_after_write
after insert or update of active on public.pack_enrollments
for each row execute function private.pack_enrollments_after_write();

-- Matières ajoutées ou retirées d'un pack : les abonnés suivent.
create function private.pack_subjects_sync_subscribers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.enrollments (student_id, subject_id, start_date, price_agreed, active, pack_enrollment_id)
    select pe.student_id, new.subject_id, greatest(pe.start_date, private.today()), 0, pe.active, pe.id
    from public.pack_enrollments pe
    where pe.pack_id = new.pack_id;
    return null;
  end if;

  delete from public.enrollments e
  using public.pack_enrollments pe
  where pe.pack_id = old.pack_id
    and e.pack_enrollment_id = pe.id
    and e.subject_id = old.subject_id;
  return null;
end;
$$;

create trigger pack_subjects_sync_subscribers
after insert or delete on public.pack_subjects
for each row execute function private.pack_subjects_sync_subscribers();

-- ---------------------------------------------------------------------
-- Inscriptions : prise en compte des packs
-- ---------------------------------------------------------------------

-- Prix : une matière couverte par un pack n'a pas de prix propre.
create or replace function private.enrollments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_price numeric(10, 2);
  v_subject_center uuid;
begin
  select s.monthly_price, s.center_id
    into v_subject_price, v_subject_center
  from public.subjects s
  where s.id = new.subject_id;

  if v_subject_center is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et la matière doivent appartenir au même centre.'
      using errcode = '23514';
  end if;

  if new.pack_enrollment_id is not null then
    new.price_agreed := 0;
    return new;
  end if;

  if new.price_agreed is null then
    new.price_agreed := v_subject_price;
  end if;

  if private.auth_role() = 'assistant' and new.price_agreed <> v_subject_price then
    raise exception 'Seul un administrateur peut fixer un tarif.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Pack et matières à l'unité ne se combinent pas ; les matières d'un pack ne
-- se modifient qu'à travers le pack.
create function private.enrollments_pack_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.pack_enrollment_id is not null and pg_trigger_depth() = 1
     and (new.active is distinct from old.active
          or new.pack_enrollment_id is distinct from old.pack_enrollment_id
          or new.subject_id is distinct from old.subject_id) then
    raise exception 'Cette matière fait partie d''un pack : modifiez ou arrêtez le pack.' using errcode = '23514';
  end if;

  if new.pack_enrollment_id is null and new.active and exists (
    select 1 from public.pack_enrollments pe where pe.student_id = new.student_id and pe.active
  ) then
    raise exception 'L''élève a un pack actif : il ne peut pas prendre de matière à l''unité.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger enrollments_pack_rules
before insert or update of active, pack_enrollment_id, subject_id on public.enrollments
for each row execute function private.enrollments_pack_rules();

-- Pas de facture pour une matière couverte par un pack.
create or replace function private.enrollments_create_first_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := private.billing_period_start(new.start_date, new.billing_day);
begin
  if new.pack_enrollment_id is not null then
    return null;
  end if;

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

create or replace function private.create_period_invoice(p_enrollment_id uuid, p_date date, p_resumed boolean default false)
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
  if v_enrollment.id is null or not v_enrollment.active or v_enrollment.start_date > p_date
     or v_enrollment.pack_enrollment_id is not null then
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

-- Génération quotidienne : inscriptions à l'unité et abonnements packs.
create or replace function private.generate_invoices(p_date date default private.today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer := 0;
  v_id uuid;
begin
  for v_id in
    select e.id from public.enrollments e
    where e.active and e.start_date <= p_date and e.pack_enrollment_id is null
  loop
    if private.create_period_invoice(v_id, p_date) then
      v_created := v_created + 1;
    end if;
  end loop;

  for v_id in
    select pe.id from public.pack_enrollments pe where pe.active and pe.start_date <= p_date
  loop
    if private.create_pack_period_invoice(v_id, p_date) then
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$$;

-- L'assistant ne modifie que les colonnes de paiement, source comprise.
create or replace function private.invoices_guard_assistant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.auth_role() = 'assistant' and (
    new.enrollment_id is distinct from old.enrollment_id
    or new.pack_enrollment_id is distinct from old.pack_enrollment_id
    or new.student_id is distinct from old.student_id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.amount_due is distinct from old.amount_due
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Un assistant ne peut modifier que les informations de paiement d''une facture.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Nouvel élève : matières à l'unité ou pack
-- ---------------------------------------------------------------------
drop function public.create_student(uuid, text, uuid, uuid[], text, text, text, text);

create function public.create_student(
  p_student_id uuid,
  p_full_name text,
  p_level_id uuid,
  p_subject_ids uuid[],
  p_guardian_name text default null,
  p_guardian_phone text default null,
  p_notes text default null,
  p_photo_path text default null,
  p_pack_id uuid default null
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

  if p_pack_id is not null then
    if coalesce(array_length(p_subject_ids, 1), 0) > 0 then
      raise exception 'Choisissez un pack ou des matières à l''unité, pas les deux.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.packs p where p.id = p_pack_id and p.level_id = p_level_id and p.active) then
      raise exception 'Le pack doit appartenir au niveau choisi.' using errcode = '22023';
    end if;
  else
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

  if p_pack_id is not null then
    -- Prix = tarif du pack ; matières et première facture créées par trigger.
    insert into public.pack_enrollments (student_id, pack_id, start_date)
    values (p_student_id, p_pack_id, private.today());
  else
    -- Prix convenu = tarif de la matière (trigger enrollments_before_write).
    insert into public.enrollments (student_id, subject_id, start_date)
    select p_student_id, sid, private.today()
    from (select distinct unnest(p_subject_ids) as sid) as subjects;
  end if;

  return p_student_id;
end;
$$;

revoke execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid) from public, anon;
grant execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Rapports : abonnés et revenu par pack
-- ---------------------------------------------------------------------
create function public.admin_pack_report()
returns table (
  pack_id uuid,
  pack_name text,
  level_id uuid,
  level_name text,
  level_sort integer,
  monthly_price numeric,
  active boolean,
  subscribers integer,
  agreed_revenue numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
    (select count(*)::integer from public.pack_enrollments pe where pe.pack_id = p.id and pe.active),
    (select coalesce(sum(pe.price_agreed), 0) from public.pack_enrollments pe where pe.pack_id = p.id and pe.active)
  from public.packs p
  join public.levels l on l.id = p.level_id
  order by l.sort_order, l.name, p.name;
end;
$$;

revoke execute on function public.admin_pack_report() from public, anon;
grant execute on function public.admin_pack_report() to authenticated;

-- Fonctions internes : jamais appelées par les utilisateurs.
revoke all on function
  private.create_pack_period_invoice(uuid, date, boolean)
from public, anon, authenticated;

-- >>> 20260930090000_staff_photos.sql
-- =====================================================================
-- CentroManager — 013 : photos de l'équipe (admin, assistant, professeur)
--
-- Règle validée : chacun change sa propre photo ; l'administrateur peut
-- changer celle de n'importe quel membre de son centre.
--
-- Bucket privé « staff-photos ». Chemin : {center_id}/{profile_id}/{horodatage}.jpg
-- (nom unique à chaque changement : la nouvelle photo s'affiche sans cache).
-- Les photos sont servies par URL signée.
-- =====================================================================

alter table public.profiles add column photo_url text;

comment on column public.profiles.photo_url is
  'Chemin de la photo dans le bucket staff-photos : {center_id}/{profile_id}/{fichier}.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-photos',
  'staff-photos',
  false,
  2097152, -- 2 Mo (photos compressées côté client à 800 px)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Dossier modifiable par l'utilisateur connecté : le sien, ou tout son centre pour l'admin.
create function private.can_write_staff_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(p_name))[1] = private.auth_center_id()::text
    and (
      private.is_admin()
      or (storage.foldername(p_name))[2] = (select auth.uid())::text
    );
$$;

-- Lecture : tous les membres actifs du même centre.
create policy staff_photos_select_same_center on storage.objects
for select to authenticated
using (
  bucket_id = 'staff-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
);

create policy staff_photos_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'staff-photos' and private.can_write_staff_photo(name));

create policy staff_photos_update on storage.objects
for update to authenticated
using (bucket_id = 'staff-photos' and private.can_write_staff_photo(name))
with check (bucket_id = 'staff-photos' and private.can_write_staff_photo(name));

create policy staff_photos_delete on storage.objects
for delete to authenticated
using (bucket_id = 'staff-photos' and private.can_write_staff_photo(name));

-- ---------------------------------------------------------------------
-- Sa propre photo : seule colonne du profil qu'un non-admin peut changer.
-- ---------------------------------------------------------------------
create function public.set_my_photo(p_path text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or v_center_id is null then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if p_path is not null and p_path not like v_center_id::text || '/' || v_user_id::text || '/%' then
    raise exception 'Chemin de photo invalide.' using errcode = '22023';
  end if;

  update public.profiles set photo_url = p_path where id = v_user_id;
end;
$$;

revoke execute on function public.set_my_photo(text) from public, anon;
grant execute on function public.set_my_photo(text) to authenticated;

-- Annuaire admin : photo en plus.
drop function public.admin_list_users();

create function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  role public.user_role,
  phone text,
  active boolean,
  created_at timestamptz,
  email text,
  last_sign_in_at timestamptz,
  photo_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.role, p.phone, p.active, p.created_at,
         u.email::text, u.last_sign_in_at, p.photo_url
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.center_id = private.auth_center_id()
  order by p.active desc, p.role, p.full_name;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- >>> 20261001090000_billing_cycle_choice.sql
-- =====================================================================
-- CentroManager — 014 : cycle de paiement choisi, échéance le jour même,
-- suivi des notes d'élève (notifications).
--
-- Règles validées :
--  * à l'inscription, le cycle (le 1er ou le 15) est choisi ; à défaut, il
--    suit le cycle déjà en place pour l'élève, sinon la date d'inscription ;
--  * la première facture couvre la période du cycle en cours
--    (ex. inscrit le 20/09, cycle du 1er : période du 01/09 au 30/09) ;
--  * une facture est due le premier jour de sa période (ou le jour de
--    l'inscription / de la reprise) et passe en retard le jour même si elle
--    n'est pas réglée : plus de délai de 5 jours ;
--  * les factures existantes gardent leur échéance.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cycle choisi (colonne ordinaire, valeurs 1 ou 15)
-- ---------------------------------------------------------------------
alter table public.enrollments alter column billing_day drop expression;
alter table public.enrollments
  add constraint enrollments_billing_day_check check (billing_day in (1, 15));

alter table public.pack_enrollments alter column billing_day drop expression;
alter table public.pack_enrollments
  add constraint pack_enrollments_billing_day_check check (billing_day in (1, 15));

comment on column public.enrollments.billing_day is
  'Jour du cycle de facturation (1 ou 15), choisi à l''inscription.';
comment on column public.pack_enrollments.billing_day is
  'Jour du cycle de facturation (1 ou 15), choisi à la souscription.';

-- Cycle par défaut : celui du pack, sinon celui déjà en place pour l'élève,
-- sinon d'après la date d'inscription.
create function private.default_billing_day(p_student_id uuid, p_start_date date)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.billing_day from public.enrollments e
      where e.student_id = p_student_id and e.active order by e.start_date desc limit 1),
    (select pe.billing_day from public.pack_enrollments pe
      where pe.student_id = p_student_id and pe.active order by pe.start_date desc limit 1),
    (case when extract(day from p_start_date) < 15 then 1 else 15 end)::smallint
  );
$$;

create function private.enrollments_billing_day_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.billing_day is null then
    if new.pack_enrollment_id is not null then
      select pe.billing_day into new.billing_day from public.pack_enrollments pe where pe.id = new.pack_enrollment_id;
    else
      new.billing_day := private.default_billing_day(new.student_id, new.start_date);
    end if;
  end if;
  return new;
end;
$$;

create trigger enrollments_billing_day_default
before insert on public.enrollments
for each row execute function private.enrollments_billing_day_default();

create function private.pack_enrollments_billing_day_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.billing_day is null then
    new.billing_day := private.default_billing_day(new.student_id, new.start_date);
  end if;
  return new;
end;
$$;

create trigger pack_enrollments_billing_day_default
before insert on public.pack_enrollments
for each row execute function private.pack_enrollments_billing_day_default();

-- ---------------------------------------------------------------------
-- Échéances : le jour même
-- ---------------------------------------------------------------------
create or replace function private.enrollments_create_first_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := private.billing_period_start(new.start_date, new.billing_day);
begin
  if new.pack_enrollment_id is not null then
    return null;
  end if;

  insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    new.id,
    new.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    new.price_agreed,
    'pending',
    new.start_date
  )
  on conflict (enrollment_id, period_start) do nothing;
  return null;
end;
$$;

create or replace function private.create_period_invoice(p_enrollment_id uuid, p_date date, p_resumed boolean default false)
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
  if v_enrollment.id is null or not v_enrollment.active or v_enrollment.start_date > p_date
     or v_enrollment.pack_enrollment_id is not null then
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
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end
  )
  on conflict (enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

create or replace function private.create_pack_period_invoice(p_pack_enrollment_id uuid, p_date date, p_resumed boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.pack_enrollments;
  v_period_start date;
  v_inserted integer;
begin
  select * into v_subscription from public.pack_enrollments where id = p_pack_enrollment_id;
  if v_subscription.id is null or not v_subscription.active or v_subscription.start_date > p_date then
    return false;
  end if;

  v_period_start := private.billing_period_start(p_date, v_subscription.billing_day);

  insert into public.invoices (pack_enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    v_subscription.id,
    v_subscription.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    v_subscription.price_agreed,
    'pending',
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end
  )
  on conflict (pack_enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- En retard dès le jour de l'échéance s'il n'est pas réglé.
create or replace function private.invoice_is_overdue(p_status public.invoice_status, p_due_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'overdue' or (p_status = 'pending' and p_due_date <= private.today());
$$;

create or replace function private.mark_overdue_invoices(p_date date default private.today())
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
    where status = 'pending' and due_date <= p_date
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
-- Nouvel élève : cycle choisi
-- ---------------------------------------------------------------------
drop function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid);

create function public.create_student(
  p_student_id uuid,
  p_full_name text,
  p_level_id uuid,
  p_subject_ids uuid[],
  p_guardian_name text default null,
  p_guardian_phone text default null,
  p_notes text default null,
  p_photo_path text default null,
  p_pack_id uuid default null,
  p_billing_day smallint default null
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

  if p_billing_day is not null and p_billing_day not in (1, 15) then
    raise exception 'Le cycle de paiement doit être le 1er ou le 15.' using errcode = '22023';
  end if;

  if p_pack_id is not null then
    if coalesce(array_length(p_subject_ids, 1), 0) > 0 then
      raise exception 'Choisissez un pack ou des matières à l''unité, pas les deux.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.packs p where p.id = p_pack_id and p.level_id = p_level_id and p.active) then
      raise exception 'Le pack doit appartenir au niveau choisi.' using errcode = '22023';
    end if;
  else
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

  if p_pack_id is not null then
    -- Prix = tarif du pack ; matières et première facture créées par trigger.
    insert into public.pack_enrollments (student_id, pack_id, start_date, billing_day)
    values (p_student_id, p_pack_id, private.today(), p_billing_day);
  else
    -- Prix convenu = tarif de la matière (trigger enrollments_before_write).
    insert into public.enrollments (student_id, subject_id, start_date, billing_day)
    select p_student_id, sid, private.today(), p_billing_day
    from (select distinct unnest(p_subject_ids) as sid) as subjects;
  end if;

  return p_student_id;
end;
$$;

revoke execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid, smallint) from public, anon;
grant execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------
-- Notes d'élève : date et auteur de la dernière modification
-- ---------------------------------------------------------------------
alter table public.students
  add column notes_updated_at timestamptz,
  add column notes_updated_by uuid references public.profiles (id) on delete set null;

create function private.students_track_notes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.notes is not null then
      new.notes_updated_at := now();
      new.notes_updated_by := coalesce(new.created_by, (select auth.uid()));
    end if;
  elsif new.notes is distinct from old.notes then
    new.notes_updated_at := now();
    new.notes_updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger students_track_notes
before insert or update of notes on public.students
for each row execute function private.students_track_notes();

update public.students set notes_updated_at = created_at, notes_updated_by = created_by where notes is not null;

-- >>> 20261002090000_platform_schema.sql
-- =====================================================================
-- CentroManager — 015 : schéma de la plateforme (super-admin)
--
-- Phase 1 : modèle de données uniquement (aucun écran).
--  * rôle super_admin (utilisé à partir de la phase 2) ;
--  * centres : slug, statut, échéance, tarif, type d'établissement,
--    contact du directeur, notes internes ;
--  * types d'établissement et vocabulaire (singulier, pluriel, genre) ;
--  * marque blanche (center_branding) ;
--  * abonnements, paiements d'abonnement ;
--  * journal d'audit platform_events, alimenté par triggers : toute
--    modification des données plateforme y est tracée, quel que soit
--    le chemin (console, job quotidien, service_role).
--
-- Sécurité :
--  * les colonnes plateforme de centers (échéance, tarif, contact, notes)
--    ne sont ni lisibles ni modifiables par les comptes d'un centre :
--    privilèges par colonne (l'admin de centre ne peut renommer que son
--    centre) ;
--  * subscriptions, subscription_payments et platform_events : RLS activée,
--    aucune policy côté centre ; accès réservé aux fonctions de la
--    plateforme (phase 2 et suivantes).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
alter type public.user_role add value if not exists 'super_admin';

create type public.center_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');
create type public.subscription_plan as enum ('standard', 'white_label');
-- Durée facturée : un mois ou une année (choisie par le super-admin).
create type public.billing_interval as enum ('month', 'year');
create type public.subscription_payment_method as enum ('bank_transfer', 'cash', 'card');

-- ---------------------------------------------------------------------
-- Vocabulaire
-- ---------------------------------------------------------------------
-- Clés de vocabulaire : apprenant, groupe, cours, encadrant, session.
-- Chaque terme : {"singular": "...", "plural": "...", "gender": "m" | "f"}.
create function private.valid_term(p_term jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_term) = 'object'
     and length(btrim(coalesce(p_term ->> 'singular', ''))) between 1 and 60
     and length(btrim(coalesce(p_term ->> 'plural', ''))) between 1 and 60
     and coalesce(p_term ->> 'gender', '') in ('m', 'f');
$$;

-- p_complete : toutes les clés sont exigées (types) ; sinon, surcharge
-- partielle (vocabulaire personnalisé d'un centre).
create function private.valid_terms(p_terms jsonb, p_complete boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_terms) = 'object'
     and not exists (
       select 1 from jsonb_each(p_terms) e
       where e.key not in ('learner', 'group', 'course', 'instructor', 'session')
          or not private.valid_term(e.value)
     )
     and (not p_complete or p_terms ?& array['learner', 'group', 'course', 'instructor', 'session']);
$$;

create table public.center_types (
  code text primary key check (code ~ '^[a-z_]+$'),
  label text not null check (length(btrim(label)) > 0),
  -- Vocabulaire par défaut ; pour « Personnalisé », simple repli neutre.
  terms jsonb not null check (private.valid_terms(terms, true)),
  -- Type « Personnalisé » : le super-admin saisit chaque terme par centre.
  is_custom boolean not null default false,
  sort_order smallint not null default 0
);

comment on table public.center_types is
  'Types d''établissement et vocabulaire de l''interface (couche de présentation uniquement).';

insert into public.center_types (code, label, sort_order, is_custom, terms) values
  ('soutien_scolaire', 'Soutien scolaire', 1, false, '{
    "learner":    {"singular": "Élève", "plural": "Élèves", "gender": "m"},
    "group":      {"singular": "Niveau", "plural": "Niveaux", "gender": "m"},
    "course":     {"singular": "Matière", "plural": "Matières", "gender": "f"},
    "instructor": {"singular": "Professeur", "plural": "Professeurs", "gender": "m"},
    "session":    {"singular": "Séance", "plural": "Séances", "gender": "f"}}'),
  ('centre_formation', 'Centre de formation', 2, false, '{
    "learner":    {"singular": "Stagiaire", "plural": "Stagiaires", "gender": "m"},
    "group":      {"singular": "Promotion", "plural": "Promotions", "gender": "f"},
    "course":     {"singular": "Module", "plural": "Modules", "gender": "m"},
    "instructor": {"singular": "Formateur", "plural": "Formateurs", "gender": "m"},
    "session":    {"singular": "Session", "plural": "Sessions", "gender": "f"}}'),
  ('institut_langue', 'Institut de langue', 3, false, '{
    "learner":    {"singular": "Apprenant", "plural": "Apprenants", "gender": "m"},
    "group":      {"singular": "Groupe de niveau", "plural": "Groupes de niveau", "gender": "m"},
    "course":     {"singular": "Langue", "plural": "Langues", "gender": "f"},
    "instructor": {"singular": "Enseignant", "plural": "Enseignants", "gender": "m"},
    "session":    {"singular": "Cours", "plural": "Cours", "gender": "m"}}'),
  ('auto_ecole', 'Auto-école', 4, false, '{
    "learner":    {"singular": "Candidat", "plural": "Candidats", "gender": "m"},
    "group":      {"singular": "Catégorie de permis", "plural": "Catégories de permis", "gender": "f"},
    "course":     {"singular": "Type de leçon", "plural": "Types de leçon", "gender": "m"},
    "instructor": {"singular": "Moniteur", "plural": "Moniteurs", "gender": "m"},
    "session":    {"singular": "Leçon", "plural": "Leçons", "gender": "f"}}'),
  ('soutien_universitaire', 'Centre de soutien universitaire', 5, false, '{
    "learner":    {"singular": "Étudiant", "plural": "Étudiants", "gender": "m"},
    "group":      {"singular": "Filière", "plural": "Filières", "gender": "f"},
    "course":     {"singular": "Unité d''enseignement", "plural": "Unités d''enseignement", "gender": "f"},
    "instructor": {"singular": "Chargé de TD", "plural": "Chargés de TD", "gender": "m"},
    "session":    {"singular": "Séance", "plural": "Séances", "gender": "f"}}'),
  ('personnalise', 'Personnalisé', 6, true, '{
    "learner":    {"singular": "Apprenant", "plural": "Apprenants", "gender": "m"},
    "group":      {"singular": "Groupe", "plural": "Groupes", "gender": "m"},
    "course":     {"singular": "Cours", "plural": "Cours", "gender": "m"},
    "instructor": {"singular": "Encadrant", "plural": "Encadrants", "gender": "m"},
    "session":    {"singular": "Séance", "plural": "Séances", "gender": "f"}}');

-- ---------------------------------------------------------------------
-- Centres : colonnes plateforme
-- ---------------------------------------------------------------------
-- Slug (sous-domaine) : minuscules, chiffres et tirets.
create function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      translate(lower(coalesce(p_text, '')),
        'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'),
      '[^a-z0-9]+', '-', 'g'),
    '-');
$$;

alter table public.centers
  add column slug text,
  add column status public.center_status not null default 'trial',
  add column activated_at timestamptz,
  add column current_period_end date,
  add column grace_days smallint not null default 5 check (grace_days between 0 and 60),
  -- Tarif par durée facturée (mois ou année), en MAD ; nul tant qu'il n'est pas fixé.
  add column price numeric(10, 2) check (price >= 0),
  add column billing_interval public.billing_interval not null default 'month',
  add column center_type text not null default 'soutien_scolaire' references public.center_types (code),
  -- Surcharge du vocabulaire (type « Personnalisé » surtout).
  add column custom_terms jsonb not null default '{}' check (private.valid_terms(custom_terms, false)),
  add column owner_contact_name text,
  add column owner_contact_phone text,
  add column owner_contact_email text check (owner_contact_email is null or owner_contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Notes internes du propriétaire de la plateforme (jamais visibles du centre).
  add column notes text,
  add column cancelled_at timestamptz;

-- Centres existants : en service.
update public.centers
set slug = coalesce(nullif(private.slugify(name), ''), 'centre') || case when n > 1 then '-' || n else '' end,
    status = 'active',
    activated_at = created_at
from (
  select id as cid, row_number() over (partition by private.slugify(name) order by created_at, id) as n
  from public.centers
) ranked
where ranked.cid = centers.id;

alter table public.centers
  alter column slug set not null,
  add constraint centers_slug_key unique (slug),
  add constraint centers_slug_format_check check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and length(slug) between 2 and 63
    -- Réservés : console et services de la plateforme.
    and slug not in ('www', 'app', 'api', 'admin', 'platform', 'plateforme', 'mail', 'static', 'assets')
  ),
  add constraint centers_cancelled_at_check check ((status = 'cancelled') = (cancelled_at is not null));

create index centers_status_idx on public.centers (status);
create index centers_center_type_idx on public.centers (center_type);

-- Slug par défaut, dérivé du nom et rendu unique.
create function private.centers_default_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  if new.slug is not null then
    return new;
  end if;
  v_base := left(nullif(private.slugify(new.name), ''), 56);
  if v_base is null or length(v_base) < 2 then
    v_base := 'centre';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.centers c where c.slug = v_slug)
     or v_slug in ('www', 'app', 'api', 'admin', 'platform', 'plateforme', 'mail', 'static', 'assets') loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  new.slug := v_slug;
  return new;
end;
$$;

create trigger centers_default_slug
before insert on public.centers
for each row execute function private.centers_default_slug();

-- Privilèges par colonne : un compte de centre ne lit que les colonnes
-- utiles à l'interface et ne peut modifier que le nom de son centre.
-- Les colonnes ajoutées plus tard restent invisibles par défaut.
revoke select, insert, update, delete on public.centers from authenticated;
grant select (id, name, created_at, slug, status, center_type, custom_terms) on public.centers to authenticated;
grant update (name) on public.centers to authenticated;

-- ---------------------------------------------------------------------
-- Marque blanche
-- ---------------------------------------------------------------------
create table public.center_branding (
  center_id uuid primary key references public.centers (id) on delete cascade,
  brand_name text check (brand_name is null or length(btrim(brand_name)) between 1 and 80),
  logo_url text,
  favicon_url text,
  primary_color text check (primary_color is null or primary_color ~* '^#[0-9a-f]{6}$'),
  secondary_color text check (secondary_color is null or secondary_color ~* '^#[0-9a-f]{6}$'),
  accent_color text check (accent_color is null or accent_color ~* '^#[0-9a-f]{6}$'),
  login_background_url text,
  email_sender_name text,
  support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  support_phone text,
  custom_domain text check (custom_domain is null or custom_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'),
  domain_verified boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint center_branding_domain_verified_check check (custom_domain is not null or not domain_verified)
);

create unique index center_branding_custom_domain_key on public.center_branding (custom_domain) where custom_domain is not null;

comment on table public.center_branding is
  'Marque blanche : appliquée uniquement aux centres en formule white_label.';

-- ---------------------------------------------------------------------
-- Abonnements
-- ---------------------------------------------------------------------
-- Un abonnement par centre. Statut, tarif et échéance recopiés depuis
-- centers (source de vérité) par trigger ; la formule vit ici.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null unique references public.centers (id) on delete cascade,
  plan public.subscription_plan not null default 'standard',
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  billing_interval public.billing_interval not null default 'month',
  started_at date not null default private.today(),
  current_period_start date,
  current_period_end date,
  status public.center_status not null default 'trial',
  auto_renew boolean not null default true,
  created_at timestamptz not null default now(),
  check (current_period_start is null or current_period_end is null or current_period_start < current_period_end)
);

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  paid_at date not null default private.today(),
  period_covered_start date,
  period_covered_end date,
  method public.subscription_payment_method not null,
  reference text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_covered_start is null or period_covered_end is null or period_covered_start < period_covered_end)
);

create index subscription_payments_center_paid_idx on public.subscription_payments (center_id, paid_at desc);
create index subscription_payments_paid_at_idx on public.subscription_payments (paid_at);

-- ---------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------
create table public.platform_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- Nul pour les actions automatiques (job quotidien).
  actor_id uuid references auth.users (id) on delete set null,
  center_id uuid references public.centers (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  payload jsonb not null default '{}'
);

create index platform_events_center_idx on public.platform_events (center_id, occurred_at desc);
create index platform_events_occurred_idx on public.platform_events (occurred_at desc);

comment on table public.platform_events is
  'Journal d''audit de la plateforme (append-only) : créations, statuts, échéances, formules, paiements, accès support.';

create function private.log_platform_event(p_center_id uuid, p_action text, p_payload jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_events (actor_id, center_id, action, payload)
  values ((select auth.uid()), p_center_id, p_action, coalesce(p_payload, '{}'));
$$;

-- Append-only, même pour les fonctions internes.
create function private.platform_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Le journal de la plateforme ne peut pas être modifié.' using errcode = '42501';
end;
$$;

create trigger platform_events_append_only
before update or delete on public.platform_events
for each row execute function private.platform_events_append_only();

-- ---------------------------------------------------------------------
-- Synchronisation et audit
-- ---------------------------------------------------------------------
-- Centre créé ou modifié : abonnement recopié, changements journalisés.
create function private.centers_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscriptions (center_id, amount, billing_interval, current_period_end, status)
    values (new.id, coalesce(new.price, 0), new.billing_interval, new.current_period_end, new.status)
    on conflict (center_id) do nothing;
    perform private.log_platform_event(new.id, 'center.created',
      jsonb_build_object('name', new.name, 'slug', new.slug, 'status', new.status, 'center_type', new.center_type));
    return new;
  end if;

  update public.subscriptions s
  set amount = coalesce(new.price, 0),
      billing_interval = new.billing_interval,
      current_period_end = new.current_period_end,
      status = new.status
  where s.center_id = new.id
    and (s.amount, s.billing_interval, s.current_period_end, s.status)
        is distinct from (coalesce(new.price, 0), new.billing_interval, new.current_period_end, new.status);

  if new.status is distinct from old.status then
    perform private.log_platform_event(new.id, 'center.status_changed',
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.current_period_end is distinct from old.current_period_end then
    perform private.log_platform_event(new.id, 'center.period_changed',
      jsonb_build_object('from', old.current_period_end, 'to', new.current_period_end));
  end if;
  if new.center_type is distinct from old.center_type or new.custom_terms is distinct from old.custom_terms then
    perform private.log_platform_event(new.id, 'center.vocabulary_changed',
      jsonb_build_object('from', old.center_type, 'to', new.center_type));
  end if;
  if (new.price, new.billing_interval, new.grace_days) is distinct from (old.price, old.billing_interval, old.grace_days) then
    perform private.log_platform_event(new.id, 'center.pricing_changed',
      jsonb_build_object('price', new.price, 'billing_interval', new.billing_interval, 'grace_days', new.grace_days));
  end if;
  if (new.slug, new.name) is distinct from (old.slug, old.name) then
    perform private.log_platform_event(new.id, 'center.identity_changed',
      jsonb_build_object('name', new.name, 'slug', new.slug));
  end if;
  return new;
end;
$$;

create trigger centers_after_write
after insert or update on public.centers
for each row execute function private.centers_after_write();

-- Statut « annulé » : date d'annulation renseignée automatiquement.
create function private.centers_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;
  if new.status in ('active', 'past_due') and new.activated_at is null then
    new.activated_at := now();
  end if;
  return new;
end;
$$;

create trigger centers_before_update
before update on public.centers
for each row execute function private.centers_before_update();

create function private.subscriptions_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan is distinct from old.plan then
    perform private.log_platform_event(new.center_id, 'subscription.plan_changed',
      jsonb_build_object('from', old.plan, 'to', new.plan));
  end if;
  if new.auto_renew is distinct from old.auto_renew then
    perform private.log_platform_event(new.center_id, 'subscription.auto_renew_changed',
      jsonb_build_object('auto_renew', new.auto_renew));
  end if;
  return new;
end;
$$;

create trigger subscriptions_after_update
after update on public.subscriptions
for each row execute function private.subscriptions_after_update();

-- Paiement d'abonnement : période couverte d'un mois (ou d'un an) à partir de
-- l'échéance en cours (ou de la date de paiement si aucune échéance),
-- échéance repoussée, centre remis en service. Un centre annulé
-- n'encaisse plus de paiement.
create function private.subscription_payments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
begin
  select * into v_center from public.centers c where c.id = new.center_id for update;
  if v_center.status = 'cancelled' then
    raise exception 'Centre résilié : aucun paiement ne peut être enregistré.' using errcode = '22023';
  end if;

  new.period_covered_start := coalesce(new.period_covered_start, v_center.current_period_end, new.paid_at);
  new.period_covered_end := coalesce(new.period_covered_end, (new.period_covered_start
    + case v_center.billing_interval when 'year' then interval '1 year' else interval '1 month' end)::date);
  new.recorded_by := coalesce(new.recorded_by, (select auth.uid()));
  return new;
end;
$$;

create trigger subscription_payments_before_insert
before insert on public.subscription_payments
for each row execute function private.subscription_payments_before_insert();

create function private.subscription_payments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.centers c
  set current_period_end = greatest(coalesce(c.current_period_end, new.period_covered_end), new.period_covered_end),
      status = 'active',
      activated_at = coalesce(c.activated_at, now())
  where c.id = new.center_id;

  update public.subscriptions s
  set current_period_start = new.period_covered_start
  where s.center_id = new.center_id
    and (s.current_period_start is null or s.current_period_start < new.period_covered_start);

  perform private.log_platform_event(new.center_id, 'subscription.payment_recorded',
    jsonb_build_object(
      'payment_id', new.id, 'amount', new.amount, 'method', new.method, 'reference', new.reference,
      'period_start', new.period_covered_start, 'period_end', new.period_covered_end));
  return new;
end;
$$;

create trigger subscription_payments_after_insert
after insert on public.subscription_payments
for each row execute function private.subscription_payments_after_insert();

-- Paiements : jamais modifiés ni supprimés (correction = écriture d'annulation future).
create trigger subscription_payments_append_only
before update or delete on public.subscription_payments
for each row execute function private.platform_events_append_only();

create function private.center_branding_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  perform private.log_platform_event(new.center_id, 'branding.updated',
    jsonb_build_object('brand_name', new.brand_name, 'custom_domain', new.custom_domain, 'domain_verified', new.domain_verified));
  return new;
end;
$$;

create trigger center_branding_before_write
before insert or update on public.center_branding
for each row execute function private.center_branding_before_write();

-- Abonnements des centres existants.
insert into public.subscriptions (center_id, amount, billing_interval, started_at, current_period_end, status)
select c.id, coalesce(c.price, 0), c.billing_interval, (c.created_at at time zone 'Africa/Casablanca')::date, c.current_period_end, c.status
from public.centers c
on conflict (center_id) do nothing;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.center_types enable row level security;
alter table public.center_branding enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.platform_events enable row level security;

-- Types et vocabulaire : lecture pour tout compte connecté.
create policy center_types_select on public.center_types
for select to authenticated
using (true);

-- Marque : lue par les comptes du centre (affichage de l'interface).
create policy center_branding_select on public.center_branding
for select to authenticated
using (center_id = (select private.auth_center_id()));

-- subscriptions, subscription_payments, platform_events : aucune policy
-- côté centre. Écritures uniquement via fonctions de la plateforme.
revoke all on public.center_types, public.center_branding, public.subscriptions,
  public.subscription_payments, public.platform_events from anon;
revoke insert, update, delete on public.center_types, public.center_branding from authenticated;
revoke all on public.subscriptions, public.subscription_payments, public.platform_events from authenticated;

revoke all on function private.log_platform_event(uuid, text, jsonb) from public, anon, authenticated;

-- >>> 20261003090000_platform_access.sql
-- =====================================================================
-- CentroManager — 016 : accès super-admin et console en lecture
--
--  * un super-admin n'appartient à aucun centre (center_id nul) ; tout
--    autre rôle appartient à un centre. Un admin de centre ne peut donc
--    ni créer ni promouvoir un super-admin (contrainte) ;
--  * le super-admin ne passe par aucune policy des tables métier : ses
--    lectures passent par les fonctions platform_* ci-dessous
--    (SECURITY DEFINER), qui refusent tout autre compte ;
--  * aucun compte de centre ne peut lire un profil super-admin (les
--    policies de profiles filtrent par centre).
-- =====================================================================

alter table public.profiles alter column center_id drop not null;
alter table public.profiles
  add constraint profiles_super_admin_center_check check ((role = 'super_admin') = (center_id is null));

-- Hook JWT : center_id nul pour le super-admin. jsonb_set avec une valeur
-- SQL NULL rendrait tous les claims nuls (connexion impossible) : la clé
-- reçoit donc le JSON null.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_role public.user_role;
  v_center_id uuid;
  v_active boolean;
begin
  select p.role, p.center_id, p.active
    into v_role, v_center_id, v_active
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  if v_role is null then
    -- Compte Auth sans profil : aucun accès applicatif.
    v_claims := v_claims - 'user_role' - 'center_id';
    v_claims := jsonb_set(v_claims, '{profile_active}', 'false'::jsonb);
  else
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{center_id}', coalesce(to_jsonb(v_center_id), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

create function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.role = 'super_admin'
  );
$$;

create function private.require_super_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Accès réservé à la plateforme.' using errcode = '42501';
  end if;
end;
$$;

-- Tarif ramené au mois (revenu mensuel récurrent).
create function private.monthly_equivalent(p_price numeric, p_interval public.billing_interval)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(p_price, 0) / case p_interval when 'year' then 12 else 1 end, 2);
$$;

-- ---------------------------------------------------------------------
-- Tableau de bord
-- ---------------------------------------------------------------------
create function public.platform_overview()
returns table (
  trial_count integer,
  active_count integer,
  past_due_count integer,
  suspended_count integer,
  cancelled_count integer,
  monthly_recurring_revenue numeric,
  collected_this_month numeric,
  students_count integer,
  users_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', private.today())::date;
begin
  perform private.require_super_admin();
  return query
  select
    count(*) filter (where c.status = 'trial')::integer,
    count(*) filter (where c.status = 'active')::integer,
    count(*) filter (where c.status = 'past_due')::integer,
    count(*) filter (where c.status = 'suspended')::integer,
    count(*) filter (where c.status = 'cancelled')::integer,
    coalesce(sum(private.monthly_equivalent(c.price, c.billing_interval)) filter (where c.status in ('active', 'past_due')), 0),
    (select coalesce(sum(p.amount), 0) from public.subscription_payments p
      where p.paid_at >= v_month_start and p.paid_at < (v_month_start + interval '1 month')::date),
    (select count(*)::integer from public.students s),
    (select count(*)::integer from public.profiles p where p.role <> 'super_admin')
  from public.centers c;
end;
$$;

-- Centres dont l'échéance est dépassée, du retard le plus ancien au plus récent.
create function public.platform_overdue_centers()
returns table (
  center_id uuid,
  name text,
  status public.center_status,
  current_period_end date,
  days_overdue integer,
  amount_due numeric,
  billing_interval public.billing_interval,
  owner_contact_name text,
  owner_contact_phone text,
  owner_contact_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.status, c.current_period_end, (private.today() - c.current_period_end)::integer,
         coalesce(c.price, 0), c.billing_interval,
         c.owner_contact_name, c.owner_contact_phone, c.owner_contact_email
  from public.centers c
  where c.current_period_end < private.today()
    and c.status <> 'cancelled'
  order by c.current_period_end, c.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Centres
-- ---------------------------------------------------------------------
create function public.platform_centers()
returns table (
  center_id uuid,
  name text,
  slug text,
  center_type text,
  center_type_label text,
  plan public.subscription_plan,
  status public.center_status,
  activated_at timestamptz,
  current_period_end date,
  -- Positif : jours restants ; négatif : jours de retard ; nul sans échéance.
  days_remaining integer,
  students_count integer,
  price numeric,
  billing_interval public.billing_interval,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.slug, c.center_type, t.label, s.plan, c.status, c.activated_at, c.current_period_end,
         (c.current_period_end - private.today())::integer,
         (select count(*)::integer from public.students st where st.center_id = c.id),
         c.price, c.billing_interval, c.created_at
  from public.centers c
  join public.center_types t on t.code = c.center_type
  left join public.subscriptions s on s.center_id = c.id
  order by c.name;
end;
$$;

create function public.platform_center(p_center_id uuid)
returns table (
  center_id uuid,
  name text,
  slug text,
  center_type text,
  center_type_label text,
  custom_terms jsonb,
  status public.center_status,
  activated_at timestamptz,
  cancelled_at timestamptz,
  current_period_end date,
  days_remaining integer,
  grace_days smallint,
  price numeric,
  billing_interval public.billing_interval,
  owner_contact_name text,
  owner_contact_phone text,
  owner_contact_email text,
  notes text,
  created_at timestamptz,
  plan public.subscription_plan,
  subscription_started_at date,
  current_period_start date,
  auto_renew boolean,
  students_count integer,
  users_count integer,
  branding jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.slug, c.center_type, t.label, c.custom_terms, c.status, c.activated_at, c.cancelled_at,
         c.current_period_end, (c.current_period_end - private.today())::integer, c.grace_days,
         c.price, c.billing_interval, c.owner_contact_name, c.owner_contact_phone, c.owner_contact_email,
         c.notes, c.created_at, s.plan, s.started_at, s.current_period_start, s.auto_renew,
         (select count(*)::integer from public.students st where st.center_id = c.id),
         (select count(*)::integer from public.profiles p where p.center_id = c.id),
         (select to_jsonb(b) - 'center_id' from public.center_branding b where b.center_id = c.id)
  from public.centers c
  join public.center_types t on t.code = c.center_type
  left join public.subscriptions s on s.center_id = c.id
  where c.id = p_center_id;
end;
$$;

create function public.platform_center_users(p_center_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.user_role,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  -- Invitation ouverte (ou compte créé confirmé) : un lien de mot de passe remplace l'invitation.
  confirmed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select p.id, p.full_name, u.email::text, p.role, p.active, p.created_at, u.last_sign_in_at,
         u.email_confirmed_at is not null
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.center_id = p_center_id
  order by p.role, p.full_name;
end;
$$;

create function public.platform_center_events(p_center_id uuid)
returns table (
  event_id bigint,
  occurred_at timestamptz,
  action text,
  payload jsonb,
  actor_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select e.id, e.occurred_at, e.action, e.payload, p.full_name
  from public.platform_events e
  left join public.profiles p on p.id = e.actor_id
  where e.center_id = p_center_id
  order by e.occurred_at desc, e.id desc
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------
-- Paiements d'abonnement
-- ---------------------------------------------------------------------
-- p_center_id nul : tous les centres.
create function public.platform_payments(p_center_id uuid default null)
returns table (
  payment_id uuid,
  center_id uuid,
  center_name text,
  amount numeric,
  paid_at date,
  period_covered_start date,
  period_covered_end date,
  method public.subscription_payment_method,
  reference text,
  recorded_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select p.id, p.center_id, c.name, p.amount, p.paid_at, p.period_covered_start, p.period_covered_end,
         p.method, p.reference, r.full_name
  from public.subscription_payments p
  join public.centers c on c.id = p.center_id
  left join public.profiles r on r.id = p.recorded_by
  where p_center_id is null or p.center_id = p_center_id
  order by p.paid_at desc, p.created_at desc;
end;
$$;

-- Encaissé par mois (12 derniers mois) ; prévisionnel du mois en cours
-- seulement : échéances du mois des centres en service, au tarif de leur
-- formule (les échéances passées ont été repoussées par les paiements).
create function public.platform_billing_months()
returns table (
  month date,
  collected numeric,
  expected numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current date := date_trunc('month', private.today())::date;
begin
  perform private.require_super_admin();
  return query
  select m::date,
         (select coalesce(sum(p.amount), 0) from public.subscription_payments p
           where p.paid_at >= m::date and p.paid_at < (m + interval '1 month')::date),
         case when m::date = v_current then
           (select coalesce(sum(c.price), 0) from public.centers c
             where c.status in ('active', 'past_due', 'trial')
               and c.current_period_end >= m::date and c.current_period_end < (m + interval '1 month')::date)
         end
  from generate_series(v_current - interval '11 months', v_current, interval '1 month') as m
  order by m desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.platform_overview()',
    'public.platform_overdue_centers()',
    'public.platform_centers()',
    'public.platform_center(uuid)',
    'public.platform_center_users(uuid)',
    'public.platform_center_events(uuid)',
    'public.platform_payments(uuid)',
    'public.platform_billing_months()'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.is_super_admin() from public, anon;
grant execute on function private.is_super_admin() to authenticated;
revoke all on function private.require_super_admin() from public, anon;
grant execute on function private.require_super_admin() to authenticated;

-- >>> 20261004090000_platform_actions.sql
-- =====================================================================
-- CentroManager — 017 : actions de la console (super-admin)
--
--  * création d'un centre (identité, type, formule, tarif, activation,
--    première échéance) avec son administrateur, créé en même temps ;
--  * modification des informations, du vocabulaire, du tarif et de la
--    formule, de l'échéance ;
--  * enregistrement d'un paiement (remet le centre en service) ;
--  * suspension, réactivation, résiliation (définitive côté accès).
--
-- Chaque fonction exige un super-admin et passe par les triggers d'audit
-- de la migration 015 ; le motif saisi est ajouté à l'événement journalisé
-- (réglage local à la transaction « centromanager.reason »).
-- =====================================================================

-- Une échéance fixée à la main peut précéder le début de la période payée.
alter table public.subscriptions drop constraint subscriptions_check;

-- ---------------------------------------------------------------------
-- Audit : motif et changements de coordonnées
-- ---------------------------------------------------------------------
create or replace function private.log_platform_event(p_center_id uuid, p_action text, p_payload jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(current_setting('centromanager.reason', true), '')), '');
  v_payload jsonb := coalesce(p_payload, '{}');
begin
  if v_reason is not null and p_action in ('center.status_changed', 'center.period_changed') then
    v_payload := v_payload || jsonb_build_object('reason', v_reason);
  end if;
  insert into public.platform_events (actor_id, center_id, action, payload)
  values ((select auth.uid()), p_center_id, p_action, v_payload);
end;
$$;

revoke all on function private.log_platform_event(uuid, text, jsonb) from public, anon, authenticated;

create function private.set_reason(p_reason text)
returns void
language sql
set search_path = ''
as $$
  select set_config('centromanager.reason', coalesce(p_reason, ''), true);
$$;

create function private.centers_log_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.owner_contact_name, new.owner_contact_phone, new.owner_contact_email, new.notes)
     is distinct from (old.owner_contact_name, old.owner_contact_phone, old.owner_contact_email, old.notes) then
    perform private.log_platform_event(new.id, 'center.details_changed',
      jsonb_build_object('owner_contact_name', new.owner_contact_name,
                         'owner_contact_phone', new.owner_contact_phone,
                         'owner_contact_email', new.owner_contact_email,
                         'notes_changed', new.notes is distinct from old.notes));
  end if;
  return new;
end;
$$;

create trigger centers_log_details
after update on public.centers
for each row execute function private.centers_log_details();

-- ---------------------------------------------------------------------
-- Création d'un centre et de son administrateur
-- ---------------------------------------------------------------------
-- Le compte Auth de l'administrateur est créé au préalable par la Server
-- Action (invitation, clé service_role) ; son profil est créé ici, dans la
-- même transaction que le centre.
create function public.platform_create_center(
  p_name text,
  p_slug text,
  p_center_type text,
  p_custom_terms jsonb,
  p_plan public.subscription_plan,
  p_price numeric,
  p_billing_interval public.billing_interval,
  p_status public.center_status,
  p_activation_date date,
  p_first_period_end date,
  p_grace_days smallint,
  p_owner_contact_name text,
  p_owner_contact_phone text,
  p_owner_contact_email text,
  p_notes text,
  p_admin_user_id uuid,
  p_admin_full_name text,
  p_admin_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
begin
  perform private.require_super_admin();

  if p_status not in ('trial', 'active') then
    raise exception 'Un nouveau centre démarre en essai ou actif.' using errcode = '22023';
  end if;
  if p_first_period_end is not null and p_activation_date is not null and p_first_period_end <= p_activation_date then
    raise exception 'La première échéance doit suivre la date d''activation.' using errcode = '22023';
  end if;
  if exists (select 1 from public.centers c where c.slug = p_slug) then
    raise exception 'Cette adresse est déjà utilisée par un autre centre.' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_admin_user_id) then
    raise exception 'Ce compte appartient déjà à un centre.' using errcode = '22023';
  end if;

  insert into public.centers (
    name, slug, center_type, custom_terms, status, activated_at, current_period_end, grace_days,
    price, billing_interval, owner_contact_name, owner_contact_phone, owner_contact_email, notes
  ) values (
    btrim(p_name), p_slug, p_center_type, coalesce(p_custom_terms, '{}'), p_status,
    case when p_status = 'active' then coalesce(p_activation_date, private.today())::timestamptz end,
    p_first_period_end, coalesce(p_grace_days, 5),
    p_price, p_billing_interval,
    nullif(btrim(p_owner_contact_name), ''), nullif(btrim(p_owner_contact_phone), ''),
    nullif(btrim(p_owner_contact_email), ''), nullif(btrim(p_notes), '')
  )
  returning id into v_center_id;

  update public.subscriptions
  set plan = p_plan,
      started_at = coalesce(p_activation_date, private.today()),
      current_period_start = coalesce(p_activation_date, private.today())
  where center_id = v_center_id;

  insert into public.profiles (id, center_id, full_name, role, phone)
  values (p_admin_user_id, v_center_id, btrim(p_admin_full_name), 'admin', nullif(btrim(p_admin_phone), ''));

  perform private.log_platform_event(v_center_id, 'center.admin_invited',
    jsonb_build_object('full_name', btrim(p_admin_full_name),
                       'email', (select u.email from auth.users u where u.id = p_admin_user_id)));
  return v_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Informations et vocabulaire
-- ---------------------------------------------------------------------
create function public.platform_update_center(
  p_center_id uuid,
  p_name text,
  p_slug text,
  p_center_type text,
  p_custom_terms jsonb,
  p_owner_contact_name text,
  p_owner_contact_phone text,
  p_owner_contact_email text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if exists (select 1 from public.centers c where c.slug = p_slug and c.id <> p_center_id) then
    raise exception 'Cette adresse est déjà utilisée par un autre centre.' using errcode = '23505';
  end if;

  update public.centers
  set name = btrim(p_name),
      slug = p_slug,
      center_type = p_center_type,
      custom_terms = coalesce(p_custom_terms, '{}'),
      owner_contact_name = nullif(btrim(p_owner_contact_name), ''),
      owner_contact_phone = nullif(btrim(p_owner_contact_phone), ''),
      owner_contact_email = nullif(btrim(p_owner_contact_email), ''),
      notes = nullif(btrim(p_notes), '')
  where id = p_center_id;
  if not found then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Formule et tarif
-- ---------------------------------------------------------------------
create function public.platform_set_pricing(
  p_center_id uuid,
  p_plan public.subscription_plan,
  p_price numeric,
  p_billing_interval public.billing_interval,
  p_grace_days smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  update public.centers
  set price = p_price, billing_interval = p_billing_interval, grace_days = p_grace_days
  where id = p_center_id;
  if not found then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  update public.subscriptions set plan = p_plan where center_id = p_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Échéance
-- ---------------------------------------------------------------------
-- Fixer ou prolonger l'échéance. Un centre en retard dont l'échéance
-- redevient future repasse actif ; une suspension se lève explicitement
-- (réactivation ou paiement).
create function public.platform_set_due_date(p_center_id uuid, p_due_date date, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  perform private.set_reason(p_reason);
  update public.centers
  set current_period_end = p_due_date,
      status = case when status = 'past_due' and p_due_date >= private.today() then 'active'::public.center_status else status end
  where id = p_center_id and status <> 'cancelled';
  if not found then
    raise exception 'Centre introuvable ou résilié.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Paiement d'abonnement
-- ---------------------------------------------------------------------
create function public.platform_record_payment(
  p_center_id uuid,
  p_amount numeric,
  p_paid_at date,
  p_method public.subscription_payment_method,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  perform private.require_super_admin();
  if p_paid_at > private.today() then
    raise exception 'La date de paiement ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  insert into public.subscription_payments (center_id, amount, paid_at, method, reference, recorded_by)
  values (p_center_id, p_amount, p_paid_at, p_method, nullif(btrim(p_reference), ''), (select auth.uid()))
  returning id into v_payment_id;
  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Statut
-- ---------------------------------------------------------------------
create function public.platform_set_status(p_center_id uuid, p_status public.center_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.center_status;
begin
  perform private.require_super_admin();
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez un motif.' using errcode = '22023';
  end if;
  if p_status not in ('active', 'suspended', 'cancelled') then
    raise exception 'Statut non modifiable manuellement.' using errcode = '22023';
  end if;

  select c.status into v_current from public.centers c where c.id = p_center_id for update;
  if v_current is null then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  if v_current = 'cancelled' then
    raise exception 'Centre résilié : la résiliation est définitive.' using errcode = '22023';
  end if;
  if v_current = p_status then
    return;
  end if;

  perform private.set_reason(btrim(p_reason));
  update public.centers set status = p_status where id = p_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Invitation renvoyée ou lien de mot de passe envoyé (journal uniquement :
-- l'envoi est fait par la Server Action, avec la clé service_role).
-- ---------------------------------------------------------------------
create function public.platform_log_invitation(p_center_id uuid, p_user_id uuid, p_password_link boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.center_id = p_center_id) then
    raise exception 'Compte introuvable dans ce centre.' using errcode = 'P0002';
  end if;
  perform private.log_platform_event(p_center_id,
    case when p_password_link then 'center.password_link_sent' else 'center.admin_invited' end,
    jsonb_build_object('email', (select u.email from auth.users u where u.id = p_user_id), 'resent', true));
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.platform_create_center(text, text, text, jsonb, public.subscription_plan, numeric, public.billing_interval, public.center_status, date, date, smallint, text, text, text, text, uuid, text, text)',
    'public.platform_update_center(uuid, text, text, text, jsonb, text, text, text, text)',
    'public.platform_set_pricing(uuid, public.subscription_plan, numeric, public.billing_interval, smallint)',
    'public.platform_set_due_date(uuid, date, text)',
    'public.platform_record_payment(uuid, numeric, date, public.subscription_payment_method, text)',
    'public.platform_set_status(uuid, public.center_status, text)',
    'public.platform_log_invitation(uuid, uuid, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.set_reason(text) from public, anon, authenticated;

-- >>> 20261005090000_platform_lifecycle.sql
-- =====================================================================
-- CentroManager — 018 : cycle de vie des centres, blocage, support
--
-- Règles validées :
--  * job quotidien : échéance dépassée → past_due ; échéance + délai de
--    grâce dépassés → suspended (jamais pour un centre résilié). Un
--    paiement remet le centre en service (migration 015) ;
--  * centre suspendu ou résilié : tous ses comptes perdent l'accès aux
--    données, appliqué par la RLS (private.auth_center_id / auth_role
--    renvoient NULL) et non seulement par l'interface ; les données ne
--    sont jamais supprimées ;
--  * rappels par courriel (J-7, J-1, jour J, suspension) et récapitulatif
--    quotidien du propriétaire : préparés dans platform_notifications ;
--    l'envoi sera branché quand un service de courriel sera choisi ;
--  * connexion de support : le super-admin ouvre une session limitée dans
--    le temps sur un centre ; il lit les données comme un admin, toute
--    écriture est refusée par trigger (lecture seule), tout est journalisé ;
--  * contact affiché sur l'écran de suspension : réglages de la plateforme.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Réglages de la plateforme
-- ---------------------------------------------------------------------
create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  support_name text,
  support_phone text,
  support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (1);

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

-- ---------------------------------------------------------------------
-- Sessions de support (lecture seule)
-- ---------------------------------------------------------------------
create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  center_id uuid not null references public.centers (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 300),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  check (expires_at > started_at)
);

create index support_sessions_actor_open_idx on public.support_sessions (actor_id) where ended_at is null;

alter table public.support_sessions enable row level security;
revoke all on public.support_sessions from anon, authenticated;

-- Centre consulté en support par le super-admin connecté (NULL sinon).
create function private.support_center_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id
  from public.support_sessions s
  join public.profiles p on p.id = s.actor_id and p.role = 'super_admin' and p.active
  where s.actor_id = (select auth.uid())
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Accès : centre bloqué → aucun centre ni rôle (toutes les policies
-- métier refusent). Super-admin en support → centre consulté, rôle admin.
-- ---------------------------------------------------------------------
create or replace function private.auth_center_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.center_id
       from public.profiles p
       join public.centers c on c.id = p.center_id
      where p.id = (select auth.uid()) and p.active
        and c.status not in ('suspended', 'cancelled')),
    private.support_center_id()
  );
$$;

create or replace function private.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.role = 'super_admin' and private.support_center_id() is not null then 'admin'::public.user_role
           else p.role
         end
  from public.profiles p
  left join public.centers c on c.id = p.center_id
  where p.id = (select auth.uid()) and p.active
    and (p.role = 'super_admin' or c.status not in ('suspended', 'cancelled'));
$$;

-- ---------------------------------------------------------------------
-- Lecture seule en support : triggers sur toutes les tables métier.
-- Les actions de la console (fonctions platform_*) restent possibles :
-- private.require_super_admin() les signale pour la transaction.
-- ---------------------------------------------------------------------
create or replace function private.require_super_admin()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Accès réservé à la plateforme.' using errcode = '42501';
  end if;
  perform set_config('centromanager.platform_action', 'on', true);
end;
$$;

create function private.in_support_write()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and coalesce(current_setting('centromanager.platform_action', true), '') <> 'on'
     and private.support_center_id() is not null;
$$;

create function private.deny_support_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.in_support_write() then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'alerts', 'attendance', 'center_branding', 'centers', 'enrollments', 'follow_ups', 'invoices', 'levels',
    'pack_enrollments', 'pack_subjects', 'packs', 'profiles', 'schedule_slots', 'students', 'subjects',
    'teacher_assignments'
  ] loop
    execute format(
      'create trigger deny_support_writes before insert or update or delete on public.%I
         for each row execute function private.deny_support_writes()', v_table);
  end loop;
end;
$$;

-- Photos : aucun dépôt en support.
create or replace function private.can_write_staff_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.in_support_write()
    and (storage.foldername(p_name))[1] = private.auth_center_id()::text
    and (
      private.is_admin()
      or (storage.foldername(p_name))[2] = (select auth.uid())::text
    );
$$;

drop policy student_photos_insert_staff on storage.objects;
create policy student_photos_insert_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_staff())
  and not (select private.in_support_write())
);

drop policy student_photos_update_admin on storage.objects;
create policy student_photos_update_admin on storage.objects
for update to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_admin())
  and not (select private.in_support_write())
)
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
);

drop policy student_photos_delete_admin on storage.objects;
create policy student_photos_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_admin())
  and not (select private.in_support_write())
);

-- ---------------------------------------------------------------------
-- Hook JWT : statut du centre (redirection rapide du proxy vers l'écran
-- de suspension ; la RLS et la garde serveur font foi).
-- ---------------------------------------------------------------------
grant select (id, status) on public.centers to supabase_auth_admin;

create policy centers_select_auth_admin on public.centers
for select to supabase_auth_admin
using (true);

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_role public.user_role;
  v_center_id uuid;
  v_active boolean;
  v_status public.center_status;
begin
  select p.role, p.center_id, p.active, c.status
    into v_role, v_center_id, v_active, v_status
  from public.profiles p
  left join public.centers c on c.id = p.center_id
  where p.id = (event ->> 'user_id')::uuid;

  if v_role is null then
    -- Compte Auth sans profil : aucun accès applicatif.
    v_claims := v_claims - 'user_role' - 'center_id' - 'center_status';
    v_claims := jsonb_set(v_claims, '{profile_active}', 'false'::jsonb);
  else
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{center_id}', coalesce(to_jsonb(v_center_id), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{center_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- ---------------------------------------------------------------------
-- État d'accès du compte connecté (écran de suspension, bandeaux)
-- ---------------------------------------------------------------------
create function public.my_center_access()
returns table (
  center_id uuid,
  center_name text,
  status public.center_status,
  blocked boolean,
  -- Détails d'échéance : administrateur du centre uniquement.
  current_period_end date,
  suspension_date date,
  days_before_suspension integer,
  support_mode boolean,
  support_expires_at timestamptz,
  contact_name text,
  contact_phone text,
  contact_email text,
  -- Vocabulaire de l'interface : termes du type, surchargés par les termes personnalisés.
  vocabulary jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.role, p.center_id from public.profiles p where p.id = (select auth.uid()) and p.active
  ),
  support as (
    select s.center_id, s.expires_at
    from public.support_sessions s
    join me on me.id = s.actor_id and me.role = 'super_admin'
    where s.ended_at is null and s.expires_at > now()
    order by s.started_at desc
    limit 1
  ),
  target as (
    select coalesce(me.center_id, (select support.center_id from support)) as center_id,
           me.role = 'admin' or exists (select 1 from support) as sees_billing
    from me
  )
  select c.id, c.name, c.status, c.status in ('suspended', 'cancelled'),
         case when t.sees_billing then c.current_period_end end,
         case when t.sees_billing then c.current_period_end + c.grace_days end,
         case when t.sees_billing then (c.current_period_end + c.grace_days - private.today())::integer end,
         exists (select 1 from support), (select support.expires_at from support),
         s.support_name, s.support_phone, s.support_email,
         ty.terms || c.custom_terms
  from target t
  join public.centers c on c.id = t.center_id
  join public.center_types ty on ty.code = c.center_type
  cross join public.platform_settings s;
$$;

-- ---------------------------------------------------------------------
-- Cycle de vie quotidien
-- ---------------------------------------------------------------------
create table public.platform_notifications (
  id bigint generated always as identity primary key,
  -- NULL : récapitulatif du propriétaire de la plateforme.
  center_id uuid references public.centers (id) on delete cascade,
  kind text not null check (kind in ('due_in_7', 'due_in_1', 'due_today', 'suspended', 'owner_digest')),
  scheduled_for date not null,
  recipient text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index platform_notifications_once_idx
  on public.platform_notifications (kind, coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid), scheduled_for);
create index platform_notifications_pending_idx on public.platform_notifications (scheduled_for) where sent_at is null;

alter table public.platform_notifications enable row level security;
revoke all on public.platform_notifications from anon, authenticated;

comment on table public.platform_notifications is
  'Courriels de la plateforme préparés par le job quotidien (rappels d''échéance, suspension, récapitulatif). Envoi : à brancher.';

-- Statuts : retard, puis suspension. Renvoie les centres passés en retard
-- et suspendus ce jour.
create function private.update_center_statuses(p_date date default private.today())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_past_due uuid[];
  v_suspended uuid[];
begin
  perform set_config('centromanager.reason', 'Automatique : échéance dépassée', true);

  with changed as (
    update public.centers c
    set status = 'suspended'
    where c.status in ('trial', 'active', 'past_due')
      and c.current_period_end is not null
      and c.current_period_end + c.grace_days < p_date
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_suspended from changed;

  with changed as (
    update public.centers c
    set status = 'past_due'
    where c.status in ('trial', 'active')
      and c.current_period_end is not null
      and c.current_period_end < p_date
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_past_due from changed;

  perform set_config('centromanager.reason', '', true);
  return jsonb_build_object('past_due', to_jsonb(v_past_due), 'suspended', to_jsonb(v_suspended));
end;
$$;

-- Rappels : J-7, J-1, jour J (centres en service avec un courriel de
-- contact), suspension du jour, récapitulatif du propriétaire.
create function private.queue_platform_notifications(p_date date, p_changes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer;
begin
  insert into public.platform_notifications (center_id, kind, scheduled_for, recipient, payload)
  select c.id,
         case c.current_period_end - p_date when 7 then 'due_in_7' when 1 then 'due_in_1' else 'due_today' end,
         p_date, c.owner_contact_email,
         jsonb_build_object('center_name', c.name, 'due_date', c.current_period_end, 'amount', c.price,
                            'billing_interval', c.billing_interval)
  from public.centers c
  where c.status in ('trial', 'active', 'past_due')
    and c.owner_contact_email is not null
    and c.current_period_end - p_date in (7, 1, 0)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.platform_notifications (center_id, kind, scheduled_for, recipient, payload)
  select c.id, 'suspended', p_date, c.owner_contact_email,
         jsonb_build_object('center_name', c.name, 'due_date', c.current_period_end)
  from public.centers c
  where c.id in (select jsonb_array_elements_text(p_changes -> 'suspended')::uuid)
    and c.owner_contact_email is not null
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.platform_notifications (center_id, kind, scheduled_for, recipient, payload)
  select null, 'owner_digest', p_date, null,
         jsonb_build_object(
           'due_in_7_days', coalesce((
             select jsonb_agg(jsonb_build_object('center_name', c.name, 'due_date', c.current_period_end) order by c.current_period_end)
             from public.centers c
             where c.status in ('trial', 'active', 'past_due')
               and c.current_period_end between p_date and p_date + 7), '[]'),
           'past_due_today', coalesce((
             select jsonb_agg(c.name order by c.name) from public.centers c
             where c.id in (select jsonb_array_elements_text(p_changes -> 'past_due')::uuid)), '[]'),
           'suspended_today', coalesce((
             select jsonb_agg(c.name order by c.name) from public.centers c
             where c.id in (select jsonb_array_elements_text(p_changes -> 'suspended')::uuid)), '[]'))
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_count + v_rows;
end;
$$;

create or replace function private.run_daily_automations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoices integer := private.generate_invoices();
  v_overdue integer := private.mark_overdue_invoices();
  v_centers jsonb := private.update_center_statuses();
  v_notifications integer := private.queue_platform_notifications(private.today(), v_centers);
begin
  return jsonb_build_object(
    'invoices_created', v_invoices,
    'invoices_overdue', v_overdue,
    'centers', v_centers,
    'notifications_queued', v_notifications);
end;
$$;

revoke all on function
  private.update_center_statuses(date),
  private.queue_platform_notifications(date, jsonb),
  private.run_daily_automations()
from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Console : réglages, support, rappels
-- ---------------------------------------------------------------------
create function public.platform_settings_get()
returns table (support_name text, support_phone text, support_email text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query select s.support_name, s.support_phone, s.support_email, s.updated_at from public.platform_settings s;
end;
$$;

create function public.platform_update_settings(p_support_name text, p_support_phone text, p_support_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  update public.platform_settings
  set support_name = nullif(btrim(p_support_name), ''),
      support_phone = nullif(btrim(p_support_phone), ''),
      support_email = nullif(btrim(p_support_email), ''),
      updated_at = now()
  where id = 1;
  perform private.log_platform_event(null, 'platform.settings_changed',
    jsonb_build_object('support_name', p_support_name, 'support_phone', p_support_phone, 'support_email', p_support_email));
end;
$$;

create function public.platform_start_support(p_center_id uuid, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + interval '1 hour';
begin
  perform private.require_super_admin();
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez un motif.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.centers c where c.id = p_center_id) then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;

  update public.support_sessions set ended_at = now()
  where actor_id = (select auth.uid()) and ended_at is null;

  insert into public.support_sessions (actor_id, center_id, reason, expires_at)
  values ((select auth.uid()), p_center_id, btrim(p_reason), v_expires);

  perform private.log_platform_event(p_center_id, 'support.started',
    jsonb_build_object('reason', btrim(p_reason), 'expires_at', v_expires));
  return v_expires;
end;
$$;

create function public.platform_end_support()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
begin
  perform private.require_super_admin();
  update public.support_sessions set ended_at = now()
  where actor_id = (select auth.uid()) and ended_at is null
  returning center_id into v_center_id;
  if v_center_id is not null then
    perform private.log_platform_event(v_center_id, 'support.ended', '{}');
  end if;
end;
$$;

create function public.platform_upcoming_notifications(p_from date default private.today())
returns table (
  notification_id bigint,
  center_id uuid,
  center_name text,
  kind text,
  scheduled_for date,
  recipient text,
  sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select n.id, n.center_id, coalesce(c.name, n.payload ->> 'center_name'), n.kind, n.scheduled_for, n.recipient, n.sent_at
  from public.platform_notifications n
  left join public.centers c on c.id = n.center_id
  where n.scheduled_for >= p_from and n.kind <> 'owner_digest'
  order by n.scheduled_for desc, n.id desc
  limit 50;
end;
$$;

-- Échéances des 7 prochains jours (tableau de bord).
create function public.platform_upcoming_due()
returns table (
  center_id uuid,
  name text,
  status public.center_status,
  current_period_end date,
  days_remaining integer,
  price numeric,
  billing_interval public.billing_interval,
  owner_contact_phone text,
  owner_contact_email text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.status, c.current_period_end, (c.current_period_end - private.today())::integer,
         coalesce(c.price, 0), c.billing_interval, c.owner_contact_phone, c.owner_contact_email
  from public.centers c
  where c.status in ('trial', 'active', 'past_due')
    and c.current_period_end between private.today() and private.today() + 7
  order by c.current_period_end, c.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.my_center_access()',
    'public.platform_settings_get()',
    'public.platform_update_settings(text, text, text)',
    'public.platform_start_support(uuid, text)',
    'public.platform_end_support()',
    'public.platform_upcoming_notifications(date)',
    'public.platform_upcoming_due()'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.support_center_id() from public, anon;
grant execute on function private.support_center_id() to authenticated;
revoke all on function private.in_support_write() from public, anon;
grant execute on function private.in_support_write() to authenticated;

-- >>> 20261006090000_white_label.sql
-- =====================================================================
-- CentroManager — 019 : marque blanche
--
--  * formule white_label : l'interface du centre prend son nom, son logo,
--    sa favicon et ses couleurs ; la marque de la plateforme n'apparaît
--    plus côté centre. Formule standard : aucun réglage de marque appliqué
--    ni modifiable par le centre ;
--  * réglages : super-admin (tous, y compris le domaine) ; administrateur
--    d'un centre en marque blanche (tous sauf le domaine et sa
--    vérification) ;
--  * images (logo, favicon, fond de connexion) : bucket public
--    « center-branding », un dossier par centre ;
--  * résolution d'un centre par adresse (sous-domaine = slug, ou domaine
--    personnalisé vérifié) pour l'écran de connexion, sans session.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Images de marque
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('center-branding', 'center-branding', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Centre dont l'utilisateur peut modifier la marque (NULL : aucun).
create function private.can_edit_branding(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.in_support_write()
     and (
       private.is_super_admin()
       or (
         p_center_id = private.auth_center_id()
         and private.is_admin()
         and exists (select 1 from public.subscriptions s where s.center_id = p_center_id and s.plan = 'white_label')
       )
     );
$$;

create function private.can_write_branding_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(p_name))[1] ~ '^[0-9a-f-]{36}$'
     and private.can_edit_branding(((storage.foldername(p_name))[1])::uuid);
$$;

create policy center_branding_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'center-branding' and private.can_write_branding_file(name));

create policy center_branding_update on storage.objects
for update to authenticated
using (bucket_id = 'center-branding' and private.can_write_branding_file(name))
with check (bucket_id = 'center-branding' and private.can_write_branding_file(name));

create policy center_branding_delete on storage.objects
for delete to authenticated
using (bucket_id = 'center-branding' and private.can_write_branding_file(name));

-- ---------------------------------------------------------------------
-- Écriture des réglages
-- ---------------------------------------------------------------------
-- p_custom_domain : ignoré pour un administrateur de centre (réservé au
-- super-admin). Un domaine modifié doit être vérifié à nouveau.
create function public.update_center_branding(
  p_center_id uuid,
  p_brand_name text,
  p_logo_url text,
  p_favicon_url text,
  p_primary_color text,
  p_secondary_color text,
  p_accent_color text,
  p_login_background_url text,
  p_email_sender_name text,
  p_support_email text,
  p_support_phone text,
  p_custom_domain text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super boolean := private.is_super_admin();
  v_domain text;
begin
  if not private.can_edit_branding(p_center_id) then
    raise exception 'Réglages de marque non modifiables.' using errcode = '42501';
  end if;
  if v_super then
    perform private.require_super_admin();
  end if;

  select b.custom_domain into v_domain from public.center_branding b where b.center_id = p_center_id;
  if v_super then
    v_domain := nullif(lower(btrim(coalesce(p_custom_domain, ''))), '');
  end if;

  insert into public.center_branding as b (
    center_id, brand_name, logo_url, favicon_url, primary_color, secondary_color, accent_color,
    login_background_url, email_sender_name, support_email, support_phone, custom_domain, domain_verified
  ) values (
    p_center_id, nullif(btrim(p_brand_name), ''), nullif(btrim(p_logo_url), ''), nullif(btrim(p_favicon_url), ''),
    nullif(lower(btrim(p_primary_color)), ''), nullif(lower(btrim(p_secondary_color)), ''), nullif(lower(btrim(p_accent_color)), ''),
    nullif(btrim(p_login_background_url), ''), nullif(btrim(p_email_sender_name), ''),
    nullif(btrim(p_support_email), ''), nullif(btrim(p_support_phone), ''), v_domain, false
  )
  on conflict (center_id) do update set
    brand_name = excluded.brand_name,
    logo_url = excluded.logo_url,
    favicon_url = excluded.favicon_url,
    primary_color = excluded.primary_color,
    secondary_color = excluded.secondary_color,
    accent_color = excluded.accent_color,
    login_background_url = excluded.login_background_url,
    email_sender_name = excluded.email_sender_name,
    support_email = excluded.support_email,
    support_phone = excluded.support_phone,
    custom_domain = excluded.custom_domain,
    domain_verified = case when excluded.custom_domain is not distinct from b.custom_domain then b.domain_verified else false end;
end;
$$;

-- Vérification du domaine : faite par la Server Action (DNS), enregistrée ici.
create function public.platform_set_domain_verified(p_center_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  update public.center_branding
  set domain_verified = p_verified and custom_domain is not null
  where center_id = p_center_id;
  if not found then
    raise exception 'Aucun domaine personnalisé pour ce centre.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Lecture de la marque
-- ---------------------------------------------------------------------
-- Marque appliquée (formule white_label uniquement), sans le domaine.
create function private.applied_branding(p_center_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(b) - 'center_id' - 'custom_domain' - 'domain_verified' - 'updated_at'
  from public.center_branding b
  join public.subscriptions s on s.center_id = b.center_id and s.plan = 'white_label'
  where b.center_id = p_center_id;
$$;

-- Écran de connexion : centre désigné par son adresse (sous-domaine ou
-- domaine personnalisé vérifié). Accessible sans session : nom et marque
-- publique uniquement.
create function public.center_for_host(p_slug text default null, p_domain text default null)
returns table (center_id uuid, name text, slug text, white_label boolean, branding jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.slug, s.plan = 'white_label', private.applied_branding(c.id)
  from public.centers c
  join public.subscriptions s on s.center_id = c.id
  left join public.center_branding b on b.center_id = c.id
  where c.status <> 'cancelled'
    and (
      (p_slug is not null and c.slug = lower(p_slug))
      or (p_domain is not null and b.custom_domain = lower(p_domain) and b.domain_verified and s.plan = 'white_label')
    )
  limit 1;
$$;

-- Accès du compte connecté : formule et marque en plus.
drop function public.my_center_access();

create function public.my_center_access()
returns table (
  center_id uuid,
  center_name text,
  status public.center_status,
  blocked boolean,
  current_period_end date,
  suspension_date date,
  days_before_suspension integer,
  support_mode boolean,
  support_expires_at timestamptz,
  contact_name text,
  contact_phone text,
  contact_email text,
  vocabulary jsonb,
  plan public.subscription_plan,
  branding jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.role, p.center_id from public.profiles p where p.id = (select auth.uid()) and p.active
  ),
  support as (
    select s.center_id, s.expires_at
    from public.support_sessions s
    join me on me.id = s.actor_id and me.role = 'super_admin'
    where s.ended_at is null and s.expires_at > now()
    order by s.started_at desc
    limit 1
  ),
  target as (
    select coalesce(me.center_id, (select support.center_id from support)) as center_id,
           me.role = 'admin' or exists (select 1 from support) as sees_billing
    from me
  )
  select c.id, c.name, c.status, c.status in ('suspended', 'cancelled'),
         case when t.sees_billing then c.current_period_end end,
         case when t.sees_billing then c.current_period_end + c.grace_days end,
         case when t.sees_billing then (c.current_period_end + c.grace_days - private.today())::integer end,
         exists (select 1 from support), (select support.expires_at from support),
         st.support_name, st.support_phone, st.support_email,
         ty.terms || c.custom_terms,
         sub.plan,
         private.applied_branding(c.id)
  from target t
  join public.centers c on c.id = t.center_id
  join public.center_types ty on ty.code = c.center_type
  left join public.subscriptions sub on sub.center_id = c.id
  cross join public.platform_settings st;
$$;

-- Réglages complets pour l'édition (super-admin, ou admin en marque blanche).
create function public.center_branding_settings(p_center_id uuid)
returns table (
  plan public.subscription_plan,
  editable boolean,
  brand_name text,
  logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  login_background_url text,
  email_sender_name text,
  support_email text,
  support_phone text,
  custom_domain text,
  domain_verified boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_super_admin() or (p_center_id = private.auth_center_id() and private.is_admin())) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
  select s.plan, private.can_edit_branding(p_center_id),
         b.brand_name, b.logo_url, b.favicon_url, b.primary_color, b.secondary_color, b.accent_color,
         b.login_background_url, b.email_sender_name, b.support_email, b.support_phone,
         b.custom_domain, coalesce(b.domain_verified, false)
  from public.subscriptions s
  left join public.center_branding b on b.center_id = s.center_id
  where s.center_id = p_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke all on function public.center_for_host(text, text) from public;
grant execute on function public.center_for_host(text, text) to anon, authenticated;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.my_center_access()',
    'public.update_center_branding(uuid, text, text, text, text, text, text, text, text, text, text, text)',
    'public.platform_set_domain_verified(uuid, boolean)',
    'public.center_branding_settings(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.can_edit_branding(uuid) from public, anon;
grant execute on function private.can_edit_branding(uuid) to authenticated;
revoke all on function private.can_write_branding_file(text) from public, anon;
grant execute on function private.can_write_branding_file(text) to authenticated;
revoke all on function private.applied_branding(uuid) from public, anon, authenticated;

-- >>> 20261007090000_attendance_sheet.sql
-- =====================================================================
-- CentroManager — 020 : fiche d'assiduité
--
--  * motif ou note sur une présence (surtout une absence : « malade »,
--    « justificatif reçu ») ;
--  * lecture de l'assiduité d'un élève : administrateur et assistant de son
--    centre (toutes ses matières) ; professeur : uniquement les matières
--    qu'il enseigne ;
--  * relances d'absence : administrateur et assistant uniquement.
-- =====================================================================

alter table public.attendance
  add column note text check (note is null or length(btrim(note)) between 1 and 300);

-- Visibilité de l'assiduité d'un élève sur une matière pour le compte connecté.
create function private.can_read_attendance(p_student_id uuid, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      private.is_staff()
      and private.student_center_id(p_student_id) = private.auth_center_id()
    )
    or (
      private.teaches_subject(p_subject_id)
      and private.student_center_id(p_student_id) = private.auth_center_id()
    );
$$;

-- Toutes les séances enregistrées de l'élève visibles par le compte connecté,
-- avec matière, professeur et horaire du créneau (même jour de semaine).
create function public.student_attendance(p_student_id uuid)
returns table (
  attendance_id uuid,
  session_date date,
  status public.attendance_status,
  subject_id uuid,
  subject_name text,
  level_name text,
  teacher_name text,
  start_time time,
  end_time time,
  note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.session_date, a.status, s.id, s.name, l.name,
         coalesce(marker.full_name, slot_teacher.full_name),
         slot.start_time, slot.end_time, a.note
  from public.attendance a
  join public.subjects s on s.id = a.subject_id
  join public.levels l on l.id = s.level_id
  left join public.profiles marker on marker.id = a.teacher_id
  left join lateral (
    select ss.start_time, ss.end_time, ss.teacher_id
    from public.schedule_slots ss
    where ss.subject_id = a.subject_id
      and ss.day_of_week = extract(dow from a.session_date)::smallint
    order by ss.start_time
    limit 1
  ) slot on true
  left join public.profiles slot_teacher on slot_teacher.id = slot.teacher_id
  where a.student_id = p_student_id
    and private.can_read_attendance(p_student_id, a.subject_id)
  order by a.session_date desc, slot.start_time desc nulls last;
$$;

-- Relances d'absence de l'élève (administrateur et assistant).
create function public.student_absence_follow_ups(p_student_id uuid)
returns table (follow_up_id uuid, created_at timestamptz, channel public.follow_up_channel, note text, author_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.created_at, f.channel, f.note, p.full_name
  from public.follow_ups f
  left join public.profiles p on p.id = f.created_by
  where f.student_id = p_student_id
    and f.type = 'absence'
    and private.is_staff()
    and private.student_center_id(p_student_id) = private.auth_center_id()
  order by f.created_at desc;
$$;

-- Motif d'une absence : administrateur, assistant, ou professeur de la matière.
create function public.set_attendance_note(p_attendance_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid;
  v_subject uuid;
begin
  select a.student_id, a.subject_id into v_student, v_subject
  from public.attendance a where a.id = p_attendance_id;
  if v_student is null or not private.can_read_attendance(v_student, v_subject) then
    raise exception 'Séance introuvable.' using errcode = 'P0002';
  end if;
  update public.attendance
  set note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_attendance_id;
end;
$$;

revoke all on function private.can_read_attendance(uuid, uuid) from public, anon;
grant execute on function private.can_read_attendance(uuid, uuid) to authenticated;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.student_attendance(uuid)',
    'public.student_absence_follow_ups(uuid)',
    'public.set_attendance_note(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
