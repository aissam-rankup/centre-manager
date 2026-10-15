-- =====================================================================
-- CentroManager — reçus de paie (professeurs, assistants, admins salariés)
--
-- Le versement d'un salaire (bouton « Marquer versé » de la paie) produit
-- désormais un reçu de paie, sur le modèle des reçus des élèves :
--  * une ligne salary_payments par versement = le reçu, immuable : centre,
--    membre, rôle, période, montant, mode, date et note figés à l'émission ;
--    seules les traces (impression, partage, PDF) s'y ajoutent ;
--  * numéro « ANNEE-NNNN » par centre et par année, série distincte des
--    reçus des élèves (compteur verrouillé dans la transaction : ni trou
--    ni doublon) ;
--  * une correction passe par un reçu d'annulation lié (admin, motif) : la
--    ligne de paie redevient « à verser » ;
--  * lisible par l'admin du centre uniquement (jamais par l'assistant, ni
--    en mode support) ; PDF dans un bucket privé sans accès client (liens
--    signés par le serveur) ;
--  * les versements déjà enregistrés reçoivent leur reçu (date d'origine,
--    numérotés dans l'ordre des dates).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reçus de paie
-- ---------------------------------------------------------------------
create table public.salary_receipt_counters (
  center_id uuid not null references public.centers (id) on delete cascade,
  year smallint not null,
  last_number integer not null check (last_number > 0),
  primary key (center_id, year)
);

alter table public.salary_receipt_counters enable row level security;
revoke all on public.salary_receipt_counters from anon, authenticated;

create table public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  -- La ligne de paie et le membre peuvent disparaître : le reçu reste (valeurs figées ci-dessous).
  payroll_line_id uuid,
  member_id uuid references public.profiles (id) on delete set null,
  kind public.receipt_kind not null default 'payment',
  receipt_year smallint not null,
  receipt_seq integer not null check (receipt_seq > 0),
  receipt_number text generated always as (receipt_year::text || '-' || lpad(receipt_seq::text, 4, '0')) stored,
  issued_at timestamptz not null default now(),
  -- Date du versement (saisie par l'admin).
  paid_on date not null,
  period_year smallint not null check (period_year between 2000 and 2100),
  period_month smallint not null check (period_month between 1 and 12),
  -- Négatif sur un reçu d'annulation.
  amount numeric(12, 2) not null,
  payment_method public.payment_method not null,
  note text check (note is null or length(btrim(note)) between 1 and 300),
  member_name text not null,
  member_role public.user_role not null,
  member_phone text,
  -- {name, address, phone, branding} au moment de l'émission.
  center_snapshot jsonb not null,
  issued_by uuid default auth.uid() references public.profiles (id) on delete set null,
  issued_by_name text,
  cancels_payment_id uuid references public.salary_payments (id) on delete restrict,
  cancel_reason text,
  pdf_url text,
  whatsapp_sent_at timestamptz,
  printed_at timestamptz,
  foreign key (payroll_line_id, center_id) references public.payroll_lines (id, center_id) on delete set null (payroll_line_id),
  unique (center_id, receipt_year, receipt_seq),
  unique (cancels_payment_id),
  check ((kind = 'cancellation') = (cancels_payment_id is not null)),
  check (kind = 'payment' or length(btrim(cancel_reason)) between 1 and 300),
  check (kind = 'cancellation' or amount >= 0),
  check (kind = 'payment' or amount <= 0)
);

create index salary_payments_center_issued_idx on public.salary_payments (center_id, issued_at desc);
create index salary_payments_member_idx on public.salary_payments (member_id, issued_at desc);
create index salary_payments_line_idx on public.salary_payments (payroll_line_id);
create index salary_payments_issued_by_idx on public.salary_payments (issued_by);
create index salary_payments_period_idx on public.salary_payments (center_id, period_year, period_month);

-- Immuable : seules les traces (PDF, impression, WhatsApp) s'ajoutent ; les
-- liens vers une ligne, un membre ou un auteur supprimés passent à nul.
create function private.salary_payments_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_traces text[] := array['pdf_url', 'whatsapp_sent_at', 'printed_at', 'receipt_number'];
  v_links text[] := array['payroll_line_id', 'member_id', 'issued_by'];
  v_link text;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.centers c where c.id = old.center_id) then
      return old;
    end if;
    raise exception 'Un reçu de paie ne se supprime pas : émettez un reçu d''annulation.' using errcode = '42501';
  end if;

  if (to_jsonb(new) - v_traces - v_links) is distinct from (to_jsonb(old) - v_traces - v_links) then
    raise exception 'Un reçu de paie ne se modifie pas : émettez un reçu d''annulation.' using errcode = '42501';
  end if;
  foreach v_link in array v_links loop
    if (to_jsonb(new) ->> v_link) is distinct from (to_jsonb(old) ->> v_link) and (to_jsonb(new) ->> v_link) is not null then
      raise exception 'Un reçu de paie ne se modifie pas : émettez un reçu d''annulation.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger salary_payments_immutable
before update or delete on public.salary_payments
for each row execute function private.salary_payments_immutable();

-- ---------------------------------------------------------------------
-- Numérotation et émission
-- ---------------------------------------------------------------------
create function private.next_salary_receipt_seq(p_center_id uuid, p_year smallint)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.salary_receipt_counters as c (center_id, year, last_number)
  values (p_center_id, p_year, 1)
  on conflict (center_id, year) do update set last_number = c.last_number + 1
  returning last_number;
$$;

-- Reçu d'un versement déjà enregistré sur la ligne de paie.
create function private.issue_salary_receipt(
  p_line_id uuid,
  p_note text default null,
  p_issued_at timestamptz default now(),
  p_issued_by uuid default auth.uid()
)
returns public.salary_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.payroll_lines;
  v_period public.payroll_periods;
  v_center public.centers;
  v_receipt public.salary_payments;
  v_year smallint := extract(year from private.local_time(p_issued_at))::smallint;
begin
  select * into v_line from public.payroll_lines where id = p_line_id;
  select * into v_period from public.payroll_periods where id = v_line.payroll_period_id;
  select * into v_center from public.centers where id = v_line.center_id;

  insert into public.salary_payments (
    center_id, payroll_line_id, member_id, kind, receipt_year, receipt_seq, issued_at,
    paid_on, period_year, period_month, amount, payment_method, note,
    member_name, member_role, member_phone, center_snapshot, issued_by, issued_by_name
  )
  values (
    v_center.id, v_line.id, v_line.teacher_id, 'payment', v_year, private.next_salary_receipt_seq(v_center.id, v_year), p_issued_at,
    v_line.paid_at, v_period.year, v_period.month, v_line.final_amount, v_line.payment_method,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_line.teacher_name, v_line.member_role,
    (select pr.phone from public.profiles pr where pr.id = v_line.teacher_id),
    jsonb_build_object('name', v_center.name, 'address', v_center.address, 'phone', v_center.phone,
                       'branding', private.applied_branding(v_center.id)),
    p_issued_by,
    (select pr.full_name from public.profiles pr where pr.id = p_issued_by)
  )
  returning * into v_receipt;
  return v_receipt;
end;
$$;

-- ---------------------------------------------------------------------
-- Versement d'une ligne : enregistré et reçu émis dans la même transaction
-- ---------------------------------------------------------------------
drop function public.payroll_mark_paid(uuid, date, public.payment_method);

create function public.payroll_mark_paid(
  p_line_id uuid,
  p_paid_at date,
  p_method public.payment_method,
  p_note text default null
)
returns public.salary_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.payroll_lines;
  v_status public.payroll_status;
begin
  select * into v_line from public.payroll_lines where id = p_line_id for update;
  select pp.status into v_status from public.payroll_periods pp where pp.id = v_line.payroll_period_id;

  if v_line.id is null or not private.can_read_finance(v_line.center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_status = 'draft' then
    raise exception 'Validez la paie avant d''enregistrer les versements.' using errcode = '22023';
  end if;
  if v_line.paid_at is not null then
    raise exception 'Ce versement est déjà enregistré.' using errcode = '22023';
  end if;
  if v_line.final_amount < 0 then
    raise exception 'Montant final négatif : aucun versement possible.' using errcode = '22023';
  end if;
  if p_paid_at is null or p_method is null then
    raise exception 'Indiquez la date et le mode du versement.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_note, ''))) > 300 then
    raise exception 'Note : 300 caractères au plus.' using errcode = '22023';
  end if;

  update public.payroll_lines
  set paid_at = p_paid_at, payment_method = p_method, paid_by = (select auth.uid())
  where id = p_line_id;

  perform private.log_center_event(v_line.center_id, 'payroll.line_paid', v_line.id,
    jsonb_build_object('teacher_id', v_line.teacher_id, 'amount', v_line.final_amount, 'method', p_method));
  return private.issue_salary_receipt(p_line_id, p_note);
end;
$$;

-- ---------------------------------------------------------------------
-- Annulation (admin) : reçu négatif lié, ligne de paie de nouveau à verser
-- ---------------------------------------------------------------------
create function public.cancel_salary_payment(p_payment_id uuid, p_reason text)
returns public.salary_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.salary_payments;
  v_cancel public.salary_payments;
  v_year smallint := extract(year from private.local_time(now()))::smallint;
begin
  select * into v_original from public.salary_payments sp where sp.id = p_payment_id for update;
  if v_original.id is null or not private.can_read_finance(v_original.center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_original.kind <> 'payment' then
    raise exception 'Un reçu d''annulation ne s''annule pas.' using errcode = '22023';
  end if;
  if exists (select 1 from public.salary_payments sp where sp.cancels_payment_id = p_payment_id) then
    raise exception 'Ce reçu est déjà annulé.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez le motif de l''annulation.' using errcode = '22023';
  end if;
  if length(btrim(p_reason)) > 300 then
    raise exception 'Motif : 300 caractères au plus.' using errcode = '22023';
  end if;

  insert into public.salary_payments (
    center_id, payroll_line_id, member_id, kind, receipt_year, receipt_seq,
    paid_on, period_year, period_month, amount, payment_method, note,
    member_name, member_role, member_phone, center_snapshot, issued_by, issued_by_name,
    cancels_payment_id, cancel_reason
  )
  values (
    v_original.center_id, v_original.payroll_line_id, v_original.member_id, 'cancellation', v_year,
    private.next_salary_receipt_seq(v_original.center_id, v_year),
    v_original.paid_on, v_original.period_year, v_original.period_month, -v_original.amount,
    v_original.payment_method, null,
    v_original.member_name, v_original.member_role, v_original.member_phone, v_original.center_snapshot,
    (select auth.uid()), (select pr.full_name from public.profiles pr where pr.id = (select auth.uid())),
    v_original.id, btrim(p_reason)
  )
  returning * into v_cancel;

  -- La ligne de paie redevient « à verser » (la période repasse de « versée » à « validée »).
  update public.payroll_lines
  set paid_at = null, payment_method = null, paid_by = null
  where id = v_original.payroll_line_id;

  perform private.log_center_event(v_original.center_id, 'payroll.payment_cancelled', v_cancel.id,
    jsonb_build_object('receipt_number', v_original.receipt_number, 'amount', v_original.amount,
                       'member', v_original.member_name, 'reason', btrim(p_reason)));
  return v_cancel;
end;
$$;

-- Trace d'impression.
create function public.mark_salary_receipt_printed(p_payment_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.salary_payments set printed_at = now() where id = p_payment_id;
$$;

-- ---------------------------------------------------------------------
-- RLS : admin du centre uniquement, hors mode support
-- ---------------------------------------------------------------------
alter table public.salary_payments enable row level security;

create policy salary_payments_select_admin on public.salary_payments
for select to authenticated
using ((select private.can_read_finance(center_id)));

create policy salary_payments_update_admin on public.salary_payments
for update to authenticated
using ((select private.can_read_finance(center_id)))
with check ((select private.can_read_finance(center_id)));

create trigger deny_support_writes
before insert or update or delete on public.salary_payments
for each row execute function private.deny_support_writes();

revoke all on public.salary_payments from anon, authenticated;
grant select on public.salary_payments to authenticated;
grant update (pdf_url, whatsapp_sent_at, printed_at) on public.salary_payments to authenticated;

-- Module « finance ».
insert into private.module_resources (name, module_key, kind) values
  ('salary_payments', 'finance', 'table'),
  ('cancel_salary_payment', 'finance', 'function'),
  ('mark_salary_receipt_printed', 'finance', 'function');

create policy salary_payments_module on public.salary_payments
as restrictive for all to authenticated
using (private.center_has_module(center_id, 'finance'))
with check (private.center_has_module(center_id, 'finance'));

revoke all on function
  private.next_salary_receipt_seq(uuid, smallint),
  private.issue_salary_receipt(uuid, text, timestamptz, uuid)
from public, anon, authenticated;
revoke all on function
  public.payroll_mark_paid(uuid, date, public.payment_method, text),
  public.cancel_salary_payment(uuid, text),
  public.mark_salary_receipt_printed(uuid)
from public, anon;
grant execute on function
  public.payroll_mark_paid(uuid, date, public.payment_method, text),
  public.cancel_salary_payment(uuid, text),
  public.mark_salary_receipt_printed(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- PDF des reçus de paie : bucket privé « salary-receipts »,
-- {center_id}/{reçu}.pdf, déposé et signé par le serveur uniquement
-- (aucune policy : ni l'assistant ni un professeur ne peuvent le lire).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('salary-receipts', 'salary-receipts', false, 1048576, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Versements déjà enregistrés : un reçu chacun, à leur date (midi, heure
-- locale), numérotés dans l'ordre des dates de versement.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select pl.id, pl.paid_at, pl.paid_by
    from public.payroll_lines pl
    where pl.paid_at is not null
      and not exists (select 1 from public.salary_payments sp where sp.payroll_line_id = pl.id)
    order by pl.center_id, pl.paid_at, pl.teacher_name, pl.id
  loop
    perform private.issue_salary_receipt(r.id, null, private.local_to_utc(r.paid_at + time '12:00'), r.paid_by);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Export des données du centre : onglet « Reçus de paie », rôle du membre
-- dans l'onglet « Paie ».
-- ---------------------------------------------------------------------
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
        'Membre', pl.teacher_name,
        'Rôle', private.export_label('role', pl.member_role::text),
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

    'recus_paie', json_build_object('title', 'Reçus de paie', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Numéro', sp.receipt_number,
        'Type', private.export_label('receipt', sp.kind::text),
        'Émis le', to_char(private.local_time(sp.issued_at), 'YYYY-MM-DD HH24:MI'),
        'Versé le', sp.paid_on,
        'Année', sp.period_year,
        'Mois', sp.period_month,
        'Membre', sp.member_name,
        'Rôle', private.export_label('role', sp.member_role::text),
        'Montant (MAD)', sp.amount,
        'Mode de paiement', private.export_label('method', sp.payment_method::text),
        'Note', sp.note,
        'Annule le reçu', (select o.receipt_number from public.salary_payments o where o.id = sp.cancels_payment_id),
        'Motif de l''annulation', sp.cancel_reason,
        'Émis par', sp.issued_by_name
      ) order by sp.issued_at, sp.receipt_year, sp.receipt_seq), '[]'::json)
      from public.salary_payments sp
      where sp.center_id = c and sp.paid_on between f and t)),

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
