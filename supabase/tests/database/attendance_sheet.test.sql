-- =====================================================================
-- Tests de la fiche d'assiduité (phase 7) — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
  ('ad000000-0000-4000-8000-000000000001', 'assistant-p20@test.local'),
  ('ad000000-0000-4000-8000-000000000002', 'prof-maths-p20@test.local'),
  ('ad000000-0000-4000-8000-000000000003', 'prof-anglais-p20@test.local'),
  ('ad000000-0000-4000-8000-000000000004', 'admin-autre-p20@test.local');
insert into public.centers (id, name) values
  ('cd000000-0000-4000-8000-000000000001', 'Centre P20'),
  ('cd000000-0000-4000-8000-000000000002', 'Autre centre P20');
insert into public.profiles (id, center_id, full_name, role) values
  ('ad000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'Assistant P20', 'assistant'),
  ('ad000000-0000-4000-8000-000000000002', 'cd000000-0000-4000-8000-000000000001', 'Prof Maths', 'teacher'),
  ('ad000000-0000-4000-8000-000000000003', 'cd000000-0000-4000-8000-000000000001', 'Prof Anglais', 'teacher'),
  ('ad000000-0000-4000-8000-000000000004', 'cd000000-0000-4000-8000-000000000002', 'Admin autre', 'admin');
insert into public.levels (id, center_id, name) values ('dd000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'Niveau P20');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('ed000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'Maths', 300),
  ('ed000000-0000-4000-8000-000000000002', 'cd000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'Anglais', 250);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('ad000000-0000-4000-8000-000000000002', 'ed000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000003', 'ed000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000001');
insert into public.students (id, center_id, full_name, level_id) values
  ('fd000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'Élève P20', 'dd000000-0000-4000-8000-000000000001');
insert into public.enrollments (student_id, subject_id, price_agreed) values
  ('fd000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001', 300),
  ('fd000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000002', 250);
insert into public.attendance (id, student_id, subject_id, teacher_id, session_date, status) values
  ('0d000000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000002', private.today() - 14, 'absent'),
  ('0d000000-0000-4000-8000-000000000002', 'fd000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000002', private.today() - 7, 'present'),
  ('0d000000-0000-4000-8000-000000000003', 'fd000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003', private.today() - 3, 'absent');
insert into public.follow_ups (student_id, type, channel, note) values
  ('fd000000-0000-4000-8000-000000000001', 'absence', 'phone', 'Parent prévenu'),
  ('fd000000-0000-4000-8000-000000000001', 'payment', 'whatsapp', null);

set local role authenticated;

-- Assistant : toutes les matières, relances d'absence, motif.
set local request.jwt.claims = '{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.student_attendance('fd000000-0000-4000-8000-000000000001')), 3, 'assistant : toutes les séances');
select is((select teacher_name from public.student_attendance('fd000000-0000-4000-8000-000000000001') where attendance_id = '0d000000-0000-4000-8000-000000000003'),
  'Prof Anglais', 'assistant : professeur de la séance');
select is((select string_agg(channel::text, ',') from public.student_absence_follow_ups('fd000000-0000-4000-8000-000000000001')),
  'phone', 'relances : absences uniquement');
select lives_ok($$select public.set_attendance_note('0d000000-0000-4000-8000-000000000001', 'Certificat médical')$$, 'assistant : motif enregistré');
select is((select note from public.student_attendance('fd000000-0000-4000-8000-000000000001') where attendance_id = '0d000000-0000-4000-8000-000000000001'),
  'Certificat médical', 'motif relu');

-- Professeur : uniquement ses matières, aucune relance.
set local request.jwt.claims = '{"sub":"ad000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select string_agg(distinct subject_name, ',') from public.student_attendance('fd000000-0000-4000-8000-000000000001')), 'Maths', 'professeur : ses matières seulement');
select is((select count(*)::int from public.student_absence_follow_ups('fd000000-0000-4000-8000-000000000001')), 0, 'professeur : aucune relance');
select throws_ok($$select public.set_attendance_note('0d000000-0000-4000-8000-000000000003', 'X')$$, 'P0002', null, 'professeur : pas de motif hors de ses matières');
select lives_ok($$select public.set_attendance_note('0d000000-0000-4000-8000-000000000001', '')$$, 'professeur : motif effacé sur sa matière');

-- Autre centre : rien.
set local request.jwt.claims = '{"sub":"ad000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.student_attendance('fd000000-0000-4000-8000-000000000001')), 0, 'autre centre : aucune séance');
select throws_ok($$select public.set_attendance_note('0d000000-0000-4000-8000-000000000001', 'X')$$, 'P0002', null, 'autre centre : aucun motif');

reset role;

select * from finish();
rollback;
