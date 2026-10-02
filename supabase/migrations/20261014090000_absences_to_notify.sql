-- =====================================================================
-- CentroManager — 031 : absences à signaler aux responsables (page 7, phase 2)
--
-- Absences des sept derniers jours, avec l'horaire de la séance (créneau du
-- planning ce jour-là), le professeur, le responsable, la série d'absences
-- consécutives éventuelle et la dernière notification envoyée.
-- Lisible par l'accueil et l'admin (droits des tables sous-jacentes).
-- =====================================================================

create view public.absences_to_notify
with (security_invoker = true)
as
select
  a.id as attendance_id,
  a.student_id,
  st.center_id,
  st.full_name,
  st.photo_url,
  st.guardian_name,
  st.guardian_phone,
  l.name as level_name,
  s.id as subject_id,
  s.name as subject_name,
  a.session_date,
  slot.start_time,
  slot.end_time,
  coalesce(t.full_name, slot.teacher_name) as teacher_name,
  -- Série d'absences consécutives ouverte pour cette matière.
  exists (
    select 1 from public.alerts al
    where al.student_id = a.student_id and al.type = 'consecutive_absences' and not al.resolved
      and al.payload ->> 'subject_id' = s.id::text
  ) as in_series,
  n.sent_at as notified_at,
  n.channel as notified_channel,
  n.sent_by_name as notified_by
from public.attendance a
join public.students st on st.id = a.student_id
join public.subjects s on s.id = a.subject_id
join public.levels l on l.id = st.level_id
left join public.profiles t on t.id = a.teacher_id
left join lateral (
  select ss.start_time, ss.end_time, p.full_name as teacher_name
  from public.schedule_slots ss
  left join public.profiles p on p.id = ss.teacher_id
  where ss.subject_id = a.subject_id and ss.level_id = s.level_id
    and ss.day_of_week = extract(dow from a.session_date)::smallint
  order by ss.start_time
  limit 1
) slot on true
left join lateral (
  select an.sent_at, an.channel, pr.full_name as sent_by_name
  from public.absence_notifications an
  left join public.profiles pr on pr.id = an.sent_by
  where an.attendance_id = a.id and an.status = 'sent'
  order by an.sent_at desc
  limit 1
) n on true
where a.status = 'absent'
  and a.session_date >= private.today() - 7;

revoke all on public.absences_to_notify from anon;
revoke all on public.absences_to_notify from authenticated;
grant select on public.absences_to_notify to authenticated;
