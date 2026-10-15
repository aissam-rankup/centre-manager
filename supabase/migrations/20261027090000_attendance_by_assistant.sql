-- =====================================================================
-- CentroManager — 051 : absence marquée par l'accueil (page 9, phase 2)
--
--  * Le professeur fait l'appel comme avant ; l'accueil (et l'admin) peut
--    le faire aussi, en secours, depuis les séances du jour : même séance,
--    même ligne de présence, même chaîne (alerte à trois absences, fiche
--    d'assiduité, message au responsable).
--  * Traçabilité : chaque présence porte qui l'a saisie (marked_by), à quel
--    titre (marked_by_role : professeur, accueil, admin) et quand
--    (marked_at). Chaque saisie qui change le statut est gardée dans
--    attendance_entries (historique, en ajout seul).
--  * Saisies concurrentes : si le professeur et l'accueil (ou l'admin)
--    marquent la même séance différemment, les deux saisies restent dans
--    l'historique, la plus récente est la valeur affichée, et un conflit
--    est signalé à l'admin (attendance_conflicts). Il se ferme de lui-même
--    si les deux saisies se rejoignent, ou quand l'admin tranche.
--  * Accueil : séance du jour ou des 7 derniers jours (oubli), jour de la
--    semaine du créneau, élèves inscrits à la matière uniquement.
-- =====================================================================

create type public.attendance_marker as enum ('teacher', 'assistant', 'admin');

-- Rôle de saisie d'un compte (null : compte sans rôle de centre).
create function private.attendance_marker_of(p_user_id uuid)
returns public.attendance_marker
language sql
stable
security definer
set search_path = ''
as $$
  select case p.role
           when 'teacher' then 'teacher'
           when 'assistant' then 'assistant'
           when 'admin' then 'admin'
         end::public.attendance_marker
  from public.profiles p
  where p.id = p_user_id;
$$;

-- ---------------------------------------------------------------------
-- Auteur de la saisie
-- ---------------------------------------------------------------------
alter table public.attendance
  add column marked_by uuid references public.profiles (id) on delete set null,
  add column marked_by_role public.attendance_marker;

create index attendance_marked_by_idx on public.attendance (marked_by);

-- Reprise : les appels existants ont été faits par le compte enregistré.
update public.attendance a
set marked_by = a.teacher_id, marked_by_role = private.attendance_marker_of(a.teacher_id)
where a.teacher_id is not null;

comment on column public.attendance.marked_by is 'Compte qui a saisi le statut affiché (professeur, accueil ou admin).';
comment on column public.attendance.marked_by_role is 'À quel titre : professeur, accueil ou admin.';

-- ---------------------------------------------------------------------
-- Historique des saisies (ajout seul)
-- ---------------------------------------------------------------------
create table public.attendance_entries (
  id bigint generated always as identity primary key,
  attendance_id uuid not null references public.attendance (id) on delete cascade,
  center_id uuid not null references public.centers (id) on delete cascade,
  status public.attendance_status not null,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_by_role public.attendance_marker,
  marked_at timestamptz not null default now()
);

create index attendance_entries_attendance_idx on public.attendance_entries (attendance_id, id desc);
create index attendance_entries_center_idx on public.attendance_entries (center_id, marked_at desc);
create index attendance_entries_marked_by_idx on public.attendance_entries (marked_by);

comment on table public.attendance_entries is
  'Chaque saisie qui fixe ou change un statut de présence : qui, à quel titre, quand (historique en ajout seul).';

insert into public.attendance_entries (attendance_id, center_id, status, marked_by, marked_by_role, marked_at)
select a.id, st.center_id, a.status, a.marked_by, a.marked_by_role, a.marked_at
from public.attendance a
join public.students st on st.id = a.student_id
order by a.marked_at;

-- Seule modification admise : l'auteur effacé (compte supprimé, ON DELETE SET
-- NULL) ; le rôle, le statut et l'heure de la saisie restent.
create function private.attendance_entries_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.marked_by is null
     and (new.id, new.attendance_id, new.center_id, new.status, new.marked_by_role, new.marked_at)
         is not distinct from (old.id, old.attendance_id, old.center_id, old.status, old.marked_by_role, old.marked_at) then
    return new;
  end if;
  raise exception 'L''historique des saisies ne se modifie pas.' using errcode = '42501';
end;
$$;

create trigger attendance_entries_append_only
before update on public.attendance_entries
for each row execute function private.attendance_entries_append_only();

-- ---------------------------------------------------------------------
-- Saisies en désaccord (professeur d'un côté, accueil ou admin de l'autre)
-- ---------------------------------------------------------------------
create table public.attendance_conflicts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  attendance_id uuid not null references public.attendance (id) on delete cascade,
  teacher_entry_id bigint not null references public.attendance_entries (id) on delete cascade,
  staff_entry_id bigint not null references public.attendance_entries (id) on delete cascade,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  -- agreed : les saisies se sont rejointes ; confirmed : l'admin a tranché.
  resolution text check (resolution in ('agreed', 'confirmed')),
  resolved_status public.attendance_status,
  check ((resolved_at is null) = (resolution is null))
);

create unique index attendance_conflicts_open_idx on public.attendance_conflicts (attendance_id) where resolved_at is null;
create index attendance_conflicts_center_idx on public.attendance_conflicts (center_id, detected_at desc);
create index attendance_conflicts_teacher_entry_idx on public.attendance_conflicts (teacher_entry_id);
create index attendance_conflicts_staff_entry_idx on public.attendance_conflicts (staff_entry_id);
create index attendance_conflicts_resolved_by_idx on public.attendance_conflicts (resolved_by);

-- ---------------------------------------------------------------------
-- Déclencheurs de la présence
-- ---------------------------------------------------------------------
-- Auteur et heure : fixés à chaque saisie qui crée la présence ou change son
-- statut ; une note ou une re-saisie identique ne change pas l'auteur.
create or replace function private.attendance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if private.subject_center_id(new.subject_id) is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et la matière doivent appartenir au même centre.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    new.marked_by := old.marked_by;
    new.marked_by_role := old.marked_by_role;
    new.marked_at := old.marked_at;
    return new;
  end if;

  if v_uid is not null then
    new.marked_at := now();
    new.marked_by := v_uid;
    new.marked_by_role := private.attendance_marker_of(v_uid);
  elsif new.marked_by is null and new.teacher_id is not null then
    -- Saisie sans session (jeu d'essai, reprise) : attribuée au professeur.
    new.marked_by := new.teacher_id;
    new.marked_by_role := private.attendance_marker_of(new.teacher_id);
  end if;
  return new;
end;
$$;

-- Historique, puis détection (ou fin) d'un désaccord.
create function private.attendance_after_write_entries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry public.attendance_entries;
  v_other public.attendance_entries;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    -- L'autre côté confirme la valeur affichée : sa saisie est gardée et le
    -- désaccord se ferme (les deux saisies se rejoignent).
    -- Seulement l'autre côté (professeur face à accueil ou admin) : une re-saisie
    -- par un collègue du même côté ne clôt pas le désaccord.
    if v_uid is not null and v_uid is distinct from new.marked_by
       and (private.attendance_marker_of(v_uid) = 'teacher') is distinct from (new.marked_by_role = 'teacher')
       and exists (select 1 from public.attendance_conflicts c where c.attendance_id = new.id and c.resolved_at is null) then
      insert into public.attendance_entries (attendance_id, center_id, status, marked_by, marked_by_role)
      values (new.id, private.student_center_id(new.student_id), new.status, v_uid, private.attendance_marker_of(v_uid));
      update public.attendance_conflicts
      set resolved_at = now(), resolution = 'agreed', resolved_status = new.status
      where attendance_id = new.id and resolved_at is null;
    end if;
    return null;
  end if;

  insert into public.attendance_entries (attendance_id, center_id, status, marked_by, marked_by_role, marked_at)
  values (new.id, private.student_center_id(new.student_id), new.status, new.marked_by, new.marked_by_role, new.marked_at)
  returning * into v_entry;

  -- Décision de l'admin sur un désaccord : pas de nouveau désaccord.
  if coalesce(current_setting('centromanager.attendance_resolution', true), '') = 'on' or v_entry.marked_by_role is null then
    return null;
  end if;

  -- Dernière saisie de l'autre côté (professeur / accueil ou admin).
  select * into v_other
  from public.attendance_entries e
  where e.attendance_id = new.id
    and e.id <> v_entry.id
    and e.marked_by_role is not null
    and (e.marked_by_role = 'teacher') <> (v_entry.marked_by_role = 'teacher')
  order by e.id desc
  limit 1;
  if v_other.id is null then
    return null;
  end if;

  if v_other.status <> v_entry.status then
    insert into public.attendance_conflicts as c (center_id, attendance_id, teacher_entry_id, staff_entry_id)
    values (
      v_entry.center_id, new.id,
      case when v_entry.marked_by_role = 'teacher' then v_entry.id else v_other.id end,
      case when v_entry.marked_by_role = 'teacher' then v_other.id else v_entry.id end
    )
    on conflict (attendance_id) where resolved_at is null do update
    set teacher_entry_id = excluded.teacher_entry_id,
        staff_entry_id = excluded.staff_entry_id,
        detected_at = now();
  else
    update public.attendance_conflicts
    set resolved_at = now(), resolution = 'agreed', resolved_status = v_entry.status
    where attendance_id = new.id and resolved_at is null;
  end if;
  return null;
end;
$$;

create trigger attendance_after_write_entries
after insert or update of status on public.attendance
for each row execute function private.attendance_after_write_entries();

-- ---------------------------------------------------------------------
-- Appel par l'accueil (et l'admin) depuis les séances
-- ---------------------------------------------------------------------
-- p_entries : [{"student_id": "…", "status": "present" | "absent"}, …]
create function public.mark_session_attendance(p_slot_id uuid, p_session_date date, p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------------
-- Séances d'un jour (accueil et admin) : avancement de l'appel
-- ---------------------------------------------------------------------
create function public.staff_day_sessions(p_date date)
returns table (
  slot_id uuid,
  subject_id uuid,
  subject_name text,
  level_name text,
  teacher_name text,
  room text,
  start_time time,
  end_time time,
  student_count integer,
  marked_count integer,
  absent_count integer,
  teacher_marked integer,
  staff_marked integer,
  last_marked_at timestamptz,
  open_conflicts integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_center uuid := private.auth_center_id();
begin
  if not private.is_staff() or v_center is null then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
  select s.id, s.subject_id, sub.name, l.name, p.full_name, coalesce(r.name, s.room), s.start_time, s.end_time,
         (select count(*)::integer from public.enrollments e
          where e.subject_id = s.subject_id and e.active and e.start_date <= p_date),
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
$$;

-- ---------------------------------------------------------------------
-- Désaccords ouverts (admin) et décision
-- ---------------------------------------------------------------------
create function public.open_attendance_conflicts()
returns table (
  conflict_id uuid,
  attendance_id uuid,
  student_id uuid,
  student_name text,
  subject_name text,
  level_name text,
  session_date date,
  current_status public.attendance_status,
  teacher_status public.attendance_status,
  teacher_name text,
  teacher_marked_at timestamptz,
  staff_status public.attendance_status,
  staff_name text,
  staff_role public.attendance_marker,
  staff_marked_at timestamptz,
  detected_at timestamptz
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
  select c.id, a.id, st.id, st.full_name, sub.name, l.name, a.session_date, a.status,
         te.status, tp.full_name, te.marked_at,
         se.status, sp.full_name, se.marked_by_role, se.marked_at,
         c.detected_at
  from public.attendance_conflicts c
  join public.attendance a on a.id = c.attendance_id
  join public.students st on st.id = a.student_id
  join public.subjects sub on sub.id = a.subject_id
  join public.levels l on l.id = sub.level_id
  join public.attendance_entries te on te.id = c.teacher_entry_id
  join public.attendance_entries se on se.id = c.staff_entry_id
  left join public.profiles tp on tp.id = te.marked_by
  left join public.profiles sp on sp.id = se.marked_by
  where c.center_id = private.auth_center_id() and c.resolved_at is null
  order by a.session_date desc, c.detected_at desc;
end;
$$;

-- L'admin retient un statut : la présence le prend (saisie admin dans
-- l'historique), le désaccord est clos.
create function public.resolve_attendance_conflict(p_conflict_id uuid, p_status public.attendance_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict public.attendance_conflicts;
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_status is null then
    raise exception 'Choisissez le statut à retenir.' using errcode = '22023';
  end if;
  select * into v_conflict from public.attendance_conflicts c
  where c.id = p_conflict_id and c.center_id = private.auth_center_id()
  for update;
  if v_conflict.id is null then
    raise exception 'Désaccord introuvable.' using errcode = 'P0002';
  end if;
  if v_conflict.resolved_at is not null then
    raise exception 'Ce désaccord est déjà tranché.' using errcode = '22023';
  end if;

  perform set_config('centromanager.attendance_resolution', 'on', true);
  update public.attendance set status = p_status where id = v_conflict.attendance_id and status <> p_status;
  perform set_config('centromanager.attendance_resolution', '', true);

  update public.attendance_conflicts
  set resolved_at = now(), resolved_by = (select auth.uid()), resolution = 'confirmed', resolved_status = p_status
  where id = p_conflict_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Fiche d'assiduité : auteur de chaque saisie et historique
-- ---------------------------------------------------------------------
drop function public.student_attendance(uuid);

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
  note text,
  marked_by_name text,
  marked_by_role public.attendance_marker,
  marked_at timestamptz,
  -- Saisies successives, de la plus ancienne à la plus récente (si plusieurs).
  history jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.session_date, a.status, s.id, s.name, l.name,
         coalesce(slot_teacher.full_name, owner.full_name),
         slot.start_time, slot.end_time, a.note,
         marker.full_name, a.marked_by_role, a.marked_at,
         (select case when count(*) > 1 then
                   jsonb_agg(jsonb_build_object(
                     'status', e.status, 'role', e.marked_by_role, 'by', ep.full_name, 'at', e.marked_at) order by e.id)
                 end
          from public.attendance_entries e
          left join public.profiles ep on ep.id = e.marked_by
          where e.attendance_id = a.id)
  from public.attendance a
  join public.subjects s on s.id = a.subject_id
  join public.levels l on l.id = s.level_id
  left join public.profiles owner on owner.id = a.teacher_id
  left join public.profiles marker on marker.id = a.marked_by
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

-- ---------------------------------------------------------------------
-- Données de démonstration : indicateur sur les nouvelles tables
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select t.tablename from pg_tables t where t.schemaname = 'public' order by 1 loop
    execute format(
      'alter table public.%I add column if not exists is_demo boolean not null default '
      || 'coalesce(nullif(current_setting(''centromanager.demo_seed'', true), '''')::boolean, false)',
      r.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS et droits
-- ---------------------------------------------------------------------
alter table public.attendance_entries enable row level security;
alter table public.attendance_conflicts enable row level security;

-- Historique : comme les présences (équipe du centre, professeur de la matière).
create policy attendance_entries_select on public.attendance_entries
for select to authenticated
using (
  exists (
    select 1 from public.attendance a
    where a.id = attendance_entries.attendance_id
      and private.can_read_attendance(a.student_id, a.subject_id)
  )
);

-- Désaccords : l'admin du centre.
create policy attendance_conflicts_select on public.attendance_conflicts
for select to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()));

revoke all on public.attendance_entries, public.attendance_conflicts from anon;
revoke insert, update, delete, truncate on public.attendance_entries, public.attendance_conflicts from authenticated;
grant select on public.attendance_entries, public.attendance_conflicts to authenticated;

create trigger attendance_conflicts_deny_support_writes
before insert or update or delete on public.attendance_conflicts
for each row execute function private.deny_support_writes();

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.mark_session_attendance(uuid, date, jsonb)',
    'public.staff_day_sessions(date)',
    'public.open_attendance_conflicts()',
    'public.resolve_attendance_conflict(uuid, public.attendance_status)',
    'public.student_attendance(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.attendance_marker_of(uuid) from public, anon, authenticated;
revoke all on function private.attendance_after_write_entries() from public, anon, authenticated;
revoke all on function private.attendance_entries_append_only() from public, anon, authenticated;
