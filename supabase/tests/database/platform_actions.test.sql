-- =====================================================================
-- Tests des actions de la console (phase 3) — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email) values
  ('aa000000-0000-4000-8000-000000000001', 'owner-p17@test.local'),
  ('aa000000-0000-4000-8000-000000000002', 'new-admin-p17@test.local'),
  ('aa000000-0000-4000-8000-000000000003', 'other-admin-p17@test.local');
insert into public.profiles (id, center_id, full_name, role) values
  ('aa000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Création d'un centre et de son admin.
select lives_ok($$
  select public.platform_create_center(
    'Institut Horizon', 'horizon', 'institut_langue', '{}', 'white_label', 1200, 'year', 'active',
    private.today() - 3, (private.today() - 3 + interval '1 year')::date, 7::smallint,
    'Rim Tazi', '0612345678', 'rim@horizon.test', 'Client référé',
    'aa000000-0000-4000-8000-000000000002', 'Rim Tazi', '0612345678')
$$, 'super-admin : crée un centre et son admin');
select is(
  (select status::text || ' ' || center_type || ' ' || billing_interval || ' ' || grace_days from public.platform_center(
     (select center_id from public.platform_centers() where slug = 'horizon'))),
  'active institut_langue year 7', 'centre créé : statut, type, durée, grâce');
select is(
  (select plan::text from public.platform_centers() where slug = 'horizon'),
  'white_label', 'formule enregistrée');
select is(
  (select role::text from public.platform_center_users((select center_id from public.platform_centers() where slug = 'horizon'))),
  'admin', 'admin du centre créé');
select throws_ok($$
  select public.platform_create_center('Doublon', 'horizon', 'soutien_scolaire', '{}', 'standard', 100, 'month', 'trial',
    null, null, 5::smallint, null, null, null, null, 'aa000000-0000-4000-8000-000000000003', 'X', null)
$$, '23505', null, 'adresse déjà utilisée refusée');
select throws_ok($$
  select public.platform_create_center('Autre', 'autre', 'soutien_scolaire', '{}', 'standard', 100, 'month', 'trial',
    null, null, 5::smallint, null, null, null, null, 'aa000000-0000-4000-8000-000000000002', 'X', null)
$$, '22023', null, 'compte déjà rattaché refusé');

-- Statut avec motif.
select throws_ok($$
  select public.platform_set_status((select center_id from public.platform_centers() where slug = 'horizon'), 'suspended', ' ')
$$, '22023', null, 'suspension sans motif refusée');
select lives_ok($$
  select public.platform_set_status((select center_id from public.platform_centers() where slug = 'horizon'), 'suspended', 'Chèque impayé')
$$, 'suspension avec motif');
select is(
  (select payload ->> 'reason' from public.platform_center_events((select center_id from public.platform_centers() where slug = 'horizon'))
   where action = 'center.status_changed' order by occurred_at desc, event_id desc limit 1),
  'Chèque impayé', 'motif journalisé avec le changement de statut');

-- Paiement : réactive le centre suspendu, prolonge d'un an.
select lives_ok($$
  select public.platform_record_payment((select center_id from public.platform_centers() where slug = 'horizon'), 1200, private.today(), 'bank_transfer', 'VIR-1')
$$, 'paiement enregistré');
select is(
  (select status::text || ' ' || (current_period_end = (private.today() - 3 + interval '2 years')::date)
   from public.platform_center((select center_id from public.platform_centers() where slug = 'horizon'))),
  'active true', 'paiement : centre actif, échéance prolongée d''un an');
select throws_ok($$
  select public.platform_record_payment((select center_id from public.platform_centers() where slug = 'horizon'), 10, private.today() + 1, 'cash', null)
$$, '22023', null, 'paiement daté dans le futur refusé');

-- Échéance : un centre en retard repasse actif si l'échéance redevient future.
select lives_ok($$
  select public.platform_set_due_date((select center_id from public.platform_centers() where slug = 'horizon'), private.today() - 1, 'Correction')
$$, 'échéance fixée');
reset role;
update public.centers set status = 'past_due' where slug = 'horizon';
set local role authenticated;
select lives_ok($$
  select public.platform_set_due_date((select center_id from public.platform_centers() where slug = 'horizon'), private.today() + 15, 'Délai accordé')
$$, 'échéance prolongée');
select is(
  (select status::text from public.platform_centers() where slug = 'horizon'),
  'active', 'retard levé par la prolongation');

-- Résiliation définitive.
select lives_ok($$
  select public.platform_set_status((select center_id from public.platform_centers() where slug = 'horizon'), 'cancelled', 'Fin de contrat')
$$, 'résiliation');
select throws_ok($$
  select public.platform_set_status((select center_id from public.platform_centers() where slug = 'horizon'), 'active', 'Retour')
$$, '22023', null, 'résiliation définitive');

-- Admin de centre : aucune action.
reset role;
insert into public.centers (id, name) values ('ca000000-0000-4000-8000-000000000009', 'Centre X');
insert into public.profiles (id, center_id, full_name, role) values
  ('aa000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000009', 'Admin X', 'admin');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$
  select public.platform_record_payment('ca000000-0000-4000-8000-000000000009', 500, private.today(), 'cash', null)
$$, '42501', null, 'admin : ne s''enregistre pas de paiement');

reset role;

select * from finish();
rollback;
