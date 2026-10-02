-- =====================================================================
-- CentroManager — 030 : salles, conflits de planning, alertes d'absence
-- (page 7, phase 1)
--
--  * salles du centre (capacité, étage, équipements), créées à partir des
--    noms déjà saisis dans le planning ; chaque créneau pointe vers sa salle,
--    la colonne texte « room » reste synchronisée (écrans existants) ;
--  * conflits refusés par la base, même en cas d'enregistrements simultanés :
--    salle, professeur et niveau (chevauchement partiel compris) ;
--  * journal des conflits rencontrés (où le planning est tendu) ;
--  * alertes d'absence au responsable : journal des envois (WhatsApp, appel,
--    en personne), une seule notification par séance sauf relance explicite ;
--    réglages du centre (activation, modèle de message).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Salles
-- ---------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  capacity smallint check (capacity is null or capacity between 1 and 500),
  floor text check (floor is null or length(btrim(floor)) between 1 and 40),
  -- Codes d'équipement : ["whiteboard", "projector", "computers", …].
  equipment jsonb not null default '[]'::jsonb check (jsonb_typeof(equipment) = 'array'),
  is_active boolean not null default true,
  notes text check (notes is null or length(btrim(notes)) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (id, center_id)
);

create unique index rooms_center_name_key on public.rooms (center_id, lower(btrim(name)));

-- Salles déjà utilisées dans les plannings.
insert into public.rooms (center_id, name)
select distinct on (s.center_id, lower(btrim(s.room))) s.center_id, btrim(s.room)
from public.schedule_slots s
order by s.center_id, lower(btrim(s.room)), s.room;

alter table public.schedule_slots add column room_id uuid;

update public.schedule_slots s
set room_id = r.id
from public.rooms r
where r.center_id = s.center_id and lower(btrim(r.name)) = lower(btrim(s.room));

-- Obligatoire (contrôle après le trigger qui la renseigne depuis le nom de salle).
alter table public.schedule_slots
  add constraint schedule_slots_room_required check (room_id is not null),
  add constraint schedule_slots_room_fkey foreign key (room_id, center_id)
    references public.rooms (id, center_id) on delete restrict;

create index schedule_slots_room_idx on public.schedule_slots (room_id);

-- Salle d'un créneau : choisie par son identifiant ; un créneau saisi avec un
-- simple nom (écrans existants) retrouve la salle, ou la crée.
create function private.schedule_slots_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if new.room_id is null or (tg_op = 'UPDATE' and new.room is distinct from old.room and new.room_id = old.room_id) then
    select * into v_room from public.rooms r
    where r.center_id = new.center_id and lower(btrim(r.name)) = lower(btrim(new.room));
    if v_room.id is null then
      insert into public.rooms (center_id, name) values (new.center_id, btrim(new.room)) returning * into v_room;
    end if;
    new.room_id := v_room.id;
  else
    select * into v_room from public.rooms r where r.id = new.room_id and r.center_id = new.center_id;
    if v_room.id is null then
      raise exception 'Salle introuvable dans ce centre.' using errcode = '23514';
    end if;
  end if;
  new.room := v_room.name;
  return new;
end;
$$;

create trigger schedule_slots_room
before insert or update of room, room_id on public.schedule_slots
for each row execute function private.schedule_slots_room();

-- Salle renommée : le nom suit sur les créneaux.
create function private.rooms_sync_slot_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.schedule_slots set room = new.name where room_id = new.id and room is distinct from new.name;
  return null;
end;
$$;

create trigger rooms_sync_slot_names
after update of name on public.rooms
for each row execute function private.rooms_sync_slot_names();

-- ---------------------------------------------------------------------
-- Conflits : salle (par identifiant), professeur, niveau
-- ---------------------------------------------------------------------
alter table public.schedule_slots drop constraint schedule_slots_no_room_overlap;

alter table public.schedule_slots
  add constraint schedule_slots_no_room_overlap exclude using gist (
    room_id with =,
    day_of_week with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&
  ),
  -- Un même niveau (groupe d'élèves) n'a jamais deux cours en même temps.
  add constraint schedule_slots_no_level_overlap exclude using gist (
    level_id with =,
    day_of_week with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&
  );

create type public.schedule_conflict_type as enum ('room', 'teacher', 'level');

create table public.schedule_conflicts_log (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  -- Créneau tenté : {subject_id, level_id, teacher_id, room_id, day_of_week, start_time, end_time}.
  attempted_slot jsonb not null check (jsonb_typeof(attempted_slot) = 'object'),
  conflict_type public.schedule_conflict_type not null,
  conflicting_slot_id uuid references public.schedule_slots (id) on delete set null,
  -- Issue choisie : autre salle, autre horaire, abandon (null : non résolu).
  resolved_how text check (resolved_how is null or resolved_how in ('other_room', 'other_time', 'abandoned')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index schedule_conflicts_log_center_idx on public.schedule_conflicts_log (center_id, created_at desc);
create index schedule_conflicts_log_slot_idx on public.schedule_conflicts_log (conflicting_slot_id);
create index schedule_conflicts_log_created_by_idx on public.schedule_conflicts_log (created_by);

-- ---------------------------------------------------------------------
-- Alertes d'absence au responsable
-- ---------------------------------------------------------------------
alter table public.centers
  add column absence_notification_enabled boolean not null default true,
  -- Modèle du message ; vide : modèle par défaut de l'application.
  add column absence_notification_template text
    check (absence_notification_template is null or length(btrim(absence_notification_template)) between 1 and 1000);

grant select (absence_notification_enabled, absence_notification_template) on public.centers to authenticated;
grant update (absence_notification_enabled, absence_notification_template) on public.centers to authenticated;

create type public.notification_channel as enum ('whatsapp', 'phone_call', 'in_person');
create type public.absence_notification_status as enum ('prepared', 'sent', 'failed', 'no_phone');

create table public.absence_notifications (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  student_id uuid not null,
  attendance_id uuid references public.attendance (id) on delete cascade,
  channel public.notification_channel not null,
  template_used text,
  message_body text check (message_body is null or length(message_body) <= 2000),
  sent_at timestamptz not null default now(),
  sent_by uuid default auth.uid() references public.profiles (id) on delete set null,
  guardian_phone_used text,
  status public.absence_notification_status not null default 'sent',
  -- Relance explicite d'une séance déjà signalée.
  is_repeat boolean not null default false,
  -- Message signalant une série d'absences consécutives.
  is_series boolean not null default false,
  foreign key (student_id, center_id) references public.students (id, center_id) on delete cascade
);

-- Une seule notification par séance, hors relance explicite.
create unique index absence_notifications_once
  on public.absence_notifications (attendance_id)
  where status = 'sent' and not is_repeat;
create index absence_notifications_student_idx on public.absence_notifications (student_id, sent_at desc);
create index absence_notifications_center_idx on public.absence_notifications (center_id, sent_at desc);
create index absence_notifications_sent_by_idx on public.absence_notifications (sent_by);

create function private.absence_notifications_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.center_id := private.student_center_id(new.student_id);
  if new.attendance_id is not null and not exists (
    select 1 from public.attendance a where a.id = new.attendance_id and a.student_id = new.student_id and a.status = 'absent'
  ) then
    raise exception 'La séance doit être une absence de cet élève.' using errcode = '23514';
  end if;
  if (select auth.uid()) is not null then
    new.sent_by := (select auth.uid());
    new.sent_at := now();
  end if;
  return new;
end;
$$;

create trigger absence_notifications_before_insert
before insert on public.absence_notifications
for each row execute function private.absence_notifications_before_insert();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.rooms enable row level security;
alter table public.schedule_conflicts_log enable row level security;
alter table public.absence_notifications enable row level security;

-- Salles : lisibles par tout le centre (emploi du temps), gérées par l'admin.
create policy rooms_select_center on public.rooms
for select to authenticated
using (center_id = (select private.auth_center_id()));

create policy rooms_insert_admin on public.rooms
for insert to authenticated
with check ((select private.is_admin()) and center_id = (select private.auth_center_id()));

create policy rooms_update_admin on public.rooms
for update to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()))
with check (center_id = (select private.auth_center_id()));

create policy rooms_delete_admin on public.rooms
for delete to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()));

-- Journal des conflits : admin.
create policy schedule_conflicts_log_select_admin on public.schedule_conflicts_log
for select to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()));

create policy schedule_conflicts_log_insert_admin on public.schedule_conflicts_log
for insert to authenticated
with check ((select private.is_admin()) and center_id = (select private.auth_center_id()));

create policy schedule_conflicts_log_update_admin on public.schedule_conflicts_log
for update to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()))
with check (center_id = (select private.auth_center_id()));

-- Notifications d'absence : accueil et admin ; journal sans modification.
create policy absence_notifications_select_staff on public.absence_notifications
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

create policy absence_notifications_insert_staff on public.absence_notifications
for insert to authenticated
with check ((select private.is_staff()) and private.student_center_id(student_id) = (select private.auth_center_id()));

do $$
declare
  v_table text;
begin
  foreach v_table in array array['rooms', 'schedule_conflicts_log', 'absence_notifications'] loop
    execute format(
      'create trigger deny_support_writes before insert or update or delete on public.%I
         for each row execute function private.deny_support_writes()', v_table);
  end loop;
end;
$$;

revoke all on public.rooms, public.schedule_conflicts_log, public.absence_notifications from anon, authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update (resolved_how) on public.schedule_conflicts_log to authenticated;
grant select, insert on public.absence_notifications to authenticated;
