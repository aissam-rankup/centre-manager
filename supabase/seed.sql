-- =====================================================================
-- CentroManager — seed de démonstration (local uniquement)
--
-- 1 super-admin (console /platform) · 3 centres de types différents ; le centre principal :
-- 1 centre · 3 niveaux · 6 matières · 1 admin · 1 assistant · 3 professeurs
-- 40 élèves · planning hebdomadaire · 4 semaines de présences
-- factures par cycle (1er ou 15 du mois) depuis l'inscription, dont certaines en retard.
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

  v_receipt record;
  v_payroll uuid;

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
  insert into public.centers (id, name, slug, center_type, price, owner_contact_name, owner_contact_phone, owner_contact_email)
  values (c_center, 'Centre Al Wiam — Casablanca', 'al-wiam', 'soutien_scolaire', 490,
          'Nadia Berrada', '06 61 12 34 56', 'direction@alwiam.demo');
  update public.centers
  set address = '12 rue Ibn Battouta, Maârif, Casablanca', phone = '05 22 25 40 18'
  where id = c_center;

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
  -- Remises (avant les inscriptions : les factures sont calculées nettes).
  --  * idx % 13 = 0 : fratrie, 50 MAD de moins sur chaque matière ;
  --  * idx 6        : situation sociale, 25 % sur toutes les matières ;
  --  * idx 20       : mérite, 10 % sur les mathématiques.
  -- -------------------------------------------------------------------
  insert into public.discounts (center_id, student_id, type, value, scope, subject_id, reason, granted_by, granted_at, valid_from)
  select c_center, d.id, 'fixed_amount'::public.discount_type, 50, 'all_subjects'::public.discount_scope, null::uuid, 'sibling'::public.discount_reason, c_admin,
         v_previous_month::timestamptz - interval '12 days', v_previous_month - 12
  from demo_students d where d.idx % 13 = 0
  union all
  select c_center, d.id, 'percentage', 25, 'all_subjects', null::uuid, 'social', c_admin,
         v_previous_month::timestamptz - interval '12 days', v_previous_month - 12
  from demo_students d where d.idx = 6
  union all
  select c_center, d.id, 'percentage', 10, 'specific_subject', s.id, 'merit', c_admin,
         v_previous_month::timestamptz - interval '12 days', v_previous_month - 12
  from demo_students d join public.subjects s on s.level_id = d.level_id and s.name = 'Mathématiques'
  where d.idx = 20;

  -- -------------------------------------------------------------------
  -- Inscriptions : les deux matières du niveau (une seule si idx % 5 = 0).
  -- Prix = tarif de la matière (les remises s'appliquent aux factures).
  -- Date d'inscription (détermine le cycle de facturation) :
  --  * idx % 7 = 0 : nouvel élève, inscrit ces derniers jours ;
  --  * idx % 3 = 0 : le 15 du mois précédent (cycle du 15) ;
  --  * sinon       : le 1er du mois précédent (cycle du 1er).
  -- -------------------------------------------------------------------
  create temp table demo_enrollments on commit drop as
  select
    gen_random_uuid() as id,
    d.idx,
    d.id as student_id,
    s.id as subject_id,
    s.monthly_price as price_agreed,
    case
      when d.idx % 7 = 0 then greatest(v_current_month, v_today - (d.idx % 5))
      when d.idx % 3 = 0 then v_previous_month + 14
      else v_previous_month
    end as start_date
  from demo_students d
  join public.subjects s on s.level_id = d.level_id
  where d.idx % 5 <> 0 or s.name = 'Mathématiques';

  -- Le trigger enrollments_after_insert_first_invoice crée la première facture.
  insert into public.enrollments (id, student_id, subject_id, start_date, active)
  select e.id, e.student_id, e.subject_id, e.start_date, true
  from demo_enrollments e;

  -- -------------------------------------------------------------------
  -- Factures : toutes les périodes depuis l'inscription jusqu'à aujourd'hui.
  -- Échéance : inscription + 5 jours (1re facture), puis début de période + 5.
  --  * périodes passées  : payées, sauf idx % 10 = 3 ;
  --  * période en cours  : impayée si idx % 4 = 1 ou idx % 10 = 3, sinon payée ;
  --    impayé → « overdue » si l'échéance est dépassée, sinon « pending ».
  -- -------------------------------------------------------------------
  with enrollment_cycles as (
    select
      e.*,
      en.billing_day,
      private.billing_period_start(e.start_date, en.billing_day) as first_period,
      private.billing_period_start(v_today, en.billing_day) as current_period
    from demo_enrollments e
    join public.enrollments en on en.id = e.id
  ),
  periods as (
    select
      c.*,
      g::date as period_start,
      (g + interval '1 month' - interval '1 day')::date as period_end,
      case when g::date = c.first_period then c.start_date + 5 else g::date + 5 end as due_date,
      case
        when g::date < c.current_period then c.idx % 10 <> 3
        else not (c.idx % 4 = 1 or c.idx % 10 = 3)
      end as is_paid
    from enrollment_cycles c
    cross join generate_series(c.first_period, c.current_period, interval '1 month') as g
  )
  insert into public.invoices (
    enrollment_id, student_id, period_start, period_end, amount_due, amount_paid,
    status, due_date, paid_at, paid_by
  )
  select
    p.id, p.student_id, p.period_start, p.period_end, p.price_agreed,
    case when p.is_paid then p.price_agreed else 0 end,
    case
      when p.is_paid then 'paid'
      when p.due_date < v_today then 'overdue'
      else 'pending'
    end::public.invoice_status,
    p.due_date,
    case
      when p.is_paid then greatest(
        p.start_date::timestamp + time '10:30',
        least(
          (p.due_date - (p.idx % 5))::timestamp + time '10:30',
          (v_today - 1)::timestamp + time '10:30'
        )
      ) at time zone 'Africa/Casablanca'
    end,
    case when p.is_paid then c_assistant end
  from periods p
  on conflict (enrollment_id, period_start) do update
  set amount_paid = excluded.amount_paid,
      status = excluded.status,
      due_date = excluded.due_date,
      paid_at = excluded.paid_at,
      paid_by = excluded.paid_by;

  -- Montant réglé = net après remise ; mode de paiement varié.
  update public.invoices i
  set amount_paid = i.amount_due,
      payment_method = (array['cash', 'cash', 'cash', 'bank_transfer', 'card'])[1 + d.idx % 5]::public.payment_method
  from demo_students d
  where d.id = i.student_id and i.status = 'paid';

  -- Reçus : un par élève et par jour d'encaissement, dans l'ordre chronologique.
  for v_receipt in
    select array_agg(i.id order by i.period_start) as ids, min(i.paid_at) as paid_at
    from public.invoices i
    join demo_students d on d.id = i.student_id
    where i.status = 'paid'
    group by i.student_id, (i.paid_at at time zone 'Africa/Casablanca')::date
    order by min(i.paid_at)
  loop
    perform private.issue_receipt(v_receipt.ids, v_receipt.paid_at, c_assistant);
  end loop;

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

  -- Les alertes d'absences consécutives sont ouvertes par le trigger
  -- attendance_after_write_absence_alerts (séries forcées ci-dessus comprises).

  -- -------------------------------------------------------------------
  -- Salles (créées depuis le planning) : capacité, étage, équipements.
  -- -------------------------------------------------------------------
  update public.rooms r
  set capacity = x.capacity, floor = x.floor, equipment = x.equipment::jsonb
  from (values
    ('Salle 1', 16, 'Rez-de-chaussée', '["whiteboard", "projector"]'),
    ('Salle 2', 12, '1er étage', '["whiteboard"]'),
    ('Salle 3', 10, '1er étage', '["whiteboard", "computers"]')
  ) as x(name, capacity, floor, equipment)
  where r.center_id = c_center and r.name = x.name;
  insert into public.rooms (center_id, name, capacity, floor, equipment, notes)
  values (c_center, 'Salle 4', 20, '2e étage', '["whiteboard", "projector", "air_conditioning"]', 'Grande salle, idéale pour les stages.');

  -- -------------------------------------------------------------------
  -- Responsables déjà prévenus de certaines absences (WhatsApp, appel).
  -- -------------------------------------------------------------------
  insert into public.absence_notifications (center_id, student_id, attendance_id, channel, message_body, sent_at, sent_by,
                                            guardian_phone_used, status)
  select c_center, a.student_id, a.id,
         case when row_number() over (order by a.session_date desc, a.id) % 3 = 0 then 'phone_call' else 'whatsapp' end::public.notification_channel,
         null,
         (a.session_date::timestamp + time '19:00') at time zone 'Africa/Casablanca',
         c_assistant,
         st.guardian_phone,
         'sent'
  from public.attendance a
  join public.students st on st.id = a.student_id
  where a.status = 'absent' and a.session_date < v_today - 2
  order by a.session_date desc
  limit 8;

  -- Conflit de salle rencontré puis résolu par une autre salle.
  insert into public.schedule_conflicts_log (center_id, attempted_slot, conflict_type, conflicting_slot_id, resolved_how, created_by, created_at)
  select c_center,
         jsonb_build_object('subject_id', ss.subject_id, 'level_id', ss.level_id, 'teacher_id', c_prof3,
                            'room_id', ss.room_id, 'day_of_week', ss.day_of_week, 'start_time', '17:30', 'end_time', '19:00'),
         'room', ss.id, 'other_room', c_admin, v_previous_month::timestamptz + interval '3 days'
  from public.schedule_slots ss
  where ss.center_id = c_center and ss.room = 'Salle 1' and ss.day_of_week = 1
  limit 1;

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

  -- -------------------------------------------------------------------
  -- Packs « Toutes matières » (moins cher que les matières à l'unité)
  -- et deux nouveaux élèves abonnés. Les inscriptions aux matières du pack
  -- et la première facture sont créées par trigger.
  -- -------------------------------------------------------------------
  with created as (
    insert into public.packs (center_id, level_id, name, monthly_price)
    values
      (c_center, v_tc, 'Toutes matières', 500),
      (c_center, v_1bac, 'Toutes matières', 650),
      (c_center, v_2bac, 'Toutes matières', 850)
    returning id, level_id
  )
  insert into public.pack_subjects (pack_id, subject_id)
  select c.id, s.id
  from created c
  join public.subjects s on s.level_id = c.level_id;

  with new_students as (
    insert into public.students (center_id, full_name, level_id, guardian_name, guardian_phone, created_at, created_by)
    values
      (c_center, 'Lina Bennani', v_tc, 'Mme Bennani', '06 71 24 58 93', v_today - 2, c_assistant),
      (c_center, 'Othmane Tazi', v_2bac, 'M. Tazi', '06 72 35 69 14', v_today - 2, c_assistant)
    returning id, level_id
  )
  insert into public.pack_enrollments (student_id, pack_id, start_date, price_agreed)
  select n.id, p.id, v_today - 2, p.monthly_price
  from new_students n
  join public.packs p on p.level_id = n.level_id;

  -- -------------------------------------------------------------------
  -- Paie : Rachid et Laila à la commission (taux par matière), Youssef au
  -- salaire fixe (augmenté ce mois-ci). Mois précédent validé et versé.
  -- -------------------------------------------------------------------
  update public.profiles set pay_mode = 'commission' where id in (c_prof1, c_prof2);
  update public.profiles set pay_mode = 'fixed_salary' where id = c_prof3;

  insert into public.teacher_commissions (center_id, teacher_id, subject_id, level_id, rate_percent, effective_from, created_by)
  values
    (c_center, c_prof1, v_maths_tc, v_tc, 30, v_previous_month - interval '6 months', c_admin),
    (c_center, c_prof1, v_maths_1bac, v_1bac, 30, v_previous_month - interval '6 months', c_admin),
    (c_center, c_prof1, v_maths_2bac, v_2bac, 35, v_previous_month - interval '6 months', c_admin),
    (c_center, c_prof2, v_pc_2bac, v_2bac, 30, v_previous_month - interval '6 months', c_admin);

  insert into public.teacher_salaries (center_id, teacher_id, monthly_amount, effective_from, effective_to, created_by)
  values
    (c_center, c_prof3, 3200, v_previous_month - interval '12 months', v_current_month - 1, c_admin),
    (c_center, c_prof3, 3500, v_current_month, null, c_admin);

  insert into public.payroll_periods (center_id, year, month)
  values (c_center, extract(year from v_previous_month), extract(month from v_previous_month))
  returning id into v_payroll;

  insert into public.payroll_lines (payroll_period_id, center_id, teacher_id, teacher_name, pay_mode, computed_amount, detail)
  select v_payroll, c_center, p.id, p.full_name, c.pay_mode, c.amount, c.detail
  from public.profiles p
  cross join lateral private.compute_teacher_pay(p.id, extract(year from v_previous_month)::int,
                                                 extract(month from v_previous_month)::int) as c
  where p.center_id = c_center and p.role = 'teacher';

  update public.payroll_lines
  set adjustment_amount = 300, adjustment_reason = 'Prime : stage intensif de révision'
  where payroll_period_id = v_payroll and teacher_id = c_prof2;

  update public.payroll_periods
  set status = 'validated', validated_by = c_admin, validated_at = v_current_month::timestamptz - interval '1 day'
  where id = v_payroll;

  update public.payroll_lines
  set paid_at = v_current_month, payment_method = 'bank_transfer', paid_by = c_admin
  where payroll_period_id = v_payroll;

  -- -------------------------------------------------------------------
  -- Charges : mois précédent complet ; loyer et internet récurrents
  -- (brouillons du mois en cours générés comme chaque mois).
  -- -------------------------------------------------------------------
  insert into public.expenses (center_id, category_id, label, amount, expense_date, payment_method,
                               is_recurring, recurrence_day, notes, recorded_by)
  select c_center, ec.id, x.label, x.amount, v_previous_month + x.day_offset, x.method::public.payment_method,
         x.recurring, x.recurrence_day, x.notes, c_admin
  from (values
    ('Loyer', 'Loyer du local', 6000, 0, 'bank_transfer', true, 1::smallint, null),
    ('Internet', 'Fibre 100 Mb', 399, 4, 'bank_transfer', true, 5::smallint, null),
    ('Électricité', 'Facture d''électricité', 850, 9, 'cash', false, null, null),
    ('Eau', 'Facture d''eau', 180, 9, 'cash', false, null, null),
    ('Ménage', 'Entretien des salles', 1200, 27, 'cash', false, null, null),
    ('Fournitures', 'Marqueurs, ramettes de papier', 340, 3, 'card', false, null, null),
    ('Marketing', 'Flyers de rentrée', 500, 2, 'cash', false, null, 'Distribution devant les lycées du quartier.')
  ) as x(category, label, amount, day_offset, method, recurring, recurrence_day, notes)
  join public.expense_categories ec on ec.center_id = c_center and ec.name = x.category;

  insert into public.expenses (center_id, category_id, label, amount, expense_date, payment_method, recorded_by)
  select c_center, ec.id, 'Cartouches d''encre', 120, v_today, 'cash', c_admin
  from public.expense_categories ec
  where ec.center_id = c_center and ec.name = 'Fournitures';

  perform private.generate_recurring_expenses(v_today);

  -- -------------------------------------------------------------------
  -- Abonnement du centre principal : deux mois payés, échéance dans ~20 jours.
  -- -------------------------------------------------------------------
  insert into public.subscription_payments (center_id, amount, paid_at, period_covered_start, period_covered_end, method, reference)
  values
    (c_center, 490, v_today - 40, v_today - 40, (v_today - 40 + interval '1 month')::date, 'bank_transfer', 'VIR-2026-001'),
    (c_center, 490, v_today - 12, (v_today - 40 + interval '1 month')::date, (v_today - 40 + interval '2 months')::date, 'cash', null);
end;
$$;

-- =====================================================================
-- Deux autres centres de démonstration (types différents)
-- =====================================================================
do $$
declare
  c_formation constant uuid := '10000000-0000-4000-8000-000000000002';
  c_atlas     constant uuid := '10000000-0000-4000-8000-000000000003';
  v_today date := private.today();
  v_level uuid;
begin
  -- Propriétaire de la plateforme (console /platform), sans centre.
  perform pg_temp.create_demo_user('20000000-0000-4000-8000-000000000099', null,
    'superadmin@centro.demo', 'Aissam Errachdi', 'super_admin', null);

  -- Centre de formation, en période d'essai, facturé à l'année.
  insert into public.centers (id, name, slug, center_type, price, billing_interval, current_period_end,
                              owner_contact_name, owner_contact_phone, owner_contact_email)
  values (c_formation, 'Institut Formation Pro — Rabat', 'formation-pro', 'centre_formation', 3900, 'year', v_today + 10,
          'Hicham Alaoui', '06 70 11 22 33', 'contact@formationpro.demo');
  perform pg_temp.create_demo_user('20000000-0000-4000-8000-000000000021', c_formation,
    'admin-formation@centro.demo', 'Hicham Alaoui', 'admin', '06 70 11 22 33');
  insert into public.levels (center_id, name, sort_order) values (c_formation, 'Promotion Développement web 2026', 1) returning id into v_level;
  insert into public.subjects (center_id, level_id, name, monthly_price) values
    (c_formation, v_level, 'Module HTML / CSS', 600),
    (c_formation, v_level, 'Module JavaScript', 700);

  -- Auto-école en marque blanche, échéance dépassée de 3 jours.
  insert into public.centers (id, name, slug, center_type, price, plan_key,
                              owner_contact_name, owner_contact_phone, owner_contact_email)
  values (c_atlas, 'Auto-école Atlas — Marrakech', 'atlas', 'auto_ecole', 690, 'premium',
          'Samira Ouazzani', '06 75 44 55 66', 'direction@atlas.demo');
  insert into public.center_branding (center_id, brand_name, primary_color, secondary_color, accent_color,
                                      email_sender_name, support_email, support_phone)
  values (c_atlas, 'Atlas Conduite', '#0f766e', '#134e4a', '#f59e0b',
          'Atlas Conduite', 'contact@atlas.demo', '05 24 33 44 55');
  insert into public.subscription_payments (center_id, amount, paid_at, period_covered_start, period_covered_end, method, reference)
  values (c_atlas, 690, v_today - 33, (v_today - 3 - interval '1 month')::date, v_today - 3, 'card', 'CB-88412');
  update public.centers set status = 'past_due' where id = c_atlas;
  perform pg_temp.create_demo_user('20000000-0000-4000-8000-000000000031', c_atlas,
    'admin-atlas@centro.demo', 'Samira Ouazzani', 'admin', '06 75 44 55 66');
  insert into public.levels (center_id, name, sort_order) values (c_atlas, 'Permis B', 1) returning id into v_level;
  insert into public.subjects (center_id, level_id, name, monthly_price) values
    (c_atlas, v_level, 'Code de la route', 300),
    (c_atlas, v_level, 'Conduite', 900);
end;
$$;

-- Contact affiché sur l'écran de suspension (réglages de la plateforme).
update public.platform_settings
set support_name = 'Service client CentroManager', support_phone = '05 22 00 00 00', support_email = 'support@centro.demo'
where id = 1;
