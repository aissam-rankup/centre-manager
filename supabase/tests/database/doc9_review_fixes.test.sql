-- =====================================================================
-- Page 9, phase 6 : non-régression des constats de la revue de sécurité
--  1. Fonction pre-request : exécutable par anon et service_role (l'API
--     publique et la clé serveur fonctionnent), nom encodé non contournable.
--  2. Ressources : fichier hors du dossier de la ressource refusé ; date de
--     publication non modifiable à la main.
--  3. Désaccord d'appel : une re-saisie du même côté ne le clôt pas.
--  4. Historique des saisies : un compte supprimé s'efface de l'auteur sans
--     bloquer la suppression.
--  5. Accès élève : seul le compte technique de son code se rattache.
--  6. Alertes de séries d'absences : masquées sans le module.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email) values
  ('a9700000-0000-4000-8000-000000000001', 'admin-a-p97@test.local'),
  ('a9700000-0000-4000-8000-000000000002', 'accueil-a-p97@test.local'),
  ('a9700000-0000-4000-8000-000000000003', 'prof-a-p97@test.local'),
  ('a9700000-0000-4000-8000-000000000004', 'accueil2-a-p97@test.local'),
  ('a9700000-0000-4000-8000-0000000000e1', 'quelquun@exemple.test'),
  ('a9700000-0000-4000-8000-0000000000e2', 'eleve-p97good1@eleves.centromanager.invalid');
insert into public.centers (id, name, slug, plan_key) values
  ('c9700000-0000-4000-8000-0000000000a1', 'Centre A', 'p97-a', 'premium'),
  ('c9700000-0000-4000-8000-0000000000c1', 'Centre C', 'p97-c', 'premium');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9700000-0000-4000-8000-000000000001', 'c9700000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a9700000-0000-4000-8000-000000000002', 'c9700000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant'),
  ('a9700000-0000-4000-8000-000000000003', 'c9700000-0000-4000-8000-0000000000a1', 'Prof A', 'teacher'),
  ('a9700000-0000-4000-8000-000000000004', 'c9700000-0000-4000-8000-0000000000a1', 'Accueil A2', 'assistant');
insert into public.levels (id, center_id, name)
values ('d9700000-0000-4000-8000-0000000000a1', 'c9700000-0000-4000-8000-0000000000a1', 'Niveau A');
insert into public.subjects (id, center_id, level_id, name, monthly_price)
values ('e9700000-0000-4000-8000-0000000000a1', 'c9700000-0000-4000-8000-0000000000a1', 'd9700000-0000-4000-8000-0000000000a1', 'Maths', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id)
values ('a9700000-0000-4000-8000-000000000003', 'e9700000-0000-4000-8000-0000000000a1', 'd9700000-0000-4000-8000-0000000000a1');
insert into public.schedule_slots (id, center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room)
values ('f9700000-0000-4000-8000-0000000000a1', 'c9700000-0000-4000-8000-0000000000a1', 'e9700000-0000-4000-8000-0000000000a1',
        'd9700000-0000-4000-8000-0000000000a1', 'a9700000-0000-4000-8000-000000000003',
        extract(dow from private.today())::smallint, '10:00', '12:00', 'Salle 1');
insert into public.students (id, center_id, full_name, level_id) values
  ('59700000-0000-4000-8000-0000000000a1', 'c9700000-0000-4000-8000-0000000000a1', 'Élève 1', 'd9700000-0000-4000-8000-0000000000a1'),
  ('59700000-0000-4000-8000-0000000000a2', 'c9700000-0000-4000-8000-0000000000a1', 'Élève 2', 'd9700000-0000-4000-8000-0000000000a1');
insert into public.enrollments (student_id, subject_id, start_date, billing_day) values
  ('59700000-0000-4000-8000-0000000000a1', 'e9700000-0000-4000-8000-0000000000a1', private.today() - 20, 1),
  ('59700000-0000-4000-8000-0000000000a2', 'e9700000-0000-4000-8000-0000000000a1', private.today() - 20, 1);
insert into public.alerts (student_id, type, payload) values
  ('59700000-0000-4000-8000-0000000000a1', 'consecutive_absences', '{"count": 3}'),
  ('59700000-0000-4000-8000-0000000000a1', 'overdue_payment', '{}');

create function pg_temp.open_conflicts() returns integer language sql security definer as
$$ select count(*)::integer from public.attendance_conflicts where center_id = 'c9700000-0000-4000-8000-0000000000a1' and resolved_at is null $$;

-- ---------------------------------------------------------------------
-- 1. Fonction pre-request
-- ---------------------------------------------------------------------
select ok(has_schema_privilege('anon', 'api_guard', 'usage'), 'anon : accès au schéma de la fonction pre-request');
select ok(has_function_privilege('anon', 'api_guard.check_module_request()', 'execute'), 'anon : exécute la fonction pre-request');
select ok(has_function_privilege('service_role', 'api_guard.check_module_request()', 'execute'), 'service_role : exécute la fonction pre-request');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon : schéma private toujours fermé');

set local role anon;
select set_config('request.path', '/rpc/center_for_host', true);
select lives_ok($$select api_guard.check_module_request()$$, 'requête anonyme acceptée (connexion à la marque du centre)');
reset role;
set local role service_role;
select set_config('request.path', '/centers', true);
select lives_ok($$select api_guard.check_module_request()$$, 'requête service_role acceptée');
reset role;

select set_config('centromanager.platform_action', 'on', true);
update public.center_modules set is_enabled = false, source = 'manual'
where center_id = 'c9700000-0000-4000-8000-0000000000a1' and module_key in ('finance', 'absence_tracking');
select set_config('centromanager.platform_action', '', true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9700000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('request.path', '/rpc/payroll%5Frefresh', true);
select throws_ok($$select api_guard.check_module_request()$$, '42501', null, 'nom encodé (%5F) : refusé comme le nom en clair');
select set_config('request.path', '//rpc//payroll_refresh', true);
select throws_ok($$select api_guard.check_module_request()$$, '42501', null, 'barres doublées : refusé');
select set_config('request.path', '/%72eceipts', true);
select throws_ok($$select api_guard.check_module_request()$$, '42501', null, 'table au nom encodé : refusée');
select set_config('request.path', '', true);

-- ---------------------------------------------------------------------
-- 6. Alertes de séries d'absences : masquées sans le module
-- ---------------------------------------------------------------------
select is((select array_agg(type::text) from public.alerts), array['overdue_payment'],
  'sans Suivi des absences : séries masquées, retards de paiement visibles');
reset role;
select set_config('centromanager.platform_action', 'on', true);
update public.center_modules set is_enabled = true, source = 'plan'
where center_id = 'c9700000-0000-4000-8000-0000000000a1' and module_key in ('finance', 'absence_tracking');
select set_config('centromanager.platform_action', '', true);

-- ---------------------------------------------------------------------
-- 2. Ressources : dossier du fichier, date de publication
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9700000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.learning_resources (id, center_id, subject_id, level_id, type, title, file_url, is_published)
values ('79700000-0000-4000-8000-0000000000a1', 'c9700000-0000-4000-8000-0000000000a1', 'e9700000-0000-4000-8000-0000000000a1',
        'd9700000-0000-4000-8000-0000000000a1', 'summary', 'Résumé',
        'c9700000-0000-4000-8000-0000000000a1/79700000-0000-4000-8000-0000000000a1/r.pdf', true);
select throws_ok($$update public.learning_resources
  set file_url = 'c9700000-0000-4000-8000-0000000000c1/79700000-0000-4000-8000-0000000000c9/autre.pdf'
  where id = '79700000-0000-4000-8000-0000000000a1'$$, '23514', null, 'fichier d''un autre dossier (autre centre) refusé');
select set_config('test.published_at', (select published_at::text from public.learning_resources), true);
update public.learning_resources set published_at = '2099-01-01' where id = '79700000-0000-4000-8000-0000000000a1';
select is((select published_at::text from public.learning_resources), current_setting('test.published_at'),
  'date de publication : non modifiable à la main');

-- ---------------------------------------------------------------------
-- 3. Désaccord : une re-saisie du même côté ne le clôt pas
-- ---------------------------------------------------------------------
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
values ('59700000-0000-4000-8000-0000000000a1', 'e9700000-0000-4000-8000-0000000000a1', 'a9700000-0000-4000-8000-000000000003', private.today(), 'absent');
set local request.jwt.claims = '{"sub":"a9700000-0000-4000-8000-000000000002","role":"authenticated"}';
select public.mark_session_attendance('f9700000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59700000-0000-4000-8000-0000000000a1","status":"present"},{"student_id":"59700000-0000-4000-8000-0000000000a2","status":"present"}]');
select is(pg_temp.open_conflicts(), 1, 'désaccord ouvert');
set local request.jwt.claims = '{"sub":"a9700000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.mark_session_attendance('f9700000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59700000-0000-4000-8000-0000000000a1","status":"present"},{"student_id":"59700000-0000-4000-8000-0000000000a2","status":"present"}]');
select is(pg_temp.open_conflicts(), 1, 'admin qui ré-enregistre l''appel : le désaccord reste ouvert');
set local request.jwt.claims = '{"sub":"a9700000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.mark_session_attendance('f9700000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59700000-0000-4000-8000-0000000000a1","status":"present"}]');
select is(pg_temp.open_conflicts(), 1, 'autre accueil : le désaccord reste ouvert');
set local request.jwt.claims = '{"sub":"a9700000-0000-4000-8000-000000000003","role":"authenticated"}';
update public.attendance set status = 'present'
where student_id = '59700000-0000-4000-8000-0000000000a1' and session_date = private.today();
select is(pg_temp.open_conflicts(), 0, 'le professeur confirme : désaccord clos');
reset role;
select is((select resolution from public.attendance_conflicts where center_id = 'c9700000-0000-4000-8000-0000000000a1'), 'agreed',
  'clos comme « saisies rejointes »');

-- ---------------------------------------------------------------------
-- 4. Compte supprimé : l'historique garde la saisie, sans son auteur
-- ---------------------------------------------------------------------
select lives_ok($$delete from public.profiles where id = 'a9700000-0000-4000-8000-000000000004'$$,
  'suppression d''un compte qui a saisi des présences');
select is((select count(*)::integer from public.attendance_entries e
           join public.attendance a on a.id = e.attendance_id
           where a.student_id = '59700000-0000-4000-8000-0000000000a1' and e.marked_by is null and e.marked_by_role = 'assistant'), 0,
  'les saisies des autres comptes gardent leur auteur');
select throws_ok($$update public.attendance_entries set status = 'absent'$$, '42501', null, 'historique toujours en ajout seul');

-- ---------------------------------------------------------------------
-- 5. Accès élève : compte technique du code uniquement
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9700000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.register_student_account('59700000-0000-4000-8000-0000000000a1',
  'a9700000-0000-4000-8000-0000000000e1', 'P97GOOD1')$$, '22023', null, 'compte quelconque refusé');
select lives_ok($$select public.register_student_account('59700000-0000-4000-8000-0000000000a1',
  'a9700000-0000-4000-8000-0000000000e2', 'P97GOOD1')$$, 'compte technique du code accepté');

select * from finish();
rollback;
