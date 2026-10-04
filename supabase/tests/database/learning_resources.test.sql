-- =====================================================================
-- Ressources pédagogiques (page 9, phase 4) : publication par le
-- professeur pour ses seules matières et niveaux, brouillon et
-- publication, auteur conservé, lecture par l'équipe du centre,
-- cloisonnement par centre et par module, fichiers du stockage.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

insert into auth.users (id, email) values
  ('a9400000-0000-4000-8000-000000000001', 'admin-a-p94@test.local'),
  ('a9400000-0000-4000-8000-000000000002', 'accueil-a-p94@test.local'),
  ('a9400000-0000-4000-8000-000000000003', 'prof-maths-a-p94@test.local'),
  ('a9400000-0000-4000-8000-000000000004', 'prof-physique-a-p94@test.local'),
  ('a9400000-0000-4000-8000-000000000005', 'prof-b-p94@test.local'),
  ('a9400000-0000-4000-8000-000000000006', 'prof-c-p94@test.local');
-- A et C : Premium (plateforme pédagogique) ; B : Débutant.
insert into public.centers (id, name, slug, plan_key) values
  ('c9400000-0000-4000-8000-0000000000a1', 'Centre A', 'p94-a', 'premium'),
  ('c9400000-0000-4000-8000-0000000000b1', 'Centre B', 'p94-b', 'starter'),
  ('c9400000-0000-4000-8000-0000000000c1', 'Centre C', 'p94-c', 'premium');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9400000-0000-4000-8000-000000000001', 'c9400000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a9400000-0000-4000-8000-000000000002', 'c9400000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant'),
  ('a9400000-0000-4000-8000-000000000003', 'c9400000-0000-4000-8000-0000000000a1', 'Prof Maths A', 'teacher'),
  ('a9400000-0000-4000-8000-000000000004', 'c9400000-0000-4000-8000-0000000000a1', 'Prof Physique A', 'teacher'),
  ('a9400000-0000-4000-8000-000000000005', 'c9400000-0000-4000-8000-0000000000b1', 'Prof B', 'teacher'),
  ('a9400000-0000-4000-8000-000000000006', 'c9400000-0000-4000-8000-0000000000c1', 'Prof C', 'teacher');
insert into public.levels (id, center_id, name) values
  ('d9400000-0000-4000-8000-0000000000a1', 'c9400000-0000-4000-8000-0000000000a1', 'Niveau A1'),
  ('d9400000-0000-4000-8000-0000000000a2', 'c9400000-0000-4000-8000-0000000000a1', 'Niveau A2'),
  ('d9400000-0000-4000-8000-0000000000b1', 'c9400000-0000-4000-8000-0000000000b1', 'Niveau B'),
  ('d9400000-0000-4000-8000-0000000000c1', 'c9400000-0000-4000-8000-0000000000c1', 'Niveau C');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e9400000-0000-4000-8000-0000000000a1', 'c9400000-0000-4000-8000-0000000000a1', 'd9400000-0000-4000-8000-0000000000a1', 'Maths A1', 300),
  ('e9400000-0000-4000-8000-0000000000a2', 'c9400000-0000-4000-8000-0000000000a1', 'd9400000-0000-4000-8000-0000000000a1', 'Physique A1', 300),
  ('e9400000-0000-4000-8000-0000000000a3', 'c9400000-0000-4000-8000-0000000000a1', 'd9400000-0000-4000-8000-0000000000a2', 'Maths A2', 300),
  ('e9400000-0000-4000-8000-0000000000b1', 'c9400000-0000-4000-8000-0000000000b1', 'd9400000-0000-4000-8000-0000000000b1', 'Maths B', 300),
  ('e9400000-0000-4000-8000-0000000000c1', 'c9400000-0000-4000-8000-0000000000c1', 'd9400000-0000-4000-8000-0000000000c1', 'Maths C', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a9400000-0000-4000-8000-000000000003', 'e9400000-0000-4000-8000-0000000000a1', 'd9400000-0000-4000-8000-0000000000a1'),
  ('a9400000-0000-4000-8000-000000000004', 'e9400000-0000-4000-8000-0000000000a2', 'd9400000-0000-4000-8000-0000000000a1'),
  ('a9400000-0000-4000-8000-000000000005', 'e9400000-0000-4000-8000-0000000000b1', 'd9400000-0000-4000-8000-0000000000b1'),
  ('a9400000-0000-4000-8000-000000000006', 'e9400000-0000-4000-8000-0000000000c1', 'd9400000-0000-4000-8000-0000000000c1');

create function pg_temp.res() returns public.learning_resources language sql security definer as
$$ select * from public.learning_resources where id = 'f9400000-0000-4000-8000-0000000000a1' $$;

set local role authenticated;

-- ---------------------------------------------------------------------
-- Publication par le professeur de la matière
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok($$insert into public.learning_resources (id, center_id, subject_id, level_id, type, title, description)
  values ('f9400000-0000-4000-8000-0000000000a1', 'c9400000-0000-4000-8000-0000000000a1', 'e9400000-0000-4000-8000-0000000000a1',
          'd9400000-0000-4000-8000-0000000000a1', 'exercise', '  Série 1  ', 'Exercices 1 à 5')$$, 'professeur : brouillon dans sa matière');
select is((pg_temp.res()).author_id, 'a9400000-0000-4000-8000-000000000003'::uuid, 'auteur enregistré');
select is((pg_temp.res()).title, 'Série 1', 'titre nettoyé');
select is((pg_temp.res()).published_at, null, 'brouillon : pas de date de publication');
select throws_ok($$update public.learning_resources set is_published = true where id = 'f9400000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'publication sans fichier refusée');
select lives_ok($$update public.learning_resources
  set file_url = 'c9400000-0000-4000-8000-0000000000a1/f9400000-0000-4000-8000-0000000000a1/serie-1.pdf',
      file_name = 'Série 1.pdf', file_type = 'application/pdf', file_size = 1200, is_published = true, due_date = private.today() + 7
  where id = 'f9400000-0000-4000-8000-0000000000a1'$$, 'professeur : fichier rattaché et publication');
select ok((pg_temp.res()).published_at is not null, 'publiée : date de publication');
select set_config('test.published_at', (pg_temp.res()).published_at::text, true);

select throws_ok($$insert into public.learning_resources (center_id, subject_id, level_id, type, title)
  values ('c9400000-0000-4000-8000-0000000000a1', 'e9400000-0000-4000-8000-0000000000a2', 'd9400000-0000-4000-8000-0000000000a1', 'summary', 'X')$$,
  '42501', null, 'matière d''un collègue refusée');
select throws_ok($$insert into public.learning_resources (center_id, subject_id, level_id, type, title)
  values ('c9400000-0000-4000-8000-0000000000a1', 'e9400000-0000-4000-8000-0000000000a1', 'd9400000-0000-4000-8000-0000000000a2', 'summary', 'X')$$,
  '42501', null, 'niveau qui n''est pas celui de la matière refusé');
select throws_ok($$insert into public.learning_resources (center_id, subject_id, level_id, type, title, due_date)
  values ('c9400000-0000-4000-8000-0000000000a1', 'e9400000-0000-4000-8000-0000000000a1', 'd9400000-0000-4000-8000-0000000000a1', 'summary', 'X', private.today())$$,
  '23514', null, 'échéance réservée aux exercices et examens');
select throws_ok($$insert into public.learning_resources (center_id, subject_id, level_id, type, title)
  values ('c9400000-0000-4000-8000-0000000000c1', 'e9400000-0000-4000-8000-0000000000c1', 'd9400000-0000-4000-8000-0000000000c1', 'summary', 'X')$$,
  '42501', null, 'autre centre refusé');
select throws_ok($$update public.learning_resources set author_id = 'a9400000-0000-4000-8000-000000000004'
  where id = 'f9400000-0000-4000-8000-0000000000a1'$$, '42501', null, 'l''auteur ne change pas');

-- Dépublier, republier : la ressource redevient une nouveauté.
select lives_ok($$update public.learning_resources set is_published = false where id = 'f9400000-0000-4000-8000-0000000000a1'$$,
  'professeur : dépublie');
select is((pg_temp.res()).published_at::text, current_setting('test.published_at'), 'dépubliée : date gardée');
select lives_ok($$update public.learning_resources set is_published = true where id = 'f9400000-0000-4000-8000-0000000000a1'$$,
  'professeur : republie');

-- Fichiers : écriture par l'auteur seulement, dans le dossier de sa ressource.
select ok(private.can_write_resource_file('c9400000-0000-4000-8000-0000000000a1/f9400000-0000-4000-8000-0000000000a1/serie-1.pdf'),
  'stockage : l''auteur écrit dans le dossier de sa ressource');
select ok(not private.can_write_resource_file('c9400000-0000-4000-8000-0000000000c1/f9400000-0000-4000-8000-0000000000a1/serie-1.pdf'),
  'stockage : dossier d''un autre centre refusé');
select ok(not private.can_write_resource_file('serie-1.pdf'), 'stockage : chemin invalide refusé');
select ok(private.can_read_resource_file('c9400000-0000-4000-8000-0000000000a1/f9400000-0000-4000-8000-0000000000a1/serie-1.pdf'),
  'stockage : l''auteur lit son fichier');

-- ---------------------------------------------------------------------
-- Les autres : collègue, équipe, autre centre
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::integer from public.learning_resources), 0, 'collègue : ne voit pas les ressources d''un autre professeur');
update public.learning_resources set title = 'Piraté' where id = 'f9400000-0000-4000-8000-0000000000a1';
delete from public.learning_resources where id = 'f9400000-0000-4000-8000-0000000000a1';
select ok(not private.can_write_resource_file('c9400000-0000-4000-8000-0000000000a1/f9400000-0000-4000-8000-0000000000a1/x.pdf'),
  'stockage : un collègue n''écrit pas dans le dossier');
select ok(not private.can_read_resource_file('c9400000-0000-4000-8000-0000000000a1/f9400000-0000-4000-8000-0000000000a1/serie-1.pdf'),
  'stockage : un collègue ne lit pas le fichier');

set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select title from public.learning_resources), 'Série 1', 'accueil : lit les ressources du centre (intactes)');
select throws_ok($$insert into public.learning_resources (center_id, subject_id, level_id, type, title)
  values ('c9400000-0000-4000-8000-0000000000a1', 'e9400000-0000-4000-8000-0000000000a1', 'd9400000-0000-4000-8000-0000000000a1', 'summary', 'X')$$,
  '42501', null, 'accueil : ne publie pas');
select ok(private.can_read_resource_file('c9400000-0000-4000-8000-0000000000a1/f9400000-0000-4000-8000-0000000000a1/serie-1.pdf'),
  'stockage : l''équipe du centre lit le fichier');

set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.learning_resources), 1, 'admin : lit les ressources du centre');

set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000006","role":"authenticated"}';
select is((select count(*)::integer from public.learning_resources), 0, 'professeur d''un autre centre : rien');
select ok(not private.can_read_resource_file('c9400000-0000-4000-8000-0000000000a1/f9400000-0000-4000-8000-0000000000a1/serie-1.pdf'),
  'stockage : autre centre refusé');

-- Centre sans plateforme pédagogique : refusé partout.
set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok($$insert into public.learning_resources (center_id, subject_id, level_id, type, title)
  values ('c9400000-0000-4000-8000-0000000000b1', 'e9400000-0000-4000-8000-0000000000b1', 'd9400000-0000-4000-8000-0000000000b1', 'summary', 'X')$$,
  '42501', null, 'sans le module : publication refusée');
select set_config('request.path', '/learning_resources', true);
select throws_ok($$select private.check_module_request()$$, '42501', null, 'sans le module : API refusée');
set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok($$select private.check_module_request()$$, 'avec le module : API acceptée');
select set_config('request.path', '', true);

-- Module retiré : ressources masquées, rien supprimé.
reset role;
select lives_ok($$
  select set_config('centromanager.platform_action', 'on', true);
  update public.center_modules set is_enabled = false, source = 'manual'
  where center_id = 'c9400000-0000-4000-8000-0000000000a1' and module_key = 'lms'
$$, 'plateforme pédagogique coupée pour le centre A');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::integer from public.learning_resources), 0, 'module coupé : ressources masquées à l''auteur');
reset role;
select is((select count(*)::integer from public.learning_resources where center_id = 'c9400000-0000-4000-8000-0000000000a1'), 1,
  'module coupé : ressource conservée');
select lives_ok($$
  select set_config('centromanager.platform_action', 'on', true);
  update public.center_modules set is_enabled = true, source = 'plan'
  where center_id = 'c9400000-0000-4000-8000-0000000000a1' and module_key = 'lms'
$$, 'module rétabli');

-- Suppression par l'auteur.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9400000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok($$delete from public.learning_resources where id = 'f9400000-0000-4000-8000-0000000000a1'$$, 'auteur : supprime sa ressource');
select is((pg_temp.res()).id, null, 'ressource supprimée');

select * from finish();
rollback;
