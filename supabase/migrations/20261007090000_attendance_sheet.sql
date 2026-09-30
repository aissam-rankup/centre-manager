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
