-- =====================================================================
-- CentroManager — 016 : accès super-admin et console en lecture
--
--  * un super-admin n'appartient à aucun centre (center_id nul) ; tout
--    autre rôle appartient à un centre. Un admin de centre ne peut donc
--    ni créer ni promouvoir un super-admin (contrainte) ;
--  * le super-admin ne passe par aucune policy des tables métier : ses
--    lectures passent par les fonctions platform_* ci-dessous
--    (SECURITY DEFINER), qui refusent tout autre compte ;
--  * aucun compte de centre ne peut lire un profil super-admin (les
--    policies de profiles filtrent par centre).
-- =====================================================================

alter table public.profiles alter column center_id drop not null;
alter table public.profiles
  add constraint profiles_super_admin_center_check check ((role = 'super_admin') = (center_id is null));

-- Hook JWT : center_id nul pour le super-admin. jsonb_set avec une valeur
-- SQL NULL rendrait tous les claims nuls (connexion impossible) : la clé
-- reçoit donc le JSON null.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_role public.user_role;
  v_center_id uuid;
  v_active boolean;
begin
  select p.role, p.center_id, p.active
    into v_role, v_center_id, v_active
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  if v_role is null then
    -- Compte Auth sans profil : aucun accès applicatif.
    v_claims := v_claims - 'user_role' - 'center_id';
    v_claims := jsonb_set(v_claims, '{profile_active}', 'false'::jsonb);
  else
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{center_id}', coalesce(to_jsonb(v_center_id), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

create function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.role = 'super_admin'
  );
$$;

create function private.require_super_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Accès réservé à la plateforme.' using errcode = '42501';
  end if;
end;
$$;

-- Tarif ramené au mois (revenu mensuel récurrent).
create function private.monthly_equivalent(p_price numeric, p_interval public.billing_interval)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(p_price, 0) / case p_interval when 'year' then 12 else 1 end, 2);
$$;

-- ---------------------------------------------------------------------
-- Tableau de bord
-- ---------------------------------------------------------------------
create function public.platform_overview()
returns table (
  trial_count integer,
  active_count integer,
  past_due_count integer,
  suspended_count integer,
  cancelled_count integer,
  monthly_recurring_revenue numeric,
  collected_this_month numeric,
  students_count integer,
  users_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', private.today())::date;
begin
  perform private.require_super_admin();
  return query
  select
    count(*) filter (where c.status = 'trial')::integer,
    count(*) filter (where c.status = 'active')::integer,
    count(*) filter (where c.status = 'past_due')::integer,
    count(*) filter (where c.status = 'suspended')::integer,
    count(*) filter (where c.status = 'cancelled')::integer,
    coalesce(sum(private.monthly_equivalent(c.price, c.billing_interval)) filter (where c.status in ('active', 'past_due')), 0),
    (select coalesce(sum(p.amount), 0) from public.subscription_payments p
      where p.paid_at >= v_month_start and p.paid_at < (v_month_start + interval '1 month')::date),
    (select count(*)::integer from public.students s),
    (select count(*)::integer from public.profiles p where p.role <> 'super_admin')
  from public.centers c;
end;
$$;

-- Centres dont l'échéance est dépassée, du retard le plus ancien au plus récent.
create function public.platform_overdue_centers()
returns table (
  center_id uuid,
  name text,
  status public.center_status,
  current_period_end date,
  days_overdue integer,
  amount_due numeric,
  billing_interval public.billing_interval,
  owner_contact_name text,
  owner_contact_phone text,
  owner_contact_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.status, c.current_period_end, (private.today() - c.current_period_end)::integer,
         coalesce(c.price, 0), c.billing_interval,
         c.owner_contact_name, c.owner_contact_phone, c.owner_contact_email
  from public.centers c
  where c.current_period_end < private.today()
    and c.status <> 'cancelled'
  order by c.current_period_end, c.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Centres
-- ---------------------------------------------------------------------
create function public.platform_centers()
returns table (
  center_id uuid,
  name text,
  slug text,
  center_type text,
  center_type_label text,
  plan public.subscription_plan,
  status public.center_status,
  activated_at timestamptz,
  current_period_end date,
  -- Positif : jours restants ; négatif : jours de retard ; nul sans échéance.
  days_remaining integer,
  students_count integer,
  price numeric,
  billing_interval public.billing_interval,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.slug, c.center_type, t.label, s.plan, c.status, c.activated_at, c.current_period_end,
         (c.current_period_end - private.today())::integer,
         (select count(*)::integer from public.students st where st.center_id = c.id),
         c.price, c.billing_interval, c.created_at
  from public.centers c
  join public.center_types t on t.code = c.center_type
  left join public.subscriptions s on s.center_id = c.id
  order by c.name;
end;
$$;

create function public.platform_center(p_center_id uuid)
returns table (
  center_id uuid,
  name text,
  slug text,
  center_type text,
  center_type_label text,
  custom_terms jsonb,
  status public.center_status,
  activated_at timestamptz,
  cancelled_at timestamptz,
  current_period_end date,
  days_remaining integer,
  grace_days smallint,
  price numeric,
  billing_interval public.billing_interval,
  owner_contact_name text,
  owner_contact_phone text,
  owner_contact_email text,
  notes text,
  created_at timestamptz,
  plan public.subscription_plan,
  subscription_started_at date,
  current_period_start date,
  auto_renew boolean,
  students_count integer,
  users_count integer,
  branding jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.slug, c.center_type, t.label, c.custom_terms, c.status, c.activated_at, c.cancelled_at,
         c.current_period_end, (c.current_period_end - private.today())::integer, c.grace_days,
         c.price, c.billing_interval, c.owner_contact_name, c.owner_contact_phone, c.owner_contact_email,
         c.notes, c.created_at, s.plan, s.started_at, s.current_period_start, s.auto_renew,
         (select count(*)::integer from public.students st where st.center_id = c.id),
         (select count(*)::integer from public.profiles p where p.center_id = c.id),
         (select to_jsonb(b) - 'center_id' from public.center_branding b where b.center_id = c.id)
  from public.centers c
  join public.center_types t on t.code = c.center_type
  left join public.subscriptions s on s.center_id = c.id
  where c.id = p_center_id;
end;
$$;

create function public.platform_center_users(p_center_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.user_role,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  -- Invitation ouverte (ou compte créé confirmé) : un lien de mot de passe remplace l'invitation.
  confirmed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select p.id, p.full_name, u.email::text, p.role, p.active, p.created_at, u.last_sign_in_at,
         u.email_confirmed_at is not null
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.center_id = p_center_id
  order by p.role, p.full_name;
end;
$$;

create function public.platform_center_events(p_center_id uuid)
returns table (
  event_id bigint,
  occurred_at timestamptz,
  action text,
  payload jsonb,
  actor_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select e.id, e.occurred_at, e.action, e.payload, p.full_name
  from public.platform_events e
  left join public.profiles p on p.id = e.actor_id
  where e.center_id = p_center_id
  order by e.occurred_at desc, e.id desc
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------
-- Paiements d'abonnement
-- ---------------------------------------------------------------------
-- p_center_id nul : tous les centres.
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
         p.method, p.reference, r.full_name
  from public.subscription_payments p
  join public.centers c on c.id = p.center_id
  left join public.profiles r on r.id = p.recorded_by
  where p_center_id is null or p.center_id = p_center_id
  order by p.paid_at desc, p.created_at desc;
end;
$$;

-- Encaissé par mois (12 derniers mois) ; prévisionnel du mois en cours
-- seulement : échéances du mois des centres en service, au tarif de leur
-- formule (les échéances passées ont été repoussées par les paiements).
create function public.platform_billing_months()
returns table (
  month date,
  collected numeric,
  expected numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current date := date_trunc('month', private.today())::date;
begin
  perform private.require_super_admin();
  return query
  select m::date,
         (select coalesce(sum(p.amount), 0) from public.subscription_payments p
           where p.paid_at >= m::date and p.paid_at < (m + interval '1 month')::date),
         case when m::date = v_current then
           (select coalesce(sum(c.price), 0) from public.centers c
             where c.status in ('active', 'past_due', 'trial')
               and c.current_period_end >= m::date and c.current_period_end < (m + interval '1 month')::date)
         end
  from generate_series(v_current - interval '11 months', v_current, interval '1 month') as m
  order by m desc;
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
    'public.platform_overview()',
    'public.platform_overdue_centers()',
    'public.platform_centers()',
    'public.platform_center(uuid)',
    'public.platform_center_users(uuid)',
    'public.platform_center_events(uuid)',
    'public.platform_payments(uuid)',
    'public.platform_billing_months()'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.is_super_admin() from public, anon;
grant execute on function private.is_super_admin() to authenticated;
revoke all on function private.require_super_admin() from public, anon;
grant execute on function private.require_super_admin() to authenticated;
