-- =====================================================================
-- Heure du Maroc : UTC+0 permanent depuis le 20 septembre 2026
--
-- Le Maroc a quitté UTC+1 le 20/09/2026 à 02:00 locales (01:00 UTC) pour
-- l'heure GMT toute l'année (IANA tzdata 2026c). Les bases de fuseaux
-- antérieures à 2026c (PostgreSQL, Node) appliquent encore UTC+1 : l'heure
-- affichée avait une heure d'avance et « aujourd'hui » changeait à 23 h.
--
-- Deux fonctions portent la règle, quelle que soit la version des fuseaux :
--  * private.local_time(instant) : heure locale (GMT depuis la bascule,
--    règles d'Africa/Casablanca avant, pour l'historique) ;
--  * private.local_to_utc(heure locale) : l'inverse.
-- Les fonctions et la vue qui utilisaient 'Africa/Casablanca' passent par
-- elles ; leur logique ne change pas.
-- =====================================================================

create function private.local_time(p_at timestamptz)
returns timestamp
language sql
immutable
set search_path = ''
as $$
  select case
    when p_at >= timestamptz '2026-09-20 01:00:00+00' then p_at at time zone 'UTC'
    else p_at at time zone 'Africa/Casablanca'
  end;
$$;

create function private.local_to_utc(p_local timestamp)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_local >= timestamp '2026-09-20 01:00:00' then p_local at time zone 'UTC'
    else p_local at time zone 'Africa/Casablanca'
  end;
$$;

grant execute on function private.local_time(timestamptz), private.local_to_utc(timestamp) to authenticated, service_role;
revoke all on function private.local_time(timestamptz), private.local_to_utc(timestamp) from public, anon;

-- private.export_time
CREATE OR REPLACE FUNCTION private.export_time(p_value timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select to_char(private.local_time(p_value), 'YYYY-MM-DD HH24:MI');
$function$;

-- private.issue_receipt
CREATE OR REPLACE FUNCTION private.issue_receipt(p_invoice_ids uuid[], p_issued_at timestamp with time zone DEFAULT now(), p_issued_by uuid DEFAULT auth.uid(), p_cash_session_id uuid DEFAULT NULL::uuid)
 RETURNS receipts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student public.students;
  v_center public.centers;
  v_receipt public.receipts;
  v_lines jsonb;
  v_method public.payment_method;
  v_year smallint := extract(year from private.local_time(p_issued_at))::smallint;
begin
  select st.* into v_student
  from public.students st
  where st.id = (select i.student_id from public.invoices i where i.id = p_invoice_ids[1]);
  select * into v_center from public.centers c where c.id = v_student.center_id;

  select jsonb_agg(jsonb_build_object(
           'invoice_id', i.id,
           'subject', coalesce(s.name, p.name),
           'level', l.name,
           'pack', i.pack_enrollment_id is not null,
           'period_start', i.period_start,
           'period_end', i.period_end,
           'amount_full', i.amount_full,
           'discount_amount', i.discount_amount,
           'discount', i.discount_snapshot,
           'amount_paid', i.amount_paid
         ) order by i.period_start, coalesce(s.name, p.name)),
         min(i.payment_method)
    into v_lines, v_method
  from public.invoices i
  left join public.enrollments e on e.id = i.enrollment_id
  left join public.subjects s on s.id = e.subject_id
  left join public.pack_enrollments pe on pe.id = i.pack_enrollment_id
  left join public.packs p on p.id = pe.pack_id
  left join public.levels l on l.id = coalesce(s.level_id, p.level_id)
  where i.id = any (p_invoice_ids);

  insert into public.receipts (
    center_id, student_id, kind, receipt_year, receipt_seq, issued_at,
    amount_full, discount_applied, amount_paid, period_start, period_end, subjects_covered,
    payment_method, balance_due, student_name, level_name, center_snapshot, issued_by, issued_by_name,
    cash_session_id
  )
  select
    v_center.id, v_student.id, 'payment', v_year, private.next_receipt_seq(v_center.id, v_year), p_issued_at,
    sum(i.amount_full), sum(i.discount_amount), sum(i.amount_paid), min(i.period_start), max(i.period_end), v_lines,
    v_method, private.student_balance_due(v_student.id), v_student.full_name,
    (select l.name from public.levels l where l.id = v_student.level_id),
    jsonb_build_object('name', v_center.name, 'address', v_center.address, 'phone', v_center.phone,
                       'branding', private.applied_branding(v_center.id)),
    p_issued_by,
    (select pr.full_name from public.profiles pr where pr.id = p_issued_by),
    p_cash_session_id
  from public.invoices i
  where i.id = any (p_invoice_ids)
  returning * into v_receipt;

  update public.invoices set receipt_id = v_receipt.id where id = any (p_invoice_ids);
  return v_receipt;
end;
$function$;

-- private.today
CREATE OR REPLACE FUNCTION private.today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select (private.local_time(now()))::date;
$function$;

-- public.admin_collection_overview
CREATE OR REPLACE FUNCTION public.admin_collection_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_center_id uuid := private.auth_center_id();
  v_today date := private.today();
  v_month date := date_trunc('month', v_today::timestamp)::date;
  v_next date := (v_month + interval '1 month')::date;
  v_prev date := (v_month - interval '1 month')::date;
  v_days integer := (v_next - v_month);
  v_prev_days integer := (v_month - v_prev);
  v_day integer := extract(day from v_today)::integer;
  v_result jsonb;
begin
  if not private.can_read_finance(v_center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  with billed as (
    select date_trunc('month', i.period_start)::date as m,
           i.amount_due,
           i.amount_paid,
           case when i.status = 'paid' then (private.local_time(i.paid_at))::date end as paid_on
    from public.invoices i
    join public.students s on s.id = i.student_id and s.center_id = v_center_id
    where i.period_start >= v_prev and i.period_start < v_next
  ),
  days as (
    select g as day,
           v_month + (g - 1) as current_date,
           -- Même jour du mois précédent, borné à sa longueur (comme la comparaison chiffrée) ;
           -- rien à comparer si le mois précédent n'avait aucune facture.
           case when exists (select 1 from billed b where b.m = v_prev)
                then v_prev + (least(g, v_prev_days) - 1) end as previous_date
    from generate_series(1, v_days) as g
  ),
  curve as (
    select d.day,
           case when d.current_date <= v_today then
             (select coalesce(sum(b.amount_paid), 0) from billed b where b.m = v_month and b.paid_on <= d.current_date)
           end as current_total,
           case when d.previous_date is not null then
             (select coalesce(sum(b.amount_paid), 0) from billed b where b.m = v_prev and b.paid_on <= d.previous_date)
           end as previous_total
    from days d
  )
  select jsonb_build_object(
    'month_start', v_month,
    'today', v_today,
    'expected', coalesce((select sum(b.amount_due) from billed b where b.m = v_month), 0),
    'collected', coalesce((select sum(b.amount_paid) from billed b where b.m = v_month and b.paid_on <= v_today), 0),
    'invoices', (select count(*) from billed b where b.m = v_month),
    'paid_invoices', (select count(*) from billed b where b.m = v_month and b.paid_on <= v_today),
    'previous', jsonb_build_object(
      'month_start', v_prev,
      'expected', coalesce((select sum(b.amount_due) from billed b where b.m = v_prev), 0),
      'collected', coalesce((select sum(b.amount_paid) from billed b where b.m = v_prev and b.paid_on is not null), 0),
      'collected_same_day', coalesce((
        select sum(b.amount_paid) from billed b
        where b.m = v_prev and b.paid_on <= v_prev + (least(v_day, v_prev_days) - 1)
      ), 0)
    ),
    'days', (select jsonb_agg(jsonb_build_object('day', c.day, 'current', c.current_total, 'previous', c.previous_total)
                              order by c.day) from curve c)
  )
  into v_result;
  return v_result;
end;
$function$;

-- public.cancel_receipt
CREATE OR REPLACE FUNCTION public.cancel_receipt(p_receipt_id uuid, p_reason text)
 RETURNS receipts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_original public.receipts;
  v_cancel public.receipts;
  v_year smallint := extract(year from private.local_time(now()))::smallint;
  v_session uuid;
begin
  if not private.is_admin() or not exists (
    select 1 from public.receipts r where r.id = p_receipt_id and r.center_id = private.auth_center_id()
  ) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_original from public.receipts r where r.id = p_receipt_id for update;
  if v_original.kind <> 'payment' then
    raise exception 'Un reçu d''annulation ne s''annule pas.' using errcode = '22023';
  end if;
  if exists (select 1 from public.receipts r where r.cancels_receipt_id = p_receipt_id) then
    raise exception 'Ce reçu est déjà annulé.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez le motif de l''annulation.' using errcode = '22023';
  end if;

  v_session := private.open_cash_session_for(v_original.center_id, (select auth.uid()), 0);

  insert into public.receipts (
    center_id, student_id, kind, receipt_year, receipt_seq,
    amount_full, discount_applied, amount_paid, period_start, period_end, subjects_covered,
    payment_method, balance_due, student_name, level_name, center_snapshot, issued_by, issued_by_name,
    cancels_receipt_id, cancel_reason, cash_session_id
  )
  values (
    v_original.center_id, v_original.student_id, 'cancellation', v_year,
    private.next_receipt_seq(v_original.center_id, v_year),
    -v_original.amount_full, -v_original.discount_applied, -v_original.amount_paid,
    v_original.period_start, v_original.period_end, v_original.subjects_covered,
    v_original.payment_method, 0, v_original.student_name, v_original.level_name, v_original.center_snapshot,
    (select auth.uid()), (select pr.full_name from public.profiles pr where pr.id = (select auth.uid())),
    v_original.id, btrim(p_reason), v_session
  )
  returning * into v_cancel;

  update public.invoices
  set status = case when overdue_from <= private.today() then 'overdue' else 'pending' end::public.invoice_status,
      amount_paid = 0,
      paid_at = null,
      paid_by = null,
      payment_method = null,
      receipt_id = null
  where receipt_id = v_original.id;

  perform private.log_center_event(v_original.center_id, 'receipt.cancelled', v_cancel.id,
    jsonb_build_object('receipt_number', v_original.receipt_number, 'amount', v_original.amount_paid,
                       'reason', btrim(p_reason)));
  return v_cancel;
end;
$function$;

-- public.export_center_data
CREATE OR REPLACE FUNCTION public.export_center_data(p_export_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_export public.center_exports;
  c uuid;
  f date;
  t date;
begin
  select * into v_export from public.center_exports e where e.id = p_export_id;
  if v_export.id is null or v_export.status <> 'pending' then
    raise exception 'Export introuvable ou déjà traité.' using errcode = 'P0002';
  end if;
  c := v_export.center_id;
  f := coalesce(v_export.period_from, '-infinity'::date);
  t := coalesce(v_export.period_to, 'infinity'::date);

  return json_build_object(
    'eleves', json_build_object('title', 'Élèves', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Nom', s.full_name,
        'Niveau', l.name,
        'Tuteur', s.guardian_name,
        'Téléphone du tuteur', s.guardian_phone,
        'Langue des messages', private.export_label('locale', coalesce(s.message_locale, 'center')),
        'Inscription en cours', exists (select 1 from public.enrollments e where e.student_id = s.id and e.active)
                                 or exists (select 1 from public.pack_enrollments pe where pe.student_id = s.id and pe.active),
        'Accès élève', exists (select 1 from public.student_accounts a where a.student_id = s.id and a.active),
        'Notes', s.notes,
        'Créé le', private.export_time(s.created_at)
      ) order by s.full_name), '[]'::json)
      from public.students s
      join public.levels l on l.id = s.level_id
      where s.center_id = c)),

    'tuteurs', json_build_object('title', 'Tuteurs', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Tuteur', g.guardian_name,
        'Téléphone', g.guardian_phone,
        'Élèves', g.students,
        'Nombre d''élèves', g.n
      ) order by g.guardian_name nulls last, g.guardian_phone), '[]'::json)
      from (
        select s.guardian_name, s.guardian_phone, string_agg(s.full_name, ', ' order by s.full_name) as students, count(*)::integer as n
        from public.students s
        where s.center_id = c and (s.guardian_name is not null or s.guardian_phone is not null)
        group by s.guardian_name, s.guardian_phone
      ) g)),

    'inscriptions', json_build_object('title', 'Inscriptions', 'rows', (
      select coalesce(json_agg(r.row order by r.student, r.course), '[]'::json)
      from (
        select s.full_name as student, sub.name as course, json_build_object(
          'Élève', s.full_name,
          'Niveau', l.name,
          'Type', 'Matière',
          'Matière ou pack', sub.name,
          'Dans un pack', e.pack_enrollment_id is not null,
          'Début', e.start_date,
          'Prix convenu (MAD)', e.price_agreed,
          'Jour de facturation', e.billing_day,
          'Active', e.active
        ) as row
        from public.enrollments e
        join public.students s on s.id = e.student_id
        join public.subjects sub on sub.id = e.subject_id
        join public.levels l on l.id = sub.level_id
        where s.center_id = c
        union all
        select s.full_name, p.name, json_build_object(
          'Élève', s.full_name,
          'Niveau', l.name,
          'Type', 'Pack',
          'Matière ou pack', p.name,
          'Dans un pack', false,
          'Début', pe.start_date,
          'Prix convenu (MAD)', pe.price_agreed,
          'Jour de facturation', pe.billing_day,
          'Active', pe.active
        )
        from public.pack_enrollments pe
        join public.students s on s.id = pe.student_id
        join public.packs p on p.id = pe.pack_id
        left join public.levels l on l.id = p.level_id
        where s.center_id = c
      ) r)),

    'matieres', json_build_object('title', 'Matières et niveaux', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Niveau', l.name,
        'Ordre du niveau', l.sort_order,
        'Matière', sub.name,
        'Prix mensuel (MAD)', sub.monthly_price
      ) order by l.sort_order, l.name, sub.name), '[]'::json)
      from public.levels l
      left join public.subjects sub on sub.level_id = l.id
      where l.center_id = c)),

    'packs', json_build_object('title', 'Packs', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Pack', p.name,
        'Niveau', l.name,
        'Prix mensuel (MAD)', p.monthly_price,
        'Matières', (select string_agg(sub.name, ', ' order by sub.name)
                     from public.pack_subjects ps join public.subjects sub on sub.id = ps.subject_id
                     where ps.pack_id = p.id),
        'Actif', p.active
      ) order by p.name), '[]'::json)
      from public.packs p
      left join public.levels l on l.id = p.level_id
      where p.center_id = c)),

    'equipe', json_build_object('title', 'Professeurs et assistants', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Nom', p.full_name,
        'Rôle', private.export_label('role', p.role::text),
        'Courriel', u.email,
        'Téléphone', p.phone,
        'Actif', p.active,
        'Rémunération', private.export_label('pay_mode', p.pay_mode::text),
        'Créé le', private.export_time(p.created_at),
        'Dernière connexion', private.export_time(u.last_sign_in_at)
      ) order by p.role, p.full_name), '[]'::json)
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.center_id = c)),

    'emploi_du_temps', json_build_object('title', 'Emploi du temps', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Jour', private.export_label('day', sl.day_of_week::text),
        'Début', to_char(sl.start_time, 'HH24:MI'),
        'Fin', to_char(sl.end_time, 'HH24:MI'),
        'Niveau', l.name,
        'Matière', sub.name,
        'Professeur', pr.full_name,
        'Salle', coalesce(ro.name, sl.room)
      ) order by (sl.day_of_week + 6) % 7, sl.start_time, l.name), '[]'::json)
      from public.schedule_slots sl
      join public.subjects sub on sub.id = sl.subject_id
      join public.levels l on l.id = sl.level_id
      left join public.profiles pr on pr.id = sl.teacher_id
      left join public.rooms ro on ro.id = sl.room_id
      where sl.center_id = c)),

    'salles', json_build_object('title', 'Salles', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Salle', ro.name,
        'Capacité', ro.capacity,
        'Étage', ro.floor,
        'Active', ro.is_active,
        'Notes', ro.notes
      ) order by ro.name), '[]'::json)
      from public.rooms ro
      where ro.center_id = c)),

    'factures', json_build_object('title', 'Paiements des élèves', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Élève', s.full_name,
        'Matière ou pack', coalesce(sub.name, p.name),
        'Période du', i.period_start,
        'Période au', i.period_end,
        'Échéance', i.due_date,
        'Montant plein (MAD)', i.amount_full,
        'Remise (MAD)', i.discount_amount,
        'Montant dû (MAD)', i.amount_due,
        'Montant payé (MAD)', i.amount_paid,
        'Statut', private.export_label('invoice', i.status::text),
        'Payé le', private.export_time(i.paid_at),
        'Mode de paiement', private.export_label('method', i.payment_method::text),
        'Reçu', r.receipt_number
      ) order by i.period_start, s.full_name), '[]'::json)
      from public.invoices i
      join public.students s on s.id = i.student_id
      left join public.enrollments e on e.id = i.enrollment_id
      left join public.subjects sub on sub.id = e.subject_id
      left join public.pack_enrollments pe on pe.id = i.pack_enrollment_id
      left join public.packs p on p.id = pe.pack_id
      left join public.receipts r on r.id = i.receipt_id
      where s.center_id = c and i.period_start between f and t)),

    'recus', json_build_object('title', 'Reçus', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Numéro', r.receipt_number,
        'Type', private.export_label('receipt', r.kind::text),
        'Émis le', private.export_time(r.issued_at),
        'Élève', r.student_name,
        'Niveau', r.level_name,
        'Période du', r.period_start,
        'Période au', r.period_end,
        'Montant plein (MAD)', r.amount_full,
        'Remise (MAD)', r.discount_applied,
        'Montant payé (MAD)', r.amount_paid,
        'Reste dû (MAD)', r.balance_due,
        'Mode de paiement', private.export_label('method', r.payment_method::text),
        'Émis par', r.issued_by_name,
        'Motif d''annulation', r.cancel_reason
      ) order by r.issued_at, r.receipt_number), '[]'::json)
      from public.receipts r
      where r.center_id = c and (private.local_time(r.issued_at))::date between f and t)),

    'presences', json_build_object('title', 'Présences et absences', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', a.session_date,
        'Élève', s.full_name,
        'Niveau', l.name,
        'Matière', sub.name,
        'Professeur', pr.full_name,
        'Statut', private.export_label('attendance', a.status::text),
        'Note', a.note,
        'Pointé le', private.export_time(a.marked_at)
      ) order by a.session_date, sub.name, s.full_name), '[]'::json)
      from public.attendance a
      join public.students s on s.id = a.student_id
      join public.levels l on l.id = s.level_id
      join public.subjects sub on sub.id = a.subject_id
      left join public.profiles pr on pr.id = a.teacher_id
      where s.center_id = c and a.session_date between f and t)),

    'remises', json_build_object('title', 'Remises', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Élève', s.full_name,
        'Type', private.export_label('discount_type', d.type::text),
        'Valeur', d.value,
        'Portée', private.export_label('discount_scope', d.scope::text),
        'Matière ou pack', coalesce(sub.name, p.name),
        'Motif', private.export_label('discount_reason', d.reason::text),
        'Précision', d.reason_note,
        'Du', d.valid_from,
        'Au', d.valid_to,
        'Active', d.is_active,
        'Accordée le', private.export_time(d.granted_at)
      ) order by s.full_name, d.valid_from), '[]'::json)
      from public.discounts d
      join public.students s on s.id = d.student_id
      left join public.subjects sub on sub.id = d.subject_id
      left join public.packs p on p.id = d.pack_id
      where d.center_id = c)),

    'charges', json_build_object('title', 'Charges', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', x.expense_date,
        'Catégorie', cat.name,
        'Libellé', x.label,
        'Montant (MAD)', x.amount,
        'Mode de paiement', private.export_label('method', x.payment_method::text),
        'Récurrente', x.is_recurring,
        'Statut', private.export_label('expense', x.status::text),
        'Notes', x.notes,
        'Supprimée le', private.export_time(x.deleted_at)
      ) order by x.expense_date, x.label), '[]'::json)
      from public.expenses x
      left join public.expense_categories cat on cat.id = x.category_id
      where x.center_id = c and x.expense_date between f and t)),

    'paie', json_build_object('title', 'Paie', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Année', pp.year,
        'Mois', pp.month,
        'Statut de la période', private.export_label('payroll', pp.status::text),
        'Professeur', pl.teacher_name,
        'Mode', private.export_label('pay_mode', pl.pay_mode::text),
        'Montant calculé (MAD)', pl.computed_amount,
        'Ajustement (MAD)', pl.adjustment_amount,
        'Motif de l''ajustement', pl.adjustment_reason,
        'Montant final (MAD)', pl.final_amount,
        'Payé le', pl.paid_at,
        'Mode de paiement', private.export_label('method', pl.payment_method::text)
      ) order by pp.year, pp.month, pl.teacher_name), '[]'::json)
      from public.payroll_periods pp
      join public.payroll_lines pl on pl.payroll_period_id = pp.id
      where pp.center_id = c and make_date(pp.year, pp.month, 1) between date_trunc('month', f)::date and t)),

    'caisse', json_build_object('title', 'Sessions de caisse', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', cs.session_date,
        'Caisse partagée', cs.is_shared,
        'Accueil', ast.full_name,
        'Ouverte le', private.export_time(cs.opened_at),
        'Fond de caisse (MAD)', cs.opening_float,
        'Clôturée le', private.export_time(cs.closed_at),
        'Espèces attendues (MAD)', cs.expected_cash,
        'Espèces comptées (MAD)', cs.counted_cash,
        'Écart (MAD)', cs.variance,
        'Motif de l''écart', cs.variance_reason,
        'Statut', private.export_label('cash', cs.status::text),
        'Validée le', private.export_time(cs.validated_at),
        'Notes', cs.notes
      ) order by cs.session_date, cs.opened_at), '[]'::json)
      from public.cash_sessions cs
      left join public.profiles ast on ast.id = cs.assistant_id
      where cs.center_id = c and cs.session_date between f and t)),

    'mouvements_caisse', json_build_object('title', 'Mouvements de caisse', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date de la caisse', cs.session_date,
        'Heure', private.export_time(m.created_at),
        'Type', private.export_label('movement', m.kind::text),
        'Montant (MAD)', m.amount,
        'Motif', m.reason
      ) order by m.created_at), '[]'::json)
      from public.cash_movements m
      join public.cash_sessions cs on cs.id = m.cash_session_id
      where m.center_id = c and cs.session_date between f and t))
  );
end;
$function$;

-- public.payment_reminder_queue
CREATE OR REPLACE FUNCTION public.payment_reminder_queue(p_run_id uuid DEFAULT NULL::uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(billing_run_id uuid, period_year smallint, period_month smallint, student_id uuid, full_name text, photo_url text, level_name text, guardian_name text, guardian_phone text, due_date date, reminder_type payment_reminder_type, days_overdue integer, suggested boolean, amount_due numeric, invoice_ids uuid[], subject_names text[], pack_flags boolean[], last_sent_at timestamp with time zone, last_sent_by_name text, last_channel notification_channel, followed_up_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_today date := private.today();
  v_days smallint;
  v_enabled boolean;
begin
  if not (select private.is_staff()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select c.reminder_days_before, c.payment_reminders_enabled into v_days, v_enabled
  from public.centers c where c.id = (select private.auth_center_id());
  if not coalesce(v_enabled, false) then
    return;
  end if;

  return query
  with items as (
    select i.billing_run_id, i.student_id, i.due_date,
           min(i.overdue_from) as overdue_from,
           sum(i.amount_due - i.amount_paid) as amount,
           array_agg(i.id order by coalesce(su.name, pk.name), i.id) as invoice_ids,
           array_agg(coalesce(su.name, pk.name) order by coalesce(su.name, pk.name), i.id) as names,
           array_agg(pk.id is not null order by coalesce(su.name, pk.name), i.id) as packs
    from public.invoices i
    join public.billing_runs br on br.id = i.billing_run_id and br.status in ('confirmed', 'sent', 'closed')
    left join public.enrollments e on e.id = i.enrollment_id
    left join public.subjects su on su.id = e.subject_id
    left join public.pack_enrollments pe on pe.id = i.pack_enrollment_id
    left join public.packs pk on pk.id = pe.pack_id
    -- Rien à rappeler pour une facture réglée, ou à 0 MAD (remise totale).
    where i.status <> 'paid' and i.amount_due > i.amount_paid
      and (p_run_id is null or i.billing_run_id = p_run_id)
      and (p_student_id is null or i.student_id = p_student_id)
    group by i.billing_run_id, i.student_id, i.due_date
  ),
  typed as (
    select it.*,
           (case when v_today >= it.overdue_from then 'overdue'
                 when v_today = it.due_date then 'due_today'
                 else 'upcoming' end)::public.payment_reminder_type as rtype
    from items it
  )
  select t.billing_run_id,
         br.period_year,
         br.period_month,
         t.student_id,
         st.full_name,
         st.photo_url,
         lv.name,
         st.guardian_name,
         st.guardian_phone,
         t.due_date,
         t.rtype,
         case when t.rtype = 'overdue' then v_today - t.due_date end,
         t.rtype <> 'upcoming' or t.due_date - v_today <= v_days,
         t.amount,
         t.invoice_ids,
         t.names,
         t.packs,
         last.sent_at,
         last.by_name,
         last.channel,
         fu.at
  from typed t
  join public.billing_runs br on br.id = t.billing_run_id
  join public.students st on st.id = t.student_id
  left join public.levels lv on lv.id = st.level_id
  left join lateral (
    select pr.sent_at, p.full_name as by_name, pr.channel
    from public.payment_reminders pr
    left join public.profiles p on p.id = pr.sent_by
    where pr.invoice_id = any(t.invoice_ids) and pr.reminder_type = t.rtype and pr.status = 'sent'
    -- À la même heure, la relance passe après l'envoi qu'elle relance.
    order by pr.sent_at desc, pr.is_repeat desc
    limit 1
  ) last on true
  -- En retard : une relance de paiement notée depuis le suivi (appel, visite)
  -- depuis le début du retard vaut un rappel de cette vague.
  left join lateral (
    select max(f.created_at) as at
    from public.follow_ups f
    where t.rtype = 'overdue' and f.student_id = t.student_id and f.type = 'payment'
      and (private.local_time(f.created_at))::date >= t.overdue_from
  ) fu on true
  order by t.due_date, st.full_name;
end;
$function$;

-- public.platform_audit_log
CREATE OR REPLACE FUNCTION public.platform_audit_log(p_center_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_origin text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(event_id bigint, occurred_at timestamp with time zone, action text, payload jsonb, actor_name text, actor_is_platform boolean, center_id uuid, center_name text, ip_address text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_super_admin();
  return query
  select e.id, e.occurred_at, e.action, e.payload, a.full_name, coalesce(a.role = 'super_admin', false),
         e.center_id, c.name, host(e.ip_address), count(*) over ()
  from public.platform_events e
  left join public.profiles a on a.id = e.actor_id
  left join public.centers c on c.id = e.center_id
  where (p_center_id is null or e.center_id = p_center_id)
    and (p_action is null
         or (right(p_action, 1) = '.' and left(e.action, length(p_action)) = p_action)
         or e.action = p_action)
    and (p_origin is null
         or (p_origin = 'automatic' and e.actor_id is null)
         or (p_origin = 'platform' and a.role = 'super_admin')
         or (p_origin = 'center' and e.actor_id is not null and a.role is distinct from 'super_admin'))
    and (p_from is null or e.occurred_at >= private.local_to_utc(p_from::timestamp))
    and (p_to is null or e.occurred_at < private.local_to_utc((p_to + 1)::timestamp))
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- public.follow_up_queue (vue, appelants : droits de l'appelant)
create or replace view public.follow_up_queue with (security_invoker = true) as
 SELECT d.id AS student_id,
    d.center_id,
    d.full_name,
    d.level_name,
    d.photo_url,
    d.guardian_name,
    d.guardian_phone,
    d.overdue_count,
    d.overdue_amount,
    o.oldest_invoice_id,
    o.oldest_due_date,
    private.today() - o.oldest_due_date AS days_overdue,
    f.last_follow_up_at,
    COALESCE(private.local_time(f.last_follow_up_at)::date = private.today(), false) AS followed_up_today
   FROM student_directory d
     JOIN LATERAL ( SELECT i.id AS oldest_invoice_id,
            i.due_date AS oldest_due_date
           FROM invoices i
          WHERE i.student_id = d.id AND private.invoice_is_overdue(i.status, i.overdue_from)
          ORDER BY i.due_date, i.period_start
         LIMIT 1) o ON true
     LEFT JOIN LATERAL ( SELECT max(c.contacted_at) AS last_follow_up_at
           FROM ( SELECT fu.created_at AS contacted_at
                   FROM follow_ups fu
                  WHERE fu.student_id = d.id AND fu.type = 'payment'::follow_up_type
                UNION ALL
                 SELECT pr.sent_at
                   FROM payment_reminders pr
                  WHERE pr.student_id = d.id AND pr.reminder_type = 'overdue'::payment_reminder_type AND pr.status = 'sent'::payment_reminder_status) c) f ON true
  WHERE d.is_overdue;
