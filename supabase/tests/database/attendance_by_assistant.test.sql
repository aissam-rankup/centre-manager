-- =====================================================================
-- Absence marquée par l'accueil (page 9, phase 2) : appel depuis les
-- séances, auteur et heure de chaque saisie, historique, désaccords
-- professeur / accueil signalés à l'admin, décision de l'admin, chaîne
-- d'absence inchangée. Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

insert into auth.users (id, email) values
  ('a9200000-0000-4000-8000-000000000001', 'admin-a-p92@test.local'),
  ('a9200000-0000-4000-8000-000000000002', 'accueil-a-p92@test.local'),
  ('a9200000-0000-4000-8000-000000000003', 'prof-a-p92@test.local'),
  ('a9200000-0000-4000-8000-000000000004', 'accueil-b-p92@test.local');
insert into public.centers (id, name, slug) values
  ('c9200000-0000-4000-8000-0000000000a1', 'Centre A', 'p92-a'),
  ('c9200000-0000-4000-8000-0000000000b1', 'Centre B', 'p92-b');
insert into public.profiles (id, center_id, full_name, role) values
  ('a9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-0000000000a1', 'Admin A', 'admin'),
  ('a9200000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-0000000000a1', 'Accueil A', 'assistant'),
  ('a9200000-0000-4000-8000-000000000003', 'c9200000-0000-4000-8000-0000000000a1', 'Prof A', 'teacher'),
  ('a9200000-0000-4000-8000-000000000004', 'c9200000-0000-4000-8000-0000000000b1', 'Accueil B', 'assistant');
insert into public.levels (id, center_id, name)
values ('d9200000-0000-4000-8000-0000000000a1', 'c9200000-0000-4000-8000-0000000000a1', 'Niveau A');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e9200000-0000-4000-8000-0000000000a1', 'c9200000-0000-4000-8000-0000000000a1', 'd9200000-0000-4000-8000-0000000000a1', 'Maths', 300),
  ('e9200000-0000-4000-8000-0000000000a2', 'c9200000-0000-4000-8000-0000000000a1', 'd9200000-0000-4000-8000-0000000000a1', 'Physique', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id)
values ('a9200000-0000-4000-8000-000000000003', 'e9200000-0000-4000-8000-0000000000a1', 'd9200000-0000-4000-8000-0000000000a1'),
       ('a9200000-0000-4000-8000-000000000003', 'e9200000-0000-4000-8000-0000000000a2', 'd9200000-0000-4000-8000-0000000000a1');
-- Séance de maths aujourd'hui ; séance de physique demain (jour de semaine différent).
insert into public.schedule_slots (id, center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room) values
  ('f9200000-0000-4000-8000-0000000000a1', 'c9200000-0000-4000-8000-0000000000a1', 'e9200000-0000-4000-8000-0000000000a1',
   'd9200000-0000-4000-8000-0000000000a1', 'a9200000-0000-4000-8000-000000000003',
   extract(dow from private.today())::smallint, '10:00', '12:00', 'Salle 1'),
  ('f9200000-0000-4000-8000-0000000000a2', 'c9200000-0000-4000-8000-0000000000a1', 'e9200000-0000-4000-8000-0000000000a2',
   'd9200000-0000-4000-8000-0000000000a1', 'a9200000-0000-4000-8000-000000000003',
   extract(dow from private.today() + 1)::smallint, '10:00', '12:00', 'Salle 1');
insert into public.students (id, center_id, full_name, level_id)
select ('59200000-0000-4000-8000-00000000000' || g)::uuid, 'c9200000-0000-4000-8000-0000000000a1', 'Élève ' || g, 'd9200000-0000-4000-8000-0000000000a1'
from generate_series(1, 4) as g;
-- Élèves 1 à 3 inscrits en maths depuis 30 jours ; l'élève 4 ne l'est pas.
insert into public.enrollments (student_id, subject_id, start_date, billing_day)
select ('59200000-0000-4000-8000-00000000000' || g)::uuid, 'e9200000-0000-4000-8000-0000000000a1', private.today() - 30, 1
from generate_series(1, 3) as g;

create function pg_temp.att(p_student text) returns public.attendance language sql security definer as
$$ select * from public.attendance where student_id = ('59200000-0000-4000-8000-00000000000' || p_student)::uuid
     and subject_id = 'e9200000-0000-4000-8000-0000000000a1' and session_date = private.today() $$;
create function pg_temp.entries(p_student text) returns integer language sql security definer as
$$ select count(*)::integer from public.attendance_entries where attendance_id = (pg_temp.att(p_student)).id $$;
create function pg_temp.open_conflicts() returns integer language sql security definer as
$$ select count(*)::integer from public.attendance_conflicts where center_id = 'c9200000-0000-4000-8000-0000000000a1' and resolved_at is null $$;
create function pg_temp.entries_json(p_present text[]) returns jsonb language sql as
$$ select jsonb_agg(jsonb_build_object('student_id', '59200000-0000-4000-8000-00000000000' || g, 'status',
     case when g::text = any (p_present) then 'present' else 'absent' end))
   from generate_series(1, 3) as g $$;

set local role authenticated;

-- ---------------------------------------------------------------------
-- L'accueil fait l'appel : auteur, rôle, professeur de la séance, historique
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9200000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today(), pg_temp.entries_json(array['1', '2', '3'])),
  3, 'accueil : appel de la séance du jour enregistré');
select is((pg_temp.att('1')).marked_by, 'a9200000-0000-4000-8000-000000000002'::uuid, 'saisie attribuée au compte de l''accueil');
select is((pg_temp.att('1')).marked_by_role::text, 'assistant', 'saisie faite à titre d''accueil');
select is((pg_temp.att('1')).teacher_id, 'a9200000-0000-4000-8000-000000000003'::uuid, 'séance rattachée à son professeur');
select is(pg_temp.entries('1'), 1, 'historique : une saisie');
select throws_ok($$insert into public.attendance (student_id, subject_id, session_date, status)
  values ('59200000-0000-4000-8000-000000000001', 'e9200000-0000-4000-8000-0000000000a2', private.today(), 'present')$$,
  '42501', null, 'accueil : pas d''écriture directe des présences (fonction d''appel uniquement)');

-- Re-saisie identique et note : l'auteur ne change pas.
select set_config('test.marked_at', (pg_temp.att('2')).marked_at::text, true);
select lives_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59200000-0000-4000-8000-000000000002","status":"present"}]')$$, 'accueil : re-saisie identique acceptée');
select is((pg_temp.att('2')).marked_at::text, current_setting('test.marked_at'), 're-saisie identique : heure de saisie inchangée');

-- Refus : date, jour, élève, rôle, centre.
select throws_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today() + 7,
  '[{"student_id":"59200000-0000-4000-8000-000000000001","status":"present"}]')$$, '22023', null, 'séance future refusée');
select throws_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today() - 14,
  '[{"student_id":"59200000-0000-4000-8000-000000000001","status":"present"}]')$$, '22023', null, 'au-delà de 7 jours : refusé');
select throws_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today() - 1,
  '[{"student_id":"59200000-0000-4000-8000-000000000001","status":"present"}]')$$, '22023', null, 'jour sans cette séance refusé');
select throws_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59200000-0000-4000-8000-000000000004","status":"absent"}]')$$, '22023', null, 'élève non inscrit refusé');
select throws_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59200000-0000-4000-8000-000000000001","status":"late"}]')$$, '22023', null, 'statut inconnu refusé');
set local request.jwt.claims = '{"sub":"a9200000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59200000-0000-4000-8000-000000000001","status":"absent"}]')$$, 'P0002', null, 'accueil d''un autre centre : séance introuvable');
set local request.jwt.claims = '{"sub":"a9200000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59200000-0000-4000-8000-000000000001","status":"absent"}]')$$, '42501', null, 'professeur : passe par son propre appel');
select throws_ok($$select * from public.staff_day_sessions(private.today())$$, '42501', null, 'professeur : séances de l''équipe refusées');

-- ---------------------------------------------------------------------
-- Le professeur saisit autrement : désaccord, valeur la plus récente
-- ---------------------------------------------------------------------
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status)
values ('59200000-0000-4000-8000-000000000001', 'e9200000-0000-4000-8000-0000000000a1', 'a9200000-0000-4000-8000-000000000003', private.today(), 'absent')
on conflict (student_id, subject_id, session_date) do update set status = excluded.status;
select is((pg_temp.att('1')).status::text, 'absent', 'saisie la plus récente affichée (professeur)');
select is((pg_temp.att('1')).marked_by_role::text, 'teacher', 'auteur affiché : le professeur');
select is(pg_temp.entries('1'), 2, 'historique : les deux saisies gardées');
select is(pg_temp.open_conflicts(), 1, 'désaccord professeur / accueil signalé');

set local request.jwt.claims = '{"sub":"a9200000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.attendance_conflicts), 0, 'accueil : les désaccords sont pour l''admin');
select throws_ok($$select * from public.open_attendance_conflicts()$$, '42501', null, 'accueil : liste des désaccords refusée');
select is((select count(*)::integer from public.attendance_entries where attendance_id = (pg_temp.att('1')).id), 2,
  'accueil : historique des saisies visible');
select is((select history ->> 1 is not null from public.student_attendance('59200000-0000-4000-8000-000000000001')
           where subject_id = 'e9200000-0000-4000-8000-0000000000a1'), true, 'fiche d''assiduité : historique des saisies');
select is((select marked_by_name || ' ' || marked_by_role from public.student_attendance('59200000-0000-4000-8000-000000000001')
           where subject_id = 'e9200000-0000-4000-8000-0000000000a1'), 'Prof A teacher', 'fiche d''assiduité : qui a saisi');
select is((select marked_count || '/' || student_count || ' p' || teacher_marked || ' a' || staff_marked || ' c' || open_conflicts
           from public.staff_day_sessions(private.today()) where slot_id = 'f9200000-0000-4000-8000-0000000000a1'),
  '3/3 p1 a2 c1', 'séances du jour : avancement, auteurs et désaccord');

-- L'accueil se range à l'avis du professeur : désaccord clos de lui-même.
select lives_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59200000-0000-4000-8000-000000000001","status":"absent"}]')$$, 'accueil : corrige sa saisie');
select is(pg_temp.open_conflicts(), 0, 'saisies rejointes : désaccord clos');
select is(pg_temp.entries('1'), 3, 'confirmation de l''accueil gardée dans l''historique');

-- ---------------------------------------------------------------------
-- Désaccord tranché par l'admin
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a9200000-0000-4000-8000-000000000003","role":"authenticated"}';
update public.attendance set status = 'absent'
where student_id = '59200000-0000-4000-8000-000000000002' and subject_id = 'e9200000-0000-4000-8000-0000000000a1' and session_date = private.today();
select is(pg_temp.open_conflicts(), 1, 'nouveau désaccord (élève 2)');
set local request.jwt.claims = '{"sub":"a9200000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.resolve_attendance_conflict((select id from public.attendance_conflicts limit 1), 'present')$$,
  '42501', null, 'accueil : ne tranche pas');
set local request.jwt.claims = '{"sub":"a9200000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select teacher_status || ' / ' || staff_status || ' ' || staff_role from public.open_attendance_conflicts()),
  'absent / present assistant', 'admin : les deux saisies du désaccord');
select lives_ok($$select public.resolve_attendance_conflict((select conflict_id from public.open_attendance_conflicts()), 'present')$$,
  'admin : retient « présent »');
select is((pg_temp.att('2')).status::text || ' ' || (pg_temp.att('2')).marked_by_role, 'present admin', 'statut retenu, saisi par l''admin');
select is(pg_temp.open_conflicts(), 0, 'décision de l''admin : pas de nouveau désaccord');
reset role;
select is((select resolution from public.attendance_conflicts where attendance_id = (pg_temp.att('2')).id), 'confirmed',
  'désaccord marqué comme tranché');
select throws_ok($$update public.attendance_entries set status = 'present'$$, '42501', null, 'historique en ajout seul');

-- ---------------------------------------------------------------------
-- Chaîne d'absence inchangée : trois absences, dont une saisie par l'accueil
-- ---------------------------------------------------------------------
insert into public.attendance (student_id, subject_id, teacher_id, session_date, status) values
  ('59200000-0000-4000-8000-000000000003', 'e9200000-0000-4000-8000-0000000000a1', 'a9200000-0000-4000-8000-000000000003', private.today() - 14, 'absent'),
  ('59200000-0000-4000-8000-000000000003', 'e9200000-0000-4000-8000-0000000000a1', 'a9200000-0000-4000-8000-000000000003', private.today() - 7, 'absent');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9200000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select public.mark_session_attendance('f9200000-0000-4000-8000-0000000000a1', private.today(),
  '[{"student_id":"59200000-0000-4000-8000-000000000003","status":"absent"}]')$$, 'accueil : troisième absence');
reset role;
select is((select count(*)::integer from public.alerts
           where student_id = '59200000-0000-4000-8000-000000000003' and type = 'consecutive_absences' and not resolved),
  1, 'alerte à trois absences déclenchée');

select * from finish();
rollback;
