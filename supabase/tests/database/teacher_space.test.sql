-- =====================================================================
-- Tests de l'espace Professeur — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- Aucune donnée financière dans les vues du professeur.
select hasnt_column('public', 'class_rosters', 'price_agreed', 'vue class_rosters : aucun prix');
select hasnt_column('public', 'subject_catalog', 'monthly_price', 'vue subject_catalog : aucun tarif');

insert into auth.users (id, email) values ('a3000000-0000-4000-8000-000000000001', 'prof-p5@test.local');
insert into public.centers (id, name) values ('c3000000-0000-4000-8000-000000000001', 'Centre P5');
insert into public.profiles (id, center_id, full_name, role) values
  ('a3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Prof P5', 'teacher');
insert into public.levels (id, center_id, name) values
  ('d3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Niveau P5');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Maths P5', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001');
insert into public.students (id, center_id, full_name, level_id) values
  ('f3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Élève P5', 'd3000000-0000-4000-8000-000000000001');
insert into public.enrollments (student_id, subject_id, start_date) values
  ('f3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', private.today() - 30);
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
   'a3000000-0000-4000-8000-000000000001', private.today() - 7, 'present');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Appel du jour puis correction (upsert, comme le fait l'application).
select lives_ok(
  $$insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
    values ('f3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
            'a3000000-0000-4000-8000-000000000001', private.today(), 'present')
    on conflict (student_id, subject_id, session_date) do update set status = excluded.status$$,
  'professeur : enregistre l''appel du jour');
select lives_ok(
  $$insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
    values ('f3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
            'a3000000-0000-4000-8000-000000000001', private.today(), 'absent')
    on conflict (student_id, subject_id, session_date) do update set status = excluded.status$$,
  'professeur : corrige l''appel du jour');
select is(
  (select status::text from public.attendance
    where student_id = 'f3000000-0000-4000-8000-000000000001' and session_date = private.today()),
  'absent', 'correction : le statut est mis à jour');

-- Une séance passée ne peut plus être modifiée.
with u as (
  update public.attendance set status = 'absent'
  where student_id = 'f3000000-0000-4000-8000-000000000001' and session_date = private.today() - 7
  returning 1
)
select is(count(*)::int, 0, 'professeur : ne modifie pas une séance passée') from u;

reset role;

select * from finish();
rollback;
