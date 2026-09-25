-- =====================================================================
-- CentroManager — mise en production : centre et premier administrateur
--
-- À exécuter UNE fois dans Supabase Studio → SQL Editor, après :
--   1. npx supabase db push (migrations appliquées) ;
--   2. Authentication → Users → Add user → Create new user, avec l'email
--      de l'administrateur et « Auto Confirm User » coché.
--
-- Remplacer les trois valeurs ci-dessous, puis exécuter. Les comptes
-- suivants (assistants, professeurs) se créent ensuite depuis l'application.
-- Ne jamais exécuter supabase/seed.sql en production.
-- =====================================================================
do $$
declare
  v_center_name constant text := 'Nom du centre';          -- à remplacer
  v_admin_email constant text := 'admin@exemple.ma';       -- à remplacer
  v_admin_name  constant text := 'Prénom Nom';             -- à remplacer
  v_user_id uuid;
  v_center_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_admin_email);
  if v_user_id is null then
    raise exception 'Aucun utilisateur Auth avec l''email %. Créez-le d''abord (Authentication → Users).', v_admin_email;
  end if;
  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'Cet utilisateur a déjà un profil.';
  end if;

  insert into public.centers (name) values (v_center_name) returning id into v_center_id;
  insert into public.profiles (id, center_id, full_name, role)
  values (v_user_id, v_center_id, v_admin_name, 'admin');

  raise notice 'Centre « % » et administrateur % créés.', v_center_name, v_admin_email;
end;
$$;
