-- =====================================================================
-- Rôle élève (page 9, phase 3) : ouverture par l'accueil (plateforme
-- pédagogique uniquement), jeton student_user, cloisonnement de l'élève
-- (aucune donnée d'équipe, financière ou d'un autre élève), désactivation
-- et réactivation sans suppression. Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (id, email) values
  ('a9300000-0000-4000-8000-000000000001', 'admin-a-p93@test.local'),
  ('a9300000-0000-4000-8000-000000000002', 'accueil-a-p93@test.local'),
  ('a9300000-0000-4000-8000-000000000003', 'prof-a-p93@test.local'),
  ('a9300000-0000-4000-8000-000000000004', 'accueil-b-p93@test.local'),
  ('a9300000-0000-4000-8000-0000000000e1', 'eleve-aaaa2222@eleves.centromanager.invalid'),
  ('a9300000-0000-4000-8000-0000000000e2', 'eleve-bbbb3333@eleves.centromanager.invalid'),
  ('a9300000-0000-4000-8000-0000000000e3', 'eleve-cccc4444@eleves.centromanager.invalid');
-- Centre A : Premium (plateforme pédagogique) ; centre B : Débutant.
insert into public.centers (id, name, slug, plan_key) values
  ('c9300000-0000-4000-8000-0000000000a1', 'Centre A', 'p93-a', 'premium'),
  ('c9300000-0000-4000-8000-0000000000b1', 'Centre B', 'p93-b', 'starter');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9300000-0000-4000-8000-000000000001', 'c9300000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a9300000-0000-4000-8000-000000000002', 'c9300000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant'),
  ('a9300000-0000-4000-8000-000000000003', 'c9300000-0000-4000-8000-0000000000a1', 'Prof A', 'teacher'),
  ('a9300000-0000-4000-8000-000000000004', 'c9300000-0000-4000-8000-0000000000b1', 'Accueil B', 'assistant');
insert into public.levels (id, center_id, name) values
  ('d9300000-0000-4000-8000-0000000000a1', 'c9300000-0000-4000-8000-0000000000a1', 'Niveau A'),
  ('d9300000-0000-4000-8000-0000000000b1', 'c9300000-0000-4000-8000-0000000000b1', 'Niveau B');
insert into public.students (id, center_id, full_name, level_id) values
  ('59300000-0000-4000-8000-0000000000a1', 'c9300000-0000-4000-8000-0000000000a1', 'Élève A1', 'd9300000-0000-4000-8000-0000000000a1'),
  ('59300000-0000-4000-8000-0000000000a2', 'c9300000-0000-4000-8000-0000000000a1', 'Élève A2', 'd9300000-0000-4000-8000-0000000000a1'),
  ('59300000-0000-4000-8000-0000000000b1', 'c9300000-0000-4000-8000-0000000000b1', 'Élève B1', 'd9300000-0000-4000-8000-0000000000b1');

create function pg_temp.claims(p_user uuid) returns jsonb language sql security definer as
$$ select public.custom_access_token_hook(jsonb_build_object('user_id', p_user, 'claims', '{}'::jsonb)) -> 'claims' $$;
create function pg_temp.account(p_student uuid) returns public.student_accounts language sql security definer as
$$ select * from public.student_accounts where student_id = p_student $$;

set local role authenticated;

-- ---------------------------------------------------------------------
-- Ouverture par l'accueil
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select public.register_student_account('59300000-0000-4000-8000-0000000000a1',
  'a9300000-0000-4000-8000-0000000000e1', 'aaaa2222')$$, 'accueil : ouvre l''accès d''un élève');
select is((pg_temp.account('59300000-0000-4000-8000-0000000000a1')).login_code, 'AAAA2222', 'code en majuscules');
select is((pg_temp.account('59300000-0000-4000-8000-0000000000a1')).created_by, 'a9300000-0000-4000-8000-000000000002'::uuid,
  'ouverture attribuée au compte de l''accueil');
select throws_ok($$select public.register_student_account('59300000-0000-4000-8000-0000000000a1',
  'a9300000-0000-4000-8000-0000000000e2', 'BBBB3333')$$, '23505', null, 'un seul accès par élève');
select throws_ok($$select public.register_student_account('59300000-0000-4000-8000-0000000000a2',
  'a9300000-0000-4000-8000-000000000003', 'BBBB3333')$$, '22023', null, 'compte d''un membre de l''équipe refusé');
select throws_ok($$select public.register_student_account('59300000-0000-4000-8000-0000000000b1',
  'a9300000-0000-4000-8000-0000000000e2', 'BBBB3333')$$, '42501', null, 'élève d''un autre centre refusé');
select is((select count(*)::integer from public.student_accounts), 1, 'accueil : voit l''accès de ses élèves');

set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select public.register_student_account('59300000-0000-4000-8000-0000000000a2',
  'a9300000-0000-4000-8000-0000000000e2', 'BBBB3333')$$, '42501', null, 'professeur : n''ouvre pas d''accès');

set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$select public.register_student_account('59300000-0000-4000-8000-0000000000b1',
  'a9300000-0000-4000-8000-0000000000e2', 'BBBB3333')$$, '42501', null, 'centre sans plateforme pédagogique : refusé');
select is((select count(*)::integer from public.student_accounts), 0, 'accueil B : aucun accès du centre A visible');

-- ---------------------------------------------------------------------
-- Jeton et session de l'élève
-- ---------------------------------------------------------------------
reset role;
select is(pg_temp.claims('a9300000-0000-4000-8000-0000000000e1') ->> 'user_role', 'student_user', 'jeton : rôle élève');
select is(pg_temp.claims('a9300000-0000-4000-8000-0000000000e1') ->> 'center_id', 'c9300000-0000-4000-8000-0000000000a1',
  'jeton : centre de l''élève');
select is(pg_temp.claims('a9300000-0000-4000-8000-0000000000e1') ->> 'profile_active', 'true', 'jeton : accès actif');
select is(pg_temp.claims('a9300000-0000-4000-8000-0000000000e3') ->> 'user_role', null, 'compte sans accès : aucun rôle');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is((select full_name || ' ' || allowed from public.my_student_access()), 'Élève A1 true', 'élève : sa fiche, accès autorisé');
select is(private.auth_student_id(), '59300000-0000-4000-8000-0000000000a1'::uuid, 'élève : identifié par sa fiche');
select is((select count(*)::integer from public.student_accounts), 1, 'élève : son propre accès seulement');
select is((select count(*)::integer from public.students), 0, 'élève : aucune fiche d''élève de l''équipe');
select is((select count(*)::integer from public.invoices), 0, 'élève : aucune donnée financière');
select is((select count(*)::integer from public.profiles), 0, 'élève : aucun compte de l''équipe');
select throws_ok($$select * from public.staff_day_sessions(private.today())$$, '42501', null, 'élève : fonctions de l''équipe refusées');
select throws_ok($$update public.student_accounts set active = true$$, '42501', null, 'élève : ne modifie pas son accès');

-- ---------------------------------------------------------------------
-- Désactivation en un clic, réactivation, données conservées
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.set_student_account_active('59300000-0000-4000-8000-0000000000a1', false),
  'a9300000-0000-4000-8000-0000000000e1'::uuid, 'accueil : désactive l''accès (compte Auth renvoyé pour blocage)');
select ok((pg_temp.account('59300000-0000-4000-8000-0000000000a1')).deactivated_at is not null, 'date de désactivation gardée');
select throws_ok($$select public.student_account_user('59300000-0000-4000-8000-0000000000a1')$$, 'P0002', null,
  'accès désactivé : pas de nouveau mot de passe');
reset role;
select is(pg_temp.claims('a9300000-0000-4000-8000-0000000000e1') ->> 'profile_active', 'false', 'jeton : accès inactif');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is((select allowed from public.my_student_access()), false, 'élève désactivé : accès refusé');
select is(private.auth_student_id(), null, 'élève désactivé : plus identifié');

set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select public.set_student_account_active('59300000-0000-4000-8000-0000000000a1', true)$$, 'accueil : réactive l''accès');
select is((pg_temp.account('59300000-0000-4000-8000-0000000000a1')).active, true, 'accès réactivé, même compte');

-- Plateforme pédagogique retirée de l'offre : accès coupé, compte conservé.
reset role;
select lives_ok($$
  select set_config('centromanager.platform_action', 'on', true);
  update public.center_modules set is_enabled = false, source = 'manual'
  where center_id = 'c9300000-0000-4000-8000-0000000000a1' and module_key = 'lms'
$$, 'module plateforme pédagogique coupé');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is((select active::text || ' ' || allowed from public.my_student_access()), 'true false', 'sans le module : compte actif mais accès refusé');
set local request.jwt.claims = '{"sub":"a9300000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.register_student_account('59300000-0000-4000-8000-0000000000a2',
  'a9300000-0000-4000-8000-0000000000e2', 'BBBB3333')$$, '42501', null, 'sans le module : pas de nouvel accès');

select * from finish();
rollback;
