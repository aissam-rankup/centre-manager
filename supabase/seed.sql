-- =====================================================================
-- CentroManager — seed de démonstration (local uniquement)
--
-- 1 centre · 3 niveaux · 6 matières · 1 admin · 1 assistant · 3 professeurs
-- 40 élèves · planning hebdomadaire · 4 semaines de présences
-- factures du mois précédent et du mois en cours, dont certaines en retard.
--
-- Toutes les dates sont calculées à partir du jour du `supabase db reset`
-- (fuseau Africa/Casablanca) : la démo reste cohérente quel que soit le jour.
--
-- Mot de passe commun des comptes de démo : CentroDemo2026!
-- =====================================================================

-- Création d'un compte Auth + profil (fonction temporaire, propre à cette session).
create function pg_temp.create_demo_user(
  p_id uuid,
  p_center_id uuid,
  p_email text,
  p_full_name text,
  p_role public.user_role,
  p_phone text
) returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('CentroDemo2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (id, center_id, full_name, role, phone)
  values (p_id, p_center_id, p_full_name, p_role, p_phone);
end;
$$;

do $$
declare
  -- Identifiants fixes pour faciliter les tests manuels.
  c_center    constant uuid := '10000000-0000-4000-8000-000000000001';
  c_admin     constant uuid := '20000000-0000-4000-8000-000000000001';
  c_assistant constant uuid := '20000000-0000-4000-8000-000000000002';
  c_prof1     constant uuid := '20000000-0000-4000-8000-000000000011';
  c_prof2     constant uuid := '20000000-0000-4000-8000-000000000012';
  c_prof3     constant uuid := '20000000-0000-4000-8000-000000000013';

  v_today date := private.today();
  v_current_month date := date_trunc('month', private.today())::date;
  v_previous_month date := (date_trunc('month', private.today()) - interval '1 month')::date;

  v_tc uuid;   -- Tronc commun
  v_1bac uuid; -- 1ère année BAC
  v_2bac uuid; -- 2ème année BAC Sciences

  v_maths_tc uuid; v_anglais_tc uuid;
  v_maths_1bac uuid; v_francais_1bac uuid;
  v_maths_2bac uuid; v_pc_2bac uuid;

  first_names constant text[] := array[
    'Yassine', 'Salma', 'Omar', 'Imane', 'Mehdi', 'Khadija', 'Anas', 'Fatima Zahra', 'Hamza', 'Aya',
    'Adam', 'Hiba', 'Ilyas', 'Meryem', 'Reda', 'Nour', 'Zakaria', 'Sara', 'Ayoub', 'Rim'
  ];
  last_names constant text[] := array[
    'El Amrani', 'Bennani', 'Tazi', 'Alaoui', 'Idrissi', 'Berrada', 'Chraibi', 'El Fassi', 'Benjelloun', 'Lahlou',
    'Ouazzani', 'Kettani', 'Sqalli', 'Belkadi', 'Naciri', 'Filali', 'Ziani', 'Rami', 'Haddad', 'Mansouri'
  ];
begin
  -- -------------------------------------------------------------------
  -- Centre et comptes
  -- -------------------------------------------------------------------
  insert into public.centers (id, name) values (c_center, 'Centre Al Wiam — Casablanca');

  perform pg_temp.create_demo_user(c_admin, c_center, 'admin@centro.demo', 'Nadia Berrada', 'admin', '06 61 12 34 56');
  perform pg_temp.create_demo_user(c_assistant, c_center, 'accueil@centro.demo', 'Karim Lahlou', 'assistant', '06 62 23 45 67');
  perform pg_temp.create_demo_user(c_prof1, c_center, 'prof1@centro.demo', 'Rachid Benali', 'teacher', '06 63 34 56 78');
  perform pg_temp.create_demo_user(c_prof2, c_center, 'prof2@centro.demo', 'Laila Chakir', 'teacher', '06 64 45 67 89');
  perform pg_temp.create_demo_user(c_prof3, c_center, 'prof3@centro.demo', 'Youssef Amrani', 'teacher', '06 65 56 78 90');

  -- -------------------------------------------------------------------
  -- Niveaux et matières (tarifs mensuels en MAD)
  -- -------------------------------------------------------------------
  insert into public.levels (center_id, name, sort_order) values (c_center, 'Tronc commun', 1) returning id into v_tc;
  insert into public.levels (center_id, name, sort_order) values (c_center, '1ère année BAC', 2) returning id into v_1bac;
  insert into public.levels (center_id, name, sort_order) values (c_center, '2ème année BAC Sciences', 3) returning id into v_2bac;

  insert into public.subjects (center_id, level_id, name, monthly_price) values (c_center, v_tc, 'Mathématiques', 300) returning id into v_maths_tc;
  insert into public.subjects (center_id, level_id, name, monthly_price) values (c_center, v_tc, 'Anglais', 250) returning id into v_anglais_tc;
  insert into public.subjects (center_id, level_id, name, monthly_price) values (c_center, v_1bac, 'Mathématiques', 400) returning id into v_maths_1bac;
  insert into public.subjects (center_id, level_id, name, monthly_price) values (c_center, v_1bac, 'Français', 300) returning id into v_francais_1bac;
  insert into public.subjects (center_id, level_id, name, monthly_price) values (c_center, v_2bac, 'Mathématiques', 500) returning id into v_maths_2bac;
  insert into public.subjects (center_id, level_id, name, monthly_price) values (c_center, v_2bac, 'Physique-Chimie', 450) returning id into v_pc_2bac;

  -- -------------------------------------------------------------------
  -- Affectations des professeurs
  -- -------------------------------------------------------------------
  insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
    (c_prof1, v_maths_tc, v_tc),
    (c_prof1, v_maths_1bac, v_1bac),
    (c_prof1, v_maths_2bac, v_2bac),
    (c_prof2, v_pc_2bac, v_2bac),
    (c_prof3, v_anglais_tc, v_tc),
    (c_prof3, v_francais_1bac, v_1bac);

  -- -------------------------------------------------------------------
  -- Planning hebdomadaire (0 = dimanche, 1 = lundi … 6 = samedi)
  -- -------------------------------------------------------------------
  insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room) values
    (c_center, v_maths_tc,      v_tc,   c_prof1, 1, '17:00', '18:30', 'Salle 1'),
    (c_center, v_maths_tc,      v_tc,   c_prof1, 3, '17:00', '18:30', 'Salle 1'),
    (c_center, v_maths_1bac,    v_1bac, c_prof1, 2, '17:00', '18:30', 'Salle 1'),
    (c_center, v_maths_1bac,    v_1bac, c_prof1, 4, '17:00', '18:30', 'Salle 1'),
    (c_center, v_maths_2bac,    v_2bac, c_prof1, 1, '18:45', '20:15', 'Salle 1'),
    (c_center, v_maths_2bac,    v_2bac, c_prof1, 6, '10:00', '12:00', 'Salle 1'),
    (c_center, v_pc_2bac,       v_2bac, c_prof2, 2, '18:45', '20:15', 'Salle 2'),
    (c_center, v_pc_2bac,       v_2bac, c_prof2, 5, '17:00', '18:30', 'Salle 2'),
    (c_center, v_anglais_tc,    v_tc,   c_prof3, 2, '17:00', '18:30', 'Salle 2'),
    (c_center, v_anglais_tc,    v_tc,   c_prof3, 6, '14:00', '15:30', 'Salle 2'),
    (c_center, v_francais_1bac, v_1bac, c_prof3, 3, '17:00', '18:30', 'Salle 3'),
    (c_center, v_francais_1bac, v_1bac, c_prof3, 5, '18:45', '20:15', 'Salle 3');

  -- -------------------------------------------------------------------
  -- 40 élèves : 1–13 Tronc commun, 14–27 1ère année BAC, 28–40 2ème année BAC
  -- -------------------------------------------------------------------
  create temp table demo_students on commit drop as
  select
    i as idx,
    gen_random_uuid() as id,
    first_names[1 + (i - 1) % 20] || ' ' || last_names[1 + ((i - 1) * 3 + (i - 1) / 20) % 20] as full_name,
    case when i <= 13 then v_tc when i <= 27 then v_1bac else v_2bac end as level_id,
    last_names[1 + ((i - 1) * 3 + (i - 1) / 20) % 20] as family_name
  from generate_series(1, 40) as i;

  insert into public.students (id, center_id, full_name, level_id, guardian_name, guardian_phone, notes, created_at, created_by)
  select
    d.id, c_center, d.full_name, d.level_id,
    case when d.idx % 2 = 0 then 'Mme ' else 'M. ' end || d.family_name,
    '06 ' || lpad(((d.idx * 37) % 100)::text, 2, '0') || ' ' || lpad(((d.idx * 53) % 100)::text, 2, '0')
      || ' ' || lpad(((d.idx * 71) % 100)::text, 2, '0') || ' ' || lpad(((d.idx * 89) % 100)::text, 2, '0'),
    case
      when d.idx % 11 = 0 then 'Allergie aux arachides.'
      when d.idx % 13 = 0 then 'Réduction fratrie accordée par la direction.'
      else null
    end,
    v_previous_month::timestamptz - interval '10 days',
    c_assistant
  from demo_students d;

  -- -------------------------------------------------------------------
  -- Inscriptions : les deux matières du niveau (une seule si idx % 5 = 0).
  -- Réduction de 50 MAD si idx % 13 = 0. Nouveaux élèves (idx % 7 = 0) : ce mois-ci.
  -- -------------------------------------------------------------------
  create temp table demo_enrollments on commit drop as
  select
    gen_random_uuid() as id,
    d.idx,
    d.id as student_id,
    s.id as subject_id,
    s.monthly_price - case when d.idx % 13 = 0 then 50 else 0 end as price_agreed,
    case when d.idx % 7 = 0 then v_current_month else v_previous_month end as start_date
  from demo_students d
  join public.subjects s on s.level_id = d.level_id
  where d.idx % 5 <> 0 or s.name = 'Mathématiques';

  insert into public.enrollments (id, student_id, subject_id, start_date, price_agreed, active)
  select e.id, e.student_id, e.subject_id, e.start_date, e.price_agreed, true
  from demo_enrollments e;

  -- -------------------------------------------------------------------
  -- Factures : mois précédent et mois en cours.
  -- Échéance le 5, le 15 ou le 25 selon l'élève.
  --  * mois précédent : payé, sauf idx % 10 = 3 (impayé → en retard) ;
  --  * mois en cours  : impayé si idx % 4 = 1 ou idx % 10 = 3, sinon payé ;
  --    impayé → « overdue » si l'échéance est dépassée, sinon « pending ».
  -- -------------------------------------------------------------------
  with periods as (
    select
      e.*,
      m.month_start,
      (m.month_start + interval '1 month - 1 day')::date as month_end,
      m.month_start + (4 + (e.idx % 3) * 10) as due_date,
      case
        when m.month_start = v_previous_month then e.idx % 10 <> 3
        else not (e.idx % 4 = 1 or e.idx % 10 = 3)
      end as is_paid
    from demo_enrollments e
    cross join (values (v_previous_month), (v_current_month)) as m(month_start)
    where m.month_start >= date_trunc('month', e.start_date)::date
  )
  insert into public.invoices (
    enrollment_id, student_id, period_start, period_end, amount_due, amount_paid,
    status, due_date, paid_at, paid_by
  )
  select
    p.id, p.student_id, p.month_start, p.month_end, p.price_agreed,
    case when p.is_paid then p.price_agreed else 0 end,
    case
      when p.is_paid then 'paid'
      when p.due_date < v_today then 'overdue'
      else 'pending'
    end::public.invoice_status,
    p.due_date,
    case
      when p.is_paid then least(
        (p.due_date - (p.idx % 5))::timestamp + time '10:30',
        (v_today - 1)::timestamp + time '10:30'
      ) at time zone 'Africa/Casablanca'
    end,
    case when p.is_paid then c_assistant end
  from periods p;

  -- -------------------------------------------------------------------
  -- Présences : 4 semaines de séances passées (jusqu'à hier inclus).
  -- ~8 % d'absences, plus 3 élèves absents aux 3 dernières séances d'une matière.
  -- -------------------------------------------------------------------
  create temp table demo_sessions on commit drop as
  select distinct ss.subject_id, ss.teacher_id, d::date as session_date
  from public.schedule_slots ss
  cross join generate_series(v_today - 28, v_today - 1, interval '1 day') as d
  where extract(dow from d)::int = ss.day_of_week
    and ss.center_id = c_center;

  insert into public.attendance (student_id, subject_id, teacher_id, session_date, status, marked_at)
  select
    e.student_id, s.subject_id, s.teacher_id, s.session_date,
    case when abs(hashtext(e.idx::text || s.session_date::text || s.subject_id::text)) % 100 < 8
      then 'absent' else 'present' end::public.attendance_status,
    (s.session_date::timestamp + time '17:10') at time zone 'Africa/Casablanca'
  from demo_sessions s
  join demo_enrollments e on e.subject_id = s.subject_id and e.start_date <= s.session_date;

  -- Absences consécutives forcées : élèves 2, 16 et 29, dans leur première matière.
  create temp table demo_absence_streaks on commit drop as
  select distinct on (e.student_id) e.student_id, e.subject_id
  from demo_enrollments e
  where e.idx in (2, 16, 29)
  order by e.student_id, e.subject_id;

  with last_sessions as (
    select a.id, row_number() over (partition by a.student_id, a.subject_id order by a.session_date desc) as rn
    from public.attendance a
    join demo_absence_streaks t on t.student_id = a.student_id and t.subject_id = a.subject_id
  )
  update public.attendance a
  set status = 'absent'
  from last_sessions l
  where a.id = l.id and l.rn <= 3;

  -- -------------------------------------------------------------------
  -- Alertes ouvertes
  -- -------------------------------------------------------------------
  insert into public.alerts (student_id, type, payload, created_at)
  select
    i.student_id,
    'overdue_payment',
    jsonb_build_object('invoice_id', i.id, 'amount_due', i.amount_due, 'due_date', i.due_date),
    (i.due_date + 1)::timestamp at time zone 'Africa/Casablanca'
  from public.invoices i
  where i.status = 'overdue';

  insert into public.alerts (student_id, type, payload, created_at)
  select
    t.student_id,
    'consecutive_absences',
    jsonb_build_object('subject_id', t.subject_id, 'count', 3, 'last_session_date', max(a.session_date)),
    (max(a.session_date)::timestamp + time '19:00') at time zone 'Africa/Casablanca'
  from demo_absence_streaks t
  join public.attendance a on a.student_id = t.student_id and a.subject_id = t.subject_id
  group by t.student_id, t.subject_id;

  -- -------------------------------------------------------------------
  -- Relances déjà effectuées (une partie des impayés)
  -- -------------------------------------------------------------------
  insert into public.follow_ups (student_id, invoice_id, type, channel, note, created_by, created_at)
  select
    i.student_id, i.id, 'payment',
    (array['phone', 'whatsapp', 'in_person'])[1 + d.idx % 3]::public.follow_up_channel,
    (array[
      'Le parent promet de régler cette semaine.',
      'Message envoyé, pas encore de réponse.',
      'Paiement prévu au prochain cours.'
    ])[1 + d.idx % 3],
    c_assistant,
    (least(i.due_date + 3, v_today - 1)::timestamp + time '11:00') at time zone 'Africa/Casablanca'
  from public.invoices i
  join demo_students d on d.id = i.student_id
  where i.status = 'overdue' and (d.idx / 2) % 2 = 0;
end;
$$;
