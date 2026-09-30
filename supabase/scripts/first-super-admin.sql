-- =====================================================================
-- CentroManager — mise en production : compte super-admin (propriétaire)
--
-- À exécuter UNE fois dans Supabase Studio → SQL Editor, après :
--   1. les migrations 015 et 016 (schéma et accès plateforme) ;
--   2. Authentication → Users → Add user → Send invitation (ou Create new
--      user avec « Auto Confirm User »), avec l'email du propriétaire.
--
-- Le super-admin n'appartient à aucun centre : il ne peut pas être
-- l'administrateur d'un centre (utiliser une autre adresse pour cela).
-- =====================================================================
do $$
declare
  v_email constant text := 'proprietaire@exemple.ma';  -- à remplacer
  v_name  constant text := 'Prénom Nom';               -- à remplacer
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);
  if v_user_id is null then
    raise exception 'Aucun utilisateur Auth avec l''email %. Créez-le d''abord (Authentication → Users).', v_email;
  end if;
  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'Cet utilisateur a déjà un profil (compte de centre).';
  end if;

  insert into public.profiles (id, center_id, full_name, role)
  values (v_user_id, null, v_name, 'super_admin');

  raise notice 'Super-admin % créé : console /platform.', v_email;
end;
$$;
