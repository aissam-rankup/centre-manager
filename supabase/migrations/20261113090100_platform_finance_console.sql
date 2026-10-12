-- =====================================================================
-- Console de la plateforme : revenus, état de paiement des centres,
-- journal des actions
--
--  * journal : adresse IP de la personne (transmise par le serveur dans
--    l'en-tête x-dirassty-client-ip, nulle sinon) ;
--  * paiements d'abonnement : note libre et pack du centre au moment du
--    paiement (le revenu par pack reste juste après un changement de pack) ;
--  * revenu mensuel récurrent : relevé quotidien (variation sur un mois) ;
--  * revenus d'une période et de la période précédente : mois, trimestre,
--    année ou dates choisies. Période en cours : comparée à la même date
--    de la période précédente (du 1er au 12 octobre / du 1er au 12
--    septembre) ; période close : comparée à la période précédente entière ;
--  * état de paiement de chaque centre : dernier paiement, montant dû,
--    jours de retard, élèves actifs ;
--  * journal filtrable (centre, type d'action, dates).
--
-- Seuls les paiements enregistrés (encaissés) comptent : aucune facture,
-- aucune prévision n'entre dans les revenus. Toutes les fonctions publiques
-- exigent un super-admin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Journal : adresse IP
-- ---------------------------------------------------------------------
alter table public.platform_events add column ip_address inet;

-- Adresse de la personne, posée par le serveur de l'application dans un
-- en-tête de la requête PostgREST ; nulle si absente ou invalide.
create function private.request_client_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  v_value text;
begin
  v_value := nullif(btrim(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-dirassty-client-ip', '')), '');
  return v_value::inet;
exception when others then
  return null;
end;
$$;

revoke all on function private.request_client_ip() from public, anon, authenticated;

create or replace function private.log_platform_event(p_center_id uuid, p_action text, p_payload jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(current_setting('centromanager.reason', true), '')), '');
  v_payload jsonb := coalesce(p_payload, '{}');
begin
  if v_reason is not null and p_action in ('center.status_changed', 'center.period_changed') then
    v_payload := v_payload || jsonb_build_object('reason', v_reason);
  end if;
  insert into public.platform_events (actor_id, center_id, action, payload, ip_address)
  values ((select auth.uid()), p_center_id, p_action, v_payload, private.request_client_ip());
end;
$$;

revoke all on function private.log_platform_event(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Paiements d'abonnement : note et pack
-- ---------------------------------------------------------------------
alter table public.subscription_payments
  add column note text check (note is null or length(note) <= 500),
  add column plan_key text references public.plans (key) on update cascade on delete restrict;

-- Paiements déjà enregistrés : pack actuel du centre (seule information connue).
alter table public.subscription_payments disable trigger subscription_payments_append_only;
update public.subscription_payments p
set plan_key = c.plan_key
from public.centers c
where c.id = p.center_id and p.plan_key is null;
alter table public.subscription_payments enable trigger subscription_payments_append_only;

alter table public.subscription_payments alter column plan_key set not null;

create index subscription_payments_plan_paid_idx on public.subscription_payments (plan_key, paid_at);

create or replace function private.subscription_payments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
begin
  select * into v_center from public.centers c where c.id = new.center_id for update;
  if v_center.status = 'cancelled' then
    raise exception 'Centre résilié : aucun paiement ne peut être enregistré.' using errcode = '22023';
  end if;

  new.period_covered_start := coalesce(new.period_covered_start, v_center.current_period_end, new.paid_at);
  new.period_covered_end := coalesce(new.period_covered_end, (new.period_covered_start
    + case v_center.billing_interval when 'year' then interval '1 year' else interval '1 month' end)::date);
  new.recorded_by := coalesce(new.recorded_by, (select auth.uid()));
  -- Pack du centre au moment du paiement (revenu par pack).
  new.plan_key := coalesce(new.plan_key, v_center.plan_key);
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Revenu mensuel récurrent : valeur du jour et relevé quotidien
-- ---------------------------------------------------------------------
-- Abonnements en service (actifs et en retard de paiement), ramenés au mois.
create function private.current_mrr()
returns table (mrr numeric, paying_centers integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(private.monthly_equivalent(c.price, c.billing_interval)), 0),
         count(*)::integer
  from public.centers c
  where c.status in ('active', 'past_due');
$$;

create table public.platform_mrr_snapshots (
  day date primary key,
  mrr numeric(12, 2) not null check (mrr >= 0),
  paying_centers integer not null check (paying_centers >= 0),
  recorded_at timestamptz not null default now()
);

comment on table public.platform_mrr_snapshots is
  'Revenu mensuel récurrent relevé chaque jour (variation du tableau de bord de la plateforme).';

alter table public.platform_mrr_snapshots enable row level security;
revoke all on public.platform_mrr_snapshots from anon, authenticated;

create function private.snapshot_platform_mrr(p_day date default private.today())
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_mrr_snapshots (day, mrr, paying_centers)
  select p_day, m.mrr, m.paying_centers from private.current_mrr() m
  on conflict (day) do update
    set mrr = excluded.mrr, paying_centers = excluded.paying_centers, recorded_at = now();
$$;

revoke all on function private.current_mrr(), private.snapshot_platform_mrr(date) from public, anon, authenticated;

-- Après le job quotidien (00 h 10 UTC) : statuts du jour déjà à jour.
select cron.schedule(
  'centromanager-platform-mrr',
  '40 0 * * *',
  $$select private.snapshot_platform_mrr()$$
);

-- Premier relevé.
select private.snapshot_platform_mrr();

-- ---------------------------------------------------------------------
-- Périodes
-- ---------------------------------------------------------------------
-- p_kind : month, quarter, year (période contenant p_anchor) ou custom
-- (p_start à p_end). Période en cours : arrêtée à aujourd'hui et comparée
-- à la même date de la période précédente ; période close : comparée à la
-- période précédente entière ; dates choisies : comparées aux jours qui
-- précèdent, en nombre égal.
create function private.revenue_period(
  p_kind text,
  p_anchor date,
  p_start date,
  p_end date,
  p_today date default private.today()
)
returns table (
  period_start date,
  period_end date,
  previous_start date,
  previous_end date,
  to_date boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_step interval;
  v_start date;
  v_full_end date;
begin
  if p_kind = 'custom' then
    if p_start is null or p_end is null or p_start > p_end then
      raise exception 'Période invalide.' using errcode = '22023';
    end if;
    if p_end - p_start > 3660 then
      raise exception 'Période trop longue (dix ans au plus).' using errcode = '22023';
    end if;
    period_start := p_start;
    period_end := p_end;
    previous_end := p_start - 1;
    previous_start := previous_end - (p_end - p_start);
    to_date := false;
    return next;
    return;
  end if;

  v_step := case p_kind
    when 'month' then interval '1 month'
    when 'quarter' then interval '3 months'
    when 'year' then interval '1 year'
  end;
  if v_step is null then
    raise exception 'Période inconnue.' using errcode = '22023';
  end if;

  v_start := date_trunc(p_kind, coalesce(p_anchor, p_today))::date;
  v_full_end := (v_start + v_step)::date - 1;
  period_start := v_start;
  previous_start := (v_start - v_step)::date;

  if p_today between v_start and v_full_end then
    period_end := p_today;
    -- Même date de la période précédente, sans la dépasser (31 mars → 28 février).
    previous_end := least((p_today - v_step)::date, v_start - 1);
    to_date := true;
  else
    period_end := v_full_end;
    previous_end := v_start - 1;
    to_date := false;
  end if;
  return next;
end;
$$;

revoke all on function private.revenue_period(text, date, date, date, date) from public, anon, authenticated;

create function private.collected_between(p_start date, p_end date)
returns table (amount numeric, payments integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(p.amount), 0), count(*)::integer
  from public.subscription_payments p
  where p.paid_at between p_start and p_end;
$$;

revoke all on function private.collected_between(date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Revenus : une période et la précédente
-- ---------------------------------------------------------------------
create function public.platform_revenue_summary(
  p_kind text,
  p_anchor date default null,
  p_start date default null,
  p_end date default null
)
returns table (
  period_start date,
  period_end date,
  previous_start date,
  previous_end date,
  to_date boolean,
  revenue numeric,
  payments_count integer,
  previous_revenue numeric,
  previous_payments_count integer,
  change_amount numeric,
  -- Nul si la période précédente n'a rien encaissé (pourcentage non défini).
  change_ratio numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select b.period_start, b.period_end, b.previous_start, b.previous_end, b.to_date,
         cur.amount, cur.payments, prev.amount, prev.payments,
         cur.amount - prev.amount,
         case when prev.amount > 0 then round((cur.amount - prev.amount) / prev.amount, 4) end
  from private.revenue_period(p_kind, p_anchor, p_start, p_end) b
  cross join lateral private.collected_between(b.period_start, b.period_end) cur
  cross join lateral private.collected_between(b.previous_start, b.previous_end) prev;
end;
$$;

-- Quatre indicateurs : mois, trimestre et année en cours, revenu mensuel
-- récurrent (comparé au relevé d'il y a un mois, nul s'il n'existe pas).
create function public.platform_revenue_kpis()
returns table (
  kind text,
  period_start date,
  period_end date,
  previous_start date,
  previous_end date,
  current_value numeric,
  previous_value numeric,
  change_amount numeric,
  change_ratio numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.today();
  v_mrr numeric;
  v_previous_day date;
  v_previous_mrr numeric;
begin
  perform private.require_super_admin();

  return query
  select k.kind, s.period_start, s.period_end, s.previous_start, s.previous_end,
         s.revenue, s.previous_revenue, s.change_amount, s.change_ratio
  from unnest(array['month', 'quarter', 'year']) with ordinality as k(kind, position)
  cross join lateral public.platform_revenue_summary(k.kind) s
  order by k.position;

  select m.mrr into v_mrr from private.current_mrr() m;
  select sn.day, sn.mrr into v_previous_day, v_previous_mrr
  from public.platform_mrr_snapshots sn
  where sn.day <= (v_today - interval '1 month')::date
  order by sn.day desc
  limit 1;

  kind := 'mrr';
  period_start := v_today;
  period_end := v_today;
  previous_start := v_previous_day;
  previous_end := v_previous_day;
  current_value := v_mrr;
  previous_value := v_previous_mrr;
  change_amount := v_mrr - v_previous_mrr;
  change_ratio := case when v_previous_mrr > 0 then round((v_mrr - v_previous_mrr) / v_previous_mrr, 4) end;
  return next;
end;
$$;

-- Répartition par pack : centres (hors résiliés) et revenu de la période.
create function public.platform_revenue_by_plan(p_start date, p_end date)
returns table (
  plan_key text,
  plan_name text,
  centers_count integer,
  paying_centers_count integer,
  revenue numeric,
  payments_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'Période invalide.' using errcode = '22023';
  end if;
  return query
  select pl.key, pl.name,
         (select count(*)::integer from public.centers c where c.plan_key = pl.key and c.status <> 'cancelled'),
         (select count(*)::integer from public.centers c where c.plan_key = pl.key and c.status in ('active', 'past_due')),
         coalesce((select sum(p.amount) from public.subscription_payments p
                   where p.plan_key = pl.key and p.paid_at between p_start and p_end), 0),
         (select count(*)::integer from public.subscription_payments p
           where p.plan_key = pl.key and p.paid_at between p_start and p_end)
  from public.plans pl
  order by pl.sort_order, pl.key;
end;
$$;

-- ---------------------------------------------------------------------
-- État de paiement des centres
-- ---------------------------------------------------------------------
-- Périodes commencées et non payées : l'échéance est la fin de la dernière
-- période payée ; chaque mois (ou année) entamé depuis est dû.
create function private.periods_due(p_period_end date, p_interval public.billing_interval, p_today date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_period_end is null or p_period_end > p_today then 0
    when p_interval = 'year' then extract(year from age(p_today, p_period_end))::integer + 1
    else (extract(year from age(p_today, p_period_end)) * 12 + extract(month from age(p_today, p_period_end)))::integer + 1
  end;
$$;

revoke all on function private.periods_due(date, public.billing_interval, date) from public, anon, authenticated;

create function public.platform_centers_billing()
returns table (
  center_id uuid,
  name text,
  slug text,
  plan_key text,
  plan_name text,
  status public.center_status,
  price numeric,
  billing_interval public.billing_interval,
  current_period_end date,
  days_overdue integer,
  periods_due integer,
  amount_due numeric,
  last_payment_at date,
  last_payment_amount numeric,
  active_students integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.today();
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.slug, c.plan_key, pl.name, c.status, c.price, c.billing_interval, c.current_period_end,
         case when c.status <> 'cancelled' and c.current_period_end < v_today then (v_today - c.current_period_end)::integer else 0 end,
         case when c.status <> 'cancelled' then private.periods_due(c.current_period_end, c.billing_interval, v_today) else 0 end,
         case when c.status <> 'cancelled'
              then private.periods_due(c.current_period_end, c.billing_interval, v_today) * coalesce(c.price, 0)
              else 0 end,
         lp.paid_at, lp.amount,
         -- Élève actif : au moins une inscription (matière ou pack) en cours.
         (select count(*)::integer from public.students st
           where st.center_id = c.id
             and (exists (select 1 from public.enrollments e where e.student_id = st.id and e.active)
                  or exists (select 1 from public.pack_enrollments pe where pe.student_id = st.id and pe.active))),
         c.created_at
  from public.centers c
  join public.plans pl on pl.key = c.plan_key
  left join lateral (
    select p.paid_at, p.amount from public.subscription_payments p
    where p.center_id = c.id
    order by p.paid_at desc, p.created_at desc
    limit 1
  ) lp on true
  order by c.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Paiement : mode, référence et note
-- ---------------------------------------------------------------------
drop function public.platform_record_payment(uuid, numeric, date, public.subscription_payment_method, text);

create function public.platform_record_payment(
  p_center_id uuid,
  p_amount numeric,
  p_paid_at date,
  p_method public.subscription_payment_method,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  perform private.require_super_admin();
  if p_paid_at > private.today() then
    raise exception 'La date de paiement ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Note trop longue (500 caractères au plus).' using errcode = '22023';
  end if;
  insert into public.subscription_payments (center_id, amount, paid_at, method, reference, note, recorded_by)
  values (p_center_id, p_amount, p_paid_at, p_method, nullif(btrim(p_reference), ''), p_note, (select auth.uid()))
  returning id into v_payment_id;
  return v_payment_id;
end;
$$;

-- Historique des paiements : note en plus.
drop function public.platform_payments(uuid);

create function public.platform_payments(p_center_id uuid default null)
returns table (
  payment_id uuid,
  center_id uuid,
  center_name text,
  amount numeric,
  paid_at date,
  period_covered_start date,
  period_covered_end date,
  method public.subscription_payment_method,
  reference text,
  note text,
  plan_key text,
  recorded_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select p.id, p.center_id, c.name, p.amount, p.paid_at, p.period_covered_start, p.period_covered_end,
         p.method, p.reference, p.note, p.plan_key, r.full_name
  from public.subscription_payments p
  join public.centers c on c.id = p.center_id
  left join public.profiles r on r.id = p.recorded_by
  where p_center_id is null or p.center_id = p_center_id
  order by p.paid_at desc, p.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Journal filtrable
-- ---------------------------------------------------------------------
-- p_action : action exacte (« center.status_changed ») ou famille
-- (« subscription. »). p_origin : platform (super-admin), center (compte
-- d'un centre), automatic (job, sans auteur).
create function public.platform_audit_log(
  p_center_id uuid default null,
  p_action text default null,
  p_origin text default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  event_id bigint,
  occurred_at timestamptz,
  action text,
  payload jsonb,
  actor_name text,
  actor_is_platform boolean,
  center_id uuid,
  center_name text,
  ip_address text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    and (p_from is null or e.occurred_at >= (p_from::timestamp at time zone 'Africa/Casablanca'))
    and (p_to is null or e.occurred_at < ((p_to + 1)::timestamp at time zone 'Africa/Casablanca'))
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Actions présentes dans le journal (liste du filtre).
create function public.platform_audit_actions()
returns table (action text, events bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select e.action, count(*) from public.platform_events e group by e.action order by e.action;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.platform_revenue_summary(text, date, date, date)',
    'public.platform_revenue_kpis()',
    'public.platform_revenue_by_plan(date, date)',
    'public.platform_centers_billing()',
    'public.platform_record_payment(uuid, numeric, date, public.subscription_payment_method, text, text)',
    'public.platform_payments(uuid)',
    'public.platform_audit_log(uuid, text, text, date, date, integer, integer)',
    'public.platform_audit_actions()'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
