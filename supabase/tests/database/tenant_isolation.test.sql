-- =====================================================================
-- Isolation multi-centres (phase 8) — exécuter avec : npm run db:test
--
-- Méthode générique, sans liste de tables écrite à la main :
--  1. le centre A et ses comptes sont créés, puis toutes les tables du
--     schéma public sont photographiées (clés primaires) ;
--  2. un centre B complet est créé (une ligne au moins dans chaque table
--     de données de centre) ; la différence donne les lignes de B ;
--  3. pour CHAQUE table, chaque rôle du centre A (admin, assistant,
--     professeur), le super-admin hors support et le visiteur anonyme
--     doivent voir zéro ligne de B.
-- Une nouvelle table sans données de B dans ce jeu fait échouer le test
-- de couverture : il faut alors compléter le jeu de B.
-- Plus : contrôles structurels (RLS partout, aucun droit anonyme) et
-- appels de fonctions avec des identifiants de B.
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Tables globales (référentiel ou réglage de la plateforme), sans données de centre.
create schema isolation_test;
create table isolation_test.global_tables (tbl text primary key);
-- Catalogue commun (modules, packs) : aucune donnée de centre.
insert into isolation_test.global_tables values ('center_types'), ('platform_settings'), ('modules'), ('plans'), ('plan_modules');

-- ---------------------------------------------------------------------
-- Contrôles structurels
-- ---------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname, ', '), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'RLS activée sur toutes les tables du schéma public');
select is(
  (select coalesce(string_agg(table_name || ':' || privilege_type, ', '), '') from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  '', 'aucun droit du rôle anonyme sur les tables');
select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  'center_for_host', 'une seule fonction appelable sans session (écran de connexion)');

-- ---------------------------------------------------------------------
-- Centre A et comptes
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'admin-a@iso.test'),
  ('a0000000-0000-4000-8000-00000000000b', 'assistant-a@iso.test'),
  ('a0000000-0000-4000-8000-00000000000c', 'prof-a@iso.test'),
  ('a0000000-0000-4000-8000-00000000000d', 'owner@iso.test'),
  ('b0000000-0000-4000-8000-00000000000a', 'admin-b@iso.test'),
  ('b0000000-0000-4000-8000-00000000000b', 'assistant-b@iso.test'),
  ('b0000000-0000-4000-8000-00000000000c', 'prof-b@iso.test');
insert into public.centers (id, name, slug) values ('ca000000-0000-4000-8000-000000000001', 'Centre A', 'iso-a');
insert into public.profiles (id, center_id, full_name, role) values
  ('a0000000-0000-4000-8000-00000000000a', 'ca000000-0000-4000-8000-000000000001', 'Admin A', 'admin'),
  ('a0000000-0000-4000-8000-00000000000b', 'ca000000-0000-4000-8000-000000000001', 'Assistant A', 'assistant'),
  ('a0000000-0000-4000-8000-00000000000c', 'ca000000-0000-4000-8000-000000000001', 'Prof A', 'teacher'),
  ('a0000000-0000-4000-8000-00000000000d', null, 'Propriétaire', 'super_admin');
insert into public.levels (id, center_id, name) values ('1a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'Niveau A');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('2a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 'Maths A', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a0000000-0000-4000-8000-00000000000c', '2a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001');

-- Photographie : clés primaires de toutes les lignes existantes.
create table isolation_test.pk (tbl text primary key, key_expr text not null);
insert into isolation_test.pk
select c.relname,
       'jsonb_build_object(' || string_agg(format('%L, x.%I', a.attname, a.attname), ', ' order by array_position(i.indkey, a.attnum)) || ')'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_index i on i.indrelid = c.oid and i.indisprimary
join pg_attribute a on a.attrelid = c.oid and a.attnum = any (i.indkey)
where c.relkind = 'r'
group by c.relname;

create table isolation_test.baseline (tbl text, key jsonb);
do $$
declare
  r record;
begin
  for r in select * from isolation_test.pk loop
    execute format('insert into isolation_test.baseline select %L, %s from public.%I x', r.tbl, r.key_expr, r.tbl);
  end loop;
end;
$$;

select is(
  (select count(*)::int from pg_tables t where t.schemaname = 'public' and t.tablename not in (select tbl from isolation_test.pk)),
  0, 'chaque table a une clé primaire (comparaison possible)');

-- ---------------------------------------------------------------------
-- Centre B complet (une ligne dans chaque table de données de centre)
-- ---------------------------------------------------------------------
insert into public.centers (id, name, slug, owner_contact_email, current_period_end, plan_key)
values ('cb000000-0000-4000-8000-000000000001', 'Centre B', 'iso-b', 'dir@b.test', private.today() + 7, 'premium');
insert into public.center_branding (center_id, brand_name, primary_color) values ('cb000000-0000-4000-8000-000000000001', 'Marque B', '#0f766e');
insert into public.subscription_payments (center_id, amount, method) values ('cb000000-0000-4000-8000-000000000001', 500, 'cash');
insert into public.profiles (id, center_id, full_name, role) values
  ('b0000000-0000-4000-8000-00000000000a', 'cb000000-0000-4000-8000-000000000001', 'Admin B', 'admin'),
  ('b0000000-0000-4000-8000-00000000000b', 'cb000000-0000-4000-8000-000000000001', 'Assistant B', 'assistant'),
  ('b0000000-0000-4000-8000-00000000000c', 'cb000000-0000-4000-8000-000000000001', 'Prof B', 'teacher');
insert into public.levels (id, center_id, name) values ('1b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'Niveau B');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('2b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001', 'Maths B', 300),
  ('2b000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001', 'Anglais B', 250);
insert into public.packs (id, center_id, level_id, name, monthly_price) values
  ('3b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001', 'Pack B', 450);
insert into public.pack_subjects (pack_id, subject_id) values
  ('3b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001'),
  ('3b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000002');
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('b0000000-0000-4000-8000-00000000000c', '2b000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001');
insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room) values
  ('cb000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-00000000000c', 2, '17:00', '18:30', 'Salle B');
insert into public.students (id, center_id, full_name, level_id, notes) values
  ('4b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'Élève B1', '1b000000-0000-4000-8000-000000000001', 'Note B'),
  ('4b000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000001', 'Élève B2', '1b000000-0000-4000-8000-000000000001', null);
-- Inscription (facture créée par trigger) et abonnement pack (inscriptions et facture par trigger).
insert into public.enrollments (student_id, subject_id, price_agreed) values
  ('4b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 300);
insert into public.pack_enrollments (student_id, pack_id, price_agreed) values
  ('4b000000-0000-4000-8000-000000000002', '3b000000-0000-4000-8000-000000000001', 450);
-- Trois absences consécutives : alerte créée par trigger.
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status, note) values
  ('4b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000c', private.today() - 14, 'absent', 'Malade'),
  ('4b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000c', private.today() - 7, 'absent', null),
  ('4b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000c', private.today(), 'absent', null);
-- Accès élève de B (plateforme pédagogique : centre B en Premium).
insert into auth.users (id, email) values ('4b0000e1-0000-4000-8000-000000000001', 'eleve-bbbbiso1@eleves.centromanager.invalid');
insert into public.student_accounts (user_id, student_id, center_id, login_code)
values ('4b0000e1-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'BBBBISO1');
-- Ressource pédagogique de B (publiée par le professeur B, matière de B).
insert into public.learning_resources (center_id, subject_id, level_id, author_id, type, title)
select 'cb000000-0000-4000-8000-000000000001', s.id, s.level_id, 'b0000000-0000-4000-8000-00000000000c', 'summary', 'Résumé B'
from public.subjects s where s.center_id = 'cb000000-0000-4000-8000-000000000001' limit 1;
-- Saisie de l'accueil B en désaccord avec le professeur B (historique et désaccord du centre B).
update public.attendance set status = 'present', marked_by = 'b0000000-0000-4000-8000-00000000000b', marked_by_role = 'assistant'
where student_id = '4b000000-0000-4000-8000-000000000001' and session_date = private.today();
insert into public.follow_ups (student_id, type, channel, note) values
  ('4b000000-0000-4000-8000-000000000001', 'absence', 'phone', 'Relance B');
insert into public.platform_notifications (center_id, kind, scheduled_for, recipient)
values ('cb000000-0000-4000-8000-000000000001', 'due_in_7', private.today(), 'dir@b.test');
insert into public.support_sessions (actor_id, center_id, reason, started_at, expires_at, ended_at)
values ('a0000000-0000-4000-8000-00000000000d', 'cb000000-0000-4000-8000-000000000001', 'Support B',
        now() - interval '2 hours', now() - interval '1 hour', now() - interval '90 minutes');
-- Finances de B : remise (journal du centre par trigger), encaissement du
-- pack avec reçu, paie, charges (catégories créées avec le centre).
insert into public.discounts (student_id, center_id, type, value, scope, reason) values
  ('4b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'percentage', 10, 'all_subjects', 'sibling');
update public.invoices set status = 'paid', amount_paid = amount_due, paid_at = now(), payment_method = 'cash'
where student_id = '4b000000-0000-4000-8000-000000000002';
select private.issue_receipt(array(select id from public.invoices where student_id = '4b000000-0000-4000-8000-000000000002'),
                             now(), 'b0000000-0000-4000-8000-00000000000b');
update public.profiles set pay_mode = 'commission' where id = 'b0000000-0000-4000-8000-00000000000c';
insert into public.teacher_commissions (center_id, teacher_id, subject_id, level_id, rate_percent, effective_from) values
  ('cb000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000c', '2b000000-0000-4000-8000-000000000001',
   '1b000000-0000-4000-8000-000000000001', 30, private.today() - 60);
insert into public.teacher_salaries (center_id, teacher_id, monthly_amount, effective_from) values
  ('cb000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000c', 2500, private.today() - 60);
insert into public.payroll_periods (id, center_id, year, month) values
  ('5b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 2026, 1);
insert into public.payroll_lines (id, payroll_period_id, center_id, teacher_id, teacher_name, pay_mode, computed_amount) values
  ('6b000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-00000000000c', 'Prof B', 'commission', 90);
insert into public.expenses (id, center_id, category_id, label, amount, receipt_url)
select '7b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', ec.id, 'Loyer B', 4000,
       'cb000000-0000-4000-8000-000000000001/loyer.pdf'
from public.expense_categories ec where ec.center_id = 'cb000000-0000-4000-8000-000000000001' and ec.name = 'Loyer';
-- Planning et absences de B : conflit journalisé, responsable prévenu (salle créée par trigger).
insert into public.schedule_conflicts_log (center_id, attempted_slot, conflict_type)
values ('cb000000-0000-4000-8000-000000000001', '{"day_of_week": 2}', 'room');
insert into public.absence_notifications (student_id, center_id, attendance_id, channel)
select '4b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', a.id, 'whatsapp'
from public.attendance a where a.student_id = '4b000000-0000-4000-8000-000000000001' and a.status = 'absent'
order by a.session_date limit 1;
-- Réinscription et caisse de B : campagne (ligne, intention), rappel de paiement,
-- session de caisse et mouvement d'espèces.
insert into public.billing_runs (id, center_id, period_year, period_month, total_expected, student_count)
values ('8b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 2026, 11, 300, 1);
insert into public.billing_run_lines (billing_run_id, center_id, student_id, enrollment_id, period_start, period_end, due_date, amount_full, amount_due)
select '8b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', e.student_id, e.id,
       date '2026-11-01', date '2026-11-30', date '2026-11-05', 300, 300
from public.enrollments e where e.student_id = '4b000000-0000-4000-8000-000000000001' and e.subject_id = '2b000000-0000-4000-8000-000000000001';
insert into public.reenrollment_intents (center_id, billing_run_id, student_id, period_year, period_month)
values ('cb000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', 2026, 11);
insert into public.payment_reminders (student_id, center_id, invoice_id, message_id, reminder_type, channel)
select '4b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', i.id, gen_random_uuid(), 'overdue', 'whatsapp'
from public.invoices i where i.student_id = '4b000000-0000-4000-8000-000000000001' and i.status <> 'paid' limit 1;
insert into public.cash_sessions (id, center_id, session_date, opening_float)
values ('9b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', private.today() - 1, 100);
insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason)
values ('cb000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001', 'bank_deposit', -50, 'Dépôt B');
-- Fichiers de B (photos d'élève et d'équipe, reçu, justificatif).
insert into storage.objects (bucket_id, name) values
  ('student-photos', 'cb000000-0000-4000-8000-000000000001/4b000000-0000-4000-8000-000000000001.jpg'),
  ('staff-photos', 'cb000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-00000000000a/1.jpg'),
  ('receipts', 'cb000000-0000-4000-8000-000000000001/recu.pdf'),
  ('expense-receipts', 'cb000000-0000-4000-8000-000000000001/loyer.pdf');

-- Lignes de B : tout ce qui n'était pas dans la photographie.
create table isolation_test.b_rows (tbl text, key jsonb);
do $$
declare
  r record;
begin
  for r in select * from isolation_test.pk loop
    execute format(
      'insert into isolation_test.b_rows select %L, k from (select %s as k from public.%I x) s
       where not exists (select 1 from isolation_test.baseline b where b.tbl = %L and b.key = s.k)',
      r.tbl, r.key_expr, r.tbl, r.tbl);
  end loop;
end;
$$;

select is(
  (select coalesce(string_agg(p.tbl, ', ' order by p.tbl), '') from isolation_test.pk p
   where p.tbl not in (select tbl from isolation_test.global_tables)
     and not exists (select 1 from isolation_test.b_rows b where b.tbl = p.tbl)),
  '', 'couverture : le centre B a des lignes dans chaque table de données de centre');

-- Nombre de lignes de B visibles pour le rôle courant (droits de l'appelant).
create function isolation_test.b_visible(p_tbl text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expr text;
  v_count integer;
begin
  select key_expr into v_expr from isolation_test.pk where tbl = p_tbl;
  execute format(
    'select count(*)::int from public.%I x where %s in (select key from isolation_test.b_rows where tbl = %L)',
    p_tbl, v_expr, p_tbl)
  into v_count;
  return v_count;
exception
  -- Aucun droit de lecture (table fermée ou colonnes non accordées) : rien de visible.
  when insufficient_privilege then
    return 0;
end;
$$;

-- Séance et reçu de B, pour les appels de fonctions.
select set_config('iso.b_attendance', (select id::text from public.attendance where student_id = '4b000000-0000-4000-8000-000000000001' limit 1), true);
select set_config('iso.b_receipt', (select id::text from public.receipts where center_id = 'cb000000-0000-4000-8000-000000000001'), true);
select set_config('iso.b_invoice', (select id::text from public.invoices where student_id = '4b000000-0000-4000-8000-000000000001' limit 1), true);

grant usage on schema isolation_test to authenticated, anon;
grant select on all tables in schema isolation_test to authenticated, anon;
grant execute on function isolation_test.b_visible(text) to authenticated, anon;

-- Contrôle positif : l'admin de B voit bien ses propres données (le test
-- ne passe pas « à vide »).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select ok(isolation_test.b_visible(tbl) > 0, format('contrôle : admin B voit ses lignes dans %s', tbl))
from unnest(array['students', 'enrollments', 'invoices', 'attendance', 'alerts', 'follow_ups', 'levels', 'subjects', 'packs',
                  'pack_enrollments', 'schedule_slots', 'teacher_assignments', 'profiles', 'center_branding',
                  'discounts', 'receipts', 'center_events', 'teacher_salaries', 'teacher_commissions', 'payroll_periods',
                  'payroll_lines', 'expense_categories', 'expenses', 'rooms', 'schedule_conflicts_log',
                  'absence_notifications', 'billing_runs', 'billing_run_lines', 'reenrollment_intents',
                  'payment_reminders', 'cash_sessions', 'cash_movements']) as tbl;
reset role;

-- ---------------------------------------------------------------------
-- Chaque rôle du centre A, le super-admin hors support, l'anonyme :
-- zéro ligne de B, table par table.
-- ---------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(isolation_test.b_visible(tbl), 0, format('admin A : aucune ligne de B dans %s', tbl))
from (select distinct tbl from isolation_test.b_rows order by 1) t;

set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is(isolation_test.b_visible(tbl), 0, format('assistant A : aucune ligne de B dans %s', tbl))
from (select distinct tbl from isolation_test.b_rows order by 1) t;

set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is(isolation_test.b_visible(tbl), 0, format('professeur A : aucune ligne de B dans %s', tbl))
from (select distinct tbl from isolation_test.b_rows order by 1) t;

set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select is(isolation_test.b_visible(tbl), 0, format('super-admin hors support : aucune ligne de B dans %s', tbl))
from (select distinct tbl from isolation_test.b_rows order by 1) t;

-- Fichiers de B.
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  (select count(*)::int from storage.objects where name like 'cb000000-0000-4000-8000-000000000001/%'),
  0, 'admin A : aucun fichier de B (photos, reçus, justificatifs)');

-- Fonctions appelées avec des identifiants de B.
select is((select count(*)::int from public.student_attendance('4b000000-0000-4000-8000-000000000001')), 0, 'admin A : assiduité d''un élève de B vide');
select is((select count(*)::int from public.student_absence_follow_ups('4b000000-0000-4000-8000-000000000001')), 0, 'admin A : relances d''un élève de B vides');
select throws_ok($$select public.set_attendance_note(current_setting('iso.b_attendance')::uuid, 'X')$$, 'P0002', null, 'admin A : séance de B non annotable');
select throws_ok($$select * from public.center_branding_settings('cb000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin A : marque de B inaccessible');
select throws_ok($$select public.update_center_branding('cb000000-0000-4000-8000-000000000001', 'Pirate', null, null, null, null, null, null, null, null, null)$$,
  '42501', null, 'admin A : marque de B non modifiable');
select throws_ok($$select * from public.platform_center('cb000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin A : fiche plateforme de B refusée');
select throws_ok($$select public.set_my_photo('cb000000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-00000000000a/1.jpg')$$,
  '22023', null, 'admin A : photo rangée dans le dossier de B refusée');
select is((select center_name from public.my_center_access()), 'Centre A', 'admin A : accès limité à son centre');
select throws_ok($$select public.record_payment('4b000000-0000-4000-8000-000000000001', array[current_setting('iso.b_invoice')::uuid], 'cash')$$,
  '42501', null, 'admin A : encaissement d''une facture de B refusé');
select throws_ok($$select public.cancel_receipt(current_setting('iso.b_receipt')::uuid, 'Pirate')$$, '42501', null, 'admin A : reçu de B non annulable');
select throws_ok($$select public.payroll_set_adjustment('6b000000-0000-4000-8000-000000000001', 1000, 'Pirate')$$, '42501', null, 'admin A : paie de B non modifiable');
select throws_ok($$select public.payroll_validate('5b000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin A : paie de B non validable');
select throws_ok($$select public.delete_expense('7b000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin A : charge de B non supprimable');
-- Réinscription, rappels et caisse de B (page 8).
select is((select count(*)::int from public.billing_run_review('8b000000-0000-4000-8000-000000000001')), 0, 'admin A : campagne de B illisible');
select throws_ok($$select public.set_reenrollment_intent('8b000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', 'dropped', null, 'Pirate')$$,
  '42501', null, 'admin A : intention d''un élève de B non modifiable');
select throws_ok($$select public.confirm_billing_run('8b000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin A : campagne de B non confirmable');
select throws_ok($$select public.cancel_billing_run('8b000000-0000-4000-8000-000000000001', 'Pirate')$$, '42501', null, 'admin A : campagne de B non annulable');
select ok(position('8b000000-0000-4000-8000-000000000001' in coalesce(public.reenrollment_overview()::text, '')) = 0, 'admin A : campagne de B absente de son aperçu');
select ok(position('4b000000-0000-4000-8000-00000000000' in public.admin_collection_overview()::text) = 0, 'admin A : élèves de B absents du recouvrement');
select is((select count(*)::int from public.payment_reminder_queue('8b000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001')), 0,
  'admin A : file des rappels de B vide');
select throws_ok($$select public.record_payment_reminder('8b000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', date '2026-11-05', 'whatsapp')$$,
  '42501', null, 'admin A : aucun rappel envoyé pour B');
select throws_ok($$select public.cash_session_summary('9b000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin A : caisse de B illisible');
select throws_ok($$select public.close_cash_session('9b000000-0000-4000-8000-000000000001', 50, 'Pirate', null, 50)$$, '42501', null, 'admin A : caisse de B non clôturable');
select throws_ok($$select public.validate_cash_session('9b000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin A : caisse de B non validable');
select throws_ok($$select public.record_cash_correction('9b000000-0000-4000-8000-000000000001', 10, 'Pirate')$$, '42501', null, 'admin A : caisse de B non corrigeable');
select is((select count(*)::int from public.cash_session_history(private.today() - 31, private.today())
           where id = '9b000000-0000-4000-8000-000000000001'), 0, 'admin A : caisse de B absente de l''historique');
select is((select count(*)::int from public.stale_cash_sessions() where id = '9b000000-0000-4000-8000-000000000001'), 0,
  'admin A : caisse de B restée ouverte non signalée chez A');
select is((public.cash_month_overview(private.today() - 1) ->> 'stale_open')::int, 0, 'admin A : indicateurs de caisse sans les sessions de B');
update public.discounts set value = 99 where student_id = '4b000000-0000-4000-8000-000000000001';
-- Tentatives de modification (vérifiées plus bas, hors RLS).
update public.students set full_name = 'Modifié par A' where id = '4b000000-0000-4000-8000-000000000001';
delete from public.levels where id = '1b000000-0000-4000-8000-000000000001';
update public.invoices set status = 'paid' where student_id = '4b000000-0000-4000-8000-000000000001';
select throws_ok($$insert into public.students (center_id, full_name, level_id) values ('cb000000-0000-4000-8000-000000000001', 'Intrus', '1b000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'admin A : aucune création dans le centre B');

set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.cash_session_summary('9b000000-0000-4000-8000-000000000001')$$, '42501', null, 'assistant A : caisse de B illisible');
select throws_ok($$select public.close_cash_session('9b000000-0000-4000-8000-000000000001', 50, 'Pirate', null, 50)$$, '42501', null, 'assistant A : caisse de B non clôturable');
select is((select count(*)::int from public.payment_reminder_queue('8b000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001')), 0,
  'assistant A : file des rappels de B vide');
select throws_ok($$select public.record_payment_reminder('8b000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', date '2026-11-05', 'whatsapp')$$,
  '42501', null, 'assistant A : aucun rappel envoyé pour B');

set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is((select count(*)::int from public.student_attendance('4b000000-0000-4000-8000-000000000001')), 0, 'professeur A : assiduité d''un élève de B vide');

reset role;
set local role anon;
select is(isolation_test.b_visible(tbl), 0, format('anonyme : aucune ligne de B dans %s', tbl))
from (select distinct tbl from isolation_test.b_rows order by 1) t;
select is((select count(*)::int from public.center_for_host('iso-b', null)), 1, 'anonyme : seul le nom et la marque publique d''un centre sont exposés');

reset role;

-- Données de B intactes après les tentatives du centre A.
select is((select full_name from public.students where id = '4b000000-0000-4000-8000-000000000001'), 'Élève B1', 'élève de B non modifié par A');
select is((select count(*)::int from public.levels where id = '1b000000-0000-4000-8000-000000000001'), 1, 'niveau de B non supprimé par A');
select is((select count(*)::int from public.invoices where student_id = '4b000000-0000-4000-8000-000000000001' and status = 'paid'), 0, 'factures de B non modifiées par A');
select is((select value from public.discounts where student_id = '4b000000-0000-4000-8000-000000000001'), 10.00, 'remise de B non modifiée par A');
select results_eq(
  $$select br.status::text, (select ri.intent::text from public.reenrollment_intents ri where ri.billing_run_id = br.id),
           (select count(*)::int from public.payment_reminders pr where pr.center_id = br.center_id)
    from public.billing_runs br where br.id = '8b000000-0000-4000-8000-000000000001'$$,
  $$values ('draft', 'pending', 1)$$,
  'campagne, intention et rappels de B non modifiés par A');
select results_eq(
  $$select cs.status::text, (select count(*)::int from public.cash_movements cm where cm.cash_session_id = cs.id)
    from public.cash_sessions cs where cs.id = '9b000000-0000-4000-8000-000000000001'$$,
  $$values ('open', 1)$$,
  'caisse de B non modifiée par A');

-- Contrôle positif des fonctions : l'admin de B voit bien sa campagne, sa caisse et sa caisse restée ouverte.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from public.billing_run_review('8b000000-0000-4000-8000-000000000001')), 1, 'contrôle : admin B lit sa campagne');
select is((public.cash_session_summary('9b000000-0000-4000-8000-000000000001') ->> 'movements_total')::numeric, -50.00::numeric,
  'contrôle : admin B lit sa caisse');
select is((select count(*)::int from public.stale_cash_sessions() where id = '9b000000-0000-4000-8000-000000000001'), 1,
  'contrôle : admin B voit sa caisse restée ouverte');
reset role;

select * from finish();
rollback;
