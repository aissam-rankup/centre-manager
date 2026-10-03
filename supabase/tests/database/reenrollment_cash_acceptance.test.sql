-- =====================================================================
-- Réinscription et caisse (page 8, phase 8) : recette de bout en bout
--  * exactitude des totaux de caisse (modes, centimes, annulation,
--    mouvements, historique, indicateurs du mois) ;
--  * immutabilité après clôture, même avec la clé de service ;
--  * aucun rappel sur une facture soldée.
-- L'isolation par centre est vérifiée dans tenant_isolation.test.sql.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

insert into auth.users (id, email) values
  ('a8f00000-0000-4000-8000-000000000001', 'admin-y-p88@test.local'),
  ('a8f00000-0000-4000-8000-000000000002', 'accueil-y-p88@test.local'),
  ('a8f00000-0000-4000-8000-000000000003', 'admin-x-p88@test.local'),
  ('a8f00000-0000-4000-8000-000000000004', 'accueil-x-p88@test.local');
insert into public.centers (id, name, slug, cash_variance_alert_threshold, auto_reenrollment_enabled, payment_due_day, payment_reminders_enabled) values
  ('c8f00000-0000-4000-8000-0000000000a1', 'Centre Y', 'p88-y', 50, false, 5, true),
  ('c8f00000-0000-4000-8000-0000000000b1', 'Centre X', 'p88-x', 50, true, 1, true);
insert into public.profiles (id, center_id, full_name, role) values
  ('a8f00000-0000-4000-8000-000000000001', 'c8f00000-0000-4000-8000-0000000000a1', 'Admin Y', 'admin'),
  ('a8f00000-0000-4000-8000-000000000002', 'c8f00000-0000-4000-8000-0000000000a1', 'Accueil Y', 'assistant'),
  ('a8f00000-0000-4000-8000-000000000003', 'c8f00000-0000-4000-8000-0000000000b1', 'Admin X', 'admin'),
  ('a8f00000-0000-4000-8000-000000000004', 'c8f00000-0000-4000-8000-0000000000b1', 'Accueil X', 'assistant');
insert into public.levels (id, center_id, name) values
  ('d8f00000-0000-4000-8000-0000000000a1', 'c8f00000-0000-4000-8000-0000000000a1', 'Niveau Y'),
  ('d8f00000-0000-4000-8000-0000000000b1', 'c8f00000-0000-4000-8000-0000000000b1', 'Niveau X');
-- Tarifs au centime : les totaux ne s'arrondissent jamais en route.
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e8f00000-0000-4000-8000-0000000000a1', 'c8f00000-0000-4000-8000-0000000000a1', 'd8f00000-0000-4000-8000-0000000000a1', 'Maths', 199.99),
  ('e8f00000-0000-4000-8000-0000000000a2', 'c8f00000-0000-4000-8000-0000000000a1', 'd8f00000-0000-4000-8000-0000000000a1', 'Anglais', 250.50),
  ('e8f00000-0000-4000-8000-0000000000b1', 'c8f00000-0000-4000-8000-0000000000b1', 'd8f00000-0000-4000-8000-0000000000b1', 'Maths', 199.99),
  ('e8f00000-0000-4000-8000-0000000000b2', 'c8f00000-0000-4000-8000-0000000000b1', 'd8f00000-0000-4000-8000-0000000000b1', 'Anglais', 250.50);
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('58f00000-0000-4000-8000-0000000000a1', 'c8f00000-0000-4000-8000-0000000000a1', 'Élève Y1 espèces', 'd8f00000-0000-4000-8000-0000000000a1', null),
  ('58f00000-0000-4000-8000-0000000000a2', 'c8f00000-0000-4000-8000-0000000000a1', 'Élève Y2 carte', 'd8f00000-0000-4000-8000-0000000000a1', null),
  ('58f00000-0000-4000-8000-0000000000a3', 'c8f00000-0000-4000-8000-0000000000a1', 'Élève Y3 virement', 'd8f00000-0000-4000-8000-0000000000a1', null),
  ('58f00000-0000-4000-8000-0000000000a4', 'c8f00000-0000-4000-8000-0000000000a1', 'Élève Y4 chèque', 'd8f00000-0000-4000-8000-0000000000a1', null),
  ('58f00000-0000-4000-8000-0000000000a5', 'c8f00000-0000-4000-8000-0000000000a1', 'Élève Y5 après clôture', 'd8f00000-0000-4000-8000-0000000000a1', null),
  ('58f00000-0000-4000-8000-0000000000b1', 'c8f00000-0000-4000-8000-0000000000b1', 'Élève X1 deux matières', 'd8f00000-0000-4000-8000-0000000000b1', '0612345678'),
  ('58f00000-0000-4000-8000-0000000000b2', 'c8f00000-0000-4000-8000-0000000000b1', 'Élève X2 témoin', 'd8f00000-0000-4000-8000-0000000000b1', '0612345679');
insert into public.enrollments (student_id, subject_id, start_date, billing_day) values
  ('58f00000-0000-4000-8000-0000000000a1', 'e8f00000-0000-4000-8000-0000000000a1', private.today() - 5, 1),
  ('58f00000-0000-4000-8000-0000000000a2', 'e8f00000-0000-4000-8000-0000000000a2', private.today() - 5, 1),
  ('58f00000-0000-4000-8000-0000000000a3', 'e8f00000-0000-4000-8000-0000000000a1', private.today() - 5, 1),
  ('58f00000-0000-4000-8000-0000000000a3', 'e8f00000-0000-4000-8000-0000000000a2', private.today() - 5, 1),
  ('58f00000-0000-4000-8000-0000000000a4', 'e8f00000-0000-4000-8000-0000000000a1', private.today() - 5, 1),
  ('58f00000-0000-4000-8000-0000000000a5', 'e8f00000-0000-4000-8000-0000000000a1', private.today() - 5, 1),
  ('58f00000-0000-4000-8000-0000000000b1', 'e8f00000-0000-4000-8000-0000000000b1', (date_trunc('month', private.today()) - interval '1 month')::date, 1),
  ('58f00000-0000-4000-8000-0000000000b1', 'e8f00000-0000-4000-8000-0000000000b2', (date_trunc('month', private.today()) - interval '1 month')::date, 1),
  ('58f00000-0000-4000-8000-0000000000b2', 'e8f00000-0000-4000-8000-0000000000b1', (date_trunc('month', private.today()) - interval '1 month')::date, 1);

-- =====================================================================
-- 1. Exactitude des totaux de caisse (centre Y, caisse commune)
-- =====================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('test.s1', public.open_cash_session(150)::text, true);
select set_config('test.r1', (select id::text from public.record_payment('58f00000-0000-4000-8000-0000000000a1',
  array(select id from public.invoices where student_id = '58f00000-0000-4000-8000-0000000000a1'), 'cash')), true);
select set_config('test.r2', (select id::text from public.record_payment('58f00000-0000-4000-8000-0000000000a2',
  array(select id from public.invoices where student_id = '58f00000-0000-4000-8000-0000000000a2'), 'card')), true);
select public.record_payment('58f00000-0000-4000-8000-0000000000a3',
  array(select id from public.invoices where student_id = '58f00000-0000-4000-8000-0000000000a3'), 'bank_transfer');
select public.record_payment('58f00000-0000-4000-8000-0000000000a4',
  array(select id from public.invoices where student_id = '58f00000-0000-4000-8000-0000000000a4'), 'cheque');
select public.record_cash_movement('bank_deposit', 100, 'Dépôt en banque');
select public.record_cash_movement('float_change', 20.55, 'Monnaie ajoutée');
-- L'admin annule le paiement par carte (erreur de mode) et note une charge en espèces.
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.cancel_receipt(current_setting('test.r2')::uuid, 'Erreur de mode');
select public.record_cash_movement('expense', 30, 'Fournitures');

-- Encaissé : 199,99 + 250,50 − 250,50 + 450,49 + 199,99 = 850,47 (cinq reçus).
-- Espèces attendues : fonds 150 + espèces 199,99 − dépôt 100 + monnaie 20,55 − charge 30 = 240,54.
select results_eq(
  $$select (s -> 'by_method' ->> 'cash')::numeric, (s -> 'by_method' ->> 'card')::numeric,
           (s -> 'by_method' ->> 'bank_transfer')::numeric, (s -> 'by_method' ->> 'cheque')::numeric,
           (s ->> 'transactions')::int, (s ->> 'movements_total')::numeric, (s ->> 'expected_cash')::numeric
    from public.cash_session_summary(current_setting('test.s1')::uuid) as s$$,
  $$values (199.99::numeric, 0.00::numeric, 450.49::numeric, 199.99::numeric, 5, -109.45::numeric, 240.54::numeric)$$,
  'totaux par mode au centime : l''annulation par carte s''annule, la carte n''entre pas dans les espèces');
select is(
  (select jsonb_object_agg(m, coalesce((select sum(rc.amount_paid) from public.receipts rc
                                         where rc.cash_session_id = current_setting('test.s1')::uuid and rc.payment_method::text = m), 0))
   from unnest(array['cash', 'card', 'bank_transfer', 'cheque']) as m),
  (select s -> 'by_method' from public.cash_session_summary(current_setting('test.s1')::uuid) as s),
  'totaux par mode = somme des reçus de la session, mode par mode');
select is(
  (select (s ->> 'expected_cash')::numeric
          - (s ->> 'opening_float')::numeric - (s -> 'by_method' ->> 'cash')::numeric
          - (select sum(x.amount) from public.cash_movements x where x.cash_session_id = current_setting('test.s1')::uuid)
   from public.cash_session_summary(current_setting('test.s1')::uuid) as s),
  0.00::numeric, 'espèces attendues = fonds + espèces encaissées + mouvements, sans écart d''un centime');
select results_eq(
  $$select total_collected, cash_collected, transactions, expected_cash, counted_cash
    from public.cash_session_history(private.today(), private.today()) where id = current_setting('test.s1')::uuid$$,
  $$values (850.47::numeric, 199.99::numeric, 5, 240.54::numeric, null::numeric)$$,
  'historique admin : mêmes chiffres que la caisse du jour');

-- L'accueil ne voit pas le motif de la charge, mais compte la même somme.
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000002","role":"authenticated"}';
select results_eq(
  $$select (s ->> 'expected_cash')::numeric, (s ->> 'movements_total')::numeric,
           (select m ->> 'reason' from jsonb_array_elements(s -> 'movements') m where m ->> 'kind' = 'expense')
    from public.cash_session_summary(current_setting('test.s1')::uuid) as s$$,
  $$values (240.54::numeric, -109.45::numeric, null::text)$$,
  'accueil : même attendu que l''admin, motif de la charge masqué');
select throws_ok($$select public.close_cash_session(current_setting('test.s1')::uuid, 240.54, null, null, 240.55)$$, '22023', null,
  'attendu affiché différent d''un centime : clôture refusée');
select lives_ok($$select public.close_cash_session(current_setting('test.s1')::uuid, 240.54, null, null, 240.54)$$,
  'caisse juste au centime : clôture sans motif');
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.snapshot', public.cash_session_summary(current_setting('test.s1')::uuid)::text, true);
reset role;
select results_eq(
  $$select status::text, expected_cash, counted_cash, variance, expected_by_method
    from public.cash_sessions where id = current_setting('test.s1')::uuid$$,
  $$values ('closed', 240.54::numeric, 240.54::numeric, 0.00::numeric,
            '{"cash": 199.99, "card": 0.00, "bank_transfer": 450.49, "cheque": 199.99}'::jsonb)$$,
  'clôture : attendu, compté, écart nul et totaux par mode figés');

-- =====================================================================
-- 2. Immutabilité après clôture
-- =====================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('test.s2', (select cash_session_id::text from public.record_payment('58f00000-0000-4000-8000-0000000000a5',
  array(select id from public.invoices where student_id = '58f00000-0000-4000-8000-0000000000a5'), 'cash')), true);
select isnt(current_setting('test.s2'), current_setting('test.s1'), 'encaissement après la clôture : nouvelle session du jour');
select public.record_cash_movement('bank_deposit', 50, 'Second dépôt');
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select cash_session_id::text from public.cancel_receipt(current_setting('test.r1')::uuid, 'Erreur d''élève')),
  current_setting('test.s2'), 'annulation d''un reçu de la session clôturée : passée dans la session ouverte');
select results_eq(
  $$select (s -> 'by_method' ->> 'cash')::numeric, (s ->> 'expected_cash')::numeric, (s ->> 'transactions')::int
    from public.cash_session_summary(current_setting('test.s2')::uuid) as s$$,
  $$values (0.00::numeric, -50.00::numeric, 2)$$,
  'session ouverte : 199,99 encaissés puis 199,99 rendus, dépôt de 50');
select set_config('test.correction', public.record_cash_correction(current_setting('test.s1')::uuid, -0.01, 'Pièce fausse')::text, true);

-- Écritures directes de l'admin : aucun droit d'écriture sur la caisse.
select throws_ok($$update public.cash_sessions set counted_cash = 999 where id = current_setting('test.s1')::uuid$$, '42501', null,
  'admin : pas de modification directe d''une session');
select throws_ok($$delete from public.cash_sessions where id = current_setting('test.s1')::uuid$$, '42501', null,
  'admin : pas de suppression d''une session');
select throws_ok($$insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason)
  values ('c8f00000-0000-4000-8000-0000000000a1', current_setting('test.s1')::uuid, 'float_change', 10, 'x')$$, '42501', null,
  'admin : pas de mouvement inséré en direct');

-- Même la clé de service ne réécrit pas une session clôturée.
reset role;
set local role service_role;
select throws_ok($$update public.cash_sessions set counted_cash = 999, variance = 758.46 where id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : comptage d''une session clôturée non modifiable');
select throws_ok($$update public.cash_sessions set expected_by_method = '{"cash": 0}' where id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : totaux figés non modifiables');
select throws_ok($$update public.cash_sessions set status = 'open', closed_at = null where id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : une session clôturée ne se rouvre pas');
select throws_ok($$delete from public.cash_sessions where id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : une session clôturée ne se supprime pas (ni ses mouvements avec elle)');
select throws_ok($$insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason)
  values ('c8f00000-0000-4000-8000-0000000000a1', current_setting('test.s1')::uuid, 'float_change', 10, 'Ajout tardif')$$, '42501', null,
  'clé de service : aucun mouvement ajouté à une session clôturée');
select throws_ok($$update public.cash_movements set amount = -1 where cash_session_id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : mouvements de la session clôturée non modifiables');
select throws_ok($$delete from public.cash_movements where cash_session_id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : mouvements de la session clôturée non supprimables');
select throws_ok($$update public.receipts set cash_session_id = current_setting('test.s2')::uuid where cash_session_id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : un reçu ne change pas de session');
select throws_ok($$delete from public.receipts where cash_session_id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : reçus de la session clôturée non supprimables');
reset role;

-- Session clôturée sans reçu (seulement un mouvement) : rien ne la retenait.
insert into public.cash_sessions (id, center_id, session_date, opened_by, opening_float)
values ('9a8f0000-0000-4000-8000-000000000001', 'c8f00000-0000-4000-8000-0000000000a1', private.today() - 2,
        'a8f00000-0000-4000-8000-000000000002', 0);
insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason, created_by)
values ('c8f00000-0000-4000-8000-0000000000a1', '9a8f0000-0000-4000-8000-000000000001', 'float_change', 10, 'Monnaie',
        'a8f00000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.close_cash_session('9a8f0000-0000-4000-8000-000000000001', 10, null, null, 10);
reset role;
set local role service_role;
select throws_ok($$delete from public.cash_sessions where id = '9a8f0000-0000-4000-8000-000000000001'$$, '42501', null,
  'clé de service : une session clôturée sans reçu ne se supprime pas non plus');
reset role;
select is((select count(*)::int from public.cash_movements where cash_session_id = '9a8f0000-0000-4000-8000-000000000001'), 1,
  'ses mouvements restent');

-- La correction vit dans la session du jour ; la session corrigée garde ses chiffres.
select results_eq(
  $$select cash_session_id::text, corrects_session_id::text, amount from public.cash_movements where id = current_setting('test.correction')::uuid$$,
  $$values (current_setting('test.s2'), current_setting('test.s1'), -0.01::numeric)$$,
  'correction : dans la session ouverte, liée à la session corrigée');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select corrections from public.cash_session_history(private.today(), private.today()) where id = current_setting('test.s1')::uuid),
  -0.01::numeric, 'historique : la correction apparaît sur la session corrigée');
select lives_ok($$select public.validate_cash_session(current_setting('test.s1')::uuid, 'Contrôlée')$$, 'admin : session validée');
reset role;
set local role service_role;
select throws_ok($$update public.cash_sessions set status = 'closed', validated_by = null, validated_at = null where id = current_setting('test.s1')::uuid$$, '42501', null,
  'clé de service : une session validée ne revient pas en arrière');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.cash_session_summary(current_setting('test.s1')::uuid) - array['status', 'validated_at', 'validated_by_name', 'validation_notes', 'corrections'],
  current_setting('test.snapshot')::jsonb - array['status', 'validated_at', 'validated_by_name', 'validation_notes', 'corrections'],
  'session clôturée : chiffres, reçus, mouvements et note identiques après encaissements, annulation, correction et validation');
select results_eq(
  $$select (c ->> 'amount')::numeric, c ->> 'cash_session_id'
    from jsonb_array_elements(public.cash_session_summary(current_setting('test.s1')::uuid) -> 'corrections') c$$,
  $$values (-0.01::numeric, current_setting('test.s2'))$$,
  'la correction est montrée à côté de la session corrigée, sans en changer les chiffres');
-- Indicateurs du mois : l'encaissé est la somme des reçus de toutes les sessions du mois.
select is(
  (select (public.cash_month_overview() ->> 'collected')::numeric),
  (select sum(total_collected) from public.cash_session_history(date_trunc('month', private.today())::date, private.today())),
  'indicateurs du mois : encaissé = somme de l''historique');
reset role;

-- =====================================================================
-- 3. Aucun rappel sur une facture soldée (centre X, campagne confirmée)
-- =====================================================================
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now()
where student_id in ('58f00000-0000-4000-8000-0000000000b1', '58f00000-0000-4000-8000-0000000000b2');
select private.generate_billing_run('c8f00000-0000-4000-8000-0000000000b1',
  extract(year from private.today())::smallint, extract(month from private.today())::smallint);
select set_config('test.run', (select id::text from public.billing_runs where center_id = 'c8f00000-0000-4000-8000-0000000000b1'), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.confirm_billing_run(current_setting('test.run')::uuid);
reset role;
update public.invoices set due_date = private.today() - 1
where billing_run_id = current_setting('test.run')::uuid;
select set_config('test.x_maths', (select i.id::text from public.invoices i join public.enrollments e on e.id = i.enrollment_id
  where i.billing_run_id = current_setting('test.run')::uuid and i.student_id = '58f00000-0000-4000-8000-0000000000b1'
    and e.subject_id = 'e8f00000-0000-4000-8000-0000000000b1'), true);
select set_config('test.x_english', (select i.id::text from public.invoices i join public.enrollments e on e.id = i.enrollment_id
  where i.billing_run_id = current_setting('test.run')::uuid and i.student_id = '58f00000-0000-4000-8000-0000000000b1'
    and e.subject_id = 'e8f00000-0000-4000-8000-0000000000b2'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.record_payment('58f00000-0000-4000-8000-0000000000b1', array[current_setting('test.x_maths')::uuid], 'cash');
select results_eq(
  $$select amount_due, invoice_ids, reminder_type::text from public.payment_reminder_queue()
    where student_id = '58f00000-0000-4000-8000-0000000000b1'$$,
  $$values (250.50::numeric, array[current_setting('test.x_english')::uuid], 'overdue')$$,
  'une matière réglée : seule la facture restante est rappelée, pour son montant');
select ok(public.record_payment_reminder(current_setting('test.run')::uuid, '58f00000-0000-4000-8000-0000000000b1',
  private.today() - 1, 'whatsapp', 'Bonjour', '0612345678', 'default') is not null, 'rappel envoyé');
reset role;
select results_eq(
  $$select invoice_id, amount_reminded from public.payment_reminders where student_id = '58f00000-0000-4000-8000-0000000000b1'$$,
  $$values (current_setting('test.x_english')::uuid, 250.50::numeric)$$,
  'le rappel ne couvre que la facture due, jamais celle déjà réglée');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000004","role":"authenticated"}';
select set_config('test.x_receipt', (select id::text from public.record_payment('58f00000-0000-4000-8000-0000000000b1',
  array[current_setting('test.x_english')::uuid], 'cash')), true);
select results_eq(
  $$select student_id from public.payment_reminder_queue() order by full_name$$,
  $$values ('58f00000-0000-4000-8000-0000000000b2'::uuid)$$,
  'tout réglé : l''élève sort de la file ; l''élève témoin y reste');
select throws_ok($$select public.record_payment_reminder(current_setting('test.run')::uuid, '58f00000-0000-4000-8000-0000000000b1',
  private.today() - 1, 'whatsapp')$$, '23514', null, 'facture soldée : rappel refusé');
select throws_ok($$select public.record_payment_reminder(current_setting('test.run')::uuid, '58f00000-0000-4000-8000-0000000000b1',
  private.today() - 1, 'phone_call', null, null, null, true)$$, '23514', null, 'facture soldée : relance explicite refusée aussi');
reset role;
set local role service_role;
select throws_ok($$insert into public.payment_reminders (student_id, center_id, invoice_id, message_id, reminder_type, channel)
  values ('58f00000-0000-4000-8000-0000000000b1', 'c8f00000-0000-4000-8000-0000000000b1', current_setting('test.x_english')::uuid,
          gen_random_uuid(), 'overdue', 'whatsapp')$$, '23514', null, 'clé de service : aucun rappel inscrit sur une facture soldée');
reset role;

-- Paiement annulé : la facture redevient due et revient dans la file.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.cancel_receipt(current_setting('test.x_receipt')::uuid, 'Chèque refusé');
set local request.jwt.claims = '{"sub":"a8f00000-0000-4000-8000-000000000004","role":"authenticated"}';
select results_eq(
  $$select amount_due, invoice_ids from public.payment_reminder_queue() where student_id = '58f00000-0000-4000-8000-0000000000b1'$$,
  $$values (250.50::numeric, array[current_setting('test.x_english')::uuid])$$,
  'paiement annulé : la facture redevient due et revient dans la file');
reset role;

-- =====================================================================
-- 4. Campagne confirmée : lignes et intentions verrouillées
-- =====================================================================
select throws_ok($$update public.billing_run_lines set invoice_id = current_setting('test.x_english')::uuid
  where billing_run_id = current_setting('test.run')::uuid and invoice_id = current_setting('test.x_maths')::uuid$$, '23514', null,
  'ligne : jamais rattachée à la facture d''une autre inscription du même élève');
update public.reenrollment_intents set decided_by = null
where billing_run_id = current_setting('test.run')::uuid and student_id = '58f00000-0000-4000-8000-0000000000b1';
select throws_ok($$update public.reenrollment_intents set decided_by = 'a8f00000-0000-4000-8000-000000000004'
  where billing_run_id = current_setting('test.run')::uuid and student_id = '58f00000-0000-4000-8000-0000000000b1'$$, '42501', null,
  'intention confirmée : aucun auteur ajouté après coup');

-- =====================================================================
-- 5. Modèles de message : ils survivent à un changement de vocabulaire
-- =====================================================================
-- Modèles enregistrés par un centre de formation (forme « [stagiaire] », avant la forme d'origine).
update public.centers set center_type = 'centre_formation' where id = 'c8f00000-0000-4000-8000-0000000000a1';
update public.centers
set reminder_template_overdue = 'Bonjour, [stagiaire] doit [montant] pour [modules].',
    absence_notification_template = '[stagiaire] absent en [module] avec [formateur].',
    receipt_whatsapp_template = 'Reçu de [stagiaire] : [lien]'
where id = 'c8f00000-0000-4000-8000-0000000000a1';
update public.centers set center_type = 'institut_langue' where id = 'c8f00000-0000-4000-8000-0000000000a1';
select results_eq(
  $$select reminder_template_overdue, absence_notification_template, receipt_whatsapp_template
    from public.centers where id = 'c8f00000-0000-4000-8000-0000000000a1'$$,
  $$values ('Bonjour, [élève] doit [montant] pour [matières].', '[élève] absent en [matière] avec [professeur].', 'Reçu de [élève] : [lien]')$$,
  'changement de type de centre : modèles ramenés à la forme d''origine des variables (ancien vocabulaire)');
-- Termes personnalisés : même règle (« Apprenant » → « Stagiaire »).
update public.centers
set absence_notification_template = '[apprenant] absent en [langue] avec [enseignant].'
where id = 'c8f00000-0000-4000-8000-0000000000a1';
update public.centers set custom_terms = '{"learner": {"singular": "Stagiaire", "plural": "Stagiaires", "gender": "m"}}'
where id = 'c8f00000-0000-4000-8000-0000000000a1';
select is((select absence_notification_template from public.centers where id = 'c8f00000-0000-4000-8000-0000000000a1'),
  '[élève] absent en [matière] avec [professeur].', 'termes personnalisés modifiés : modèles ramenés à la forme d''origine');
-- Autre modification du centre : modèles inchangés.
update public.centers set absence_notification_template = '[stagiaire] absent.' where id = 'c8f00000-0000-4000-8000-0000000000a1';
update public.centers set name = 'Centre Y bis' where id = 'c8f00000-0000-4000-8000-0000000000a1';
select is((select absence_notification_template from public.centers where id = 'c8f00000-0000-4000-8000-0000000000a1'),
  '[stagiaire] absent.', 'autre modification du centre : modèles inchangés');
-- Vocabulaire par défaut (soutien scolaire) : la forme d'origine ne bouge pas.
update public.centers set center_type = 'soutien_scolaire', custom_terms = '{}',
  reminder_template_overdue = '[élève] : [matières]' where id = 'c8f00000-0000-4000-8000-0000000000b1';
update public.centers set center_type = 'auto_ecole' where id = 'c8f00000-0000-4000-8000-0000000000b1';
select is((select reminder_template_overdue from public.centers where id = 'c8f00000-0000-4000-8000-0000000000b1'),
  '[élève] : [matières]', 'depuis le vocabulaire par défaut : modèle inchangé');
select is(private.canonical_template('[cours] / [cours] / [encadrant]', (select terms from public.center_types where code = 'personnalise'), 'reminder'),
  '[matières] / [matières] / [encadrant]', 'même terme au singulier et au pluriel : chaque modèle selon ses variables');

select * from finish();
rollback;
