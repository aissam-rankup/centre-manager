-- =====================================================================
-- CentroManager — 008 : hook « custom access token »
--
-- Ajoute au JWT les claims user_role, center_id et profile_active.
-- Ils servent uniquement aux redirections rapides du proxy Next.js.
-- L'autorisation réelle reste portée par la RLS et par la lecture du
-- profil côté serveur (un changement de rôle ou une désactivation est
-- donc effectif immédiatement, même avant le renouvellement du jeton).
--
-- En production : activer le hook dans le tableau de bord Supabase
-- (Authentication > Hooks > Customize Access Token).
-- =====================================================================

create function public.custom_access_token_hook(event jsonb)
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
    v_claims := jsonb_set(v_claims, '{center_id}', to_jsonb(v_center_id));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- Seul le service Auth peut exécuter le hook.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Le service Auth lit les profils (RLS active : policy dédiée).
grant select on table public.profiles to supabase_auth_admin;

create policy profiles_select_auth_admin on public.profiles
for select to supabase_auth_admin
using (true);
