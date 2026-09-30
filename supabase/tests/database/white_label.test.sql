-- =====================================================================
-- Tests de la marque blanche (phase 6) — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email) values
  ('ac000000-0000-4000-8000-000000000001', 'owner-p19@test.local'),
  ('ac000000-0000-4000-8000-000000000002', 'admin-wl-p19@test.local'),
  ('ac000000-0000-4000-8000-000000000003', 'admin-std-p19@test.local'),
  ('ac000000-0000-4000-8000-000000000004', 'prof-wl-p19@test.local');
insert into public.centers (id, name, slug) values
  ('cc000000-0000-4000-8000-000000000001', 'Centre marque blanche', 'marque-p19'),
  ('cc000000-0000-4000-8000-000000000002', 'Centre standard', 'standard-p19');
update public.subscriptions set plan = 'white_label' where center_id = 'cc000000-0000-4000-8000-000000000001';
insert into public.profiles (id, center_id, full_name, role) values
  ('ac000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin'),
  ('ac000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000001', 'Admin WL', 'admin'),
  ('ac000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000002', 'Admin STD', 'admin'),
  ('ac000000-0000-4000-8000-000000000004', 'cc000000-0000-4000-8000-000000000001', 'Prof WL', 'teacher');

set local role authenticated;

-- Admin en marque blanche : réglages modifiables, sauf le domaine.
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$
  select public.update_center_branding('cc000000-0000-4000-8000-000000000001', 'Horizon', null, null,
    '#0F766E', '#134e4a', '#f59e0b', null, 'Horizon', 'contact@horizon.test', null, 'pirate.test')
$$, 'admin marque blanche : enregistre sa marque');
select is(
  (select brand_name || ' ' || primary_color || ' ' || coalesce(custom_domain, '-') from public.center_branding_settings('cc000000-0000-4000-8000-000000000001')),
  'Horizon #0f766e -', 'couleur normalisée, domaine ignoré pour l''admin');
select is((select branding ->> 'brand_name' from public.my_center_access()), 'Horizon', 'marque appliquée au compte connecté');
select throws_ok($$
  select public.update_center_branding('cc000000-0000-4000-8000-000000000002', 'X', null, null, null, null, null, null, null, null, null)
$$, '42501', null, 'admin : pas de marque d''un autre centre');
select throws_ok($$
  select public.update_center_branding('cc000000-0000-4000-8000-000000000001', 'X', null, null, 'rouge', null, null, null, null, null, null)
$$, '23514', null, 'couleur invalide refusée');

-- Professeur : lecture de la marque, aucune écriture.
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select branding ->> 'primary_color' from public.my_center_access()), '#0f766e', 'professeur : couleurs du centre');
select throws_ok($$
  select public.update_center_branding('cc000000-0000-4000-8000-000000000001', 'X', null, null, null, null, null, null, null, null, null)
$$, '42501', null, 'professeur : réglages non modifiables');

-- Formule standard : aucun réglage modifiable par le centre.
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$
  select public.update_center_branding('cc000000-0000-4000-8000-000000000002', 'X', null, null, null, null, null, null, null, null, null)
$$, '42501', null, 'standard : réglages de marque refusés');
select is((select branding from public.my_center_access()), null, 'standard : aucune marque appliquée');

-- Super-admin : domaine, vérification.
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$
  select public.update_center_branding('cc000000-0000-4000-8000-000000000001', 'Horizon', null, null,
    '#0f766e', '#134e4a', '#f59e0b', null, 'Horizon', 'contact@horizon.test', null, 'App.Horizon.test')
$$, 'super-admin : domaine personnalisé');
select is((select custom_domain || ' ' || domain_verified from public.center_branding_settings('cc000000-0000-4000-8000-000000000001')),
  'app.horizon.test false', 'domaine normalisé, à vérifier');

-- Résolution par adresse (sans session).
reset role;
set local role anon;
select is((select name from public.center_for_host('standard-p19', null)), 'Centre standard', 'sous-domaine : centre trouvé');
select is((select count(*)::int from public.center_for_host(null, 'app.horizon.test')), 0, 'domaine non vérifié : ignoré');
reset role;
update public.center_branding set domain_verified = true where center_id = 'cc000000-0000-4000-8000-000000000001';
set local role anon;
select is((select branding ->> 'brand_name' from public.center_for_host(null, 'app.horizon.test')), 'Horizon', 'domaine vérifié : marque du centre');
select is((select branding from public.center_for_host('standard-p19', null)), null, 'standard : aucune marque exposée');

reset role;

select * from finish();
rollback;
