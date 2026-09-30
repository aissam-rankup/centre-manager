-- =====================================================================
-- CentroManager — 015 : schéma de la plateforme (super-admin)
--
-- Phase 1 : modèle de données uniquement (aucun écran).
--  * rôle super_admin (utilisé à partir de la phase 2) ;
--  * centres : slug, statut, échéance, tarif, type d'établissement,
--    contact du directeur, notes internes ;
--  * types d'établissement et vocabulaire (singulier, pluriel, genre) ;
--  * marque blanche (center_branding) ;
--  * abonnements, paiements d'abonnement ;
--  * journal d'audit platform_events, alimenté par triggers : toute
--    modification des données plateforme y est tracée, quel que soit
--    le chemin (console, job quotidien, service_role).
--
-- Sécurité :
--  * les colonnes plateforme de centers (échéance, tarif, contact, notes)
--    ne sont ni lisibles ni modifiables par les comptes d'un centre :
--    privilèges par colonne (l'admin de centre ne peut renommer que son
--    centre) ;
--  * subscriptions, subscription_payments et platform_events : RLS activée,
--    aucune policy côté centre ; accès réservé aux fonctions de la
--    plateforme (phase 2 et suivantes).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
alter type public.user_role add value if not exists 'super_admin';

create type public.center_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');
create type public.subscription_plan as enum ('standard', 'white_label');
-- Durée facturée : un mois ou une année (choisie par le super-admin).
create type public.billing_interval as enum ('month', 'year');
create type public.subscription_payment_method as enum ('bank_transfer', 'cash', 'card');

-- ---------------------------------------------------------------------
-- Vocabulaire
-- ---------------------------------------------------------------------
-- Clés de vocabulaire : apprenant, groupe, cours, encadrant, session.
-- Chaque terme : {"singular": "...", "plural": "...", "gender": "m" | "f"}.
create function private.valid_term(p_term jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_term) = 'object'
     and length(btrim(coalesce(p_term ->> 'singular', ''))) between 1 and 60
     and length(btrim(coalesce(p_term ->> 'plural', ''))) between 1 and 60
     and coalesce(p_term ->> 'gender', '') in ('m', 'f');
$$;

-- p_complete : toutes les clés sont exigées (types) ; sinon, surcharge
-- partielle (vocabulaire personnalisé d'un centre).
create function private.valid_terms(p_terms jsonb, p_complete boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_terms) = 'object'
     and not exists (
       select 1 from jsonb_each(p_terms) e
       where e.key not in ('learner', 'group', 'course', 'instructor', 'session')
          or not private.valid_term(e.value)
     )
     and (not p_complete or p_terms ?& array['learner', 'group', 'course', 'instructor', 'session']);
$$;

create table public.center_types (
  code text primary key check (code ~ '^[a-z_]+$'),
  label text not null check (length(btrim(label)) > 0),
  -- Vocabulaire par défaut ; pour « Personnalisé », simple repli neutre.
  terms jsonb not null check (private.valid_terms(terms, true)),
  -- Type « Personnalisé » : le super-admin saisit chaque terme par centre.
  is_custom boolean not null default false,
  sort_order smallint not null default 0
);

comment on table public.center_types is
  'Types d''établissement et vocabulaire de l''interface (couche de présentation uniquement).';

insert into public.center_types (code, label, sort_order, is_custom, terms) values
  ('soutien_scolaire', 'Soutien scolaire', 1, false, '{
    "learner":    {"singular": "Élève", "plural": "Élèves", "gender": "m"},
    "group":      {"singular": "Niveau", "plural": "Niveaux", "gender": "m"},
    "course":     {"singular": "Matière", "plural": "Matières", "gender": "f"},
    "instructor": {"singular": "Professeur", "plural": "Professeurs", "gender": "m"},
    "session":    {"singular": "Séance", "plural": "Séances", "gender": "f"}}'),
  ('centre_formation', 'Centre de formation', 2, false, '{
    "learner":    {"singular": "Stagiaire", "plural": "Stagiaires", "gender": "m"},
    "group":      {"singular": "Promotion", "plural": "Promotions", "gender": "f"},
    "course":     {"singular": "Module", "plural": "Modules", "gender": "m"},
    "instructor": {"singular": "Formateur", "plural": "Formateurs", "gender": "m"},
    "session":    {"singular": "Session", "plural": "Sessions", "gender": "f"}}'),
  ('institut_langue', 'Institut de langue', 3, false, '{
    "learner":    {"singular": "Apprenant", "plural": "Apprenants", "gender": "m"},
    "group":      {"singular": "Groupe de niveau", "plural": "Groupes de niveau", "gender": "m"},
    "course":     {"singular": "Langue", "plural": "Langues", "gender": "f"},
    "instructor": {"singular": "Enseignant", "plural": "Enseignants", "gender": "m"},
    "session":    {"singular": "Cours", "plural": "Cours", "gender": "m"}}'),
  ('auto_ecole', 'Auto-école', 4, false, '{
    "learner":    {"singular": "Candidat", "plural": "Candidats", "gender": "m"},
    "group":      {"singular": "Catégorie de permis", "plural": "Catégories de permis", "gender": "f"},
    "course":     {"singular": "Type de leçon", "plural": "Types de leçon", "gender": "m"},
    "instructor": {"singular": "Moniteur", "plural": "Moniteurs", "gender": "m"},
    "session":    {"singular": "Leçon", "plural": "Leçons", "gender": "f"}}'),
  ('soutien_universitaire', 'Centre de soutien universitaire', 5, false, '{
    "learner":    {"singular": "Étudiant", "plural": "Étudiants", "gender": "m"},
    "group":      {"singular": "Filière", "plural": "Filières", "gender": "f"},
    "course":     {"singular": "Unité d''enseignement", "plural": "Unités d''enseignement", "gender": "f"},
    "instructor": {"singular": "Chargé de TD", "plural": "Chargés de TD", "gender": "m"},
    "session":    {"singular": "Séance", "plural": "Séances", "gender": "f"}}'),
  ('personnalise', 'Personnalisé', 6, true, '{
    "learner":    {"singular": "Apprenant", "plural": "Apprenants", "gender": "m"},
    "group":      {"singular": "Groupe", "plural": "Groupes", "gender": "m"},
    "course":     {"singular": "Cours", "plural": "Cours", "gender": "m"},
    "instructor": {"singular": "Encadrant", "plural": "Encadrants", "gender": "m"},
    "session":    {"singular": "Séance", "plural": "Séances", "gender": "f"}}');

-- ---------------------------------------------------------------------
-- Centres : colonnes plateforme
-- ---------------------------------------------------------------------
-- Slug (sous-domaine) : minuscules, chiffres et tirets.
create function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      translate(lower(coalesce(p_text, '')),
        'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'),
      '[^a-z0-9]+', '-', 'g'),
    '-');
$$;

alter table public.centers
  add column slug text,
  add column status public.center_status not null default 'trial',
  add column activated_at timestamptz,
  add column current_period_end date,
  add column grace_days smallint not null default 5 check (grace_days between 0 and 60),
  -- Tarif par durée facturée (mois ou année), en MAD ; nul tant qu'il n'est pas fixé.
  add column price numeric(10, 2) check (price >= 0),
  add column billing_interval public.billing_interval not null default 'month',
  add column center_type text not null default 'soutien_scolaire' references public.center_types (code),
  -- Surcharge du vocabulaire (type « Personnalisé » surtout).
  add column custom_terms jsonb not null default '{}' check (private.valid_terms(custom_terms, false)),
  add column owner_contact_name text,
  add column owner_contact_phone text,
  add column owner_contact_email text check (owner_contact_email is null or owner_contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Notes internes du propriétaire de la plateforme (jamais visibles du centre).
  add column notes text,
  add column cancelled_at timestamptz;

-- Centres existants : en service.
update public.centers
set slug = coalesce(nullif(private.slugify(name), ''), 'centre') || case when n > 1 then '-' || n else '' end,
    status = 'active',
    activated_at = created_at
from (
  select id as cid, row_number() over (partition by private.slugify(name) order by created_at, id) as n
  from public.centers
) ranked
where ranked.cid = centers.id;

alter table public.centers
  alter column slug set not null,
  add constraint centers_slug_key unique (slug),
  add constraint centers_slug_format_check check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and length(slug) between 2 and 63
    -- Réservés : console et services de la plateforme.
    and slug not in ('www', 'app', 'api', 'admin', 'platform', 'plateforme', 'mail', 'static', 'assets')
  ),
  add constraint centers_cancelled_at_check check ((status = 'cancelled') = (cancelled_at is not null));

create index centers_status_idx on public.centers (status);
create index centers_center_type_idx on public.centers (center_type);

-- Slug par défaut, dérivé du nom et rendu unique.
create function private.centers_default_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  if new.slug is not null then
    return new;
  end if;
  v_base := left(nullif(private.slugify(new.name), ''), 56);
  if v_base is null or length(v_base) < 2 then
    v_base := 'centre';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.centers c where c.slug = v_slug)
     or v_slug in ('www', 'app', 'api', 'admin', 'platform', 'plateforme', 'mail', 'static', 'assets') loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  new.slug := v_slug;
  return new;
end;
$$;

create trigger centers_default_slug
before insert on public.centers
for each row execute function private.centers_default_slug();

-- Privilèges par colonne : un compte de centre ne lit que les colonnes
-- utiles à l'interface et ne peut modifier que le nom de son centre.
-- Les colonnes ajoutées plus tard restent invisibles par défaut.
revoke select, insert, update, delete on public.centers from authenticated;
grant select (id, name, created_at, slug, status, center_type, custom_terms) on public.centers to authenticated;
grant update (name) on public.centers to authenticated;

-- ---------------------------------------------------------------------
-- Marque blanche
-- ---------------------------------------------------------------------
create table public.center_branding (
  center_id uuid primary key references public.centers (id) on delete cascade,
  brand_name text check (brand_name is null or length(btrim(brand_name)) between 1 and 80),
  logo_url text,
  favicon_url text,
  primary_color text check (primary_color is null or primary_color ~* '^#[0-9a-f]{6}$'),
  secondary_color text check (secondary_color is null or secondary_color ~* '^#[0-9a-f]{6}$'),
  accent_color text check (accent_color is null or accent_color ~* '^#[0-9a-f]{6}$'),
  login_background_url text,
  email_sender_name text,
  support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  support_phone text,
  custom_domain text check (custom_domain is null or custom_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'),
  domain_verified boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint center_branding_domain_verified_check check (custom_domain is not null or not domain_verified)
);

create unique index center_branding_custom_domain_key on public.center_branding (custom_domain) where custom_domain is not null;

comment on table public.center_branding is
  'Marque blanche : appliquée uniquement aux centres en formule white_label.';

-- ---------------------------------------------------------------------
-- Abonnements
-- ---------------------------------------------------------------------
-- Un abonnement par centre. Statut, tarif et échéance recopiés depuis
-- centers (source de vérité) par trigger ; la formule vit ici.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null unique references public.centers (id) on delete cascade,
  plan public.subscription_plan not null default 'standard',
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  billing_interval public.billing_interval not null default 'month',
  started_at date not null default private.today(),
  current_period_start date,
  current_period_end date,
  status public.center_status not null default 'trial',
  auto_renew boolean not null default true,
  created_at timestamptz not null default now(),
  check (current_period_start is null or current_period_end is null or current_period_start < current_period_end)
);

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  paid_at date not null default private.today(),
  period_covered_start date,
  period_covered_end date,
  method public.subscription_payment_method not null,
  reference text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_covered_start is null or period_covered_end is null or period_covered_start < period_covered_end)
);

create index subscription_payments_center_paid_idx on public.subscription_payments (center_id, paid_at desc);
create index subscription_payments_paid_at_idx on public.subscription_payments (paid_at);

-- ---------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------
create table public.platform_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- Nul pour les actions automatiques (job quotidien).
  actor_id uuid references auth.users (id) on delete set null,
  center_id uuid references public.centers (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  payload jsonb not null default '{}'
);

create index platform_events_center_idx on public.platform_events (center_id, occurred_at desc);
create index platform_events_occurred_idx on public.platform_events (occurred_at desc);

comment on table public.platform_events is
  'Journal d''audit de la plateforme (append-only) : créations, statuts, échéances, formules, paiements, accès support.';

create function private.log_platform_event(p_center_id uuid, p_action text, p_payload jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_events (actor_id, center_id, action, payload)
  values ((select auth.uid()), p_center_id, p_action, coalesce(p_payload, '{}'));
$$;

-- Append-only, même pour les fonctions internes.
create function private.platform_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Le journal de la plateforme ne peut pas être modifié.' using errcode = '42501';
end;
$$;

create trigger platform_events_append_only
before update or delete on public.platform_events
for each row execute function private.platform_events_append_only();

-- ---------------------------------------------------------------------
-- Synchronisation et audit
-- ---------------------------------------------------------------------
-- Centre créé ou modifié : abonnement recopié, changements journalisés.
create function private.centers_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscriptions (center_id, amount, billing_interval, current_period_end, status)
    values (new.id, coalesce(new.price, 0), new.billing_interval, new.current_period_end, new.status)
    on conflict (center_id) do nothing;
    perform private.log_platform_event(new.id, 'center.created',
      jsonb_build_object('name', new.name, 'slug', new.slug, 'status', new.status, 'center_type', new.center_type));
    return new;
  end if;

  update public.subscriptions s
  set amount = coalesce(new.price, 0),
      billing_interval = new.billing_interval,
      current_period_end = new.current_period_end,
      status = new.status
  where s.center_id = new.id
    and (s.amount, s.billing_interval, s.current_period_end, s.status)
        is distinct from (coalesce(new.price, 0), new.billing_interval, new.current_period_end, new.status);

  if new.status is distinct from old.status then
    perform private.log_platform_event(new.id, 'center.status_changed',
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.current_period_end is distinct from old.current_period_end then
    perform private.log_platform_event(new.id, 'center.period_changed',
      jsonb_build_object('from', old.current_period_end, 'to', new.current_period_end));
  end if;
  if new.center_type is distinct from old.center_type or new.custom_terms is distinct from old.custom_terms then
    perform private.log_platform_event(new.id, 'center.vocabulary_changed',
      jsonb_build_object('from', old.center_type, 'to', new.center_type));
  end if;
  if (new.price, new.billing_interval, new.grace_days) is distinct from (old.price, old.billing_interval, old.grace_days) then
    perform private.log_platform_event(new.id, 'center.pricing_changed',
      jsonb_build_object('price', new.price, 'billing_interval', new.billing_interval, 'grace_days', new.grace_days));
  end if;
  if (new.slug, new.name) is distinct from (old.slug, old.name) then
    perform private.log_platform_event(new.id, 'center.identity_changed',
      jsonb_build_object('name', new.name, 'slug', new.slug));
  end if;
  return new;
end;
$$;

create trigger centers_after_write
after insert or update on public.centers
for each row execute function private.centers_after_write();

-- Statut « annulé » : date d'annulation renseignée automatiquement.
create function private.centers_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;
  if new.status in ('active', 'past_due') and new.activated_at is null then
    new.activated_at := now();
  end if;
  return new;
end;
$$;

create trigger centers_before_update
before update on public.centers
for each row execute function private.centers_before_update();

create function private.subscriptions_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan is distinct from old.plan then
    perform private.log_platform_event(new.center_id, 'subscription.plan_changed',
      jsonb_build_object('from', old.plan, 'to', new.plan));
  end if;
  if new.auto_renew is distinct from old.auto_renew then
    perform private.log_platform_event(new.center_id, 'subscription.auto_renew_changed',
      jsonb_build_object('auto_renew', new.auto_renew));
  end if;
  return new;
end;
$$;

create trigger subscriptions_after_update
after update on public.subscriptions
for each row execute function private.subscriptions_after_update();

-- Paiement d'abonnement : période couverte d'un mois (ou d'un an) à partir de
-- l'échéance en cours (ou de la date de paiement si aucune échéance),
-- échéance repoussée, centre remis en service. Un centre annulé
-- n'encaisse plus de paiement.
create function private.subscription_payments_before_insert()
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
  return new;
end;
$$;

create trigger subscription_payments_before_insert
before insert on public.subscription_payments
for each row execute function private.subscription_payments_before_insert();

create function private.subscription_payments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.centers c
  set current_period_end = greatest(coalesce(c.current_period_end, new.period_covered_end), new.period_covered_end),
      status = 'active',
      activated_at = coalesce(c.activated_at, now())
  where c.id = new.center_id;

  update public.subscriptions s
  set current_period_start = new.period_covered_start
  where s.center_id = new.center_id
    and (s.current_period_start is null or s.current_period_start < new.period_covered_start);

  perform private.log_platform_event(new.center_id, 'subscription.payment_recorded',
    jsonb_build_object(
      'payment_id', new.id, 'amount', new.amount, 'method', new.method, 'reference', new.reference,
      'period_start', new.period_covered_start, 'period_end', new.period_covered_end));
  return new;
end;
$$;

create trigger subscription_payments_after_insert
after insert on public.subscription_payments
for each row execute function private.subscription_payments_after_insert();

-- Paiements : jamais modifiés ni supprimés (correction = écriture d'annulation future).
create trigger subscription_payments_append_only
before update or delete on public.subscription_payments
for each row execute function private.platform_events_append_only();

create function private.center_branding_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  perform private.log_platform_event(new.center_id, 'branding.updated',
    jsonb_build_object('brand_name', new.brand_name, 'custom_domain', new.custom_domain, 'domain_verified', new.domain_verified));
  return new;
end;
$$;

create trigger center_branding_before_write
before insert or update on public.center_branding
for each row execute function private.center_branding_before_write();

-- Abonnements des centres existants.
insert into public.subscriptions (center_id, amount, billing_interval, started_at, current_period_end, status)
select c.id, coalesce(c.price, 0), c.billing_interval, (c.created_at at time zone 'Africa/Casablanca')::date, c.current_period_end, c.status
from public.centers c
on conflict (center_id) do nothing;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.center_types enable row level security;
alter table public.center_branding enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.platform_events enable row level security;

-- Types et vocabulaire : lecture pour tout compte connecté.
create policy center_types_select on public.center_types
for select to authenticated
using (true);

-- Marque : lue par les comptes du centre (affichage de l'interface).
create policy center_branding_select on public.center_branding
for select to authenticated
using (center_id = (select private.auth_center_id()));

-- subscriptions, subscription_payments, platform_events : aucune policy
-- côté centre. Écritures uniquement via fonctions de la plateforme.
revoke all on public.center_types, public.center_branding, public.subscriptions,
  public.subscription_payments, public.platform_events from anon;
revoke insert, update, delete on public.center_types, public.center_branding from authenticated;
revoke all on public.subscriptions, public.subscription_payments, public.platform_events from authenticated;

revoke all on function private.log_platform_event(uuid, text, jsonb) from public, anon, authenticated;
