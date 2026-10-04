-- =====================================================================
-- Espace élève (page 9, phase 5) : l'élève ne voit que les ressources
-- PUBLIÉES des matières où il est inscrit, dans son centre ; fichiers,
-- nouveautés (ouvertures), accès coupé, autre centre.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email) values
  ('a9500000-0000-4000-8000-000000000001', 'prof-a-p95@test.local'),
  ('a9500000-0000-4000-8000-000000000002', 'accueil-a-p95@test.local'),
  ('a9500000-0000-4000-8000-000000000003', 'prof-c-p95@test.local'),
  ('a9500000-0000-4000-8000-0000000000e1', 'eleve-p95aaaa1@eleves.centromanager.invalid'),
  ('a9500000-0000-4000-8000-0000000000e2', 'eleve-p95aaaa2@eleves.centromanager.invalid'),
  ('a9500000-0000-4000-8000-0000000000e3', 'eleve-p95aaaa3@eleves.centromanager.invalid'),
  ('a9500000-0000-4000-8000-0000000000e4', 'eleve-p95cccc1@eleves.centromanager.invalid');
insert into public.centers (id, name, slug, plan_key) values
  ('c9500000-0000-4000-8000-0000000000a1', 'Centre A', 'p95-a', 'premium'),
  ('c9500000-0000-4000-8000-0000000000c1', 'Centre C', 'p95-c', 'premium');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-0000000000a1', 'Prof A', 'teacher'),
  ('a9500000-0000-4000-8000-000000000002', 'c9500000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant'),
  ('a9500000-0000-4000-8000-000000000003', 'c9500000-0000-4000-8000-0000000000c1', 'Prof C', 'teacher');
insert into public.levels (id, center_id, name) values
  ('d9500000-0000-4000-8000-0000000000a1', 'c9500000-0000-4000-8000-0000000000a1', 'Niveau A'),
  ('d9500000-0000-4000-8000-0000000000c1', 'c9500000-0000-4000-8000-0000000000c1', 'Niveau C');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e9500000-0000-4000-8000-0000000000a1', 'c9500000-0000-4000-8000-0000000000a1', 'd9500000-0000-4000-8000-0000000000a1', 'Maths', 300),
  ('e9500000-0000-4000-8000-0000000000a2', 'c9500000-0000-4000-8000-0000000000a1', 'd9500000-0000-4000-8000-0000000000a1', 'Physique', 300),
  ('e9500000-0000-4000-8000-0000000000c1', 'c9500000-0000-4000-8000-0000000000c1', 'd9500000-0000-4000-8000-0000000000c1', 'Maths C', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a9500000-0000-4000-8000-000000000001', 'e9500000-0000-4000-8000-0000000000a1', 'd9500000-0000-4000-8000-0000000000a1'),
  ('a9500000-0000-4000-8000-000000000001', 'e9500000-0000-4000-8000-0000000000a2', 'd9500000-0000-4000-8000-0000000000a1'),
  ('a9500000-0000-4000-8000-000000000003', 'e9500000-0000-4000-8000-0000000000c1', 'd9500000-0000-4000-8000-0000000000c1');
-- S1 : maths ; S2 : maths et physique ; S3 : aucune matière ; SC : centre C.
insert into public.students (id, center_id, full_name, level_id) values
  ('59500000-0000-4000-8000-0000000000a1', 'c9500000-0000-4000-8000-0000000000a1', 'Élève S1', 'd9500000-0000-4000-8000-0000000000a1'),
  ('59500000-0000-4000-8000-0000000000a2', 'c9500000-0000-4000-8000-0000000000a1', 'Élève S2', 'd9500000-0000-4000-8000-0000000000a1'),
  ('59500000-0000-4000-8000-0000000000a3', 'c9500000-0000-4000-8000-0000000000a1', 'Élève S3', 'd9500000-0000-4000-8000-0000000000a1'),
  ('59500000-0000-4000-8000-0000000000c1', 'c9500000-0000-4000-8000-0000000000c1', 'Élève SC', 'd9500000-0000-4000-8000-0000000000c1');
insert into public.enrollments (student_id, subject_id, start_date, billing_day) values
  ('59500000-0000-4000-8000-0000000000a1', 'e9500000-0000-4000-8000-0000000000a1', private.today() - 10, 1),
  ('59500000-0000-4000-8000-0000000000a2', 'e9500000-0000-4000-8000-0000000000a1', private.today() - 10, 1),
  ('59500000-0000-4000-8000-0000000000a2', 'e9500000-0000-4000-8000-0000000000a2', private.today() - 10, 1),
  ('59500000-0000-4000-8000-0000000000c1', 'e9500000-0000-4000-8000-0000000000c1', private.today() - 10, 1);
insert into public.student_accounts (user_id, student_id, center_id, login_code) values
  ('a9500000-0000-4000-8000-0000000000e1', '59500000-0000-4000-8000-0000000000a1', 'c9500000-0000-4000-8000-0000000000a1', 'P95AAAA1'),
  ('a9500000-0000-4000-8000-0000000000e2', '59500000-0000-4000-8000-0000000000a2', 'c9500000-0000-4000-8000-0000000000a1', 'P95AAAA2'),
  ('a9500000-0000-4000-8000-0000000000e3', '59500000-0000-4000-8000-0000000000a3', 'c9500000-0000-4000-8000-0000000000a1', 'P95AAAA3'),
  ('a9500000-0000-4000-8000-0000000000e4', '59500000-0000-4000-8000-0000000000c1', 'c9500000-0000-4000-8000-0000000000c1', 'P95CCCC1');
-- R1 maths publiée ; R2 physique publiée (à rendre) ; R3 maths brouillon ; RC centre C publiée.
insert into public.learning_resources (id, center_id, subject_id, level_id, author_id, type, title, file_url, file_name, is_published, due_date) values
  ('f9500000-0000-4000-8000-0000000000a1', 'c9500000-0000-4000-8000-0000000000a1', 'e9500000-0000-4000-8000-0000000000a1',
   'd9500000-0000-4000-8000-0000000000a1', 'a9500000-0000-4000-8000-000000000001', 'summary', 'Résumé maths',
   'c9500000-0000-4000-8000-0000000000a1/f9500000-0000-4000-8000-0000000000a1/r1.pdf', 'r1.pdf', true, null),
  ('f9500000-0000-4000-8000-0000000000a2', 'c9500000-0000-4000-8000-0000000000a1', 'e9500000-0000-4000-8000-0000000000a2',
   'd9500000-0000-4000-8000-0000000000a1', 'a9500000-0000-4000-8000-000000000001', 'exercise', 'Exercice physique',
   'c9500000-0000-4000-8000-0000000000a1/f9500000-0000-4000-8000-0000000000a2/r2.pdf', 'r2.pdf', true, private.today() + 3),
  ('f9500000-0000-4000-8000-0000000000a3', 'c9500000-0000-4000-8000-0000000000a1', 'e9500000-0000-4000-8000-0000000000a1',
   'd9500000-0000-4000-8000-0000000000a1', 'a9500000-0000-4000-8000-000000000001', 'exam', 'Examen maths (brouillon)',
   'c9500000-0000-4000-8000-0000000000a1/f9500000-0000-4000-8000-0000000000a3/r3.pdf', 'r3.pdf', false, null),
  ('f9500000-0000-4000-8000-0000000000c1', 'c9500000-0000-4000-8000-0000000000c1', 'e9500000-0000-4000-8000-0000000000c1',
   'd9500000-0000-4000-8000-0000000000c1', 'a9500000-0000-4000-8000-000000000003', 'summary', 'Résumé C',
   'c9500000-0000-4000-8000-0000000000c1/f9500000-0000-4000-8000-0000000000c1/rc.pdf', 'rc.pdf', true, null);

set local role authenticated;

-- ---------------------------------------------------------------------
-- Ce que voit chaque élève
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is((select array_agg(title order by title) from public.my_resources()), array['Résumé maths'],
  'S1 : la ressource publiée de sa matière, ni brouillon, ni autre matière, ni autre centre');
select is((select count(*)::integer from public.learning_resources), 1, 'S1 : lecture directe limitée à la même ressource');
select is((select author_name from public.my_resources()), 'Prof A', 'S1 : nom du professeur affiché');
select is((select count(*)::integer from public.profiles), 0, 'S1 : aucun compte de l''équipe lisible');
select ok(private.can_read_resource_file('c9500000-0000-4000-8000-0000000000a1/f9500000-0000-4000-8000-0000000000a1/r1.pdf'),
  'S1 : fichier de sa ressource');
select ok(not private.can_read_resource_file('c9500000-0000-4000-8000-0000000000a1/f9500000-0000-4000-8000-0000000000a2/r2.pdf'),
  'S1 : fichier d''une autre matière refusé');
select ok(not private.can_read_resource_file('c9500000-0000-4000-8000-0000000000a1/f9500000-0000-4000-8000-0000000000a3/r3.pdf'),
  'S1 : fichier d''un brouillon refusé');
select ok(not private.can_write_resource_file('c9500000-0000-4000-8000-0000000000a1/f9500000-0000-4000-8000-0000000000a1/x.pdf'),
  'S1 : aucune écriture de fichier');
select is(public.my_modules() @> array['lms'], true, 'S1 : modules de son centre (middleware)');

-- Nouveautés : jamais ouverte, ouverte, republiée.
select is((select is_new from public.my_resources()), true, 'nouvelle tant qu''elle n''est pas ouverte');
select lives_ok($$select public.mark_resource_opened('f9500000-0000-4000-8000-0000000000a1')$$, 'S1 : ouvre la ressource');
select lives_ok($$select public.mark_resource_opened('f9500000-0000-4000-8000-0000000000a1')$$, 'S1 : la rouvre');
select is((select is_new from public.my_resources()), false, 'ouverte : plus nouvelle');
select is((select open_count from public.resource_views), 2, 'S1 : ses ouvertures comptées');
select throws_ok($$select public.mark_resource_opened('f9500000-0000-4000-8000-0000000000a2')$$, 'P0002', null,
  'S1 : ressource d''une autre matière introuvable');
select throws_ok($$select public.mark_resource_opened('f9500000-0000-4000-8000-0000000000a3')$$, 'P0002', null,
  'S1 : brouillon introuvable');
select throws_ok($$insert into public.resource_views (student_id, resource_id, center_id)
  values ('59500000-0000-4000-8000-0000000000a1', 'f9500000-0000-4000-8000-0000000000a2', 'c9500000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'S1 : pas d''écriture directe des ouvertures');

set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-0000000000e2","role":"authenticated"}';
select is((select count(*)::integer from public.my_resources()), 2, 'S2 : ses deux matières');
select is((select due_date from public.my_resources() where type = 'exercise'), private.today() + 3, 'S2 : échéance de l''exercice');
select is((select count(*)::integer from public.resource_views), 0, 'S2 : ne voit pas les ouvertures de S1');

set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-0000000000e3","role":"authenticated"}';
select is((select count(*)::integer from public.my_resources()), 0, 'S3 : sans inscription, aucune ressource');

set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-0000000000e4","role":"authenticated"}';
select is((select array_agg(title) from public.my_resources()), array['Résumé C'], 'élève du centre C : seulement son centre');

-- L'auteur voit qui a ouvert ; republiée, elle redevient nouvelle.
set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.resource_views), 1, 'auteur : voit les ouvertures de ses ressources');
-- Une transaction de test garde la même heure : l'ouverture est reculée d'une heure.
reset role;
update public.resource_views set last_opened_at = last_opened_at - interval '1 hour';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.learning_resources set is_published = false where id = 'f9500000-0000-4000-8000-0000000000a1';
update public.learning_resources set is_published = true where id = 'f9500000-0000-4000-8000-0000000000a1';
set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is((select is_new from public.my_resources()), true, 'republiée : redevient nouvelle');

-- Inscription arrêtée, puis accès désactivé : plus rien.
reset role;
update public.enrollments set active = false where student_id = '59500000-0000-4000-8000-0000000000a2' and subject_id = 'e9500000-0000-4000-8000-0000000000a2';
update public.student_accounts set active = false, deactivated_at = now() where student_id = '59500000-0000-4000-8000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-0000000000e2","role":"authenticated"}';
select is((select count(*)::integer from public.my_resources()), 1, 'S2 : matière arrêtée, ressource retirée');
set local request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select throws_ok($$select * from public.my_resources()$$, '42501', null, 'S1 désactivé : espace refusé');

select * from finish();
rollback;
