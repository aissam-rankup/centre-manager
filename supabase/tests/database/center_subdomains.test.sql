-- =====================================================================
-- Page 10 : un sous-domaine par centre
--
--  * noms réservés et format refusés (contrainte, garde, slug par défaut) ;
--  * changement d'adresse réservé au super-admin, historique enregistré ;
--  * ancienne adresse : center_for_host la signale (redirection) et aucun
--    autre centre ne peut la prendre ; le centre peut la reprendre ;
--  * disponibilité d'une adresse (console) ;
--  * my_center_slug : adresse du centre du compte (équipe et élève) ;
--  * l'adresse n'ouvre aucun droit : un admin ne change ni ne lit rien.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'admin-a-p10@test.local'),
  ('a1000000-0000-4000-8000-000000000009', 'proprio-p10@test.local'),
  ('a1000000-0000-4000-8000-0000000000e1', 'eleve-p10aaaa1@eleves.centromanager.invalid');
insert into public.centers (id, name, slug) values
  ('c1000000-0000-4000-8000-0000000000a1', 'Centre A', 'p10-a'),
  ('c1000000-0000-4000-8000-0000000000b1', 'Centre B', 'p10-b');
insert into public.profiles (id, center_id, full_name, role) values
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a1000000-0000-4000-8000-000000000009', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name)
values ('d1000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-0000000000a1', 'Niveau A');
insert into public.students (id, center_id, full_name, level_id, guardian_phone)
values ('51000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-0000000000a1', 'Élève A', 'd1000000-0000-4000-8000-0000000000a1', '0600000001');
insert into public.student_accounts (user_id, student_id, center_id, login_code)
values ('a1000000-0000-4000-8000-0000000000e1', '51000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-0000000000a1', 'P10AAAA1');

-- ---------------------------------------------------------------------
-- Format et noms réservés
-- ---------------------------------------------------------------------
select ok(private.is_reserved_slug('staging') and private.is_reserved_slug('www') and not private.is_reserved_slug('excellence'),
  'liste des noms réservés');
select throws_ok(
  $$ insert into public.centers (name, slug) values ('Réservé', 'test') $$,
  '22023', 'Cette adresse est réservée.', 'adresse réservée refusée à la création');
select throws_ok(
  $$ insert into public.centers (name, slug) values ('Mal formé', 'mal--forme') $$,
  '23514', null, 'double tiret refusé');
select throws_ok(
  $$ insert into public.centers (name, slug) values ('Majuscules', 'Excellence') $$,
  '23514', null, 'majuscules refusées');
select throws_ok(
  $$ insert into public.centers (name, slug) values ('Tiret', '-p10') $$,
  '23514', null, 'tiret initial refusé');

insert into public.centers (id, name) values ('c1000000-0000-4000-8000-0000000000c1', 'Test');
select is((select slug from public.centers where id = 'c1000000-0000-4000-8000-0000000000c1'), 'test-2',
  'slug par défaut : un nom réservé reçoit un suffixe');
insert into public.centers (id, name) values ('c1000000-0000-4000-8000-0000000000c2', 'École Élan');
select is((select slug from public.centers where id = 'c1000000-0000-4000-8000-0000000000c2'), 'ecole-elan',
  'slug par défaut : accents retirés');

-- ---------------------------------------------------------------------
-- Un administrateur ne change pas l'adresse et ne lit pas l'historique
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ update public.centers set slug = 'p10-pirate' where id = 'c1000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'admin : modification directe de l''adresse refusée');
select throws_ok(
  $$ select public.platform_change_center_slug('c1000000-0000-4000-8000-0000000000a1', 'p10-pirate') $$,
  null, null, 'admin : changement d''adresse refusé');
select throws_ok(
  $$ select public.platform_slug_availability('p10-libre') $$,
  null, null, 'admin : disponibilité réservée à la console');
select is(public.my_center_slug(), 'p10-a', 'my_center_slug : adresse du centre de l''admin');
select throws_ok(
  $$ select * from public.center_slug_history $$,
  '42501', null, 'admin : historique des adresses illisible');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is(public.my_center_slug(), 'p10-a', 'my_center_slug : adresse du centre de l''élève');

-- ---------------------------------------------------------------------
-- Console : disponibilité et changement d'adresse
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000009","role":"authenticated"}';

select is(public.platform_slug_availability('p10-libre'), 'available', 'adresse libre');
select is(public.platform_slug_availability('p10-b'), 'taken', 'adresse prise');
select is(public.platform_slug_availability('support'), 'reserved', 'adresse réservée');
select is(public.platform_slug_availability('P10 A'), 'invalid', 'adresse invalide');
select is(public.platform_slug_availability('p10-a', 'c1000000-0000-4000-8000-0000000000a1'), 'current', 'adresse actuelle');

select lives_ok(
  $$ select public.platform_change_center_slug('c1000000-0000-4000-8000-0000000000a1', 'p10-a-nouveau') $$,
  'super-admin : changement d''adresse');
select is(public.my_center_slug(), null, 'my_center_slug : aucun centre pour la console');
select results_eq(
  $$ select old_slug from public.platform_center_slug_history('c1000000-0000-4000-8000-0000000000a1') $$,
  $$ values ('p10-a'::text) $$,
  'ancienne adresse enregistrée (console)');
select throws_ok(
  $$ select * from public.center_slug_history $$,
  '42501', null, 'super-admin : historique lu par la console seulement');

select throws_ok(
  $$ select public.platform_change_center_slug('c1000000-0000-4000-8000-0000000000b1', 'p10-a') $$,
  '23505', 'Cette adresse est déjà utilisée par un autre centre.',
  'ancienne adresse d''un centre : refusée à un autre');
select is(public.platform_slug_availability('p10-a', 'c1000000-0000-4000-8000-0000000000b1'), 'taken',
  'ancienne adresse : indisponible pour un autre centre');

-- ---------------------------------------------------------------------
-- Résolution sans session (proxy) : ancienne adresse signalée
-- ---------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select results_eq(
  $$ select slug, moved from public.center_for_host(p_slug => 'p10-a') $$,
  $$ values ('p10-a-nouveau'::text, true) $$,
  'ancienne adresse : nouvelle adresse à rediriger');
select results_eq(
  $$ select center_id, moved from public.center_for_host(p_slug => 'P10-A-NOUVEAU') $$,
  $$ values ('c1000000-0000-4000-8000-0000000000a1'::uuid, false) $$,
  'adresse actuelle (minuscules)');
select is_empty($$ select * from public.center_for_host(p_slug => 'p10-inconnu') $$, 'adresse inconnue : aucun centre');

-- ---------------------------------------------------------------------
-- Le centre reprend son ancienne adresse
-- ---------------------------------------------------------------------
reset role;
select public.platform_change_center_slug('c1000000-0000-4000-8000-0000000000a1', 'p10-a')
from (select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000009","role":"authenticated"}', true)) s;
select results_eq(
  $$ select old_slug from public.center_slug_history where center_id = 'c1000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('p10-a-nouveau'::text) $$,
  'adresse reprise : elle quitte l''historique, la précédente y entre');

select * from finish();
rollback;
