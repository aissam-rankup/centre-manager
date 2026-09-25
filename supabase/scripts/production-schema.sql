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

