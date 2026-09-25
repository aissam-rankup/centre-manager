-- =====================================================================
-- Tests des automatisations — exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
  ('a5000000-0000-4000-8000-000000000001', 'assistant-p7@test.local'),
  ('a5000000-0000-4000-8000-000000000002', 'prof-p7@test.local');
insert into public.centers (id, name) values ('c5000000-0000-4000-8000-000000000001', 'Centre P7');
insert into public.profiles (id, center_id, full_name, role) values
  ('a5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'Assistant P7', 'assistant'),
  ('a5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001', 'Prof P7', 'teacher');
insert into public.levels (id, center_id, name) values
  ('d5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'Niveau P7');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'Maths P7', 400),
  ('e5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'Anglais P7', 250),
  ('e5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'Physique P7', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a5000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000001');
insert into public.students (id, center_id, full_name, level_id) values
  ('f5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'Élève P7', 'd5000000-0000-4000-8000-000000000001');
-- Maths : active, cycle du 1er (inscription le 10/01). Anglais : arrêtée.
insert into public.enrollments (id, student_id, subject_id, start_date, price_agreed, active) values
  ('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', '2026-01-10', 350, true),
  ('b5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', '2026-01-10', 250, false);

-- ---------------------------------------------------------------------
-- Factures mensuelles
-- ---------------------------------------------------------------------
do $$ begin perform private.generate_invoices('2026-03-03'); end $$;
select is(
  (select amount_due from public.invoices
    where enrollment_id = 'b5000000-0000-4000-8000-000000000001' and period_start = '2026-03-01'),
  350.00::numeric, 'factures : période en cours créée au prix convenu');
select is(
  (select due_date from public.invoices
    where enrollment_id = 'b5000000-0000-4000-8000-000000000001' and period_start = '2026-03-01'),
  '2026-03-06'::date, 'factures : échéance au début de période + 5 jours');
select is(
  (select count(*)::int from public.invoices
    where enrollment_id = 'b5000000-0000-4000-8000-000000000001' and period_start = '2026-02-01'),
  0, 'factures : seule la période en cours est créée');
do $$ begin perform private.generate_invoices('2026-03-03'); end $$;
select is(
  (select count(*)::int from public.invoices where enrollment_id = 'b5000000-0000-4000-8000-000000000001'),
  2, 'factures : génération idempotente');
select is(
  (select count(*)::int from public.invoices
    where enrollment_id = 'b5000000-0000-4000-8000-000000000002' and period_start = '2026-03-01'),
  0, 'factures : inscription arrêtée non facturée');

-- ---------------------------------------------------------------------
-- Passage en retard
-- ---------------------------------------------------------------------
do $$ begin perform private.mark_overdue_invoices('2026-03-07'); end $$;
select is(
  (select status::text from public.invoices
    where enrollment_id = 'b5000000-0000-4000-8000-000000000001' and period_start = '2026-03-01'),
  'overdue', 'retard : facture échue passée en overdue');
select is(
  (select count(*)::int from public.alerts a
    join public.invoices i on i.id::text = a.payload ->> 'invoice_id'
    where a.type = 'overdue_payment' and i.enrollment_id = 'b5000000-0000-4000-8000-000000000001'
      and i.period_start = '2026-03-01' and not a.resolved),
  1, 'retard : alerte overdue_payment créée');
update public.invoices set status = 'pending'
where enrollment_id = 'b5000000-0000-4000-8000-000000000001' and period_start = '2026-03-01';
do $$ begin perform private.mark_overdue_invoices('2026-03-07'); end $$;
select is(
  (select count(*)::int from public.alerts a
    join public.invoices i on i.id::text = a.payload ->> 'invoice_id'
    where i.enrollment_id = 'b5000000-0000-4000-8000-000000000001' and i.period_start = '2026-03-01'),
  1, 'retard : pas d''alerte en double');
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now()
where enrollment_id = 'b5000000-0000-4000-8000-000000000001' and period_start = '2026-03-01';
select is(
  (select bool_and(a.resolved) from public.alerts a
    join public.invoices i on i.id::text = a.payload ->> 'invoice_id'
    where i.enrollment_id = 'b5000000-0000-4000-8000-000000000001' and i.period_start = '2026-03-01'),
  true, 'paiement : l''alerte de retard est résolue');

-- ---------------------------------------------------------------------
-- Reprise d'une inscription : période en cours facturée aussitôt
-- ---------------------------------------------------------------------
update public.enrollments set active = true where id = 'b5000000-0000-4000-8000-000000000002';
select is(
  (select due_date from public.invoices
    where enrollment_id = 'b5000000-0000-4000-8000-000000000002'
      and period_start = private.billing_period_start(private.today(), 1::smallint)),
  greatest(private.billing_period_start(private.today(), 1::smallint), private.today()) + 5,
  'reprise : facture de la période en cours, due 5 jours après la reprise');

-- ---------------------------------------------------------------------
-- Absences consécutives
-- ---------------------------------------------------------------------
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-03-02', 'present'),
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-03-09', 'absent'),
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-03-16', 'absent');
select is(
  (select count(*)::int from public.alerts where type = 'consecutive_absences'
    and student_id = 'f5000000-0000-4000-8000-000000000001'),
  0, 'absences : pas d''alerte à 2 absences');

insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-03-23', 'absent');
select is(
  (select (payload ->> 'count')::int from public.alerts where type = 'consecutive_absences'
    and student_id = 'f5000000-0000-4000-8000-000000000001' and not resolved),
  3, 'absences : alerte ouverte à la 3e absence consécutive');

insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-03-30', 'absent');
select results_eq(
  $$select count(*)::int, max((payload ->> 'count')::int) from public.alerts
    where type = 'consecutive_absences' and student_id = 'f5000000-0000-4000-8000-000000000001'$$,
  $$values (1, 4)$$,
  'absences : la 4e absence met à jour la même alerte');

insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-04-06', 'present');
select is(
  (select count(*)::int from public.alerts where type = 'consecutive_absences'
    and student_id = 'f5000000-0000-4000-8000-000000000001' and not resolved),
  0, 'absences : alerte résolue au retour de l''élève');

-- Nouvelle série, traitée par une relance « absence ».
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-04-13', 'absent'),
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-04-20', 'absent'),
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-04-27', 'absent');
insert into public.follow_ups (student_id, type, channel, note, created_by) values
  ('f5000000-0000-4000-8000-000000000001', 'absence', 'phone', 'Parent prévenu.', 'a5000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.alerts where type = 'consecutive_absences'
    and student_id = 'f5000000-0000-4000-8000-000000000001' and not resolved),
  0, 'relance absence : l''alerte est résolue');

insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', null, '2026-05-04', 'absent');
select is(
  (select count(*)::int from public.alerts where type = 'consecutive_absences'
    and student_id = 'f5000000-0000-4000-8000-000000000001' and not resolved),
  0, 'relance absence : la série déjà traitée ne rouvre pas d''alerte');

-- Le professeur (sans droit sur alerts) déclenche l'alerte en faisant l'appel.
insert into public.enrollments (student_id, subject_id, start_date) values
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000003', private.today() - 30);
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000002', private.today() - 14, 'absent'),
  ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000002', private.today() - 7, 'absent');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
    values ('f5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000003',
            'a5000000-0000-4000-8000-000000000002', private.today(), 'absent')$$,
  'professeur : l''appel du jour déclenche le trigger');
reset role;
select is(
  (select count(*)::int from public.alerts where type = 'consecutive_absences' and not resolved
    and payload ->> 'subject_id' = 'e5000000-0000-4000-8000-000000000003'),
  1, 'professeur : alerte ouverte malgré la RLS');

-- ---------------------------------------------------------------------
-- Planification et droits
-- ---------------------------------------------------------------------
select is(
  (select schedule from cron.job where jobname = 'centromanager-daily-automations'),
  '10 0 * * *', 'pg_cron : tâche quotidienne planifiée');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select private.generate_invoices()$$, '42501', null, 'assistant : ne lance pas la génération des factures');
reset role;

select * from finish();
rollback;
