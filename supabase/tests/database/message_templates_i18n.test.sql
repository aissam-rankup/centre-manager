-- =====================================================================
-- Modèles de messages aux familles en arabe et en anglais
--
--  * centers.message_templates : vide par défaut ; langues ar / en et
--    modèles connus seulement ; textes de 1 à 1 000 caractères ;
--  * modifiable par l'administrateur, pas par l'accueil.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('a7e00000-0000-4000-8000-00000000000a', 'admin-mt@test.local'),
  ('a7e00000-0000-4000-8000-00000000000b', 'accueil-mt@test.local');
insert into public.centers (id, name, slug) values
  ('c7e00000-0000-4000-8000-0000000000a1', 'Centre A', 'mt-a');
insert into public.profiles (id, center_id, full_name, role) values
  ('a7e00000-0000-4000-8000-00000000000a', 'c7e00000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a7e00000-0000-4000-8000-00000000000b', 'c7e00000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant');

select is((select message_templates from public.centers where id = 'c7e00000-0000-4000-8000-0000000000a1'), '{}'::jsonb, 'vide par défaut');

select lives_ok(
  $$ update public.centers set message_templates = '{"ar": {"receipt": "وصل [الرقم] [الرابط]"}, "en": {"absence": "[student] was absent", "reminder_overdue": "Late"}}'
     where id = 'c7e00000-0000-4000-8000-0000000000a1' $$,
  'modèles arabes et anglais acceptés');
select throws_ok(
  $$ update public.centers set message_templates = '{"de": {"receipt": "x"}}' where id = 'c7e00000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'langue inconnue refusée');
select throws_ok(
  $$ update public.centers set message_templates = '{"fr": {"receipt": "x"}}' where id = 'c7e00000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'français refusé (colonnes d''origine)');
select throws_ok(
  $$ update public.centers set message_templates = '{"en": {"welcome": "x"}}' where id = 'c7e00000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'modèle inconnu refusé');
select throws_ok(
  $$ update public.centers set message_templates = '{"en": {"receipt": "   "}}' where id = 'c7e00000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'modèle vide refusé');
select throws_ok(
  $$ update public.centers set message_templates = jsonb_build_object('en', jsonb_build_object('receipt', repeat('x', 1001))) where id = 'c7e00000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'modèle trop long refusé');

-- Accueil : lecture, pas de modification.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7e00000-0000-4000-8000-00000000000b","role":"authenticated"}';
update public.centers set message_templates = '{}' where id = 'c7e00000-0000-4000-8000-0000000000a1';
select is(
  (select message_templates -> 'en' ->> 'reminder_overdue' from public.centers where id = 'c7e00000-0000-4000-8000-0000000000a1'),
  'Late', 'accueil : ne modifie pas les modèles');

-- Administrateur : modification.
set local request.jwt.claims = '{"sub":"a7e00000-0000-4000-8000-00000000000a","role":"authenticated"}';
update public.centers set message_templates = '{}' where id = 'c7e00000-0000-4000-8000-0000000000a1';
select is((select message_templates from public.centers where id = 'c7e00000-0000-4000-8000-0000000000a1'), '{}'::jsonb, 'admin : modifie les modèles');

select * from finish();
rollback;
