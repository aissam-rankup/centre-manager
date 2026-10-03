-- =====================================================================
-- Caisse (page 8, phase 6) : ouverture, rattachement des encaissements,
-- mouvements, clôture, écart, immuabilité, caisse par personne
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, email) values
  ('a7f00000-0000-4000-8000-000000000001', 'admin-s-p86@test.local'),
  ('a7f00000-0000-4000-8000-000000000002', 'accueil1-s-p86@test.local'),
  ('a7f00000-0000-4000-8000-000000000003', 'accueil2-s-p86@test.local'),
  ('a7f00000-0000-4000-8000-000000000004', 'prof-s-p86@test.local'),
  ('a7f00000-0000-4000-8000-000000000005', 'admin-u-p86@test.local'),
  ('a7f00000-0000-4000-8000-000000000006', 'accueil1-u-p86@test.local'),
  ('a7f00000-0000-4000-8000-000000000007', 'accueil2-u-p86@test.local'),
  ('a7f00000-0000-4000-8000-000000000009', 'owner-p86@test.local');
insert into public.centers (id, name, slug, cash_variance_alert_threshold, cash_session_per_assistant) values
  ('c7f00000-0000-4000-8000-0000000000a1', 'Centre S', 'p86-s', 50, false),
  ('c7f00000-0000-4000-8000-0000000000b1', 'Centre U', 'p86-u', 50, true);
insert into public.profiles (id, center_id, full_name, role) values
  ('a7f00000-0000-4000-8000-000000000001', 'c7f00000-0000-4000-8000-0000000000a1', 'Admin S', 'admin'),
  ('a7f00000-0000-4000-8000-000000000002', 'c7f00000-0000-4000-8000-0000000000a1', 'Accueil S1', 'assistant'),
  ('a7f00000-0000-4000-8000-000000000003', 'c7f00000-0000-4000-8000-0000000000a1', 'Accueil S2', 'assistant'),
  ('a7f00000-0000-4000-8000-000000000004', 'c7f00000-0000-4000-8000-0000000000a1', 'Prof S', 'teacher'),
  ('a7f00000-0000-4000-8000-000000000005', 'c7f00000-0000-4000-8000-0000000000b1', 'Admin U', 'admin'),
  ('a7f00000-0000-4000-8000-000000000006', 'c7f00000-0000-4000-8000-0000000000b1', 'Accueil U1', 'assistant'),
  ('a7f00000-0000-4000-8000-000000000007', 'c7f00000-0000-4000-8000-0000000000b1', 'Accueil U2', 'assistant'),
  ('a7f00000-0000-4000-8000-000000000009', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values
  ('d7f00000-0000-4000-8000-0000000000a1', 'c7f00000-0000-4000-8000-0000000000a1', 'Niveau S'),
  ('d7f00000-0000-4000-8000-0000000000b1', 'c7f00000-0000-4000-8000-0000000000b1', 'Niveau U');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e7f00000-0000-4000-8000-0000000000a1', 'c7f00000-0000-4000-8000-0000000000a1', 'd7f00000-0000-4000-8000-0000000000a1', 'Maths', 300),
  ('e7f00000-0000-4000-8000-0000000000b1', 'c7f00000-0000-4000-8000-0000000000b1', 'd7f00000-0000-4000-8000-0000000000b1', 'Maths U', 200);
insert into public.students (id, center_id, full_name, level_id)
select ('57f00000-0000-4000-8000-00000000000' || g)::uuid, 'c7f00000-0000-4000-8000-0000000000a1', 'Élève S' || g, 'd7f00000-0000-4000-8000-0000000000a1'
from generate_series(1, 5) as g;
insert into public.students (id, center_id, full_name, level_id) values
  ('57f00000-0000-4000-8000-0000000000b1', 'c7f00000-0000-4000-8000-0000000000b1', 'Élève U1', 'd7f00000-0000-4000-8000-0000000000b1'),
  ('57f00000-0000-4000-8000-0000000000b2', 'c7f00000-0000-4000-8000-0000000000b1', 'Élève U2', 'd7f00000-0000-4000-8000-0000000000b1');
-- Une facture à régler par élève (première facture de l'inscription).
insert into public.enrollments (student_id, subject_id, start_date, billing_day)
select s.id, case when s.center_id = 'c7f00000-0000-4000-8000-0000000000a1' then 'e7f00000-0000-4000-8000-0000000000a1'::uuid
                  else 'e7f00000-0000-4000-8000-0000000000b1'::uuid end,
       private.today() - 5, 1
from public.students s where s.center_id in ('c7f00000-0000-4000-8000-0000000000a1', 'c7f00000-0000-4000-8000-0000000000b1');

create function pg_temp.invoice_of(p_student uuid) returns uuid language sql as
$$ select id from public.invoices where student_id = p_student and status <> 'paid' order by period_start limit 1 $$;
create function pg_temp.session_of(p_receipt public.receipts) returns uuid language sql as $$ select p_receipt.cash_session_id $$;

-- ---------------------------------------------------------------------
-- Ouverture et rattachement (caisse commune)
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('test.session', public.open_cash_session(150)::text, true);
select is(public.open_cash_session(999), current_setting('test.session')::uuid, 'caisse déjà ouverte : la même session, fonds inchangé');
select is((select opening_float from public.cash_sessions where id = current_setting('test.session')::uuid), 150.00::numeric,
  'fonds de caisse du début de journée');
select is((select cash_session_id from public.record_payment('57f00000-0000-4000-8000-000000000001',
  array[pg_temp.invoice_of('57f00000-0000-4000-8000-000000000001')], 'cash')), current_setting('test.session')::uuid,
  'encaissement rattaché à la session ouverte');
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select cash_session_id from public.record_payment('57f00000-0000-4000-8000-000000000002',
  array[pg_temp.invoice_of('57f00000-0000-4000-8000-000000000002')], 'card')), current_setting('test.session')::uuid,
  'caisse commune : la seconde personne de l''accueil y encaisse aussi');
select ok(public.record_cash_movement('bank_deposit', 50, 'Dépôt à la banque') is not null, 'accueil : dépôt en banque noté');
select ok(public.record_cash_movement('float_change', 20, 'Monnaie ajoutée') is not null, 'accueil : ajustement du fonds noté');
select throws_ok($$select public.record_cash_movement('expense', 30, 'Fournitures')$$, '42501', null,
  'accueil : une charge en espèces est réservée à l''admin');
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok(public.record_cash_movement('teacher_pay', 100, 'Avance sur paie') is not null, 'admin : paie en espèces notée');
select throws_ok($$update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now()
  where id = pg_temp.invoice_of('57f00000-0000-4000-8000-000000000005')$$, '42501',
  'Un encaissement passe par l''écran de paiement (reçu et caisse).', 'facture marquée réglée en direct : refusé');

-- ---------------------------------------------------------------------
-- Totaux de la session
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000002","role":"authenticated"}';
select results_eq(
  $$select (s -> 'by_method' ->> 'cash')::numeric, (s -> 'by_method' ->> 'card')::numeric, (s ->> 'transactions')::int,
           (s ->> 'movements_total')::numeric, (s ->> 'expected_cash')::numeric
    from public.cash_session_summary(current_setting('test.session')::uuid) as s$$,
  $$values (300.00::numeric, 300.00::numeric, 2, -130.00::numeric, 320.00::numeric)$$,
  'espèces attendues = fonds 150 + espèces 300 − dépôt 50 + monnaie 20 − paie 100 ; la carte n''y entre pas');
select is((select m ->> 'reason' from jsonb_array_elements(public.cash_session_summary(current_setting('test.session')::uuid) -> 'movements') as x(m)
           where m ->> 'kind' = 'teacher_pay'), null, 'accueil : détail de la paie masqué, montant compté');

-- ---------------------------------------------------------------------
-- Clôture
-- ---------------------------------------------------------------------
select throws_ok($$select public.close_cash_session(current_setting('test.session')::uuid, 300)$$, '22023', null,
  'écart sans motif : clôture refusée');
select throws_ok($$select public.close_cash_session(current_setting('test.session')::uuid, 300.505, 'x')$$, '22023', null,
  'montant compté au-delà du centime : refusé');
select lives_ok($$select public.close_cash_session(current_setting('test.session')::uuid, 300, 'Erreur de rendu')$$,
  'écart motivé : clôture acceptée');
reset role;
select results_eq(
  $$select status::text, expected_cash, counted_cash, variance, variance_reason, closed_by, (expected_by_method ->> 'card')::numeric
    from public.cash_sessions where id = current_setting('test.session')::uuid$$,
  $$values ('closed', 320.00::numeric, 300.00::numeric, -20.00::numeric, 'Erreur de rendu', 'a7f00000-0000-4000-8000-000000000002'::uuid, 300.00::numeric)$$,
  'clôture : attendu, compté, écart (manquant de 20), motif, auteur et totaux par mode figés');
select is((select count(*)::int from public.center_events where entity_id = current_setting('test.session')::uuid
           and action = 'cash_session.closed' and actor_id = 'a7f00000-0000-4000-8000-000000000002'), 1,
  'clôture consignée avec son auteur');
select is((select count(*)::int from public.center_events where entity_id = current_setting('test.session')::uuid
           and action = 'cash_session.variance_alert'), 0, 'écart de 20 sous le seuil de 50 : pas d''alerte');
select throws_ok($$update public.cash_sessions set counted_cash = 320, variance = 0 where id = current_setting('test.session')::uuid$$,
  '42501', null, 'session clôturée : immuable');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.close_cash_session(current_setting('test.session')::uuid, 300, 'x')$$, '22023', null,
  'deuxième clôture refusée');
select set_config('test.session2', (select cash_session_id from public.record_payment('57f00000-0000-4000-8000-000000000003',
  array[pg_temp.invoice_of('57f00000-0000-4000-8000-000000000003')], 'cash'))::text, true);
select ok(current_setting('test.session2')::uuid <> current_setting('test.session')::uuid,
  'encaissement après la clôture : une nouvelle session s''ouvre');

-- Annulation par l'admin : opération du jour, espèces rendues.
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select cash_session_id from public.cancel_receipt(
  (select id from public.receipts where student_id = '57f00000-0000-4000-8000-000000000003' and kind = 'payment'), 'Erreur d''élève')),
  current_setting('test.session2')::uuid, 'annulation : dans la session du jour');
select is((select (public.cash_session_summary(current_setting('test.session2')::uuid) ->> 'expected_cash')::numeric), 0.00::numeric,
  'annulation d''un paiement en espèces : rendu, les espèces attendues reviennent à 0');
select lives_ok($$select public.close_cash_session(current_setting('test.session2')::uuid, 100, 'Billet trouvé')$$,
  'écart de 100 motivé');
reset role;
select is((select count(*)::int from public.center_events where entity_id = current_setting('test.session2')::uuid
           and action = 'cash_session.variance_alert'), 1, 'écart de 100 au-delà du seuil : l''admin est alerté');

-- ---------------------------------------------------------------------
-- Accès
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$select public.open_cash_session(0)$$, '42501', null, 'professeur : pas de caisse');
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok($$select public.cash_session_summary(current_setting('test.session')::uuid)$$, '42501', null,
  'admin d''un autre centre : session invisible');
reset role;
insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a7f00000-0000-4000-8000-000000000009', 'c7f00000-0000-4000-8000-0000000000a1', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000009","role":"authenticated"}';
select throws_ok($$select public.open_cash_session(0)$$, '42501', 'Mode support : lecture seule.', 'support : lecture seule');

-- ---------------------------------------------------------------------
-- Une caisse par personne
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000006","role":"authenticated"}';
select set_config('test.u1', (select cash_session_id from public.record_payment('57f00000-0000-4000-8000-0000000000b1',
  array[pg_temp.invoice_of('57f00000-0000-4000-8000-0000000000b1')], 'cash'))::text, true);
set local request.jwt.claims = '{"sub":"a7f00000-0000-4000-8000-000000000007","role":"authenticated"}';
select set_config('test.u2', (select cash_session_id from public.record_payment('57f00000-0000-4000-8000-0000000000b2',
  array[pg_temp.invoice_of('57f00000-0000-4000-8000-0000000000b2')], 'cash'))::text, true);
select ok(current_setting('test.u1')::uuid <> current_setting('test.u2')::uuid, 'caisse par personne : chacun la sienne');
select is((select count(*)::int from public.cash_sessions where id = current_setting('test.u1')::uuid), 0,
  'l''accueil ne voit jamais la caisse d''une autre personne');
select throws_ok($$select public.close_cash_session(current_setting('test.u1')::uuid, 200)$$, '42501', null,
  'ni ne la clôture');
reset role;

select * from finish();
rollback;
