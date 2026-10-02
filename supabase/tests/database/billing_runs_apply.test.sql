-- =====================================================================
-- Réinscription (page 8, phase 3, corrections) : arrêt ligne par ligne,
-- décision gardée, campagne suivante, mois sans cours
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('a5d00000-0000-4000-8000-000000000001', 'admin-p-p83b@test.local');
insert into public.centers (id, name, slug, auto_reenrollment_enabled) values
  ('c5d00000-0000-4000-8000-0000000000a1', 'Centre P', 'p83b-p', true);
insert into public.profiles (id, center_id, full_name, role) values
  ('a5d00000-0000-4000-8000-000000000001', 'c5d00000-0000-4000-8000-0000000000a1', 'Admin P', 'admin');
insert into public.levels (id, center_id, name) values
  ('d5d00000-0000-4000-8000-0000000000a1', 'c5d00000-0000-4000-8000-0000000000a1', 'Niveau P');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e5d00000-0000-4000-8000-000000000001', 'c5d00000-0000-4000-8000-0000000000a1', 'd5d00000-0000-4000-8000-0000000000a1', 'Maths', 300),
  ('e5d00000-0000-4000-8000-000000000002', 'c5d00000-0000-4000-8000-0000000000a1', 'd5d00000-0000-4000-8000-0000000000a1', 'Anglais', 250);
insert into public.students (id, center_id, full_name, level_id) values
  ('55d00000-0000-4000-8000-000000000001', 'c5d00000-0000-4000-8000-0000000000a1', 'Élève 1 pause', 'd5d00000-0000-4000-8000-0000000000a1'),
  ('55d00000-0000-4000-8000-000000000002', 'c5d00000-0000-4000-8000-0000000000a1', 'Élève 2 sans anglais', 'd5d00000-0000-4000-8000-0000000000a1'),
  ('55d00000-0000-4000-8000-000000000003', 'c5d00000-0000-4000-8000-0000000000a1', 'Élève 3 part', 'd5d00000-0000-4000-8000-0000000000a1');
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day) values
-- Élève 1 : Maths au cycle du 1er, Anglais au cycle du 15.
  ('65d00000-0000-4000-8000-000000000011', '55d00000-0000-4000-8000-000000000001', 'e5d00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('65d00000-0000-4000-8000-000000000012', '55d00000-0000-4000-8000-000000000001', 'e5d00000-0000-4000-8000-000000000002', '2026-09-20', 15),
-- Élève 2 : Maths et Anglais au cycle du 1er.
  ('65d00000-0000-4000-8000-000000000021', '55d00000-0000-4000-8000-000000000002', 'e5d00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('65d00000-0000-4000-8000-000000000022', '55d00000-0000-4000-8000-000000000002', 'e5d00000-0000-4000-8000-000000000002', '2026-09-01', 1),
-- Élève 3 : Anglais au cycle du 15 seulement.
  ('65d00000-0000-4000-8000-000000000032', '55d00000-0000-4000-8000-000000000003', 'e5d00000-0000-4000-8000-000000000002', '2026-09-20', 15);

select private.generate_billing_run('c5d00000-0000-4000-8000-0000000000a1', 2026::smallint, 11::smallint);
select set_config('test.nov', (select id::text from public.billing_runs
  where center_id = 'c5d00000-0000-4000-8000-0000000000a1' and period_month = 11), true);
-- Brouillon de décembre préparé tôt (avant la confirmation de novembre).
select private.generate_billing_run('c5d00000-0000-4000-8000-0000000000a1', 2026::smallint, 12::smallint);
select set_config('test.dec', (select id::text from public.billing_runs
  where center_id = 'c5d00000-0000-4000-8000-0000000000a1' and period_month = 12), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a5d00000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.set_reenrollment_intent(current_setting('test.nov')::uuid, '55d00000-0000-4000-8000-000000000001', 'paused');
select public.set_reenrollment_intent(current_setting('test.nov')::uuid, '55d00000-0000-4000-8000-000000000002', 'confirmed',
  array['65d00000-0000-4000-8000-000000000022']::uuid[], 'Sans anglais');
select public.set_reenrollment_intent(current_setting('test.nov')::uuid, '55d00000-0000-4000-8000-000000000003', 'dropped');
reset role;

-- ---------------------------------------------------------------------
-- Décision gardée : matière retirée, arrêtée puis reprise pendant le brouillon
-- ---------------------------------------------------------------------
update public.enrollments set active = false where id = '65d00000-0000-4000-8000-000000000022';
update public.enrollments set active = true where id = '65d00000-0000-4000-8000-000000000022';
select ok((select private.billing_line_dropped(subjects_dropped, '65d00000-0000-4000-8000-000000000022', null)
           from public.reenrollment_intents where billing_run_id = current_setting('test.nov')::uuid
             and student_id = '55d00000-0000-4000-8000-000000000002'),
  'matière retirée, arrêtée puis reprise pendant le brouillon : toujours retirée');
select is((select total_expected from public.billing_runs where id = current_setting('test.nov')::uuid), 300.00::numeric,
  'prévisionnel : seul le maths de l''élève 2 (les autres partent ou font une pause)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a5d00000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.confirm_billing_run(current_setting('test.nov')::uuid);
reset role;
select is((select count(*)::int from public.invoices where billing_run_id = current_setting('test.nov')::uuid
           and enrollment_id = '65d00000-0000-4000-8000-000000000022'), 0,
  'confirmation : la matière retirée n''est pas facturée');

-- ---------------------------------------------------------------------
-- Campagne suivante : sans les matières retirées pas encore arrêtées
-- ---------------------------------------------------------------------
select is((select count(*)::int from public.billing_run_lines where billing_run_id = current_setting('test.dec')::uuid
           and enrollment_id in ('65d00000-0000-4000-8000-000000000012', '65d00000-0000-4000-8000-000000000032')), 0,
  'brouillon de décembre préparé avant : remis à jour, sans les matières du cycle du 15 qui partent');
select private.generate_billing_run('c5d00000-0000-4000-8000-0000000000a1', 2027::smallint, 1::smallint);
select is((select count(*)::int from public.billing_run_lines l join public.billing_runs br on br.id = l.billing_run_id
           where br.center_id = 'c5d00000-0000-4000-8000-0000000000a1' and br.period_year = 2027
             and l.enrollment_id in ('65d00000-0000-4000-8000-000000000012', '65d00000-0000-4000-8000-000000000032')), 0,
  'brouillon préparé après la confirmation : sans elles non plus');

-- ---------------------------------------------------------------------
-- Arrêt ligne par ligne
-- ---------------------------------------------------------------------
select private.apply_reenrollment_intents('2026-11-01');
select results_eq(
  $$select (select active from public.enrollments where id = '65d00000-0000-4000-8000-000000000011'),
           (select active from public.enrollments where id = '65d00000-0000-4000-8000-000000000012'),
           (select stopped_at is not null from public.billing_run_lines where billing_run_id = current_setting('test.nov')::uuid
              and enrollment_id = '65d00000-0000-4000-8000-000000000011')$$,
  $$values (false, true, true)$$,
  '1er novembre : maths (cycle du 1er) arrêté et marqué, anglais (cycle du 15) attend');
update public.enrollments set active = true where id = '65d00000-0000-4000-8000-000000000011';
select ok(not private.campaign_covers('c5d00000-0000-4000-8000-0000000000a1', '2026-11-01',
  '65d00000-0000-4000-8000-000000000011', null), 'ligne arrêtée : la campagne ne couvre plus la reprise');
select ok(private.create_period_invoice('65d00000-0000-4000-8000-000000000011', '2026-11-05', true),
  'reprise du maths le 5 : novembre facturé normalement');
select private.apply_reenrollment_intents('2026-11-06');
select ok((select active from public.enrollments where id = '65d00000-0000-4000-8000-000000000011'),
  'le lendemain : le maths repris n''est pas arrêté une seconde fois');
select ok((select applied_at is null from public.reenrollment_intents where billing_run_id = current_setting('test.nov')::uuid
           and student_id = '55d00000-0000-4000-8000-000000000001'), 'intention pas encore appliquée (anglais au 15)');
select private.apply_reenrollment_intents('2026-11-15');
select results_eq(
  $$select (select active from public.enrollments where id = '65d00000-0000-4000-8000-000000000011'),
           (select active from public.enrollments where id = '65d00000-0000-4000-8000-000000000012'),
           (select applied_at is not null from public.reenrollment_intents where billing_run_id = current_setting('test.nov')::uuid
              and student_id = '55d00000-0000-4000-8000-000000000001')$$,
  $$values (true, false, true)$$,
  '15 novembre : anglais arrêté, maths repris intact, intention appliquée');
select is((select count(*)::int from public.center_events where center_id = 'c5d00000-0000-4000-8000-0000000000a1'
           and action = 'reenrollment.apply_failed'), 0, 'aucun échec d''application');

-- ---------------------------------------------------------------------
-- Mois sans cours : prévisionnel à zéro
-- ---------------------------------------------------------------------
select ok((select total_expected > 0 from public.billing_runs where id = current_setting('test.dec')::uuid),
  'brouillon de décembre : un prévisionnel');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a5d00000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.cancel_billing_run(current_setting('test.dec')::uuid, 'Vacances');
reset role;
select results_eq(
  $$select status::text, total_expected, student_count from public.billing_runs where id = current_setting('test.dec')::uuid$$,
  $$values ('cancelled', 0.00::numeric, 0)$$,
  'mois sans cours : prévisionnel et élèves à zéro');

select * from finish();
rollback;
