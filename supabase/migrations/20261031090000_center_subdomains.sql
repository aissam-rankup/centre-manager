-- =====================================================================
-- Page 10 : un sous-domaine par centre (<slug>.<domaine racine>).
--
--  * noms réservés : une seule fonction (contrainte, slug par défaut,
--    vérification de disponibilité) ;
--  * historique des adresses : l'ancienne adresse d'un centre redirige vers
--    la nouvelle et ne peut pas être reprise par un autre centre ;
--  * center_for_host : signale une ancienne adresse (redirection 301) ;
--  * console : disponibilité d'une adresse et changement d'adresse
--    (super-admin seulement, l'adresse n'est plus modifiable avec les
--    informations du centre).
--
-- L'adresse n'est jamais une autorisation : la RLS reste fondée sur le
-- centre du profil. Aucune politique existante n'est modifiée.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Noms réservés
-- ---------------------------------------------------------------------
create function private.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_slug, '') in (
    'www', 'app', 'admin', 'api', 'platform', 'plateforme', 'test', 'mail', 'ftp', 'static', 'assets',
    'support', 'help', 'status', 'dev', 'staging'
  );
$$;

-- Format d'une adresse : minuscules, chiffres, tirets (ni au début, ni à la fin, ni doublés), 2 à 63 caractères.
create function private.is_valid_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(p_slug) between 2 and 63, false);
$$;

-- ---------------------------------------------------------------------
-- Historique des adresses
-- ---------------------------------------------------------------------
create table public.center_slug_history (
  old_slug text primary key,
  center_id uuid not null references public.centers (id) on delete cascade,
  changed_at timestamptz not null default now()
);

create index center_slug_history_center_id_idx on public.center_slug_history (center_id);

-- Aucun accès direct (RLS sans politique) : écriture par les triggers, lecture
-- par la console (platform_center_slug_history) et par center_for_host.
alter table public.center_slug_history enable row level security;
revoke all on table public.center_slug_history from anon, authenticated;

-- Adresse d'un centre : refusée si réservée ou encore portée par l'historique
-- d'un autre centre. Un centre peut reprendre l'une de ses anciennes adresses.
create function private.centers_slug_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;
  if private.is_reserved_slug(new.slug) then
    raise exception 'Cette adresse est réservée.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.center_slug_history h
    where h.old_slug = new.slug and (tg_op = 'INSERT' or h.center_id <> new.id)
  ) then
    raise exception 'Cette adresse est déjà utilisée par un autre centre.' using errcode = '23505';
  end if;
  return new;
end;
$$;

-- Le nom « centers_slug_guard » suit « centers_default_slug » : le slug par défaut est posé avant.
create trigger centers_slug_guard
before insert or update of slug on public.centers
for each row execute function private.centers_slug_guard();

create function private.centers_record_slug_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    -- Ancienne adresse reprise par son propre centre : elle n'est plus une redirection.
    delete from public.center_slug_history h where h.old_slug = new.slug and h.center_id = new.id;
    insert into public.center_slug_history (old_slug, center_id) values (old.slug, new.id)
    on conflict (old_slug) do update set center_id = excluded.center_id, changed_at = now();
  end if;
  return new;
end;
$$;

revoke all on function private.centers_record_slug_history() from public, anon, authenticated;

create trigger centers_record_slug_history
after update of slug on public.centers
for each row execute function private.centers_record_slug_history();

-- ---------------------------------------------------------------------
-- Adresses existantes : inchangées, sauf si elles sont devenues réservées
-- (suffixe numérique ; l'ancienne adresse est gardée dans l'historique).
-- ---------------------------------------------------------------------
do $$
declare
  v_center record;
  v_slug text;
  v_n integer;
begin
  for v_center in select c.id, c.slug from public.centers c where private.is_reserved_slug(c.slug) order by c.created_at, c.id loop
    v_n := 2;
    v_slug := v_center.slug || '-' || v_n;
    while exists (select 1 from public.centers c where c.slug = v_slug)
       or exists (select 1 from public.center_slug_history h where h.old_slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_center.slug || '-' || v_n;
    end loop;
    -- Le garde ne refuse que la nouvelle adresse : elle n'est pas réservée.
    update public.centers set slug = v_slug where id = v_center.id;
  end loop;
end;
$$;

-- L'ancienne adresse réservée reste dans l'historique mais ne doit jamais
-- être servie : center_for_host ignore les noms réservés.

alter table public.centers
  drop constraint centers_slug_format_check,
  add constraint centers_slug_format_check check (
    private.is_valid_slug(slug) and not private.is_reserved_slug(slug)
  );

-- Slug par défaut : évite aussi les noms réservés et les anciennes adresses.
create or replace function private.centers_default_slug()
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
     or exists (select 1 from public.center_slug_history h where h.old_slug = v_slug)
     or private.is_reserved_slug(v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  new.slug := v_slug;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Centre d'une adresse (sans session) : ancienne adresse signalée par
-- « moved » (le slug renvoyé est alors l'adresse actuelle).
-- ---------------------------------------------------------------------
drop function public.center_for_host(text, text);

create function public.center_for_host(p_slug text default null, p_domain text default null)
returns table (center_id uuid, name text, slug text, white_label boolean, branding jsonb, moved boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select c.id, false as moved
    from public.centers c
    where p_slug is not null and c.slug = lower(p_slug)
    union all
    select h.center_id, true
    from public.center_slug_history h
    where p_slug is not null and h.old_slug = lower(p_slug) and not private.is_reserved_slug(h.old_slug)
    union all
    select b.center_id, false
    from public.center_branding b
    where p_domain is not null and b.custom_domain = lower(p_domain) and b.domain_verified
      and private.center_has_module(b.center_id, 'white_label')
  )
  select c.id, c.name, c.slug, private.center_has_module(c.id, 'white_label'), private.applied_branding(c.id), t.moved
  from target t
  join public.centers c on c.id = t.id
  where c.status <> 'cancelled'
  order by t.moved
  limit 1;
$$;

revoke all on function public.center_for_host(text, text) from public;
grant execute on function public.center_for_host(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Console : disponibilité et changement d'adresse (super-admin)
-- ---------------------------------------------------------------------
-- Résultat : 'available', 'invalid', 'reserved', 'taken' ou 'current'
-- (adresse actuelle du centre p_center_id).
create function public.platform_slug_availability(p_slug text, p_center_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if not private.is_valid_slug(p_slug) then
    return 'invalid';
  end if;
  if private.is_reserved_slug(p_slug) then
    return 'reserved';
  end if;
  if p_center_id is not null and exists (select 1 from public.centers c where c.id = p_center_id and c.slug = p_slug) then
    return 'current';
  end if;
  if exists (select 1 from public.centers c where c.slug = p_slug)
     or exists (
       select 1 from public.center_slug_history h
       where h.old_slug = p_slug and h.center_id is distinct from p_center_id
     ) then
    return 'taken';
  end if;
  return 'available';
end;
$$;

create function public.platform_change_center_slug(p_center_id uuid, p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_availability text;
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.centers c where c.id = p_center_id) then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  v_availability := public.platform_slug_availability(p_slug, p_center_id);
  if v_availability = 'invalid' then
    raise exception 'Adresse invalide : minuscules, chiffres et tirets, 2 à 63 caractères.' using errcode = '22023';
  elsif v_availability = 'reserved' then
    raise exception 'Cette adresse est réservée.' using errcode = '22023';
  elsif v_availability = 'taken' then
    raise exception 'Cette adresse est déjà utilisée par un autre centre.' using errcode = '23505';
  elsif v_availability = 'current' then
    return;
  end if;
  update public.centers set slug = p_slug where id = p_center_id;
end;
$$;

-- Informations du centre : l'adresse n'en fait plus partie (changement dédié ci-dessus).
drop function public.platform_update_center(uuid, text, text, text, jsonb, text, text, text, text);

create function public.platform_update_center(
  p_center_id uuid,
  p_name text,
  p_center_type text,
  p_custom_terms jsonb,
  p_owner_contact_name text,
  p_owner_contact_phone text,
  p_owner_contact_email text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();

  update public.centers
  set name = btrim(p_name),
      center_type = p_center_type,
      custom_terms = coalesce(p_custom_terms, '{}'),
      owner_contact_name = nullif(btrim(p_owner_contact_name), ''),
      owner_contact_phone = nullif(btrim(p_owner_contact_phone), ''),
      owner_contact_email = nullif(btrim(p_owner_contact_email), ''),
      notes = nullif(btrim(p_notes), '')
  where id = p_center_id;
  if not found then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- Anciennes adresses d'un centre (console), de la plus récente à la plus ancienne.
create function public.platform_center_slug_history(p_center_id uuid)
returns table (old_slug text, changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
    select h.old_slug, h.changed_at
    from public.center_slug_history h
    where h.center_id = p_center_id
    order by h.changed_at desc, h.old_slug;
end;
$$;

-- Centre d'un compte (domaine racine, transition vers le sous-domaine) : adresse du centre de l'appelant.
create function public.my_center_slug()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.slug
  from public.centers c
  where c.id = coalesce(
    (select p.center_id from public.profiles p where p.id = auth.uid()),
    (select a.center_id from public.student_accounts a where a.user_id = auth.uid())
  );
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.platform_slug_availability(text, uuid)',
    'public.platform_change_center_slug(uuid, text)',
    'public.platform_center_slug_history(uuid)',
    'public.platform_update_center(uuid, text, text, jsonb, text, text, text, text)',
    'public.my_center_slug()'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
