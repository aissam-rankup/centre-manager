-- =====================================================================
-- Règles financières (page 6, phase 7) — exécuter avec : npm run db:test
--  * exactitude du calcul de la paie (commission et salaire fixe) ;
--  * isolation par centre des fonctions financières ;
--  * immutabilité et numérotation des reçus.
-- Dates fixes : calculs indépendants du jour d'exécution.
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

-- ---------------------------------------------------------------------
-- Centre C : niveau, matières, pack, professeurs, élèves
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a7000000-0000-4000-8000-000000000001', 'admin-c@rules.test'),
  ('a7000000-0000-4000-8000-000000000002', 'prof1-c@rules.test'),
  ('a7000000-0000-4000-8000-000000000003', 'prof2-c@rules.test'),
  ('a7000000-0000-4000-8000-000000000004', 'prof3-c@rules.test'),
  ('a7000000-0000-4000-8000-000000000011', 'admin-d@rules.test'),
  ('a7000000-0000-4000-8000-000000000012', 'prof-d@rules.test');
insert into public.centers (id, name, slug) values
  ('c7000000-0000-4000-8000-000000000001', 'Centre C', 'rules-c'),
  ('c7000000-0000-4000-8000-000000000002', 'Centre D', 'rules-d');
insert into public.profiles (id, center_id, full_name, role, pay_mode) values
  ('a7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'Admin C', 'admin', null),
  ('a7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'Prof Un', 'teacher', 'commission'),
  ('a7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'Prof Deux', 'teacher', 'commission'),
  ('a7000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000001', 'Prof Trois', 'teacher', 'fixed_salary'),
  ('a7000000-0000-4000-8000-000000000011', 'c7000000-0000-4000-8000-000000000002', 'Admin D', 'admin', null),
  ('a7000000-0000-4000-8000-000000000012', 'c7000000-0000-4000-8000-000000000002', 'Prof D', 'teacher', 'fixed_salary');
insert into public.levels (id, center_id, name) values
  ('d7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'Niveau C'),
  ('d7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000002', 'Niveau D');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'Maths', 400),
  ('e7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'Physique', 333.33),
  ('e7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'Anglais', 250),
  ('e7000000-0000-4000-8000-000000000011', 'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', 'Maths D', 500);
insert into public.packs (id, center_id, level_id, name, monthly_price) values
  ('b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'Pack', 550);
insert into public.pack_subjects (pack_id, subject_id) values
  ('b7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000003');
-- Prof Un : Maths et Physique ; Prof Deux : Maths aussi (matière partagée).
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000012', 'e7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000002');

insert into public.students (id, center_id, full_name, level_id) values
  ('f7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'Remisé impayé', 'd7000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'Payé', 'd7000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'Arrêté', 'd7000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000001', 'Inscrit en février', 'd7000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000005', 'c7000000-0000-4000-8000-000000000001', 'En pack', 'd7000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000006', 'c7000000-0000-4000-8000-000000000001', 'Physique 1', 'd7000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000001', 'Physique 2', 'd7000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000008', 'c7000000-0000-4000-8000-000000000001', 'Physique 3', 'd7000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000011', 'c7000000-0000-4000-8000-000000000002', 'Élève D', 'd7000000-0000-4000-8000-000000000002');

insert into public.discounts (center_id, student_id, type, value, scope, reason, valid_from) values
  ('c7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', 'percentage', 50, 'all_subjects', 'social', '2025-01-01');

insert into public.enrollments (student_id, subject_id, start_date, active) values
  ('f7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', '2025-09-01', true),
  ('f7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', '2025-09-01', true),
  ('f7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000001', '2025-09-01', false),
  ('f7000000-0000-4000-8000-000000000004', 'e7000000-0000-4000-8000-000000000001', '2026-02-10', true),
  ('f7000000-0000-4000-8000-000000000006', 'e7000000-0000-4000-8000-000000000002', '2025-09-01', true),
  ('f7000000-0000-4000-8000-000000000007', 'e7000000-0000-4000-8000-000000000002', '2025-09-01', true),
  ('f7000000-0000-4000-8000-000000000008', 'e7000000-0000-4000-8000-000000000002', '2025-09-01', true),
  ('f7000000-0000-4000-8000-000000000011', 'e7000000-0000-4000-8000-000000000011', '2025-09-01', true);
insert into public.pack_enrollments (student_id, pack_id, start_date) values
  ('f7000000-0000-4000-8000-000000000005', 'b7000000-0000-4000-8000-000000000001', '2025-09-01');

-- Taux : Maths 30 % en 2025 puis 35 % ; Physique 12,5 % ; Prof Deux 10 %.
insert into public.teacher_commissions (center_id, teacher_id, subject_id, level_id, rate_percent, effective_from, effective_to) values
  ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 30, '2025-01-01', '2025-12-31'),
  ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 35, '2026-01-01', null),
  ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000001', 12.5, '2025-01-01', null),
  ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 10, '2025-01-01', null);
insert into public.teacher_salaries (center_id, teacher_id, monthly_amount, effective_from, effective_to) values
  ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', 3000, '2025-01-01', '2026-01-14'),
  ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', 3600, '2026-01-15', null),
  ('c7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000012', 9999, '2025-01-01', null);

-- ---------------------------------------------------------------------
-- Exactitude de la paie
-- ---------------------------------------------------------------------
-- Janvier 2026, Maths : remisé impayé + payé + pack = 3 (arrêté et inscrit en
-- février exclus) → 400 × 3 × 35 % = 420 ; Physique : 333,33 × 3 × 12,5 % = 124,99875 → 125,00.
select results_eq(
  $$select (x ->> 'subject'), (x ->> 'enrolled')::int, (x ->> 'rate_percent')::numeric, (x ->> 'subtotal')::numeric
    from private.compute_teacher_pay('a7000000-0000-4000-8000-000000000002', 2026, 1) c,
         jsonb_array_elements(c.detail -> 'subjects') x
    order by 1$$,
  $$values ('Maths', 3, 35.00::numeric, 420.00::numeric), ('Physique', 3, 12.50::numeric, 125.00::numeric)$$,
  'commission : inscrits (impayé, remisé, pack compris ; arrêté et futur exclus), tarif plein, arrondi au centime');
select is((select amount from private.compute_teacher_pay('a7000000-0000-4000-8000-000000000002', 2026, 1)), 545.00::numeric,
  'commission : somme des matières');
select is((select amount from private.compute_teacher_pay('a7000000-0000-4000-8000-000000000002', 2025, 12)), 485.00::numeric,
  'commission : le taux en vigueur ce mois-là (30 % en décembre 2025)');
select is((select amount from private.compute_teacher_pay('a7000000-0000-4000-8000-000000000002', 2026, 2)), 685.00::numeric,
  'commission : l''élève inscrit le 10 février compte dès février');
select is((select amount from private.compute_teacher_pay('a7000000-0000-4000-8000-000000000003', 2026, 1)), 120.00::numeric,
  'matière partagée : chaque professeur sur tous les inscrits, à son propre taux');
select is((select amount from private.compute_teacher_pay('a7000000-0000-4000-8000-000000000004', 2025, 12)), 3000.00::numeric,
  'salaire fixe : montant en vigueur ce mois-là');
select is((select amount from private.compute_teacher_pay('a7000000-0000-4000-8000-000000000004', 2026, 1)), 3600.00::numeric,
  'salaire fixe : augmentation au 15 du mois appliquée au mois entier');

-- Taux non défini : sous-total nul, signalé dans le détail.
delete from public.teacher_commissions where teacher_id = 'a7000000-0000-4000-8000-000000000003';
select results_eq(
  $$select (x -> 'rate_percent') = 'null'::jsonb, (x ->> 'subtotal')::numeric
    from private.compute_teacher_pay('a7000000-0000-4000-8000-000000000003', 2026, 1) c, jsonb_array_elements(c.detail -> 'subjects') x$$,
  $$values (true, 0.00::numeric)$$,
  'commission sans taux : sous-total nul, taux absent du détail');

-- Paie validée : figée malgré une nouvelle inscription.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select total_amount from public.payroll_refresh(2026, 1)), 4145.00::numeric,
  'paie de janvier : 545 (Prof Un) + 0 (Prof Deux, sans taux) + 3 600 (Prof Trois)');
select lives_ok($$select public.payroll_validate((select id from public.payroll_periods where year = 2026 and month = 1))$$, 'paie validée');
reset role;
insert into public.enrollments (student_id, subject_id, start_date) values
  ('f7000000-0000-4000-8000-000000000006', 'e7000000-0000-4000-8000-000000000001', '2025-12-01');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select total_amount from public.payroll_refresh(2026, 1)), 4145.00::numeric, 'paie validée : figée malgré une nouvelle inscription');
select is((select count(*)::int from public.payroll_lines), 3, 'paie : uniquement les professeurs du centre');

-- ---------------------------------------------------------------------
-- Isolation des fonctions financières
-- ---------------------------------------------------------------------
reset role;
insert into public.expenses (center_id, category_id, label, amount, expense_date)
select c.id, ec.id, 'Charge ' || c.name, case when c.slug = 'rules-c' then 1000 else 77777 end, private.today()
from public.centers c
join public.expense_categories ec on ec.center_id = c.id and ec.name = 'Loyer'
where c.slug in ('rules-c', 'rules-d');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select expenses from public.admin_financial_summary(1)), 1000.00::numeric, 'résultat financier : charges du seul centre de l''admin');
select is((select count(*)::int from public.expenses), 1, 'charges : celles du centre uniquement');
select is((select count(*)::int from public.teacher_salaries), 2, 'salaires : ceux du centre uniquement');
select throws_ok(
  $$select public.set_teacher_pay('a7000000-0000-4000-8000-000000000012', 'fixed_salary', '2026-01-01', 1, '[]'::jsonb)$$,
  'P0002', null, 'admin C : ne règle pas la paie d''un professeur de D');
select throws_ok(
  $$select public.record_payment('f7000000-0000-4000-8000-000000000011',
      array(select id from public.invoices where student_id = 'f7000000-0000-4000-8000-000000000011'), 'cash')$$,
  '42501', null, 'admin C : n''encaisse pas une facture de D');
select throws_ok(
  $$select public.record_payment('f7000000-0000-4000-8000-000000000002',
      array(select id from public.invoices where student_id = 'f7000000-0000-4000-8000-000000000006' limit 1), 'cash')$$,
  'P0002', null, 'encaissement : une facture d''un autre élève est refusée');

-- ---------------------------------------------------------------------
-- Reçus : numérotation et immutabilité
-- ---------------------------------------------------------------------
reset role;
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now(), payment_method = 'cash'
where student_id in ('f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000006',
                     'f7000000-0000-4000-8000-000000000007', 'f7000000-0000-4000-8000-000000000011');
select is(
  (select receipt_number from private.issue_receipt(
     array(select id from public.invoices where student_id = 'f7000000-0000-4000-8000-000000000002'),
     '2026-12-31 23:30:00+01', 'a7000000-0000-4000-8000-000000000001')),
  '2026-0001', 'numérotation : premier reçu de l''année');
select is(
  (select receipt_number from private.issue_receipt(
     array(select id from public.invoices where student_id = 'f7000000-0000-4000-8000-000000000006'),
     '2026-12-31 23:45:00+01', 'a7000000-0000-4000-8000-000000000001')),
  '2026-0002', 'numérotation : suite sans trou');
select is(
  (select receipt_number from private.issue_receipt(
     array(select id from public.invoices where student_id = 'f7000000-0000-4000-8000-000000000007'),
     '2027-01-01 00:10:00+01', 'a7000000-0000-4000-8000-000000000001')),
  '2027-0001', 'numérotation : remise à 1 au changement d''année (heure de Casablanca)');
select is(
  (select receipt_number from private.issue_receipt(
     array(select id from public.invoices where student_id = 'f7000000-0000-4000-8000-000000000011'),
     '2026-12-31 23:50:00+01', 'a7000000-0000-4000-8000-000000000011')),
  '2026-0001', 'numérotation : propre à chaque centre');

select set_config('rules.receipt', (select id::text from public.receipts where receipt_number = '2026-0001'
  and center_id = 'c7000000-0000-4000-8000-000000000001'), true);

select throws_ok($$update public.receipts set amount_paid = 1 where id = current_setting('rules.receipt')::uuid$$,
  '42501', null, 'reçu : montant immuable');
select throws_ok($$update public.receipts set subjects_covered = '[]' where id = current_setting('rules.receipt')::uuid$$,
  '42501', null, 'reçu : détail des matières immuable');
select throws_ok($$update public.receipts set issued_at = now() - interval '1 year' where id = current_setting('rules.receipt')::uuid$$,
  '42501', null, 'reçu : date d''émission immuable');
select throws_ok($$update public.receipts set center_snapshot = '{}' where id = current_setting('rules.receipt')::uuid$$,
  '42501', null, 'reçu : en-tête du centre immuable');
select throws_ok($$update public.receipts set receipt_seq = 99 where id = current_setting('rules.receipt')::uuid$$,
  '42501', null, 'reçu : numéro immuable');
select throws_ok($$update public.receipts set payment_method = 'card' where id = current_setting('rules.receipt')::uuid$$,
  '42501', null, 'reçu : mode de paiement immuable');
select throws_ok(
  $$update public.receipts set student_id = 'f7000000-0000-4000-8000-000000000006' where id = current_setting('rules.receipt')::uuid$$,
  '42501', null, 'reçu : élève non réattribuable');
select lives_ok($$update public.receipts set printed_at = now(), whatsapp_sent_at = now(), pdf_url = 'x/y.pdf'
  where id = current_setting('rules.receipt')::uuid$$, 'reçu : seules les traces s''ajoutent');
select throws_ok($$delete from public.receipts where id = current_setting('rules.receipt')::uuid$$,
  '42501', null, 'reçu : jamais supprimé');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.receipt_counters (center_id, year, last_number) values ('c7000000-0000-4000-8000-000000000001', 2030, 1)$$,
  '42501', null, 'compteur : inaccessible aux comptes, même admin');
reset role;

-- Élève supprimé : le reçu reste, nom figé.
delete from public.students where id = 'f7000000-0000-4000-8000-000000000002';
select results_eq(
  $$select student_id is null, student_name from public.receipts where id = current_setting('rules.receipt')::uuid$$,
  $$values (true, 'Payé')$$,
  'élève supprimé : reçu conservé avec le nom figé');

-- Annulation : reçu négatif lié, impossible d'annuler une annulation.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('rules.cancel', (select id::text from public.cancel_receipt(
  (select id from public.receipts where receipt_number = '2026-0002' and center_id = 'c7000000-0000-4000-8000-000000000001'),
  'Erreur de saisie')), true);
select throws_ok($$select public.cancel_receipt(current_setting('rules.cancel')::uuid, 'Encore')$$,
  '22023', null, 'un reçu d''annulation ne s''annule pas');
select is(
  (select sum(amount_paid) from public.receipts where center_id = 'c7000000-0000-4000-8000-000000000001'
     and (id = current_setting('rules.cancel')::uuid or receipt_number = '2026-0002')),
  0.00::numeric, 'annulation : reçu et annulation se compensent');
reset role;

select * from finish();
rollback;
