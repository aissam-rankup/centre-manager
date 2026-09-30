-- =====================================================================
-- Tests de l'accès super-admin (phase 2) — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values
  ('a9000000-0000-4000-8000-000000000001', 'owner-p16@test.local'),
  ('a9000000-0000-4000-8000-000000000002', 'admin-p16@test.local'),
  ('a9000000-0000-4000-8000-000000000003', 'prof-p16@test.local');
insert into public.centers (id, name, price, billing_interval, current_period_end, status) values
  ('c9000000-0000-4000-8000-000000000001', 'Centre P16', 600, 'month', private.today() - 4, 'past_due'),
  ('c9000000-0000-4000-8000-000000000002', 'Centre annuel P16', 2400, 'year', private.today() + 30, 'active');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9000000-0000-4000-8000-000000000001', null, 'Propriétaire', 'super_admin'),
  ('a9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000001', 'Admin P16', 'admin'),
  ('a9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000001', 'Prof P16', 'teacher');

-- Intégrité : super-admin sans centre, les autres rôles avec.
select throws_ok(
  $$insert into public.profiles (id, center_id, full_name, role) values ('a9000000-0000-4000-8000-000000000003', null, 'X', 'teacher')$$,
  '23514', null, 'rôle de centre sans centre refusé');
select throws_ok(
  $$update public.profiles set center_id = 'c9000000-0000-4000-8000-000000000001' where id = 'a9000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'super-admin rattaché à un centre refusé');

-- Hook JWT : claims valides pour un compte sans centre.
select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'a9000000-0000-4000-8000-000000000001', 'claims', '{"sub":"x"}'::jsonb)) -> 'claims',
  '{"sub":"x","center_id":null,"user_role":"super_admin","profile_active":true}'::jsonb,
  'hook JWT : super-admin sans centre');

set local role authenticated;

-- Admin de centre : aucune fonction plateforme, aucun super-admin visible ni créable.
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select * from public.platform_overview()$$, '42501', null, 'admin : tableau de bord plateforme refusé');
select throws_ok($$select * from public.platform_centers()$$, '42501', null, 'admin : liste des centres refusée');
select throws_ok($$select * from public.platform_center('c9000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin : fiche centre refusée');
select throws_ok($$select * from public.platform_payments()$$, '42501', null, 'admin : paiements refusés');
select is((select count(*)::int from public.profiles where role = 'super_admin'), 0, 'admin : super-admin invisible');
select throws_ok(
  $$insert into public.profiles (id, center_id, full_name, role) values ('a9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000001', 'X', 'super_admin')$$,
  '23514', null, 'admin : création d''un super-admin refusée');
select throws_ok(
  $$update public.profiles set role = 'super_admin' where id = 'a9000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'admin : promotion en super-admin refusée');

-- Professeur : refusé aussi.
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select * from public.platform_overdue_centers()$$, '42501', null, 'professeur : retards refusés');

-- Super-admin : console en lecture, aucune donnée métier par les tables.
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok((select past_due_count >= 1 and active_count >= 1 from public.platform_overview()), 'super-admin : centres par statut');
select ok(
  (select monthly_recurring_revenue >= 800 from public.platform_overview()),
  'super-admin : revenu mensuel récurrent (annuel ramené au mois)');
select is(
  (select days_overdue || ' ' || amount_due from public.platform_overdue_centers() where center_id = 'c9000000-0000-4000-8000-000000000001'),
  '4 600.00', 'super-admin : retard en jours et montant dû');
select is(
  (select days_remaining from public.platform_centers() where center_id = 'c9000000-0000-4000-8000-000000000002'),
  30, 'super-admin : jours restants');
select is(
  (select count(*)::int from public.platform_center_users('c9000000-0000-4000-8000-000000000001')),
  2, 'super-admin : comptes du centre');
select is((select count(*)::int from public.students), 0, 'super-admin : aucune donnée métier par les tables');

reset role;

select * from finish();
rollback;
