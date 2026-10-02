-- =====================================================================
-- Réinscription (page 8, phase 3) : revue, intentions, élèves à risque,
-- confirmation, mois sans cours, application au début des périodes
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

insert into auth.users (id, email) values
  ('a3a00000-0000-4000-8000-000000000001', 'admin-k-p83@test.local'),
  ('a3a00000-0000-4000-8000-000000000002', 'accueil-k-p83@test.local'),
  ('a3a00000-0000-4000-8000-000000000003', 'prof-k-p83@test.local'),
  ('a3a00000-0000-4000-8000-000000000004', 'admin-l-p83@test.local'),
  ('a3a00000-0000-4000-8000-000000000009', 'owner-p83@test.local');
insert into public.centers (id, name, slug, auto_reenrollment_enabled, risk_attendance_threshold) values
  ('c3a00000-0000-4000-8000-0000000000b1', 'Centre K', 'p83-k', true, 75),
  ('c3a00000-0000-4000-8000-0000000000c1', 'Centre L', 'p83-l', true, 75);
insert into public.profiles (id, center_id, full_name, role) values
  ('a3a00000-0000-4000-8000-000000000001', 'c3a00000-0000-4000-8000-0000000000b1', 'Admin K', 'admin'),
  ('a3a00000-0000-4000-8000-000000000002', 'c3a00000-0000-4000-8000-0000000000b1', 'Accueil K', 'assistant'),
  ('a3a00000-0000-4000-8000-000000000003', 'c3a00000-0000-4000-8000-0000000000b1', 'Prof K', 'teacher'),
  ('a3a00000-0000-4000-8000-000000000004', 'c3a00000-0000-4000-8000-0000000000c1', 'Admin L', 'admin'),
  ('a3a00000-0000-4000-8000-000000000009', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values
  ('d3a00000-0000-4000-8000-0000000000b1', 'c3a00000-0000-4000-8000-0000000000b1', 'Niveau K');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e3a00000-0000-4000-8000-000000000001', 'c3a00000-0000-4000-8000-0000000000b1', 'd3a00000-0000-4000-8000-0000000000b1', 'Maths', 300),
  ('e3a00000-0000-4000-8000-000000000002', 'c3a00000-0000-4000-8000-0000000000b1', 'd3a00000-0000-4000-8000-0000000000b1', 'Anglais', 250);
insert into public.students (id, center_id, full_name, level_id) values
  ('53a00000-0000-4000-8000-000000000001', 'c3a00000-0000-4000-8000-0000000000b1', 'Élève 1 à jour', 'd3a00000-0000-4000-8000-0000000000b1'),
  ('53a00000-0000-4000-8000-000000000002', 'c3a00000-0000-4000-8000-0000000000b1', 'Élève 2 impayé', 'd3a00000-0000-4000-8000-0000000000b1'),
  ('53a00000-0000-4000-8000-000000000003', 'c3a00000-0000-4000-8000-0000000000b1', 'Élève 3 absent', 'd3a00000-0000-4000-8000-0000000000b1'),
  ('53a00000-0000-4000-8000-000000000004', 'c3a00000-0000-4000-8000-0000000000b1', 'Élève 4 part', 'd3a00000-0000-4000-8000-0000000000b1'),
  ('53a00000-0000-4000-8000-000000000005', 'c3a00000-0000-4000-8000-0000000000b1', 'Élève 5 retire', 'd3a00000-0000-4000-8000-0000000000b1'),
  ('53a00000-0000-4000-8000-000000000006', 'c3a00000-0000-4000-8000-0000000000b1', 'Élève 6 pause', 'd3a00000-0000-4000-8000-0000000000b1');
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day) values
  ('63a00000-0000-4000-8000-000000000011', '53a00000-0000-4000-8000-000000000001', 'e3a00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('63a00000-0000-4000-8000-000000000021', '53a00000-0000-4000-8000-000000000002', 'e3a00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('63a00000-0000-4000-8000-000000000031', '53a00000-0000-4000-8000-000000000003', 'e3a00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('63a00000-0000-4000-8000-000000000041', '53a00000-0000-4000-8000-000000000004', 'e3a00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('63a00000-0000-4000-8000-000000000051', '53a00000-0000-4000-8000-000000000005', 'e3a00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('63a00000-0000-4000-8000-000000000052', '53a00000-0000-4000-8000-000000000005', 'e3a00000-0000-4000-8000-000000000002', '2026-09-20', 15),
  ('63a00000-0000-4000-8000-000000000061', '53a00000-0000-4000-8000-000000000006', 'e3a00000-0000-4000-8000-000000000001', '2026-09-01', 1);
-- Premières factures réglées, sauf celle de l'élève 2 (impayé en retard).
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now()
where student_id in (select id from public.students where center_id = 'c3a00000-0000-4000-8000-0000000000b1')
  and student_id <> '53a00000-0000-4000-8000-000000000002';
-- Élève 3 : une présence sur quatre séances ces 30 derniers jours (25 % < 75 %).
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('53a00000-0000-4000-8000-000000000003', 'e3a00000-0000-4000-8000-000000000001', null, private.today() - 2, 'present'),
  ('53a00000-0000-4000-8000-000000000003', 'e3a00000-0000-4000-8000-000000000001', null, private.today() - 5, 'absent'),
  ('53a00000-0000-4000-8000-000000000003', 'e3a00000-0000-4000-8000-000000000001', null, private.today() - 9, 'absent'),
  ('53a00000-0000-4000-8000-000000000003', 'e3a00000-0000-4000-8000-000000000001', null, private.today() - 12, 'absent'),
  ('53a00000-0000-4000-8000-000000000001', 'e3a00000-0000-4000-8000-000000000001', null, private.today() - 2, 'present');

select private.generate_billing_runs('2026-10-25');
select set_config('test.run_id', (select id::text from public.billing_runs where center_id = 'c3a00000-0000-4000-8000-0000000000b1' and period_month = 11), true);

-- ---------------------------------------------------------------------
-- Revue : élèves, lignes, élèves à risque
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3a00000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.billing_run_review(current_setting('test.run_id')::uuid)), 6,
  'accueil : revue de la campagne, un élève par ligne');
select results_eq(
  $$select full_name, overdue_amount > 0, low_attendance from public.billing_run_review(current_setting('test.run_id')::uuid)
    where at_risk order by full_name$$,
  $$values ('Élève 2 impayé', true, false), ('Élève 3 absent', false, true)$$,
  'à risque : impayé en retard d''un mois précédent, présence sous le seuil');
select is((select jsonb_array_length(lines) from public.billing_run_review(current_setting('test.run_id')::uuid)
           where student_id = '53a00000-0000-4000-8000-000000000005'), 2,
  'chaque matière du mois a sa ligne (tarif plein, remise, net)');

-- ---------------------------------------------------------------------
-- Intentions (accueil et admin, brouillon)
-- ---------------------------------------------------------------------
select lives_ok($$select public.set_reenrollment_intent(current_setting('test.run_id')::uuid,
  '53a00000-0000-4000-8000-000000000004', 'dropped', '{}', 'Déménagement')$$, 'accueil : abandon noté avec son motif');
select lives_ok($$select public.set_reenrollment_intent(current_setting('test.run_id')::uuid,
  '53a00000-0000-4000-8000-000000000006', 'paused')$$, 'accueil : pause notée');
select lives_ok($$select public.set_reenrollment_intent(current_setting('test.run_id')::uuid,
  '53a00000-0000-4000-8000-000000000005', 'confirmed', array['63a00000-0000-4000-8000-000000000052']::uuid[])$$,
  'accueil : reconduit sans l''anglais');
select throws_ok($$select public.set_reenrollment_intent(current_setting('test.run_id')::uuid,
  '53a00000-0000-4000-8000-000000000005', 'confirmed',
  array['63a00000-0000-4000-8000-000000000051', '63a00000-0000-4000-8000-000000000052']::uuid[])$$,
  '22023', null, 'reconduit sans aucune matière : refusé (abandon ou pause)');
select results_eq(
  $$select student_count, total_expected from public.billing_runs where id = current_setting('test.run_id')::uuid$$,
  $$values (4, 1200.00::numeric)$$,
  'prévisionnel : sans les élèves qui partent ni la matière retirée');

set local request.jwt.claims = '{"sub":"a3a00000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select public.set_reenrollment_intent(current_setting('test.run_id')::uuid,
  '53a00000-0000-4000-8000-000000000001', 'dropped')$$, '42501', null, 'professeur : aucune intention');
set local request.jwt.claims = '{"sub":"a3a00000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$select public.set_reenrollment_intent(current_setting('test.run_id')::uuid,
  '53a00000-0000-4000-8000-000000000001', 'dropped')$$, '42501', null, 'admin d''un autre centre : aucune intention');
select is((select count(*)::int from public.billing_run_review(current_setting('test.run_id')::uuid)), 0,
  'admin d''un autre centre : revue vide');
reset role;

-- Les décisions survivent au recalcul du brouillon (remise accordée).
insert into public.discounts (center_id, student_id, type, value, scope, reason, valid_from)
values ('c3a00000-0000-4000-8000-0000000000b1', '53a00000-0000-4000-8000-000000000005', 'percentage', 10, 'all_subjects', 'sibling', '2026-09-01');
select results_eq(
  $$select intent::text, jsonb_array_length(subjects_kept), jsonb_array_length(subjects_dropped)
    from public.reenrollment_intents where student_id = '53a00000-0000-4000-8000-000000000005'$$,
  $$values ('confirmed', 1, 1)$$,
  'remise après la décision : lignes recalculées, matière toujours retirée');
select is((select total_expected from public.billing_runs where id = current_setting('test.run_id')::uuid),
  1170.00::numeric, 'prévisionnel recalculé avec la remise');

-- ---------------------------------------------------------------------
-- Confirmation : admin seulement
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3a00000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.confirm_billing_run(current_setting('test.run_id')::uuid)$$, '42501', null,
  'accueil : ne confirme pas');
reset role;
insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a3a00000-0000-4000-8000-000000000009', 'c3a00000-0000-4000-8000-0000000000b1', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3a00000-0000-4000-8000-000000000009","role":"authenticated"}';
select throws_ok($$select public.confirm_billing_run(current_setting('test.run_id')::uuid)$$, '42501',
  'Mode support : lecture seule.', 'support : lecture seule');
select is((select count(*)::int from public.billing_run_review(current_setting('test.run_id')::uuid)), 6,
  'support : la revue reste lisible');
set local request.jwt.claims = '{"sub":"a3a00000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((public.confirm_billing_run(current_setting('test.run_id')::uuid) ->> 'invoices')::int, 4,
  'admin : campagne confirmée, une facture par ligne conservée');
reset role;

select results_eq(
  $$select count(*)::int, sum(amount_due), bool_and(status = 'pending'), bool_and(due_date = '2026-11-05')
    from public.invoices where billing_run_id = current_setting('test.run_id')::uuid$$,
  $$values (4, 1170.00::numeric, true, true)$$,
  'factures émises au montant des lignes, échéance le 5');
select is((select count(*)::int from public.invoices where billing_run_id = current_setting('test.run_id')::uuid
           and student_id in ('53a00000-0000-4000-8000-000000000004', '53a00000-0000-4000-8000-000000000006')
              or (billing_run_id = current_setting('test.run_id')::uuid and enrollment_id = '63a00000-0000-4000-8000-000000000052')), 0,
  'ni l''élève qui part, ni l''élève en pause, ni la matière retirée ne sont facturés');
select results_eq(
  $$select status::text, student_count, total_expected, confirmed_by
    from public.billing_runs where id = current_setting('test.run_id')::uuid$$,
  $$values ('confirmed', 4, 1170.00::numeric, 'a3a00000-0000-4000-8000-000000000001'::uuid)$$,
  'campagne confirmée : total des factures émises, auteur consigné');
select is((select count(*)::int from public.reenrollment_intents
           where billing_run_id = current_setting('test.run_id')::uuid and intent = 'pending'), 0,
  'sans décision à la confirmation : reconduit');
select is((select count(*)::int from public.center_events
           where center_id = 'c3a00000-0000-4000-8000-0000000000b1' and action = 'billing_run.confirmed'
             and actor_id = 'a3a00000-0000-4000-8000-000000000001'), 1,
  'confirmation consignée au journal du centre');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a3a00000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.set_reenrollment_intent(current_setting('test.run_id')::uuid,
  '53a00000-0000-4000-8000-000000000001', 'dropped')$$, '22023', null, 'campagne confirmée : intentions figées');
select throws_ok($$select public.confirm_billing_run(current_setting('test.run_id')::uuid)$$, '22023', null,
  'deuxième confirmation refusée');
reset role;

-- ---------------------------------------------------------------------
-- Application au début des périodes
-- ---------------------------------------------------------------------
select private.generate_invoices('2026-11-01');
select is((select count(*)::int from public.invoices where enrollment_id = '63a00000-0000-4000-8000-000000000041'
           and period_start = '2026-11-01'), 0,
  'avant application, la ligne retirée couvre encore la période : pas de facture');

select private.apply_reenrollment_intents('2026-11-01');
select results_eq(
  $$select id, active from public.enrollments
    where id in ('63a00000-0000-4000-8000-000000000041', '63a00000-0000-4000-8000-000000000061',
                 '63a00000-0000-4000-8000-000000000051', '63a00000-0000-4000-8000-000000000052') order by id$$,
  $$values ('63a00000-0000-4000-8000-000000000041'::uuid, false), ('63a00000-0000-4000-8000-000000000051'::uuid, true),
           ('63a00000-0000-4000-8000-000000000052'::uuid, true), ('63a00000-0000-4000-8000-000000000061'::uuid, false)$$,
  '1er novembre : abandon et pause appliqués ; l''anglais (cycle du 15) attend sa période');
select ok((select applied_at is null from public.reenrollment_intents where student_id = '53a00000-0000-4000-8000-000000000005'),
  'intention appliquée seulement quand tout ce qu''elle retire est arrêté');
select private.apply_reenrollment_intents('2026-11-15');
select results_eq(
  $$select (select active from public.enrollments where id = '63a00000-0000-4000-8000-000000000052'),
           (select applied_at is not null from public.reenrollment_intents where student_id = '53a00000-0000-4000-8000-000000000005')$$,
  $$values (false, true)$$,
  '15 novembre : anglais arrêté, intention appliquée');

-- Reprise après la pause : facturée normalement.
update public.enrollments set active = true where id = '63a00000-0000-4000-8000-000000000061';
select ok(private.create_period_invoice('63a00000-0000-4000-8000-000000000061', '2026-11-05', true),
  'reprise après une pause appliquée : la période se facture normalement');

-- ---------------------------------------------------------------------
-- Clôture automatique, mois sans cours
-- ---------------------------------------------------------------------
select is(private.close_billing_runs('2026-12-14'), 0, 'campagne close seulement après sa dernière période (cycle du 15 : le 14 décembre)');
select is(private.close_billing_runs('2026-12-15'), 1, 'campagne close le lendemain de sa dernière période');

select private.generate_billing_runs('2026-11-25');
select set_config('test.dec_id', (select id::text from public.billing_runs where center_id = 'c3a00000-0000-4000-8000-0000000000b1' and period_month = 12), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3a00000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.cancel_billing_run(current_setting('test.dec_id')::uuid, '  ')$$, '22023', null,
  'mois sans cours : motif obligatoire');
select lives_ok($$select public.cancel_billing_run(current_setting('test.dec_id')::uuid, 'Vacances de décembre')$$,
  'admin : décembre déclaré sans cours');
reset role;
select results_eq(
  $$select status::text, cancel_reason, cancelled_by from public.billing_runs where id = current_setting('test.dec_id')::uuid$$,
  $$values ('cancelled', 'Vacances de décembre', 'a3a00000-0000-4000-8000-000000000001'::uuid)$$,
  'mois sans cours : motif et auteur consignés');

select * from finish();
rollback;
