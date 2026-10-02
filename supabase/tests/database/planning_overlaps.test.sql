-- =====================================================================
-- Planning (page 7, phase 7) : chevauchements partiels
--
-- Un cours existant, mardi 14h–16h. Pour chaque dimension (salle, professeur,
-- niveau) et chaque position relative d'un nouveau cours, on vérifie que :
--   1. la base refuse exactement les chevauchements (bornes exclusives) ;
--   2. l'explication du panneau (slot_conflicts) dit la même chose.
-- Les insertions passent par un admin du centre (RLS active).
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(62);

insert into auth.users (id, email) values
  ('a8000000-0000-4000-8000-000000000001', 'admin-p71@test.local'),
  ('a8000000-0000-4000-8000-000000000002', 'prof1-p71@test.local'),
  ('a8000000-0000-4000-8000-000000000003', 'prof2-p71@test.local');
insert into public.centers (id, name, slug) values ('c8000000-0000-4000-8000-000000000001', 'Centre P71', 'centre-p71');
insert into public.profiles (id, center_id, full_name, role) values
  ('a8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Admin', 'admin'),
  ('a8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'Prof Un', 'teacher'),
  ('a8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'Prof Deux', 'teacher');
insert into public.levels (id, center_id, name) values
  ('d8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Niveau A'),
  ('d8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'Niveau B');
insert into public.subjects (id, center_id, level_id, name, monthly_price) values
  ('e8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'Maths A', 300),
  ('e8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'Anglais A', 250),
  ('e8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002', 'Maths B', 300);
insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
  ('a8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('a8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000002'),
  ('a8000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000001'),
  ('a8000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000002');
insert into public.rooms (id, center_id, name) values
  ('f8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Salle Une'),
  ('f8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'Salle Deux');

-- Le cours en place : Maths A, Niveau A, Prof Un, Salle Une, mardi 14h–16h.
insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, room_id, room, day_of_week, start_time, end_time) values
  ('c8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
   'a8000000-0000-4000-8000-000000000002', 'f8000000-0000-4000-8000-000000000001', '-', 2, '14:00', '16:00');

-- Positions du nouveau cours par rapport à 14h–16h.
create temp table cases (label text, day smallint, start_time time, end_time time, conflicting boolean);
insert into cases values
  ('identique 14h–16h', 2, '14:00', '16:00', true),
  ('déborde après 15h–17h', 2, '15:00', '17:00', true),
  ('déborde avant 13h–15h', 2, '13:00', '15:00', true),
  ('inclus 14h30–15h30', 2, '14:30', '15:30', true),
  ('englobant 13h–17h', 2, '13:00', '17:00', true),
  ('une minute à la fin 15h59–17h', 2, '15:59', '17:00', true),
  ('une minute au début 13h–14h01', 2, '13:00', '14:01', true),
  ('enchaîne après 16h–17h', 2, '16:00', '17:00', false),
  ('enchaîne avant 13h–14h', 2, '13:00', '14:00', false),
  ('autre jour, même horaire', 3, '14:00', '16:00', false);

-- Ce qui ne doit être partagé qu'avec le cours en place, dimension par dimension.
create temp table dimensions (dimension text, constraint_name text, subject_id uuid, level_id uuid, teacher_id uuid, room_id uuid);
insert into dimensions values
  ('room', 'schedule_slots_no_room_overlap', 'e8000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000002',
   'a8000000-0000-4000-8000-000000000003', 'f8000000-0000-4000-8000-000000000001'),
  ('teacher', 'schedule_slots_no_teacher_overlap', 'e8000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000002',
   'a8000000-0000-4000-8000-000000000002', 'f8000000-0000-4000-8000-000000000002'),
  ('level', 'schedule_slots_no_level_overlap', 'e8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000001',
   'a8000000-0000-4000-8000-000000000003', 'f8000000-0000-4000-8000-000000000002');

grant select on cases, dimensions to authenticated;

-- Tente le cours puis l'annule : renvoie 'accepté' ou la contrainte qui le refuse.
create function pg_temp.attempt(d dimensions, c cases) returns text language plpgsql as $$
declare
  v_constraint text;
begin
  begin
    insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, room_id, room, day_of_week, start_time, end_time)
    values ('c8000000-0000-4000-8000-000000000001', d.subject_id, d.level_id, d.teacher_id, d.room_id, '-', c.day, c.start_time, c.end_time);
    raise exception using errcode = 'P0001', message = 'accepté';
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      return v_constraint;
    when raise_exception then
      return sqlerrm;
  end;
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a8000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  pg_temp.attempt(d, c),
  case when c.conflicting then d.constraint_name else 'accepté' end,
  format('%s, %s : %s', d.dimension, c.label, case when c.conflicting then 'refusé' else 'accepté' end))
from dimensions d cross join cases c
order by d.dimension, c.label;

select is(
  (select coalesce(string_agg(x.conflict_type::text, ','), '')
   from public.slot_conflicts(d.level_id, d.teacher_id, d.room_id, c.day, c.start_time, c.end_time) x),
  case when c.conflicting then d.dimension else '' end,
  format('%s, %s : explication %s', d.dimension, c.label, case when c.conflicting then 'du conflit' else 'vide' end))
from dimensions d cross join cases c
order by d.dimension, c.label;

-- Un cours déplacé ne se bloque pas lui-même, même s'il chevauche sa propre position.
select is(
  (select count(*)::int from public.slot_conflicts('d8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002',
     'f8000000-0000-4000-8000-000000000001', 2::smallint, '15:00', '17:00',
     (select id from public.schedule_slots where center_id = 'c8000000-0000-4000-8000-000000000001'))),
  0, 'déplacement d''une heure : le cours ne se bloque pas lui-même');
select lives_ok(
  $$update public.schedule_slots set start_time = '15:00', end_time = '17:00' where center_id = 'c8000000-0000-4000-8000-000000000001'$$,
  'déplacement d''une heure accepté par la base');

reset role;

select * from finish();
rollback;
