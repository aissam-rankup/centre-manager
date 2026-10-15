-- =====================================================================
-- Console de la plateforme : revenus, état de paiement, journal
--
--  * périodes : mois, trimestre, année en cours (même date de la période
--    précédente), période close, dates choisies ;
--  * revenus calculés sur des paiements de test à dates fixes (2019) ;
--  * répartition par pack, revenu mensuel récurrent ;
--  * montant dû et jours de retard ;
--  * paiement : mode chèque, note, pack, adresse IP au journal ;
--  * journal filtrable, toujours en ajout seul ;
--  * aucune fonction accessible à un compte de centre.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

insert into auth.users (id, email) values
  ('fc000000-0000-4000-8000-000000000001', 'owner-fc@test.local'),
  ('fc000000-0000-4000-8000-000000000002', 'admin-fc@test.local');
insert into public.centers (id, name, slug, plan_key, price, billing_interval, status) values
  ('fc000000-0000-4000-8000-0000000000a1', 'Centre Alpha', 'fc-alpha', 'starter', 300, 'month', 'active'),
  ('fc000000-0000-4000-8000-0000000000b1', 'Centre Beta', 'fc-beta', 'premium', 6000, 'year', 'active'),
  ('fc000000-0000-4000-8000-0000000000c1', 'Centre Gamma', 'fc-gamma', 'starter', 500, 'month', 'active');
insert into public.profiles (id, center_id, full_name, role) values
  ('fc000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin'),
  ('fc000000-0000-4000-8000-000000000002', 'fc000000-0000-4000-8000-0000000000a1', 'Admin Alpha', 'admin');

-- ---------------------------------------------------------------------
-- Périodes (date du jour fixée)
-- ---------------------------------------------------------------------
select results_eq(
  $$ select period_start, period_end, previous_start, previous_end, to_date
     from private.revenue_period('month', null, null, null, '2026-10-12') $$,
  $$ values ('2026-10-01'::date, '2026-10-12'::date, '2026-09-01'::date, '2026-09-12'::date, true) $$,
  'mois en cours : comparé au même jour du mois précédent');
select results_eq(
  $$ select period_start, period_end, previous_start, previous_end
     from private.revenue_period('month', null, null, null, '2026-03-31') $$,
  $$ values ('2026-03-01'::date, '2026-03-31'::date, '2026-02-01'::date, '2026-02-28'::date) $$,
  '31 mars : comparé au 28 février');
select results_eq(
  $$ select period_start, period_end, previous_start, previous_end
     from private.revenue_period('quarter', null, null, null, '2026-11-15') $$,
  $$ values ('2026-10-01'::date, '2026-11-15'::date, '2026-07-01'::date, '2026-08-15'::date) $$,
  'trimestre en cours : même date du trimestre précédent');
select results_eq(
  $$ select period_start, period_end, previous_start, previous_end
     from private.revenue_period('year', null, null, null, '2026-10-12') $$,
  $$ values ('2026-01-01'::date, '2026-10-12'::date, '2025-01-01'::date, '2025-10-12'::date) $$,
  'année en cours : même date de l''année précédente');
select results_eq(
  $$ select period_start, period_end, previous_start, previous_end, to_date
     from private.revenue_period('month', '2026-08-10', null, null, '2026-10-12') $$,
  $$ values ('2026-08-01'::date, '2026-08-31'::date, '2026-07-01'::date, '2026-07-31'::date, false) $$,
  'mois clos : comparé au mois précédent entier');
select results_eq(
  $$ select period_start, period_end, previous_start, previous_end
     from private.revenue_period('custom', null, '2026-09-10', '2026-09-19', '2026-10-12') $$,
  $$ values ('2026-09-10'::date, '2026-09-19'::date, '2026-08-31'::date, '2026-09-09'::date) $$,
  'dates choisies : comparées aux dix jours précédents');
select throws_ok(
  $$ select * from private.revenue_period('custom', null, '2026-09-19', '2026-09-10', '2026-10-12') $$,
  '22023', null, 'dates inversées refusées');
select throws_ok(
  $$ select * from private.revenue_period('week', null, null, null, '2026-10-12') $$,
  '22023', null, 'période inconnue refusée');

-- Périodes dues.
select is(private.periods_due('2026-10-01', 'month', '2026-10-12'), 1, 'un mois entamé : une période due');
select is(private.periods_due('2026-10-01', 'month', '2026-11-01'), 2, 'deux mois entamés : deux périodes dues');
select is(private.periods_due('2026-10-20', 'month', '2026-10-12'), 0, 'échéance à venir : rien de dû');
select is(private.periods_due('2025-10-12', 'year', '2026-10-12'), 2, 'formule annuelle : deux années entamées');

-- ---------------------------------------------------------------------
-- Paiements de test (2019, aucune autre donnée à ces dates)
-- ---------------------------------------------------------------------
insert into public.subscription_payments (center_id, amount, paid_at, method) values
  ('fc000000-0000-4000-8000-0000000000a1', 300, '2019-07-05', 'cash'),
  ('fc000000-0000-4000-8000-0000000000a1', 1000, '2019-08-03', 'bank_transfer'),
  ('fc000000-0000-4000-8000-0000000000a1', 500, '2019-08-20', 'cash'),
  ('fc000000-0000-4000-8000-0000000000b1', 2000, '2019-08-10', 'bank_transfer'),
  ('fc000000-0000-4000-8000-0000000000b1', 100, '2019-12-31', 'card');

select is(
  (select count(*)::integer from public.subscription_payments
   where center_id in ('fc000000-0000-4000-8000-0000000000a1', 'fc000000-0000-4000-8000-0000000000b1') and plan_key is null),
  0, 'pack enregistré sur chaque paiement');

set local role authenticated;
set local request.jwt.claims = '{"sub":"fc000000-0000-4000-8000-000000000001","role":"authenticated"}';

select results_eq(
  $$ select revenue, payments_count, previous_revenue, previous_payments_count, change_amount, change_ratio
     from public.platform_revenue_summary('month', '2019-08-15') $$,
  $$ values (3500::numeric, 3, 300::numeric, 1, 3200::numeric, 10.6667::numeric) $$,
  'août 2019 : 3 500 MAD, hausse de 3 200 MAD sur juillet');
select results_eq(
  $$ select revenue, previous_revenue, change_ratio from public.platform_revenue_summary('quarter', '2019-08-15') $$,
  $$ values (3800::numeric, 0::numeric, null::numeric) $$,
  'trimestre : 3 800 MAD ; pourcentage non défini sans revenu précédent');
select is(
  (select revenue from public.platform_revenue_summary('year', '2019-03-01')),
  3900::numeric, 'année 2019 : 3 900 MAD');
select results_eq(
  $$ select revenue, previous_revenue, previous_start, previous_end
     from public.platform_revenue_summary('custom', null, '2019-08-01', '2019-08-31') $$,
  $$ values (3500::numeric, 300::numeric, '2019-07-01'::date, '2019-07-31'::date) $$,
  'dates choisies : août comparé à juillet');
select results_eq(
  $$ select revenue, previous_revenue, change_amount
     from public.platform_revenue_summary('month', '2019-09-10') $$,
  $$ values (0::numeric, 3500::numeric, -3500::numeric) $$,
  'baisse : variation négative');

select results_eq(
  $$ select plan_key, revenue, payments_count from public.platform_revenue_by_plan('2019-08-01', '2019-08-31') order by plan_key $$,
  $$ values ('premium', 2000::numeric, 1), ('starter', 1500::numeric, 2) $$,
  'revenu par pack');
select ok(
  (select centers_count >= 2 from public.platform_revenue_by_plan('2019-08-01', '2019-08-31') where plan_key = 'starter'),
  'nombre de centres par pack');
select throws_ok(
  $$ select * from public.platform_revenue_by_plan('2019-08-31', '2019-08-01') $$,
  '22023', null, 'répartition : dates inversées refusées');

-- Indicateurs : trois périodes et le revenu mensuel récurrent.
select results_eq(
  $$ select kind from public.platform_revenue_kpis() $$,
  $$ values ('month'), ('quarter'), ('year'), ('mrr') $$,
  'quatre indicateurs');
reset role;
select is(
  (select current_value from public.platform_revenue_kpis() where kind = 'mrr'),
  (select mrr from private.current_mrr()),
  'revenu mensuel récurrent du jour');

insert into public.platform_mrr_snapshots (day, mrr, paying_centers)
values ((private.today() - interval '1 month')::date - 3, 100, 1)
on conflict (day) do update set mrr = 100;
set local role authenticated;
select is(
  (select previous_value from public.platform_revenue_kpis() where kind = 'mrr'),
  100::numeric, 'revenu mensuel récurrent comparé au relevé d''il y a un mois');
reset role;
select ok(
  (select 300 + 500 + round(6000 / 12.0, 2) <= mrr from private.current_mrr()),
  'abonnement annuel ramené au mois');

-- ---------------------------------------------------------------------
-- État de paiement
-- ---------------------------------------------------------------------
update public.centers set current_period_end = private.today() - 40, status = 'past_due'
where id = 'fc000000-0000-4000-8000-0000000000c1';
select results_eq(
  $$ select days_overdue, periods_due, amount_due
     from public.platform_centers_billing() where center_id = 'fc000000-0000-4000-8000-0000000000c1' $$,
  $$ select 40, private.periods_due(private.today() - 40, 'month', private.today()),
            private.periods_due(private.today() - 40, 'month', private.today()) * 500::numeric $$,
  'retard de 40 jours : périodes et montant dus');
select ok(
  (select amount_due >= 1000 from public.platform_centers_billing() where center_id = 'fc000000-0000-4000-8000-0000000000c1'),
  '40 jours de retard : au moins deux mois dus');
select results_eq(
  $$ select last_payment_at, last_payment_amount from public.platform_centers_billing()
     where center_id = 'fc000000-0000-4000-8000-0000000000b1' $$,
  $$ values ('2019-12-31'::date, 100::numeric) $$,
  'dernier paiement');

-- ---------------------------------------------------------------------
-- Paiement : chèque, note, adresse IP
-- ---------------------------------------------------------------------
set local request.headers = '{"x-dirassty-client-ip": "203.0.113.7"}';
select lives_ok(
  $$ select public.platform_record_payment('fc000000-0000-4000-8000-0000000000c1', 1000, private.today(), 'cheque', 'CHQ-77', '  Deux mois réglés  ') $$,
  'paiement par chèque avec note');
select results_eq(
  $$ select method::text, reference, note, plan_key from public.platform_payments('fc000000-0000-4000-8000-0000000000c1')
     where reference = 'CHQ-77' $$,
  $$ values ('cheque', 'CHQ-77', 'Deux mois réglés', 'starter') $$,
  'mode, référence, note (espaces retirés) et pack');
select is(
  (select ip_address from public.platform_audit_log('fc000000-0000-4000-8000-0000000000c1', 'subscription.payment_recorded') limit 1),
  '203.0.113.7', 'adresse IP au journal');
select is(
  (select status::text from public.platform_centers_billing() where center_id = 'fc000000-0000-4000-8000-0000000000c1'),
  'active', 'paiement : centre remis en service');
set local request.headers = '{"x-dirassty-client-ip": "pas une adresse"}';
select lives_ok(
  $$ select public.platform_record_payment('fc000000-0000-4000-8000-0000000000c1', 10, private.today(), 'other') $$,
  'adresse invalide : paiement enregistré quand même');
select is(
  (select ip_address from public.platform_audit_log('fc000000-0000-4000-8000-0000000000c1', 'subscription.payment_recorded') limit 1),
  null::text, 'adresse invalide : non journalisée');
select throws_ok(
  $$ select public.platform_record_payment('fc000000-0000-4000-8000-0000000000c1', 10, private.today(), 'cash', null, repeat('x', 501)) $$,
  '22023', null, 'note trop longue refusée');

-- Journal : filtres.
select ok(
  (select bool_and(action like 'subscription.%') and count(*) >= 2
   from public.platform_audit_log('fc000000-0000-4000-8000-0000000000c1', 'subscription.')),
  'filtre par famille d''actions');
select ok(
  (select bool_and(actor_is_platform) from public.platform_audit_log('fc000000-0000-4000-8000-0000000000c1', null, 'platform')),
  'filtre : actions du super-admin');

-- ---------------------------------------------------------------------
-- Autorisations : compte d'un centre
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"fc000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$ select * from public.platform_revenue_kpis() $$, '42501', null, 'admin de centre : indicateurs refusés');
select throws_ok($$ select * from public.platform_centers_billing() $$, '42501', null, 'admin de centre : état de paiement refusé');
select throws_ok(
  $$ select public.platform_record_payment('fc000000-0000-4000-8000-0000000000a1', 10, private.today(), 'cash') $$,
  '42501', null, 'admin de centre : paiement refusé');
select throws_ok($$ select * from public.platform_audit_log() $$, '42501', null, 'admin de centre : journal refusé');

select * from finish();
rollback;
