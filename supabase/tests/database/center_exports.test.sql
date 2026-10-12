-- =====================================================================
-- Export des données d'un centre
--
--  * demande : super-admin seulement, motif obligatoire, période valide,
--    une génération à la fois, journalisée ;
--  * données : seulement pour une demande en attente, clé service_role
--    seulement ; aucun mot de passe, jeton ni code de connexion ;
--  * fichier : lien seulement pour un export prêt et non expiré ;
--    nettoyage des exports expirés.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email) values
  ('ec000000-0000-4000-8000-000000000001', 'owner-ec@test.local'),
  ('ec000000-0000-4000-8000-000000000002', 'admin-ec@test.local');
insert into public.centers (id, name, slug, plan_key, status) values
  ('ec000000-0000-4000-8000-0000000000a1', 'Centre Export', 'ec-export', 'starter', 'active');
insert into public.profiles (id, center_id, full_name, role) values
  ('ec000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin'),
  ('ec000000-0000-4000-8000-000000000002', 'ec000000-0000-4000-8000-0000000000a1', 'Admin Export', 'admin');
insert into public.levels (id, center_id, name) values
  ('ec000000-0000-4000-8000-0000000000d1', 'ec000000-0000-4000-8000-0000000000a1', 'Niveau É');
insert into public.students (id, center_id, full_name, level_id, guardian_name, guardian_phone) values
  ('ec000000-0000-4000-8000-0000000000e1', 'ec000000-0000-4000-8000-0000000000a1', 'Élève Éxport', 'ec000000-0000-4000-8000-0000000000d1', 'Tuteur', '0612345678');
insert into auth.users (id, email) values ('ec000000-0000-4000-8000-000000000004', 'eleve-ec@test.local');
insert into public.student_accounts (user_id, student_id, center_id, login_code) values
  ('ec000000-0000-4000-8000-000000000004', 'ec000000-0000-4000-8000-0000000000e1', 'ec000000-0000-4000-8000-0000000000a1', 'ECXPORT1');

-- ---------------------------------------------------------------------
-- Compte d'un centre : rien
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"ec000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.platform_request_center_export('ec000000-0000-4000-8000-0000000000a1', 'backup') $$,
  '42501', null, 'admin de centre : demande refusée');
select throws_ok(
  $$ select * from public.platform_center_exports('ec000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'admin de centre : liste refusée');
select throws_ok(
  $$ select public.export_center_data(gen_random_uuid()) $$,
  '42501', null, 'compte connecté : lecture des données refusée (clé service_role seulement)');
select throws_ok(
  $$ select public.complete_center_export(gen_random_uuid(), 'x', 1) $$,
  '42501', null, 'compte connecté : enregistrement du fichier refusé');
select throws_ok(
  $$ select count(*) from public.center_exports $$,
  '42501', null, 'table des exports illisible');

-- ---------------------------------------------------------------------
-- Demande par le super-admin
-- ---------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ec000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.platform_request_center_export('ec000000-0000-4000-8000-0000000000a1', 'curiosite') $$,
  '22023', null, 'motif inconnu refusé');
select throws_ok(
  $$ select public.platform_request_center_export('ec000000-0000-4000-8000-0000000000a1', 'other', ' ') $$,
  '22023', null, 'motif « autre » : précision obligatoire');
select throws_ok(
  $$ select public.platform_request_center_export('ec000000-0000-4000-8000-0000000000a1', 'backup', null, '2026-09-30', '2026-09-01') $$,
  '22023', null, 'période inversée refusée');
select throws_ok(
  $$ select public.platform_request_center_export('ec000000-0000-4000-8000-0000000000a1', 'backup', null, '2026-09-01', null) $$,
  '22023', null, 'période incomplète refusée');

create temp table t_export as
select public.platform_request_center_export('ec000000-0000-4000-8000-0000000000a1', 'contract_end', 'Fin au 30/09', '2026-01-01', '2026-09-30') as id;
grant select on t_export to service_role;

select results_eq(
  $$ select status, requested_role, reason_kind, period_from, period_to from public.center_exports where id = (select id from t_export) $$,
  $$ values ('pending', 'super_admin', 'contract_end', '2026-01-01'::date, '2026-09-30'::date) $$,
  'demande enregistrée en attente');
select results_eq(
  $$ select payload ->> 'kind', payload ->> 'reason', payload ->> 'from', payload ->> 'to'
     from public.platform_center_events('ec000000-0000-4000-8000-0000000000a1') where action = 'center.data_exported' $$,
  $$ values ('contract_end', 'Fin au 30/09', '2026-01-01', '2026-09-30') $$,
  'export journalisé : motif et période');
select throws_ok(
  $$ select public.platform_request_center_export('ec000000-0000-4000-8000-0000000000a1', 'backup') $$,
  '22023', null, 'une génération à la fois par centre');

-- ---------------------------------------------------------------------
-- Données (clé service_role)
-- ---------------------------------------------------------------------
set local role service_role;
select is(
  (select json_array_length(public.export_center_data((select id from t_export)) -> 'eleves' -> 'rows')),
  1, 'données : élèves du centre');
select is(
  (select public.export_center_data((select id from t_export)) -> 'eleves' -> 'rows' -> 0 ->> 'Nom'),
  'Élève Éxport', 'accents conservés');
select ok(
  (select public.export_center_data((select id from t_export))::text !~* '(password|mot de passe|encrypted|token|jeton|ECXPORT1|login_code)'),
  'aucun mot de passe, jeton ni code de connexion');
select is(
  (select count(*)::integer from json_object_keys(public.export_center_data((select id from t_export)))),
  16, 'seize onglets');

select lives_ok(
  $$ select public.complete_center_export((select id from t_export), 'ec/x/export.zip', 2048) $$,
  'fichier enregistré');
select throws_ok(
  $$ select public.export_center_data((select id from t_export)) $$,
  'P0002', null, 'export déjà traité : plus aucune lecture');

reset role;
set local request.jwt.claims = '{"sub":"ec000000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select storage_path, center_slug from public.platform_center_export_file((select id from t_export)) $$,
  $$ values ('ec/x/export.zip', 'ec-export') $$,
  'export prêt : fichier accessible au super-admin');

-- Expiration : plus de lien, fichier à supprimer, puis « expiré ».
update public.center_exports set expires_at = now() - interval '1 minute' where id = (select id from t_export);
select is(
  (select count(*)::integer from public.platform_center_export_file((select id from t_export))),
  0, 'lien expiré : plus de fichier');
set local role service_role;
select results_eq(
  $$ select storage_path from public.expired_center_exports() where export_id = (select id from t_export) $$,
  $$ values ('ec/x/export.zip') $$,
  'nettoyage : fichier expiré à supprimer');
select public.mark_center_exports_expired(array[(select id from t_export)]);
reset role;
select results_eq(
  $$ select status, storage_path from public.center_exports where id = (select id from t_export) $$,
  $$ values ('expired', null::text) $$,
  'export expiré, chemin effacé');

select * from finish();
rollback;
