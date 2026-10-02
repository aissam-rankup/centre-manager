-- =====================================================================
-- Salles, conflits de planning, alertes d'absence (page 7, phase 1)
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email) values
  ('a6000000-0000-4000-8000-000000000001', 'admin-p30@test.local'),
  ('a6000000-0000-4000-8000-000000000002', 'accueil-p30@test.local'),
  ('a6000000-0000-4000-8000-000000000003', 'prof1-p30@test.local'),
  ('a6000000-0000-4000-8000-000000000004', 'prof2-p30@test.local');
insert into public.centers (id, name, slug) values ('c6000000-0000-4000-8000-000000000001', 'Centre P30', 'centre-p30');
insert into public.profiles (id, center_id, full_name, role) values
  ('a6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'Admin', 'admin'),
  ('a6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'Accueil', 'assistant'),
  ('a6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000001', 'Prof Un', 'teacher'),
  ('a6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000001', 'Prof Deux', 'teacher');
insert into public.levels (id, center_id, name) values
  ('d6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'Niveau A'),
  ('d6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'Niveau B');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'Maths A', 300),
  ('e6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'Anglais A', 250),
  ('e6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002', 'Maths B', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000004', 'e6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-000000000004', 'e6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000002');

-- Créneau saisi par un simple nom : la salle est créée et reliée.
insert into public.schedule_slots (id, center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room) values
  ('56000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
   'd6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', 2, '14:00', '16:00', '  Salle B2 ');
select results_eq(
  $$select r.name, s.room from public.schedule_slots s join public.rooms r on r.id = s.room_id
    where s.id = '56000000-0000-4000-8000-000000000001'$$,
  $$values ('Salle B2', 'Salle B2')$$,
  'créneau saisi par son nom : salle créée et reliée');
select is((select count(*)::int from public.rooms where center_id = 'c6000000-0000-4000-8000-000000000001'), 1, 'une salle par nom (sans doublon)');

-- Conflits : chevauchement partiel 14h–16h / 15h–17h.
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
    values ('c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000002',
            'a6000000-0000-4000-8000-000000000004', 2, '15:00', '17:00', 'salle b2')$$,
  '23P01', null, 'conflit de salle : chevauchement partiel refusé (nom insensible à la casse)');
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
    values ('c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000002',
            'a6000000-0000-4000-8000-000000000003', 2, '15:00', '17:00', 'Salle C')$$,
  '23P01', null, 'conflit de professeur : déjà en cours ailleurs');
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
    values ('c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000001',
            'a6000000-0000-4000-8000-000000000004', 2, '15:30', '16:30', 'Salle D')$$,
  '23P01', null, 'conflit de niveau : même groupe, deux cours simultanés');
select lives_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
    values ('c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000001',
            'a6000000-0000-4000-8000-000000000004', 2, '16:00', '17:00', 'Salle B2')$$,
  'cours qui commence à la fin du précédent : accepté');
select lives_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
    values ('c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000002',
            'a6000000-0000-4000-8000-000000000003', 3, '14:00', '16:00', 'Salle B2')$$,
  'même salle et même horaire un autre jour : accepté');
select throws_ok(
  $$update public.schedule_slots set start_time = '15:30', end_time = '16:30'
    where day_of_week = 2 and start_time = '16:00'$$,
  '23P01', null, 'déplacement vers un créneau occupé : refusé aussi');

-- Salle renommée : le nom suit sur les créneaux.
update public.rooms set name = 'Salle Bleue' where center_id = 'c6000000-0000-4000-8000-000000000001' and name = 'Salle B2';
select is((select count(*)::int from public.schedule_slots where room = 'Salle Bleue'), 3, 'salle renommée : nom repris sur ses créneaux');

-- ---------------------------------------------------------------------
-- Droits sur les salles et le journal des conflits
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.rooms), 1, 'professeur : voit les salles (emploi du temps)');
select throws_ok($$insert into public.rooms (center_id, name) values ('c6000000-0000-4000-8000-000000000001', 'Intrus')$$,
  '42501', null, 'professeur : ne crée pas de salle');

set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$insert into public.rooms (center_id, name) values ('c6000000-0000-4000-8000-000000000001', 'Intrus')$$,
  '42501', null, 'accueil : ne crée pas de salle');
select throws_ok(
  $$insert into public.schedule_conflicts_log (center_id, attempted_slot, conflict_type) values ('c6000000-0000-4000-8000-000000000001', '{}', 'room')$$,
  '42501', null, 'accueil : pas d''accès au journal des conflits');

set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.rooms (center_id, name, capacity, equipment) values ('c6000000-0000-4000-8000-000000000001', 'Salle Verte', 18, '["projector"]')$$,
  'admin : crée une salle (capacité, équipements)');
select throws_ok($$insert into public.rooms (center_id, name) values ('c6000000-0000-4000-8000-000000000001', 'salle verte')$$,
  '23505', null, 'deux salles de même nom refusées');
select lives_ok(
  $$insert into public.schedule_conflicts_log (center_id, attempted_slot, conflict_type, resolved_how)
    values ('c6000000-0000-4000-8000-000000000001', '{"day_of_week": 2}', 'level', 'other_time')$$,
  'admin : conflit journalisé avec sa résolution');
reset role;

-- ---------------------------------------------------------------------
-- Alertes d'absence : une seule par séance, sauf relance explicite
-- ---------------------------------------------------------------------
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('f6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'Élève P30', 'd6000000-0000-4000-8000-000000000001', '0612345678');
insert into public.enrollments (student_id, subject_id) values ('f6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.attendance (id, student_id, subject_id, teacher_id, session_date, status) values
  ('96000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
   'a6000000-0000-4000-8000-000000000003', private.today() - 1, 'absent'),
  ('96000000-0000-4000-8000-000000000002', 'f6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
   'a6000000-0000-4000-8000-000000000003', private.today() - 8, 'present');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$insert into public.absence_notifications (student_id, center_id, attendance_id, channel, guardian_phone_used, message_body)
    values ('f6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001',
            'whatsapp', '0612345678', 'Bonjour…')$$,
  'accueil : responsable prévenu');
select throws_ok(
  $$insert into public.absence_notifications (student_id, center_id, attendance_id, channel)
    values ('f6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', 'whatsapp')$$,
  '23505', null, 'même séance : pas de seconde notification');
select lives_ok(
  $$insert into public.absence_notifications (student_id, center_id, attendance_id, channel, is_repeat)
    values ('f6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', 'phone_call', true)$$,
  'relance explicite : acceptée');
select throws_ok(
  $$insert into public.absence_notifications (student_id, center_id, attendance_id, channel)
    values ('f6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', 'whatsapp')$$,
  '23514', null, 'séance où l''élève était présent : refusée');
select is((select sent_by::text from public.absence_notifications limit 1), 'a6000000-0000-4000-8000-000000000002',
  'notification horodatée avec son auteur');
select results_eq(
  $$select notified_channel is not null, notified_by, start_time::text from public.absences_to_notify
    where attendance_id = '96000000-0000-4000-8000-000000000001'$$,
  $$values (true, 'Accueil', null::text)$$,
  'absences à signaler : dernière notification, auteur, horaire (aucun créneau ce jour-là)');
select is((select count(*)::int from public.absences_to_notify where attendance_id = '96000000-0000-4000-8000-000000000002'), 0,
  'absences à signaler : séance où l''élève était présent exclue');

set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.absence_notifications), 0, 'professeur : ne voit pas les notifications aux responsables');
reset role;

select * from finish();
rollback;
