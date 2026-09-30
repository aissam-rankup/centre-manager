-- =====================================================================
-- CentroManager — 019 : marque blanche
--
--  * formule white_label : l'interface du centre prend son nom, son logo,
--    sa favicon et ses couleurs ; la marque de la plateforme n'apparaît
--    plus côté centre. Formule standard : aucun réglage de marque appliqué
--    ni modifiable par le centre ;
--  * réglages : super-admin (tous, y compris le domaine) ; administrateur
--    d'un centre en marque blanche (tous sauf le domaine et sa
--    vérification) ;
--  * images (logo, favicon, fond de connexion) : bucket public
--    « center-branding », un dossier par centre ;
--  * résolution d'un centre par adresse (sous-domaine = slug, ou domaine
--    personnalisé vérifié) pour l'écran de connexion, sans session.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Images de marque
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('center-branding', 'center-branding', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Centre dont l'utilisateur peut modifier la marque (NULL : aucun).
create function private.can_edit_branding(p_center_id uuid)
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
         and exists (select 1 from public.subscriptions s where s.center_id = p_center_id and s.plan = 'white_label')
       )
     );
$$;

create function private.can_write_branding_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(p_name))[1] ~ '^[0-9a-f-]{36}$'
     and private.can_edit_branding(((storage.foldername(p_name))[1])::uuid);
$$;

create policy center_branding_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'center-branding' and private.can_write_branding_file(name));

create policy center_branding_update on storage.objects
for update to authenticated
using (bucket_id = 'center-branding' and private.can_write_branding_file(name))
with check (bucket_id = 'center-branding' and private.can_write_branding_file(name));

create policy center_branding_delete on storage.objects
for delete to authenticated
using (bucket_id = 'center-branding' and private.can_write_branding_file(name));

-- ---------------------------------------------------------------------
-- Écriture des réglages
-- ---------------------------------------------------------------------
-- p_custom_domain : ignoré pour un administrateur de centre (réservé au
-- super-admin). Un domaine modifié doit être vérifié à nouveau.
create function public.update_center_branding(
  p_center_id uuid,
  p_brand_name text,
  p_logo_url text,
  p_favicon_url text,
  p_primary_color text,
  p_secondary_color text,
  p_accent_color text,
  p_login_background_url text,
  p_email_sender_name text,
  p_support_email text,
  p_support_phone text,
  p_custom_domain text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super boolean := private.is_super_admin();
  v_domain text;
begin
  if not private.can_edit_branding(p_center_id) then
    raise exception 'Réglages de marque non modifiables.' using errcode = '42501';
  end if;
  if v_super then
    perform private.require_super_admin();
  end if;

  select b.custom_domain into v_domain from public.center_branding b where b.center_id = p_center_id;
  if v_super then
    v_domain := nullif(lower(btrim(coalesce(p_custom_domain, ''))), '');
  end if;

  insert into public.center_branding as b (
    center_id, brand_name, logo_url, favicon_url, primary_color, secondary_color, accent_color,
    login_background_url, email_sender_name, support_email, support_phone, custom_domain, domain_verified
  ) values (
    p_center_id, nullif(btrim(p_brand_name), ''), nullif(btrim(p_logo_url), ''), nullif(btrim(p_favicon_url), ''),
    nullif(lower(btrim(p_primary_color)), ''), nullif(lower(btrim(p_secondary_color)), ''), nullif(lower(btrim(p_accent_color)), ''),
    nullif(btrim(p_login_background_url), ''), nullif(btrim(p_email_sender_name), ''),
    nullif(btrim(p_support_email), ''), nullif(btrim(p_support_phone), ''), v_domain, false
  )
  on conflict (center_id) do update set
    brand_name = excluded.brand_name,
    logo_url = excluded.logo_url,
    favicon_url = excluded.favicon_url,
    primary_color = excluded.primary_color,
    secondary_color = excluded.secondary_color,
    accent_color = excluded.accent_color,
    login_background_url = excluded.login_background_url,
    email_sender_name = excluded.email_sender_name,
    support_email = excluded.support_email,
    support_phone = excluded.support_phone,
    custom_domain = excluded.custom_domain,
    domain_verified = case when excluded.custom_domain is not distinct from b.custom_domain then b.domain_verified else false end;
end;
$$;

-- Vérification du domaine : faite par la Server Action (DNS), enregistrée ici.
create function public.platform_set_domain_verified(p_center_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  update public.center_branding
  set domain_verified = p_verified and custom_domain is not null
  where center_id = p_center_id;
  if not found then
    raise exception 'Aucun domaine personnalisé pour ce centre.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Lecture de la marque
-- ---------------------------------------------------------------------
-- Marque appliquée (formule white_label uniquement), sans le domaine.
create function private.applied_branding(p_center_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(b) - 'center_id' - 'custom_domain' - 'domain_verified' - 'updated_at'
  from public.center_branding b
  join public.subscriptions s on s.center_id = b.center_id and s.plan = 'white_label'
  where b.center_id = p_center_id;
$$;

-- Écran de connexion : centre désigné par son adresse (sous-domaine ou
-- domaine personnalisé vérifié). Accessible sans session : nom et marque
-- publique uniquement.
create function public.center_for_host(p_slug text default null, p_domain text default null)
returns table (center_id uuid, name text, slug text, white_label boolean, branding jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.slug, s.plan = 'white_label', private.applied_branding(c.id)
  from public.centers c
  join public.subscriptions s on s.center_id = c.id
  left join public.center_branding b on b.center_id = c.id
  where c.status <> 'cancelled'
    and (
      (p_slug is not null and c.slug = lower(p_slug))
      or (p_domain is not null and b.custom_domain = lower(p_domain) and b.domain_verified and s.plan = 'white_label')
    )
  limit 1;
$$;

-- Accès du compte connecté : formule et marque en plus.
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
  plan public.subscription_plan,
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
         sub.plan,
         private.applied_branding(c.id)
  from target t
  join public.centers c on c.id = t.center_id
  join public.center_types ty on ty.code = c.center_type
  left join public.subscriptions sub on sub.center_id = c.id
  cross join public.platform_settings st;
$$;

-- Réglages complets pour l'édition (super-admin, ou admin en marque blanche).
create function public.center_branding_settings(p_center_id uuid)
returns table (
  plan public.subscription_plan,
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
  select s.plan, private.can_edit_branding(p_center_id),
         b.brand_name, b.logo_url, b.favicon_url, b.primary_color, b.secondary_color, b.accent_color,
         b.login_background_url, b.email_sender_name, b.support_email, b.support_phone,
         b.custom_domain, coalesce(b.domain_verified, false)
  from public.subscriptions s
  left join public.center_branding b on b.center_id = s.center_id
  where s.center_id = p_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke all on function public.center_for_host(text, text) from public;
grant execute on function public.center_for_host(text, text) to anon, authenticated;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.my_center_access()',
    'public.update_center_branding(uuid, text, text, text, text, text, text, text, text, text, text, text)',
    'public.platform_set_domain_verified(uuid, boolean)',
    'public.center_branding_settings(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.can_edit_branding(uuid) from public, anon;
grant execute on function private.can_edit_branding(uuid) to authenticated;
revoke all on function private.can_write_branding_file(text) from public, anon;
grant execute on function private.can_write_branding_file(text) to authenticated;
revoke all on function private.applied_branding(uuid) from public, anon, authenticated;
