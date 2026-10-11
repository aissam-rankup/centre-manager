-- =====================================================================
-- Phase 4c : langue des messages aux familles
--
--  * centers.family_locale : français par défaut, valeurs fr / ar / en,
--    lisible et modifiable par l'administrateur, pas par l'accueil ;
--  * students.message_locale : vide par défaut, valeurs fr / ar / en ;
--  * set_student_message_locale : équipe du centre (accueil compris),
--    jamais un autre centre, ni un professeur, ni un anonyme.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('a4c00000-0000-4000-8000-00000000000a', 'admin-a-4c@test.local'),
  ('a4c00000-0000-4000-8000-00000000000b', 'accueil-a-4c@test.local'),
  ('a4c00000-0000-4000-8000-00000000000c', 'prof-a-4c@test.local'),
  ('b4c00000-0000-4000-8000-00000000000a', 'admin-b-4c@test.local');
insert into public.centers (id, name, slug) values
  ('c4c00000-0000-4000-8000-0000000000a1', 'Centre A', 'p4c-a'),
  ('c4c00000-0000-4000-8000-0000000000b1', 'Centre B', 'p4c-b');
insert into public.profiles (id, center_id, full_name, role) values
  ('a4c00000-0000-4000-8000-00000000000a', 'c4c00000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a4c00000-0000-4000-8000-00000000000b', 'c4c00000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant'),
  ('a4c00000-0000-4000-8000-00000000000c', 'c4c00000-0000-4000-8000-0000000000a1', 'Prof A', 'teacher'),
  ('b4c00000-0000-4000-8000-00000000000a', 'c4c00000-0000-4000-8000-0000000000b1', 'Admin B', 'admin');
insert into public.levels (id, center_id, name) values
  ('d4c00000-0000-4000-8000-0000000000a1', 'c4c00000-0000-4000-8000-0000000000a1', 'Niveau A'),
  ('d4c00000-0000-4000-8000-0000000000b1', 'c4c00000-0000-4000-8000-0000000000b1', 'Niveau B');
insert into public.students (id, center_id, full_name, level_id) values
  ('54c00000-0000-4000-8000-0000000000a1', 'c4c00000-0000-4000-8000-0000000000a1', 'Élève A', 'd4c00000-0000-4000-8000-0000000000a1'),
  ('54c00000-0000-4000-8000-0000000000b1', 'c4c00000-0000-4000-8000-0000000000b1', 'Élève B', 'd4c00000-0000-4000-8000-0000000000b1');

-- ---------------------------------------------------------------------
-- Valeurs par défaut et contraintes
-- ---------------------------------------------------------------------
select is((select family_locale from public.centers where id = 'c4c00000-0000-4000-8000-0000000000a1'), 'fr', 'centre : français par défaut');
select is((select message_locale from public.students where id = '54c00000-0000-4000-8000-0000000000a1'), null, 'élève : langue du centre par défaut');
select throws_ok(
  $$ update public.centers set family_locale = 'de' where id = 'c4c00000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'centre : langue inconnue refusée');
select throws_ok(
  $$ update public.students set message_locale = 'es' where id = '54c00000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'élève : langue inconnue refusée');

-- ---------------------------------------------------------------------
-- Accueil du centre A
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$ select public.set_student_message_locale('54c00000-0000-4000-8000-0000000000a1', 'ar') $$,
  'accueil : choisit la langue d''une famille de son centre');
select is((select message_locale from public.students where id = '54c00000-0000-4000-8000-0000000000a1'), 'ar', 'accueil : langue enregistrée');
select lives_ok(
  $$ select public.set_student_message_locale('54c00000-0000-4000-8000-0000000000a1', null) $$,
  'accueil : revient à la langue du centre');
select throws_ok(
  $$ select public.set_student_message_locale('54c00000-0000-4000-8000-0000000000b1', 'en') $$,
  'P0002', null, 'accueil : élève d''un autre centre introuvable');
select throws_ok(
  $$ select public.set_student_message_locale('54c00000-0000-4000-8000-0000000000a1', 'de') $$,
  '22023', null, 'accueil : langue inconnue refusée');
update public.centers set family_locale = 'ar' where id = 'c4c00000-0000-4000-8000-0000000000a1';
select is((select family_locale from public.centers where id = 'c4c00000-0000-4000-8000-0000000000a1'), 'fr', 'accueil : ne modifie pas la langue du centre');

-- ---------------------------------------------------------------------
-- Professeur du centre A
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-00000000000c","role":"authenticated"}';
select throws_ok(
  $$ select public.set_student_message_locale('54c00000-0000-4000-8000-0000000000a1', 'en') $$,
  '42501', null, 'professeur : refusé');

-- ---------------------------------------------------------------------
-- Administrateur du centre A
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-00000000000a","role":"authenticated"}';
update public.centers set family_locale = 'ar' where id = 'c4c00000-0000-4000-8000-0000000000a1';
select is((select family_locale from public.centers where id = 'c4c00000-0000-4000-8000-0000000000a1'), 'ar', 'admin : modifie la langue du centre');
select is_empty(
  $$ select 1 from public.centers where id = 'c4c00000-0000-4000-8000-0000000000b1' $$,
  'admin : ne voit pas un autre centre');

-- ---------------------------------------------------------------------
-- Anonyme
-- ---------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok(
  $$ select public.set_student_message_locale('54c00000-0000-4000-8000-0000000000a1', 'en') $$,
  '42501', null, 'anonyme : refusé');

select * from finish();
rollback;
