-- =====================================================================
-- Tests du schéma plateforme (phase 1) — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email) values
  ('a8000000-0000-4000-8000-000000000001', 'admin-p15@test.local'),
  ('a8000000-0000-4000-8000-000000000002', 'prof-p15@test.local'),
  ('a8000000-0000-4000-8000-000000000003', 'admin-b-p15@test.local');
insert into public.centers (id, name) values
  ('c8000000-0000-4000-8000-000000000001', 'Centre Élan d''Été'),
  ('c8000000-0000-4000-8000-000000000002', 'Centre Élan d''Été');
insert into public.profiles (id, center_id, full_name, role) values
  ('a8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Admin A', 'admin'),
  ('a8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'Prof A', 'teacher'),
  ('a8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000002', 'Admin B', 'admin');

-- Valeurs par défaut.
select is((select slug from public.centers where id = 'c8000000-0000-4000-8000-000000000001'),
  'centre-elan-d-ete', 'slug dérivé du nom, sans accents');
select is((select slug from public.centers where id = 'c8000000-0000-4000-8000-000000000002'),
  'centre-elan-d-ete-2', 'slug rendu unique');
select is((select status::text from public.centers where id = 'c8000000-0000-4000-8000-000000000001'),
  'trial', 'nouveau centre : en essai');
select is((select plan_key from public.centers where id = 'c8000000-0000-4000-8000-000000000001'),
  'starter', 'nouveau centre : pack Débutant par défaut');
select is((select count(*)::int from public.platform_events
           where center_id = 'c8000000-0000-4000-8000-000000000001' and action = 'center.created'),
  1, 'création du centre journalisée');
select throws_ok(
  $$insert into public.centers (name, slug) values ('X', 'platform')$$,
  '22023', 'Cette adresse est réservée.', 'slug réservé refusé');
select is(jsonb_array_length(to_jsonb(array(select code from public.center_types))), 6, 'six types d''établissement');
select throws_ok(
  $$update public.centers set custom_terms = '{"learner": {"singular": "Élève"}}' where id = 'c8000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'vocabulaire incomplet refusé (pluriel et genre obligatoires)');

-- Paiement : période d'un mois, centre actif, échéance repoussée.
update public.centers set current_period_end = '2026-10-10', price = 400
where id = 'c8000000-0000-4000-8000-000000000001';
insert into public.subscription_payments (center_id, amount, paid_at, method)
values ('c8000000-0000-4000-8000-000000000001', 400, '2026-10-08', 'cash');
select is((select period_covered_start || ' ' || period_covered_end from public.subscription_payments
           where center_id = 'c8000000-0000-4000-8000-000000000001'),
  '2026-10-10 2026-11-10', 'paiement : un mois à partir de l''échéance en cours');
select is((select status::text || ' ' || current_period_end from public.centers where id = 'c8000000-0000-4000-8000-000000000001'),
  'active 2026-11-10', 'paiement : centre actif, échéance repoussée d''un mois');
select is((select status::text || ' ' || current_period_end || ' ' || amount from public.subscriptions
           where center_id = 'c8000000-0000-4000-8000-000000000001'),
  'active 2026-11-10 400.00', 'abonnement synchronisé avec le centre');
select is((select array_agg(action order by id)::text from public.platform_events
           where center_id = 'c8000000-0000-4000-8000-000000000001' and action <> 'center.created'),
  '{center.period_changed,center.pricing_changed,center.status_changed,center.period_changed,subscription.payment_recorded}',
  'échéance, tarif, statut et paiement journalisés');
select throws_ok(
  $$delete from public.subscription_payments where center_id = 'c8000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'paiements : jamais supprimés');
select throws_ok(
  $$update public.platform_events set action = 'x.y'$$,
  '42501', null, 'journal : jamais modifié');

-- Facturation annuelle : un paiement couvre un an.
update public.centers set billing_interval = 'year', price = 4000, current_period_end = '2026-10-10'
where id = 'c8000000-0000-4000-8000-000000000002';
insert into public.subscription_payments (center_id, amount, paid_at, method)
values ('c8000000-0000-4000-8000-000000000002', 4000, '2026-10-01', 'bank_transfer');
select is((select period_covered_end::text from public.subscription_payments
           where center_id = 'c8000000-0000-4000-8000-000000000002'),
  '2027-10-10', 'formule annuelle : un an couvert');
select is((select billing_interval::text || ' ' || amount from public.subscriptions
           where center_id = 'c8000000-0000-4000-8000-000000000002'),
  'year 4000.00', 'abonnement : durée et montant synchronisés');

update public.centers set status = 'cancelled' where id = 'c8000000-0000-4000-8000-000000000002';
select throws_ok(
  $$insert into public.subscription_payments (center_id, amount, method) values ('c8000000-0000-4000-8000-000000000002', 100, 'cash')$$,
  '22023', null, 'centre résilié : paiement refusé');

-- Comptes d'un centre : colonnes plateforme invisibles et non modifiables.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.centers set name = 'Centre Élan' where id = 'c8000000-0000-4000-8000-000000000001'$$,
  'admin : renomme son centre');
select throws_ok(
  $$update public.centers set current_period_end = '2030-01-01' where id = 'c8000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin : ne repousse pas son échéance');
select throws_ok(
  $$update public.centers set status = 'active' where id = 'c8000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin : ne change pas son statut');
select throws_ok(
  $$select notes, price from public.centers$$,
  '42501', null, 'admin : notes internes et tarif illisibles');
select throws_ok($$select 1 from public.subscriptions$$, '42501', null, 'admin : abonnements illisibles');
select throws_ok($$select 1 from public.platform_events$$, '42501', null, 'admin : journal illisible');
select is((select string_agg(slug || ':' || status, ',') from public.centers),
  'centre-elan-d-ete:active', 'admin : ne voit que son centre (slug et statut)');

reset role;

select * from finish();
rollback;
