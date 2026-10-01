-- =====================================================================
-- Écritures hors session (clé serveur, service Auth) — npm run db:test
-- Le garde-fou du mode support ne doit pas bloquer la clé serveur ni la
-- suppression d'un compte par le service Auth.
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-000000000001', 'owner-p21@test.local'),
  ('ae000000-0000-4000-8000-000000000002', 'admin-p21@test.local');
insert into public.centers (id, name) values ('ce000000-0000-4000-8000-000000000001', 'Centre P21');

set local role service_role;
select lives_ok($$
  insert into public.profiles (id, center_id, full_name, role) values ('ae000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin')
$$, 'clé serveur : création d''un profil super-admin');
select lives_ok($$
  insert into public.profiles (id, center_id, full_name, role) values ('ae000000-0000-4000-8000-000000000002', 'ce000000-0000-4000-8000-000000000001', 'Admin', 'admin')
$$, 'clé serveur : création d''un profil de centre');
reset role;

set local role supabase_auth_admin;
select lives_ok($$delete from auth.users where id = 'ae000000-0000-4000-8000-000000000002'$$, 'service Auth : suppression d''un compte (profil en cascade)');
reset role;

select * from finish();
rollback;
