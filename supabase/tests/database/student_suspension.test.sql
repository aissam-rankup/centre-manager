-- =====================================================================
-- Élève suspendu : mis de côté partout (appels, absences, alertes,
-- relances, réinscription, facturation, statistiques, commission, espace
-- élève), consultable, puis réactivé d'un clic ; droits.
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(45);

insert into auth.users (id, email) values
  ('a8400000-0000-4000-8000-000000000001', 'admin@suspension.test'),
  ('a8400000-0000-4000-8000-000000000002', 'assistant@suspension.test'),
  ('a8400000-0000-4000-8000-000000000003', 'prof@suspension.test'),
  ('a8400000-0000-4000-8000-000000000004', 'eleve@suspension.test'),
  ('a8400000-0000-4000-8000-000000000011', 'admin-b@suspension.test');
insert into public.centers (id, name, slug, plan_key) values
  ('c8400000-0000-4000-8000-000000000001', 'Centre Suspension A', 'suspension-a', 'premium'),
  ('c8400000-0000-4000-8000-000000000002', 'Centre Suspension B', 'suspension-b', 'premium');
insert into public.profiles (id, center_id, full_name, role, pay_mode) values
  ('a8400000-0000-4000-8000-000000000001', 'c8400000-0000-4000-8000-000000000001', 'Admin A', 'admin', null),
  ('a8400000-0000-4000-8000-000000000002', 'c8400000-0000-4000-8000-000000000001', 'Assistant A', 'assistant', null),
  ('a8400000-0000-4000-8000-000000000003', 'c8400000-0000-4000-8000-000000000001', 'Prof A', 'teacher', 'commission'),
  ('a8400000-0000-4000-8000-000000000011', 'c8400000-0000-4000-8000-000000000002', 'Admin B', 'admin', null);
insert into public.levels (id, center_id, name) values
  ('d8400000-0000-4000-8000-000000000001', 'c8400000-0000-4000-8000-000000000001', 'Niveau A');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e8400000-0000-4000-8000-000000000001', 'c8400000-0000-4000-8000-000000000001', 'd8400000-0000-4000-8000-000000000001', 'Maths', 400),
  ('e8400000-0000-4000-8000-000000000002', 'c8400000-0000-4000-8000-000000000001', 'd8400000-0000-4000-8000-000000000001', 'Physique', 300);
insert into public.rooms (id, center_id, name) values
  ('e8400000-0000-4000-8000-0000000000aa', 'c8400000-0000-4000-8000-000000000001', 'Salle 1');
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a8400000-0000-4000-8000-000000000003', 'e8400000-0000-4000-8000-000000000001', 'd8400000-0000-4000-8000-000000000001');
insert into public.teacher_commissions (center_id, teacher_id, subject_id, level_id, rate_percent, effective_from) values
  ('c8400000-0000-4000-8000-000000000001', 'a8400000-0000-4000-8000-000000000003', 'e8400000-0000-4000-8000-000000000001',
   'd8400000-0000-4000-8000-000000000001', 25, '2026-01-01');
-- Séance de Maths aujourd'hui.
insert into public.schedule_slots (id, center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room, room_id)
values ('58400000-0000-4000-8000-000000000001', 'c8400000-0000-4000-8000-000000000001', 'e8400000-0000-4000-8000-000000000001',
        'd8400000-0000-4000-8000-000000000001', 'a8400000-0000-4000-8000-000000000003',
        extract(dow from private.today())::smallint, '06:00', '07:00', 'Salle 1', 'e8400000-0000-4000-8000-0000000000aa');

-- Sami (suspendu ensuite) et Tarik (actif), inscrits en Maths.
insert into public.students (id, center_id, full_name, level_id, guardian_phone) values
  ('f8400000-0000-4000-8000-000000000001', 'c8400000-0000-4000-8000-000000000001', 'Sami Suspendu', 'd8400000-0000-4000-8000-000000000001', '0611111111'),
  ('f8400000-0000-4000-8000-000000000002', 'c8400000-0000-4000-8000-000000000001', 'Tarik Actif', 'd8400000-0000-4000-8000-000000000001', '0622222222');
insert into public.enrollments (id, student_id, subject_id, start_date, price_agreed) values
  ('98400000-0000-4000-8000-000000000001', 'f8400000-0000-4000-8000-000000000001', 'e8400000-0000-4000-8000-000000000001', '2026-01-01', 400),
  ('98400000-0000-4000-8000-000000000002', 'f8400000-0000-4000-8000-000000000002', 'e8400000-0000-4000-8000-000000000001', '2026-01-01', 400);
-- Les deux ont une facture en retard.
update public.invoices set status = 'overdue', due_date = private.today() - 25
where student_id in ('f8400000-0000-4000-8000-000000000001', 'f8400000-0000-4000-8000-000000000002');
-- Accès à l'espace élève de Sami.
insert into public.student_accounts (user_id, student_id, center_id, login_code) values
  ('a8400000-0000-4000-8000-000000000004', 'f8400000-0000-4000-8000-000000000001', 'c8400000-0000-4000-8000-000000000001', 'SUSP0001');

create temp table t_ids (key text primary key, id uuid);
grant all on t_ids to authenticated;

-- ---------------------------------------------------------------------
-- Suspension (assistant) et droits
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select public.suspend_student('f8400000-0000-4000-8000-000000000001', 'Impayé')$$, '42501', null,
  'professeur : ne suspend pas');

set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok($$select public.suspend_student('f8400000-0000-4000-8000-000000000001', 'Impayé')$$, '42501', null,
  'admin d''un autre centre : ne suspend pas');

set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.suspend_student('f8400000-0000-4000-8000-000000000001', '  ')$$, '22023', null, 'motif obligatoire');
select lives_ok($$select public.suspend_student('f8400000-0000-4000-8000-000000000001', '  Ne paie plus depuis septembre ')$$,
  'assistant : suspend l''élève');
select throws_ok($$select public.suspend_student('f8400000-0000-4000-8000-000000000001', 'Encore')$$, '22023', null, 'déjà suspendu');
set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$update public.students set suspended_at = null where id = 'f8400000-0000-4000-8000-000000000001'$$,
  '42501', null, 'suspension : jamais par une écriture directe (même l''admin)');
set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000002","role":"authenticated"}';

-- Profil conservé, consultable avec date et motif.
select is(
  (select row(full_name, suspension_reason, suspended_at is not null)::text from public.student_directory
   where id = 'f8400000-0000-4000-8000-000000000001'),
  '("Sami Suspendu","Ne paie plus depuis septembre",t)', 'annuaire : élève consultable, date et motif');
select is((select count(*)::int from public.enrollments where student_id = 'f8400000-0000-4000-8000-000000000001' and active), 1,
  'inscription conservée');

-- ---------------------------------------------------------------------
-- Appels
-- ---------------------------------------------------------------------
select is(
  (select student_count from public.staff_day_sessions(private.today()) where slot_id = '58400000-0000-4000-8000-000000000001'),
  1, 'séance du jour : un seul élève attendu');
select throws_ok(
  $$select public.mark_session_attendance('58400000-0000-4000-8000-000000000001', private.today(),
      '[{"student_id": "f8400000-0000-4000-8000-000000000001", "status": "absent"}]')$$,
  '22023', null, 'accueil : pas d''appel pour l''élève suspendu');
select is(
  public.mark_session_attendance('58400000-0000-4000-8000-000000000001', private.today(),
    '[{"student_id": "f8400000-0000-4000-8000-000000000002", "status": "absent"}]'),
  1, 'accueil : appel de l''élève actif');

set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select array_agg(student_id::text order by student_id) from public.class_rosters where active)::text,
  '{f8400000-0000-4000-8000-000000000002}', 'professeur : liste d''appel sans l''élève suspendu');
select throws_ok(
  $$insert into public.attendance (student_id, subject_id, session_date, status)
    values ('f8400000-0000-4000-8000-000000000001', 'e8400000-0000-4000-8000-000000000001', private.today(), 'present')$$,
  '42501', null, 'professeur : pas d''appel pour l''élève suspendu');

-- ---------------------------------------------------------------------
-- Absences et alertes (absences saisies avant/pendant la suspension)
-- ---------------------------------------------------------------------
reset role;
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
select st, 'e8400000-0000-4000-8000-000000000001', 'a8400000-0000-4000-8000-000000000003', private.today() - d, 'absent'
from unnest(array['f8400000-0000-4000-8000-000000000001'::uuid, 'f8400000-0000-4000-8000-000000000002'::uuid]) st,
     generate_series(1, 3) d;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.alerts where student_id = 'f8400000-0000-4000-8000-000000000001' and type = 'consecutive_absences'),
  0, 'suspendu : aucune alerte d''absences consécutives');
select is((select count(*)::int from public.alerts where student_id = 'f8400000-0000-4000-8000-000000000002' and type = 'consecutive_absences'),
  1, 'actif : alerte d''absences consécutives');
select is((select array_agg(distinct student_id)::text from public.open_absence_alerts),
  '{f8400000-0000-4000-8000-000000000002}', 'alertes ouvertes : sans l''élève suspendu');
select is((select array_agg(distinct student_id)::text from public.absences_to_notify),
  '{f8400000-0000-4000-8000-000000000002}', 'absences à signaler : sans l''élève suspendu');
select is((select absences_today from public.assistant_dashboard_stats()), 1, 'tableau de bord : absences du jour sans l''élève suspendu');
select is((select open_absence_alerts from public.assistant_dashboard_stats()), 1, 'tableau de bord : alertes sans l''élève suspendu');

-- ---------------------------------------------------------------------
-- Relances et suivi des impayés
-- ---------------------------------------------------------------------
select is((select array_agg(student_id)::text from public.follow_up_queue),
  '{f8400000-0000-4000-8000-000000000002}', 'suivi des impayés : sans l''élève suspendu');
select is((select overdue_count from public.student_directory where id = 'f8400000-0000-4000-8000-000000000001'),
  1, 'impayé de l''élève suspendu : toujours dû');

-- ---------------------------------------------------------------------
-- Facturation automatique, réinscription, inscriptions
-- ---------------------------------------------------------------------
reset role;
select private.generate_invoices((date_trunc('month', private.today()) + interval '1 month')::date + 5);
select is((select count(*)::int from public.invoices where student_id = 'f8400000-0000-4000-8000-000000000001'), 1,
  'facturation automatique : rien pour l''élève suspendu');
select is((select count(*)::int from public.invoices where student_id = 'f8400000-0000-4000-8000-000000000002'), 2,
  'facturation automatique : facture du mois suivant pour l''élève actif');

insert into public.billing_runs (id, center_id, period_year, period_month)
values ('88400000-0000-4000-8000-000000000001', 'c8400000-0000-4000-8000-000000000001', 2027, 3);
select private.refresh_billing_run('88400000-0000-4000-8000-000000000001');
select is((select array_agg(distinct student_id)::text from public.billing_run_lines where billing_run_id = '88400000-0000-4000-8000-000000000001'),
  '{f8400000-0000-4000-8000-000000000002}', 'réinscription : pas de ligne pour l''élève suspendu');
select is((select count(*)::int from public.reenrollment_intents where billing_run_id = '88400000-0000-4000-8000-000000000001'
             and student_id = 'f8400000-0000-4000-8000-000000000001'), 0, 'réinscription : pas d''intention pour l''élève suspendu');

update public.invoices set status = 'pending'
where student_id in ('f8400000-0000-4000-8000-000000000001', 'f8400000-0000-4000-8000-000000000002');
delete from public.alerts where type = 'overdue_payment';
select private.mark_overdue_invoices();
select is((select array_agg(distinct student_id)::text from public.alerts where type = 'overdue_payment'
             and student_id in ('f8400000-0000-4000-8000-000000000001', 'f8400000-0000-4000-8000-000000000002')),
  '{f8400000-0000-4000-8000-000000000002}', 'retard : alerte de paiement seulement pour l''élève actif');
select is((select count(*)::int from public.invoices where student_id = 'f8400000-0000-4000-8000-000000000001' and status = 'overdue'),
  1, 'retard : la facture de l''élève suspendu reste due (en retard)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.enrollments (student_id, subject_id, price_agreed) values ('f8400000-0000-4000-8000-000000000001', 'e8400000-0000-4000-8000-000000000002', 300)$$,
  '22023', null, 'suspendu : pas de nouvelle inscription');

-- ---------------------------------------------------------------------
-- Statistiques et commission
-- ---------------------------------------------------------------------
select is((select student_count from public.admin_month_revenue()), 1, 'élèves actifs : sans l''élève suspendu');
select is((select active_enrollments from public.admin_enrollment_report() where subject_id = 'e8400000-0000-4000-8000-000000000001'),
  1, 'effectifs par matière : sans l''élève suspendu');
select is((select level_students from public.admin_enrollment_report() where subject_id = 'e8400000-0000-4000-8000-000000000001'),
  1, 'effectif du niveau : sans l''élève suspendu');
select is((select absent_count from public.admin_absence_rates() where subject_id = 'e8400000-0000-4000-8000-000000000001'),
  4, 'taux d''absence : absences de l''élève suspendu exclues');
reset role;
select is(
  (select (c.detail -> 'subjects' -> 0 ->> 'enrolled')::int
   from private.compute_teacher_pay('a8400000-0000-4000-8000-000000000003',
     extract(year from private.today())::int, extract(month from private.today())::int) c),
  1, 'commission : l''élève suspendu n''est plus compté');

-- ---------------------------------------------------------------------
-- Espace élève : coupé
-- ---------------------------------------------------------------------
select is(
  (public.custom_access_token_hook(jsonb_build_object('user_id', 'a8400000-0000-4000-8000-000000000004', 'claims', '{}'::jsonb))
     -> 'claims' ->> 'profile_active'),
  'false', 'jeton de l''espace élève : inactif');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(private.auth_student_id(), null, 'espace élève : aucun accès aux données');
select is((select allowed from public.my_student_access()), false, 'espace élève : accès refusé');

-- ---------------------------------------------------------------------
-- Réactivation (admin) : de nouveau partout
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.reactivate_student('f8400000-0000-4000-8000-000000000001')$$, 'admin : réactive l''élève');
select is((select suspended_at from public.students where id = 'f8400000-0000-4000-8000-000000000001'), null, 'élève réactivé');
select is((select student_count from public.admin_month_revenue()), 2, 'élèves actifs : de nouveau compté');
select is((select count(*)::int from public.follow_up_queue where student_id = 'f8400000-0000-4000-8000-000000000001'), 1,
  'suivi des impayés : de nouveau présent');
select lives_ok(
  $$select public.mark_session_attendance('58400000-0000-4000-8000-000000000001', private.today(),
      '[{"student_id": "f8400000-0000-4000-8000-000000000001", "status": "present"}]')$$,
  'appel : de nouveau possible');
select is(public.reactivate_student('f8400000-0000-4000-8000-000000000001'), 0, 'réactiver deux fois : sans effet');

set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.class_rosters where active), 2, 'professeur : de nouveau dans la liste d''appel');

set local request.jwt.claims = '{"sub":"a8400000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(private.auth_student_id(), 'f8400000-0000-4000-8000-000000000001'::uuid, 'espace élève : accès rétabli');

reset role;
select is(
  (select count(*)::int from public.center_events where entity_id = 'f8400000-0000-4000-8000-000000000001'
     and action in ('student.suspended', 'student.reactivated')),
  2, 'journal du centre : suspension et réactivation tracées');

select * from finish();
rollback;
