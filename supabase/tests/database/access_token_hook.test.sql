-- =====================================================================
-- Tests du hook « custom access token » — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'hook-actif@test.local'),
  ('a1000000-0000-4000-8000-000000000002', 'hook-inactif@test.local'),
  ('a1000000-0000-4000-8000-000000000003', 'hook-sans-profil@test.local');

insert into public.centers (id, name) values ('c1000000-0000-4000-8000-000000000001', 'Centre hook');

insert into public.profiles (id, center_id, full_name, role, active) values
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Prof actif', 'teacher', true),
  ('a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'Assistant inactif', 'assistant', false);

create temporary table hook_results as
select
  u.id,
  public.custom_access_token_hook(
    jsonb_build_object('user_id', u.id, 'claims', jsonb_build_object('sub', u.id, 'role', 'authenticated'))
  ) -> 'claims' as claims
from auth.users u
where u.id::text like 'a1000000-%';

select is(
  (select claims ->> 'user_role' from hook_results where id = 'a1000000-0000-4000-8000-000000000001'),
  'teacher', 'hook : rôle ajouté au jeton');
select is(
  (select claims ->> 'center_id' from hook_results where id = 'a1000000-0000-4000-8000-000000000001'),
  'c1000000-0000-4000-8000-000000000001', 'hook : centre ajouté au jeton');
select is(
  (select (claims ->> 'profile_active')::boolean from hook_results where id = 'a1000000-0000-4000-8000-000000000001'),
  true, 'hook : compte actif');
select is(
  (select (claims ->> 'profile_active')::boolean from hook_results where id = 'a1000000-0000-4000-8000-000000000002'),
  false, 'hook : compte désactivé signalé');
select is(
  (select claims ? 'user_role' from hook_results where id = 'a1000000-0000-4000-8000-000000000003'),
  false, 'hook : aucun rôle sans profil');

set local role authenticated;
select throws_ok(
  $$select public.custom_access_token_hook('{}'::jsonb)$$,
  '42501', null, 'hook : non exécutable par les utilisateurs');
reset role;

select * from finish();
rollback;
