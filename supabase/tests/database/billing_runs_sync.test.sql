-- =====================================================================
-- Réinscription (page 8, phase 2) : le brouillon suit les inscriptions, les
-- remises et l'échéance ; mois sans cours ; un centre en échec ne bloque
-- pas le job quotidien
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email) values
  ('a2900000-0000-4000-8000-000000000001', 'admin-e-p82s@test.local'),
  ('a2900000-0000-4000-8000-000000000009', 'owner-p82s@test.local');
insert into public.centers (id, name, slug, auto_reenrollment_enabled, billing_generation_day) values
  ('c2900000-0000-4000-8000-0000000000e1', 'Centre E', 'p82s-e', true, 25),
  ('c2900000-0000-4000-8000-0000000000f1', 'Centre F', 'p82s-f', true, 28),
  ('c2900000-0000-4000-8000-0000000000a1', 'Centre G', 'p82s-g', false, 25);
insert into public.profiles (id, center_id, full_name, role) values
  ('a2900000-0000-4000-8000-000000000001', 'c2900000-0000-4000-8000-0000000000e1', 'Admin E', 'admin'),
  ('a2900000-0000-4000-8000-000000000009', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values
  ('d2900000-0000-4000-8000-0000000000e1', 'c2900000-0000-4000-8000-0000000000e1', 'Niveau E'),
  ('d2900000-0000-4000-8000-0000000000f1', 'c2900000-0000-4000-8000-0000000000f1', 'Niveau F'),
  ('d2900000-0000-4000-8000-0000000000a1', 'c2900000-0000-4000-8000-0000000000a1', 'Niveau G');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e2900000-0000-4000-8000-000000000001', 'c2900000-0000-4000-8000-0000000000e1', 'd2900000-0000-4000-8000-0000000000e1', 'Maths', 300),
  ('e2900000-0000-4000-8000-000000000002', 'c2900000-0000-4000-8000-0000000000e1', 'd2900000-0000-4000-8000-0000000000e1', 'Anglais', 250),
  ('e2900000-0000-4000-8000-000000000003', 'c2900000-0000-4000-8000-0000000000e1', 'd2900000-0000-4000-8000-0000000000e1', 'Physique', 200),
  ('e2900000-0000-4000-8000-0000000000f1', 'c2900000-0000-4000-8000-0000000000f1', 'd2900000-0000-4000-8000-0000000000f1', 'Maths F', 300),
  ('e2900000-0000-4000-8000-0000000000a1', 'c2900000-0000-4000-8000-0000000000a1', 'd2900000-0000-4000-8000-0000000000a1', 'Maths G', 300);
insert into public.packs (id, center_id, level_id, name, monthly_price) values
  ('f2900000-0000-4000-8000-000000000001', 'c2900000-0000-4000-8000-0000000000e1', 'd2900000-0000-4000-8000-0000000000e1', 'Pack sciences', 400);
insert into public.pack_subjects (pack_id, subject_id) values
  ('f2900000-0000-4000-8000-000000000001', 'e2900000-0000-4000-8000-000000000001'),
  ('f2900000-0000-4000-8000-000000000001', 'e2900000-0000-4000-8000-000000000003');
insert into public.students (id, center_id, full_name, level_id) values
  ('52900000-0000-4000-8000-000000000001', 'c2900000-0000-4000-8000-0000000000e1', 'Élève A', 'd2900000-0000-4000-8000-0000000000e1'),
  ('52900000-0000-4000-8000-000000000002', 'c2900000-0000-4000-8000-0000000000e1', 'Élève B', 'd2900000-0000-4000-8000-0000000000e1'),
  ('52900000-0000-4000-8000-000000000003', 'c2900000-0000-4000-8000-0000000000e1', 'Élève C', 'd2900000-0000-4000-8000-0000000000e1'),
  ('52900000-0000-4000-8000-000000000004', 'c2900000-0000-4000-8000-0000000000e1', 'Élève D', 'd2900000-0000-4000-8000-0000000000e1'),
  ('52900000-0000-4000-8000-000000000005', 'c2900000-0000-4000-8000-0000000000e1', 'Élève N', 'd2900000-0000-4000-8000-0000000000e1'),
  ('52900000-0000-4000-8000-000000000006', 'c2900000-0000-4000-8000-0000000000e1', 'Élève O', 'd2900000-0000-4000-8000-0000000000e1'),
  ('52900000-0000-4000-8000-000000000007', 'c2900000-0000-4000-8000-0000000000e1', 'Élève R', 'd2900000-0000-4000-8000-0000000000e1'),
  ('52900000-0000-4000-8000-000000000008', 'c2900000-0000-4000-8000-0000000000e1', 'Élève H', 'd2900000-0000-4000-8000-0000000000e1'),
  ('52900000-0000-4000-8000-0000000000f1', 'c2900000-0000-4000-8000-0000000000f1', 'Élève F', 'd2900000-0000-4000-8000-0000000000f1'),
  ('52900000-0000-4000-8000-0000000000a1', 'c2900000-0000-4000-8000-0000000000a1', 'Élève G', 'd2900000-0000-4000-8000-0000000000a1');

insert into public.enrollments (id, student_id, subject_id, start_date, billing_day) values
-- Élève A : Maths (cycle du 1er), Anglais (cycle du 15).
  ('62900000-0000-4000-8000-000000000011', '52900000-0000-4000-8000-000000000001', 'e2900000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('62900000-0000-4000-8000-000000000012', '52900000-0000-4000-8000-000000000001', 'e2900000-0000-4000-8000-000000000002', '2026-09-20', 15),
-- Élève B : Maths et Physique à l'unité (passera au pack).
  ('62900000-0000-4000-8000-000000000021', '52900000-0000-4000-8000-000000000002', 'e2900000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('62900000-0000-4000-8000-000000000022', '52900000-0000-4000-8000-000000000002', 'e2900000-0000-4000-8000-000000000003', '2026-09-01', 1),
-- Élève C : Anglais (arrêté après la préparation) ; élève D : Maths, deux remises.
  ('62900000-0000-4000-8000-000000000031', '52900000-0000-4000-8000-000000000003', 'e2900000-0000-4000-8000-000000000002', '2026-09-01', 1),
  ('62900000-0000-4000-8000-000000000041', '52900000-0000-4000-8000-000000000004', 'e2900000-0000-4000-8000-000000000001', '2026-09-01', 1),
-- Élève H : Physique (arrêtée puis reprise pendant un mois sans cours).
  ('62900000-0000-4000-8000-000000000081', '52900000-0000-4000-8000-000000000008', 'e2900000-0000-4000-8000-000000000003', '2026-09-01', 1),
-- Centres F (préparation en échec) et G (réinscription désactivée).
  ('62900000-0000-4000-8000-0000000000f1', '52900000-0000-4000-8000-0000000000f1', 'e2900000-0000-4000-8000-0000000000f1', '2026-09-01', 1),
  ('62900000-0000-4000-8000-0000000000a1', '52900000-0000-4000-8000-0000000000a1', 'e2900000-0000-4000-8000-0000000000a1', '2026-09-01', 1);
insert into public.discounts (center_id, student_id, type, value, scope, subject_id, reason, valid_from) values
  ('c2900000-0000-4000-8000-0000000000e1', '52900000-0000-4000-8000-000000000004', 'percentage', 10, 'specific_subject', 'e2900000-0000-4000-8000-000000000001', 'sibling', '2026-09-01'),
  ('c2900000-0000-4000-8000-0000000000e1', '52900000-0000-4000-8000-000000000004', 'fixed_amount', 20, 'all_subjects', null, 'sibling', '2026-09-01');

-- ---------------------------------------------------------------------
-- Préparation
-- ---------------------------------------------------------------------
select is(private.generate_billing_runs('2026-10-25'), 1, 'le 25 : campagne de novembre préparée pour le centre E');
select results_eq(
  $$select student_count, total_expected from public.billing_runs
    where center_id = 'c2900000-0000-4000-8000-0000000000e1' and period_month = 11$$,
  $$values (5, 1770.00::numeric)$$,
  'brouillon : 5 élèves, 1 770 MAD');
select results_eq(
  $$select amount_due, discount_conflict from public.billing_run_lines where enrollment_id = '62900000-0000-4000-8000-000000000041'$$,
  $$values (270.00::numeric, true)$$,
  'remises concurrentes : la meilleure est déduite, le conflit est signalé sur la ligne');

-- ---------------------------------------------------------------------
-- Le brouillon suit les remises et le jour d'échéance
-- ---------------------------------------------------------------------
insert into public.discounts (id, center_id, student_id, type, value, scope, reason, valid_from)
values ('82900000-0000-4000-8000-000000000001', 'c2900000-0000-4000-8000-0000000000e1', '52900000-0000-4000-8000-000000000001',
        'percentage', 20, 'all_subjects', 'sibling', '2026-11-01');
select results_eq(
  $$select amount_due from public.billing_run_lines where student_id = '52900000-0000-4000-8000-000000000001' order by amount_due$$,
  $$values (200.00::numeric), (240.00::numeric)$$,
  'remise accordée après la préparation : déduite des lignes du brouillon');
select is((select total_expected from public.billing_runs where center_id = 'c2900000-0000-4000-8000-0000000000e1' and period_month = 11),
  1660.00::numeric, 'total du brouillon recalculé');
update public.discounts set is_active = false where id = '82900000-0000-4000-8000-000000000001';
select is((select amount_due from public.billing_run_lines where enrollment_id = '62900000-0000-4000-8000-000000000011'),
  300.00::numeric, 'remise retirée : plein tarif rétabli');

update public.centers set payment_due_day = 10 where id = 'c2900000-0000-4000-8000-0000000000e1';
select results_eq(
  $$select due_date from public.billing_run_lines where student_id = '52900000-0000-4000-8000-000000000001' order by due_date$$,
  $$values ('2026-11-10'::date), ('2026-11-24'::date)$$,
  'jour d''échéance modifié : échéances du brouillon recalculées (cycle du 1er et du 15)');

-- ---------------------------------------------------------------------
-- Le brouillon suit les inscriptions
-- ---------------------------------------------------------------------
update public.enrollments set active = false where id = '62900000-0000-4000-8000-000000000031';
select is((select count(*)::int from public.billing_run_lines where student_id = '52900000-0000-4000-8000-000000000003')
          + (select count(*)::int from public.reenrollment_intents where student_id = '52900000-0000-4000-8000-000000000003'), 0,
  'inscription arrêtée après la préparation : ni ligne, ni intention');

-- Élève B passe au pack (les matières à l'unité s'arrêtent d'abord).
update public.enrollments set active = false
where id in ('62900000-0000-4000-8000-000000000021', '62900000-0000-4000-8000-000000000022');
insert into public.pack_enrollments (id, student_id, pack_id, start_date, billing_day)
values ('72900000-0000-4000-8000-000000000021', '52900000-0000-4000-8000-000000000002', 'f2900000-0000-4000-8000-000000000001', '2026-11-01', 1);
select is((select count(*)::int from public.billing_run_lines where student_id = '52900000-0000-4000-8000-000000000002'), 0,
  'passage au pack : plus de ligne pour les matières arrêtées (le pack a sa première facture)');

-- Élève N inscrit après la préparation : il rejoint le brouillon de novembre.
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day)
values ('62900000-0000-4000-8000-000000000051', '52900000-0000-4000-8000-000000000005', 'e2900000-0000-4000-8000-000000000003', '2026-10-20', 1);
select results_eq(
  $$select period_start, amount_due from public.billing_run_lines where enrollment_id = '62900000-0000-4000-8000-000000000051'$$,
  $$values ('2026-11-01'::date, 200.00::numeric)$$,
  'inscription postérieure à la préparation : ajoutée au brouillon');

select private.generate_invoices('2026-11-01');
select is((select coalesce(sum(amount_due), 0) from public.invoices
           where student_id = '52900000-0000-4000-8000-000000000002' and period_start = '2026-11-01'),
  400.00::numeric, 'passage au pack : novembre facturé une seule fois (le pack seul)');
select is((select count(*)::int from public.invoices
           where period_start = '2026-11-01'
             and enrollment_id in ('62900000-0000-4000-8000-000000000011', '62900000-0000-4000-8000-000000000051',
                                   '62900000-0000-4000-8000-000000000031')), 0,
  'facturation quotidienne : ni les lignes du brouillon, ni l''inscription arrêtée');
select results_eq(
  $$select student_count, total_expected, (select count(*)::int from public.reenrollment_intents ri where ri.billing_run_id = br.id)
    from public.billing_runs br where center_id = 'c2900000-0000-4000-8000-0000000000e1' and period_month = 11$$,
  $$values (4, 1220.00::numeric, 4)$$,
  'brouillon à jour : 4 élèves, 1 220 MAD, une intention par élève restant');
select is((select jsonb_array_length(subjects_kept) from public.reenrollment_intents where student_id = '52900000-0000-4000-8000-000000000001'),
  2, 'intention : matières reconduites = lignes de l''élève');

-- ---------------------------------------------------------------------
-- Mois sans cours : ni la reprise, ni une nouvelle inscription ne facturent
-- ---------------------------------------------------------------------
insert into public.billing_runs (center_id, period_year, period_month, status, cancelled_at, cancel_reason)
values ('c2900000-0000-4000-8000-0000000000e1', 2026, 10, 'cancelled', now(), 'Vacances');
update public.enrollments set active = false where id = '62900000-0000-4000-8000-000000000081';
update public.enrollments set active = true where id = '62900000-0000-4000-8000-000000000081';
select is((select count(*)::int from public.invoices where enrollment_id = '62900000-0000-4000-8000-000000000081' and period_start = '2026-10-01'), 0,
  'reprise pendant un mois sans cours : pas de facture');
select is((select count(*)::int from public.billing_run_lines where enrollment_id = '62900000-0000-4000-8000-000000000081'), 1,
  'reprise : la ligne de novembre revient dans le brouillon');
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day)
values ('62900000-0000-4000-8000-000000000061', '52900000-0000-4000-8000-000000000006', 'e2900000-0000-4000-8000-000000000002', '2026-10-02', 1);
select is((select count(*)::int from public.invoices where enrollment_id = '62900000-0000-4000-8000-000000000061'), 0,
  'inscription pendant un mois sans cours : pas de première facture');
update public.enrollments set active = false where id = '62900000-0000-4000-8000-0000000000a1';
update public.enrollments set active = true where id = '62900000-0000-4000-8000-0000000000a1';
select is((select count(*)::int from public.invoices where enrollment_id = '62900000-0000-4000-8000-0000000000a1' and period_start = '2026-10-01'), 1,
  'sans réinscription automatique : la reprise facture comme avant');

-- ---------------------------------------------------------------------
-- Reste dû d'un reçu : une facture de campagne due aujourd'hui compte
-- ---------------------------------------------------------------------
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day)
values ('62900000-0000-4000-8000-000000000071', '52900000-0000-4000-8000-000000000007', 'e2900000-0000-4000-8000-000000000002', '2026-10-02', 1);
insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_full, discount_amount, amount_due, due_date, billing_run_id)
select '62900000-0000-4000-8000-000000000071', '52900000-0000-4000-8000-000000000007', '2026-10-01', '2026-10-31', 250, 0, 250,
       private.today(), br.id
from public.billing_runs br where br.center_id = 'c2900000-0000-4000-8000-0000000000e1' and br.period_month = 10;
select is(private.student_balance_due('52900000-0000-4000-8000-000000000007'), 250.00::numeric,
  'reste dû : la facture de campagne échue aujourd''hui est comptée (pas encore en retard)');

-- ---------------------------------------------------------------------
-- Données : cycle de facturation obligatoire, campagne de gros montant
-- ---------------------------------------------------------------------
select throws_ok($$update public.enrollments set billing_day = null where id = '62900000-0000-4000-8000-000000000011'$$,
  '23514', null, 'cycle de facturation vide refusé');
select col_type_is('public', 'billing_runs', 'total_expected', 'numeric(14,2)', 'total d''une campagne : jusqu''à mille milliards');

-- ---------------------------------------------------------------------
-- Un centre en échec ne bloque ni les autres, ni le reste du job
-- ---------------------------------------------------------------------
create function public.p82s_simulated_failure() returns trigger language plpgsql as $$
begin
  raise exception 'Panne simulée';
end;
$$;
create trigger p82s_simulated_failure before insert on public.billing_runs
for each row when (new.center_id = 'c2900000-0000-4000-8000-0000000000f1')
execute function public.p82s_simulated_failure();

select lives_ok($$select private.generate_billing_runs('2026-10-28')$$, 'préparation en échec pour le centre F : pas d''erreur');
select results_eq(
  $$select (select count(*)::int from public.billing_runs where center_id = 'c2900000-0000-4000-8000-0000000000f1'),
           (select payload ->> 'message' from public.center_events
            where center_id = 'c2900000-0000-4000-8000-0000000000f1' and action = 'billing_run.failed')$$,
  $$values (0, 'Panne simulée')$$,
  'centre F : aucune campagne, échec consigné dans son journal (retenté la nuit suivante)');
update public.centers set billing_generation_day = 1 where id = 'c2900000-0000-4000-8000-0000000000f1';
select ok(private.run_daily_automations() ? 'centers', 'job quotidien mené jusqu''au bout malgré l''échec d''un centre');
select is((select count(*)::int from public.center_events
           where center_id = 'c2900000-0000-4000-8000-0000000000f1' and action = 'billing_run.failed'), 2,
  'job quotidien : l''échec du centre F consigné à nouveau');

-- ---------------------------------------------------------------------
-- Mode support : lecture seule, message explicite
-- ---------------------------------------------------------------------
insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a2900000-0000-4000-8000-000000000009', 'c2900000-0000-4000-8000-0000000000e1', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2900000-0000-4000-8000-000000000009","role":"authenticated"}';
select throws_ok($$select public.prepare_billing_run()$$, '42501', 'Mode support : lecture seule.',
  'support : préparation refusée, en lecture seule');
reset role;

select * from finish();
rollback;
