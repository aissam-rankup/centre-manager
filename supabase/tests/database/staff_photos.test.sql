-- =====================================================================
-- Tests des photos de l'équipe — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('a7000000-0000-4000-8000-000000000001', 'admin-p9@test.local'),
  ('a7000000-0000-4000-8000-000000000002', 'prof-p9@test.local'),
  ('a7000000-0000-4000-8000-000000000003', 'assistant-p9@test.local');
insert into public.centers (id, name) values
  ('c7000000-0000-4000-8000-000000000001', 'Centre P9'),
  ('c7000000-0000-4000-8000-000000000002', 'Autre centre P9');
insert into public.profiles (id, center_id, full_name, role) values
  ('a7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'Admin P9', 'admin'),
  ('a7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'Prof P9', 'teacher'),
  ('a7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'Assistant P9', 'assistant');

set local role authenticated;

-- Professeur : sa propre photo uniquement.
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(
  private.can_write_staff_photo('c7000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000002/1.jpg'),
  'professeur : dépose sa propre photo');
select ok(
  not private.can_write_staff_photo('c7000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000003/1.jpg'),
  'professeur : ne dépose pas la photo d''un collègue');
select lives_ok(
  $$select public.set_my_photo('c7000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000002/1.jpg')$$,
  'professeur : enregistre sa photo sur son profil');
select throws_ok(
  $$select public.set_my_photo('c7000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000003/1.jpg')$$,
  '22023', null, 'professeur : chemin d''un autre profil refusé');
select is(
  (select photo_url from public.profiles where id = 'a7000000-0000-4000-8000-000000000002'),
  'c7000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000002/1.jpg',
  'profil : chemin de la photo enregistré');

-- Admin : toute l'équipe de son centre, jamais un autre centre.
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok(
  private.can_write_staff_photo('c7000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000003/1.jpg'),
  'admin : dépose la photo d''un membre de son centre');
select ok(
  not private.can_write_staff_photo('c7000000-0000-4000-8000-000000000002/a7000000-0000-4000-8000-000000000003/1.jpg'),
  'admin : aucun dépôt dans un autre centre');
select is(
  (select count(*)::int from public.admin_list_users() where photo_url is not null),
  1, 'annuaire admin : photo renvoyée');

reset role;

select * from finish();
rollback;
