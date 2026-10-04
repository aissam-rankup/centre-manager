-- =====================================================================
-- CentroManager — 053 : ressources pédagogiques (page 9, phase 4)
--
--  * Le professeur publie des ressources (exercice, examen, résumé de
--    cours, autre) pour une de SES matières et son niveau : titre,
--    description, un fichier (PDF ou image), échéance facultative pour un
--    exercice ou un examen à rendre. Brouillon ou publiée ; il les modifie,
--    les dépublie, les supprime. Chaque ressource garde son auteur.
--  * Cloisonnement : par centre, et le professeur à ses propres matières et
--    niveaux (teacher_assignments). Module « plateforme pédagogique » (lms)
--    requis : RLS restrictive, fonction pre-request de l'API, stockage.
--  * Fichiers : bucket privé « learning-resources »,
--    <centre>/<ressource>/<fichier> ; lecture par URL signée seulement.
--  * L'élève (phase 5) lira les ressources publiées de ses matières.
-- =====================================================================

create type public.resource_type as enum ('exercise', 'exam', 'summary', 'other');

create table public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  subject_id uuid not null,
  level_id uuid not null,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  type public.resource_type not null,
  title text not null check (length(btrim(title)) between 1 and 150),
  description text check (description is null or length(btrim(description)) between 1 and 2000),
  -- Chemin dans le bucket learning-resources, et ce qu'il faut pour l'afficher.
  file_url text,
  file_name text check (file_name is null or length(file_name) <= 200),
  file_type text check (file_type is null or file_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  file_size integer check (file_size is null or file_size between 1 and 15728640),
  is_published boolean not null default false,
  published_at timestamptz,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, level_id) references public.subjects (id, level_id) on delete cascade,
  foreign key (level_id, center_id) references public.levels (id, center_id) on delete cascade,
  -- Échéance : seulement pour ce qui se rend.
  check (due_date is null or type in ('exercise', 'exam')),
  -- Publiée : avec son fichier.
  check (not is_published or file_url is not null)
);

create index learning_resources_center_idx on public.learning_resources (center_id, published_at desc);
create index learning_resources_subject_idx on public.learning_resources (subject_id, level_id);
create index learning_resources_level_idx on public.learning_resources (level_id);
create index learning_resources_author_idx on public.learning_resources (author_id, created_at desc);

comment on table public.learning_resources is
  'Ressources publiées par un professeur pour une de ses matières (plateforme pédagogique, module lms).';

-- Le professeur connecté enseigne cette matière à ce niveau.
create function private.teaches_subject_level(p_subject_id uuid, p_level_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_role() = 'teacher'
     and exists (
       select 1 from public.teacher_assignments ta
       where ta.teacher_id = (select auth.uid()) and ta.subject_id = p_subject_id and ta.level_id = p_level_id
     );
$$;

-- Centre de la matière, horodatages, date de publication.
create function private.learning_resources_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.subject_center_id(new.subject_id) is distinct from new.center_id then
    raise exception 'La matière doit appartenir au centre de la ressource.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.author_id, new.center_id) is distinct from (old.author_id, old.center_id) then
    raise exception 'L''auteur et le centre d''une ressource ne changent pas.' using errcode = '42501';
  end if;
  new.title := btrim(new.title);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  -- Chaque mise en ligne date la publication (une ressource republiée redevient une nouveauté).
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    new.published_at := now();
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger learning_resources_before_write
before insert or update on public.learning_resources
for each row execute function private.learning_resources_before_write();

create trigger learning_resources_deny_support_writes
before insert or update or delete on public.learning_resources
for each row execute function private.deny_support_writes();

-- ---------------------------------------------------------------------
-- RLS : le professeur auteur écrit ; l'équipe du centre lit
-- ---------------------------------------------------------------------
alter table public.learning_resources enable row level security;

create policy learning_resources_select on public.learning_resources
for select to authenticated
using (
  author_id = (select auth.uid())
  or ((select private.is_staff()) and center_id = (select private.auth_center_id()))
);

create policy learning_resources_insert on public.learning_resources
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and center_id = (select private.auth_center_id())
  and private.teaches_subject_level(subject_id, level_id)
);

create policy learning_resources_update on public.learning_resources
for update to authenticated
using (author_id = (select auth.uid()))
with check (
  author_id = (select auth.uid())
  and center_id = (select private.auth_center_id())
  and private.teaches_subject_level(subject_id, level_id)
);

create policy learning_resources_delete on public.learning_resources
for delete to authenticated
using (author_id = (select auth.uid()));

-- Module « plateforme pédagogique » : RLS restrictive et pre-request de l'API.
insert into private.module_resources (name, module_key, kind) values ('learning_resources', 'lms', 'table');

create policy learning_resources_module on public.learning_resources
as restrictive for all to authenticated
using (private.center_has_module(center_id, 'lms'))
with check (private.center_has_module(center_id, 'lms'));

revoke all on public.learning_resources from anon;
grant select, insert, update, delete on public.learning_resources to authenticated;

-- ---------------------------------------------------------------------
-- Fichiers : bucket privé, <centre>/<ressource>/<fichier>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-resources', 'learning-resources', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ressource désignée par le chemin d'un fichier (null si le chemin est invalide).
create function private.resource_of_file(p_name text)
returns public.learning_resources
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.learning_resources r
  where (storage.foldername(p_name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
    and r.id = ((storage.foldername(p_name))[2])::uuid
    and r.center_id = ((storage.foldername(p_name))[1])::uuid;
$$;

-- Écriture : l'auteur, dans son centre, avec le module.
create function private.can_write_resource_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.author_id = (select auth.uid())
       and r.center_id = private.auth_center_id()
       and private.center_has_module(r.center_id, 'lms')
       and not private.in_support_write()
    from private.resource_of_file(p_name) r
  ), false);
$$;

-- Lecture : l'auteur et l'équipe du centre (l'élève s'y ajoute en phase 5).
create function private.can_read_resource_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.center_has_module(r.center_id, 'lms')
       and (
         r.author_id = (select auth.uid())
         or (private.is_staff() and r.center_id = private.auth_center_id())
       )
    from private.resource_of_file(p_name) r
  ), false);
$$;

create policy learning_resources_files_select on storage.objects
for select to authenticated
using (bucket_id = 'learning-resources' and private.can_read_resource_file(name));

create policy learning_resources_files_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'learning-resources' and private.can_write_resource_file(name));

create policy learning_resources_files_update on storage.objects
for update to authenticated
using (bucket_id = 'learning-resources' and private.can_write_resource_file(name))
with check (bucket_id = 'learning-resources' and private.can_write_resource_file(name));

create policy learning_resources_files_delete on storage.objects
for delete to authenticated
using (bucket_id = 'learning-resources' and private.can_write_resource_file(name));

-- ---------------------------------------------------------------------
-- Données de démonstration et droits des fonctions
-- ---------------------------------------------------------------------
alter table public.learning_resources
  add column is_demo boolean not null default coalesce(nullif(current_setting('centromanager.demo_seed', true), '')::boolean, false);

revoke all on function private.teaches_subject_level(uuid, uuid) from public, anon;
grant execute on function private.teaches_subject_level(uuid, uuid) to authenticated;
revoke all on function private.resource_of_file(text) from public, anon, authenticated;
revoke all on function private.can_write_resource_file(text) from public, anon;
grant execute on function private.can_write_resource_file(text) to authenticated;
revoke all on function private.can_read_resource_file(text) from public, anon;
grant execute on function private.can_read_resource_file(text) to authenticated;
revoke all on function private.learning_resources_before_write() from public, anon, authenticated;
