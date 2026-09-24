-- =====================================================================
-- Tests des policies RLS — exécuter avec : npm run db:test
-- Chaque test s'exécute dans une transaction annulée à la fin.
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- ---------------------------------------------------------------------
-- Données de test : centre A (complet) et centre B (isolation)
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin-a@test.local'),
  ('a0000000-0000-4000-8000-000000000002', 'assistant-a@test.local'),
  ('a0000000-0000-4000-8000-000000000003', 'teacher-a@test.local'),
  ('a0000000-0000-4000-8000-000000000004', 'teacher-a2@test.local'),
  ('a0000000-0000-4000-8000-000000000005', 'inactive-a@test.local'),
  ('b0000000-0000-4000-8000-000000000001', 'admin-b@test.local');

insert into public.centers (id, name) values
  ('c0000000-0000-4000-8000-00000000000a', 'Centre A'),
  ('c0000000-0000-4000-8000-00000000000b', 'Centre B');

insert into public.profiles (id, center_id, full_name, role, active) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 'Admin A', 'admin', true),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000a', 'Assistant A', 'assistant', true),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000a', 'Prof A', 'teacher', true),
  ('a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-00000000000a', 'Prof A2', 'teacher', true),
  ('a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-00000000000a', 'Assistant désactivé', 'assistant', false),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000b', 'Admin B', 'admin', true);

insert into public.levels (id, center_id, name) values
  ('d0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', 'Niveau A'),
  ('d0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', 'Niveau B');

insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a', 'Maths A', 400),
  ('e0000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a', 'Anglais A', 300),
  ('e0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000b', 'Maths B', 350);

insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-00000000000a'),
  ('a0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-00000000000a');

insert into public.students (id, center_id, full_name, level_id, created_by) values
  ('f0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-00000000000a', 'Élève Maths', 'd0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000a', 'Élève Anglais', 'd0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b', 'Élève B', 'd0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000001');

insert into public.enrollments (id, student_id, subject_id, price_agreed) values
  ('10000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1', 400),
  ('10000000-0000-4000-8000-0000000000a2', 'f0000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-0000000000a2', 300);

insert into public.invoices (id, enrollment_id, student_id, period_start, period_end, amount_due, due_date, status) values
  ('11000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1',
   date '2026-09-01', date '2026-09-30', 400, date '2026-09-05', 'overdue');

insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room) values
  ('c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000003', 1, '17:00', '18:30', 'Salle 1'),
  ('c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000004', 2, '17:00', '18:30', 'Salle 1');

-- ---------------------------------------------------------------------
-- anon : aucun accès
-- ---------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.students', '42501', null, 'anon : aucun accès aux élèves');
reset role;

-- ---------------------------------------------------------------------
-- Isolation entre centres
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.students), 2, 'admin A : voit uniquement les 2 élèves du centre A');
select is((select count(*)::int from public.students where center_id = 'c0000000-0000-4000-8000-00000000000b'), 0, 'admin A : aucun élève du centre B');

set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.students), 1, 'admin B : voit uniquement son élève');
select is((select count(*)::int from public.invoices), 0, 'admin B : aucune facture du centre A');

-- ---------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
with u as (update public.students set notes = 'Mis à jour' where id = 'f0000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 1, 'admin : peut modifier un élève') from u;
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
    values ('c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-00000000000a',
            'a0000000-0000-4000-8000-000000000004', 1, '18:00', '19:00', 'salle 1')$$,
  '23P01', null, 'planning : conflit de salle refusé');
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
    values ('c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-00000000000a',
            'a0000000-0000-4000-8000-000000000003', 1, '18:00', '19:00', 'Salle 2')$$,
  '23P01', null, 'planning : conflit de professeur refusé');

-- ---------------------------------------------------------------------
-- Assistant
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.subjects), 2, 'assistant : voit les matières de son centre');
select lives_ok(
  $$insert into public.students (id, center_id, full_name, level_id, created_by)
    values ('f0000000-0000-4000-8000-0000000000a3', 'c0000000-0000-4000-8000-00000000000a', 'Nouvel élève',
            'd0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002')$$,
  'assistant : peut créer un élève');
select throws_ok(
  $$insert into public.students (center_id, full_name, level_id, created_by)
    values ('c0000000-0000-4000-8000-00000000000b', 'Intrus', 'd0000000-0000-4000-8000-00000000000b',
            'a0000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'assistant : ne peut pas créer un élève dans un autre centre');
with u as (update public.students set notes = 'x' where id = 'f0000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 0, 'assistant : ne peut pas modifier un élève') from u;
with d as (delete from public.students where id = 'f0000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 0, 'assistant : ne peut pas supprimer un élève') from d;
select lives_ok(
  $$insert into public.enrollments (student_id, subject_id)
    values ('f0000000-0000-4000-8000-0000000000a3', 'e0000000-0000-4000-8000-0000000000a2')$$,
  'assistant : peut inscrire un élève à une matière');
select is(
  (select price_agreed from public.enrollments where student_id = 'f0000000-0000-4000-8000-0000000000a3'),
  300.00::numeric, 'inscription : prix par défaut = tarif de la matière');
select throws_ok(
  $$insert into public.enrollments (student_id, subject_id, price_agreed)
    values ('f0000000-0000-4000-8000-0000000000a3', 'e0000000-0000-4000-8000-0000000000a1', 100)$$,
  '42501', null, 'assistant : ne peut pas fixer un tarif');
select lives_ok(
  $$update public.invoices set status = 'paid', amount_paid = 400, paid_at = now(), paid_by = 'a0000000-0000-4000-8000-000000000002'
    where id = '11000000-0000-4000-8000-0000000000a1'$$,
  'assistant : peut marquer une facture comme payée');
select throws_ok(
  $$update public.invoices set amount_due = 1 where id = '11000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'assistant : ne peut pas modifier le montant dû');
select throws_ok(
  $$insert into public.profiles (id, center_id, full_name, role)
    values ('a0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-00000000000a', 'Faux admin', 'admin')$$,
  '42501', null, 'assistant : ne peut pas créer de compte admin');
select lives_ok(
  $$insert into public.follow_ups (student_id, invoice_id, type, channel, note, created_by)
    values ('f0000000-0000-4000-8000-0000000000a1', '11000000-0000-4000-8000-0000000000a1', 'payment', 'phone', 'Test',
            'a0000000-0000-4000-8000-000000000002')$$,
  'assistant : peut enregistrer une relance');

-- ---------------------------------------------------------------------
-- Professeur
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select results_eq(
  'select id from public.students',
  $$values ('f0000000-0000-4000-8000-0000000000a1'::uuid)$$,
  'professeur : voit uniquement les élèves de ses matières');
select is((select count(*)::int from public.invoices), 0, 'professeur : aucun accès aux factures');
select is((select count(*)::int from public.subjects), 0, 'professeur : aucun accès aux tarifs des matières');
select is((select count(*)::int from public.enrollments), 0, 'professeur : aucun accès aux prix des inscriptions');
select is((select count(*)::int from public.subject_catalog), 2, 'professeur : catalogue des matières sans prix');
select is((select count(*)::int from public.class_rosters), 1, 'professeur : liste de classe limitée à ses matières');
select is((select count(*)::int from public.schedule_slots), 1, 'professeur : voit uniquement ses créneaux');
select lives_ok(
  $$insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
    values ('f0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1',
            'a0000000-0000-4000-8000-000000000003', private.today(), 'present')$$,
  'professeur : fait l''appel du jour pour sa matière');
select throws_ok(
  $$insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
    values ('f0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1',
            'a0000000-0000-4000-8000-000000000003', private.today() - 1, 'absent')$$,
  '42501', null, 'professeur : ne peut pas saisir une autre date que le jour même');
select throws_ok(
  $$insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
    values ('f0000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-0000000000a2',
            'a0000000-0000-4000-8000-000000000003', private.today(), 'absent')$$,
  '42501', null, 'professeur : ne peut pas saisir l''appel d''une autre matière');

-- ---------------------------------------------------------------------
-- Compte désactivé
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is((select count(*)::int from public.students), 0, 'compte désactivé : aucun accès aux données');

reset role;

select * from finish();
rollback;
