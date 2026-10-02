-- =====================================================================
-- Planning (page 7, phase 7) : deux admins enregistrent en même temps
--
-- Deux vraies sessions (dblink), chacune connectée comme un admin du centre
-- (rôle authenticated, RLS active). La première tient sa transaction ouverte ;
-- la seconde tente un créneau en conflit : elle attend, puis la base la refuse
-- dès que la première valide. Les contraintes d'exclusion tranchent, sans
-- dépendre d'un contrôle préalable dans l'application.
--
-- Les sessions ne voient que des données validées : une troisième session
-- installe un centre de test permanent (un centre ne se supprime jamais : le
-- journal de la plateforme est en ajout seul) et efface ses cours avant et
-- après chaque passage. Base locale uniquement (réseau, mot de passe local par
-- défaut de Supabase) ; exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(22);

-- Adresse réseau du serveur (la session du test arrive par le réseau) : dblink
-- exige une authentification par mot de passe.
select set_config(
  'conc.dsn',
  format('host=%s port=%s dbname=postgres user=postgres password=postgres', host(inet_server_addr()), inet_server_port()),
  true);

create function pg_temp.connect(p_name text) returns void language plpgsql as $$
begin
  perform extensions.dblink_connect(p_name, current_setting('conc.dsn'));
end;
$$;

-- Ouvre une transaction d'admin (RLS) dans la session donnée.
create function pg_temp.begin_as(p_conn text, p_user uuid) returns void language plpgsql as $$
begin
  perform extensions.dblink_exec(p_conn, 'begin');
  perform extensions.dblink_exec(p_conn, 'set local role authenticated');
  perform extensions.dblink_exec(p_conn, format('set local request.jwt.claims = %L',
    json_build_object('sub', p_user, 'role', 'authenticated')::text));
end;
$$;

create function pg_temp.slot_sql(p_subject uuid, p_level uuid, p_teacher uuid, p_room uuid, p_day int, p_start text, p_end text)
returns text language sql as $$
  select format(
    'insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, room_id, room, day_of_week, start_time, end_time) '
    'values (%L, %L, %L, %L, %L, %L, %s, %L, %L)',
    '0c0cc000-0000-4000-8000-000000000001', p_subject, p_level, p_teacher, p_room, '-', p_day, p_start, p_end);
$$;

-- Lance une requête sans attendre, laisse le temps à la base de la bloquer.
create function pg_temp.send(p_conn text, p_sql text) returns int language plpgsql as $$
begin
  perform extensions.dblink_send_query(p_conn, p_sql);
  perform pg_sleep(0.4);
  return extensions.dblink_is_busy(p_conn);
end;
$$;

-- Résultat d'une requête lancée par send : 'ok' ou le message d'erreur.
create function pg_temp.outcome(p_conn text) returns text language plpgsql as $$
declare
  v_status text;
  v_error text;
begin
  select status into v_status from extensions.dblink_get_result(p_conn, false) as t(status text);
  v_error := extensions.dblink_error_message(p_conn);
  -- Vide la file de résultats avant de réutiliser la connexion.
  perform * from extensions.dblink_get_result(p_conn, false) as t(status text);
  return case when v_error = 'OK' then 'ok' else v_error end;
end;
$$;

-- Lignes validées, lues depuis une session indépendante.
create function pg_temp.committed(p_where text) returns int language sql as $$
  select n from extensions.dblink('setup', 'select count(*)::int from public.schedule_slots where center_id = '
    || quote_literal('0c0cc000-0000-4000-8000-000000000001') || ' and ' || p_where) as t(n int);
$$;

select pg_temp.connect('setup');
select pg_temp.connect('a');
select pg_temp.connect('b');

-- Centre de test (créé au premier passage), sans cours restant d'un passage interrompu.
select extensions.dblink_exec('setup', $sql$
  delete from public.schedule_slots where center_id = '0c0cc000-0000-4000-8000-000000000001';

  insert into auth.users (id, email) values
    ('0c0ca000-0000-4000-8000-000000000001', 'admin1-concurrence@test.local'),
    ('0c0ca000-0000-4000-8000-000000000002', 'admin2-concurrence@test.local'),
    ('0c0ca000-0000-4000-8000-000000000003', 'prof1-concurrence@test.local'),
    ('0c0ca000-0000-4000-8000-000000000004', 'prof2-concurrence@test.local')
  on conflict do nothing;
  insert into public.centers (id, name, slug)
  values ('0c0cc000-0000-4000-8000-000000000001', 'Centre de test (concurrence)', 'tests-concurrence')
  on conflict (id) do update set name = excluded.name where public.centers.name is distinct from excluded.name;
  insert into public.profiles (id, center_id, full_name, role) values
    ('0c0ca000-0000-4000-8000-000000000001', '0c0cc000-0000-4000-8000-000000000001', 'Admin Un', 'admin'),
    ('0c0ca000-0000-4000-8000-000000000002', '0c0cc000-0000-4000-8000-000000000001', 'Admin Deux', 'admin'),
    ('0c0ca000-0000-4000-8000-000000000003', '0c0cc000-0000-4000-8000-000000000001', 'Prof Un', 'teacher'),
    ('0c0ca000-0000-4000-8000-000000000004', '0c0cc000-0000-4000-8000-000000000001', 'Prof Deux', 'teacher')
  on conflict do nothing;
  insert into public.levels (id, center_id, name) values
    ('0c0cd000-0000-4000-8000-000000000001', '0c0cc000-0000-4000-8000-000000000001', 'Niveau A'),
    ('0c0cd000-0000-4000-8000-000000000002', '0c0cc000-0000-4000-8000-000000000001', 'Niveau B')
  on conflict do nothing;
  insert into public.subjects (id, center_id, level_id, name, monthly_price) values
    ('0c0ce000-0000-4000-8000-000000000001', '0c0cc000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001', 'Maths A', 300),
    ('0c0ce000-0000-4000-8000-000000000002', '0c0cc000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001', 'Anglais A', 250),
    ('0c0ce000-0000-4000-8000-000000000003', '0c0cc000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000002', 'Maths B', 300)
  on conflict do nothing;
  insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
    ('0c0ca000-0000-4000-8000-000000000003', '0c0ce000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001'),
    ('0c0ca000-0000-4000-8000-000000000003', '0c0ce000-0000-4000-8000-000000000003', '0c0cd000-0000-4000-8000-000000000002'),
    ('0c0ca000-0000-4000-8000-000000000004', '0c0ce000-0000-4000-8000-000000000002', '0c0cd000-0000-4000-8000-000000000001'),
    ('0c0ca000-0000-4000-8000-000000000004', '0c0ce000-0000-4000-8000-000000000003', '0c0cd000-0000-4000-8000-000000000002')
  on conflict do nothing;
  insert into public.rooms (id, center_id, name, capacity) values
    ('0c0cf000-0000-4000-8000-000000000001', '0c0cc000-0000-4000-8000-000000000001', 'Salle Une', 20),
    ('0c0cf000-0000-4000-8000-000000000002', '0c0cc000-0000-4000-8000-000000000001', 'Salle Deux', 20),
    ('0c0cf000-0000-4000-8000-000000000003', '0c0cc000-0000-4000-8000-000000000001', 'Salle Trois', 20)
  on conflict do nothing;
$sql$);

-- ---------------------------------------------------------------------
-- 1. Même salle, chevauchement partiel (14h–16h / 15h–17h), mardi
-- ---------------------------------------------------------------------
select pg_temp.begin_as('a', '0c0ca000-0000-4000-8000-000000000001');
select extensions.dblink_exec('a', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001',
  '0c0ca000-0000-4000-8000-000000000003', '0c0cf000-0000-4000-8000-000000000001', 2, '14:00', '16:00'));
select pg_temp.begin_as('b', '0c0ca000-0000-4000-8000-000000000002');
select is(
  pg_temp.send('b', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000003', '0c0cd000-0000-4000-8000-000000000002',
    '0c0ca000-0000-4000-8000-000000000004', '0c0cf000-0000-4000-8000-000000000001', 2, '15:00', '17:00')),
  1, 'salle : le second admin attend la décision du premier');
select extensions.dblink_exec('a', 'commit');
select matches(pg_temp.outcome('b'), 'schedule_slots_no_room_overlap', 'salle : le second est refusé dès que le premier valide');
select extensions.dblink_exec('b', 'rollback');
select is(pg_temp.committed('day_of_week = 2'), 1, 'salle : un seul cours enregistré, celui du premier');

-- ---------------------------------------------------------------------
-- 2. Même professeur dans deux salles, mercredi
-- ---------------------------------------------------------------------
select pg_temp.begin_as('a', '0c0ca000-0000-4000-8000-000000000001');
select extensions.dblink_exec('a', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001',
  '0c0ca000-0000-4000-8000-000000000003', '0c0cf000-0000-4000-8000-000000000001', 3, '14:00', '16:00'));
select pg_temp.begin_as('b', '0c0ca000-0000-4000-8000-000000000002');
select is(
  pg_temp.send('b', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000003', '0c0cd000-0000-4000-8000-000000000002',
    '0c0ca000-0000-4000-8000-000000000003', '0c0cf000-0000-4000-8000-000000000002', 3, '15:30', '16:30')),
  1, 'professeur : le second admin attend');
select extensions.dblink_exec('a', 'commit');
select matches(pg_temp.outcome('b'), 'schedule_slots_no_teacher_overlap', 'professeur : le second est refusé');
select extensions.dblink_exec('b', 'rollback');
select is(pg_temp.committed('day_of_week = 3'), 1, 'professeur : un seul cours enregistré');

-- ---------------------------------------------------------------------
-- 3. Même niveau, deux matières, deux salles, deux professeurs, jeudi
-- ---------------------------------------------------------------------
select pg_temp.begin_as('a', '0c0ca000-0000-4000-8000-000000000001');
select extensions.dblink_exec('a', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001',
  '0c0ca000-0000-4000-8000-000000000003', '0c0cf000-0000-4000-8000-000000000001', 4, '14:00', '16:00'));
select pg_temp.begin_as('b', '0c0ca000-0000-4000-8000-000000000002');
select is(
  pg_temp.send('b', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000002', '0c0cd000-0000-4000-8000-000000000001',
    '0c0ca000-0000-4000-8000-000000000004', '0c0cf000-0000-4000-8000-000000000002', 4, '13:00', '14:30')),
  1, 'niveau : le second admin attend');
select extensions.dblink_exec('a', 'commit');
select matches(pg_temp.outcome('b'), 'schedule_slots_no_level_overlap', 'niveau : le second est refusé');
select extensions.dblink_exec('b', 'rollback');
select is(pg_temp.committed('day_of_week = 4'), 1, 'niveau : un seul cours enregistré');

-- ---------------------------------------------------------------------
-- 4. Le premier renonce (annulation) : le second passe
-- ---------------------------------------------------------------------
select pg_temp.begin_as('a', '0c0ca000-0000-4000-8000-000000000001');
select extensions.dblink_exec('a', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001',
  '0c0ca000-0000-4000-8000-000000000003', '0c0cf000-0000-4000-8000-000000000001', 5, '14:00', '16:00'));
select pg_temp.begin_as('b', '0c0ca000-0000-4000-8000-000000000002');
select is(
  pg_temp.send('b', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000003', '0c0cd000-0000-4000-8000-000000000002',
    '0c0ca000-0000-4000-8000-000000000004', '0c0cf000-0000-4000-8000-000000000001', 5, '15:00', '17:00')),
  1, 'annulation : le second attend');
select extensions.dblink_exec('a', 'rollback');
select is(pg_temp.outcome('b'), 'ok', 'annulation : le second est accepté quand le premier renonce');
select extensions.dblink_exec('b', 'commit');
select is(pg_temp.committed($$day_of_week = 5 and teacher_id = '0c0ca000-0000-4000-8000-000000000004'$$), 1,
  'annulation : le cours du second est enregistré');

-- ---------------------------------------------------------------------
-- 5. Cours voisins (16h pile) : aucun blocage, les deux passent
-- ---------------------------------------------------------------------
select pg_temp.begin_as('a', '0c0ca000-0000-4000-8000-000000000001');
select extensions.dblink_exec('a', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001',
  '0c0ca000-0000-4000-8000-000000000003', '0c0cf000-0000-4000-8000-000000000001', 6, '14:00', '16:00'));
select pg_temp.begin_as('b', '0c0ca000-0000-4000-8000-000000000002');
select is(
  pg_temp.send('b', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000003', '0c0cd000-0000-4000-8000-000000000002',
    '0c0ca000-0000-4000-8000-000000000004', '0c0cf000-0000-4000-8000-000000000001', 6, '16:00', '18:00')),
  0, 'cours voisins : le second n''attend pas');
select is(pg_temp.outcome('b'), 'ok', 'cours voisins : le second est accepté');
select extensions.dblink_exec('a', 'commit');
select extensions.dblink_exec('b', 'commit');
select is(pg_temp.committed('day_of_week = 6'), 2, 'cours voisins : les deux cours sont enregistrés');

-- ---------------------------------------------------------------------
-- 6. Deux déplacements simultanés (glisser-déposer) vers la même salle
-- ---------------------------------------------------------------------
select extensions.dblink_exec('setup', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000001', '0c0cd000-0000-4000-8000-000000000001',
  '0c0ca000-0000-4000-8000-000000000003', '0c0cf000-0000-4000-8000-000000000002', 1, '09:00', '10:00'));
select extensions.dblink_exec('setup', pg_temp.slot_sql('0c0ce000-0000-4000-8000-000000000003', '0c0cd000-0000-4000-8000-000000000002',
  '0c0ca000-0000-4000-8000-000000000004', '0c0cf000-0000-4000-8000-000000000003', 1, '09:00', '10:00'));
select pg_temp.begin_as('a', '0c0ca000-0000-4000-8000-000000000001');
select extensions.dblink_exec('a', $sql$
  update public.schedule_slots set room_id = '0c0cf000-0000-4000-8000-000000000001', start_time = '10:00', end_time = '12:00'
  where center_id = '0c0cc000-0000-4000-8000-000000000001' and day_of_week = 1 and teacher_id = '0c0ca000-0000-4000-8000-000000000003'
$sql$);
select pg_temp.begin_as('b', '0c0ca000-0000-4000-8000-000000000002');
select is(pg_temp.send('b', $sql$
  update public.schedule_slots set room_id = '0c0cf000-0000-4000-8000-000000000001', start_time = '11:00', end_time = '13:00'
  where center_id = '0c0cc000-0000-4000-8000-000000000001' and day_of_week = 1 and teacher_id = '0c0ca000-0000-4000-8000-000000000004'
$sql$), 1, 'déplacements : le second attend');
select extensions.dblink_exec('a', 'commit');
select matches(pg_temp.outcome('b'), 'schedule_slots_no_room_overlap', 'déplacements : le second est refusé');
select extensions.dblink_exec('b', 'rollback');
select is(pg_temp.committed($$day_of_week = 1 and room_id = '0c0cf000-0000-4000-8000-000000000001'$$), 1,
  'déplacements : un seul cours arrive dans la salle');
select is(pg_temp.committed($$day_of_week = 1 and room_id = '0c0cf000-0000-4000-8000-000000000003' and start_time = '09:00'$$), 1,
  'déplacements : le cours refusé reste à sa place');

-- ---------------------------------------------------------------------
-- 7. Explication cohérente après coup : slot_conflicts voit le cours validé
-- ---------------------------------------------------------------------
select pg_temp.begin_as('b', '0c0ca000-0000-4000-8000-000000000002');
select results_eq(
  $$select * from extensions.dblink('b', 'select conflict_type::text, teacher_name, subject_name from public.slot_conflicts(
      ''0c0cd000-0000-4000-8000-000000000002'', ''0c0ca000-0000-4000-8000-000000000004'',
      ''0c0cf000-0000-4000-8000-000000000001'', 2::smallint, ''15:00'', ''17:00'')') as t(type text, teacher text, subject text)$$,
  $$values ('room', 'Prof Un', 'Maths A')$$,
  'le refusé obtient l''explication du conflit (salle, professeur, matière)');
select extensions.dblink_exec('b', 'rollback');

-- Bilan : mardi, mercredi, jeudi, vendredi (le second), samedi (deux), lundi (deux).
select is(
  (select n from extensions.dblink('setup', 'select count(*)::int from public.schedule_slots where center_id = '
    || quote_literal('0c0cc000-0000-4000-8000-000000000001')) as t(n int)),
  8, 'état final : huit cours validés pour le centre du test');

-- Nettoyage : les cours du test sont effacés (le centre de test reste).
select extensions.dblink_exec('setup', $sql$
  delete from public.schedule_slots where center_id = '0c0cc000-0000-4000-8000-000000000001';
$sql$);
select is(pg_temp.committed('true'), 0, 'nettoyage : cours du test effacés');

select extensions.dblink_disconnect('a');
select extensions.dblink_disconnect('b');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
