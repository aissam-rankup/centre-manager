-- =====================================================================
-- Tests du cycle de vie, du blocage et du support (phase 4)
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email) values
  ('ab000000-0000-4000-8000-000000000001', 'owner-p18@test.local'),
  ('ab000000-0000-4000-8000-000000000002', 'admin-p18@test.local'),
  ('ab000000-0000-4000-8000-000000000003', 'prof-p18@test.local');
insert into public.centers (id, name, status, current_period_end, grace_days, price, owner_contact_email, cancelled_at) values
  ('cb000000-0000-4000-8000-000000000001', 'Centre retard', 'active', private.today() - 2, 5, 500, 'dir1@test.local', null),
  ('cb000000-0000-4000-8000-000000000002', 'Centre à suspendre', 'past_due', private.today() - 6, 5, 500, 'dir2@test.local', null),
  ('cb000000-0000-4000-8000-000000000003', 'Centre J-7', 'active', private.today() + 7, 5, 500, 'dir3@test.local', null),
  ('cb000000-0000-4000-8000-000000000004', 'Centre résilié', 'cancelled', private.today() - 60, 5, 500, null, now());
insert into public.profiles (id, center_id, full_name, role) values
  ('ab000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin'),
  ('ab000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000002', 'Admin P18', 'admin'),
  ('ab000000-0000-4000-8000-000000000003', 'cb000000-0000-4000-8000-000000000001', 'Prof P18', 'teacher');
insert into public.levels (id, center_id, name) values
  ('db000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000002', 'Niveau P18');
insert into public.students (center_id, full_name, level_id) values
  ('cb000000-0000-4000-8000-000000000002', 'Élève P18', 'db000000-0000-4000-8000-000000000001');
update public.platform_settings set support_phone = '0600000000', support_email = 'support@test.local';

-- Job quotidien.
select lives_ok($$select private.run_daily_automations()$$, 'job quotidien exécuté');
select is((select status::text from public.centers where id = 'cb000000-0000-4000-8000-000000000001'), 'past_due', 'échéance dépassée : en retard');
select is((select status::text from public.centers where id = 'cb000000-0000-4000-8000-000000000002'), 'suspended', 'échéance + grâce dépassées : suspendu');
select is((select status::text from public.centers where id = 'cb000000-0000-4000-8000-000000000003'), 'active', 'échéance future : inchangé');
select is((select status::text from public.centers where id = 'cb000000-0000-4000-8000-000000000004'), 'cancelled', 'résilié : jamais modifié');
select is(
  (select payload ->> 'reason' from public.platform_events
   where center_id = 'cb000000-0000-4000-8000-000000000002' and action = 'center.status_changed' order by id desc limit 1),
  'Automatique : échéance dépassée', 'suspension automatique journalisée');
select is(
  (select string_agg(kind, ',' order by kind) from public.platform_notifications
   where center_id in ('cb000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000003')),
  'due_in_7,suspended', 'rappels préparés (J-7, suspension)');
select is((select count(*)::int from public.platform_notifications where kind = 'owner_digest'), 1, 'récapitulatif du propriétaire préparé');
select lives_ok($$select private.run_daily_automations()$$, 'job relancé le même jour');
select is((select count(*)::int from public.platform_notifications where kind = 'owner_digest'), 1, 'rappels : jamais en double');

-- Centre suspendu : plus aucun accès aux données.
set local role authenticated;
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.students), 0, 'suspendu : aucun élève lisible');
select is(private.auth_role(), null, 'suspendu : aucun rôle');
select throws_ok(
  $$insert into public.levels (center_id, name) values ('cb000000-0000-4000-8000-000000000002', 'X')$$,
  '42501', null, 'suspendu : aucune écriture');
select is(
  (select status::text || ' ' || blocked || ' ' || contact_email from public.my_center_access()),
  'suspended true support@test.local', 'écran de suspension : statut et contact');

-- Centre en retard : utilisable ; détails d'échéance réservés à l'admin.
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(private.auth_role()::text, 'teacher', 'en retard : accès conservé');
select is((select current_period_end from public.my_center_access()), null, 'professeur : pas de détail d''échéance');

-- Paiement : levée immédiate du blocage.
reset role;
insert into public.subscription_payments (center_id, amount, method) values ('cb000000-0000-4000-8000-000000000002', 500, 'cash');
set local role authenticated;
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.students), 1, 'paiement : accès rétabli');

-- Support en lecture seule.
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.students), 0, 'super-admin hors support : aucune donnée');
select throws_ok(
  $$select public.platform_start_support('cb000000-0000-4000-8000-000000000002', '')$$,
  '22023', null, 'support : motif obligatoire');
select lives_ok(
  $$select public.platform_start_support('cb000000-0000-4000-8000-000000000002', 'Aide au paramétrage')$$,
  'support : session ouverte');
-- Nouvelle requête (chaque appel API a sa propre transaction).
select set_config('centromanager.platform_action', '', true);
select is((select count(*)::int from public.students), 1, 'support : lecture des données du centre');
select throws_ok(
  $$update public.students set full_name = 'Modifié'$$,
  '42501', null, 'support : écriture refusée');
select lives_ok(
  $$select public.platform_set_due_date('cb000000-0000-4000-8000-000000000002', private.today() + 30, 'Geste commercial')$$,
  'support : actions de la console toujours possibles');
select lives_ok($$select public.platform_end_support()$$, 'support : session fermée');

reset role;

select * from finish();
rollback;
