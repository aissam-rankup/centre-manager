-- =====================================================================
-- CentroManager — 007 : bucket Storage « student-photos »
--
-- Bucket privé. Convention de chemin : {center_id}/{nom-de-fichier}.
-- Le premier segment du chemin sert au cloisonnement par centre.
-- Les photos sont servies par URL signée.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-photos',
  'student-photos',
  false,
  2097152, -- 2 Mo (les photos sont compressées côté client à 800 px)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Lecture : tous les utilisateurs actifs du même centre.
create policy student_photos_select_same_center on storage.objects
for select to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
);

-- Dépôt : admin et assistant, dans le dossier de leur centre.
create policy student_photos_insert_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_staff())
);

-- Remplacement et suppression : admin.
create policy student_photos_update_admin on storage.objects
for update to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_admin())
)
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
);

create policy student_photos_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_admin())
);
