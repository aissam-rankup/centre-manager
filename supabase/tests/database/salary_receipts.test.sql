-- =====================================================================
-- Reçus de paie : un reçu immuable et numéroté par versement de salaire
-- (professeur comme assistant), annulation par reçu d'annulation,
-- lecture réservée à l'admin du centre.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (id, email) values
  ('a8200000-0000-4000-8000-000000000001', 'admin@salary-receipts.test'),
  ('a8200000-0000-4000-8000-000000000002', 'assistante@salary-receipts.test'),
  ('a8200000-0000-4000-8000-000000000003', 'prof@salary-receipts.test'),
  ('a8200000-0000-4000-8000-000000000011', 'admin-b@salary-receipts.test');
insert into public.centers (id, name, slug, address) values
  ('c8200000-0000-4000-8000-000000000001', 'Centre Reçus A', 'salary-receipts-a', '12 rue des Écoles'),
  ('c8200000-0000-4000-8000-000000000002', 'Centre Reçus B', 'salary-receipts-b', null);
insert into public.profiles (id, center_id, full_name, role, pay_mode, phone) values
  ('a8200000-0000-4000-8000-000000000001', 'c8200000-0000-4000-8000-000000000001', 'Admin A', 'admin', null, null),
  ('a8200000-0000-4000-8000-000000000002', 'c8200000-0000-4000-8000-000000000001', 'Assistante A', 'assistant', 'fixed_salary', '0612345678'),
  ('a8200000-0000-4000-8000-000000000003', 'c8200000-0000-4000-8000-000000000001', 'Prof A', 'teacher', 'fixed_salary', null),
  ('a8200000-0000-4000-8000-000000000011', 'c8200000-0000-4000-8000-000000000002', 'Admin B', 'admin', null, null);
insert into public.teacher_salaries (center_id, teacher_id, monthly_amount, effective_from) values
  ('c8200000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000002', 2500, '2026-01-01'),
  ('c8200000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000003', 3000, '2026-01-01');

create temp table t_ids (key text primary key, id uuid);
grant all on t_ids to authenticated;

-- ---------------------------------------------------------------------
-- Admin : paie de janvier validée, versements
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8200000-0000-4000-8000-000000000001","role":"authenticated"}';

select public.payroll_validate((select id from public.payroll_refresh(2026, 1)));
insert into t_ids
select 'line_assistant', id from public.payroll_lines where teacher_id = 'a8200000-0000-4000-8000-000000000002'
union all
select 'line_teacher', id from public.payroll_lines where teacher_id = 'a8200000-0000-4000-8000-000000000003';

select throws_ok(
  $$select public.payroll_mark_paid((select id from t_ids where key = 'line_assistant'), '2026-02-01', 'cash', repeat('x', 301))$$,
  '22023', null, 'note trop longue refusée');

insert into t_ids
select 'receipt_assistant', id from public.payroll_mark_paid(
  (select id from t_ids where key = 'line_assistant'), '2026-02-01', 'cash', '  Salaire de janvier  ');

select is(
  (select row(member_name, member_role::text, amount, payment_method::text, note, period_year, period_month, paid_on, kind::text)::text
   from public.salary_payments where id = (select id from t_ids where key = 'receipt_assistant')),
  '("Assistante A",assistant,2500.00,cash,"Salaire de janvier",2026,1,2026-02-01,payment)',
  'reçu de l''assistante : membre, rôle, montant, mode, note, période, date');
select is(
  (select receipt_number from public.salary_payments where id = (select id from t_ids where key = 'receipt_assistant')),
  extract(year from private.local_time(now()))::text || '-0001', 'numéro ANNEE-0001 (série de la paie)');
select is(
  (select center_snapshot ->> 'name' || ' / ' || (center_snapshot ->> 'address') from public.salary_payments
   where id = (select id from t_ids where key = 'receipt_assistant')),
  'Centre Reçus A / 12 rue des Écoles', 'centre figé sur le reçu');
select is(
  (select member_phone from public.salary_payments where id = (select id from t_ids where key = 'receipt_assistant')),
  '0612345678', 'téléphone du membre figé (WhatsApp)');
select is(
  (select issued_by_name from public.salary_payments where id = (select id from t_ids where key = 'receipt_assistant')),
  'Admin A', 'émis par l''admin');
select is((select paid_at from public.payroll_lines where id = (select id from t_ids where key = 'line_assistant')),
  '2026-02-01'::date, 'ligne de paie marquée versée');

insert into t_ids
select 'receipt_teacher', id from public.payroll_mark_paid((select id from t_ids where key = 'line_teacher'), '2026-02-02', 'bank_transfer');
select is(
  (select receipt_seq from public.salary_payments where id = (select id from t_ids where key = 'receipt_teacher')),
  2, 'professeur : reçu suivant de la série');
select is((select note from public.salary_payments where id = (select id from t_ids where key = 'receipt_teacher')),
  null, 'note facultative');
select is(
  (select status::text from public.payroll_periods where year = 2026 and month = 1), 'paid', 'tout est versé : période versée');

select throws_ok(
  $$select public.payroll_mark_paid((select id from t_ids where key = 'line_teacher'), '2026-02-03', 'cash')$$,
  '22023', null, 'versement déjà enregistré : pas de second reçu');

select lives_ok(
  $$select public.mark_salary_receipt_printed((select id from t_ids where key = 'receipt_assistant'))$$,
  'trace d''impression');
select isnt(
  (select printed_at from public.salary_payments where id = (select id from t_ids where key = 'receipt_assistant')),
  null, 'impression enregistrée');

-- Immuable, même pour l'admin.
select throws_ok(
  $$update public.salary_payments set note = 'modifié' where id = (select id from t_ids where key = 'receipt_assistant')$$,
  '42501', null, 'admin : la note d''un reçu ne se modifie pas');

-- ---------------------------------------------------------------------
-- Assistante, professeur, autre centre : rien
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a8200000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.salary_payments), 0, 'assistante : aucun reçu de paie lisible (même le sien)');
select throws_ok(
  $$select public.cancel_salary_payment((select id from t_ids where key = 'receipt_teacher'), 'essai')$$,
  '42501', null, 'assistante : n''annule pas un reçu de paie');
select throws_ok(
  $$select public.payroll_mark_paid((select id from t_ids where key = 'line_teacher'), '2026-02-03', 'cash')$$,
  '42501', null, 'assistante : n''enregistre pas de versement');

set local request.jwt.claims = '{"sub":"a8200000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.salary_payments), 0, 'professeur : aucun reçu de paie lisible');

set local request.jwt.claims = '{"sub":"a8200000-0000-4000-8000-000000000011","role":"authenticated"}';
select is((select count(*)::int from public.salary_payments), 0, 'admin d''un autre centre : aucun reçu lisible');
select throws_ok(
  $$select public.cancel_salary_payment((select id from t_ids where key = 'receipt_teacher'), 'essai')$$,
  '42501', null, 'admin d''un autre centre : n''annule pas');

-- ---------------------------------------------------------------------
-- Annulation : reçu négatif lié, ligne de nouveau à verser
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a8200000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.cancel_salary_payment((select id from t_ids where key = 'receipt_teacher'), '  ')$$,
  '22023', null, 'motif obligatoire');

insert into t_ids
select 'cancel_teacher', id from public.cancel_salary_payment((select id from t_ids where key = 'receipt_teacher'), 'Mauvais mode');
select is(
  (select row(kind::text, amount, receipt_seq, cancel_reason)::text from public.salary_payments
   where id = (select id from t_ids where key = 'cancel_teacher')),
  '(cancellation,-3000.00,3,"Mauvais mode")', 'reçu d''annulation : négatif, numéro suivant, motif');
select is(
  (select cancels_payment_id from public.salary_payments where id = (select id from t_ids where key = 'cancel_teacher')),
  (select id from t_ids where key = 'receipt_teacher'), 'lié au reçu annulé');
select is(
  (select row(paid_at, payment_method)::text from public.payroll_lines where id = (select id from t_ids where key = 'line_teacher')),
  '(,)', 'ligne de paie de nouveau à verser');
select is(
  (select status::text from public.payroll_periods where year = 2026 and month = 1), 'validated', 'période repassée en validée');
select is(
  (select amount from public.salary_payments where id = (select id from t_ids where key = 'receipt_teacher')),
  3000.00::numeric, 'le reçu d''origine reste inchangé');
select throws_ok(
  $$select public.cancel_salary_payment((select id from t_ids where key = 'receipt_teacher'), 'encore')$$,
  '22023', null, 'déjà annulé');
select throws_ok(
  $$select public.cancel_salary_payment((select id from t_ids where key = 'cancel_teacher'), 'encore')$$,
  '22023', null, 'un reçu d''annulation ne s''annule pas');

insert into t_ids
select 'receipt_teacher_2', id from public.payroll_mark_paid((select id from t_ids where key = 'line_teacher'), '2026-02-05', 'cash');
select is(
  (select row(receipt_seq, amount, payment_method::text)::text from public.salary_payments
   where id = (select id from t_ids where key = 'receipt_teacher_2')),
  '(4,3000.00,cash)', 'nouveau versement : nouveau reçu');

-- Suppression impossible ; export : onglet des reçus de paie.
reset role;
select is((select count(*)::int from public.receipt_counters where center_id = 'c8200000-0000-4000-8000-000000000001'),
  0, 'série distincte : le compteur des reçus des élèves n''avance pas');
select throws_ok(
  $$delete from public.salary_payments where id = (select id from t_ids where key = 'receipt_assistant')$$,
  '42501', null, 'un reçu de paie ne se supprime pas');
insert into public.center_exports (id, center_id, requested_role, reason_kind)
values ('e8200000-0000-4000-8000-000000000001', 'c8200000-0000-4000-8000-000000000001', 'admin', 'backup');
set local role service_role;
select is(
  (select json_array_length(public.export_center_data('e8200000-0000-4000-8000-000000000001') -> 'recus_paie' -> 'rows')),
  4, 'export : quatre reçus de paie');
select is(
  (select public.export_center_data('e8200000-0000-4000-8000-000000000001') -> 'paie' -> 'rows' -> 0 ->> 'Rôle'),
  'Accueil', 'export : rôle du membre dans l''onglet Paie');
reset role;

select * from finish();
rollback;
