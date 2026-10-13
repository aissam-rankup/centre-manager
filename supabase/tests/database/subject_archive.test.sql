-- =====================================================================
-- Matières : suppression définitive sans historique, archivage sinon,
-- réactivation ; garde-fous sur une matière archivée ; droits.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

insert into auth.users (id, email) values
  ('a8300000-0000-4000-8000-000000000001', 'admin@subject-archive.test'),
  ('a8300000-0000-4000-8000-000000000002', 'assistant@subject-archive.test'),
  ('a8300000-0000-4000-8000-000000000003', 'prof@subject-archive.test'),
  ('a8300000-0000-4000-8000-000000000011', 'admin-b@subject-archive.test');
insert into public.centers (id, name, slug) values
  ('c8300000-0000-4000-8000-000000000001', 'Centre Matières A', 'subject-archive-a'),
  ('c8300000-0000-4000-8000-000000000002', 'Centre Matières B', 'subject-archive-b');
insert into public.profiles (id, center_id, full_name, role, pay_mode) values
  ('a8300000-0000-4000-8000-000000000001', 'c8300000-0000-4000-8000-000000000001', 'Admin A', 'admin', null),
  ('a8300000-0000-4000-8000-000000000002', 'c8300000-0000-4000-8000-000000000001', 'Assistant A', 'assistant', null),
  ('a8300000-0000-4000-8000-000000000003', 'c8300000-0000-4000-8000-000000000001', 'Prof A', 'teacher', 'commission'),
  ('a8300000-0000-4000-8000-000000000011', 'c8300000-0000-4000-8000-000000000002', 'Admin B', 'admin', null);
insert into public.levels (id, center_id, name) values
  ('d8300000-0000-4000-8000-000000000001', 'c8300000-0000-4000-8000-000000000001', 'Niveau A');
insert into public.rooms (id, center_id, name) values
  ('e8300000-0000-4000-8000-0000000000aa', 'c8300000-0000-4000-8000-000000000001', 'Salle 1');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e8300000-0000-4000-8000-000000000001', 'c8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000001', 'Neuve', 200),
  ('e8300000-0000-4000-8000-000000000002', 'c8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000001', 'Historique', 300),
  ('e8300000-0000-4000-8000-000000000003', 'c8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000001', 'En cours', 250),
  ('e8300000-0000-4000-8000-000000000004', 'c8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000001', 'En pack', 150);
insert into public.packs (id, center_id, level_id, name, monthly_price) values
  ('b8300000-0000-4000-8000-000000000001', 'c8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000001', 'Pack Duo', 350);
insert into public.pack_subjects (pack_id, subject_id) values
  ('b8300000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000004');

-- « Neuve » : professeur, créneau, taux, remise ; aucun historique.
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a8300000-0000-4000-8000-000000000003', 'e8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000001'),
  ('a8300000-0000-4000-8000-000000000003', 'e8300000-0000-4000-8000-000000000002', 'd8300000-0000-4000-8000-000000000001');
insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room, room_id) values
  ('c8300000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000001',
   'a8300000-0000-4000-8000-000000000003', 1, '09:00', '10:00', 'Salle 1', 'e8300000-0000-4000-8000-0000000000aa'),
  ('c8300000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000002', 'd8300000-0000-4000-8000-000000000001',
   'a8300000-0000-4000-8000-000000000003', 2, '09:00', '10:00', 'Salle 1', 'e8300000-0000-4000-8000-0000000000aa');
insert into public.teacher_commissions (center_id, teacher_id, subject_id, level_id, rate_percent, effective_from) values
  ('c8300000-0000-4000-8000-000000000001', 'a8300000-0000-4000-8000-000000000003', 'e8300000-0000-4000-8000-000000000001',
   'd8300000-0000-4000-8000-000000000001', 30, '2026-01-01');

-- Élèves : un ancien de « Historique » (inscription arrêtée, facture, présence), un inscrit à « En cours ».
insert into public.students (id, center_id, full_name, level_id) values
  ('f8300000-0000-4000-8000-000000000001', 'c8300000-0000-4000-8000-000000000001', 'Ancien', 'd8300000-0000-4000-8000-000000000001'),
  ('f8300000-0000-4000-8000-000000000002', 'c8300000-0000-4000-8000-000000000001', 'Actuel', 'd8300000-0000-4000-8000-000000000001');
insert into public.enrollments (id, student_id, subject_id, start_date, price_agreed) values
  ('98300000-0000-4000-8000-000000000001', 'f8300000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000002', '2026-01-01', 300),
  ('98300000-0000-4000-8000-000000000002', 'f8300000-0000-4000-8000-000000000002', 'e8300000-0000-4000-8000-000000000003', '2026-01-01', 250);
update public.enrollments set active = false where id = '98300000-0000-4000-8000-000000000001';
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f8300000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000002', 'a8300000-0000-4000-8000-000000000003', '2026-01-12', 'present');

-- ---------------------------------------------------------------------
-- Admin : dépendances et suppression
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8300000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select row(d ->> 'active_enrollments', d ->> 'past_enrollments', d ->> 'attendance', d ->> 'packs', d ->> 'resources')::text
   from public.subject_dependencies('e8300000-0000-4000-8000-000000000001') d),
  '(0,0,0,0,0)', 'matière neuve : rien de bloquant');
select is(
  (select row(d ->> 'teachers', d ->> 'slots', d ->> 'rates')::text
   from public.subject_dependencies('e8300000-0000-4000-8000-000000000001') d),
  '(1,1,1)', 'matière neuve : professeur, créneau et taux détachables comptés');
select lives_ok($$select public.delete_subject('e8300000-0000-4000-8000-000000000001')$$, 'matière neuve : supprimée');
select is((select count(*)::int from public.subjects where id = 'e8300000-0000-4000-8000-000000000001'), 0, 'matière neuve : plus là');
select is((select count(*)::int from public.teacher_assignments where subject_id = 'e8300000-0000-4000-8000-000000000001'), 0,
  'affectation du professeur détachée');
select is((select count(*)::int from public.schedule_slots where subject_id = 'e8300000-0000-4000-8000-000000000001'), 0,
  'créneau détaché');

select is(
  (select row(d ->> 'active_enrollments', d ->> 'past_enrollments', d ->> 'attendance')::text
   from public.subject_dependencies('e8300000-0000-4000-8000-000000000002') d),
  '(0,1,1)', 'matière avec historique : inscription passée et présence comptées');
select ok(
  (select (d ->> 'invoices')::int >= 1 from public.subject_dependencies('e8300000-0000-4000-8000-000000000002') d),
  'matière avec historique : factures comptées');
select throws_ok($$select public.delete_subject('e8300000-0000-4000-8000-000000000002')$$, '23503', null,
  'matière avec historique : suppression refusée (archivage proposé)');
select throws_ok($$select public.delete_subject('e8300000-0000-4000-8000-000000000004')$$, '23503', null,
  'matière dans un pack : suppression refusée');

-- ---------------------------------------------------------------------
-- Archivage
-- ---------------------------------------------------------------------
select is(public.archive_subject('e8300000-0000-4000-8000-000000000002'), 1, 'archivage : un créneau retiré');
select isnt((select archived_at from public.subjects where id = 'e8300000-0000-4000-8000-000000000002'), null, 'matière archivée');
select is((select archived_by from public.subjects where id = 'e8300000-0000-4000-8000-000000000002'),
  'a8300000-0000-4000-8000-000000000001'::uuid, 'archivée par l''admin');
select is((select count(*)::int from public.schedule_slots where subject_id = 'e8300000-0000-4000-8000-000000000002'), 0,
  'créneaux de la matière archivée retirés');
select is((select count(*)::int from public.invoices where enrollment_id = '98300000-0000-4000-8000-000000000001') > 0, true,
  'historique : factures conservées');
select is((select count(*)::int from public.attendance where subject_id = 'e8300000-0000-4000-8000-000000000002'), 1,
  'historique : présences conservées');
select is(public.archive_subject('e8300000-0000-4000-8000-000000000002'), 0, 'archiver deux fois : sans effet');

select throws_ok($$select public.archive_subject('e8300000-0000-4000-8000-000000000003')$$, '22023',
  'Archivage impossible : 1 inscription(s) en cours dans cette matière. Arrêtez-les d''abord.',
  'élèves inscrits : archivage refusé avec leur nombre');
select throws_ok($$select public.archive_subject('e8300000-0000-4000-8000-000000000004')$$, '22023',
  'Archivage impossible : la matière fait partie d''un pack proposé (Pack Duo). Retirez-la du pack ou désactivez le pack.',
  'pack proposé : archivage refusé avec son nom');

-- Plus rien de nouveau sur une matière archivée.
select throws_ok(
  $$insert into public.enrollments (student_id, subject_id, price_agreed) values ('f8300000-0000-4000-8000-000000000002', 'e8300000-0000-4000-8000-000000000002', 300)$$,
  '22023', null, 'archivée : pas de nouvelle inscription');
select throws_ok(
  $$update public.enrollments set active = true where id = '98300000-0000-4000-8000-000000000001'$$,
  '22023', null, 'archivée : pas de reprise d''inscription');
select throws_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room, room_id)
    values ('c8300000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000002', 'd8300000-0000-4000-8000-000000000001',
            'a8300000-0000-4000-8000-000000000003', 3, '09:00', '10:00', 'Salle 1', 'e8300000-0000-4000-8000-0000000000aa')$$,
  '22023', null, 'archivée : pas de nouveau créneau');
select throws_ok(
  $$insert into public.pack_subjects (pack_id, subject_id) values ('b8300000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000002')$$,
  '22023', null, 'archivée : pas d''ajout à un pack');
select throws_ok(
  $$update public.subjects set archived_at = null where id = 'e8300000-0000-4000-8000-000000000002'$$,
  '42501', null, 'archivage : jamais par une écriture directe');

-- ---------------------------------------------------------------------
-- Assistant et autre centre : rien
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a8300000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.subject_dependencies('e8300000-0000-4000-8000-000000000003')$$, '42501', null, 'assistant : pas de dépendances');
select throws_ok($$select public.archive_subject('e8300000-0000-4000-8000-000000000003')$$, '42501', null, 'assistant : n''archive pas');
select throws_ok($$select public.unarchive_subject('e8300000-0000-4000-8000-000000000002')$$, '42501', null, 'assistant : ne réactive pas');
select throws_ok($$select public.delete_subject('e8300000-0000-4000-8000-000000000003')$$, '42501', null, 'assistant : ne supprime pas');

set local request.jwt.claims = '{"sub":"a8300000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok($$select public.unarchive_subject('e8300000-0000-4000-8000-000000000002')$$, '42501', null, 'admin d''un autre centre : ne réactive pas');
select throws_ok($$select public.delete_subject('e8300000-0000-4000-8000-000000000003')$$, '42501', null, 'admin d''un autre centre : ne supprime pas');

-- ---------------------------------------------------------------------
-- Réactivation ; pack et matière archivée
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a8300000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.packs set active = false where id = 'b8300000-0000-4000-8000-000000000001';
select is(public.archive_subject('e8300000-0000-4000-8000-000000000004'), 0, 'pack désactivé : la matière s''archive');
select throws_ok(
  $$update public.packs set active = true where id = 'b8300000-0000-4000-8000-000000000001'$$,
  '22023', null, 'pack avec une matière archivée : ne se repropose pas');

select lives_ok($$select public.unarchive_subject('e8300000-0000-4000-8000-000000000002')$$, 'réactivation');
select is((select archived_at from public.subjects where id = 'e8300000-0000-4000-8000-000000000002'), null, 'matière réactivée');
select lives_ok(
  $$insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room, room_id)
    values ('c8300000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000002', 'd8300000-0000-4000-8000-000000000001',
            'a8300000-0000-4000-8000-000000000003', 3, '09:00', '10:00', 'Salle 1', 'e8300000-0000-4000-8000-0000000000aa')$$,
  'réactivée : de nouveau planifiable');
select lives_ok(
  $$update public.enrollments set active = true where id = '98300000-0000-4000-8000-000000000001'$$,
  'réactivée : l''inscription se reprend');

select * from finish();
rollback;
