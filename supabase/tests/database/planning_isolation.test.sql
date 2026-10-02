-- =====================================================================
-- Planning et absences (page 7, phase 7) : isolation entre centres
--
-- Complète tenant_isolation (aucune ligne d'un autre centre n'est lisible) par
-- les écritures et fonctions propres au planning : explication des conflits,
-- salles, journal des conflits, notifications d'absence, mode support.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
  ('aa900000-0000-4000-8000-00000000000a', 'admin-a-p72@test.local'),
  ('aa900000-0000-4000-8000-00000000000b', 'accueil-a-p72@test.local'),
  ('aa900000-0000-4000-8000-00000000000c', 'prof-a-p72@test.local'),
  ('ab900000-0000-4000-8000-00000000000a', 'admin-b-p72@test.local'),
  ('ab900000-0000-4000-8000-00000000000c', 'prof-b-p72@test.local'),
  ('a0900000-0000-4000-8000-00000000000d', 'owner-p72@test.local');
insert into public.centers (id, name, slug) values
  ('ca900000-0000-4000-8000-000000000001', 'Centre A', 'p72-a'),
  ('cb900000-0000-4000-8000-000000000001', 'Centre B', 'p72-b');
insert into public.profiles (id, center_id, full_name, role) values
  ('aa900000-0000-4000-8000-00000000000a', 'ca900000-0000-4000-8000-000000000001', 'Admin A', 'admin'),
  ('aa900000-0000-4000-8000-00000000000b', 'ca900000-0000-4000-8000-000000000001', 'Accueil A', 'assistant'),
  ('aa900000-0000-4000-8000-00000000000c', 'ca900000-0000-4000-8000-000000000001', 'Prof A', 'teacher'),
  ('ab900000-0000-4000-8000-00000000000a', 'cb900000-0000-4000-8000-000000000001', 'Admin B', 'admin'),
  ('ab900000-0000-4000-8000-00000000000c', 'cb900000-0000-4000-8000-000000000001', 'Prof B', 'teacher'),
  ('a0900000-0000-4000-8000-00000000000d', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values
  ('da900000-0000-4000-8000-000000000001', 'ca900000-0000-4000-8000-000000000001', 'Niveau A'),
  ('db900000-0000-4000-8000-000000000001', 'cb900000-0000-4000-8000-000000000001', 'Niveau B');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('ea900000-0000-4000-8000-000000000001', 'ca900000-0000-4000-8000-000000000001', 'da900000-0000-4000-8000-000000000001', 'Maths A', 300),
  ('eb900000-0000-4000-8000-000000000001', 'cb900000-0000-4000-8000-000000000001', 'db900000-0000-4000-8000-000000000001', 'Maths B', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('aa900000-0000-4000-8000-00000000000c', 'ea900000-0000-4000-8000-000000000001', 'da900000-0000-4000-8000-000000000001'),
  ('ab900000-0000-4000-8000-00000000000c', 'eb900000-0000-4000-8000-000000000001', 'db900000-0000-4000-8000-000000000001');

-- Le centre B : une salle « Salle 1 », un cours mardi 17h–18h30, un élève absent, un conflit journalisé.
insert into public.rooms (id, center_id, name, capacity) values
  ('fb900000-0000-4000-8000-000000000001', 'cb900000-0000-4000-8000-000000000001', 'Salle 1', 12);
insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, room_id, room, day_of_week, start_time, end_time) values
  ('cb900000-0000-4000-8000-000000000001', 'eb900000-0000-4000-8000-000000000001', 'db900000-0000-4000-8000-000000000001',
   'ab900000-0000-4000-8000-00000000000c', 'fb900000-0000-4000-8000-000000000001', '-', 2, '17:00', '18:30');
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('5b900000-0000-4000-8000-000000000001', 'cb900000-0000-4000-8000-000000000001', 'Élève B', 'db900000-0000-4000-8000-000000000001', '0611223344');
insert into public.enrollments (student_id, subject_id) values ('5b900000-0000-4000-8000-000000000001', 'eb900000-0000-4000-8000-000000000001');
insert into public.attendance (id, student_id, subject_id, teacher_id, session_date, status) values
  ('9b900000-0000-4000-8000-000000000001', '5b900000-0000-4000-8000-000000000001', 'eb900000-0000-4000-8000-000000000001',
   'ab900000-0000-4000-8000-00000000000c', private.today(), 'absent');
insert into public.schedule_conflicts_log (id, center_id, attempted_slot, conflict_type)
values ('8b900000-0000-4000-8000-000000000001', 'cb900000-0000-4000-8000-000000000001', '{"day_of_week": 2}', 'room');

-- ---------------------------------------------------------------------
-- Admin du centre A
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa900000-0000-4000-8000-00000000000a","role":"authenticated"}';

select is(
  (select count(*)::int from public.slot_conflicts('db900000-0000-4000-8000-000000000001', 'ab900000-0000-4000-8000-00000000000c',
     'fb900000-0000-4000-8000-000000000001', 2::smallint, '17:00', '18:30')),
  0, 'admin A : l''explication des conflits ne révèle aucun cours de B');
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, room_id, room, day_of_week, start_time, end_time)
    values ('ca900000-0000-4000-8000-000000000001', 'ea900000-0000-4000-8000-000000000001', 'da900000-0000-4000-8000-000000000001',
            'aa900000-0000-4000-8000-00000000000c', 'fb900000-0000-4000-8000-000000000001', '-', 3, '17:00', '18:30')$$,
  '23514', 'Salle introuvable dans ce centre.', 'admin A : cours placé dans une salle de B refusé');
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, room, day_of_week, start_time, end_time)
    values ('cb900000-0000-4000-8000-000000000001', 'eb900000-0000-4000-8000-000000000001', 'db900000-0000-4000-8000-000000000001',
            'ab900000-0000-4000-8000-00000000000c', 'Salle 9', 4, '17:00', '18:30')$$,
  '42501', null, 'admin A : aucun cours créé dans le planning de B');

-- Même nom, même heure que chez B : c'est une autre salle, celle de A.
select lives_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, room, day_of_week, start_time, end_time)
    values ('ca900000-0000-4000-8000-000000000001', 'ea900000-0000-4000-8000-000000000001', 'da900000-0000-4000-8000-000000000001',
            'aa900000-0000-4000-8000-00000000000c', 'Salle 1', 2, '17:00', '18:30')$$,
  'admin A : « Salle 1 » mardi 17h, comme chez B, sans conflit entre centres');
select is(
  (select r.center_id::text from public.schedule_slots s join public.rooms r on r.id = s.room_id
   where s.center_id = 'ca900000-0000-4000-8000-000000000001'),
  'ca900000-0000-4000-8000-000000000001', 'admin A : la « Salle 1 » créée est celle de A, pas celle de B');

update public.rooms set name = 'Piratée', capacity = 1 where id = 'fb900000-0000-4000-8000-000000000001';
delete from public.rooms where id = 'fb900000-0000-4000-8000-000000000001';
select throws_ok(
  $$insert into public.rooms (center_id, name) values ('cb900000-0000-4000-8000-000000000001', 'Intruse')$$,
  '42501', null, 'admin A : aucune salle créée chez B');
select throws_ok(
  $$insert into public.schedule_conflicts_log (center_id, attempted_slot, conflict_type)
    values ('cb900000-0000-4000-8000-000000000001', '{}', 'room')$$,
  '42501', null, 'admin A : rien écrit au journal des conflits de B');
update public.schedule_conflicts_log set resolved_how = 'abandoned' where id = '8b900000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------
-- Accueil du centre A : absences de B
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"aa900000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.absences_to_notify), 0, 'accueil A : aucune absence de B à signaler');
select throws_ok(
  $$insert into public.absence_notifications (student_id, center_id, attendance_id, channel)
    values ('5b900000-0000-4000-8000-000000000001', 'cb900000-0000-4000-8000-000000000001', '9b900000-0000-4000-8000-000000000001', 'whatsapp')$$,
  '42501', null, 'accueil A : ne prévient pas le responsable d''un élève de B');
select throws_ok(
  $$insert into public.absence_notifications (student_id, center_id, attendance_id, channel)
    values ('5b900000-0000-4000-8000-000000000001', 'ca900000-0000-4000-8000-000000000001', '9b900000-0000-4000-8000-000000000001', 'phone_call')$$,
  '42501', null, 'accueil A : élève de B rattaché à son propre centre, refusé aussi');

-- ---------------------------------------------------------------------
-- Professeur de A : ni explication des conflits ni journal
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"aa900000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is(
  (select count(*)::int from public.slot_conflicts('da900000-0000-4000-8000-000000000001', 'aa900000-0000-4000-8000-00000000000c',
     (select id from public.rooms where center_id = 'ca900000-0000-4000-8000-000000000001'), 2::smallint, '17:00', '18:30')),
  0, 'professeur A : explication des conflits réservée à l''admin, même dans son centre');
select is((select count(*)::int from public.schedule_conflicts_log), 0, 'professeur A : journal des conflits invisible');

reset role;

-- B intact après les tentatives de A.
select results_eq(
  $$select name, capacity::int from public.rooms where id = 'fb900000-0000-4000-8000-000000000001'$$,
  $$values ('Salle 1'::text, 12)$$,
  'salle de B ni renommée ni supprimée par A');
select is((select resolved_how from public.schedule_conflicts_log where id = '8b900000-0000-4000-8000-000000000001'), null,
  'journal de B non modifié par A');
select is((select count(*)::int from public.absence_notifications where student_id = '5b900000-0000-4000-8000-000000000001'), 0,
  'aucune notification créée pour l''élève de B');
select is((select count(*)::int from public.schedule_slots where center_id = 'cb900000-0000-4000-8000-000000000001'), 1,
  'planning de B : toujours un seul cours');

-- ---------------------------------------------------------------------
-- Admin du centre B : il voit ses conflits, pas ceux de A
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"ab900000-0000-4000-8000-00000000000a","role":"authenticated"}';
select results_eq(
  $$select conflict_type::text, room_name from public.slot_conflicts('db900000-0000-4000-8000-000000000001',
      'ab900000-0000-4000-8000-00000000000c', 'fb900000-0000-4000-8000-000000000001', 2::smallint, '18:00', '19:00')$$,
  $$values ('room', 'Salle 1'), ('teacher', 'Salle 1'), ('level', 'Salle 1')$$,
  'admin B : ses propres conflits expliqués (contrôle positif), sans le cours de A au même moment');
reset role;

-- ---------------------------------------------------------------------
-- Super-admin en mode support chez B : lecture seule
-- ---------------------------------------------------------------------
insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a0900000-0000-4000-8000-00000000000d', 'cb900000-0000-4000-8000-000000000001', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0900000-0000-4000-8000-00000000000d","role":"authenticated"}';
select is((select count(*)::int from public.rooms), 1, 'support : salles de B lisibles');
select throws_ok(
  $$update public.rooms set capacity = 30 where id = 'fb900000-0000-4000-8000-000000000001'$$,
  '42501', null, 'support : salle de B non modifiable');
select throws_ok(
  $$insert into public.schedule_conflicts_log (center_id, attempted_slot, conflict_type)
    values ('cb900000-0000-4000-8000-000000000001', '{}', 'teacher')$$,
  '42501', null, 'support : rien écrit au journal des conflits');
reset role;

select * from finish();
rollback;
