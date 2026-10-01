-- =====================================================================
-- Écritures hors session (clé serveur, service Auth) — npm run db:test
-- Le garde-fou du mode support ne doit pas bloquer la clé serveur ni la
-- suppression d'un compte par le service Auth.
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

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
select lives_ok($$
  delete from public.profiles where id = 'ae000000-0000-4000-8000-000000000002'
$$, 'clé serveur : suppression d''un profil (comme la cascade d''une suppression de compte)');
reset role;

-- Le service Auth (supabase_auth_admin) n'a aucun droit sur le schéma private :
-- le garde-fou doit s'exécuter avec ses propres droits, quel que soit l'appelant.
select ok(
  (select prosecdef from pg_proc where oid = 'private.deny_support_writes()'::regprocedure),
  'garde-fou du mode support : indépendant des droits de l''appelant');

select * from finish();
rollback;
