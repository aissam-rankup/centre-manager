-- =====================================================================
-- Tests de l'espace Admin — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('a4000000-0000-4000-8000-000000000001', 'admin-p6@test.local'),
  ('a4000000-0000-4000-8000-000000000002', 'assistant-p6@test.local'),
  ('a4000000-0000-4000-8000-000000000003', 'prof-p6@test.local'),
  ('a4000000-0000-4000-8000-000000000004', 'prof2-p6@test.local');
insert into public.centers (id, name) values ('c4000000-0000-4000-8000-000000000001', 'Centre P6');
insert into public.profiles (id, center_id, full_name, role) values
  ('a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'Admin P6', 'admin'),
  ('a4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'Assistant P6', 'assistant'),
  ('a4000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'Prof P6', 'teacher'),
  ('a4000000-0000-4000-8000-000000000004', 'c4000000-0000-4000-8000-000000000001', 'Prof2 P6', 'teacher');
insert into public.levels (id, center_id, name) values
  ('d4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'Niveau P6'),
  ('d4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'Niveau P6 bis');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'Maths P6', 400),
  ('e4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'Maths P6 bis', 450);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001');
insert into public.students (id, center_id, full_name, level_id) values
  ('f4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'Élève P6', 'd4000000-0000-4000-8000-000000000001');
insert into public.enrollments (student_id, subject_id, start_date) values
  ('f4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', private.today());
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', private.today() - 1, 'absent'),
  ('f4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', private.today() - 2, 'present'),
  ('f4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', private.today() - 3, 'present'),
  ('f4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', private.today() - 4, 'present');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select student_count from public.admin_month_revenue()), 1, 'admin : effectif du centre');
select is((select expected_amount from public.admin_month_revenue()), 400.00::numeric, 'admin : revenu attendu du mois');
select is((select collected_amount from public.admin_month_revenue()), 0.00::numeric, 'admin : rien d''encaissé');
select is((select absence_rate from public.admin_absence_rates() where subject_id = 'e4000000-0000-4000-8000-000000000001'), 0.2500::numeric, 'admin : taux d''absence = 1 / 4');
select is((select count(*)::int from public.admin_list_users()), 4, 'admin : annuaire limité à son centre');
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
    values ('c4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
            'a4000000-0000-4000-8000-000000000004', 1, '09:00', '10:00', 'Salle A')$$,
  '23514', null, 'planning : professeur non affecté à la matière refusé');
select throws_ok(
  $$update public.profiles set active = false where id = 'a4000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'admin : ne peut pas désactiver son propre compte');
select throws_ok(
  $$update public.profiles set role = 'assistant' where id = 'a4000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'profil : le rôle professeur est figé');
select lives_ok(
  $$update public.profiles set role = 'admin' where id = 'a4000000-0000-4000-8000-000000000002'$$,
  'admin : peut promouvoir un assistant');
select throws_ok(
  $$insert into public.enrollments (student_id, subject_id) values
    ('f4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000002')$$,
  '23514', null, 'inscription : matière d''un autre niveau refusée');
select throws_ok(
  $$update public.students set level_id = 'd4000000-0000-4000-8000-000000000002' where id = 'f4000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'élève : changement de niveau refusé tant que des inscriptions sont actives');
update public.enrollments set active = false where student_id = 'f4000000-0000-4000-8000-000000000001';
select lives_ok(
  $$update public.students set level_id = 'd4000000-0000-4000-8000-000000000002' where id = 'f4000000-0000-4000-8000-000000000001'$$,
  'élève : changement de niveau possible une fois les inscriptions arrêtées');

set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select * from public.admin_month_revenue()$$, '42501', null, 'professeur : indicateurs admin refusés');
select throws_ok($$select * from public.admin_list_users()$$, '42501', null, 'professeur : annuaire refusé');

reset role;

select * from finish();
rollback;
