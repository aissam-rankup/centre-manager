-- =====================================================================
-- CentroManager — 050 : modules activables et packs commerciaux
-- (page 9, phase 1)
--
--  * Chaque fonctionnalité vendable est un module avec son interrupteur
--    (catalogue public.modules). Un pack (public.plans : Débutant,
--    Premium) n'est qu'un regroupement de modules vendu ensemble.
--  * public.center_modules est la source de vérité de ce qui est actif pour
--    un centre. Le pack du centre (centers.plan_key) remplit la table ; un
--    module peut aussi être activé ou coupé à l'unité (source « manual »,
--    ou « trial » pour un essai) : le sur-mesure est une configuration.
--    Une décision à l'unité qui revient à ce que dit le pack redevient
--    « plan » ; un changement de pack fait suivre les modules « plan » et
--    garde les décisions à l'unité.
--  * Le socle (trois rôles, élèves, inscriptions, factures et paiements,
--    planning et salles, pointage professeur et accueil, employés,
--    statistiques, vocabulaire) n'est pas un module : il est toujours actif.
--  * Contrôle serveur, jamais seulement visuel :
--      - private.center_has_module(center_id, module_key) ;
--      - policies RLS restrictives sur les tables d'un module ;
--      - fonction pre-request de l'API (PostgREST) : tout appel d'une table,
--        d'une vue ou d'une fonction d'un module coupé est refusé (403),
--        y compris les fonctions SECURITY DEFINER qui contournent la RLS ;
--      - l'application renvoie un 404 sur les routes d'un module coupé.
--  * Couper un module ne supprime aucune donnée : il est masqué et bloqué.
--  * La formule standard / marque blanche (subscriptions.plan) disparaît :
--    la marque blanche est le module white_label. Centres existants :
--    marque blanche → Premium, sinon Débutant.
--
-- Règle des demandes futures (reprise dans la console) : une fonctionnalité
-- utile à la majorité rejoint le socle ; utile à un groupe, elle devient un
-- module d'un pack existant ou d'un nouveau pack ; propre à un seul client,
-- elle est refusée ou facturée en sur-mesure, et livrée comme un module
-- derrière un interrupteur, jamais comme une copie du code.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create type public.module_source as enum ('plan', 'manual', 'trial');

create table public.modules (
  key text primary key check (key ~ '^[a-z][a-z_]*$'),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  category text not null check (category in ('gestion', 'finance', 'suivi', 'marque', 'pedagogie')),
  sort_order smallint not null default 0
);

create table public.plans (
  key text primary key check (key ~ '^[a-z][a-z_]*$'),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  -- Prix catalogue (affichage et proposition) ; le prix d'un centre reste centers.price.
  monthly_price numeric(10, 2) not null default 0 check (monthly_price >= 0),
  sort_order smallint not null default 0
);

create table public.plan_modules (
  plan_key text not null references public.plans (key) on update cascade on delete cascade,
  module_key text not null references public.modules (key) on update cascade on delete restrict,
  primary key (plan_key, module_key)
);

create index plan_modules_module_key_idx on public.plan_modules (module_key);

create table public.center_modules (
  center_id uuid not null references public.centers (id) on delete cascade,
  module_key text not null references public.modules (key) on update cascade on delete restrict,
  is_enabled boolean not null,
  source public.module_source not null default 'plan',
  -- Dernière activation (conservée à la coupure, pour l'historique).
  enabled_at timestamptz,
  enabled_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (center_id, module_key)
);

create index center_modules_module_key_idx on public.center_modules (module_key);

comment on table public.center_modules is
  'Modules réellement actifs d''un centre (source de vérité). Rempli par le pack, ou à l''unité (manual, trial).';

insert into public.modules (key, name, description, category, sort_order) values
  ('finance', 'Finance',
   'Paie des professeurs (salaire fixe, commissions), reçus imprimables et WhatsApp, charges et revenu net, remises, caisse journalière.',
   'finance', 10),
  ('reenrollment', 'Réinscription',
   'Campagnes de réinscription automatique chaque mois, intentions des élèves, rappels de paiement.',
   'gestion', 20),
  ('absence_tracking', 'Suivi des absences',
   'Fiche d''assiduité détaillée, alerte après trois absences, absences à signaler et messages WhatsApp au tuteur.',
   'suivi', 30),
  ('white_label', 'Marque blanche',
   'Interface aux couleurs du centre : nom, logo, favicon, couleurs, domaine personnalisé.',
   'marque', 40),
  ('lms', 'Plateforme pédagogique',
   'Espace professeur de publication (exercices, examens, résumés de cours) et espace élève de consultation.',
   'pedagogie', 50);

insert into public.plans (key, name, description, monthly_price, sort_order) values
  ('starter', 'Débutant', 'Socle complet : gestion, finance, réinscription, suivi des absences.', 0, 10),
  ('premium', 'Premium', 'Débutant, plus la marque blanche et la plateforme pédagogique (espaces professeur et élève).', 0, 20);

insert into public.plan_modules (plan_key, module_key) values
  ('starter', 'finance'), ('starter', 'reenrollment'), ('starter', 'absence_tracking'),
  ('premium', 'finance'), ('premium', 'reenrollment'), ('premium', 'absence_tracking'),
  ('premium', 'white_label'), ('premium', 'lms');

-- ---------------------------------------------------------------------
-- Pack du centre (affichage commercial ; la vérité technique est center_modules)
-- ---------------------------------------------------------------------
alter table public.centers
  add column plan_key text not null default 'starter' references public.plans (key) on update cascade on delete restrict;

create index centers_plan_key_idx on public.centers (plan_key);

update public.centers c
set plan_key = case when s.plan = 'white_label' then 'premium' else 'starter' end
from public.subscriptions s
where s.center_id = c.id
  and c.plan_key is distinct from case when s.plan = 'white_label' then 'premium' else 'starter' end;

-- ---------------------------------------------------------------------
-- Accès à un module
-- ---------------------------------------------------------------------
create function private.center_has_module(p_center_id uuid, p_module_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.center_modules m
    where m.center_id = p_center_id and m.module_key = p_module_key and m.is_enabled
  );
$$;

create function private.require_module(p_center_id uuid, p_module_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.center_has_module(p_center_id, p_module_key) then
    raise exception 'Fonctionnalité non incluse dans l''offre du centre.' using errcode = '42501';
  end if;
end;
$$;

-- Modules actifs d'un centre, dans l'ordre du catalogue.
create function private.center_module_keys(p_center_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.module_key order by c.sort_order, m.module_key), '{}')
  from public.center_modules m
  join public.modules c on c.key = m.module_key
  where m.center_id = p_center_id and m.is_enabled;
$$;

-- Modules actifs du centre du compte connecté (support compris) : lu par le
-- middleware de l'application avant d'ouvrir la route d'un module.
create function public.my_modules()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.center_module_keys(private.auth_center_id()), '{}');
$$;

-- ---------------------------------------------------------------------
-- Application du pack
-- ---------------------------------------------------------------------
-- Modules « plan » : alignés sur le pack. Décisions à l'unité : gardées,
-- sauf si elles reviennent à ce que dit le pack (redeviennent « plan »).
create function private.apply_center_plan(p_center_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
begin
  select c.plan_key into v_plan from public.centers c where c.id = p_center_id;
  if v_plan is null then
    return;
  end if;

  insert into public.center_modules as m (center_id, module_key, is_enabled, source, enabled_at, enabled_by)
  select p_center_id, mo.key, pm.module_key is not null, 'plan',
         case when pm.module_key is not null then now() end,
         case when pm.module_key is not null then (select auth.uid()) end
  from public.modules mo
  left join public.plan_modules pm on pm.plan_key = v_plan and pm.module_key = mo.key
  on conflict (center_id, module_key) do update
  set is_enabled = excluded.is_enabled,
      source = 'plan',
      enabled_at = case when excluded.is_enabled and not m.is_enabled then now() else m.enabled_at end,
      enabled_by = case when excluded.is_enabled and not m.is_enabled then (select auth.uid()) else m.enabled_by end,
      updated_at = now()
  where m.source = 'plan' and m.is_enabled is distinct from excluded.is_enabled
     or m.source <> 'plan' and m.is_enabled = excluded.is_enabled;
end;
$$;

-- Nouveau centre, ou pack changé : modules appliqués et changement journalisé.
create function private.centers_apply_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.plan_key is not distinct from old.plan_key then
      return new;
    end if;
    perform private.log_platform_event(new.id, 'center.plan_changed',
      jsonb_build_object('from', old.plan_key, 'to', new.plan_key));
  end if;
  perform private.apply_center_plan(new.id);
  return new;
end;
$$;

-- Centres existants : modules de leur pack (avant le déclencheur : aucun
-- événement de changement de pack pour la reprise).
do $$
declare
  r record;
begin
  for r in select c.id from public.centers c loop
    perform private.apply_center_plan(r.id);
  end loop;
end;
$$;

create trigger centers_apply_plan
after insert or update of plan_key on public.centers
for each row execute function private.centers_apply_plan();

-- ---------------------------------------------------------------------
-- Interrupteur d'un module (super-admin)
-- ---------------------------------------------------------------------
-- Une décision qui revient à ce que dit le pack redevient « plan » ; sinon
-- « manual » (ou « trial » pour activer un module hors pack à l'essai).
create function public.platform_set_center_module(
  p_center_id uuid,
  p_module_key text,
  p_enabled boolean,
  p_trial boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in_plan boolean;
  v_source public.module_source;
  v_old public.center_modules;
begin
  perform private.require_super_admin();
  if p_enabled is null then
    raise exception 'Précisez si le module est activé.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.centers c where c.id = p_center_id) then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.modules m where m.key = p_module_key) then
    raise exception 'Module inconnu.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.plan_modules pm
    join public.centers c on c.plan_key = pm.plan_key
    where c.id = p_center_id and pm.module_key = p_module_key
  ) into v_in_plan;
  v_source := case
    when p_enabled = v_in_plan then 'plan'
    when p_enabled and coalesce(p_trial, false) then 'trial'
    else 'manual'
  end::public.module_source;

  select * into v_old from public.center_modules m
  where m.center_id = p_center_id and m.module_key = p_module_key
  for update;

  insert into public.center_modules as m (center_id, module_key, is_enabled, source, enabled_at, enabled_by)
  values (p_center_id, p_module_key, p_enabled, v_source,
          case when p_enabled then now() end, case when p_enabled then (select auth.uid()) end)
  on conflict (center_id, module_key) do update
  set is_enabled = excluded.is_enabled,
      source = excluded.source,
      enabled_at = case when excluded.is_enabled and not m.is_enabled then now() else m.enabled_at end,
      enabled_by = case when excluded.is_enabled and not m.is_enabled then (select auth.uid()) else m.enabled_by end,
      updated_at = now();

  if v_old.is_enabled is distinct from p_enabled or v_old.source is distinct from v_source then
    perform private.log_platform_event(p_center_id,
      case when p_enabled then 'center.module_enabled' else 'center.module_disabled' end,
      jsonb_build_object('module', p_module_key, 'source', v_source));
  end if;
end;
$$;

-- Modules d'un centre : état, origine, et ce que dit son pack.
create function public.platform_center_modules(p_center_id uuid)
returns table (
  module_key text,
  name text,
  description text,
  category text,
  in_plan boolean,
  is_enabled boolean,
  source public.module_source,
  enabled_at timestamptz,
  enabled_by_name text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select mo.key, mo.name, mo.description, mo.category,
         pm.module_key is not null,
         coalesce(cm.is_enabled, false),
         coalesce(cm.source, 'plan'::public.module_source),
         cm.enabled_at,
         pr.full_name,
         cm.updated_at
  from public.centers c
  cross join public.modules mo
  left join public.plan_modules pm on pm.plan_key = c.plan_key and pm.module_key = mo.key
  left join public.center_modules cm on cm.center_id = c.id and cm.module_key = mo.key
  left join public.profiles pr on pr.id = cm.enabled_by
  where c.id = p_center_id
  order by mo.sort_order, mo.key;
end;
$$;

-- ---------------------------------------------------------------------
-- Catalogue (super-admin)
-- ---------------------------------------------------------------------
create function public.platform_modules()
returns table (
  key text,
  name text,
  description text,
  category text,
  plans text[],
  centers_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select mo.key, mo.name, mo.description, mo.category,
         coalesce((select array_agg(p.key order by p.sort_order)
                   from public.plan_modules pm join public.plans p on p.key = pm.plan_key
                   where pm.module_key = mo.key), '{}'),
         (select count(*)::integer from public.center_modules cm where cm.module_key = mo.key and cm.is_enabled)
  from public.modules mo
  order by mo.sort_order, mo.key;
end;
$$;

create function public.platform_plans()
returns table (
  key text,
  name text,
  description text,
  monthly_price numeric,
  modules text[],
  centers_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select p.key, p.name, p.description, p.monthly_price,
         coalesce((select array_agg(mo.key order by mo.sort_order)
                   from public.plan_modules pm join public.modules mo on mo.key = pm.module_key
                   where pm.plan_key = p.key), '{}'),
         (select count(*)::integer from public.centers c where c.plan_key = p.key)
  from public.plans p
  order by p.sort_order, p.key;
end;
$$;

-- Nom, description et prix catalogue d'un pack (sa composition vit dans les migrations).
create function public.platform_update_plan(p_key text, p_name text, p_description text, p_monthly_price numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.plans;
begin
  perform private.require_super_admin();
  if p_monthly_price is null or p_monthly_price < 0 then
    raise exception 'Prix invalide.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Nom obligatoire.' using errcode = '22023';
  end if;
  select * into v_old from public.plans p where p.key = p_key for update;
  if not found then
    raise exception 'Pack introuvable.' using errcode = 'P0002';
  end if;
  update public.plans
  set name = btrim(p_name), description = btrim(coalesce(p_description, '')), monthly_price = p_monthly_price
  where key = p_key;
  if (v_old.name, v_old.description, v_old.monthly_price)
     is distinct from (btrim(p_name), btrim(coalesce(p_description, '')), p_monthly_price) then
    perform private.log_platform_event(null, 'plan.updated',
      jsonb_build_object('plan', p_key, 'name', btrim(p_name), 'monthly_price', p_monthly_price));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Réinscription : le réglage du centre suit le module
-- ---------------------------------------------------------------------
-- Module coupé : la réinscription automatique s'arrête (plus de campagne
-- préparée) ; les campagnes existantes se retrouvent à la réactivation.
create function private.center_modules_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.module_key = 'reenrollment' and not new.is_enabled then
    update public.centers set auto_reenrollment_enabled = false
    where id = new.center_id and auto_reenrollment_enabled;
  end if;
  return null;
end;
$$;

create trigger center_modules_after_write
after insert or update on public.center_modules
for each row execute function private.center_modules_after_write();

create function private.centers_require_reenrollment_module()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auto_reenrollment_enabled and not old.auto_reenrollment_enabled
     and not private.center_has_module(new.id, 'reenrollment') then
    raise exception 'La réinscription automatique n''est pas incluse dans l''offre du centre.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger centers_require_reenrollment_module
before update of auto_reenrollment_enabled on public.centers
for each row execute function private.centers_require_reenrollment_module();

-- ---------------------------------------------------------------------
-- Encaissement : la caisse du jour n'est tenue qu'avec le module Finance
-- ---------------------------------------------------------------------
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

  -- Session du jour (ouverte avec un fonds nul si personne ne l'a ouverte),
  -- seulement si le centre tient sa caisse (module Finance).
  if private.center_has_module(private.auth_center_id(), 'finance') then
    v_session := private.open_cash_session_for(private.auth_center_id(), (select auth.uid()), 0);
  end if;

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

-- ---------------------------------------------------------------------
-- Marque blanche : le module remplace la formule
-- ---------------------------------------------------------------------
create or replace function private.can_edit_branding(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.in_support_write()
     and (
       private.is_super_admin()
       or (
         p_center_id = private.auth_center_id()
         and private.is_admin()
         and private.center_has_module(p_center_id, 'white_label')
       )
     );
$$;

create or replace function private.applied_branding(p_center_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(b) - 'center_id' - 'custom_domain' - 'domain_verified' - 'updated_at' - 'is_demo'
  from public.center_branding b
  where b.center_id = p_center_id
    and private.center_has_module(p_center_id, 'white_label');
$$;

create or replace function public.center_for_host(p_slug text default null, p_domain text default null)
returns table (center_id uuid, name text, slug text, white_label boolean, branding jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.slug, private.center_has_module(c.id, 'white_label'), private.applied_branding(c.id)
  from public.centers c
  left join public.center_branding b on b.center_id = c.id
  where c.status <> 'cancelled'
    and (
      (p_slug is not null and c.slug = lower(p_slug))
      or (p_domain is not null and b.custom_domain = lower(p_domain) and b.domain_verified
          and private.center_has_module(c.id, 'white_label'))
    )
  limit 1;
$$;

drop function public.center_branding_settings(uuid);

create function public.center_branding_settings(p_center_id uuid)
returns table (
  white_label boolean,
  editable boolean,
  brand_name text,
  logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  login_background_url text,
  email_sender_name text,
  support_email text,
  support_phone text,
  custom_domain text,
  domain_verified boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_super_admin() or (p_center_id = private.auth_center_id() and private.is_admin())) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
  select private.center_has_module(c.id, 'white_label'), private.can_edit_branding(p_center_id),
         b.brand_name, b.logo_url, b.favicon_url, b.primary_color, b.secondary_color, b.accent_color,
         b.login_background_url, b.email_sender_name, b.support_email, b.support_phone,
         b.custom_domain, coalesce(b.domain_verified, false)
  from public.centers c
  left join public.center_branding b on b.center_id = c.id
  where c.id = p_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Accès du compte connecté : pack et modules actifs à la place de la formule
-- ---------------------------------------------------------------------
drop function public.my_center_access();

create function public.my_center_access()
returns table (
  center_id uuid,
  center_name text,
  status public.center_status,
  blocked boolean,
  current_period_end date,
  suspension_date date,
  days_before_suspension integer,
  support_mode boolean,
  support_expires_at timestamptz,
  contact_name text,
  contact_phone text,
  contact_email text,
  vocabulary jsonb,
  plan_key text,
  modules text[],
  branding jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.role, p.center_id from public.profiles p where p.id = (select auth.uid()) and p.active
  ),
  support as (
    select s.center_id, s.expires_at
    from public.support_sessions s
    join me on me.id = s.actor_id and me.role = 'super_admin'
    where s.ended_at is null and s.expires_at > now()
    order by s.started_at desc
    limit 1
  ),
  target as (
    select coalesce(me.center_id, (select support.center_id from support)) as center_id,
           me.role = 'admin' or exists (select 1 from support) as sees_billing
    from me
  )
  select c.id, c.name, c.status, c.status in ('suspended', 'cancelled'),
         case when t.sees_billing then c.current_period_end end,
         case when t.sees_billing then c.current_period_end + c.grace_days end,
         case when t.sees_billing then (c.current_period_end + c.grace_days - private.today())::integer end,
         exists (select 1 from support), (select support.expires_at from support),
         st.support_name, st.support_phone, st.support_email,
         ty.terms || c.custom_terms,
         c.plan_key,
         private.center_module_keys(c.id),
         private.applied_branding(c.id)
  from target t
  join public.centers c on c.id = t.center_id
  join public.center_types ty on ty.code = c.center_type
  cross join public.platform_settings st;
$$;

-- ---------------------------------------------------------------------
-- Console : le pack à la place de la formule
-- ---------------------------------------------------------------------
drop function public.platform_centers();

create function public.platform_centers()
returns table (
  center_id uuid,
  name text,
  slug text,
  center_type text,
  center_type_label text,
  plan_key text,
  plan_name text,
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
  select c.id, c.name, c.slug, c.center_type, t.label, c.plan_key, p.name, c.status, c.activated_at, c.current_period_end,
         (c.current_period_end - private.today())::integer,
         (select count(*)::integer from public.students st where st.center_id = c.id),
         c.price, c.billing_interval, c.created_at
  from public.centers c
  join public.center_types t on t.code = c.center_type
  join public.plans p on p.key = c.plan_key
  order by c.name;
end;
$$;

drop function public.platform_center(uuid);

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
  plan_key text,
  plan_name text,
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
         c.notes, c.created_at, c.plan_key, p.name, s.started_at, s.current_period_start, s.auto_renew,
         (select count(*)::integer from public.students st where st.center_id = c.id),
         (select count(*)::integer from public.profiles pr where pr.center_id = c.id),
         (select to_jsonb(b) - 'center_id' - 'is_demo' from public.center_branding b where b.center_id = c.id)
  from public.centers c
  join public.center_types t on t.code = c.center_type
  join public.plans p on p.key = c.plan_key
  left join public.subscriptions s on s.center_id = c.id
  where c.id = p_center_id;
end;
$$;

drop function public.platform_create_center(
  text, text, text, jsonb, public.subscription_plan, numeric, public.billing_interval, public.center_status,
  date, date, smallint, text, text, text, text, uuid, text, text);

create function public.platform_create_center(
  p_name text,
  p_slug text,
  p_center_type text,
  p_custom_terms jsonb,
  p_plan_key text,
  p_price numeric,
  p_billing_interval public.billing_interval,
  p_status public.center_status,
  p_activation_date date,
  p_first_period_end date,
  p_grace_days smallint,
  p_owner_contact_name text,
  p_owner_contact_phone text,
  p_owner_contact_email text,
  p_notes text,
  p_admin_user_id uuid,
  p_admin_full_name text,
  p_admin_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
begin
  perform private.require_super_admin();

  if p_status not in ('trial', 'active') then
    raise exception 'Un nouveau centre démarre en essai ou actif.' using errcode = '22023';
  end if;
  if p_first_period_end is not null and p_activation_date is not null and p_first_period_end <= p_activation_date then
    raise exception 'La première échéance doit suivre la date d''activation.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.plans p where p.key = p_plan_key) then
    raise exception 'Pack inconnu.' using errcode = '22023';
  end if;
  if exists (select 1 from public.centers c where c.slug = p_slug) then
    raise exception 'Cette adresse est déjà utilisée par un autre centre.' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_admin_user_id) then
    raise exception 'Ce compte appartient déjà à un centre.' using errcode = '22023';
  end if;

  insert into public.centers (
    name, slug, center_type, custom_terms, plan_key, status, activated_at, current_period_end, grace_days,
    price, billing_interval, owner_contact_name, owner_contact_phone, owner_contact_email, notes
  ) values (
    btrim(p_name), p_slug, p_center_type, coalesce(p_custom_terms, '{}'), p_plan_key, p_status,
    case when p_status = 'active' then coalesce(p_activation_date, private.today())::timestamptz end,
    p_first_period_end, coalesce(p_grace_days, 5),
    p_price, p_billing_interval,
    nullif(btrim(p_owner_contact_name), ''), nullif(btrim(p_owner_contact_phone), ''),
    nullif(btrim(p_owner_contact_email), ''), nullif(btrim(p_notes), '')
  )
  returning id into v_center_id;

  update public.subscriptions
  set started_at = coalesce(p_activation_date, private.today()),
      current_period_start = coalesce(p_activation_date, private.today())
  where center_id = v_center_id;

  insert into public.profiles (id, center_id, full_name, role, phone)
  values (p_admin_user_id, v_center_id, btrim(p_admin_full_name), 'admin', nullif(btrim(p_admin_phone), ''));

  perform private.log_platform_event(v_center_id, 'center.admin_invited',
    jsonb_build_object('full_name', btrim(p_admin_full_name),
                       'email', (select u.email from auth.users u where u.id = p_admin_user_id)));
  return v_center_id;
end;
$$;

drop function public.platform_set_pricing(uuid, public.subscription_plan, numeric, public.billing_interval, smallint);

-- Pack et tarif : changer de pack réapplique ses modules (décisions à l'unité gardées).
create function public.platform_set_pricing(
  p_center_id uuid,
  p_plan_key text,
  p_price numeric,
  p_billing_interval public.billing_interval,
  p_grace_days smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.plans p where p.key = p_plan_key) then
    raise exception 'Pack inconnu.' using errcode = '22023';
  end if;
  update public.centers
  set plan_key = p_plan_key, price = p_price, billing_interval = p_billing_interval, grace_days = p_grace_days
  where id = p_center_id;
  if not found then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Fin de la formule standard / marque blanche
-- ---------------------------------------------------------------------
create or replace function private.subscriptions_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auto_renew is distinct from old.auto_renew then
    perform private.log_platform_event(new.center_id, 'subscription.auto_renew_changed',
      jsonb_build_object('auto_renew', new.auto_renew));
  end if;
  return new;
end;
$$;

alter table public.subscriptions drop column plan;
drop type public.subscription_plan;

-- ---------------------------------------------------------------------
-- Tables d'un module : RLS restrictive (en plus des policies existantes)
-- ---------------------------------------------------------------------
-- Ressources (tables, vues, fonctions exposées par l'API) de chaque module.
create table private.module_resources (
  name text primary key,
  module_key text not null references public.modules (key) on update cascade on delete cascade,
  kind text not null check (kind in ('table', 'view', 'function'))
);

insert into private.module_resources (name, module_key, kind) values
  -- Finance
  ('cash_movements', 'finance', 'table'),
  ('cash_sessions', 'finance', 'table'),
  ('discounts', 'finance', 'table'),
  ('expense_categories', 'finance', 'table'),
  ('expenses', 'finance', 'table'),
  ('payroll_lines', 'finance', 'table'),
  ('payroll_periods', 'finance', 'table'),
  ('receipt_counters', 'finance', 'table'),
  ('receipts', 'finance', 'table'),
  ('teacher_commissions', 'finance', 'table'),
  ('teacher_salaries', 'finance', 'table'),
  ('discount_overlaps', 'finance', 'view'),
  ('admin_discount_summary', 'finance', 'function'),
  ('admin_financial_summary', 'finance', 'function'),
  ('cancel_receipt', 'finance', 'function'),
  ('cash_month_overview', 'finance', 'function'),
  ('cash_session_history', 'finance', 'function'),
  ('cash_session_summary', 'finance', 'function'),
  ('close_cash_session', 'finance', 'function'),
  ('delete_expense', 'finance', 'function'),
  ('mark_receipt_printed', 'finance', 'function'),
  ('open_cash_session', 'finance', 'function'),
  ('payroll_mark_paid', 'finance', 'function'),
  ('payroll_refresh', 'finance', 'function'),
  ('payroll_set_adjustment', 'finance', 'function'),
  ('payroll_unlock', 'finance', 'function'),
  ('payroll_validate', 'finance', 'function'),
  ('record_cash_correction', 'finance', 'function'),
  ('record_cash_movement', 'finance', 'function'),
  ('set_teacher_commission', 'finance', 'function'),
  ('set_teacher_pay', 'finance', 'function'),
  ('set_teacher_salary', 'finance', 'function'),
  ('stale_cash_sessions', 'finance', 'function'),
  ('validate_cash_session', 'finance', 'function'),
  -- Réinscription
  ('billing_runs', 'reenrollment', 'table'),
  ('billing_run_lines', 'reenrollment', 'table'),
  ('reenrollment_intents', 'reenrollment', 'table'),
  ('payment_reminders', 'reenrollment', 'table'),
  ('billing_run_review', 'reenrollment', 'function'),
  ('cancel_billing_run', 'reenrollment', 'function'),
  ('confirm_billing_run', 'reenrollment', 'function'),
  ('payment_reminder_queue', 'reenrollment', 'function'),
  ('prepare_billing_run', 'reenrollment', 'function'),
  ('record_payment_reminder', 'reenrollment', 'function'),
  ('reenrollment_overview', 'reenrollment', 'function'),
  ('set_reenrollment_intent', 'reenrollment', 'function'),
  -- Suivi des absences
  ('absence_notifications', 'absence_tracking', 'table'),
  ('absences_to_notify', 'absence_tracking', 'view'),
  ('open_absence_alerts', 'absence_tracking', 'view'),
  ('student_absence_follow_ups', 'absence_tracking', 'function'),
  -- Marque blanche
  ('center_branding', 'white_label', 'table');

do $$
declare
  r record;
begin
  for r in select m.name, m.module_key from private.module_resources m where m.kind = 'table' order by m.name loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.center_has_module(center_id, %L)) with check (private.center_has_module(center_id, %L))',
      r.name || '_module', r.name, r.module_key, r.module_key);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- API : fonction appelée par PostgREST avant chaque requête
-- ---------------------------------------------------------------------
-- Les fonctions SECURITY DEFINER contournent la RLS : l'appel d'une table,
-- d'une vue ou d'une fonction d'un module coupé est refusé ici (403).
-- Toute erreur imprévue laisse passer la requête (la RLS reste en place) :
-- un défaut de cette fonction ne doit jamais couper toute l'API.
create function private.check_module_request()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_module text;
  v_blocked boolean := false;
begin
  begin
    select r.module_key into v_module
    from private.module_resources r
    where r.name = split_part(regexp_replace(coalesce(current_setting('request.path', true), ''), '^/(rpc/)?', ''), '/', 1);
    if v_module is not null then
      v_blocked := not private.center_has_module(private.auth_center_id(), v_module)
                   and private.auth_center_id() is not null;
    end if;
  exception when others then
    v_blocked := false;
  end;
  if v_blocked then
    raise exception 'Fonctionnalité non incluse dans l''offre du centre.'
      using errcode = '42501', hint = 'module:' || v_module;
  end if;
end;
$$;

alter role authenticator set pgrst.db_pre_request to 'private.check_module_request';
notify pgrst, 'reload config';

-- ---------------------------------------------------------------------
-- Données de démonstration : indicateur sur les nouvelles tables
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select t.tablename from pg_tables t where t.schemaname = 'public' order by 1 loop
    execute format(
      'alter table public.%I add column if not exists is_demo boolean not null default '
      || 'coalesce(nullif(current_setting(''centromanager.demo_seed'', true), '''')::boolean, false)',
      r.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
alter table public.modules enable row level security;
alter table public.plans enable row level security;
alter table public.plan_modules enable row level security;
alter table public.center_modules enable row level security;
alter table private.module_resources enable row level security;

-- Lecture et écriture par les fonctions uniquement (aucune policy).
revoke all on public.modules, public.plans, public.plan_modules, public.center_modules from anon, authenticated;
revoke all on private.module_resources from public, anon, authenticated;

create trigger center_modules_deny_support_writes
before insert or update or delete on public.center_modules
for each row execute function private.deny_support_writes();

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.my_center_access()',
    'public.my_modules()',
    'public.center_branding_settings(uuid)',
    'public.platform_centers()',
    'public.platform_center(uuid)',
    'public.platform_create_center(text, text, text, jsonb, text, numeric, public.billing_interval, public.center_status, date, date, smallint, text, text, text, text, uuid, text, text)',
    'public.platform_set_pricing(uuid, text, numeric, public.billing_interval, smallint)',
    'public.platform_set_center_module(uuid, text, boolean, boolean)',
    'public.platform_center_modules(uuid)',
    'public.platform_modules()',
    'public.platform_plans()',
    'public.platform_update_plan(text, text, text, numeric)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

-- Policies RLS (requêtes des comptes) et fonction pre-request (anonymes compris).
revoke all on function private.center_has_module(uuid, text) from public;
grant execute on function private.center_has_module(uuid, text) to anon, authenticated;
revoke all on function private.check_module_request() from public;
grant execute on function private.check_module_request() to anon, authenticated;
revoke all on function private.require_module(uuid, text) from public, anon;
grant execute on function private.require_module(uuid, text) to authenticated;
revoke all on function private.center_module_keys(uuid) from public, anon, authenticated;
revoke all on function private.apply_center_plan(uuid) from public, anon, authenticated;
revoke all on function private.centers_apply_plan() from public, anon, authenticated;
revoke all on function private.center_modules_after_write() from public, anon, authenticated;
revoke all on function private.centers_require_reenrollment_module() from public, anon, authenticated;

