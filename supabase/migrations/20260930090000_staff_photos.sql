-- =====================================================================
-- CentroManager — 013 : photos de l'équipe (admin, assistant, professeur)
--
-- Règle validée : chacun change sa propre photo ; l'administrateur peut
-- changer celle de n'importe quel membre de son centre.
--
-- Bucket privé « staff-photos ». Chemin : {center_id}/{profile_id}/{horodatage}.jpg
-- (nom unique à chaque changement : la nouvelle photo s'affiche sans cache).
-- Les photos sont servies par URL signée.
-- =====================================================================

alter table public.profiles add column photo_url text;

comment on column public.profiles.photo_url is
  'Chemin de la photo dans le bucket staff-photos : {center_id}/{profile_id}/{fichier}.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-photos',
  'staff-photos',
  false,
  2097152, -- 2 Mo (photos compressées côté client à 800 px)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Dossier modifiable par l'utilisateur connecté : le sien, ou tout son centre pour l'admin.
create function private.can_write_staff_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(p_name))[1] = private.auth_center_id()::text
    and (
      private.is_admin()
      or (storage.foldername(p_name))[2] = (select auth.uid())::text
    );
$$;

-- Lecture : tous les membres actifs du même centre.
create policy staff_photos_select_same_center on storage.objects
for select to authenticated
using (
  bucket_id = 'staff-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
);

create policy staff_photos_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'staff-photos' and private.can_write_staff_photo(name));

create policy staff_photos_update on storage.objects
for update to authenticated
using (bucket_id = 'staff-photos' and private.can_write_staff_photo(name))
with check (bucket_id = 'staff-photos' and private.can_write_staff_photo(name));

create policy staff_photos_delete on storage.objects
for delete to authenticated
using (bucket_id = 'staff-photos' and private.can_write_staff_photo(name));

-- ---------------------------------------------------------------------
-- Sa propre photo : seule colonne du profil qu'un non-admin peut changer.
-- ---------------------------------------------------------------------
create function public.set_my_photo(p_path text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or v_center_id is null then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if p_path is not null and p_path not like v_center_id::text || '/' || v_user_id::text || '/%' then
    raise exception 'Chemin de photo invalide.' using errcode = '22023';
  end if;

  update public.profiles set photo_url = p_path where id = v_user_id;
end;
$$;

revoke execute on function public.set_my_photo(text) from public, anon;
grant execute on function public.set_my_photo(text) to authenticated;

-- Annuaire admin : photo en plus.
drop function public.admin_list_users();

create function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  role public.user_role,
  phone text,
  active boolean,
  created_at timestamptz,
  email text,
  last_sign_in_at timestamptz,
  photo_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.role, p.phone, p.active, p.created_at,
         u.email::text, u.last_sign_in_at, p.photo_url
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.center_id = private.auth_center_id()
  order by p.active desc, p.role, p.full_name;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
