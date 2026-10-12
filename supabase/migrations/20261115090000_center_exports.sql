-- =====================================================================
-- Export des données d'un centre (archive ZIP : Excel + CSV)
--
--  * demande (platform_request_center_export) : super-admin, motif
--    obligatoire (demande du client, fin de contrat, sauvegarde, autre),
--    période (tout l'historique ou dates) ; journalisée ;
--  * génération par le serveur de l'application, clé service_role :
--    export_center_data lit les données d'une demande en attente
--    (aucune autre lecture possible), complete_center_export enregistre
--    le fichier (bucket privé center-exports, aucune policy : service_role
--    uniquement) ;
--  * lien de téléchargement signé, valable jusqu'à 24 h après la
--    génération ; fichier supprimé ensuite (expired_center_exports) ;
--  * aucun mot de passe, aucun jeton, aucun code de connexion exporté :
--    colonnes choisies une à une ;
--  * requested_role : prévu pour l'export demandé par l'administrateur du
--    centre lui-même (plus tard), même génération.
-- =====================================================================

create table public.center_exports (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  requested_role text not null check (requested_role in ('super_admin', 'admin')),
  reason_kind text not null check (reason_kind in ('client_request', 'contract_end', 'backup', 'other')),
  reason_note text check (reason_note is null or length(reason_note) <= 300),
  period_from date,
  period_to date,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'expired')),
  storage_path text,
  file_size bigint check (file_size is null or file_size >= 0),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  check (period_from is null or period_to is null or period_from <= period_to),
  check ((status = 'ready') = (storage_path is not null))
);

create index center_exports_center_idx on public.center_exports (center_id, created_at desc);
create index center_exports_open_idx on public.center_exports (expires_at) where status in ('pending', 'ready');

comment on table public.center_exports is
  'Exports des données d''un centre (ZIP Excel + CSV) : demande, fichier privé, lien de 24 h.';

alter table public.center_exports enable row level security;
revoke all on public.center_exports from anon, authenticated;

-- Fichiers : bucket privé, aucune policy (clé service_role uniquement).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('center-exports', 'center-exports', false, 104857600, array['application/zip'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Demande et liste (console)
-- ---------------------------------------------------------------------
create function public.platform_request_center_export(
  p_center_id uuid,
  p_reason_kind text,
  p_reason_note text default null,
  p_from date default null,
  p_to date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_reason_note, '')), '');
  v_id uuid;
begin
  perform private.require_super_admin();
  if p_reason_kind is null or p_reason_kind not in ('client_request', 'contract_end', 'backup', 'other') then
    raise exception 'Choisissez le motif de l''export.' using errcode = '22023';
  end if;
  if p_reason_kind = 'other' and v_note is null then
    raise exception 'Précisez le motif de l''export.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Motif trop long (300 caractères au plus).' using errcode = '22023';
  end if;
  if (p_from is null) <> (p_to is null) or p_from > p_to then
    raise exception 'Période invalide.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.centers c where c.id = p_center_id) then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  -- Une génération à la fois par centre.
  if exists (select 1 from public.center_exports e
             where e.center_id = p_center_id and e.status = 'pending' and e.created_at > now() - interval '1 hour') then
    raise exception 'Un export de ce centre est déjà en préparation.' using errcode = '22023';
  end if;

  insert into public.center_exports (center_id, requested_by, requested_role, reason_kind, reason_note, period_from, period_to)
  values (p_center_id, (select auth.uid()), 'super_admin', p_reason_kind, v_note, p_from, p_to)
  returning id into v_id;

  perform private.log_platform_event(p_center_id, 'center.data_exported',
    jsonb_build_object('export_id', v_id, 'kind', p_reason_kind, 'reason', v_note, 'from', p_from, 'to', p_to));
  return v_id;
end;
$$;

create function public.platform_center_exports(p_center_id uuid)
returns table (
  export_id uuid,
  status text,
  reason_kind text,
  reason_note text,
  period_from date,
  period_to date,
  file_size bigint,
  requested_by_name text,
  created_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select e.id, e.status, e.reason_kind, e.reason_note, e.period_from, e.period_to, e.file_size,
         p.full_name, e.created_at, e.completed_at, e.expires_at
  from public.center_exports e
  left join public.profiles p on p.id = e.requested_by
  where e.center_id = p_center_id
  order by e.created_at desc
  limit 20;
end;
$$;

-- Fichier d'un export prêt et encore valable (lien signé créé par le serveur).
create function public.platform_center_export_file(p_export_id uuid)
returns table (storage_path text, expires_at timestamptz, center_slug text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select e.storage_path, e.expires_at, c.slug
  from public.center_exports e
  join public.centers c on c.id = e.center_id
  where e.id = p_export_id and e.status = 'ready' and e.expires_at > now();
end;
$$;

-- ---------------------------------------------------------------------
-- Libellés des valeurs codées
-- ---------------------------------------------------------------------
create function private.export_label(p_kind text, p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind || ':' || coalesce(p_value, '')
    when 'role:admin' then 'Administrateur'
    when 'role:assistant' then 'Accueil'
    when 'role:teacher' then 'Professeur'
    when 'method:cash' then 'Espèces'
    when 'method:bank_transfer' then 'Virement'
    when 'method:card' then 'Carte'
    when 'method:cheque' then 'Chèque'
    when 'attendance:present' then 'Présent'
    when 'attendance:absent' then 'Absent'
    when 'invoice:pending' then 'À payer'
    when 'invoice:paid' then 'Payée'
    when 'invoice:overdue' then 'En retard'
    when 'receipt:payment' then 'Paiement'
    when 'receipt:cancellation' then 'Annulation'
    when 'discount_type:percentage' then 'Pourcentage'
    when 'discount_type:fixed_amount' then 'Montant fixe'
    when 'discount_scope:all_subjects' then 'Toutes les matières'
    when 'discount_scope:specific_subject' then 'Une matière'
    when 'discount_reason:sibling' then 'Fratrie'
    when 'discount_reason:social' then 'Sociale'
    when 'discount_reason:merit' then 'Mérite'
    when 'discount_reason:referral' then 'Parrainage'
    when 'discount_reason:other' then 'Autre'
    when 'expense:draft' then 'Brouillon'
    when 'expense:confirmed' then 'Confirmée'
    when 'payroll:draft' then 'Brouillon'
    when 'payroll:validated' then 'Validée'
    when 'payroll:paid' then 'Payée'
    when 'pay_mode:fixed_salary' then 'Salaire fixe'
    when 'pay_mode:commission' then 'Commission'
    when 'cash:open' then 'Ouverte'
    when 'cash:closed' then 'Clôturée'
    when 'cash:validated' then 'Validée'
    when 'movement:refund' then 'Remboursement'
    when 'movement:expense' then 'Charge'
    when 'movement:teacher_pay' then 'Paie professeur'
    when 'movement:bank_deposit' then 'Dépôt en banque'
    when 'movement:float_change' then 'Fond de caisse'
    when 'movement:correction' then 'Correction'
    when 'day:0' then 'Dimanche'
    when 'day:1' then 'Lundi'
    when 'day:2' then 'Mardi'
    when 'day:3' then 'Mercredi'
    when 'day:4' then 'Jeudi'
    when 'day:5' then 'Vendredi'
    when 'day:6' then 'Samedi'
    when 'locale:fr' then 'Français'
    when 'locale:en' then 'Anglais'
    when 'locale:ar' then 'Arabe'
    when 'locale:center' then 'Langue du centre'
    else p_value
  end;
$$;

-- Date et heure à Casablanca, lisibles (« 2026-10-12 14:30 »).
create function private.export_time(p_value timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_value at time zone 'Africa/Casablanca', 'YYYY-MM-DD HH24:MI');
$$;

-- ---------------------------------------------------------------------
-- Données d'un export (serveur, clé service_role)
-- ---------------------------------------------------------------------
-- Un objet par onglet : { "cle": { "title": "...", "rows": [ {colonne: valeur, ...} ] } }.
-- json (et non jsonb) : l'ordre des colonnes est conservé. Période : appliquée
-- aux données datées (factures, reçus, présences, charges, paie, caisse) ;
-- les données de référence (élèves, inscriptions, équipe…) sont complètes.
create function public.export_center_data(p_export_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      where r.center_id = c and (r.issued_at at time zone 'Africa/Casablanca')::date between f and t)),

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
$$;

-- Fichier enregistré (ou échec) : lien valable 24 h à partir de maintenant.
create function public.complete_center_export(
  p_export_id uuid,
  p_storage_path text default null,
  p_file_size bigint default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.center_exports
  set status = case when p_storage_path is not null then 'ready' else 'failed' end,
      storage_path = p_storage_path,
      file_size = p_file_size,
      error = case when p_storage_path is null then left(coalesce(p_error, 'Erreur inconnue'), 300) end,
      completed_at = now(),
      expires_at = now() + interval '24 hours'
  where id = p_export_id and status = 'pending';
  if not found then
    raise exception 'Export introuvable ou déjà traité.' using errcode = 'P0002';
  end if;
end;
$$;

-- Nettoyage : exports dont le lien a expiré (fichiers à supprimer par le
-- serveur), générations bloquées depuis plus d'une heure (échec).
create function public.expired_center_exports()
returns table (export_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.center_exports
  set status = 'failed', error = 'Génération interrompue.', completed_at = now()
  where status = 'pending' and created_at < now() - interval '1 hour';

  return query
  select e.id, e.storage_path from public.center_exports e
  where e.status = 'ready' and e.expires_at <= now();
end;
$$;

create function public.mark_center_exports_expired(p_export_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.center_exports
  set status = 'expired', storage_path = null
  where id = any (p_export_ids) and status = 'ready' and expires_at <= now();
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.platform_request_center_export(uuid, text, text, date, date)',
    'public.platform_center_exports(uuid)',
    'public.platform_center_export_file(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
  foreach v_fn in array array[
    'public.export_center_data(uuid)',
    'public.complete_center_export(uuid, text, bigint, text)',
    'public.expired_center_exports()',
    'public.mark_center_exports_expired(uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end;
$$;

revoke all on function private.export_label(text, text), private.export_time(timestamptz) from public, anon, authenticated;
