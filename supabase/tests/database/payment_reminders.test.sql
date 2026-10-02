-- =====================================================================
-- Réinscription (page 8, phase 4) : rappels de paiement au tuteur
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email) values
  ('a4c00000-0000-4000-8000-000000000001', 'admin-m-p84@test.local'),
  ('a4c00000-0000-4000-8000-000000000002', 'accueil-m-p84@test.local'),
  ('a4c00000-0000-4000-8000-000000000003', 'prof-m-p84@test.local'),
  ('a4c00000-0000-4000-8000-000000000004', 'admin-n-p84@test.local'),
  ('a4c00000-0000-4000-8000-000000000009', 'owner-p84@test.local');
insert into public.centers (id, name, slug, auto_reenrollment_enabled, payment_due_day) values
  ('c4c00000-0000-4000-8000-0000000000a1', 'Centre M', 'p84-m', true, 1),
  ('c4c00000-0000-4000-8000-0000000000b1', 'Centre N', 'p84-n', true, 5);
insert into public.profiles (id, center_id, full_name, role) values
  ('a4c00000-0000-4000-8000-000000000001', 'c4c00000-0000-4000-8000-0000000000a1', 'Admin M', 'admin'),
  ('a4c00000-0000-4000-8000-000000000002', 'c4c00000-0000-4000-8000-0000000000a1', 'Accueil M', 'assistant'),
  ('a4c00000-0000-4000-8000-000000000003', 'c4c00000-0000-4000-8000-0000000000a1', 'Prof M', 'teacher'),
  ('a4c00000-0000-4000-8000-000000000004', 'c4c00000-0000-4000-8000-0000000000b1', 'Admin N', 'admin'),
  ('a4c00000-0000-4000-8000-000000000009', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values
  ('d4c00000-0000-4000-8000-0000000000a1', 'c4c00000-0000-4000-8000-0000000000a1', 'Niveau M');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e4c00000-0000-4000-8000-000000000001', 'c4c00000-0000-4000-8000-0000000000a1', 'd4c00000-0000-4000-8000-0000000000a1', 'Maths', 300),
  ('e4c00000-0000-4000-8000-000000000002', 'c4c00000-0000-4000-8000-0000000000a1', 'd4c00000-0000-4000-8000-0000000000a1', 'Anglais', 250);
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('54c00000-0000-4000-8000-000000000001', 'c4c00000-0000-4000-8000-0000000000a1', 'Élève 1 retard', 'd4c00000-0000-4000-8000-0000000000a1', '0612345678'),
  ('54c00000-0000-4000-8000-000000000002', 'c4c00000-0000-4000-8000-0000000000a1', 'Élève 2 échéance', 'd4c00000-0000-4000-8000-0000000000a1', '0612345679'),
  ('54c00000-0000-4000-8000-000000000003', 'c4c00000-0000-4000-8000-0000000000a1', 'Élève 3 bientôt', 'd4c00000-0000-4000-8000-0000000000a1', null),
  ('54c00000-0000-4000-8000-000000000004', 'c4c00000-0000-4000-8000-0000000000a1', 'Élève 4 plus tard', 'd4c00000-0000-4000-8000-0000000000a1', null),
  ('54c00000-0000-4000-8000-000000000005', 'c4c00000-0000-4000-8000-0000000000a1', 'Élève 5 à jour', 'd4c00000-0000-4000-8000-0000000000a1', null);
insert into public.enrollments (id, student_id, subject_id, start_date, billing_day) values
  ('64c00000-0000-4000-8000-000000000011', '54c00000-0000-4000-8000-000000000001', 'e4c00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('64c00000-0000-4000-8000-000000000021', '54c00000-0000-4000-8000-000000000002', 'e4c00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('64c00000-0000-4000-8000-000000000022', '54c00000-0000-4000-8000-000000000002', 'e4c00000-0000-4000-8000-000000000002', '2026-09-01', 1),
  ('64c00000-0000-4000-8000-000000000031', '54c00000-0000-4000-8000-000000000003', 'e4c00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('64c00000-0000-4000-8000-000000000041', '54c00000-0000-4000-8000-000000000004', 'e4c00000-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('64c00000-0000-4000-8000-000000000051', '54c00000-0000-4000-8000-000000000005', 'e4c00000-0000-4000-8000-000000000001', '2026-09-01', 1);
-- Premières factures (septembre) réglées : seule la campagne d'octobre reste due.
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now()
where student_id in (select id from public.students where center_id = 'c4c00000-0000-4000-8000-0000000000a1');

-- Campagne d'octobre (mois en cours), confirmée par l'admin.
select private.generate_billing_run('c4c00000-0000-4000-8000-0000000000a1', 2026::smallint, 10::smallint);
select set_config('test.run_id', (select id::text from public.billing_runs where center_id = 'c4c00000-0000-4000-8000-0000000000a1'), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000001', '2026-10-01', 'whatsapp')$$, '22023', null,
  'brouillon : pas de rappel avant la confirmation');
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.confirm_billing_run(current_setting('test.run_id')::uuid);
reset role;
-- Échéances posées pour couvrir les trois vagues (aujourd'hui : private.today()).
update public.invoices set due_date = private.today() - 1 where student_id = '54c00000-0000-4000-8000-000000000001';
update public.invoices set due_date = private.today() where student_id = '54c00000-0000-4000-8000-000000000002';
update public.invoices set due_date = private.today() + 2 where student_id = '54c00000-0000-4000-8000-000000000003';
update public.invoices set due_date = private.today() + 20 where student_id = '54c00000-0000-4000-8000-000000000004';
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now()
where student_id = '54c00000-0000-4000-8000-000000000005' and billing_run_id is not null;

-- ---------------------------------------------------------------------
-- File des rappels
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000002","role":"authenticated"}';
select results_eq(
  $$select full_name, reminder_type::text, suggested, amount_due from public.payment_reminder_queue() order by full_name$$,
  $$values ('Élève 1 retard', 'overdue', true, 300.00::numeric), ('Élève 2 échéance', 'due_today', true, 550.00::numeric),
           ('Élève 3 bientôt', 'upcoming', true, 300.00::numeric), ('Élève 4 plus tard', 'upcoming', false, 300.00::numeric)$$,
  'trois vagues ; l''élève à jour n''est jamais rappelé ; avant échéance conseillé dans les 3 jours');
select is((select days_overdue from public.payment_reminder_queue() where student_id = '54c00000-0000-4000-8000-000000000001'), 1,
  'en retard depuis le lendemain de l''échéance : 1 jour');
select is((select cardinality(invoice_ids) from public.payment_reminder_queue() where student_id = '54c00000-0000-4000-8000-000000000002'), 2,
  'un message par élève et par échéance, toutes ses matières dues ce jour-là');

-- ---------------------------------------------------------------------
-- Envoi
-- ---------------------------------------------------------------------
select ok(public.record_payment_reminder(current_setting('test.run_id')::uuid, '54c00000-0000-4000-8000-000000000002',
  private.today(), 'whatsapp', 'Bonjour…', '0612345679', 'default') is not null, 'accueil : rappel WhatsApp enregistré');
reset role;
select results_eq(
  $$select count(*)::int, count(distinct message_id)::int, bool_and(reminder_type = 'due_today'), bool_and(sent_by = 'a4c00000-0000-4000-8000-000000000002'),
           bool_and(center_id = 'c4c00000-0000-4000-8000-0000000000a1'), bool_and(billing_run_id = current_setting('test.run_id')::uuid)
    from public.payment_reminders where student_id = '54c00000-0000-4000-8000-000000000002'$$,
  $$values (2, 1, true, true, true, true)$$,
  'une ligne par facture couverte, un seul message, auteur, centre et campagne posés par la base');
select results_eq(
  $$select status::text, sent_at is not null from public.billing_runs where id = current_setting('test.run_id')::uuid$$,
  $$values ('sent', true)$$,
  'premier rappel : la campagne passe à « rappels envoyés »');
select is((select count(*)::int from public.center_events where center_id = 'c4c00000-0000-4000-8000-0000000000a1'
           and action = 'payment_reminder.sent' and actor_id = 'a4c00000-0000-4000-8000-000000000002'), 1,
  'envoi consigné au journal du centre avec son auteur');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000002', private.today(), 'whatsapp')$$, '22023', null,
  'même rappel déjà envoyé : refusé sans « Relancer »');
select lives_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000002', private.today(), 'phone_call', null, null, null, true)$$,
  'relance explicite : acceptée');
select ok((select last_sent_at is not null and last_channel = 'phone_call' from public.payment_reminder_queue()
           where student_id = '54c00000-0000-4000-8000-000000000002'), 'file : dernier envoi et moyen affichés');
reset role;

-- Facture réglée entre l'affichage de la file et l'envoi : rien n'est envoyé.
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now()
where student_id = '54c00000-0000-4000-8000-000000000003' and billing_run_id is not null;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000003', private.today() + 2, 'whatsapp')$$, '23514', null,
  'facture soldée : aucun rappel');
select is((select count(*)::int from public.payment_reminder_queue() where student_id = '54c00000-0000-4000-8000-000000000003'), 0,
  'facture soldée : sortie de la file');

-- ---------------------------------------------------------------------
-- Un rappel « en retard » est une relance
-- ---------------------------------------------------------------------
select is((select followed_up_today from public.follow_up_queue where student_id = '54c00000-0000-4000-8000-000000000001'), false,
  'élève en retard, pas encore relancé');
select lives_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000001', private.today() - 1, 'in_person')$$, 'rappel en retard noté (vu en personne)');
select results_eq(
  $$select followed_up_today, last_follow_up_at is not null from public.follow_up_queue where student_id = '54c00000-0000-4000-8000-000000000001'$$,
  $$values (true, true)$$,
  'rappel en retard : compté comme relance du jour');
select is((select days_overdue from public.payment_reminders where student_id = '54c00000-0000-4000-8000-000000000001'), 1::smallint,
  'jours de retard consignés avec le rappel');

-- ---------------------------------------------------------------------
-- Accès
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select * from public.payment_reminder_queue()$$, '42501', null, 'professeur : pas de file des rappels');
select throws_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000004', private.today() + 20, 'whatsapp')$$, '42501', null, 'professeur : aucun envoi');
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.payment_reminder_queue()), 0, 'admin d''un autre centre : file vide');
select throws_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000004', private.today() + 20, 'whatsapp')$$, '42501', null,
  'admin d''un autre centre : aucun envoi');
reset role;
insert into public.support_sessions (actor_id, center_id, reason, expires_at)
values ('a4c00000-0000-4000-8000-000000000009', 'c4c00000-0000-4000-8000-0000000000a1', 'Test', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000009","role":"authenticated"}';
select throws_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000004', private.today() + 20, 'whatsapp')$$, '42501', 'Mode support : lecture seule.',
  'support : lecture seule');
reset role;

-- Rappels désactivés : file vide, envoi refusé.
select set_config('request.jwt.claims', '', true);
update public.centers set payment_reminders_enabled = false where id = 'c4c00000-0000-4000-8000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4c00000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.payment_reminder_queue()), 0, 'rappels désactivés : file vide');
select throws_ok($$select public.record_payment_reminder(current_setting('test.run_id')::uuid,
  '54c00000-0000-4000-8000-000000000004', private.today() + 20, 'whatsapp')$$, '22023', null,
  'rappels désactivés : envoi refusé');
reset role;

select * from finish();
rollback;
