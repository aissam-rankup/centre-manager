-- =====================================================================
-- Tests de l'espace Assistant — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------
-- Cycles de facturation
-- ---------------------------------------------------------------------
select is(private.billing_period_start(date '2026-09-24', 1::smallint), date '2026-09-01', 'cycle du 1er : période au 1er du mois');
select is(private.billing_period_start(date '2026-09-24', 15::smallint), date '2026-09-15', 'cycle du 15 : période au 15 du mois');
select is(private.billing_period_start(date '2026-10-03', 15::smallint), date '2026-09-15', 'cycle du 15 : avant le 15, période du mois précédent');

-- ---------------------------------------------------------------------
-- Données de test
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a2000000-0000-4000-8000-000000000001', 'assistant-p4@test.local'),
  ('a2000000-0000-4000-8000-000000000002', 'prof-p4@test.local');

insert into public.centers (id, name) values ('c2000000-0000-4000-8000-000000000001', 'Centre P4');

insert into public.profiles (id, center_id, full_name, role) values
  ('a2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Assistant P4', 'assistant'),
  ('a2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Prof P4', 'teacher');

insert into public.levels (id, center_id, name) values
  ('d2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Niveau 1'),
  ('d2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Niveau 2');

insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Maths', 400),
  ('e2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Anglais', 250),
  ('e2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'Physique', 450);

-- ---------------------------------------------------------------------
-- Assistant : création d'élève
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.create_student(
      'f2000000-0000-4000-8000-000000000001', '  Élodie Ämrani ', 'd2000000-0000-4000-8000-000000000001',
      array['e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002']::uuid[],
      'Mme Amrani', '06 00 00 00 00', null, null)$$,
  'assistant : crée un élève et ses inscriptions');
select is((select count(*)::int from public.enrollments where student_id = 'f2000000-0000-4000-8000-000000000001'), 2,
  'création : une inscription par matière');
select is((select sum(price_agreed) from public.enrollments where student_id = 'f2000000-0000-4000-8000-000000000001'), 650.00::numeric,
  'création : prix convenu = tarif des matières');
select is((select count(*)::int from public.invoices where student_id = 'f2000000-0000-4000-8000-000000000001'), 2,
  'création : première facture créée pour chaque inscription');
select is((select min(due_date) from public.invoices where student_id = 'f2000000-0000-4000-8000-000000000001'), private.today() + 5,
  'création : première facture due 5 jours après l''inscription');
select is((select search_name from public.students where id = 'f2000000-0000-4000-8000-000000000001'), 'elodie amrani',
  'recherche : nom normalisé sans accents ni majuscules');
select throws_ok(
  $$select public.create_student(
      'f2000000-0000-4000-8000-000000000002', 'Élève mal inscrit', 'd2000000-0000-4000-8000-000000000001',
      array['e2000000-0000-4000-8000-000000000003']::uuid[])$$,
  '22023', null, 'création : matière d''un autre niveau refusée');
select is((select count(*)::int from public.students where id = 'f2000000-0000-4000-8000-000000000002'), 0,
  'création : rien n''est créé en cas d''erreur (transaction)');

-- ---------------------------------------------------------------------
-- Paiement et résolution de l'alerte
-- ---------------------------------------------------------------------
reset role;
-- Préparation en tant que superutilisateur, sans identité d'utilisateur.
set local request.jwt.claims = '';
insert into public.alerts (student_id, type, payload)
select i.student_id, 'overdue_payment', jsonb_build_object('invoice_id', i.id)
from public.invoices i
where i.student_id = 'f2000000-0000-4000-8000-000000000001'
order by i.amount_due desc
limit 1;
update public.invoices set status = 'overdue', due_date = private.today() - 1
where student_id = 'f2000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.follow_up_queue where student_id = 'f2000000-0000-4000-8000-000000000001'), 1,
  'relance : l''élève en retard apparaît dans la file');
select lives_ok(
  $$select public.mark_invoice_paid(i.id) from public.invoices i
    where i.student_id = 'f2000000-0000-4000-8000-000000000001' order by i.amount_due desc limit 1$$,
  'assistant : marque une facture comme payée');
select is((select count(*)::int from public.alerts where student_id = 'f2000000-0000-4000-8000-000000000001' and not resolved), 0,
  'paiement : l''alerte de retard liée est résolue');
select throws_ok(
  $$select public.mark_invoice_paid(i.id) from public.invoices i
    where i.student_id = 'f2000000-0000-4000-8000-000000000001' and i.status = 'paid' limit 1$$,
  'P0002', null, 'paiement : une facture déjà payée est refusée');

-- ---------------------------------------------------------------------
-- Professeur : aucun accès aux fonctions de l'accueil
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.create_student('f2000000-0000-4000-8000-000000000003', 'Intrus', 'd2000000-0000-4000-8000-000000000001',
      array['e2000000-0000-4000-8000-000000000001']::uuid[])$$,
  '42501', null, 'professeur : ne peut pas créer d''élève');
select is((select unpaid_count from public.assistant_dashboard_stats()), 0,
  'professeur : indicateurs financiers vides (aucune facture visible)');

reset role;

select * from finish();
rollback;
