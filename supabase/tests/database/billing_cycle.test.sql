-- =====================================================================
-- Tests du cycle de paiement choisi — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values ('a8000000-0000-4000-8000-000000000001', 'assistant-p13@test.local');
insert into public.centers (id, name) values ('c8000000-0000-4000-8000-000000000001', 'Centre P13');
insert into public.profiles (id, center_id, full_name, role) values
  ('a8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Assistant P13', 'assistant');
insert into public.levels (id, center_id, name) values
  ('d8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Niveau P13');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'Maths P13', 300),
  ('e8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'PC P13', 250);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a8000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Cycle choisi à l'inscription : le 15.
select lives_ok(
  $$select public.create_student('f8000000-0000-4000-8000-000000000001', 'Élève cycle 15',
      'd8000000-0000-4000-8000-000000000001', array['e8000000-0000-4000-8000-000000000001']::uuid[],
      null, null, null, null, null, 15::smallint)$$,
  'inscription : cycle du 15 choisi');
select is(
  (select billing_day from public.enrollments where student_id = 'f8000000-0000-4000-8000-000000000001'),
  15::smallint, 'inscription : le cycle choisi est enregistré');
select results_eq(
  $$select period_start, due_date from public.invoices where student_id = 'f8000000-0000-4000-8000-000000000001'$$,
  $$select private.billing_period_start(private.today(), 15::smallint), private.today()$$,
  'première facture : période du cycle en cours, due le jour de l''inscription');
select throws_ok(
  $$select public.create_student(gen_random_uuid(), 'Cycle invalide', 'd8000000-0000-4000-8000-000000000001',
      array['e8000000-0000-4000-8000-000000000001']::uuid[], null, null, null, null, null, 10::smallint)$$,
  '22023', null, 'inscription : cycle autre que le 1er ou le 15 refusé');

reset role;

-- Nouvelle matière sans cycle précisé : elle suit le cycle de l'élève.
insert into public.enrollments (student_id, subject_id, start_date) values
  ('f8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000002', '2026-03-03');
select is(
  (select billing_day from public.enrollments
    where student_id = 'f8000000-0000-4000-8000-000000000001' and subject_id = 'e8000000-0000-4000-8000-000000000002'),
  15::smallint, 'nouvelle matière : suit le cycle déjà en place pour l''élève');

-- Échéance le jour même : en retard dès le premier jour de la période.
insert into public.students (id, center_id, full_name, level_id) values
  ('f8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'Élève cycle 1', 'd8000000-0000-4000-8000-000000000001');
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day) values
  ('b8000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-000000000001', '2026-01-20', 1);
select is(
  (select period_start from public.invoices where enrollment_id = 'b8000000-0000-4000-8000-000000000001'),
  '2026-01-01'::date, 'inscrit le 20 au cycle du 1er : période du 1er du mois');

do $$ begin perform private.generate_invoices('2026-02-01'); end $$;
select is(
  (select due_date from public.invoices where enrollment_id = 'b8000000-0000-4000-8000-000000000001' and period_start = '2026-02-01'),
  '2026-02-01'::date, 'nouvelle période : due le premier jour');
do $$ begin perform private.mark_overdue_invoices('2026-02-01'); end $$;
select is(
  (select status::text from public.invoices where enrollment_id = 'b8000000-0000-4000-8000-000000000001' and period_start = '2026-02-01'),
  'overdue', 'impayé le jour même : passe en retard');
select ok(
  private.invoice_is_overdue('pending', private.today()),
  'échéance aujourd''hui non réglée : déjà en retard');

select * from finish();
rollback;
