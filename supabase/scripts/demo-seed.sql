-- =====================================================================
-- PRODUCTION : ne jamais coller ce fichier tel quel (UTF-8 relu en Windows-1252 →
-- « MathÃ©matiques »). Générer d'abord sa version ASCII :
--   python supabase/scripts/sql_to_ascii.py supabase/scripts/demo-seed.sql C:/tmp/demo-seed-ascii.sql
--
-- CentroManager — jeu de démonstration (production) : 2 centres, 6 comptes
--
--  * Centre Excellence (soutien scolaire) et Institut Pro Compétences
--    (centre de formation), abonnements actifs, cloisonnés.
--  * Mot de passe des comptes : remplacez __MOT_DE_PASSE_DEMO__ avant de
--    l'exécuter (jamais de mot de passe dans le dépôt) ; posé ici, sans
--    changer la politique de mot de passe du projet.
--  * Toutes les lignes créées portent is_demo = true (migration 049),
--    y compris celles des déclencheurs ; les comptes Auth portent
--    app_metadata.is_demo = true.
-- À exécuter une seule fois, en entier, dans l'éditeur SQL (postgres).
-- =====================================================================
begin;

select set_config('centromanager.demo_seed', 'true', true);

create function pg_temp.demo_user(p_id uuid, p_center uuid, p_email text, p_name text, p_role public.user_role,
                                  p_phone text, p_login boolean)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    -- Profil sans connexion (second professeur) : mot de passe aléatoire, jamais communiqué.
    extensions.crypt(case when p_login then '__MOT_DE_PASSE_DEMO__' else gen_random_uuid()::text end, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"is_demo":true}'::jsonb,
    jsonb_build_object('full_name', p_name),
    now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text,
          jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  insert into public.profiles (id, center_id, full_name, role, phone) values (p_id, p_center, p_name, p_role, p_phone);
end;
$$;

-- Un centre complet. p_kind : 'soutien' ou 'formation'.
create function pg_temp.demo_center(p_kind text)
returns void
language plpgsql
as $$
declare
  v_today date := private.today();
  v_month date := date_trunc('month', private.today())::date;
  v_prev date := (date_trunc('month', private.today()) - interval '1 month')::date;
  v_soutien boolean := p_kind = 'soutien';
  c uuid := case when v_soutien then 'de000000-0000-4000-8000-0000000000a1'::uuid else 'de000000-0000-4000-8000-0000000000b1'::uuid end;
  u_admin uuid := case when v_soutien then 'de0000a0-0000-4000-8000-000000000001'::uuid else 'de0000b0-0000-4000-8000-000000000001'::uuid end;
  u_assistant uuid := case when v_soutien then 'de0000a0-0000-4000-8000-000000000002'::uuid else 'de0000b0-0000-4000-8000-000000000002'::uuid end;
  u_prof uuid := case when v_soutien then 'de0000a0-0000-4000-8000-000000000003'::uuid else 'de0000b0-0000-4000-8000-000000000003'::uuid end;
  u_prof2 uuid := case when v_soutien then 'de0000a0-0000-4000-8000-000000000004'::uuid else 'de0000b0-0000-4000-8000-000000000004'::uuid end;
  l1 uuid; l2 uuid;
  s11 uuid; s12 uuid; s13 uuid; s21 uuid; s22 uuid; s23 uuid;
  r1 text := case when v_soutien then 'Salle 1' else 'Salle Informatique' end;
  r2 text := case when v_soutien then 'Salle 2' else 'Salle de cours' end;
  v_run uuid;
  v_receipt record;
  v_payroll uuid;
  v_first text[] := case when v_soutien
    then array['Yassine','Salma','Omar','Imane','Mehdi','Khadija','Anas','Fatima Zahra','Hamza','Aya','Adam','Hiba','Ilyas','Meryem','Reda','Nour','Zakaria','Sara','Ayoub','Rim']
    else array['Karim','Soukaina','Hicham','Loubna','Amine','Ghita','Badr','Hajar','Nabil','Yousra','Tarik','Zineb','Said','Kenza','Walid','Asmae','Driss','Houda','Mourad','Ilham'] end;
  v_last text[] := array['El Amrani','Bennani','Tazi','Alaoui','Idrissi','Berrada','Chraibi','El Fassi','Benjelloun','Lahlou',
                         'Ouazzani','Kettani','Sqalli','Belkadi','Naciri','Filali','Ziani','Rami','Haddad','Mansouri'];
begin
  -- Centre, abonnement actif, identité.
  if v_soutien then
    insert into public.centers (id, name, slug, center_type, billing_interval, owner_contact_name, owner_contact_phone,
                                owner_contact_email, current_period_end)
    values (c, 'Centre Excellence', 'centre-excellence', 'soutien_scolaire', 'year',
            'Nadia Berrada', '06 00 10 20 30', 'direction@centre-excellence.test', v_today + 365);
    update public.centers set address = '24 boulevard Zerktouni, Casablanca', phone = '05 22 00 11 22' where id = c;
  else
    insert into public.centers (id, name, slug, center_type, billing_interval, owner_contact_name, owner_contact_phone,
                                owner_contact_email, current_period_end)
    values (c, 'Institut Pro Compétences', 'pro-competences', 'centre_formation', 'year',
            'Hicham Alaoui', '06 00 40 50 60', 'contact@pro-competences.test', v_today + 365);
    update public.centers set address = '8 avenue Mohammed V, Rabat', phone = '05 37 00 33 44' where id = c;
  end if;
  update public.centers set status = 'active', activated_at = now() - interval '45 days',
         auto_reenrollment_enabled = true, payment_due_day = 5
  where id = c;
  -- Abonnement actif un an (sans prix ni paiement : rien ne s'ajoute aux revenus de la plateforme).
  update public.subscriptions set started_at = v_today - 45, current_period_start = v_today - 45 where center_id = c;

  -- Comptes (0000) et second professeur, au salaire fixe, sans connexion.
  if v_soutien then
    perform pg_temp.demo_user(u_admin, c, 'admin-soutien@test.com', 'Nadia Berrada', 'admin', '06 00 10 20 30', true);
    perform pg_temp.demo_user(u_assistant, c, 'assistant-soutien@test.com', 'Karim Lahlou', 'assistant', '06 00 10 20 31', true);
    perform pg_temp.demo_user(u_prof, c, 'prof-soutien@test.com', 'Rachid Benali', 'teacher', '06 00 10 20 32', true);
    perform pg_temp.demo_user(u_prof2, c, 'prof2-soutien@demo.invalid', 'Laila Chakir', 'teacher', '06 00 10 20 33', false);
  else
    perform pg_temp.demo_user(u_admin, c, 'admin-formation@test.com', 'Hicham Alaoui', 'admin', '06 00 40 50 60', true);
    perform pg_temp.demo_user(u_assistant, c, 'assistant-formation@test.com', 'Samira Ouazzani', 'assistant', '06 00 40 50 61', true);
    perform pg_temp.demo_user(u_prof, c, 'formateur-formation@test.com', 'Youssef Amrani', 'teacher', '06 00 40 50 62', true);
    perform pg_temp.demo_user(u_prof2, c, 'formateur2-formation@demo.invalid', 'Sanaa El Idrissi', 'teacher', '06 00 40 50 63', false);
  end if;

  -- Niveaux / promotions et matières / modules (tarifs mensuels en MAD).
  insert into public.levels (center_id, name, sort_order)
  values (c, case when v_soutien then 'Tronc Commun' else 'Développement Web 2026' end, 1) returning id into l1;
  insert into public.levels (center_id, name, sort_order)
  values (c, case when v_soutien then '2ème année BAC Sciences' else 'Comptabilité Session Automne' end, 2) returning id into l2;
  if v_soutien then
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l1, 'Mathématiques', 300) returning id into s11;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l1, 'Physique-Chimie', 280) returning id into s12;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l1, 'Français', 250) returning id into s13;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l2, 'Mathématiques', 450) returning id into s21;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l2, 'Physique-Chimie', 400) returning id into s22;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l2, 'Anglais', 250) returning id into s23;
  else
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l1, 'HTML / CSS', 600) returning id into s11;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l1, 'JavaScript', 750) returning id into s12;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l1, 'React', 850) returning id into s13;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l2, 'Comptabilité générale', 650) returning id into s21;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l2, 'Fiscalité', 600) returning id into s22;
    insert into public.subjects (center_id, level_id, name, monthly_price) values (c, l2, 'Excel avancé', 450) returning id into s23;
  end if;

  -- Affectations : le compte professeur sur 3 matières (commission), le second au salaire fixe.
  if v_soutien then
    insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
      (u_prof, s11, l1), (u_prof, s21, l2), (u_prof, s22, l2),
      (u_prof2, s12, l1), (u_prof2, s13, l1), (u_prof2, s23, l2);
  else
    insert into public.teacher_assignments (teacher_id, subject_id, level_id) values
      (u_prof, s11, l1), (u_prof, s12, l1), (u_prof, s13, l1),
      (u_prof2, s21, l2), (u_prof2, s22, l2), (u_prof2, s23, l2);
  end if;
  update public.profiles set pay_mode = 'commission' where id = u_prof;
  update public.profiles set pay_mode = 'fixed_salary' where id = u_prof2;
  insert into public.teacher_commissions (center_id, teacher_id, subject_id, level_id, rate_percent, effective_from, created_by)
  select c, ta.teacher_id, ta.subject_id, ta.level_id, case when ta.subject_id = s11 then 30 else 35 end, v_prev - 60, u_admin
  from public.teacher_assignments ta where ta.teacher_id = u_prof;
  insert into public.teacher_salaries (center_id, teacher_id, monthly_amount, effective_from, created_by)
  values (c, u_prof2, case when v_soutien then 3500 else 6000 end, v_prev - 60, u_admin);

  -- Emploi du temps (0 = dimanche … 6 = samedi) : le compte professeur a un cours chaque jour du lundi au samedi.
  if v_soutien then
    insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room) values
      (c, s11, l1, u_prof, 1, '17:00', '18:30', r1), (c, s11, l1, u_prof, 4, '17:00', '18:30', r1),
      (c, s21, l2, u_prof, 2, '17:00', '18:30', r1), (c, s21, l2, u_prof, 5, '18:45', '20:15', r1),
      (c, s22, l2, u_prof, 3, '17:00', '18:30', r2), (c, s22, l2, u_prof, 6, '10:00', '12:00', r1),
      (c, s12, l1, u_prof2, 1, '18:45', '20:15', r2), (c, s13, l1, u_prof2, 3, '18:45', '20:15', r2),
      (c, s13, l1, u_prof2, 6, '14:00', '15:30', r2), (c, s23, l2, u_prof2, 2, '18:45', '20:15', r2),
      (c, s23, l2, u_prof2, 4, '18:45', '20:15', r2);
  else
    insert into public.schedule_slots (center_id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room) values
      (c, s11, l1, u_prof, 1, '09:00', '12:00', r1), (c, s12, l1, u_prof, 2, '09:00', '12:00', r1),
      (c, s13, l1, u_prof, 3, '09:00', '12:00', r1), (c, s11, l1, u_prof, 4, '09:00', '12:00', r1),
      (c, s12, l1, u_prof, 5, '09:00', '12:00', r1), (c, s13, l1, u_prof, 6, '09:00', '12:00', r1),
      (c, s21, l2, u_prof2, 1, '14:00', '17:00', r2), (c, s22, l2, u_prof2, 2, '14:00', '17:00', r2),
      (c, s23, l2, u_prof2, 3, '14:00', '17:00', r1), (c, s21, l2, u_prof2, 4, '14:00', '17:00', r2);
  end if;
  update public.rooms set capacity = 16, floor = 'Rez-de-chaussée', equipment = '["whiteboard", "projector"]'
  where center_id = c and name = r1;
  update public.rooms set capacity = 12, floor = '1er étage', equipment = '["whiteboard"]'
  where center_id = c and name = r2;
  insert into public.rooms (center_id, name, capacity, floor, equipment, notes)
  values (c, case when v_soutien then 'Salle 3' else 'Salle de réunion' end, 20, '2e étage', '["whiteboard", "air_conditioning"]',
          'Libre : utile pour résoudre un conflit de salle.');
  -- Conflit déjà rencontré (journal), et situation pour en tester un nouveau (voir récapitulatif).
  insert into public.schedule_conflicts_log (center_id, attempted_slot, conflict_type, conflicting_slot_id, resolved_how, created_by)
  select c, jsonb_build_object('subject_id', ss.subject_id, 'level_id', ss.level_id, 'teacher_id', u_prof2,
                               'room_id', ss.room_id, 'day_of_week', ss.day_of_week, 'start_time', '17:30', 'end_time', '19:00'),
         'room', ss.id, 'other_room', u_admin
  from public.schedule_slots ss where ss.center_id = c and ss.teacher_id = u_prof and ss.day_of_week = 1 limit 1;

  -- 20 élèves / stagiaires : 1–10 au premier niveau, 11–20 au second.
  create temp table demo_students on commit drop as
  select i as idx, gen_random_uuid() as id, v_first[i] || ' ' || v_last[1 + (i * 7) % 20] as full_name,
         v_last[1 + (i * 7) % 20] as family, case when i <= 10 then l1 else l2 end as level_id
  from generate_series(1, 20) as i;
  perform set_config('request.jwt.claims', json_build_object('sub', u_assistant, 'role', 'authenticated')::text, true);
  insert into public.students (id, center_id, full_name, level_id, guardian_name, guardian_phone, notes, created_by)
  select d.id, c, d.full_name, d.level_id,
         case when d.idx % 2 = 0 then 'Mme ' else 'M. ' end || d.family,
         '06 00 ' || lpad((10 + d.idx)::text, 2, '0') || ' ' || lpad((d.idx * 7 % 100)::text, 2, '0') || ' ' || lpad((d.idx * 13 % 100)::text, 2, '0'),
         case when d.idx = 8 then 'Allergie aux arachides.' when d.idx = 15 then 'Réduction accordée par la direction.' end,
         u_assistant
  from demo_students d;
  perform set_config('request.jwt.claims', '', true);

  -- Remises : pourcentage (élèves 3 et 12), montant fixe (élèves 5 et 15).
  insert into public.discounts (center_id, student_id, type, value, scope, reason, granted_by, valid_from)
  select c, d.id, x.t::public.discount_type, x.v, 'all_subjects', x.r::public.discount_reason, u_admin, v_prev - 5
  from demo_students d
  join (values (3, 'percentage', 10, 'merit'), (12, 'percentage', 25, 'social'),
               (5, 'fixed_amount', 50, 'sibling'), (15, 'fixed_amount', 100, 'sibling')) as x(idx, t, v, r) on x.idx = d.idx;

  -- Inscriptions : 2 ou 3 matières du niveau, depuis le 1er du mois précédent (cycle du 15 pour 7 et 14).
  insert into public.enrollments (student_id, subject_id, start_date, billing_day)
  select d.id, s.id, case when d.idx in (7, 14) then v_prev + 14 else v_prev end,
         case when d.idx in (7, 14) then 15 else 1 end
  from demo_students d
  join public.subjects s on s.level_id = d.level_id
  where d.idx % 4 <> 0 or s.id in (s11, s21, s12, s22);

  -- Mois précédent : réglé (reçus datés), sauf les élèves 4, 9 et 17 (impayés).
  update public.invoices i
  set status = 'paid', amount_paid = i.amount_due,
      paid_at = ((i.period_start + (d.idx % 6) + 1)::timestamp + time '10:30') at time zone 'Africa/Casablanca',
      paid_by = u_assistant,
      payment_method = (array['cash', 'cash', 'bank_transfer', 'card', 'cheque'])[1 + d.idx % 5]::public.payment_method
  from demo_students d
  where d.id = i.student_id and d.idx not in (4, 9, 17) and i.period_start < v_month;
  for v_receipt in
    select array_agg(i.id order by i.period_start) as ids, min(i.paid_at) as paid_at
    from public.invoices i join demo_students d on d.id = i.student_id
    where i.status = 'paid' group by i.student_id order by min(i.paid_at)
  loop
    perform private.issue_receipt(v_receipt.ids, v_receipt.paid_at, u_assistant);
  end loop;
  update public.invoices i set status = 'overdue'
  from demo_students d where d.id = i.student_id and d.idx in (4, 9, 17) and i.due_date < v_today and i.status <> 'paid';

  -- Campagne du mois (réinscription) confirmée par l'admin : factures du mois, échéance le 5.
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  perform private.generate_billing_run(c, extract(year from v_month)::smallint, extract(month from v_month)::smallint);
  select br.id into v_run from public.billing_runs br where br.center_id = c and br.period_month = extract(month from v_month);
  perform public.confirm_billing_run(v_run);
  -- Campagne du mois prochain en brouillon (revue, intentions), un arrêt et une pause.
  perform private.generate_billing_run(c, extract(year from v_month + interval '1 month')::smallint,
                                       extract(month from v_month + interval '1 month')::smallint);

  -- Encaissements du jour à l'accueil : caisse ouverte (fonds 200 MAD).
  perform set_config('request.jwt.claims', json_build_object('sub', u_assistant, 'role', 'authenticated')::text, true);
  perform public.open_cash_session(200);
  perform public.record_payment(d.id, array(select i.id from public.invoices i where i.student_id = d.id and i.billing_run_id = v_run),
                                (array['cash', 'cash', 'card', 'cash'])[1 + d.idx % 4]::public.payment_method)
  from demo_students d where d.idx in (1, 2, 6, 11, 13);
  -- Un rappel déjà envoyé (WhatsApp) à un tuteur.
  perform public.record_payment_reminder(v_run, d.id, (select min(i.due_date) from public.invoices i where i.student_id = d.id and i.billing_run_id = v_run and i.status <> 'paid'),
                                         'whatsapp', 'Bonjour, petit rappel de paiement.', null, 'default')
  from demo_students d where d.idx = 10;
  perform set_config('request.jwt.claims', '', true);

  -- Présences : séances passées depuis le début du mois précédent, ~8 % d'absences ;
  -- élève 2 absent aux 3 dernières séances de sa première matière (alerte).
  create temp table demo_sessions on commit drop as
  select distinct ss.subject_id, ss.teacher_id, d::date as session_date
  from public.schedule_slots ss
  cross join generate_series(v_prev, v_today - 1, interval '1 day') as d
  where extract(dow from d)::int = ss.day_of_week and ss.center_id = c;
  insert into public.attendance (student_id, subject_id, teacher_id, session_date, status, marked_at)
  select e.student_id, s.subject_id, s.teacher_id, s.session_date,
         case when abs(hashtext(e.student_id::text || s.session_date::text || s.subject_id::text)) % 100 < 8
              then 'absent' else 'present' end::public.attendance_status,
         (s.session_date::timestamp + time '17:10') at time zone 'Africa/Casablanca'
  from demo_sessions s
  join public.enrollments e on e.subject_id = s.subject_id and e.start_date <= s.session_date
  join demo_students d on d.id = e.student_id;
  with streak as (
    select a.id, row_number() over (order by a.session_date desc) as rn
    from public.attendance a join demo_students d on d.id = a.student_id
    where d.idx = 2 and a.subject_id = (select min(e.subject_id::text)::uuid from public.enrollments e where e.student_id = d.id)
  )
  update public.attendance a set status = 'absent' from streak s where a.id = s.id and s.rn <= 3;
  insert into public.absence_notifications (center_id, student_id, attendance_id, channel, sent_at, sent_by, guardian_phone_used, status)
  select c, a.student_id, a.id, 'whatsapp', (a.session_date::timestamp + time '19:00') at time zone 'Africa/Casablanca',
         u_assistant, st.guardian_phone, 'sent'
  from public.attendance a join public.students st on st.id = a.student_id
  where st.center_id = c and a.status = 'absent' and a.session_date < v_today - 3
  order by a.session_date desc limit 4;

  -- Impayés du centre : en retard et alerte, comme le ferait le traitement de la nuit (ce centre seulement).
  update public.invoices i set status = 'overdue'
  from public.students st
  where st.id = i.student_id and st.center_id = c and i.status = 'pending' and i.overdue_from <= v_today;
  insert into public.alerts (student_id, type, payload)
  select i.student_id, 'overdue_payment', jsonb_build_object('invoice_id', i.id, 'amount_due', i.amount_due, 'due_date', i.due_date)
  from public.invoices i join public.students st on st.id = i.student_id
  where st.center_id = c and i.status = 'overdue'
    and not exists (select 1 from public.alerts a where a.type = 'overdue_payment' and a.payload ->> 'invoice_id' = i.id::text);

  -- Relance d'un impayé.
  insert into public.follow_ups (student_id, invoice_id, type, channel, note, created_by)
  select i.student_id, i.id, 'payment', 'phone', 'Le parent promet de régler cette semaine.', u_assistant
  from public.invoices i join demo_students d on d.id = i.student_id
  where d.idx = 4 and i.status = 'overdue' limit 1;

  -- Paie du mois précédent (brouillon) : commission et salaire fixe.
  insert into public.payroll_periods (center_id, year, month)
  values (c, extract(year from v_prev), extract(month from v_prev)) returning id into v_payroll;
  insert into public.payroll_lines (payroll_period_id, center_id, teacher_id, teacher_name, pay_mode, computed_amount, detail)
  select v_payroll, c, p.id, p.full_name, x.pay_mode, x.amount, x.detail
  from public.profiles p
  cross join lateral private.compute_teacher_pay(p.id, extract(year from v_prev)::int, extract(month from v_prev)::int) as x
  where p.center_id = c and p.role = 'teacher';

  -- Charges du mois précédent.
  insert into public.expenses (center_id, category_id, label, amount, expense_date, payment_method, is_recurring, recurrence_day, recorded_by)
  select c, ec.id, x.label, x.amount, v_prev + x.day_offset, x.method::public.payment_method, x.recurring, x.rday, u_admin
  from (values ('Loyer', 'Loyer du local', 6000, 0, 'bank_transfer', true, 1::smallint),
               ('Internet', 'Fibre 100 Mb', 399, 4, 'bank_transfer', true, 5::smallint),
               ('Électricité', 'Facture d''électricité', 850, 9, 'cash', false, null::smallint),
               ('Fournitures', 'Marqueurs et papier', 340, 3, 'card', false, null::smallint))
       as x(category, label, amount, day_offset, method, recurring, rday)
  join public.expense_categories ec on ec.center_id = c and ec.name = x.category;

  drop table demo_students;
  drop table demo_sessions;
end;
$$;

select pg_temp.demo_center('soutien');
select pg_temp.demo_center('formation');

-- Vérification : deux centres, six comptes avec connexion, données par centre.
select 'demo-seed-ok' as marker,
  (select count(*) from public.centers where is_demo) as centres,
  (select count(*) from auth.users where raw_app_meta_data ->> 'is_demo' = 'true' and email like '%@test.com') as comptes,
  (select count(*) from public.students where is_demo) as eleves,
  (select count(*) from public.invoices where is_demo) as factures,
  (select count(*) from public.receipts where is_demo) as recus,
  (select count(*) from public.cash_sessions where is_demo and status = 'open') as caisses_ouvertes,
  (select count(*) from public.alerts where is_demo and type = 'consecutive_absences') as alertes_absences,
  (select count(*) from public.billing_runs where is_demo) as campagnes;

commit;
