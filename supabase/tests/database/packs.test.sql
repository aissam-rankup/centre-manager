-- =====================================================================
-- Tests des packs d'abonnement — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
  ('a6000000-0000-4000-8000-000000000001', 'admin-p8@test.local'),
  ('a6000000-0000-4000-8000-000000000002', 'assistant-p8@test.local'),
  ('a6000000-0000-4000-8000-000000000003', 'prof-p8@test.local');
insert into public.centers (id, name) values ('c6000000-0000-4000-8000-000000000001', 'Centre P8');
insert into public.profiles (id, center_id, full_name, role) values
  ('a6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'Admin P8', 'admin'),
  ('a6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'Assistant P8', 'assistant'),
  ('a6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000001', 'Prof P8', 'teacher');
insert into public.levels (id, center_id, name) values
  ('d6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2AC P8'),
  ('d6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', '3AC P8');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'Maths', 200),
  ('e6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'PC', 200),
  ('e6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'SVT', 200),
  ('e6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002', 'Maths 3AC', 250);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001');
insert into public.students (id, center_id, full_name, level_id) values
  ('f6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'Élève pack', 'd6000000-0000-4000-8000-000000000001'),
  ('f6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'Élève unité', 'd6000000-0000-4000-8000-000000000001');
insert into public.enrollments (student_id, subject_id) values
  ('f6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------
-- Catalogue (admin)
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.packs (id, center_id, level_id, name, monthly_price) values
  ('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'Pack sciences', 350);
insert into public.pack_subjects (pack_id, subject_id) values
  ('b6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002');
select throws_ok(
  $$insert into public.pack_subjects (pack_id, subject_id)
    values ('b6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000004')$$,
  '23514', null, 'pack : matière d''un autre niveau refusée');

-- ---------------------------------------------------------------------
-- Souscription (assistant)
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$insert into public.pack_enrollments (id, student_id, pack_id)
    values ('b7000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001')$$,
  'assistant : souscrit un pack');
select results_eq(
  $$select count(*)::int, sum(price_agreed)::int from public.enrollments
    where pack_enrollment_id = 'b7000000-0000-4000-8000-000000000001' and active$$,
  $$values (2, 0)$$,
  'souscription : inscrit aux 2 matières du pack, sans prix propre');
select results_eq(
  $$select count(*)::int, max(amount_due)::int, max(due_date) from public.invoices
    where student_id = 'f6000000-0000-4000-8000-000000000001'$$,
  $$values (1, 350, private.today() + 5)$$,
  'facturation : une seule facture au prix du pack, due 5 jours après');
select throws_ok(
  $$insert into public.pack_enrollments (student_id, pack_id, price_agreed)
    values ('f6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 300)$$,
  '42501', null, 'assistant : ne fixe pas un autre prix de pack');
select throws_ok(
  $$insert into public.enrollments (student_id, subject_id)
    values ('f6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000003')$$,
  '23514', null, 'pack actif : pas de matière à l''unité en plus');
select throws_ok(
  $$insert into public.pack_enrollments (student_id, pack_id)
    values ('f6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'matières à l''unité actives : pas de pack en plus');

-- Nouvel élève directement en pack.
select lives_ok(
  $$select public.create_student('f6000000-0000-4000-8000-000000000003', 'Nouvel élève pack',
      'd6000000-0000-4000-8000-000000000001', '{}'::uuid[], null, null, null, null,
      'b6000000-0000-4000-8000-000000000001')$$,
  'create_student : inscription en pack');
select is(
  (select count(*)::int from public.enrollments where student_id = 'f6000000-0000-4000-8000-000000000003' and active),
  2, 'create_student : inscrit aux matières du pack');
select throws_ok(
  $$select public.create_student(gen_random_uuid(), 'Double', 'd6000000-0000-4000-8000-000000000001',
      array['e6000000-0000-4000-8000-000000000003']::uuid[], null, null, null, null,
      'b6000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'create_student : pack et matières à la fois refusés');

-- ---------------------------------------------------------------------
-- Professeur : l'élève en pack est dans ses listes de classe
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.class_rosters
    where student_id = 'f6000000-0000-4000-8000-000000000001' and subject_id = 'e6000000-0000-4000-8000-000000000001' and active),
  1, 'professeur : l''élève en pack apparaît dans la liste de sa matière');
select is((select count(*)::int from public.packs), 0, 'professeur : aucun accès aux packs (prix)');

-- ---------------------------------------------------------------------
-- Gestion (admin)
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$update public.enrollments set active = false
    where pack_enrollment_id = 'b7000000-0000-4000-8000-000000000001' and subject_id = 'e6000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'matière d''un pack : ne s''arrête pas seule');

insert into public.pack_subjects (pack_id, subject_id) values
  ('b6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000003');
delete from public.pack_subjects
where pack_id = 'b6000000-0000-4000-8000-000000000001' and subject_id = 'e6000000-0000-4000-8000-000000000002';
select results_eq(
  $$select subject_id from public.enrollments
    where pack_enrollment_id = 'b7000000-0000-4000-8000-000000000001' order by subject_id$$,
  $$values ('e6000000-0000-4000-8000-000000000001'::uuid), ('e6000000-0000-4000-8000-000000000003'::uuid)$$,
  'pack modifié : les abonnés suivent (SVT ajoutée, PC retirée)');

update public.pack_enrollments set active = false where id = 'b7000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.enrollments where pack_enrollment_id = 'b7000000-0000-4000-8000-000000000001' and active),
  0, 'arrêt du pack : toutes ses matières s''arrêtent');

reset role;
delete from public.invoices where pack_enrollment_id = 'b7000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000001","role":"authenticated"}';

update public.pack_enrollments set active = true where id = 'b7000000-0000-4000-8000-000000000001';
select results_eq(
  $$select (select count(*)::int from public.enrollments
             where pack_enrollment_id = 'b7000000-0000-4000-8000-000000000001' and active),
           (select count(*)::int from public.invoices
             where pack_enrollment_id = 'b7000000-0000-4000-8000-000000000001')$$,
  $$values (2, 1)$$,
  'reprise du pack : matières réactivées et période en cours facturée');

select results_eq(
  $$select pack_name, subscribers, agreed_revenue::int from public.admin_pack_report()$$,
  $$values ('Pack sciences'::text, 2, 700)$$,
  'rapport : abonnés et revenu du pack');

select throws_ok(
  $$delete from public.packs where id = 'b6000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'pack avec abonnés : suppression refusée');

reset role;

-- ---------------------------------------------------------------------
-- Génération mensuelle
-- ---------------------------------------------------------------------
do $$ begin perform private.generate_invoices((private.today() + interval '1 month')::date); end $$;
select results_eq(
  $$select count(*)::int from public.invoices
    where student_id = 'f6000000-0000-4000-8000-000000000001' and pack_enrollment_id is not null$$,
  $$values (2)$$,
  'génération : la période suivante du pack est facturée');
select is(
  (select count(*)::int from public.invoices i
    join public.enrollments e on e.id = i.enrollment_id
    where e.pack_enrollment_id is not null),
  0, 'génération : aucune facture pour les matières d''un pack');

select * from finish();
rollback;
