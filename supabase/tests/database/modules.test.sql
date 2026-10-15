-- =====================================================================
-- Modules activables et packs (page 9, phase 1) : catalogue, application
-- du pack, décisions à l'unité, journal, accès réservé au super-admin,
-- blocage serveur d'un module coupé (RLS restrictive, pre-request de
-- l'API, encaissement sans caisse, réinscription, marque blanche),
-- données conservées. Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

insert into auth.users (id, email) values
  ('a9100000-0000-4000-8000-000000000001', 'owner-p91@test.local'),
  ('a9100000-0000-4000-8000-000000000002', 'admin-a-p91@test.local'),
  ('a9100000-0000-4000-8000-000000000003', 'accueil-a-p91@test.local'),
  ('a9100000-0000-4000-8000-000000000004', 'admin-b-p91@test.local');
insert into public.centers (id, name, slug, plan_key) values
  ('c9100000-0000-4000-8000-0000000000a1', 'Centre A', 'p91-a', 'starter'),
  ('c9100000-0000-4000-8000-0000000000b1', 'Centre B', 'p91-b', 'premium');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9100000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin'),
  ('a9100000-0000-4000-8000-000000000002', 'c9100000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a9100000-0000-4000-8000-000000000003', 'c9100000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant'),
  ('a9100000-0000-4000-8000-000000000004', 'c9100000-0000-4000-8000-0000000000b1', 'Admin B', 'admin');
insert into public.center_branding (center_id, brand_name, primary_color)
values ('c9100000-0000-4000-8000-0000000000b1', 'Marque B', '#0f766e');
insert into public.levels (id, center_id, name)
values ('d9100000-0000-4000-8000-0000000000a1', 'c9100000-0000-4000-8000-0000000000a1', 'Niveau A');
insert into public.subjects (id, center_id, level_id, name, monthly_price)
values ('e9100000-0000-4000-8000-0000000000a1', 'c9100000-0000-4000-8000-0000000000a1', 'd9100000-0000-4000-8000-0000000000a1', 'Maths', 300);
insert into public.students (id, center_id, full_name, level_id)
values ('59100000-0000-4000-8000-0000000000a1', 'c9100000-0000-4000-8000-0000000000a1', 'Élève A', 'd9100000-0000-4000-8000-0000000000a1');
insert into public.enrollments (student_id, subject_id, start_date, billing_day)
values ('59100000-0000-4000-8000-0000000000a1', 'e9100000-0000-4000-8000-0000000000a1', private.today() - 5, 1);

create function pg_temp.module_state(p_center uuid, p_module text) returns text language sql security definer as
$$ select is_enabled::text || ' ' || source::text from public.center_modules where center_id = p_center and module_key = p_module $$;
create function pg_temp.module_keys(p_center uuid) returns text[] language sql security definer as
$$ select private.center_module_keys(p_center) $$;
create function pg_temp.events(p_center uuid, p_action text) returns integer language sql security definer as
$$ select count(*)::integer from public.platform_events where center_id = p_center and action = p_action $$;

-- ---------------------------------------------------------------------
-- Catalogue et application du pack
-- ---------------------------------------------------------------------
select is((select count(*)::integer from public.modules), 5, 'catalogue : cinq modules');
select is((select array_agg(module_key order by module_key) from public.plan_modules where plan_key = 'starter'),
  array['absence_tracking', 'finance', 'reenrollment'], 'Débutant : finance, réinscription, suivi des absences');
select is((select array_agg(module_key order by module_key) from public.plan_modules where plan_key = 'premium'),
  array['absence_tracking', 'finance', 'lms', 'reenrollment', 'white_label'], 'Premium : Débutant, marque blanche et plateforme pédagogique');
select is(private.center_module_keys('c9100000-0000-4000-8000-0000000000a1'),
  array['finance', 'reenrollment', 'absence_tracking'], 'nouveau centre Débutant : modules du pack actifs');
select is(private.center_module_keys('c9100000-0000-4000-8000-0000000000b1'),
  array['finance', 'reenrollment', 'absence_tracking', 'white_label', 'lms'], 'nouveau centre Premium : tous les modules');
select is((select count(*)::integer from public.center_modules where center_id = 'c9100000-0000-4000-8000-0000000000a1'), 5,
  'une ligne par module du catalogue, active ou non');
select ok(private.center_has_module('c9100000-0000-4000-8000-0000000000a1', 'finance'), 'center_has_module : module du pack');
select ok(not private.center_has_module('c9100000-0000-4000-8000-0000000000a1', 'white_label'), 'center_has_module : module hors pack');

-- ---------------------------------------------------------------------
-- Comptes du centre : lecture de leurs modules, aucune écriture
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select * from public.center_modules$$, '42501', null, 'admin : pas d''accès direct à center_modules');
select throws_ok($$select * from public.plans$$, '42501', null, 'admin : pas d''accès direct au catalogue');
select is(public.my_modules(), array['finance', 'reenrollment', 'absence_tracking'], 'admin : modules actifs de son centre');
select is((select plan_key || ' ' || array_length(modules, 1) from public.my_center_access()), 'starter 3',
  'accès du compte : pack et modules à la place de la formule');
select throws_ok($$select public.platform_set_center_module('c9100000-0000-4000-8000-0000000000a1', 'white_label', true)$$,
  '42501', null, 'admin : ne s''active pas un module');
select throws_ok($$select public.platform_update_plan('premium', 'Premium', '', 0)$$, '42501', null, 'admin : ne modifie pas le catalogue');
select throws_ok($$select * from public.platform_plans()$$, '42501', null, 'admin : catalogue de la console refusé');
select throws_ok($$update public.centers set plan_key = 'premium' where id = 'c9100000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'admin : ne change pas son propre pack');
reset role;

-- ---------------------------------------------------------------------
-- Super-admin : modules à l'unité, essai, retour au pack
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.platform_set_center_module('c9100000-0000-4000-8000-0000000000a1', 'finance', false)$$,
  'super-admin : coupe un module du pack');
select is(pg_temp.module_state('c9100000-0000-4000-8000-0000000000a1', 'finance'), 'false manual', 'module coupé à l''unité');
select lives_ok($$select public.platform_set_center_module('c9100000-0000-4000-8000-0000000000a1', 'white_label', true, true)$$,
  'super-admin : active un module hors pack à l''essai');
select is(pg_temp.module_state('c9100000-0000-4000-8000-0000000000a1', 'white_label'), 'true trial', 'module à l''essai');
select lives_ok($$select public.platform_set_center_module('c9100000-0000-4000-8000-0000000000a1', 'finance', true)$$,
  'super-admin : réactive le module');
select is(pg_temp.module_state('c9100000-0000-4000-8000-0000000000a1', 'finance'), 'true plan',
  'décision revenue à ce que dit le pack : redevient « plan »');
select throws_ok($$select public.platform_set_center_module('c9100000-0000-4000-8000-0000000000a1', 'inconnu', true)$$,
  'P0002', null, 'module inconnu refusé');

-- Changement de pack : les modules « plan » suivent, les décisions à l'unité restent.
select lives_ok($$select public.platform_set_pricing('c9100000-0000-4000-8000-0000000000a1', 'premium', 300, 'month', 5::smallint)$$,
  'super-admin : passe le centre en Premium');
select is(pg_temp.module_keys('c9100000-0000-4000-8000-0000000000a1'),
  array['finance', 'reenrollment', 'absence_tracking', 'white_label', 'lms'], 'Premium : tous les modules actifs');
select is(pg_temp.module_state('c9100000-0000-4000-8000-0000000000a1', 'white_label'), 'true plan',
  'essai couvert par le nouveau pack : redevient « plan »');
select lives_ok($$select public.platform_set_center_module('c9100000-0000-4000-8000-0000000000a1', 'lms', false)$$,
  'super-admin : coupe la plateforme pédagogique malgré le pack');
select lives_ok($$select public.platform_set_pricing('c9100000-0000-4000-8000-0000000000a1', 'starter', 300, 'month', 5::smallint)$$,
  'super-admin : repasse le centre en Débutant');
select is(pg_temp.module_state('c9100000-0000-4000-8000-0000000000a1', 'white_label'), 'false plan', 'Débutant : marque blanche coupée');
select is(pg_temp.module_state('c9100000-0000-4000-8000-0000000000a1', 'lms'), 'false plan',
  'décision à l''unité devenue celle du pack : redevient « plan »');
select throws_ok($$select public.platform_set_pricing('c9100000-0000-4000-8000-0000000000a1', 'gold', 300, 'month', 5::smallint)$$,
  '22023', null, 'pack inconnu refusé');
select lives_ok($$select public.platform_update_plan('premium', 'Premium', 'Tout compris', 900)$$, 'super-admin : prix catalogue');
select is((select monthly_price from public.platform_plans() where key = 'premium'), 900.00::numeric, 'prix catalogue enregistré');
select throws_ok($$select public.platform_update_plan('premium', 'Premium', '', -1)$$, '22023', null, 'prix négatif refusé');
reset role;
select is(pg_temp.events('c9100000-0000-4000-8000-0000000000a1', 'center.plan_changed'), 2, 'changements de pack journalisés');
select is(pg_temp.events('c9100000-0000-4000-8000-0000000000a1', 'center.module_disabled'), 2, 'coupures à l''unité journalisées');

-- ---------------------------------------------------------------------
-- Finance coupée : encaissement sans caisse, données masquées, API bloquée
-- ---------------------------------------------------------------------
select lives_ok($$
  select set_config('centromanager.platform_action', 'on', true);
  update public.center_modules set is_enabled = false, source = 'manual'
  where center_id = 'c9100000-0000-4000-8000-0000000000a1' and module_key = 'finance'
$$, 'Finance coupée pour le centre A');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select cash_session_id from public.record_payment('59100000-0000-4000-8000-0000000000a1',
  array[(select id from public.invoices where student_id = '59100000-0000-4000-8000-0000000000a1' and status <> 'paid' limit 1)], 'cash')),
  null, 'sans Finance : l''encaissement passe, sans caisse du jour');
select is((select count(*)::integer from public.receipts), 0, 'sans Finance : reçus masqués (RLS restrictive)');
select is((select count(*)::integer from public.students), 1, 'socle : élèves toujours visibles');

select set_config('request.path', '/rpc/open_cash_session', true);
select throws_ok($$select api_guard.check_module_request()$$, '42501', null, 'API : fonction d''un module coupé refusée');
select set_config('request.path', '/receipts', true);
select throws_ok($$select api_guard.check_module_request()$$, '42501', null, 'API : table d''un module coupé refusée');
select set_config('request.path', '/rpc/record_payment', true);
select lives_ok($$select api_guard.check_module_request()$$, 'API : fonction du socle acceptée');
select set_config('request.path', '/students', true);
select lives_ok($$select api_guard.check_module_request()$$, 'API : table du socle acceptée');
set local request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000004","role":"authenticated"}';
select set_config('request.path', '/rpc/open_cash_session', true);
select lives_ok($$select api_guard.check_module_request()$$, 'API : module actif d''un autre centre accepté');
select set_config('request.path', '', true);
reset role;
select is((select count(*)::integer from public.receipts where center_id = 'c9100000-0000-4000-8000-0000000000a1'), 1,
  'module coupé : aucune donnée supprimée');

-- ---------------------------------------------------------------------
-- Réinscription : le réglage suit le module
-- ---------------------------------------------------------------------
update public.centers set auto_reenrollment_enabled = true where id = 'c9100000-0000-4000-8000-0000000000a1';
select lives_ok($$
  select set_config('centromanager.platform_action', 'on', true);
  update public.center_modules set is_enabled = false, source = 'manual'
  where center_id = 'c9100000-0000-4000-8000-0000000000a1' and module_key = 'reenrollment'
$$, 'Réinscription coupée pour le centre A');
select is((select auto_reenrollment_enabled from public.centers where id = 'c9100000-0000-4000-8000-0000000000a1'), false,
  'module coupé : réinscription automatique arrêtée');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$update public.centers set auto_reenrollment_enabled = true where id = 'c9100000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'sans le module : réinscription automatique non activable');

-- ---------------------------------------------------------------------
-- Marque blanche : appliquée selon le module, réglages conservés
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select branding ->> 'brand_name' from public.my_center_access()), 'Marque B', 'module actif : marque appliquée');
set local request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.platform_set_center_module('c9100000-0000-4000-8000-0000000000b1', 'white_label', false)$$,
  'super-admin : coupe la marque blanche du centre B');
set local request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select branding from public.my_center_access()), null, 'module coupé : marque plus appliquée');
select is((select white_label from public.center_for_host('p91-b', null)), false, 'écran de connexion : sans marque');
reset role;
select is((select count(*)::integer from public.center_branding where center_id = 'c9100000-0000-4000-8000-0000000000b1'), 1,
  'module coupé : réglages de marque conservés');

select * from finish();
rollback;
