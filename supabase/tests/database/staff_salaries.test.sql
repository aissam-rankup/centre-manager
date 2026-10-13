-- =====================================================================
-- Paie de l'équipe : salaire fixe des assistants (et admins salariés)
--  * réglage réservé à l'admin du centre ; jamais lisible par l'assistant
--    ni par les professeurs ;
--  * l'assistant entre dans la paie du mois avec son salaire, rôle figé ;
--  * calcul des professeurs inchangé.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email) values
  ('a8100000-0000-4000-8000-000000000001', 'admin@staff-pay.test'),
  ('a8100000-0000-4000-8000-000000000002', 'assistante@staff-pay.test'),
  ('a8100000-0000-4000-8000-000000000003', 'prof@staff-pay.test'),
  ('a8100000-0000-4000-8000-000000000004', 'assistant2@staff-pay.test'),
  ('a8100000-0000-4000-8000-000000000011', 'admin-b@staff-pay.test');
insert into public.centers (id, name, slug) values
  ('c8100000-0000-4000-8000-000000000001', 'Centre Paie A', 'staff-pay-a'),
  ('c8100000-0000-4000-8000-000000000002', 'Centre Paie B', 'staff-pay-b');
insert into public.profiles (id, center_id, full_name, role, pay_mode) values
  ('a8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', 'Admin A', 'admin', null),
  ('a8100000-0000-4000-8000-000000000002', 'c8100000-0000-4000-8000-000000000001', 'Assistante A', 'assistant', null),
  ('a8100000-0000-4000-8000-000000000003', 'c8100000-0000-4000-8000-000000000001', 'Prof A', 'teacher', 'fixed_salary'),
  ('a8100000-0000-4000-8000-000000000004', 'c8100000-0000-4000-8000-000000000001', 'Assistant sans salaire', 'assistant', null),
  ('a8100000-0000-4000-8000-000000000011', 'c8100000-0000-4000-8000-000000000002', 'Admin B', 'admin', null);
insert into public.teacher_salaries (center_id, teacher_id, monthly_amount, effective_from) values
  ('c8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000003', 3000, '2026-01-01');

-- ---------------------------------------------------------------------
-- Admin du centre : réglage du salaire de l'assistante
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.set_staff_salary('a8100000-0000-4000-8000-000000000002', 2500, '2026-01-01')$$,
  'admin : salaire fixe de l''assistante enregistré');
select is((select pay_mode::text from public.profiles where id = 'a8100000-0000-4000-8000-000000000002'), 'fixed_salary',
  'assistante : mode salaire fixe');
select is((select count(*)::int from public.teacher_salaries where teacher_id = 'a8100000-0000-4000-8000-000000000002'), 1,
  'assistante : une ligne d''historique');
select lives_ok(
  $$select public.set_staff_salary('a8100000-0000-4000-8000-000000000002', 2500, '2026-01-01')$$,
  'même salaire enregistré deux fois');
select is((select count(*)::int from public.teacher_salaries where teacher_id = 'a8100000-0000-4000-8000-000000000002'), 1,
  'même salaire : pas de doublon d''historique');
select throws_ok(
  $$select public.set_staff_salary('a8100000-0000-4000-8000-000000000003', 2000, '2026-01-01')$$,
  'P0002', null, 'set_staff_salary : pas pour un professeur (réglage propre aux professeurs)');
select throws_ok(
  $$select public.set_staff_salary('a8100000-0000-4000-8000-000000000002', -1, '2026-01-01')$$,
  '22023', null, 'salaire négatif refusé');

-- Paie de janvier 2026 : professeur inchangé, assistante ajoutée.
select is((select total_amount from public.payroll_refresh(2026, 1)), 5500.00::numeric,
  'paie : professeur (3 000) + assistante (2 500)');
select is(
  (select computed_amount from public.payroll_lines where teacher_id = 'a8100000-0000-4000-8000-000000000003'),
  3000.00::numeric, 'professeur : calcul inchangé');
select is(
  (select row(member_role::text, pay_mode::text, computed_amount)::text from public.payroll_lines
   where teacher_id = 'a8100000-0000-4000-8000-000000000002'),
  '(assistant,fixed_salary,2500.00)', 'assistante : ligne de paie, rôle figé');
select is(
  (select count(*)::int from public.payroll_lines where teacher_id = 'a8100000-0000-4000-8000-000000000004'),
  0, 'assistant sans salaire : hors de la paie');
select is(
  (select payroll from public.admin_financial_summary(1)),
  (select total_amount from public.payroll_refresh(extract(year from private.today())::int, extract(month from private.today())::int)),
  'tableau financier : la paie du mois compte l''assistante');

-- ---------------------------------------------------------------------
-- Assistante et professeur : aucun montant lisible ni réglable
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a8100000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.teacher_salaries), 0, 'assistante : aucun salaire lisible (même le sien)');
select is((select count(*)::int from public.payroll_lines), 0, 'assistante : aucune ligne de paie lisible');
select is((select count(*)::int from public.payroll_periods), 0, 'assistante : aucune période de paie lisible');
select throws_ok(
  $$select public.set_staff_salary('a8100000-0000-4000-8000-000000000002', 9000, '2026-01-01')$$,
  '42501', null, 'assistante : ne fixe pas son salaire');
select throws_ok($$select public.payroll_refresh(2026, 1)$$, '42501', null, 'assistante : ne calcule pas la paie');

set local request.jwt.claims = '{"sub":"a8100000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.teacher_salaries), 0, 'professeur : aucun salaire lisible');
select is((select count(*)::int from public.payroll_lines), 0, 'professeur : aucune ligne de paie lisible');

-- Admin d'un autre centre : rien.
set local request.jwt.claims = '{"sub":"a8100000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok(
  $$select public.set_staff_salary('a8100000-0000-4000-8000-000000000002', 100, '2026-01-01')$$,
  'P0002', null, 'admin d''un autre centre : membre introuvable');
select is((select count(*)::int from public.teacher_salaries), 0, 'admin d''un autre centre : aucun salaire lisible');

-- ---------------------------------------------------------------------
-- Retrait de la paie ; changement de rôle
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.set_staff_salary('a8100000-0000-4000-8000-000000000002', null, null);
select is((select total_amount from public.payroll_refresh(2026, 1)), 3000.00::numeric,
  'salaire retiré : l''assistante sort du brouillon');

select throws_ok(
  $$update public.profiles set pay_mode = 'commission' where id = 'a8100000-0000-4000-8000-000000000004'$$,
  '23514', null, 'assistant : pas de commission');
select public.set_staff_salary('a8100000-0000-4000-8000-000000000004', 1800, '2026-01-01');
update public.profiles set role = 'admin' where id = 'a8100000-0000-4000-8000-000000000004';
select is((select pay_mode from public.profiles where id = 'a8100000-0000-4000-8000-000000000004'), 'fixed_salary'::public.pay_mode,
  'assistant devenu admin : le salaire fixe reste');

select * from finish();
rollback;
