-- =====================================================================
-- Réinscription (page 8, phase 5) : recouvrement du mois et indicateur de
-- réinscription sur le tableau de bord de l'admin
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values
  ('a6e00000-0000-4000-8000-000000000001', 'admin-q-p85@test.local'),
  ('a6e00000-0000-4000-8000-000000000002', 'accueil-q-p85@test.local'),
  ('a6e00000-0000-4000-8000-000000000004', 'admin-r-p85@test.local'),
  ('a6e00000-0000-4000-8000-000000000009', 'owner-p85@test.local');
insert into public.centers (id, name, slug, auto_reenrollment_enabled) values
  ('c6e00000-0000-4000-8000-0000000000a1', 'Centre Q', 'p85-q', true),
  ('c6e00000-0000-4000-8000-0000000000b1', 'Centre R', 'p85-r', true);
insert into public.profiles (id, center_id, full_name, role) values
  ('a6e00000-0000-4000-8000-000000000001', 'c6e00000-0000-4000-8000-0000000000a1', 'Admin Q', 'admin'),
  ('a6e00000-0000-4000-8000-000000000002', 'c6e00000-0000-4000-8000-0000000000a1', 'Accueil Q', 'assistant'),
  ('a6e00000-0000-4000-8000-000000000004', 'c6e00000-0000-4000-8000-0000000000b1', 'Admin R', 'admin'),
  ('a6e00000-0000-4000-8000-000000000009', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values
  ('d6e00000-0000-4000-8000-0000000000a1', 'c6e00000-0000-4000-8000-0000000000a1', 'Niveau Q'),
  ('d6e00000-0000-4000-8000-0000000000b1', 'c6e00000-0000-4000-8000-0000000000b1', 'Niveau R');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e6e00000-0000-4000-8000-000000000001', 'c6e00000-0000-4000-8000-0000000000a1', 'd6e00000-0000-4000-8000-0000000000a1', 'Maths', 300),
  ('e6e00000-0000-4000-8000-000000000002', 'c6e00000-0000-4000-8000-0000000000a1', 'd6e00000-0000-4000-8000-0000000000a1', 'Anglais', 200),
  ('e6e00000-0000-4000-8000-0000000000b1', 'c6e00000-0000-4000-8000-0000000000b1', 'd6e00000-0000-4000-8000-0000000000b1', 'Maths R', 999);
insert into public.students (id, center_id, full_name, level_id) values
  ('56e00000-0000-4000-8000-000000000001', 'c6e00000-0000-4000-8000-0000000000a1', 'Élève Q', 'd6e00000-0000-4000-8000-0000000000a1'),
  ('56e00000-0000-4000-8000-0000000000b1', 'c6e00000-0000-4000-8000-0000000000b1', 'Élève R', 'd6e00000-0000-4000-8000-0000000000b1');

-- Mois en cours (m) et mois précédent (p), quelle que soit la date du jour.
select set_config('test.m', date_trunc('month', private.today())::date::text, true);
select set_config('test.p', (date_trunc('month', private.today()) - interval '1 month')::date::text, true);

-- Inscriptions commencées il y a trois mois : leur première facture est hors de la fenêtre.
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day) values
  ('66e00000-0000-4000-8000-000000000011', '56e00000-0000-4000-8000-000000000001', 'e6e00000-0000-4000-8000-000000000001',
   (current_setting('test.m')::date - interval '3 months')::date, 1),
  ('66e00000-0000-4000-8000-000000000012', '56e00000-0000-4000-8000-000000000001', 'e6e00000-0000-4000-8000-000000000002',
   (current_setting('test.m')::date - interval '3 months')::date, 1),
  ('66e00000-0000-4000-8000-0000000000b1', '56e00000-0000-4000-8000-0000000000b1', 'e6e00000-0000-4000-8000-0000000000b1',
   (current_setting('test.m')::date - interval '3 months')::date, 1);

-- Mois en cours : maths 300 réglé le 1er, anglais 200 à régler.
-- Mois précédent : 400 réglé le 1er, 100 réglé le 28.
insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_full, amount_due, amount_paid, status, due_date, paid_at) values
  ('66e00000-0000-4000-8000-000000000011', '56e00000-0000-4000-8000-000000000001',
   current_setting('test.m')::date, (current_setting('test.m')::date + interval '1 month' - interval '1 day')::date,
   300, 300, 300, 'paid', current_setting('test.m')::date,
   (current_setting('test.m')::date + time '10:00') at time zone 'Africa/Casablanca'),
  ('66e00000-0000-4000-8000-000000000012', '56e00000-0000-4000-8000-000000000001',
   current_setting('test.m')::date, (current_setting('test.m')::date + interval '1 month' - interval '1 day')::date,
   200, 200, 0, 'pending', current_setting('test.m')::date, null),
  ('66e00000-0000-4000-8000-000000000011', '56e00000-0000-4000-8000-000000000001',
   current_setting('test.p')::date, (current_setting('test.p')::date + interval '1 month' - interval '1 day')::date,
   400, 400, 400, 'paid', current_setting('test.p')::date,
   (current_setting('test.p')::date + time '10:00') at time zone 'Africa/Casablanca'),
  ('66e00000-0000-4000-8000-000000000012', '56e00000-0000-4000-8000-000000000001',
   current_setting('test.p')::date, (current_setting('test.p')::date + interval '1 month' - interval '1 day')::date,
   100, 100, 100, 'paid', current_setting('test.p')::date,
   (current_setting('test.p')::date + 27 + time '10:00') at time zone 'Africa/Casablanca'),
  ('66e00000-0000-4000-8000-0000000000b1', '56e00000-0000-4000-8000-0000000000b1',
   current_setting('test.m')::date, (current_setting('test.m')::date + interval '1 month' - interval '1 day')::date,
   999, 999, 999, 'paid', current_setting('test.m')::date,
   (current_setting('test.m')::date + time '10:00') at time zone 'Africa/Casablanca');

-- ---------------------------------------------------------------------
-- Recouvrement du mois
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6e00000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$select (o ->> 'expected')::numeric, (o ->> 'collected')::numeric, (o ->> 'invoices')::int, (o ->> 'paid_invoices')::int
    from public.admin_collection_overview() as o$$,
  $$values (500.00::numeric, 300.00::numeric, 2, 1)$$,
  'prévisionnel 500, encaissé 300 : reste 200 (60 %)');
select results_eq(
  $$select (o -> 'previous' ->> 'expected')::numeric, (o -> 'previous' ->> 'collected')::numeric,
           (o -> 'previous' ->> 'collected_same_day')::numeric
    from public.admin_collection_overview() as o$$,
  $$select 500.00::numeric, 500.00::numeric,
           400.00 + case when least(extract(day from private.today()),
                                    extract(day from current_setting('test.m')::date - 1)) >= 28 then 100 else 0 end$$,
  'mois précédent : prévisionnel, total encaissé, encaissé au même jour');
select is((select jsonb_array_length(public.admin_collection_overview() -> 'days')),
  extract(day from (current_setting('test.m')::date + interval '1 month' - interval '1 day'))::int,
  'courbe : un point par jour du mois');
select is((select (public.admin_collection_overview() -> 'days' -> (extract(day from private.today())::int - 1) ->> 'current')::numeric),
  300.00::numeric, 'courbe : encaissé cumulé à la date du jour');
select is((select count(*)::int from jsonb_array_elements(public.admin_collection_overview() -> 'days') as d(day)
           where d.day -> 'current' = 'null'::jsonb),
  extract(day from (current_setting('test.m')::date + interval '1 month' - interval '1 day'))::int
    - extract(day from private.today())::int,
  'courbe : rien après aujourd''hui');
select is((select (public.admin_collection_overview() -> 'days' -> 0 ->> 'previous')::numeric), 400.00::numeric,
  'courbe du mois précédent : 400 encaissés dès le 1er');
select is((select (d.day ->> 'previous')::numeric
           from jsonb_array_elements(public.admin_collection_overview() -> 'days') with ordinality as d(day, n)
           order by d.n desc limit 1), 500.00::numeric,
  'courbe du mois précédent bornée à sa longueur : le dernier jour reprend son total');

set local request.jwt.claims = '{"sub":"a6e00000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select (public.admin_collection_overview() ->> 'expected')::numeric), 999.00::numeric,
  'autre centre : seulement ses propres factures');
set local request.jwt.claims = '{"sub":"a6e00000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.admin_collection_overview()$$, '42501', null, 'accueil : pas de recouvrement (finances)');
reset role;
insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a6e00000-0000-4000-8000-000000000009', 'c6e00000-0000-4000-8000-0000000000a1', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6e00000-0000-4000-8000-000000000009","role":"authenticated"}';
select throws_ok($$select public.admin_collection_overview()$$, '42501', null, 'support : pas de données financières');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------
-- Réinscription
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6e00000-0000-4000-8000-000000000004","role":"authenticated"}';
select ok(public.reenrollment_overview() is null, 'sans campagne : pas d''indicateur');
reset role;

select private.generate_billing_run('c6e00000-0000-4000-8000-0000000000a1',
  extract(year from current_setting('test.m')::date + interval '1 month')::smallint,
  extract(month from current_setting('test.m')::date + interval '1 month')::smallint);
select set_config('test.run', (select id::text from public.billing_runs where center_id = 'c6e00000-0000-4000-8000-0000000000a1'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a6e00000-0000-4000-8000-000000000002","role":"authenticated"}';
select results_eq(
  $$select o ->> 'status', (o ->> 'pending')::int from public.reenrollment_overview() as o$$,
  $$values ('draft', 1)$$,
  'brouillon seul : indicateur du brouillon, élève sans décision');
select is((select jsonb_array_length(public.reenrollment_overview() -> 'subjects')), 0,
  'par matière : un élève sans décision n''est compté ni reconduit ni retiré');
set local request.jwt.claims = '{"sub":"a6e00000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.set_reenrollment_intent(current_setting('test.run')::uuid, '56e00000-0000-4000-8000-000000000001', 'confirmed',
  array['66e00000-0000-4000-8000-000000000012']::uuid[]);
select public.confirm_billing_run(current_setting('test.run')::uuid);
reset role;
-- Brouillon du mois d'après : l'indicateur reste sur la campagne confirmée.
select private.generate_billing_run('c6e00000-0000-4000-8000-0000000000a1',
  extract(year from current_setting('test.m')::date + interval '2 months')::smallint,
  extract(month from current_setting('test.m')::date + interval '2 months')::smallint);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a6e00000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$select o ->> 'run_id', o ->> 'status', (o ->> 'confirmed')::int, (o ->> 'dropped')::int, (o ->> 'subjects_removed')::int
    from public.reenrollment_overview() as o$$,
  $$values (current_setting('test.run'), 'confirmed', 1, 0, 1)$$,
  'dernière campagne confirmée, plutôt que le brouillon suivant');
select results_eq(
  $$select s ->> 'name', (s ->> 'kept')::int, (s ->> 'dropped')::int
    from jsonb_array_elements(public.reenrollment_overview() -> 'subjects') as x(s)$$,
  $$values ('Anglais', 0, 1), ('Maths', 1, 0)$$,
  'par matière : reconduits et retraits, les retraits d''abord');
reset role;
select set_config('request.jwt.claims', '{"sub":"a6e00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role anon;
select throws_ok($$select public.reenrollment_overview()$$, '42501', null, 'anonyme : refusé');
reset role;
select set_config('request.jwt.claims', '', true);
select ok(not has_function_privilege('anon', 'public.admin_collection_overview()', 'execute'),
  'anonyme : aucune exécution du recouvrement');

select * from finish();
rollback;
