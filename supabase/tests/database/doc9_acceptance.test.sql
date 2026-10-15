-- =====================================================================
-- Page 9, phase 6 : tests d'acceptation transverses
--
--  1. Isolation par module : chaque table d'un module porte sa RLS
--     restrictive (center_has_module du bon module) ; chaque ressource
--     d'un module (table, vue, fonction) est refusée par l'API quand le
--     module est coupé, et acceptée quand il est actif.
--  2. Blocage serveur : un module coupé masque ses données sans les
--     supprimer ; le socle reste accessible.
--  3. Cloisonnement de l'élève : sur TOUTES les tables et vues publiques,
--     un élève ne lit que son accès, les ressources publiées de ses
--     matières et ses ouvertures — rien d'autre, d'aucun centre.
--  4. Traçabilité des absences : chaque présence saisie (professeur,
--     accueil) garde son auteur, son rôle, son heure et son historique.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values
  ('a9600000-0000-4000-8000-000000000001', 'admin-a-p96@test.local'),
  ('a9600000-0000-4000-8000-000000000002', 'accueil-a-p96@test.local'),
  ('a9600000-0000-4000-8000-000000000003', 'prof-a-p96@test.local'),
  ('a9600000-0000-4000-8000-0000000000e1', 'eleve-p96aaaa1@eleves.centromanager.invalid');
insert into public.centers (id, name, slug, plan_key) values
  ('c9600000-0000-4000-8000-0000000000a1', 'Centre A', 'p96-a', 'premium');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9600000-0000-4000-8000-000000000001', 'c9600000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a9600000-0000-4000-8000-000000000002', 'c9600000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant'),
  ('a9600000-0000-4000-8000-000000000003', 'c9600000-0000-4000-8000-0000000000a1', 'Prof A', 'teacher');
insert into public.levels (id, center_id, name)
values ('d9600000-0000-4000-8000-0000000000a1', 'c9600000-0000-4000-8000-0000000000a1', 'Niveau A');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e9600000-0000-4000-8000-0000000000a1', 'c9600000-0000-4000-8000-0000000000a1', 'd9600000-0000-4000-8000-0000000000a1', 'Maths', 300),
  ('e9600000-0000-4000-8000-0000000000a2', 'c9600000-0000-4000-8000-0000000000a1', 'd9600000-0000-4000-8000-0000000000a1', 'Physique', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a9600000-0000-4000-8000-000000000003', 'e9600000-0000-4000-8000-0000000000a1', 'd9600000-0000-4000-8000-0000000000a1'),
  ('a9600000-0000-4000-8000-000000000003', 'e9600000-0000-4000-8000-0000000000a2', 'd9600000-0000-4000-8000-0000000000a1');
insert into public.schedule_slots (id, center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room) values
  ('f9600000-0000-4000-8000-0000000000a1', 'c9600000-0000-4000-8000-0000000000a1', 'e9600000-0000-4000-8000-0000000000a1',
   'd9600000-0000-4000-8000-0000000000a1', 'a9600000-0000-4000-8000-000000000003',
   extract(dow from private.today())::smallint, '10:00', '12:00', 'Salle 1');
-- Deux élèves de A : l'élève connecté (maths) et un camarade (maths et physique).
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('59600000-0000-4000-8000-0000000000a1', 'c9600000-0000-4000-8000-0000000000a1', 'Élève connecté', 'd9600000-0000-4000-8000-0000000000a1', '0600000001'),
  ('59600000-0000-4000-8000-0000000000a2', 'c9600000-0000-4000-8000-0000000000a1', 'Camarade', 'd9600000-0000-4000-8000-0000000000a1', '0600000002');
insert into public.enrollments (student_id, subject_id, start_date, billing_day) values
  ('59600000-0000-4000-8000-0000000000a1', 'e9600000-0000-4000-8000-0000000000a1', private.today() - 20, 1),
  ('59600000-0000-4000-8000-0000000000a2', 'e9600000-0000-4000-8000-0000000000a1', private.today() - 20, 1),
  ('59600000-0000-4000-8000-0000000000a2', 'e9600000-0000-4000-8000-0000000000a2', private.today() - 20, 1);
insert into public.follow_ups (student_id, type, channel, note) values
  ('59600000-0000-4000-8000-0000000000a1', 'absence', 'phone', 'Note privée sur l''élève');
insert into public.student_accounts (user_id, student_id, center_id, login_code)
values ('a9600000-0000-4000-8000-0000000000e1', '59600000-0000-4000-8000-0000000000a1', 'c9600000-0000-4000-8000-0000000000a1', 'P96AAAA1');
insert into public.learning_resources (id, center_id, subject_id, level_id, author_id, type, title, file_url, is_published) values
  ('79600000-0000-4000-8000-0000000000a1', 'c9600000-0000-4000-8000-0000000000a1', 'e9600000-0000-4000-8000-0000000000a1',
   'd9600000-0000-4000-8000-0000000000a1', 'a9600000-0000-4000-8000-000000000003', 'summary', 'Maths publiée', 'c9600000-0000-4000-8000-0000000000a1/79600000-0000-4000-8000-0000000000a1/a.pdf', true),
  ('79600000-0000-4000-8000-0000000000a2', 'c9600000-0000-4000-8000-0000000000a1', 'e9600000-0000-4000-8000-0000000000a1',
   'd9600000-0000-4000-8000-0000000000a1', 'a9600000-0000-4000-8000-000000000003', 'summary', 'Maths brouillon', 'c9600000-0000-4000-8000-0000000000a1/79600000-0000-4000-8000-0000000000a2/b.pdf', false),
  ('79600000-0000-4000-8000-0000000000a3', 'c9600000-0000-4000-8000-0000000000a1', 'e9600000-0000-4000-8000-0000000000a2',
   'd9600000-0000-4000-8000-0000000000a1', 'a9600000-0000-4000-8000-000000000003', 'summary', 'Physique publiée', 'c9600000-0000-4000-8000-0000000000a1/79600000-0000-4000-8000-0000000000a3/c.pdf', true);
insert into public.resource_views (student_id, resource_id, center_id) values
  ('59600000-0000-4000-8000-0000000000a1', '79600000-0000-4000-8000-0000000000a1', 'c9600000-0000-4000-8000-0000000000a1'),
  ('59600000-0000-4000-8000-0000000000a2', '79600000-0000-4000-8000-0000000000a1', 'c9600000-0000-4000-8000-0000000000a1');

-- Lignes visibles de chaque table et vue publique pour le rôle courant
-- (« refus » : aucun droit de lecture).
create function pg_temp.visible_rows() returns table (relation text, visible text) language plpgsql as $$
declare
  r record;
  n bigint;
begin
  for r in
    select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind in ('r', 'v') order by 1
  loop
    begin
      execute format('select count(*) from public.%I', r.relname) into n;
      relation := r.relname; visible := n::text;
    exception when insufficient_privilege then
      relation := r.relname; visible := 'refus';
    end;
    return next;
  end loop;
end;
$$;

-- Ressources de modules (copie lisible par le rôle des comptes pendant le test).
create temp table mod_res as select name, kind, module_key from private.module_resources;
grant select on mod_res to authenticated;

-- Ressources de modules refusées par l'API pour le centre du compte courant.
create function pg_temp.blocked_resources(p_module text) returns integer language plpgsql as $$
declare
  r record;
  v_blocked integer := 0;
begin
  for r in select m.name, m.kind from mod_res m where m.module_key = p_module loop
    perform set_config('request.path', case when r.kind = 'function' then '/rpc/' else '/' end || r.name, true);
    begin
      perform api_guard.check_module_request();
    exception when insufficient_privilege then
      v_blocked := v_blocked + 1;
    end;
  end loop;
  perform set_config('request.path', '', true);
  return v_blocked;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Isolation par module (structure)
-- ---------------------------------------------------------------------
select is(
  (select count(*)::integer from private.module_resources m
   where m.kind = 'table'
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = m.name and p.permissive = 'RESTRICTIVE'
         and p.qual like '%center_has_module(center_id, ''' || m.module_key || '''%'
     )),
  0, 'chaque table d''un module porte sa RLS restrictive sur le bon module');
select is(
  (select count(*)::integer from private.module_resources m
   where m.kind = 'table' and not exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tablename = m.name)
      or m.kind = 'view' and not exists (select 1 from pg_views v where v.schemaname = 'public' and v.viewname = m.name)
      or m.kind = 'function' and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                             where n.nspname = 'public' and p.proname = m.name)),
  0, 'chaque ressource déclarée d''un module existe (pas de faute de nom)');
select is(
  (select count(*)::integer from pg_tables t
   where t.schemaname = 'public' and t.tablename in ('learning_resources', 'resource_views', 'receipts', 'payroll_lines', 'billing_runs', 'absence_notifications', 'center_branding')
     and t.tablename not in (select name from private.module_resources)),
  0, 'les tables des modules sont toutes déclarées');

-- ---------------------------------------------------------------------
-- 2. Blocage serveur d'un module coupé, socle intact
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9600000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(pg_temp.blocked_resources('finance') + pg_temp.blocked_resources('lms'), 0, 'modules actifs : aucune ressource refusée');
reset role;
select set_config('centromanager.platform_action', 'on', true);
update public.center_modules set is_enabled = false, source = 'manual'
where center_id = 'c9600000-0000-4000-8000-0000000000a1' and module_key in ('finance', 'reenrollment', 'absence_tracking', 'lms');
select set_config('centromanager.platform_action', '', true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9600000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  pg_temp.blocked_resources('finance') + pg_temp.blocked_resources('reenrollment')
    + pg_temp.blocked_resources('absence_tracking') + pg_temp.blocked_resources('lms'),
  (select count(*)::integer from mod_res where module_key in ('finance', 'reenrollment', 'absence_tracking', 'lms')),
  'modules coupés : toutes leurs tables, vues et fonctions refusées par l''API');
select is((select count(*)::integer from public.learning_resources), 0, 'module coupé : ressources masquées à l''admin');
select is((select count(*)::integer from public.receipts), 0, 'module coupé : reçus masqués');
select is((select count(*)::integer from public.students), 2, 'socle : élèves toujours lisibles');
set local request.jwt.claims = '{"sub":"a9600000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('request.path', '/rpc/mark_session_attendance', true);
select lives_ok($$select api_guard.check_module_request()$$, 'socle : appel par l''accueil toujours accepté par l''API');
select set_config('request.path', '', true);
reset role;
select is((select count(*)::integer from public.learning_resources where center_id = 'c9600000-0000-4000-8000-0000000000a1'), 3,
  'module coupé : aucune donnée supprimée');
select set_config('centromanager.platform_action', 'on', true);
update public.center_modules set is_enabled = true, source = 'plan'
where center_id = 'c9600000-0000-4000-8000-0000000000a1' and module_key in ('finance', 'reenrollment', 'absence_tracking', 'lms');
select set_config('centromanager.platform_action', '', true);

-- ---------------------------------------------------------------------
-- 3. Cloisonnement de l'élève, sur toutes les tables et vues
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9600000-0000-4000-8000-0000000000e1","role":"authenticated"}';
create temp table student_view as select * from pg_temp.visible_rows();
reset role;
select is(
  -- center_types : catalogue commun des types d'établissement (libellés), sans donnée de centre.
  (select array_agg(relation || '=' || visible order by relation) from student_view
   where visible not in ('0', 'refus') and relation <> 'center_types'),
  array['learning_resources=1', 'resource_views=1', 'student_accounts=1'],
  'élève : sur toutes les tables et vues, seulement son accès, la ressource publiée de sa matière et son ouverture');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9600000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is((select title from public.learning_resources), 'Maths publiée', 'élève : ni brouillon ni matière où il n''est pas inscrit');
select is((select student_id from public.resource_views), '59600000-0000-4000-8000-0000000000a1'::uuid, 'élève : ses ouvertures, pas celles du camarade');
select throws_ok($$select * from public.staff_day_sessions(private.today())$$, '42501', null, 'élève : fonctions de l''équipe refusées');
reset role;

-- ---------------------------------------------------------------------
-- 4. Traçabilité des absences : professeur puis accueil
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9600000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
values ('59600000-0000-4000-8000-0000000000a1', 'e9600000-0000-4000-8000-0000000000a1', 'a9600000-0000-4000-8000-000000000003', private.today(), 'absent');
set local request.jwt.claims = '{"sub":"a9600000-0000-4000-8000-000000000002","role":"authenticated"}';
select public.mark_session_attendance('f9600000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59600000-0000-4000-8000-0000000000a1","status":"present"},
    {"student_id":"59600000-0000-4000-8000-0000000000a2","status":"absent"}]');
reset role;
select is(
  (select count(*)::integer from public.attendance a
   join public.students st on st.id = a.student_id and st.center_id = 'c9600000-0000-4000-8000-0000000000a1'
   where a.marked_by is null or a.marked_by_role is null or a.marked_at is null),
  0, 'chaque présence saisie garde son auteur, son rôle et son heure');
select is(
  (select string_agg(e.marked_by_role || ':' || e.status, ' > ' order by e.id)
   from public.attendance_entries e join public.attendance a on a.id = e.attendance_id
   where a.student_id = '59600000-0000-4000-8000-0000000000a1'),
  'teacher:absent > assistant:present', 'historique : saisie du professeur puis de l''accueil');
select is(
  (select count(*)::integer from public.attendance_conflicts c where c.center_id = 'c9600000-0000-4000-8000-0000000000a1' and c.resolved_at is null),
  1, 'désaccord professeur / accueil signalé à l''admin');

select * from finish();
rollback;
