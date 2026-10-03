-- =====================================================================
-- CentroManager — 043 : vue admin de la caisse (page 8, phase 7)
--
--  * Historique des sessions (admin, hors mode support) : date, titulaire,
--    total encaissé, attendu, compté, écart, motif, statut.
--  * Validation d'une session clôturée par l'admin : elle est verrouillée
--    définitivement.
--  * Correction après clôture : une opération datée du jour, dans la caisse
--    du jour de l'admin, liée à la session corrigée, motivée et signée ;
--    jamais sur une session validée.
--  * Clôture refusée si un encaissement ou un mouvement est arrivé depuis
--    l'affichage (l'écart confirmé est celui enregistré).
--  * Indicateurs du mois : cumul des écarts (manquants, excédents, solde),
--    part des sessions clôturées sans écart, écarts par personne ; sessions
--    restées ouvertes un jour précédent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Validation (admin)
-- ---------------------------------------------------------------------
create function public.validate_cash_session(p_session_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cash_sessions cs where cs.id = p_session_id and (select private.can_read_finance(cs.center_id))
  ) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;
  select * into v_session from public.cash_sessions cs where cs.id = p_session_id for update;
  if v_session.status <> 'closed' then
    raise exception 'Seule une session clôturée, pas encore validée, se valide.' using errcode = '22023';
  end if;
  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'Notes : 1 000 caractères au plus.' using errcode = '22023';
  end if;

  update public.cash_sessions cs
  set status = 'validated', validated_at = now(), validated_by = (select auth.uid()),
      notes = coalesce(v_notes, cs.notes)
  where cs.id = p_session_id;

  perform private.log_center_event(v_session.center_id, 'cash_session.validated', p_session_id,
    jsonb_build_object('session_date', v_session.session_date, 'variance', v_session.variance));
end;
$$;

-- ---------------------------------------------------------------------
-- Correction après clôture (admin) : opération du jour, liée et motivée
-- ---------------------------------------------------------------------
-- Montant signé : positif quand de l'argent revient au tiroir (billet
-- retrouvé), négatif quand il en sort.
create function public.record_cash_correction(p_session_id uuid, p_amount numeric, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_today_session uuid;
  v_id uuid;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cash_sessions cs where cs.id = p_session_id and (select private.can_read_finance(cs.center_id))
  ) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;
  select * into v_session from public.cash_sessions cs where cs.id = p_session_id;
  if v_session.status = 'open' then
    raise exception 'Session encore ouverte : enregistrez un mouvement de caisse.' using errcode = '22023';
  end if;
  if v_session.status = 'validated' then
    raise exception 'Session validée : elle est verrouillée définitivement.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 99999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'Montant : un nombre au centime près, différent de zéro.' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) > 300 then
    raise exception 'Indiquez le motif (300 caractères au plus).' using errcode = '22023';
  end if;

  v_today_session := private.open_cash_session_for(v_session.center_id, (select auth.uid()), 0);
  insert into public.cash_movements (center_id, cash_session_id, kind, amount, reason, corrects_session_id, created_by)
  values (v_session.center_id, v_today_session, 'correction', p_amount, v_reason, p_session_id, (select auth.uid()))
  returning id into v_id;

  perform private.log_center_event(v_session.center_id, 'cash_session.corrected', p_session_id,
    jsonb_build_object('movement_id', v_id, 'amount', p_amount, 'reason', v_reason, 'cash_session_id', v_today_session));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Historique (admin, hors support)
-- ---------------------------------------------------------------------
create function public.cash_session_history(p_from date, p_to date)
returns table (
  id uuid,
  session_date date,
  status public.cash_session_status,
  is_shared boolean,
  holder_name text,
  opened_by_name text,
  closed_by_name text,
  validated_by_name text,
  opened_at timestamptz,
  closed_at timestamptz,
  total_collected numeric,
  cash_collected numeric,
  transactions integer,
  expected_cash numeric,
  counted_cash numeric,
  variance numeric,
  variance_reason text,
  corrections numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_center_id uuid := (select private.auth_center_id());
begin
  if not (select private.can_read_finance(v_center_id)) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;
  return query
  select cs.id, cs.session_date, cs.status, cs.is_shared,
         holder.full_name, opener.full_name, closer.full_name, validator.full_name,
         cs.opened_at, cs.closed_at,
         coalesce(r.total, 0), coalesce(r.cash, 0), coalesce(r.n, 0),
         coalesce(cs.expected_cash, t.expected_cash), cs.counted_cash, cs.variance, cs.variance_reason,
         coalesce(c.total, 0)
  from public.cash_sessions cs
  left join public.profiles holder on holder.id = cs.assistant_id
  left join public.profiles opener on opener.id = cs.opened_by
  left join public.profiles closer on closer.id = cs.closed_by
  left join public.profiles validator on validator.id = cs.validated_by
  left join lateral (
    select sum(rc.amount_paid) as total,
           sum(rc.amount_paid) filter (where rc.payment_method = 'cash') as cash,
           count(*)::integer as n
    from public.receipts rc where rc.cash_session_id = cs.id
  ) r on true
  left join lateral (select sum(cm.amount) as total from public.cash_movements cm where cm.corrects_session_id = cs.id) c on true
  left join lateral (select tt.expected_cash from private.cash_session_totals(cs.id) tt) t on true
  where cs.center_id = v_center_id
    and (cs.session_date between p_from and p_to or (cs.status = 'open' and cs.session_date < p_from))
  order by cs.session_date desc, cs.opened_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Indicateurs du mois (admin, hors support)
-- ---------------------------------------------------------------------
-- Écarts des sessions clôturées ou validées du mois : manquants et
-- excédents séparés (ils ne se compensent pas), solde, part sans écart, et
-- par personne (titulaire de la caisse, sinon celle qui l'a clôturée) pour
-- repérer des écarts répétés dans le même sens.
create function public.cash_month_overview(p_month date default private.today())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := (select private.auth_center_id());
  v_from date := date_trunc('month', p_month::timestamp)::date;
  v_to date := (date_trunc('month', p_month::timestamp) + interval '1 month' - interval '1 day')::date;
  v_result jsonb;
begin
  if not (select private.can_read_finance(v_center_id)) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;

  with closed as (
    select cs.*, coalesce(cs.assistant_id, cs.closed_by) as person_id
    from public.cash_sessions cs
    where cs.center_id = v_center_id and cs.status in ('closed', 'validated')
      and cs.session_date between v_from and v_to
  ),
  per_person as (
    select c.person_id, p.full_name,
           count(*)::integer as sessions,
           count(*) filter (where c.variance = 0)::integer as exact,
           count(*) filter (where c.variance < 0)::integer as short_count,
           count(*) filter (where c.variance > 0)::integer as surplus_count,
           coalesce(sum(c.variance) filter (where c.variance < 0), 0) as shortage,
           coalesce(sum(c.variance) filter (where c.variance > 0), 0) as surplus,
           coalesce(sum(c.variance), 0) as net
    from closed c
    left join public.profiles p on p.id = c.person_id
    group by c.person_id, p.full_name
  )
  select jsonb_build_object(
    'month_start', v_from,
    'sessions', (select count(*) from closed),
    'exact', (select count(*) from closed where variance = 0),
    'validated', (select count(*) from closed where status = 'validated'),
    'shortage', coalesce((select sum(variance) from closed where variance < 0), 0),
    'surplus', coalesce((select sum(variance) from closed where variance > 0), 0),
    'net', coalesce((select sum(variance) from closed), 0),
    'collected', coalesce((
      select sum(rc.amount_paid) from public.receipts rc
      join public.cash_sessions cs on cs.id = rc.cash_session_id
      where cs.center_id = v_center_id and cs.session_date between v_from and v_to
    ), 0),
    'stale_open', (
      select count(*) from public.cash_sessions cs
      where cs.center_id = v_center_id and cs.status = 'open' and cs.session_date < private.today()
    ),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', pp.full_name, 'sessions', pp.sessions, 'exact', pp.exact,
               'short_count', pp.short_count, 'surplus_count', pp.surplus_count,
               'shortage', pp.shortage, 'surplus', pp.surplus, 'net', pp.net)
             order by abs(pp.net) desc, pp.full_name)
      from per_person pp
    ), '[]'::jsonb)
  )
  into v_result;
  return v_result;
end;
$$;

-- Tableau de bord : caisses d'un jour précédent restées ouvertes (admin).
create function public.stale_cash_sessions()
returns table (id uuid, session_date date, is_shared boolean, holder_name text, opened_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_center_id uuid := (select private.auth_center_id());
begin
  if not (select private.can_read_finance(v_center_id)) then
    return;
  end if;
  return query
  select cs.id, cs.session_date, cs.is_shared, holder.full_name, opener.full_name
  from public.cash_sessions cs
  left join public.profiles holder on holder.id = cs.assistant_id
  left join public.profiles opener on opener.id = cs.opened_by
  where cs.center_id = v_center_id and cs.status = 'open' and cs.session_date < private.today()
  order by cs.session_date;
end;
$$;

revoke all on function public.validate_cash_session(uuid, text),
  public.record_cash_correction(uuid, numeric, text),
  public.cash_session_history(date, date),
  public.cash_month_overview(date),
  public.stale_cash_sessions()
from public, anon;
grant execute on function public.validate_cash_session(uuid, text),
  public.record_cash_correction(uuid, numeric, text),
  public.cash_session_history(date, date),
  public.cash_month_overview(date),
  public.stale_cash_sessions()
to authenticated;

-- ---------------------------------------------------------------------
-- Clôture : refusée si les chiffres ont changé depuis l'affichage
-- ---------------------------------------------------------------------
drop function public.close_cash_session(uuid, numeric, text, text);

create function public.close_cash_session(
  p_session_id uuid,
  p_counted numeric,
  p_reason text default null,
  p_notes text default null,
  p_expected numeric default null
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
  -- Un encaissement ou un mouvement arrivé depuis l'affichage : l'écart vu ne vaut plus.
  if p_expected is not null and p_expected <> v_totals.expected_cash then
    raise exception 'Les chiffres de la caisse ont changé depuis l''affichage : vérifiez avant de clôturer.' using errcode = '22023';
  end if;
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

revoke all on function public.close_cash_session(uuid, numeric, text, text, numeric) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric, text, text, numeric) to authenticated;
