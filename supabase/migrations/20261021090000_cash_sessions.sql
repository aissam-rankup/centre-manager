-- =====================================================================
-- CentroManager — 041 : caisse journalière (page 8, phase 6)
--
--  * Ouverture : la session du jour s'ouvre au premier encaissement (ou à
--    la demande) avec le fonds de caisse ; une session commune par centre,
--    ou une par personne de l'accueil selon le réglage du centre. Après une
--    clôture, l'encaissement suivant ouvre une nouvelle session.
--  * Chaque encaissement (reçu) est rattaché à la session ouverte au moment
--    où il est saisi ; une annulation de reçu va dans la session du jour de
--    l'admin (remboursement en espèces s'il s'agissait d'espèces).
--  * Mouvements d'espèces hors encaissement (dépôt en banque, remboursement,
--    ajustement du fonds ; charge et paie pour l'admin) : datés, motivés.
--  * Clôture : total par mode, espèces théoriques (fonds + espèces encaissées
--    + mouvements), montant compté, écart ; un écart non nul exige un motif ;
--    au-delà du seuil du centre, l'admin est alerté. Clôturée, la session ne
--    change plus.
--  * Une facture ne se marque plus « réglée » par une écriture directe :
--    tout encaissement passe par l'écran de paiement (reçu et caisse).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Session du jour de l'utilisateur
-- ---------------------------------------------------------------------
-- La session commune du centre, ou la sienne (réglage « une par
-- personne ») ; ouverte si besoin avec ce fonds de caisse. Verrou partagé :
-- une clôture en cours attend la fin de l'opération.
create function private.open_cash_session_for(p_center_id uuid, p_user uuid, p_float numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shared boolean;
  v_today date := private.today();
  v_id uuid;
begin
  select not c.cash_session_per_assistant into v_shared from public.centers c where c.id = p_center_id;
  select cs.id into v_id
  from public.cash_sessions cs
  where cs.center_id = p_center_id and cs.status = 'open' and cs.session_date = v_today
    and case when v_shared then cs.is_shared else not cs.is_shared and cs.assistant_id = p_user end
  for share;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.cash_sessions (center_id, session_date, is_shared, assistant_id, opened_by, opening_float)
    values (p_center_id, v_today, v_shared, case when v_shared then null else p_user end, p_user, coalesce(p_float, 0))
    returning id into v_id;
  exception when unique_violation then
    -- Ouverte au même instant par quelqu'un d'autre : on la rejoint.
    select cs.id into v_id
    from public.cash_sessions cs
    where cs.center_id = p_center_id and cs.status = 'open' and cs.session_date = v_today
      and case when v_shared then cs.is_shared else not cs.is_shared and cs.assistant_id = p_user end
    for share;
    return v_id;
  end;

  perform private.log_center_event(p_center_id, 'cash_session.opened', v_id,
    jsonb_build_object('opening_float', coalesce(p_float, 0), 'shared', v_shared, 'session_date', v_today));
  return v_id;
end;
$$;

-- Ouvrir la caisse (accueil et admin) ; déjà ouverte : la même session.
create function public.open_cash_session(p_opening_float numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not (select private.is_staff()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_opening_float is null or p_opening_float < 0 or p_opening_float > 99999999.99
     or p_opening_float <> round(p_opening_float, 2) then
    raise exception 'Fonds de caisse : un montant positif, au centime près.' using errcode = '22023';
  end if;
  return private.open_cash_session_for((select private.auth_center_id()), (select auth.uid()), p_opening_float);
end;
$$;

-- Accès à une session : l'admin du centre (hors support), l'accueil pour la
-- session commune ou la sienne (mêmes règles que la lecture).
create function private.can_use_cash_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cash_sessions cs
    where cs.id = p_session_id
      and cs.center_id = (select private.auth_center_id())
      and ((select private.can_read_finance(cs.center_id))
           or ((select private.auth_role()) = 'assistant' and (cs.is_shared or cs.assistant_id = (select auth.uid()))))
  );
$$;

-- ---------------------------------------------------------------------
-- Encaissement : le reçu porte sa session de caisse
-- ---------------------------------------------------------------------
drop function private.issue_receipt(uuid[], timestamptz, uuid);

create function private.issue_receipt(
  p_invoice_ids uuid[],
  p_issued_at timestamptz default now(),
  p_issued_by uuid default auth.uid(),
  p_cash_session_id uuid default null
)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_center public.centers;
  v_receipt public.receipts;
  v_lines jsonb;
  v_method public.payment_method;
  v_year smallint := extract(year from p_issued_at at time zone 'Africa/Casablanca')::smallint;
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
$$;

revoke all on function private.issue_receipt(uuid[], timestamptz, uuid, uuid) from public, anon, authenticated;

create or replace function public.record_payment(p_student_id uuid, p_invoice_ids uuid[], p_method public.payment_method)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_found integer;
  v_session uuid;
begin
  if not private.is_staff() or private.student_center_id(p_student_id) is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_invoice_ids) as x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Choisissez au moins une facture.' using errcode = '22023';
  end if;

  -- Verrou : deux encaissements simultanés de la même facture sont impossibles.
  select count(*) into v_found
  from (
    select 1 from public.invoices i
    where i.id = any (v_ids) and i.student_id = p_student_id and i.status <> 'paid'
    for update
  ) as locked;
  if v_found <> array_length(v_ids, 1) then
    raise exception 'Facture introuvable ou déjà payée.' using errcode = 'P0002';
  end if;

  -- Session du jour (ouverte avec un fonds nul si personne ne l'a ouverte).
  v_session := private.open_cash_session_for(private.auth_center_id(), (select auth.uid()), 0);

  update public.invoices
  set status = 'paid',
      amount_paid = amount_due,
      paid_at = now(),
      paid_by = (select auth.uid()),
      payment_method = p_method
  where id = any (v_ids);

  return private.issue_receipt(v_ids, now(), (select auth.uid()), v_session);
end;
$$;

-- Annulation : l'opération du jour va dans la session de l'admin.
create or replace function public.cancel_receipt(p_receipt_id uuid, p_reason text)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.receipts;
  v_cancel public.receipts;
  v_year smallint := extract(year from now() at time zone 'Africa/Casablanca')::smallint;
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
$$;

-- ---------------------------------------------------------------------
-- Mouvements d'espèces (hors encaissement)
-- ---------------------------------------------------------------------
-- Montant saisi positif ; une sortie est enregistrée négative. Ajustement du
-- fonds : signé (ajout ou retrait). Charge et paie : admin seulement.
create function public.record_cash_movement(p_kind public.cash_movement_kind, p_amount numeric, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := (select private.auth_center_id());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_amount numeric;
  v_session uuid;
  v_id uuid;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not (select private.is_staff()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_kind = 'correction' then
    raise exception 'Une correction porte sur une session clôturée (vue admin).' using errcode = '22023';
  end if;
  if p_kind in ('expense', 'teacher_pay') and not (select private.can_read_finance(v_center_id)) then
    raise exception 'Charges et paie : réservées à l''admin.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 99999999.99 or p_amount <> round(p_amount, 2)
     or (p_kind <> 'float_change' and p_amount < 0) then
    raise exception 'Montant : un nombre au centime près, différent de zéro.' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) > 300 then
    raise exception 'Indiquez le motif (300 caractères au plus).' using errcode = '22023';
  end if;

  v_amount := case when p_kind = 'float_change' then p_amount else -p_amount end;
  v_session := private.open_cash_session_for(v_center_id, (select auth.uid()), 0);

  insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason, created_by)
  values (v_center_id, v_session, p_kind, v_amount, v_reason, (select auth.uid()))
  returning id into v_id;

  perform private.log_center_event(v_center_id, 'cash_movement.recorded', v_id,
    jsonb_build_object('cash_session_id', v_session, 'kind', p_kind, 'amount', v_amount, 'reason', v_reason));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Totaux d'une session
-- ---------------------------------------------------------------------
create function private.cash_session_totals(p_session_id uuid)
returns table (by_method jsonb, transactions integer, cash_receipts numeric, movements numeric, expected_cash numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select
      coalesce(sum(rc.amount_paid) filter (where rc.payment_method = 'cash'), 0) as cash,
      coalesce(sum(rc.amount_paid) filter (where rc.payment_method = 'bank_transfer'), 0) as bank_transfer,
      coalesce(sum(rc.amount_paid) filter (where rc.payment_method = 'card'), 0) as card,
      coalesce(sum(rc.amount_paid) filter (where rc.payment_method = 'cheque'), 0) as cheque,
      count(*)::integer as transactions
    from public.receipts rc
    where rc.cash_session_id = p_session_id
  ),
  m as (
    select coalesce(sum(cm.amount), 0) as total from public.cash_movements cm where cm.cash_session_id = p_session_id
  )
  select jsonb_build_object('cash', r.cash, 'bank_transfer', r.bank_transfer, 'card', r.card, 'cheque', r.cheque),
         r.transactions,
         r.cash,
         m.total,
         cs.opening_float + r.cash + m.total
  from r, m, public.cash_sessions cs
  where cs.id = p_session_id;
$$;

-- ---------------------------------------------------------------------
-- Clôture : comptage, écart, motif ; alerte de l'admin au-delà du seuil
-- ---------------------------------------------------------------------
create function public.close_cash_session(
  p_session_id uuid,
  p_counted numeric,
  p_reason text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_totals record;
  v_variance numeric;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_threshold numeric;
  v_result jsonb;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not private.can_use_cash_session(p_session_id) then
    raise exception 'Session de caisse introuvable.' using errcode = '42501';
  end if;
  select * into v_session from public.cash_sessions cs where cs.id = p_session_id for update;
  if v_session.status <> 'open' then
    raise exception 'Cette session est déjà clôturée.' using errcode = '22023';
  end if;
  if p_counted is null or p_counted < 0 or p_counted > 9999999999.99 or p_counted <> round(p_counted, 2) then
    raise exception 'Montant compté : un montant positif, au centime près.' using errcode = '22023';
  end if;

  select * into v_totals from private.cash_session_totals(p_session_id);
  v_variance := p_counted - v_totals.expected_cash;
  if v_variance <> 0 and v_reason is null then
    raise exception 'Écart de caisse : indiquez le motif avant de clôturer.' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'Motif : 500 caractères au plus.' using errcode = '22023';
  end if;
  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'Notes : 1 000 caractères au plus.' using errcode = '22023';
  end if;

  update public.cash_sessions cs
  set status = 'closed', closed_at = now(), closed_by = (select auth.uid()),
      expected_cash = v_totals.expected_cash, counted_cash = p_counted, variance = v_variance,
      expected_by_method = v_totals.by_method,
      variance_reason = case when v_variance <> 0 then v_reason end,
      notes = v_notes
  where cs.id = p_session_id;

  v_result := jsonb_build_object(
    'session_date', v_session.session_date, 'opening_float', v_session.opening_float,
    'expected_cash', v_totals.expected_cash, 'counted_cash', p_counted, 'variance', v_variance,
    'by_method', v_totals.by_method, 'transactions', v_totals.transactions, 'movements', v_totals.movements);
  perform private.log_center_event(v_session.center_id, 'cash_session.closed', p_session_id, v_result);

  select c.cash_variance_alert_threshold into v_threshold from public.centers c where c.id = v_session.center_id;
  if abs(v_variance) > v_threshold then
    perform private.log_center_event(v_session.center_id, 'cash_session.variance_alert', p_session_id,
      jsonb_build_object('variance', v_variance, 'threshold', v_threshold, 'reason', v_reason));
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Détail d'une session : écran de clôture et historique
-- ---------------------------------------------------------------------
-- Totaux complets (paie et charges comprises) ; le détail des mouvements de
-- paie et de charges n'est montré qu'à l'admin.
create function public.cash_session_summary(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_totals record;
  v_finance boolean;
  v_result jsonb;
begin
  if not private.can_use_cash_session(p_session_id) then
    raise exception 'Session de caisse introuvable.' using errcode = '42501';
  end if;
  select * into v_session from public.cash_sessions cs where cs.id = p_session_id;
  select * into v_totals from private.cash_session_totals(p_session_id);
  v_finance := (select private.can_read_finance(v_session.center_id));

  select jsonb_build_object(
    'id', v_session.id,
    'session_date', v_session.session_date,
    'status', v_session.status,
    'is_shared', v_session.is_shared,
    'holder_name', (select p.full_name from public.profiles p where p.id = v_session.assistant_id),
    'opened_at', v_session.opened_at,
    'opened_by_name', (select p.full_name from public.profiles p where p.id = v_session.opened_by),
    'opening_float', v_session.opening_float,
    'closed_at', v_session.closed_at,
    'closed_by_name', (select p.full_name from public.profiles p where p.id = v_session.closed_by),
    'validated_at', v_session.validated_at,
    'validated_by_name', (select p.full_name from public.profiles p where p.id = v_session.validated_by),
    'counted_cash', v_session.counted_cash,
    'variance', v_session.variance,
    'variance_reason', v_session.variance_reason,
    'notes', v_session.notes,
    -- Clôturée : les chiffres figés à la clôture ; ouverte : ceux du moment.
    'expected_cash', coalesce(v_session.expected_cash, v_totals.expected_cash),
    'by_method', coalesce(v_session.expected_by_method, v_totals.by_method),
    'transactions', v_totals.transactions,
    'movements_total', v_totals.movements,
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', rc.id, 'number', rc.receipt_number, 'kind', rc.kind, 'student_id', rc.student_id,
               'student_name', rc.student_name, 'amount', rc.amount_paid, 'method', rc.payment_method,
               'issued_at', rc.issued_at, 'issued_by_name', rc.issued_by_name)
             order by rc.issued_at)
      from public.receipts rc where rc.cash_session_id = p_session_id
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cm.id, 'kind', cm.kind, 'amount', cm.amount,
               'reason', case when v_finance or cm.kind not in ('expense', 'teacher_pay') then cm.reason end,
               'created_at', cm.created_at,
               'created_by_name', (select p.full_name from public.profiles p where p.id = cm.created_by),
               'corrects_session_id', cm.corrects_session_id)
             order by cm.created_at)
      from public.cash_movements cm where cm.cash_session_id = p_session_id
    ), '[]'::jsonb)
  )
  into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Une facture ne se marque plus « réglée » par une écriture directe
-- ---------------------------------------------------------------------
create function private.invoices_payment_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and ((new.status is distinct from old.status and 'paid' in (new.status, old.status))
          or new.amount_paid is distinct from old.amount_paid
          or new.paid_at is distinct from old.paid_at
          or new.paid_by is distinct from old.paid_by
          or new.payment_method is distinct from old.payment_method
          or new.receipt_id is distinct from old.receipt_id) then
    raise exception 'Un encaissement passe par l''écran de paiement (reçu et caisse).' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger invoices_payment_guard
before update on public.invoices
for each row execute function private.invoices_payment_guard();

revoke all on function private.open_cash_session_for(uuid, uuid, numeric),
  private.can_use_cash_session(uuid),
  private.cash_session_totals(uuid),
  private.invoices_payment_guard()
from public, anon, authenticated;
revoke all on function public.open_cash_session(numeric),
  public.record_cash_movement(public.cash_movement_kind, numeric, text),
  public.close_cash_session(uuid, numeric, text, text),
  public.cash_session_summary(uuid)
from public, anon;
grant execute on function public.open_cash_session(numeric),
  public.record_cash_movement(public.cash_movement_kind, numeric, text),
  public.close_cash_session(uuid, numeric, text, text),
  public.cash_session_summary(uuid)
to authenticated;
