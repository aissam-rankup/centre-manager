-- =====================================================================
-- CentroManager — 046 : vue admin de la caisse, corrections de la revue
-- (page 8, phase 7)
--
--  * La note de validation de l'admin ne remplace plus la note laissée à
--    la clôture : elle a sa propre colonne (et figure au journal).
--  * Correction et validation simultanées : la correction attend la
--    validation et la refuse (session verrouillée), jamais l'inverse.
--  * La session corrigée montre les corrections qui la visent ; une
--    correction indique la date de la session qu'elle corrige.
--  * Écarts par personne : triés par le total des manquants et des
--    excédents (ils ne se compensent pas).
-- =====================================================================

alter table public.cash_sessions
  add column validation_notes text check (validation_notes is null or length(validation_notes) <= 1000);

-- Clôturée : seule la décision de l'admin (statut, date, auteur, note de
-- validation) s'ajoute ; la note de clôture reste celle de la personne qui a compté.
create or replace function private.cash_sessions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actors text[] := array['assistant_id', 'opened_by', 'closed_by', 'validated_by'];
  v_actor text;
begin
  if old.status = 'open' then
    if new.status not in ('open', 'closed') or new.validation_notes is not null then
      raise exception 'Session de caisse : la validation suit la clôture.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status = 'closed' and new.status = 'validated' then
    if new.validated_by is not null
       and (to_jsonb(new) - array['status', 'validated_at', 'validated_by', 'validation_notes'])
           = (to_jsonb(old) - array['status', 'validated_at', 'validated_by', 'validation_notes']) then
      return new;
    end if;
    raise exception 'Validation : seule la décision de l''admin s''ajoute à la session.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_actors) is distinct from (to_jsonb(old) - v_actors) then
    raise exception 'Session de caisse clôturée : elle ne se modifie plus.' using errcode = '42501';
  end if;
  foreach v_actor in array v_actors loop
    if (to_jsonb(new) ->> v_actor) is distinct from (to_jsonb(old) ->> v_actor) and (to_jsonb(new) ->> v_actor) is not null then
      raise exception 'Session de caisse clôturée : elle ne se modifie plus.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.validate_cash_session(p_session_id uuid, p_notes text default null)
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
  set status = 'validated', validated_at = now(), validated_by = (select auth.uid()), validation_notes = v_notes
  where cs.id = p_session_id;

  perform private.log_center_event(v_session.center_id, 'cash_session.validated', p_session_id,
    jsonb_build_object('session_date', v_session.session_date, 'variance', v_session.variance, 'notes', v_notes));
end;
$$;

-- La session corrigée est lue verrouillée : une validation en cours passe
-- d'abord, puis la correction est refusée.
create or replace function public.record_cash_correction(p_session_id uuid, p_amount numeric, p_reason text)
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
  select * into v_session from public.cash_sessions cs where cs.id = p_session_id for share;
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

-- Une correction ne vise qu'une session clôturée, pas encore validée.
create or replace function private.cash_session_must_be_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cash_session_id is not null then
    perform 1 from public.cash_sessions cs
    where cs.id = new.cash_session_id and cs.center_id = new.center_id and cs.status = 'open'
    for share;
    if not found then
      raise exception 'Session de caisse clôturée : l''opération va dans la session du jour.' using errcode = '42501';
    end if;
  end if;
  if tg_table_name = 'cash_movements' and (to_jsonb(new) ->> 'corrects_session_id') is not null then
    perform 1 from public.cash_sessions cs
    where cs.id = (to_jsonb(new) ->> 'corrects_session_id')::uuid and cs.center_id = new.center_id and cs.status = 'closed'
    for share;
    if not found then
      raise exception 'Une correction porte sur une session clôturée, pas encore validée.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Détail d'une session : note de validation, corrections qui la visent
-- (admin), date de la session corrigée sur chaque correction.
create or replace function public.cash_session_summary(p_session_id uuid)
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
    'validation_notes', v_session.validation_notes,
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
             order by rc.issued_at, rc.receipt_seq)
      from public.receipts rc where rc.cash_session_id = p_session_id
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cm.id, 'kind', cm.kind, 'amount', cm.amount,
               'reason', case when v_finance or cm.kind not in ('expense', 'teacher_pay') then cm.reason end,
               'created_at', cm.created_at,
               'created_by_name', (select p.full_name from public.profiles p where p.id = cm.created_by),
               'corrects_session_id', cm.corrects_session_id,
               'corrected_session_date', (select s.session_date from public.cash_sessions s where s.id = cm.corrects_session_id))
             order by cm.created_at, cm.id)
      from public.cash_movements cm where cm.cash_session_id = p_session_id
    ), '[]'::jsonb),
    'corrections', case when v_finance then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cm.id, 'amount', cm.amount, 'reason', cm.reason, 'created_at', cm.created_at,
               'created_by_name', (select p.full_name from public.profiles p where p.id = cm.created_by),
               'cash_session_id', cm.cash_session_id,
               'session_date', (select s.session_date from public.cash_sessions s where s.id = cm.cash_session_id))
             order by cm.created_at, cm.id)
      from public.cash_movements cm where cm.corrects_session_id = p_session_id
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  into v_result;
  return v_result;
end;
$$;

-- Écarts par personne : la plus grande somme de manquants et d'excédents d'abord.
create or replace function public.cash_month_overview(p_month date default private.today())
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
             order by (pp.surplus - pp.shortage) desc, (pp.short_count + pp.surplus_count) desc, pp.full_name)
      from per_person pp
    ), '[]'::jsonb)
  )
  into v_result;
  return v_result;
end;
$$;
