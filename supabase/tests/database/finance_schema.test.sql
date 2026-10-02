-- =====================================================================
-- Modules financiers (page 6, phase 1) — exécuter avec : npm run db:test
-- Remises, reçus, paie des professeurs, charges, accès.
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(50);

insert into auth.users (id, email) values
  ('a9000000-0000-4000-8000-000000000001', 'admin-p22@test.local'),
  ('a9000000-0000-4000-8000-000000000002', 'accueil-p22@test.local'),
  ('a9000000-0000-4000-8000-000000000003', 'prof-p22@test.local'),
  ('a9000000-0000-4000-8000-000000000004', 'owner-p22@test.local');
insert into public.centers (id, name, slug) values ('c9000000-0000-4000-8000-000000000001', 'Centre P22', 'centre-p22');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'Admin P22', 'admin'),
  ('a9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000001', 'Accueil P22', 'assistant'),
  ('a9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000001', 'Prof P22', 'teacher'),
  ('a9000000-0000-4000-8000-000000000004', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values
  ('d9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'Niveau P22');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Maths', 400),
  ('e9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Anglais', 300);
insert into public.packs (id, center_id, level_id, name, monthly_price) values
  ('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Pack', 600);
insert into public.pack_subjects (pack_id, subject_id) values
  ('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002');
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a9000000-0000-4000-8000-000000000003', 'e9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001');
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('f9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'Élève Un', 'd9000000-0000-4000-8000-000000000001', '06 11 22 33 44'),
  ('f9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000001', 'Élève Pack', 'd9000000-0000-4000-8000-000000000001', null);

-- ---------------------------------------------------------------------
-- Remises
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.discounts (id, student_id, center_id, type, value, scope, reason)
values ('99000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
        'c9000000-0000-4000-8000-000000000001', 'percentage', 25, 'all_subjects', 'social');
insert into public.enrollments (student_id, subject_id) values
  ('f9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001'),
  ('f9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002');
insert into public.pack_enrollments (student_id, pack_id) values
  ('f9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001');

select results_eq(
  $$select amount_full, discount_amount, amount_due from public.invoices i
    join public.enrollments e on e.id = i.enrollment_id
    where e.subject_id = 'e9000000-0000-4000-8000-000000000001' and i.student_id = 'f9000000-0000-4000-8000-000000000001'$$,
  $$values (400.00::numeric, 100.00::numeric, 300.00::numeric)$$,
  'facture : tarif plein, remise de 25 %, net à encaisser');

insert into public.discounts (id, student_id, center_id, type, value, scope, subject_id, reason)
values ('99000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001',
        'c9000000-0000-4000-8000-000000000001', 'fixed_amount', 150, 'specific_subject',
        'e9000000-0000-4000-8000-000000000001', 'merit');
select results_eq(
  $$select discount_amount, discount_conflict from public.invoices i
    join public.enrollments e on e.id = i.enrollment_id
    where e.subject_id = 'e9000000-0000-4000-8000-000000000001' and i.student_id = 'f9000000-0000-4000-8000-000000000001'$$,
  $$values (150.00::numeric, true)$$,
  'deux remises sur la même matière : la plus favorable, conflit signalé');
select is((select count(*)::int from public.discount_overlaps), 1, 'chevauchement listé pour l''admin');
select is(
  (select discount_amount from public.invoices i join public.enrollments e on e.id = i.enrollment_id
    where e.subject_id = 'e9000000-0000-4000-8000-000000000002' and i.student_id = 'f9000000-0000-4000-8000-000000000001'),
  75.00::numeric, 'remise ciblée : n''affecte pas les autres matières');

update public.discounts set is_active = false where id = '99000000-0000-4000-8000-000000000002';
select results_eq(
  $$select discount_amount, discount_conflict from public.invoices i
    join public.enrollments e on e.id = i.enrollment_id
    where e.subject_id = 'e9000000-0000-4000-8000-000000000001' and i.student_id = 'f9000000-0000-4000-8000-000000000001'$$,
  $$values (100.00::numeric, false)$$,
  'remise désactivée : facture non réglée recalculée');
select throws_ok(
  $$update public.enrollments set price_agreed = 100 where student_id = 'f9000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin : le tarif d''une inscription ne se modifie plus');
select is((select count(*)::int from public.center_events where action = 'discount.granted'), 2, 'remises journalisées avec leur auteur');

set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.discounts), 2, 'assistant : voit les remises');
select throws_ok(
  $$insert into public.discounts (student_id, center_id, type, value, scope, reason)
    values ('f9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000001', 'percentage', 50, 'all_subjects', 'merit')$$,
  '42501', null, 'assistant : ne crée pas de remise');
with u as (update public.discounts set value = 90 returning 1)
select is(count(*)::int, 0, 'assistant : ne modifie pas une remise') from u;

-- ---------------------------------------------------------------------
-- Reçus
-- ---------------------------------------------------------------------
select set_config('p22.inv_s1', (select string_agg(id::text, ',') from public.invoices where student_id = 'f9000000-0000-4000-8000-000000000001'), true);
select set_config('p22.inv_s2', (select id::text from public.invoices where student_id = 'f9000000-0000-4000-8000-000000000002'), true);

select results_eq(
  $$select receipt_number, amount_full, discount_applied, amount_paid, jsonb_array_length(subjects_covered), payment_method::text
    from public.record_payment('f9000000-0000-4000-8000-000000000001', string_to_array(current_setting('p22.inv_s1'), ',')::uuid[], 'cash')$$,
  format($$values (%L, 700.00::numeric, 175.00::numeric, 525.00::numeric, 2, 'cash')$$,
         extract(year from now() at time zone 'Africa/Casablanca')::text || '-0001'),
  'encaissement : un reçu numéroté pour deux matières, remise et net');
select is((select count(*)::int from public.invoices where student_id = 'f9000000-0000-4000-8000-000000000001' and status = 'paid' and receipt_id is not null),
  2, 'encaissement : factures réglées et rattachées au reçu');
select throws_ok(
  $$select public.record_payment('f9000000-0000-4000-8000-000000000001', string_to_array(current_setting('p22.inv_s1'), ',')::uuid[], 'cash')$$,
  'P0002', null, 'encaissement : une facture ne se règle pas deux fois');

-- Un numéro consommé dans une transaction annulée est réutilisé (aucun trou).
reset role;
savepoint p22_gap;
select private.next_receipt_seq('c9000000-0000-4000-8000-000000000001', extract(year from now() at time zone 'Africa/Casablanca')::smallint);
rollback to savepoint p22_gap;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select receipt_seq from public.record_payment('f9000000-0000-4000-8000-000000000002', array[current_setting('p22.inv_s2')::uuid], 'card')),
  2, 'numérotation : suite continue, sans trou');
select throws_ok(
  $$update public.receipts set amount_paid = 1$$,
  '42501', null, 'reçu : montant non modifiable');
select lives_ok(
  $$update public.receipts set printed_at = now(), whatsapp_sent_at = now() where receipt_seq = 1$$,
  'reçu : impression et partage horodatés');
select throws_ok(
  $$select public.cancel_receipt((select id from public.receipts where receipt_seq = 1), 'Erreur')$$,
  '42501', null, 'assistant : n''annule pas un reçu');

set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$select kind::text, amount_paid, receipt_seq from public.cancel_receipt((select id from public.receipts where receipt_seq = 1), 'Mauvais élève')$$,
  $$values ('cancellation', -525.00::numeric, 3)$$,
  'annulation : reçu négatif lié, numéroté à la suite');
select is((select count(*)::int from public.invoices where student_id = 'f9000000-0000-4000-8000-000000000001' and status <> 'paid' and receipt_id is null),
  2, 'annulation : factures de nouveau à régler');
select throws_ok(
  $$select public.cancel_receipt((select id from public.receipts where receipt_seq = 1), 'Encore')$$,
  '22023', null, 'annulation : une seule fois');

reset role;
select throws_ok($$delete from public.receipts where receipt_seq = 2$$, '42501', null, 'reçu : jamais supprimé');
set local role authenticated;

set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.receipts) + (select count(*)::int from public.discounts), 0, 'professeur : ni reçus ni remises');

-- ---------------------------------------------------------------------
-- Paie
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.profiles set pay_mode = 'commission' where id = 'a9000000-0000-4000-8000-000000000003';
select lives_ok(
  $$select public.set_teacher_commission('a9000000-0000-4000-8000-000000000003', 'e9000000-0000-4000-8000-000000000001', 30, private.today() - 40)$$,
  'admin : taux de commission par matière');
select set_config('p22.year', extract(year from private.today())::text, true);
select set_config('p22.month', extract(month from private.today())::text, true);

-- Maths : élève Un (remise de 25 %, impayé) + élève Pack (via le pack)
-- → 400 × 2 × 30 % = 240, au tarif plein, impayés compris.
select is(
  (select total_amount from public.payroll_refresh(current_setting('p22.year')::int, current_setting('p22.month')::int)),
  240.00::numeric, 'commission : tarif plein × inscrits × taux (remise, impayé et pack compris)');
select results_eq(
  $$select (x ->> 'monthly_price')::numeric, (x ->> 'enrolled')::int, (x ->> 'rate_percent')::numeric, (x ->> 'subtotal')::numeric
    from public.payroll_lines pl, jsonb_array_elements(pl.detail -> 'subjects') as x$$,
  $$values (400.00::numeric, 2, 30.00::numeric, 240.00::numeric)$$,
  'commission : détail lisible par matière');
select throws_ok(
  $$select public.payroll_set_adjustment((select id from public.payroll_lines), 50, '  ')$$,
  '22023', null, 'ajustement : motif obligatoire');
select is(
  (select final_amount from public.payroll_set_adjustment((select id from public.payroll_lines), 50, 'Prime')),
  290.00::numeric, 'ajustement : à part du calculé, montant final = somme');
select is((select status::text from public.payroll_validate((select id from public.payroll_periods))), 'validated', 'paie validée');
select throws_ok(
  $$select public.payroll_set_adjustment((select id from public.payroll_lines), 80, 'Prime')$$,
  '42501', null, 'paie validée : montants figés');
select lives_ok(
  $$select public.payroll_mark_paid((select id from public.payroll_lines), private.today(), 'bank_transfer')$$,
  'versement enregistré');
select is((select status::text from public.payroll_periods), 'paid', 'toutes les lignes versées : période versée');
select throws_ok(
  $$select public.payroll_unlock((select id from public.payroll_periods), 'Correction')$$,
  '22023', null, 'déverrouillage impossible après versement');

select public.set_teacher_salary('a9000000-0000-4000-8000-000000000003', 3000, private.today() - 60);
select public.set_teacher_salary('a9000000-0000-4000-8000-000000000003', 3300, private.today());
select results_eq(
  $$select monthly_amount, effective_to is not null from public.teacher_salaries order by effective_from$$,
  $$values (3000.00::numeric, true), (3300.00::numeric, false)$$,
  'salaire : l''augmentation crée une ligne, l''ancienne est close');

-- Réglage groupé de la rémunération : une ligne d'historique seulement si la valeur change.
select lives_ok(
  $$select public.set_teacher_pay('a9000000-0000-4000-8000-000000000003', 'commission', private.today(), null,
      '[{"subject_id": "e9000000-0000-4000-8000-000000000001", "rate_percent": 30}]'::jsonb)$$,
  'admin : réglage de la rémunération enregistré');
select is((select count(*)::int from public.teacher_commissions), 1, 'même taux : aucune ligne d''historique ajoutée');
select public.set_teacher_pay('a9000000-0000-4000-8000-000000000003', 'commission', private.today(), null,
  '[{"subject_id": "e9000000-0000-4000-8000-000000000001", "rate_percent": 40}]'::jsonb);
select results_eq(
  $$select rate_percent, effective_to is null from public.teacher_commissions order by effective_from$$,
  $$values (30.00::numeric, false), (40.00::numeric, true)$$,
  'nouveau taux : nouvelle ligne, l''ancienne est close');
select is((select count(*)::int from public.center_events where action = 'payroll.pay_settings_changed'), 2, 'réglages de rémunération journalisés');

set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.set_teacher_pay('a9000000-0000-4000-8000-000000000003', 'fixed_salary', private.today(), 9999, '[]'::jsonb)$$,
  '42501', null, 'assistant : ne règle pas la rémunération');
select is((select count(*)::int from public.payroll_lines) + (select count(*)::int from public.teacher_commissions), 0, 'assistant : paie invisible');
select throws_ok(
  $$select public.payroll_refresh(current_setting('p22.year')::int, current_setting('p22.month')::int)$$,
  '42501', null, 'assistant : ne calcule pas la paie');
select throws_ok($$select * from public.admin_financial_summary(12)$$, '42501', null, 'assistant : résultat financier refusé');
select throws_ok($$select * from public.admin_discount_summary()$$, '42501', null, 'assistant : remises du mois refusées');

-- ---------------------------------------------------------------------
-- Charges
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.expense_categories), 10, 'catégories de charges pré-remplies');
select results_eq(
  $$select count(*)::int, bool_and(month_start <= private.today()) from public.admin_financial_summary(12)$$,
  $$values (12, true)$$,
  'résultat financier : douze mois, jusqu''au mois en cours');
insert into public.expenses (id, center_id, category_id, label, amount, expense_date, is_recurring)
select '79000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', ec.id, 'Loyer', 5000,
       (date_trunc('month', private.today()) - interval '1 month')::date + 2, true
from public.expense_categories ec where ec.name = 'Loyer';

reset role;
select is(private.generate_recurring_expenses(private.today()), 1, 'récurrence : occurrence du mois créée');
select is(private.generate_recurring_expenses(private.today()), 0, 'récurrence : jamais en double');
set local role authenticated;

select results_eq(
  $$select status::text, amount, extract(day from expense_date)::int from public.expenses
    where recurrence_source_id = '79000000-0000-4000-8000-000000000001'$$,
  $$values ('draft', 5000.00::numeric, 3)$$,
  'récurrence : brouillon au montant précédent, même jour du mois');
select public.delete_expense('79000000-0000-4000-8000-000000000001');
select results_eq(
  $$select deleted_at is not null, deleted_by::text from public.expenses where id = '79000000-0000-4000-8000-000000000001'$$,
  $$values (true, 'a9000000-0000-4000-8000-000000000001')$$,
  'suppression : horodatée avec son auteur, la ligne reste');

-- ---------------------------------------------------------------------
-- Mode support : aucune donnée financière détaillée
-- ---------------------------------------------------------------------
reset role;
insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a9000000-0000-4000-8000-000000000004', 'c9000000-0000-4000-8000-000000000001', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select count(*)::int from public.expenses) + (select count(*)::int from public.payroll_lines)
  + (select count(*)::int from public.teacher_salaries) + (select count(*)::int from public.center_events),
  0, 'support : charges, paie et journal invisibles');
select throws_ok($$select * from public.admin_financial_summary(12)$$, '42501', null, 'support : résultat financier refusé');

reset role;

select * from finish();
rollback;
