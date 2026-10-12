-- =====================================================================
-- Suppression définitive d'un centre (demande, délai de 30 jours, purge)
--
-- S'appuie sur les données de démonstration (supabase/seed.sql) : le centre
-- Al Wiam a des lignes dans la plupart des tables ; Atlas sert de témoin.
--  * jamais sur un centre actif ; nom retapé ; une demande à la fois ;
--  * pendant le délai : ni réactivation, ni remise en service par un
--    paiement ; demande annulable ;
--  * purge : pas avant l'échéance ; toutes les données et tous les comptes
--    du centre supprimés ; facturation et journal conservés ; autre centre
--    intact ; déclencheurs rétablis ;
--  * aucune de ces fonctions pour un compte de centre.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- Lignes d'un centre, toutes tables de données confondues (center_id).
create function pg_temp.center_rows(p_center uuid)
returns bigint
language plpgsql
as $$
declare
  v_table text;
  v_total bigint := 0;
  v_count bigint;
begin
  for v_table in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'center_id'
      and c.table_name not in ('subscriptions', 'subscription_payments', 'platform_events')
  loop
    execute format('select count(*) from public.%I where center_id = $1', v_table) into v_count using p_center;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end;
$$;

insert into auth.users (id, email) values ('dc000000-0000-4000-8000-000000000001', 'owner-dc@test.local');
insert into public.profiles (id, center_id, full_name, role) values
  ('dc000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin');

create temp table t_before as
select pg_temp.center_rows('10000000-0000-4000-8000-000000000001') as wiam,
       pg_temp.center_rows('10000000-0000-4000-8000-000000000003') as atlas,
       (select count(*) from public.subscription_payments where center_id = '10000000-0000-4000-8000-000000000001') as payments,
       (select count(*) from public.profiles where center_id = '10000000-0000-4000-8000-000000000001') as accounts;
select ok((select wiam > 100 and accounts > 0 and payments > 0 from t_before), 'données de démonstration présentes');

-- ---------------------------------------------------------------------
-- Compte d'un centre : rien
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.platform_request_center_deletion('10000000-0000-4000-8000-000000000003', 'x', 'Auto-école Atlas — Marrakech') $$,
  '42501', null, 'compte d''un centre : demande refusée');
select throws_ok(
  $$ select public.purge_center('10000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'compte connecté : purge refusée (serveur uniquement)');
select throws_ok(
  $$ select * from public.centers_due_for_purge() $$,
  '42501', null, 'compte connecté : liste des purges refusée');

-- ---------------------------------------------------------------------
-- Demande
-- ---------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"dc000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.platform_request_center_deletion('10000000-0000-4000-8000-000000000001', 'Fin de contrat', 'Centre Al Wiam — Casablanca') $$,
  '22023', null, 'centre actif : suppression impossible');

update public.centers set status = 'suspended', suspension_kind = 'contract_end' where id = '10000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select public.platform_request_center_deletion('10000000-0000-4000-8000-000000000001', ' ', 'Centre Al Wiam — Casablanca') $$,
  '22023', null, 'motif obligatoire');
select throws_ok(
  $$ select public.platform_request_center_deletion('10000000-0000-4000-8000-000000000001', 'Fin de contrat', 'Centre Al Wiam') $$,
  '22023', null, 'nom mal retapé : refusé');
select lives_ok(
  $$ select public.platform_request_center_deletion('10000000-0000-4000-8000-000000000001', 'Fin de contrat', 'centre al wiam — casablanca') $$,
  'demande de suppression');
select ok(
  (select deletion_scheduled_for between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour'
   from public.centers where id = '10000000-0000-4000-8000-000000000001'),
  'suppression prévue dans 30 jours');
select throws_ok(
  $$ select public.platform_request_center_deletion('10000000-0000-4000-8000-000000000001', 'Encore', 'Centre Al Wiam — Casablanca') $$,
  '22023', null, 'une demande à la fois');
select is(
  (select payload ->> 'reason' from public.platform_center_events('10000000-0000-4000-8000-000000000001') where action = 'center.deletion_requested'),
  'Fin de contrat', 'demande journalisée');

-- Pendant le délai.
select throws_ok(
  $$ select public.platform_reactivate_center('10000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'pendant le délai : réactivation refusée');
update public.centers set suspension_kind = 'unpaid' where id = '10000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ select public.platform_record_payment('10000000-0000-4000-8000-000000000001', 490, private.today(), 'cash') $$,
  'pendant le délai : paiement enregistré');
select is(
  (select status::text from public.centers where id = '10000000-0000-4000-8000-000000000001'),
  'suspended', 'pendant le délai : pas de remise en service');

-- Annulation, puis nouvelle demande.
select lives_ok(
  $$ select public.platform_cancel_center_deletion('10000000-0000-4000-8000-000000000001', 'Le client reste') $$,
  'annulation de la demande');
select is(
  (select deletion_scheduled_for from public.centers where id = '10000000-0000-4000-8000-000000000001'),
  null, 'annulée : plus de suppression prévue');
select lives_ok(
  $$ select public.platform_request_center_deletion('10000000-0000-4000-8000-000000000001', 'Fin de contrat', 'Centre Al Wiam — Casablanca') $$,
  'nouvelle demande');

-- ---------------------------------------------------------------------
-- Purge (clé service_role)
-- ---------------------------------------------------------------------
set local role service_role;
select throws_ok(
  $$ select public.purge_center('10000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'avant l''échéance : purge refusée');
reset role;
update public.centers set deletion_scheduled_for = now() - interval '1 minute' where id = '10000000-0000-4000-8000-000000000001';
set local role service_role;
select is(
  (select count(*)::integer from public.centers_due_for_purge() where center_id = '10000000-0000-4000-8000-000000000001'),
  1, 'échéance passée : centre à purger');
select lives_ok(
  $$ select public.purge_center('10000000-0000-4000-8000-000000000001') $$,
  'purge');
reset role;

select is(pg_temp.center_rows('10000000-0000-4000-8000-000000000001'), 0::bigint, 'plus aucune donnée du centre');
select is(
  (select count(*)::integer from auth.users where email in ('admin@centro.demo', 'accueil@centro.demo', 'prof1@centro.demo')),
  0, 'comptes du centre supprimés');
select is(
  (select count(*) from public.subscription_payments where center_id = '10000000-0000-4000-8000-000000000001'),
  (select payments + 1 from t_before), 'paiements d''abonnement conservés');
select ok(
  (select count(*) > 0 from public.platform_events where center_id = '10000000-0000-4000-8000-000000000001' and action = 'center.purged'),
  'journal conservé, purge journalisée');
select results_eq(
  $$ select status::text, purged_at is not null, slug like 'supprime-%', owner_contact_name, name
     from public.centers where id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values ('cancelled', true, true, null::text, 'Centre Al Wiam — Casablanca') $$,
  'ligne du centre : résiliée, adresse libérée, contacts effacés, nom gardé pour la facturation');
select is(pg_temp.center_rows('10000000-0000-4000-8000-000000000003'), (select atlas from t_before), 'autre centre intact');
select is(
  (select count(*)::integer from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgenabled <> 'O'),
  0, 'déclencheurs rétablis');

-- Après la purge.
set local request.jwt.claims = '{"sub":"dc000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.platform_record_payment('10000000-0000-4000-8000-000000000001', 490, private.today(), 'cash') $$,
  '22023', null, 'centre purgé : plus de paiement');
select throws_ok(
  $$ select public.platform_set_status('10000000-0000-4000-8000-000000000001', 'active', 'Retour') $$,
  '22023', null, 'centre purgé : plus de réactivation');

select * from finish();
rollback;
