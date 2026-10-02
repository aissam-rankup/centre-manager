-- =====================================================================
-- Planning et absences, phase 4 : explication des conflits de planning
--
-- Les contraintes d'exclusion (salle, professeur, niveau) restent la garde
-- ultime, y compris entre deux admins simultanés. Cette fonction décrit,
-- avant ou après un refus, chaque cours qui bloque le créneau demandé :
-- type de conflit, salle, horaire, professeur, matière, niveau, inscrits.
-- =====================================================================

create function public.slot_conflicts(
  p_level_id uuid,
  p_teacher_id uuid,
  p_room_id uuid,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  -- Créneau modifié : il ne se bloque pas lui-même.
  p_slot_id uuid default null
)
returns table (
  conflict_type public.schedule_conflict_type,
  slot_id uuid,
  room_name text,
  day_of_week smallint,
  start_time time,
  end_time time,
  teacher_name text,
  subject_name text,
  level_name text,
  enrolled integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select s.*
    from public.schedule_slots s
    where (select private.is_admin())
      and s.center_id = (select private.auth_center_id())
      and s.day_of_week = p_day_of_week
      and (p_slot_id is null or s.id <> p_slot_id)
      -- Chevauchement partiel compris ; bornes exclusives comme les contraintes.
      and s.start_time < p_end_time
      and p_start_time < s.end_time
  ),
  typed as (
    select 'room'::public.schedule_conflict_type as conflict_type, c.* from candidates c where c.room_id = p_room_id
    union all
    select 'teacher'::public.schedule_conflict_type, c.* from candidates c where c.teacher_id = p_teacher_id
    union all
    select 'level'::public.schedule_conflict_type, c.* from candidates c where c.level_id = p_level_id
  )
  select
    t.conflict_type,
    t.id,
    t.room,
    t.day_of_week::smallint,
    t.start_time,
    t.end_time,
    coalesce(p.full_name, ''),
    coalesce(su.name, ''),
    coalesce(l.name, ''),
    (select count(*)::integer from public.enrollments e where e.subject_id = t.subject_id and e.active)
  from typed t
  left join public.profiles p on p.id = t.teacher_id
  left join public.subjects su on su.id = t.subject_id
  left join public.levels l on l.id = t.level_id
  order by t.conflict_type, t.start_time;
$$;

comment on function public.slot_conflicts(uuid, uuid, uuid, smallint, time, time, uuid) is
  'Cours qui bloquent un créneau (salle, professeur, niveau), avec de quoi expliquer le refus.';

revoke execute on function public.slot_conflicts(uuid, uuid, uuid, smallint, time, time, uuid) from public, anon;
grant execute on function public.slot_conflicts(uuid, uuid, uuid, smallint, time, time, uuid) to authenticated;
