-- =====================================================================
-- Console de la plateforme : suspension manuelle et réactivation
--
--  * motif obligatoire, nom du centre à retaper, jamais sur un centre
--    déjà suspendu ou résilié ;
--  * sessions de tous les comptes du centre supprimées (équipe et élève),
--    jamais celles d'un autre centre ;
--  * centre suspendu : plus aucune donnée lisible (RLS), adresse signalée
--    comme suspendue ; aucune donnée supprimée ;
--  * un paiement ne lève pas une suspension manuelle ; il lève un impayé ;
--  * réactivation immédiate ; journal ;
--  * fiche : compteurs et totaux des paiements ;
--  * aucune de ces fonctions pour un compte de centre.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (id, email) values
  ('ac000000-0000-4000-8000-000000000001', 'owner-ac@test.local'),
  ('ac000000-0000-4000-8000-000000000002', 'admin-ac@test.local'),
  ('ac000000-0000-4000-8000-000000000003', 'prof-ac@test.local'),
  ('ac000000-0000-4000-8000-000000000004', 'eleve-ac@test.local'),
  ('ac000000-0000-4000-8000-000000000005', 'admin-other-ac@test.local');
insert into public.centers (id, name, slug, plan_key, price, billing_interval, status, current_period_end) values
  ('ac000000-0000-4000-8000-0000000000a1', 'Centre Sigma', 'ac-sigma', 'starter', 400, 'month', 'active', private.today() + 20),
  ('ac000000-0000-4000-8000-0000000000b1', 'Centre Autre', 'ac-autre', 'starter', 400, 'month', 'active', private.today() + 20);
insert into public.profiles (id, center_id, full_name, role) values
  ('ac000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin'),
  ('ac000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-0000000000a1', 'Admin Sigma', 'admin'),
  ('ac000000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-0000000000a1', 'Prof Sigma', 'teacher'),
  ('ac000000-0000-4000-8000-000000000005', 'ac000000-0000-4000-8000-0000000000b1', 'Admin Autre', 'admin');
insert into public.levels (id, center_id, name) values
  ('ac000000-0000-4000-8000-0000000000d1', 'ac000000-0000-4000-8000-0000000000a1', 'Niveau Sigma');
insert into public.students (id, center_id, full_name, level_id) values
  ('ac000000-0000-4000-8000-0000000000e1', 'ac000000-0000-4000-8000-0000000000a1', 'Élève Sigma', 'ac000000-0000-4000-8000-0000000000d1');
insert into public.student_accounts (user_id, student_id, center_id, login_code) values
  ('ac000000-0000-4000-8000-000000000004', 'ac000000-0000-4000-8000-0000000000e1', 'ac000000-0000-4000-8000-0000000000a1', 'ACSIGMA1');
-- Sessions ouvertes : admin, professeur, élève de Sigma ; admin de l'autre centre.
insert into auth.sessions (id, user_id) values
  ('ac000000-0000-4000-8000-0000000000f2', 'ac000000-0000-4000-8000-000000000002'),
  ('ac000000-0000-4000-8000-0000000000f3', 'ac000000-0000-4000-8000-000000000003'),
  ('ac000000-0000-4000-8000-0000000000f4', 'ac000000-0000-4000-8000-000000000004'),
  ('ac000000-0000-4000-8000-0000000000f5', 'ac000000-0000-4000-8000-000000000005');

-- ---------------------------------------------------------------------
-- Autorisations : compte d'un centre
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.platform_suspend_center('ac000000-0000-4000-8000-0000000000b1', 'unpaid', null, 'Centre Autre') $$,
  '42501', null, 'admin de centre : suspension refusée');
select throws_ok(
  $$ select public.platform_reactivate_center('ac000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'admin de centre : réactivation refusée');
select throws_ok(
  $$ select * from public.platform_center_overview('ac000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'admin de centre : fiche refusée');
select throws_ok(
  $$ select * from public.platform_center_payment_totals('ac000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'admin de centre : totaux refusés');
select is(
  (select count(*)::integer from public.students where center_id = 'ac000000-0000-4000-8000-0000000000a1'),
  1, 'avant suspension : l''admin lit ses élèves');

-- ---------------------------------------------------------------------
-- Suspension par le super-admin
-- ---------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.platform_suspend_center('ac000000-0000-4000-8000-0000000000a1', null, null, 'Centre Sigma') $$,
  '22023', null, 'motif obligatoire');
select throws_ok(
  $$ select public.platform_suspend_center('ac000000-0000-4000-8000-0000000000a1', 'vacances', null, 'Centre Sigma') $$,
  '22023', null, 'motif inconnu refusé');
select throws_ok(
  $$ select public.platform_suspend_center('ac000000-0000-4000-8000-0000000000a1', 'other', '  ', 'Centre Sigma') $$,
  '22023', null, 'motif « autre » : précision obligatoire');
select throws_ok(
  $$ select public.platform_suspend_center('ac000000-0000-4000-8000-0000000000a1', 'contract_end', null, 'Centre Sigm') $$,
  '22023', null, 'nom du centre mal retapé : refusé');
select is(
  (select status::text from public.centers where id = 'ac000000-0000-4000-8000-0000000000a1'),
  'active', 'refus : centre toujours actif');

select is(
  public.platform_suspend_center('ac000000-0000-4000-8000-0000000000a1', 'contract_end', 'Fin du contrat annuel', '  centre sigma '),
  3, 'suspension : 3 comptes déconnectés (admin, professeur, élève)');
select results_eq(
  $$ select status::text, suspension_kind, suspension_note, suspended_at is not null
     from public.centers where id = 'ac000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('suspended', 'contract_end', 'Fin du contrat annuel', true) $$,
  'statut, motif, précision et date enregistrés');
select is(
  (select count(*)::integer from auth.sessions where user_id in (
     'ac000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-000000000004')),
  0, 'sessions des comptes du centre supprimées');
select is(
  (select count(*)::integer from auth.sessions where user_id = 'ac000000-0000-4000-8000-000000000005'),
  1, 'session d''un autre centre intacte');
select results_eq(
  $$ select action, payload ->> 'kind', payload ->> 'reason', (payload ->> 'signed_out')::integer
     from public.platform_center_events('ac000000-0000-4000-8000-0000000000a1') where action = 'center.access_suspended' $$,
  $$ values ('center.access_suspended', 'contract_end', 'Fin du contrat annuel', 3) $$,
  'suspension journalisée (motif, comptes déconnectés)');
select throws_ok(
  $$ select public.platform_suspend_center('ac000000-0000-4000-8000-0000000000a1', 'unpaid', null, 'Centre Sigma') $$,
  '22023', null, 'centre déjà suspendu : refusé');
select is(
  (select blocked from public.center_for_host('ac-sigma')),
  true, 'adresse du centre : signalée comme suspendue');
select is(
  (select blocked from public.center_for_host('ac-autre')),
  false, 'autre centre : non suspendu');

-- Accès coupé par la RLS, données conservées.
set local role authenticated;
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::integer from public.students where center_id = 'ac000000-0000-4000-8000-0000000000a1'),
  0, 'centre suspendu : l''admin ne lit plus aucun élève');
reset role;
select is(
  (select count(*)::integer from public.students where center_id = 'ac000000-0000-4000-8000-0000000000a1'),
  1, 'aucune donnée supprimée');

-- ---------------------------------------------------------------------
-- Paiement : la suspension manuelle reste
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.platform_record_payment('ac000000-0000-4000-8000-0000000000a1', 400, private.today(), 'cash') $$,
  'paiement d''un centre suspendu manuellement');
select is(
  (select status::text from public.centers where id = 'ac000000-0000-4000-8000-0000000000a1'),
  'suspended', 'paiement : la suspension manuelle reste');
select is(
  (select (payload ->> 'kept_suspended')::boolean from public.platform_center_events('ac000000-0000-4000-8000-0000000000a1')
   where action = 'subscription.payment_recorded' limit 1),
  true, 'journal : suspension maintenue signalée');

-- ---------------------------------------------------------------------
-- Réactivation
-- ---------------------------------------------------------------------
select lives_ok(
  $$ select public.platform_reactivate_center('ac000000-0000-4000-8000-0000000000a1', 'Contrat renouvelé') $$,
  'réactivation');
select results_eq(
  $$ select status::text, suspension_kind, suspended_at from public.centers where id = 'ac000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('active', null::text, null::timestamptz) $$,
  'réactivé : actif, motif effacé');
select is(
  (select payload ->> 'previous_kind' from public.platform_center_events('ac000000-0000-4000-8000-0000000000a1')
   where action = 'center.access_reactivated'),
  'contract_end', 'réactivation journalisée');
select throws_ok(
  $$ select public.platform_reactivate_center('ac000000-0000-4000-8000-0000000000a1') $$,
  '22023', null, 'centre actif : rien à réactiver');
set local role authenticated;
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::integer from public.students where center_id = 'ac000000-0000-4000-8000-0000000000a1'),
  1, 'réactivé : l''admin relit ses élèves');
reset role;

-- ---------------------------------------------------------------------
-- Impayé : levé par un paiement
-- ---------------------------------------------------------------------
reset role;
update public.centers set status = 'suspended' where id = 'ac000000-0000-4000-8000-0000000000b1';
select is(
  (select suspension_kind from public.centers where id = 'ac000000-0000-4000-8000-0000000000b1'),
  'unpaid', 'suspension sans motif (job quotidien) : impayé');
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.platform_record_payment('ac000000-0000-4000-8000-0000000000b1', 400, private.today(), 'bank_transfer') $$,
  'paiement d''un centre suspendu pour impayé');
select is(
  (select status::text from public.centers where id = 'ac000000-0000-4000-8000-0000000000b1'),
  'active', 'impayé réglé : centre remis en service');

-- ---------------------------------------------------------------------
-- Fiche
-- ---------------------------------------------------------------------
select results_eq(
  $$ select students_count, teachers_count, admins_count, student_accounts_count
     from public.platform_center_overview('ac000000-0000-4000-8000-0000000000a1') $$,
  $$ values (1, 1, 1, 1) $$,
  'compteurs du centre');
select results_eq(
  $$ select granularity, total from public.platform_center_payment_totals('ac000000-0000-4000-8000-0000000000a1')
     where period_start = date_trunc(granularity, private.today())::date order by granularity $$,
  $$ values ('month', 400::numeric), ('quarter', 400::numeric), ('year', 400::numeric) $$,
  'totaux des paiements : mois, trimestre, année');

select * from finish();
rollback;
