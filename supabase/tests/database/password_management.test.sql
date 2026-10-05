-- =====================================================================
-- Page 11 : gestion des mots de passe par les responsables
--
--  * qui réinitialise qui : administrateur (assistants, professeurs, élèves
--    de son centre), accueil (élèves de son centre), super-admin
--    (administrateurs) ; tout le reste refusé et journalisé « denied » ;
--  * limite de 10 réinitialisations par heure ;
--  * finalisation réservée au serveur (service_role) : changement
--    obligatoire, sessions supprimées, journal ;
--  * indicateur jamais modifiable directement ; compte créé par un
--    responsable : changement obligatoire ;
--  * session fermée détectée ; changement par la personne elle-même ;
--  * journal : RLS (centre pour l'administrateur, ses actes pour le
--    super-admin), ajout seul ; jeton : claim must_change_password.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

insert into auth.users (id, email) values
  ('a1100000-0000-4000-8000-00000000000a', 'admin-a-p11@test.local'),
  ('a1100000-0000-4000-8000-0000000000a2', 'admin2-a-p11@test.local'),
  ('a1100000-0000-4000-8000-00000000000b', 'accueil-a-p11@test.local'),
  ('a1100000-0000-4000-8000-00000000000c', 'prof-a-p11@test.local'),
  ('a1100000-0000-4000-8000-0000000000e1', 'eleve-p11aaaa1@eleves.centromanager.invalid'),
  ('b1100000-0000-4000-8000-00000000000a', 'admin-b-p11@test.local'),
  ('b1100000-0000-4000-8000-00000000000c', 'prof-b-p11@test.local'),
  ('b1100000-0000-4000-8000-0000000000e1', 'eleve-p11bbbb1@eleves.centromanager.invalid'),
  ('a1100000-0000-4000-8000-000000000099', 'proprio-p11@test.local');
insert into public.centers (id, name, slug, plan_key) values
  ('c1100000-0000-4000-8000-0000000000a1', 'Centre A', 'p11-a', 'premium'),
  ('c1100000-0000-4000-8000-0000000000b1', 'Centre B', 'p11-b', 'premium');
insert into public.profiles (id, center_id, full_name, role, phone) values
  ('a1100000-0000-4000-8000-00000000000a', 'c1100000-0000-4000-8000-0000000000a1', 'Admin A', 'admin', '0600000010'),
  ('a1100000-0000-4000-8000-0000000000a2', 'c1100000-0000-4000-8000-0000000000a1', 'Admin A2', 'admin', null),
  ('a1100000-0000-4000-8000-00000000000b', 'c1100000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant', null),
  ('a1100000-0000-4000-8000-00000000000c', 'c1100000-0000-4000-8000-0000000000a1', 'Prof A', 'teacher', '0600000011'),
  ('b1100000-0000-4000-8000-00000000000a', 'c1100000-0000-4000-8000-0000000000b1', 'Admin B', 'admin', '0600000020'),
  ('b1100000-0000-4000-8000-00000000000c', 'c1100000-0000-4000-8000-0000000000b1', 'Prof B', 'teacher', null),
  ('a1100000-0000-4000-8000-000000000099', null, 'Propriétaire', 'super_admin', null);
insert into public.levels (id, center_id, name) values
  ('d1100000-0000-4000-8000-0000000000a1', 'c1100000-0000-4000-8000-0000000000a1', 'Niveau A'),
  ('d1100000-0000-4000-8000-0000000000b1', 'c1100000-0000-4000-8000-0000000000b1', 'Niveau B');
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('51100000-0000-4000-8000-0000000000a1', 'c1100000-0000-4000-8000-0000000000a1', 'Élève A', 'd1100000-0000-4000-8000-0000000000a1', '0600000030'),
  ('51100000-0000-4000-8000-0000000000b1', 'c1100000-0000-4000-8000-0000000000b1', 'Élève B', 'd1100000-0000-4000-8000-0000000000b1', '0600000040');
insert into public.student_accounts (user_id, student_id, center_id, login_code) values
  ('a1100000-0000-4000-8000-0000000000e1', '51100000-0000-4000-8000-0000000000a1', 'c1100000-0000-4000-8000-0000000000a1', 'P11AAAA1'),
  ('b1100000-0000-4000-8000-0000000000e1', '51100000-0000-4000-8000-0000000000b1', 'c1100000-0000-4000-8000-0000000000b1', 'P11BBBB1');
-- Sessions ouvertes du professeur A (téléphone et ordinateur).
insert into auth.sessions (id, user_id) values
  ('e1100000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-00000000000c'),
  ('e1100000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-00000000000c');
insert into auth.refresh_tokens (token, user_id, session_id) values
  ('p11-token-1', 'a1100000-0000-4000-8000-00000000000c', 'e1100000-0000-4000-8000-000000000001');

create function pg_temp.decision(p_user uuid, p_student uuid) returns text language sql as $$
  select case when allowed then 'ok' else 'refus:' || reason end from public.authorize_password_reset(p_user, p_student);
$$;
grant execute on function pg_temp.decision(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Administrateur du centre A
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-00000000000a","role":"authenticated"}';

select is(pg_temp.decision('a1100000-0000-4000-8000-00000000000c', null), 'ok', 'admin : professeur de son centre');
select is(pg_temp.decision('a1100000-0000-4000-8000-00000000000b', null), 'ok', 'admin : assistant de son centre');
select is(pg_temp.decision(null, '51100000-0000-4000-8000-0000000000a1'), 'ok', 'admin : élève de son centre');
select results_eq(
  $$ select target_role, center_slug, phone, login_code from public.authorize_password_reset(null, '51100000-0000-4000-8000-0000000000a1') $$,
  $$ values ('student_user'::text, 'p11-a'::text, '0600000030'::text, 'P11AAAA1'::text) $$,
  'élève : téléphone du responsable et code de connexion');
select is(pg_temp.decision('a1100000-0000-4000-8000-0000000000a2', null), 'refus:forbidden', 'admin : un autre administrateur refusé');
select is(pg_temp.decision('a1100000-0000-4000-8000-00000000000a', null), 'refus:self', 'admin : soi-même refusé (« Mon mot de passe »)');
select is(pg_temp.decision('b1100000-0000-4000-8000-00000000000c', null), 'refus:other_center', 'admin : professeur d''un autre centre refusé');
select is(pg_temp.decision(null, '51100000-0000-4000-8000-0000000000b1'), 'refus:other_center', 'admin : élève d''un autre centre refusé');
select is(pg_temp.decision('a1100000-0000-4000-8000-000000000099', null), 'refus:other_center', 'admin : super-admin refusé');
select throws_ok(
  $$ select * from public.authorize_password_reset('a1100000-0000-4000-8000-00000000000c', '51100000-0000-4000-8000-0000000000a1') $$,
  '22023', null, 'une seule cible à la fois');

-- ---------------------------------------------------------------------
-- Accueil, professeur, élève
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is(pg_temp.decision(null, '51100000-0000-4000-8000-0000000000a1'), 'ok', 'accueil : élève de son centre');
select is(pg_temp.decision('a1100000-0000-4000-8000-00000000000c', null), 'refus:forbidden', 'accueil : professeur refusé');
select is(pg_temp.decision(null, '51100000-0000-4000-8000-0000000000b1'), 'refus:other_center', 'accueil : élève d''un autre centre refusé');

set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is(pg_temp.decision(null, '51100000-0000-4000-8000-0000000000a1'), 'refus:forbidden', 'professeur : personne');

set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is(pg_temp.decision('a1100000-0000-4000-8000-00000000000c', null), 'refus:forbidden', 'élève : personne');

-- ---------------------------------------------------------------------
-- Super-admin
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-000000000099","role":"authenticated"}';
select is(pg_temp.decision('b1100000-0000-4000-8000-00000000000a', null), 'ok', 'super-admin : administrateur d''un centre');
select is(pg_temp.decision('b1100000-0000-4000-8000-00000000000c', null), 'refus:forbidden', 'super-admin : professeur refusé (rôle de l''admin du centre)');
select is(pg_temp.decision(null, '51100000-0000-4000-8000-0000000000b1'), 'refus:forbidden', 'super-admin : élève refusé');
select throws_ok(
  $$ select public.complete_password_reset('a1100000-0000-4000-8000-000000000099', 'b1100000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'finalisation interdite à une session (serveur uniquement)');
select is(
  (select count(*)::int from public.password_events),
  2, 'super-admin : il ne lit que ses propres actes (ses deux refus)');

-- ---------------------------------------------------------------------
-- Refus journalisés
-- ---------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from public.password_events
   where event_type = 'denied' and actor_id = 'a1100000-0000-4000-8000-00000000000a'),
  5, 'refus de l''admin A journalisés (autre admin, soi-même, autre centre ×2, super-admin)');
select results_eq(
  $$ select reason, center_id from public.password_events
     where event_type = 'denied' and target_user_id = 'b1100000-0000-4000-8000-00000000000c'
       and actor_id = 'a1100000-0000-4000-8000-00000000000a' $$,
  $$ values ('other_center'::text, 'c1100000-0000-4000-8000-0000000000b1'::uuid) $$,
  'refus « autre centre » : motif et centre de la cible');

-- ---------------------------------------------------------------------
-- Finalisation (service_role) : changement obligatoire, sessions, journal
-- ---------------------------------------------------------------------
set local role service_role;
select lives_ok(
  $$ select public.complete_password_reset('a1100000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-00000000000c') $$,
  'serveur : réinitialisation du professeur A par l''admin A');
select throws_ok(
  $$ select public.complete_password_reset('a1100000-0000-4000-8000-00000000000a', 'b1100000-0000-4000-8000-00000000000c') $$,
  '42501', null, 'serveur : la règle est revérifiée (autre centre refusé)');
select lives_ok(
  $$ select public.complete_password_reset('a1100000-0000-4000-8000-00000000000b', 'a1100000-0000-4000-8000-0000000000e1') $$,
  'serveur : réinitialisation de l''élève A par l''accueil');
reset role;

select ok((select must_change_password from public.profiles where id = 'a1100000-0000-4000-8000-00000000000c'),
  'professeur : changement obligatoire');
select ok((select must_change_password from public.student_accounts where user_id = 'a1100000-0000-4000-8000-0000000000e1'),
  'élève : changement obligatoire');
select is((select count(*)::int from auth.sessions where user_id = 'a1100000-0000-4000-8000-00000000000c'), 0,
  'professeur : toutes ses sessions supprimées');
select is((select count(*)::int from auth.refresh_tokens where user_id = 'a1100000-0000-4000-8000-00000000000c'), 0,
  'professeur : jetons de rafraîchissement supprimés');
select results_eq(
  $$ select event_type::text, actor_role, target_role from public.password_events
     where target_user_id in ('a1100000-0000-4000-8000-00000000000c', 'a1100000-0000-4000-8000-0000000000e1') and event_type <> 'denied'
     order by id $$,
  $$ values ('reset_by_admin', 'admin', 'teacher'), ('reset_by_assistant', 'assistant', 'student_user') $$,
  'réinitialisations journalisées (auteur, rôles)');
select ok(
  (public.custom_access_token_hook(jsonb_build_object('user_id', 'a1100000-0000-4000-8000-00000000000c', 'claims', '{}'::jsonb))
     -> 'claims' ->> 'must_change_password')::boolean,
  'jeton : claim must_change_password');

-- Limite : 10 réinitialisations par heure et par responsable.
insert into public.password_events (center_id, actor_id, actor_role, target_user_id, target_role, event_type)
select 'c1100000-0000-4000-8000-0000000000a1', 'a1100000-0000-4000-8000-00000000000a', 'admin',
       'a1100000-0000-4000-8000-00000000000b', 'assistant', 'reset_by_admin'
from generate_series(1, 9);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(pg_temp.decision('a1100000-0000-4000-8000-00000000000b', null), 'refus:rate_limited', 'onzième réinitialisation de l''heure refusée');

-- ---------------------------------------------------------------------
-- Indicateur protégé ; compte créé par un responsable
-- ---------------------------------------------------------------------
select throws_ok(
  $$ update public.profiles set must_change_password = false where id = 'a1100000-0000-4000-8000-00000000000c' $$,
  '42501', null, 'admin : indicateur non modifiable directement');
reset role;
insert into auth.users (id, email) values ('a1100000-0000-4000-8000-0000000000d1', 'nouveau-p11@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into public.profiles (id, center_id, full_name, role)
values ('a1100000-0000-4000-8000-0000000000d1', 'c1100000-0000-4000-8000-0000000000a1', 'Nouveau prof', 'teacher');
select ok((select must_change_password from public.profiles where id = 'a1100000-0000-4000-8000-0000000000d1'),
  'compte créé par l''admin : mot de passe à changer à la première connexion');

-- Journal : l'admin lit son centre seulement ; personne ne le modifie.
select is((select count(*)::int from public.password_events where center_id is distinct from 'c1100000-0000-4000-8000-0000000000a1'), 0,
  'admin : aucun événement d''un autre centre');
select throws_ok($$ delete from public.password_events $$, '42501', null, 'journal : suppression refusée');
set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.password_events), 0, 'accueil : journal illisible');

-- ---------------------------------------------------------------------
-- Session fermée ; changement par la personne elle-même
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-00000000000c","role":"authenticated","session_id":"e1100000-0000-4000-8000-000000000001"}';
select results_eq($$ select session_valid, must_change from public.my_password_state() $$, $$ values (false, true) $$,
  'session supprimée par la réinitialisation : détectée');

reset role;
insert into auth.sessions (id, user_id) values
  ('e1100000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-00000000000c'),
  ('e1100000-0000-4000-8000-000000000004', 'a1100000-0000-4000-8000-00000000000c');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1100000-0000-4000-8000-00000000000c","role":"authenticated","session_id":"e1100000-0000-4000-8000-000000000003"}';
select lives_ok($$ select public.complete_my_password_change() $$, 'professeur : nouveau mot de passe choisi');
reset role;
select results_eq(
  $$ select (select must_change_password from public.profiles where id = 'a1100000-0000-4000-8000-00000000000c'),
            (select array_agg(id::text) from auth.sessions where user_id = 'a1100000-0000-4000-8000-00000000000c') $$,
  $$ values (false, array['e1100000-0000-4000-8000-000000000003']) $$,
  'indicateur levé ; seule la session en cours est gardée');
select is(
  (select event_type::text from public.password_events where actor_id = 'a1100000-0000-4000-8000-00000000000c' order by id desc limit 1),
  'forced_change_completed', 'changement obligatoire journalisé');

select * from finish();
rollback;
