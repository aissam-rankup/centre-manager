-- =====================================================================
-- Réinscription et caisse (page 8, phase 1) : schéma, règles figées, droits
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(68);

insert into auth.users (id, email) values
  ('a1800000-0000-4000-8000-000000000001', 'admin-p8@test.local'),
  ('a1800000-0000-4000-8000-000000000002', 'accueil1-p8@test.local'),
  ('a1800000-0000-4000-8000-000000000003', 'accueil2-p8@test.local'),
  ('a1800000-0000-4000-8000-000000000004', 'prof-p8@test.local'),
  ('a1800000-0000-4000-8000-000000000005', 'owner-p8@test.local'),
  ('a1800000-0000-4000-8000-000000000006', 'admin-autre-p8@test.local');
insert into public.centers (id, name, slug) values
  ('c1800000-0000-4000-8000-000000000001', 'Centre P8', 'centre-p8'),
  ('c1800000-0000-4000-8000-000000000002', 'Autre P8', 'autre-p8');
insert into public.profiles (id, center_id, full_name, role) values
  ('a1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'Admin', 'admin'),
  ('a1800000-0000-4000-8000-000000000002', 'c1800000-0000-4000-8000-000000000001', 'Accueil Un', 'assistant'),
  ('a1800000-0000-4000-8000-000000000003', 'c1800000-0000-4000-8000-000000000001', 'Accueil Deux', 'assistant'),
  ('a1800000-0000-4000-8000-000000000004', 'c1800000-0000-4000-8000-000000000001', 'Prof', 'teacher'),
  ('a1800000-0000-4000-8000-000000000005', null, 'Propriétaire', 'super_admin'),
  ('a1800000-0000-4000-8000-000000000006', 'c1800000-0000-4000-8000-000000000002', 'Admin Autre', 'admin');
insert into public.levels (id, center_id, name) values
  ('d1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'Niveau'),
  ('d1800000-0000-4000-8000-000000000002', 'c1800000-0000-4000-8000-000000000002', 'Niveau autre');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000001', 'Maths', 300),
  ('e1800000-0000-4000-8000-000000000002', 'c1800000-0000-4000-8000-000000000002', 'd1800000-0000-4000-8000-000000000002', 'Maths autre', 300);
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('51800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'Élève P8', 'd1800000-0000-4000-8000-000000000001', '0612345678'),
  ('51800000-0000-4000-8000-000000000002', 'c1800000-0000-4000-8000-000000000002', 'Élève autre', 'd1800000-0000-4000-8000-000000000002', '0612345679');
-- Inscriptions : la première facture est créée par trigger (non réglée).
insert into public.enrollments (id, student_id, subject_id) values
  ('61800000-0000-4000-8000-000000000001', '51800000-0000-4000-8000-000000000001', 'e1800000-0000-4000-8000-000000000001'),
  ('61800000-0000-4000-8000-000000000002', '51800000-0000-4000-8000-000000000002', 'e1800000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------
-- Réglages du centre
-- ---------------------------------------------------------------------
select results_eq(
  $$select auto_reenrollment_enabled, billing_generation_day, payment_due_day, reminder_days_before,
           payment_reminders_enabled, risk_attendance_threshold, cash_session_per_assistant, cash_variance_alert_threshold
    from public.centers where id = 'c1800000-0000-4000-8000-000000000001'$$,
  $$values (false, 25::smallint, 5::smallint, 3::smallint, true, 75::smallint, false, 50.00::numeric)$$,
  'réglages par défaut : réinscription désactivée, préparation le 25, échéance le 5, rappel 3 jours avant');
select throws_ok(
  $$update public.centers set billing_generation_day = 29 where id = 'c1800000-0000-4000-8000-000000000001'$$,
  '23514', null, 'jour de préparation limité à 28 (tous les mois l''ont)');
select ok('cheque' = any (enum_range(null::public.payment_method)::text[]), 'le chèque est un mode de paiement');

-- ---------------------------------------------------------------------
-- Campagne : brouillon, confirmation, figée
-- ---------------------------------------------------------------------
insert into public.billing_runs (id, center_id, period_year, period_month, total_expected, student_count)
values ('b1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 2026, 11, 300, 1);
select throws_ok(
  $$insert into public.billing_runs (center_id, period_year, period_month) values ('c1800000-0000-4000-8000-000000000001', 2026, 11)$$,
  '23505', null, 'une seule campagne par centre et par mois');
select throws_ok(
  $$insert into public.billing_run_lines (billing_run_id, center_id, student_id, enrollment_id, period_start, period_end, due_date, amount_full, discount_amount, amount_due)
    values ('b1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', '51800000-0000-4000-8000-000000000001',
            '61800000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30', '2026-11-05', 300, 30, 300)$$,
  '23514', null, 'ligne : net = tarif − remise');
select throws_ok(
  $$insert into public.billing_run_lines (billing_run_id, center_id, student_id, enrollment_id, period_start, period_end, due_date, amount_full, amount_due)
    values ('b1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', '51800000-0000-4000-8000-000000000001',
            '61800000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30', '2026-12-05', 300, 300)$$,
  '23514', null, 'ligne : échéance dans la période');
select throws_ok(
  $$insert into public.billing_run_lines (billing_run_id, center_id, student_id, enrollment_id, period_start, period_end, due_date, amount_full, amount_due)
    values ('b1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', '51800000-0000-4000-8000-000000000002',
            '61800000-0000-4000-8000-000000000002', '2026-11-01', '2026-11-30', '2026-11-05', 300, 300)$$,
  '23503', null, 'ligne : élève d''un autre centre refusé');
insert into public.billing_run_lines (id, billing_run_id, center_id, student_id, enrollment_id, period_start, period_end, due_date, amount_full, discount_amount, amount_due)
values ('b2800000-0000-4000-8000-000000000001', 'b1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001',
        '51800000-0000-4000-8000-000000000001', '61800000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30', '2026-11-05', 300, 30, 270);
insert into public.reenrollment_intents (id, center_id, billing_run_id, student_id, period_year, period_month)
values ('b3800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'b1800000-0000-4000-8000-000000000001',
        '51800000-0000-4000-8000-000000000001', 1999, 1);
select is((select period_year * 100 + period_month from public.reenrollment_intents where id = 'b3800000-0000-4000-8000-000000000001'),
  202611, 'intention : période reprise de sa campagne');
select throws_ok(
  $$update public.reenrollment_intents set intent = 'dropped' where id = 'b3800000-0000-4000-8000-000000000001'$$,
  '23514', null, 'intention décidée : date de décision obligatoire');
update public.reenrollment_intents set intent = 'confirmed', decided_at = now(), subjects_kept = '[{"subject_id": "e1800000-0000-4000-8000-000000000001"}]'
where id = 'b3800000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.billing_runs set status = 'closed', closed_at = now() where id = 'b1800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'brouillon : pas de clôture directe');
select throws_ok(
  $$update public.billing_runs set status = 'confirmed' where id = 'b1800000-0000-4000-8000-000000000001'$$,
  '23514', null, 'confirmation : date obligatoire');
select lives_ok(
  $$update public.billing_runs set status = 'confirmed', confirmed_at = now(), confirmed_by = 'a1800000-0000-4000-8000-000000000001'
    where id = 'b1800000-0000-4000-8000-000000000001'$$,
  'brouillon → confirmée');
select throws_ok(
  $$update public.billing_runs set total_expected = 999 where id = 'b1800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'confirmée : total figé');
select throws_ok(
  $$update public.billing_runs set confirmed_by = 'a1800000-0000-4000-8000-000000000002' where id = 'b1800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'confirmée : son auteur ne change pas');
select throws_ok(
  $$insert into public.reenrollment_intents (center_id, billing_run_id, student_id, period_year, period_month)
    values ('c1800000-0000-4000-8000-000000000001', 'b1800000-0000-4000-8000-000000000001', '51800000-0000-4000-8000-000000000003', 2026, 11)$$,
  '42501', null, 'confirmée : aucune intention ne s''y ajoute');
select throws_ok(
  $$delete from public.billing_run_lines where id = 'b2800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'confirmée : ses lignes ne se suppriment pas');
select throws_ok(
  $$update public.billing_run_lines set amount_full = 400, amount_due = 370 where id = 'b2800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'confirmée : montants des lignes figés');
select lives_ok(
  $$update public.billing_run_lines set invoice_id = (select id from public.invoices where enrollment_id = '61800000-0000-4000-8000-000000000001' limit 1)
    where id = 'b2800000-0000-4000-8000-000000000001'$$,
  'confirmée : la facture émise se rattache à sa ligne');
insert into public.billing_runs (id, center_id, period_year, period_month)
values ('b1800000-0000-4000-8000-000000000003', 'c1800000-0000-4000-8000-000000000002', 2026, 11);
select throws_ok(
  $$update public.invoices set billing_run_id = 'b1800000-0000-4000-8000-000000000003' where enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  '23514', null, 'facture : jamais rattachée à la campagne d''un autre centre');
update public.invoices set billing_run_id = 'b1800000-0000-4000-8000-000000000001' where enrollment_id = '61800000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1800000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$update public.invoices set billing_run_id = null where enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'accueil : ne détache pas une facture de sa campagne');
set local request.jwt.claims = '{"sub":"a1800000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$update public.invoices set amount_due = 1, discount_amount = amount_full - 1 where enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin : montant d''une facture de campagne figé');
select throws_ok(
  $$delete from public.invoices where enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin : facture de campagne non supprimable');
reset role;
select throws_ok(
  $$update public.reenrollment_intents set intent = 'paused' where id = 'b3800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'confirmée : intentions figées');
select lives_ok(
  $$update public.reenrollment_intents set applied_at = now() where id = 'b3800000-0000-4000-8000-000000000001'$$,
  'confirmée : l''intention s''applique au début de la période');
select throws_ok(
  $$update public.billing_runs set status = 'sent' where id = 'b1800000-0000-4000-8000-000000000001'$$,
  '23514', null, 'envoyée : date du premier rappel obligatoire');
select lives_ok(
  $$update public.billing_runs set status = 'sent', sent_at = now() where id = 'b1800000-0000-4000-8000-000000000001'$$,
  'confirmée → envoyée');

insert into public.billing_runs (id, center_id, period_year, period_month)
values ('b1800000-0000-4000-8000-000000000002', 'c1800000-0000-4000-8000-000000000001', 2027, 7);
select throws_ok(
  $$update public.billing_runs set status = 'cancelled', cancelled_at = now() where id = 'b1800000-0000-4000-8000-000000000002'$$,
  '23514', null, 'mois sans campagne : motif obligatoire');
update public.billing_runs set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Vacances d''été'
where id = 'b1800000-0000-4000-8000-000000000002';
select throws_ok(
  $$update public.billing_runs set status = 'draft' where id = 'b1800000-0000-4000-8000-000000000002'$$,
  '42501', null, 'campagne annulée : définitive');

-- ---------------------------------------------------------------------
-- Rappels de paiement
-- ---------------------------------------------------------------------
select set_config('p8.other_invoice', (select id::text from public.invoices where enrollment_id = '61800000-0000-4000-8000-000000000002'), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1800000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$insert into public.payment_reminders (student_id, center_id, invoice_id, message_id, reminder_type, channel)
    select '51800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', i.id, gen_random_uuid(), 'upcoming', 'whatsapp'
    from public.invoices i where i.enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'accueil : pas d''écriture directe (envoi par la fonction dédiée)');
-- Le déclencheur, dernier rempart de la fonction d'envoi, est testé avec les droits du propriétaire.
reset role;
select lives_ok(
  $$insert into public.payment_reminders (student_id, center_id, invoice_id, message_id, reminder_type, channel, message_body)
    select '51800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000002', i.id, gen_random_uuid(), 'upcoming', 'whatsapp', 'Bonjour'
    from public.invoices i where i.enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  'rappel consigné');
select results_eq(
  $$select center_id::text, sent_by::text, billing_run_id is null from public.payment_reminders where student_id = '51800000-0000-4000-8000-000000000001'$$,
  $$values ('c1800000-0000-4000-8000-000000000001', 'a1800000-0000-4000-8000-000000000002', false)$$,
  'rappel : centre, auteur et campagne de la facture posés par la base');
select throws_ok(
  $$insert into public.payment_reminders (student_id, center_id, invoice_id, message_id, reminder_type, channel)
    select '51800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', i.id, gen_random_uuid(), 'upcoming', 'whatsapp'
    from public.invoices i where i.enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  '23505', null, 'même rappel deux fois : refusé');
select lives_ok(
  $$insert into public.payment_reminders (student_id, center_id, invoice_id, message_id, reminder_type, channel, is_repeat)
    select '51800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', i.id, gen_random_uuid(), 'upcoming', 'phone_call', true
    from public.invoices i where i.enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  'relance explicite : acceptée');
select throws_ok(
  $$insert into public.payment_reminders (student_id, center_id, invoice_id, message_id, reminder_type, channel)
    values ('51800000-0000-4000-8000-000000000002', 'c1800000-0000-4000-8000-000000000002',
            current_setting('p8.other_invoice')::uuid, gen_random_uuid(), 'overdue', 'whatsapp')$$,
  '42501', null, 'accueil : aucun rappel pour l''élève d''un autre centre');
set local role authenticated;
select throws_ok($$update public.payment_reminders set message_body = 'Modifié'$$, '42501', null, 'rappel : journal non modifiable');
reset role;
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now(), payment_method = 'cash'
where enrollment_id = '61800000-0000-4000-8000-000000000001';
select throws_ok(
  $$insert into public.payment_reminders (student_id, center_id, invoice_id, message_id, reminder_type, channel)
    select '51800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', i.id, gen_random_uuid(), 'overdue', 'whatsapp'
    from public.invoices i where i.enrollment_id = '61800000-0000-4000-8000-000000000001'$$,
  '23514', 'Facture déjà réglée : aucun rappel.', 'facture réglée : jamais de rappel');

-- ---------------------------------------------------------------------
-- Caisse : une session ouverte par jour, figée à la clôture
-- ---------------------------------------------------------------------
insert into public.cash_sessions (id, center_id, opening_float, opened_by)
values ('c2800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 200, 'a1800000-0000-4000-8000-000000000002');
select throws_ok(
  $$insert into public.cash_sessions (center_id) values ('c1800000-0000-4000-8000-000000000001')$$,
  '23505', null, 'une seule session commune ouverte par jour');
insert into public.cash_sessions (id, center_id, is_shared, assistant_id, opened_by) values
  ('c2800000-0000-4000-8000-000000000002', 'c1800000-0000-4000-8000-000000000001', false, 'a1800000-0000-4000-8000-000000000002', 'a1800000-0000-4000-8000-000000000002'),
  ('c2800000-0000-4000-8000-000000000003', 'c1800000-0000-4000-8000-000000000001', false, 'a1800000-0000-4000-8000-000000000003', 'a1800000-0000-4000-8000-000000000003');
select throws_ok(
  $$insert into public.cash_sessions (center_id, is_shared, assistant_id)
    values ('c1800000-0000-4000-8000-000000000001', false, 'a1800000-0000-4000-8000-000000000002')$$,
  '23505', null, 'une seule session personnelle ouverte par assistant et par jour');
select throws_ok(
  $$insert into public.cash_sessions (center_id, is_shared, assistant_id)
    values ('c1800000-0000-4000-8000-000000000001', false, 'a1800000-0000-4000-8000-000000000006')$$,
  '23503', null, 'session personnelle : assistant du même centre uniquement');
select throws_ok(
  $$update public.cash_sessions set status = 'validated', validated_at = now(), validated_by = 'a1800000-0000-4000-8000-000000000001'
    where id = 'c2800000-0000-4000-8000-000000000003'$$,
  '42501', null, 'session ouverte : pas de validation sans clôture');
select is((select count(*)::int from public.cash_sessions where center_id = 'c1800000-0000-4000-8000-000000000001' and status = 'open'), 3,
  'mode par assistant : une session ouverte chacun');

-- Encaissement rattaché à la session ouverte.
insert into public.receipts (id, center_id, student_id, receipt_year, receipt_seq, amount_full, amount_paid, period_start, period_end,
                             subjects_covered, payment_method, student_name, center_snapshot, cash_session_id)
values ('c3800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', '51800000-0000-4000-8000-000000000001',
        2026, 9001, 300, 300, '2026-10-01', '2026-10-31', '[]', 'cash', 'Élève P8', '{}', 'c2800000-0000-4000-8000-000000000001');
select throws_ok(
  $$update public.receipts set cash_session_id = 'c2800000-0000-4000-8000-000000000002' where id = 'c3800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'encaissement : sa session ne change plus');
insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason)
values ('c1800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000001', 'bank_deposit', -100, 'Dépôt en banque');
select throws_ok(
  $$insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason)
    values ('c1800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000001', 'expense', 40, 'Craies')$$,
  '23514', null, 'sortie de caisse : montant négatif');
insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason)
values ('c1800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000001', 'teacher_pay', -500, 'Paie Prof octobre');
select throws_ok(
  $$update public.cash_movements set amount = -1 where kind = 'bank_deposit' and center_id = 'c1800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'mouvement : ne se modifie pas');
select throws_ok(
  $$delete from public.cash_movements where kind = 'bank_deposit' and center_id = 'c1800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'mouvement : ne se supprime pas');
select throws_ok(
  $$insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason, corrects_session_id)
    values ('c1800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000001', 'correction', 5, 'Test',
            'c2800000-0000-4000-8000-000000000002')$$,
  '23514', null, 'correction : seulement sur une session clôturée');
select throws_ok(
  $$update public.cash_sessions set status = 'closed', closed_at = now(), expected_cash = 400, counted_cash = 390, variance = -10,
      expected_by_method = '{"cash": 300}' where id = 'c2800000-0000-4000-8000-000000000001'$$,
  '23514', null, 'écart sans motif : clôture refusée');
select throws_ok(
  $$update public.cash_sessions set status = 'closed', closed_at = now(), expected_cash = 400, counted_cash = 390, variance = 10,
      variance_reason = 'Erreur', expected_by_method = '{"cash": 300}' where id = 'c2800000-0000-4000-8000-000000000001'$$,
  '23514', null, 'écart = compté − attendu');
select lives_ok(
  $$update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = 'a1800000-0000-4000-8000-000000000002',
      expected_cash = 400, counted_cash = 390, variance = -10, variance_reason = 'Monnaie rendue en trop',
      expected_by_method = '{"cash": 300, "bank_transfer": 0, "card": 0, "cheque": 0}'
    where id = 'c2800000-0000-4000-8000-000000000001'$$,
  'clôture avec écart motivé');
select throws_ok(
  $$update public.cash_sessions set counted_cash = 400, variance = 0 where id = 'c2800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'clôturée : le comptage ne se corrige plus');
select throws_ok(
  $$insert into public.receipts (center_id, receipt_year, receipt_seq, amount_full, amount_paid, period_start, period_end,
                                 subjects_covered, payment_method, student_name, center_snapshot, cash_session_id)
    values ('c1800000-0000-4000-8000-000000000001', 2026, 9002, 50, 50, '2026-10-01', '2026-10-31', '[]', 'cash', 'X', '{}',
            'c2800000-0000-4000-8000-000000000001')$$,
  '42501', null, 'clôturée : aucun encaissement ne s''y ajoute');
select throws_ok(
  $$insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason)
    values ('c1800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000001', 'refund', -10, 'Remboursement')$$,
  '42501', null, 'clôturée : aucun mouvement ne s''y ajoute');
select lives_ok(
  $$insert into public.cash_sessions (center_id, opening_float) values ('c1800000-0000-4000-8000-000000000001', 50)$$,
  'après la clôture, une nouvelle session commune peut s''ouvrir le même jour');
select lives_ok(
  $$insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason, corrects_session_id)
    select 'c1800000-0000-4000-8000-000000000001', id, 'correction', 10, 'Billet retrouvé', 'c2800000-0000-4000-8000-000000000001'
    from public.cash_sessions where center_id = 'c1800000-0000-4000-8000-000000000001' and status = 'open' and assistant_id is null$$,
  'correction après clôture : opération du jour liée à la session corrigée');
select lives_ok(
  $$update public.cash_sessions set status = 'validated', validated_at = now(), validated_by = 'a1800000-0000-4000-8000-000000000001'
    where id = 'c2800000-0000-4000-8000-000000000001'$$,
  'clôturée → validée par l''admin');
select throws_ok(
  $$update public.cash_sessions set notes = 'Après coup' where id = 'c2800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'validée : verrouillée définitivement');

-- ---------------------------------------------------------------------
-- Droits : chacun sa caisse, campagnes à l'accueil et à l'admin
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1800000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.cash_sessions), 3, 'accueil 1 : sessions communes et la sienne, pas celle de l''accueil 2');
select is((select count(*)::int from public.cash_movements), 2, 'accueil 1 : mouvements des sessions visibles, sans la paie');
select is((select count(*)::int from public.cash_movements where kind = 'teacher_pay'), 0, 'accueil : paie des professeurs invisible');
select is((select count(*)::int from public.billing_runs), 2, 'accueil : campagnes du centre visibles');
select throws_ok($$insert into public.billing_runs (center_id, period_year, period_month) values ('c1800000-0000-4000-8000-000000000001', 2027, 1)$$,
  '42501', null, 'accueil : pas de campagne créée hors des fonctions prévues');
select throws_ok($$insert into public.cash_sessions (center_id) values ('c1800000-0000-4000-8000-000000000001')$$,
  '42501', null, 'accueil : pas de session ouverte hors des fonctions prévues');

set local request.jwt.claims = '{"sub":"a1800000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.cash_sessions) + (select count(*)::int from public.billing_runs)
          + (select count(*)::int from public.payment_reminders), 0, 'professeur : ni caisse, ni campagne, ni rappel');

set local request.jwt.claims = '{"sub":"a1800000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.cash_sessions), 4, 'admin : toutes les sessions du centre');
select is((select count(*)::int from public.cash_movements where kind = 'teacher_pay'), 1, 'admin : paie des professeurs visible');
reset role;

insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a1800000-0000-4000-8000-000000000005', 'c1800000-0000-4000-8000-000000000001', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1800000-0000-4000-8000-000000000005","role":"authenticated"}';
select is((select count(*)::int from public.cash_sessions), 0, 'support : caisse invisible (données financières)');
reset role;

select set_config('request.jwt.claims', '', true);
delete from auth.users where id = 'a1800000-0000-4000-8000-000000000003';
select results_eq(
  $$select is_shared, assistant_id is null from public.cash_sessions where id = 'c2800000-0000-4000-8000-000000000003'$$,
  $$values (false, true)$$,
  'compte d''accueil supprimé : sa session reste personnelle (jamais la caisse commune)');
-- Suppression d'un élève : ses lignes de campagne, intentions et rappels partent en cascade.
select lives_ok($$delete from public.students where id = '51800000-0000-4000-8000-000000000001'$$,
  'élève supprimé malgré une campagne confirmée (suppression définitive)');

select * from finish();
rollback;
