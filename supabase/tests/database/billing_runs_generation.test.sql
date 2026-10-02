-- =====================================================================
-- Réinscription (page 8, phase 2) : préparation des campagnes, coexistence
-- avec la facturation quotidienne, retard le lendemain de l'échéance
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email) values
  ('a2800000-0000-4000-8000-000000000001', 'admin-c-p82@test.local'),
  ('a2800000-0000-4000-8000-000000000002', 'admin-d-p82@test.local'),
  ('a2800000-0000-4000-8000-000000000003', 'accueil-d-p82@test.local');
insert into public.centers (id, name, slug, auto_reenrollment_enabled) values
  ('c2800000-0000-4000-8000-0000000000c1', 'Centre C', 'p82-c', true),
  ('c2800000-0000-4000-8000-0000000000d1', 'Centre D', 'p82-d', false);
insert into public.profiles (id, center_id, full_name, role) values
  ('a2800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-0000000000c1', 'Admin C', 'admin'),
  ('a2800000-0000-4000-8000-000000000002', 'c2800000-0000-4000-8000-0000000000d1', 'Admin D', 'admin'),
  ('a2800000-0000-4000-8000-000000000003', 'c2800000-0000-4000-8000-0000000000d1', 'Accueil D', 'assistant');
insert into public.levels (id, center_id, name) values
  ('d2800000-0000-4000-8000-0000000000c1', 'c2800000-0000-4000-8000-0000000000c1', 'Niveau C'),
  ('d2800000-0000-4000-8000-0000000000d1', 'c2800000-0000-4000-8000-0000000000d1', 'Niveau D');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e2800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-0000000000c1', 'd2800000-0000-4000-8000-0000000000c1', 'Maths', 300),
  ('e2800000-0000-4000-8000-000000000002', 'c2800000-0000-4000-8000-0000000000c1', 'd2800000-0000-4000-8000-0000000000c1', 'Anglais', 250),
  ('e2800000-0000-4000-8000-000000000003', 'c2800000-0000-4000-8000-0000000000c1', 'd2800000-0000-4000-8000-0000000000c1', 'Physique', 200),
  ('e2800000-0000-4000-8000-0000000000d1', 'c2800000-0000-4000-8000-0000000000d1', 'd2800000-0000-4000-8000-0000000000d1', 'Maths D', 300);
insert into public.packs (id, center_id, level_id, name, monthly_price) values
  ('f2800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-0000000000c1', 'd2800000-0000-4000-8000-0000000000c1', 'Pack sciences', 400);
insert into public.pack_subjects (pack_id, subject_id) values
  ('f2800000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000001'),
  ('f2800000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000003');
insert into public.students (id, center_id, full_name, level_id) values
  ('52800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-0000000000c1', 'Élève 1', 'd2800000-0000-4000-8000-0000000000c1'),
  ('52800000-0000-4000-8000-000000000002', 'c2800000-0000-4000-8000-0000000000c1', 'Élève 2', 'd2800000-0000-4000-8000-0000000000c1'),
  ('52800000-0000-4000-8000-000000000003', 'c2800000-0000-4000-8000-0000000000c1', 'Élève 3', 'd2800000-0000-4000-8000-0000000000c1'),
  ('52800000-0000-4000-8000-000000000004', 'c2800000-0000-4000-8000-0000000000c1', 'Élève 4', 'd2800000-0000-4000-8000-0000000000c1'),
  ('52800000-0000-4000-8000-000000000005', 'c2800000-0000-4000-8000-0000000000d1', 'Élève 5', 'd2800000-0000-4000-8000-0000000000d1'),
  ('52800000-0000-4000-8000-000000000006', 'c2800000-0000-4000-8000-0000000000c1', 'Élève 6', 'd2800000-0000-4000-8000-0000000000c1');

-- Élève 1 : Maths (cycle du 1er) et Anglais (cycle du 15), remise de 10 %.
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day) values
  ('62800000-0000-4000-8000-000000000011', '52800000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('62800000-0000-4000-8000-000000000012', '52800000-0000-4000-8000-000000000001', 'e2800000-0000-4000-8000-000000000002', '2026-09-20', 15),
-- Élève 3 : inscription arrêtée ; élève 4 : commence après le début de la période.
  ('62800000-0000-4000-8000-000000000031', '52800000-0000-4000-8000-000000000003', 'e2800000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('62800000-0000-4000-8000-000000000041', '52800000-0000-4000-8000-000000000004', 'e2800000-0000-4000-8000-000000000001', '2026-11-10', 1),
-- Élève 5 : centre D, réinscription désactivée.
  ('62800000-0000-4000-8000-000000000051', '52800000-0000-4000-8000-000000000005', 'e2800000-0000-4000-8000-0000000000d1', '2026-09-01', 1);
update public.enrollments set active = false where id = '62800000-0000-4000-8000-000000000031';
-- Élève 2 : pack (cycle du 1er).
insert into public.pack_enrollments (id, student_id, pack_id, start_date, billing_day)
values ('72800000-0000-4000-8000-000000000021', '52800000-0000-4000-8000-000000000002', 'f2800000-0000-4000-8000-000000000001', '2026-09-01', 1);
insert into public.discounts (center_id, student_id, type, value, scope, reason, valid_from)
values ('c2800000-0000-4000-8000-0000000000c1', '52800000-0000-4000-8000-000000000001', 'percentage', 10, 'all_subjects', 'sibling', '2026-09-01');

-- ---------------------------------------------------------------------
-- Préparation automatique
-- ---------------------------------------------------------------------
select is(private.generate_billing_runs('2026-10-24'), 0, 'avant le jour de préparation : rien');
select is(private.generate_billing_runs('2026-10-25'), 1, 'le 25 : campagne de novembre préparée (centre qui a activé l''option seulement)');
select results_eq(
  $$select status::text, period_year::int, period_month::int, generated_by is null, student_count, total_expected
    from public.billing_runs where center_id = 'c2800000-0000-4000-8000-0000000000c1'$$,
  $$values ('draft', 2026, 11, true, 2, 895.00::numeric)$$,
  'brouillon de novembre : 2 élèves, 895 MAD, préparé automatiquement');
select is((select count(*)::int from public.billing_runs where center_id = 'c2800000-0000-4000-8000-0000000000d1'), 0,
  'centre sans réinscription automatique : aucune campagne');
select results_eq(
  $$select period_start, period_end, due_date, amount_full, discount_amount, amount_due from public.billing_run_lines
    where enrollment_id = '62800000-0000-4000-8000-000000000011'$$,
  $$values ('2026-11-01'::date, '2026-11-30'::date, '2026-11-05'::date, 300.00::numeric, 30.00::numeric, 270.00::numeric)$$,
  'cycle du 1er : période de novembre, échéance le 5, remise déduite');
select results_eq(
  $$select period_start, period_end, due_date, amount_due from public.billing_run_lines
    where enrollment_id = '62800000-0000-4000-8000-000000000012'$$,
  $$values ('2026-11-15'::date, '2026-12-14'::date, '2026-11-19'::date, 225.00::numeric)$$,
  'cycle du 15 : période du 15, échéance décalée au 19');
select is((select amount_due from public.billing_run_lines where pack_enrollment_id = '72800000-0000-4000-8000-000000000021'),
  400.00::numeric, 'pack : une ligne au tarif du pack');
select is((select count(*)::int from public.billing_run_lines l join public.billing_runs br on br.id = l.billing_run_id
           where br.center_id = 'c2800000-0000-4000-8000-0000000000c1'), 3,
  'ni inscription arrêtée, ni inscription qui commence en cours de période, ni matière d''un pack');
select results_eq(
  $$select intent::text, jsonb_array_length(subjects_kept) from public.reenrollment_intents
    where center_id = 'c2800000-0000-4000-8000-0000000000c1' order by 2 desc$$,
  $$values ('pending', 2), ('pending', 1)$$,
  'une intention en attente par élève, matières reconduites par défaut');
select is((select count(*)::int from public.invoices i join public.students s on s.id = i.student_id
           where s.center_id = 'c2800000-0000-4000-8000-0000000000c1' and i.period_start >= '2026-11-01'
             and i.enrollment_id is distinct from '62800000-0000-4000-8000-000000000041'), 0,
  'le brouillon n''émet aucune facture (l''élève 4, inscrit pour le 10, a sa première facture dès l''inscription)');
select ok((select (payload ->> 'automatic')::boolean from public.center_events
           where center_id = 'c2800000-0000-4000-8000-0000000000c1' and action = 'billing_run.generated'),
  'préparation consignée au journal du centre (automatique)');
select is(private.generate_billing_runs('2026-10-26'), 0, 'rattrapage : la campagne existe déjà, rien de plus');

-- ---------------------------------------------------------------------
-- Facturation quotidienne : ce que la campagne couvre n'est pas facturé
-- ---------------------------------------------------------------------
-- Élève 6 inscrit après la préparation : il rejoint le brouillon.
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day)
values ('62800000-0000-4000-8000-000000000061', '52800000-0000-4000-8000-000000000006', 'e2800000-0000-4000-8000-000000000003', '2026-10-28', 1);
select private.generate_invoices('2026-11-01');
select is((select count(*)::int from public.invoices
           where period_start = '2026-11-01'
             and (enrollment_id = '62800000-0000-4000-8000-000000000011' or pack_enrollment_id = '72800000-0000-4000-8000-000000000021')), 0,
  '1er novembre : lignes de la campagne non facturées (elles le seront à la confirmation)');
select is((select count(*)::int from public.invoices where period_start = '2026-11-01' and enrollment_id = '62800000-0000-4000-8000-000000000061'), 0,
  'inscription postérieure à la préparation : dans le brouillon, pas facturée par le job quotidien');
select is((select count(*)::int from public.invoices where period_start = '2026-11-01' and enrollment_id = '62800000-0000-4000-8000-000000000051'), 1,
  'centre sans réinscription automatique : facturation inchangée');
select private.generate_invoices('2026-11-15');
select is((select count(*)::int from public.invoices where period_start = '2026-11-15' and enrollment_id = '62800000-0000-4000-8000-000000000012'), 0,
  '15 novembre : ligne du cycle du 15 non facturée non plus');

-- Mois sans campagne (vacances) : rien n'est facturé pour le centre.
select private.generate_billing_runs('2026-11-25');
update public.billing_runs set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Vacances'
where center_id = 'c2800000-0000-4000-8000-0000000000c1' and period_year = 2026 and period_month = 12;
select private.generate_invoices('2026-12-01');
select is((select count(*)::int from public.invoices i join public.students s on s.id = i.student_id
           where s.center_id = 'c2800000-0000-4000-8000-0000000000c1' and i.period_start = '2026-12-01'), 0,
  'mois annulé : rien n''est facturé pour ce centre');
select is((select count(*)::int from public.invoices where period_start = '2026-12-01' and enrollment_id = '62800000-0000-4000-8000-000000000051'), 1,
  'mois annulé chez C : le centre D est facturé normalement');

-- Option désactivée alors qu'un brouillon existe : retour à la facturation automatique.
select private.generate_billing_runs('2026-12-25');
select is((select count(*)::int from public.billing_runs where center_id = 'c2800000-0000-4000-8000-0000000000c1' and period_year = 2027 and period_month = 1), 1,
  'décembre → janvier : campagne de janvier 2027 préparée');
update public.centers set auto_reenrollment_enabled = false where id = 'c2800000-0000-4000-8000-0000000000c1';
select private.generate_invoices('2027-01-01');
select is((select count(*)::int from public.invoices where period_start = '2027-01-01' and enrollment_id = '62800000-0000-4000-8000-000000000011'), 1,
  'option désactivée : le brouillon est ignoré, la facturation reprend');

-- ---------------------------------------------------------------------
-- Retard : le lendemain de l'échéance pour une facture de campagne
-- ---------------------------------------------------------------------
insert into public.invoices (pack_enrollment_id, student_id, period_start, period_end, amount_full, discount_amount, amount_due, due_date, billing_run_id)
select '72800000-0000-4000-8000-000000000021', '52800000-0000-4000-8000-000000000002', '2026-11-01', '2026-11-30', 400, 0, 400, '2026-11-05', br.id
from public.billing_runs br where br.center_id = 'c2800000-0000-4000-8000-0000000000c1' and br.period_month = 11;
select is((select overdue_from from public.invoices where pack_enrollment_id = '72800000-0000-4000-8000-000000000021' and period_start = '2026-11-01'),
  '2026-11-06'::date, 'facture de campagne : en retard à partir du lendemain de l''échéance');
select private.mark_overdue_invoices('2026-11-05');
select is((select status::text from public.invoices where pack_enrollment_id = '72800000-0000-4000-8000-000000000021' and period_start = '2026-11-01'),
  'pending', 'jour de l''échéance : pas encore en retard');
select private.mark_overdue_invoices('2026-11-06');
select is((select status::text from public.invoices where pack_enrollment_id = '72800000-0000-4000-8000-000000000021' and period_start = '2026-11-01'),
  'overdue', 'lendemain de l''échéance : en retard');
select is((select status::text from public.invoices where period_start = '2026-11-01' and enrollment_id = '62800000-0000-4000-8000-000000000051'),
  'overdue', 'facture hors campagne : règle inchangée (en retard dès l''échéance)');

-- ---------------------------------------------------------------------
-- Préparer maintenant (admin)
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2800000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.prepare_billing_run()$$, '22023', null, 'option désactivée : préparation refusée avec explication');
reset role;
update public.centers set auto_reenrollment_enabled = true where id = 'c2800000-0000-4000-8000-0000000000d1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2800000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select public.prepare_billing_run()$$, '42501', null, 'accueil : ne prépare pas de campagne');
set local request.jwt.claims = '{"sub":"a2800000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(public.prepare_billing_run() is not null, 'admin : brouillon du mois prochain préparé tout de suite');
select is(public.prepare_billing_run(),
  (select id from public.billing_runs where center_id = 'c2800000-0000-4000-8000-0000000000d1'),
  'deuxième appel : même campagne, pas de doublon');
reset role;

select ok(private.run_daily_automations() ? 'billing_runs_created', 'le job quotidien prépare aussi les campagnes');

select * from finish();
rollback;
