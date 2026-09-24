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
