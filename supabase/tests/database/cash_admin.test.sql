-- =====================================================================
-- Caisse (page 8, phase 7) : vue admin, validation, correction après
-- clôture, indicateurs d'écart, caisses restées ouvertes
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email) values
  ('a8a00000-0000-4000-8000-000000000001', 'admin-v-p87@test.local'),
  ('a8a00000-0000-4000-8000-000000000002', 'accueil-v-p87@test.local'),
  ('a8a00000-0000-4000-8000-000000000004', 'admin-w-p87@test.local'),
  ('a8a00000-0000-4000-8000-000000000009', 'owner-p87@test.local');
insert into public.centers (id, name, slug, cash_variance_alert_threshold) values
  ('c8a00000-0000-4000-8000-0000000000a1', 'Centre V', 'p87-v', 50),
  ('c8a00000-0000-4000-8000-0000000000b1', 'Centre W', 'p87-w', 50);
insert into public.profiles (id, center_id, full_name, role) values
  ('a8a00000-0000-4000-8000-000000000001', 'c8a00000-0000-4000-8000-0000000000a1', 'Admin V', 'admin'),
  ('a8a00000-0000-4000-8000-000000000002', 'c8a00000-0000-4000-8000-0000000000a1', 'Accueil V', 'assistant'),
  ('a8a00000-0000-4000-8000-000000000004', 'c8a00000-0000-4000-8000-0000000000b1', 'Admin W', 'admin'),
  ('a8a00000-0000-4000-8000-000000000009', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values
  ('d8a00000-0000-4000-8000-0000000000a1', 'c8a00000-0000-4000-8000-0000000000a1', 'Niveau V');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e8a00000-0000-4000-8000-0000000000a1', 'c8a00000-0000-4000-8000-0000000000a1', 'd8a00000-0000-4000-8000-0000000000a1', 'Maths', 300);
insert into public.students (id, center_id, full_name, level_id) values
  ('58a00000-0000-4000-8000-000000000001', 'c8a00000-0000-4000-8000-0000000000a1', 'Élève V1', 'd8a00000-0000-4000-8000-0000000000a1'),
  ('58a00000-0000-4000-8000-000000000002', 'c8a00000-0000-4000-8000-0000000000a1', 'Élève V2', 'd8a00000-0000-4000-8000-0000000000a1');
insert into public.enrollments (student_id, subject_id, start_date, billing_day)
select s.id, 'e8a00000-0000-4000-8000-0000000000a1', private.today() - 5, 1
from public.students s where s.center_id = 'c8a00000-0000-4000-8000-0000000000a1';

-- Caisse restée ouverte la veille.
insert into public.cash_sessions (id, center_id, session_date, opened_by, opening_float)
values ('9a800000-0000-4000-8000-000000000001', 'c8a00000-0000-4000-8000-0000000000a1', private.today() - 1,
        'a8a00000-0000-4000-8000-000000000002', 0);

-- Session du jour : 300 encaissés en espèces, fonds 100 ; comptée 380 (manquant 20).
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8a00000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('test.s1', public.open_cash_session(100)::text, true);
select public.record_payment('58a00000-0000-4000-8000-000000000001',
  array(select id from public.invoices where student_id = '58a00000-0000-4000-8000-000000000001'), 'cash');
select throws_ok($$select public.close_cash_session(current_setting('test.s1')::uuid, 380, 'Rendu', null, 300)$$, '22023', null,
  'chiffres changés depuis l''affichage (attendu 300 vu, 400 réel) : clôture refusée');
select lives_ok($$select public.close_cash_session(current_setting('test.s1')::uuid, 380, 'Erreur de rendu', null, 400)$$,
  'clôture avec l''attendu affiché : acceptée');
-- Seconde session du jour, juste.
select set_config('test.s2', (select cash_session_id from public.record_payment('58a00000-0000-4000-8000-000000000002',
  array(select id from public.invoices where student_id = '58a00000-0000-4000-8000-000000000002'), 'cash'))::text, true);
select lives_ok($$select public.close_cash_session(current_setting('test.s2')::uuid, 300)$$, 'seconde session : caisse juste');

-- ---------------------------------------------------------------------
-- Accès à la vue admin
-- ---------------------------------------------------------------------
select throws_ok($$select * from public.cash_session_history(private.today() - 30, private.today())$$, '42501', null,
  'accueil : pas d''historique');
select throws_ok($$select public.validate_cash_session(current_setting('test.s1')::uuid)$$, '42501', null, 'accueil : ne valide pas');
select throws_ok($$select public.record_cash_correction(current_setting('test.s1')::uuid, 20, 'Billet')$$, '42501', null,
  'accueil : ne corrige pas une session clôturée');
set local request.jwt.claims = '{"sub":"a8a00000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.cash_session_history(private.today() - 30, private.today())), 0,
  'admin d''un autre centre : historique vide');
select throws_ok($$select public.validate_cash_session(current_setting('test.s1')::uuid)$$, '42501', null,
  'admin d''un autre centre : ne valide pas');

-- ---------------------------------------------------------------------
-- Historique et indicateurs (admin)
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a8a00000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$select status::text, total_collected, expected_cash, counted_cash, variance
    from public.cash_session_history(date_trunc('month', private.today())::date, private.today())
    where id = current_setting('test.s1')::uuid$$,
  $$values ('closed', 300.00::numeric, 400.00::numeric, 380.00::numeric, -20.00::numeric)$$,
  'historique : encaissé, attendu, compté, écart');
select ok(exists (select 1 from public.cash_session_history(private.today(), private.today())
                  where id = '9a800000-0000-4000-8000-000000000001'),
  'historique : la caisse de la veille restée ouverte apparaît aussi');
select results_eq(
  $$select (o ->> 'sessions')::int, (o ->> 'exact')::int, (o ->> 'shortage')::numeric, (o ->> 'surplus')::numeric, (o ->> 'stale_open')::int
    from public.cash_month_overview() as o$$,
  $$values (2, 1, -20.00::numeric, 0::numeric, 1)$$,
  'indicateurs : 2 sessions clôturées, 1 sans écart, 20 manquants, 1 caisse restée ouverte');
select results_eq(
  $$select p ->> 'name', (p ->> 'sessions')::int, (p ->> 'short_count')::int, (p ->> 'net')::numeric
    from jsonb_array_elements(public.cash_month_overview() -> 'people') as x(p)$$,
  $$values ('Accueil V', 2, 1, -20.00::numeric)$$,
  'écarts par personne');
select results_eq(
  $$select id, session_date from public.stale_cash_sessions()$$,
  $$values ('9a800000-0000-4000-8000-000000000001'::uuid, private.today() - 1)$$,
  'tableau de bord : caisse de la veille non clôturée');

-- ---------------------------------------------------------------------
-- Correction après clôture
-- ---------------------------------------------------------------------
select throws_ok($$select public.record_cash_correction('9a800000-0000-4000-8000-000000000001', 20, 'x')$$, '22023', null,
  'session encore ouverte : pas de correction (mouvement de caisse)');
select throws_ok($$select public.record_cash_correction(current_setting('test.s1')::uuid, 20, '  ')$$, '22023', null,
  'correction sans motif : refusée');
select set_config('test.correction', public.record_cash_correction(current_setting('test.s1')::uuid, 20, 'Billet retrouvé')::text, true);
reset role;
select results_eq(
  $$select m.kind::text, m.amount, m.corrects_session_id, cs.session_date = private.today(), cs.status::text, m.created_by
    from public.cash_movements m join public.cash_sessions cs on cs.id = m.cash_session_id
    where m.id = current_setting('test.correction')::uuid$$,
  $$values ('correction', 20.00::numeric, current_setting('test.s1')::uuid, true, 'open', 'a8a00000-0000-4000-8000-000000000001'::uuid)$$,
  'correction : opération du jour dans la caisse ouverte de l''admin, liée à la session corrigée, signée');
select is((select variance from public.cash_sessions where id = current_setting('test.s1')::uuid), -20.00::numeric,
  'la session corrigée ne change pas');
select is((select count(*)::int from public.center_events where entity_id = current_setting('test.s1')::uuid
           and action = 'cash_session.corrected'), 1, 'correction consignée');

-- ---------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8a00000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.validate_cash_session(current_setting('test.s1')::uuid, 'Écart expliqué')$$, 'admin : session validée');
select throws_ok($$select public.validate_cash_session(current_setting('test.s1')::uuid)$$, '22023', null, 'déjà validée');
select throws_ok($$select public.record_cash_correction(current_setting('test.s1')::uuid, 5, 'Encore')$$, '22023', null,
  'session validée : plus aucune correction');
reset role;
select results_eq(
  $$select status::text, validated_by, notes from public.cash_sessions where id = current_setting('test.s1')::uuid$$,
  $$values ('validated', 'a8a00000-0000-4000-8000-000000000001'::uuid, 'Écart expliqué')$$,
  'validation : auteur et note consignés');
select throws_ok($$update public.cash_sessions set notes = 'Modifiée' where id = current_setting('test.s1')::uuid$$, '42501', null,
  'session validée : verrouillée définitivement');

insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a8a00000-0000-4000-8000-000000000009', 'c8a00000-0000-4000-8000-0000000000a1', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8a00000-0000-4000-8000-000000000009","role":"authenticated"}';
select throws_ok($$select * from public.cash_session_history(private.today() - 30, private.today())$$, '42501', null,
  'support : pas d''historique de caisse');
reset role;

select * from finish();
rollback;
