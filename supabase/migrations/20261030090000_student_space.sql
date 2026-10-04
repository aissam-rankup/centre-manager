-- =====================================================================
-- CentroManager — 054 : espace élève (page 9, phase 5)
--
--  * L'élève connecté voit, à la marque de son centre, les ressources
--    PUBLIÉES des matières auxquelles il est inscrit (inscription active,
--    donc son niveau) : par matière et par type, consultation et
--    téléchargement par URL signée.
--  * Nouveautés : resource_views garde la première et la dernière
--    ouverture de chaque ressource par l'élève ; une ressource jamais
--    ouverte (ou republiée depuis) est signalée « nouvelle ».
--  * Échéances : ressources à rendre à venir.
--  * Aucune autre donnée : ni autre élève, ni finance, ni équipe (les noms
--    des professeurs passent par la fonction de lecture, pas par profiles).
-- =====================================================================

-- L'élève connecté (accès autorisé) est inscrit à cette matière.
create function private.student_takes_subject(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = private.auth_student_id()
      and e.subject_id = p_subject_id
      and e.active
  );
$$;

-- ---------------------------------------------------------------------
-- Lecture des ressources par l'élève
-- ---------------------------------------------------------------------
create policy learning_resources_select_student on public.learning_resources
for select to authenticated
using (is_published and private.student_takes_subject(subject_id));

create or replace function private.can_read_resource_file(p_name text)
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
         or (r.is_published and private.student_takes_subject(r.subject_id))
       )
    from private.resource_of_file(p_name) r
  ), false);
$$;

-- ---------------------------------------------------------------------
-- Ouvertures (nouveautés)
-- ---------------------------------------------------------------------
create table public.resource_views (
  student_id uuid not null references public.students (id) on delete cascade,
  resource_id uuid not null references public.learning_resources (id) on delete cascade,
  center_id uuid not null references public.centers (id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  open_count integer not null default 1 check (open_count >= 1),
  primary key (student_id, resource_id)
);

create index resource_views_resource_idx on public.resource_views (resource_id);
create index resource_views_center_idx on public.resource_views (center_id);

comment on table public.resource_views is 'Ouvertures des ressources par chaque élève (nouveautés de l''espace élève).';

alter table public.resource_views
  add column is_demo boolean not null default coalesce(nullif(current_setting('centromanager.demo_seed', true), '')::boolean, false);

alter table public.resource_views enable row level security;

-- L'élève voit ses ouvertures ; l'auteur et l'équipe voient qui a ouvert.
create policy resource_views_select on public.resource_views
for select to authenticated
using (
  student_id = private.auth_student_id()
  or ((select private.is_staff()) and center_id = (select private.auth_center_id()))
  or exists (
    select 1 from public.learning_resources r
    where r.id = resource_views.resource_id and r.author_id = (select auth.uid())
  )
);

create policy resource_views_module on public.resource_views
as restrictive for all to authenticated
using (private.center_has_module(center_id, 'lms'))
with check (private.center_has_module(center_id, 'lms'));

revoke all on public.resource_views from anon;
revoke insert, update, delete, truncate on public.resource_views from authenticated;
grant select on public.resource_views to authenticated;

-- Ouverture d'une ressource par l'élève connecté (appelée en servant le fichier).
create function public.mark_resource_opened(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.auth_student_id();
  v_resource public.learning_resources;
begin
  if v_student is null then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_resource from public.learning_resources r where r.id = p_resource_id;
  if v_resource.id is null or not v_resource.is_published or not private.student_takes_subject(v_resource.subject_id) then
    raise exception 'Ressource introuvable.' using errcode = 'P0002';
  end if;

  insert into public.resource_views as v (student_id, resource_id, center_id)
  values (v_student, p_resource_id, v_resource.center_id)
  on conflict (student_id, resource_id) do update
  set last_opened_at = now(), open_count = v.open_count + 1;
end;
$$;

-- ---------------------------------------------------------------------
-- Ressources de l'élève connecté
-- ---------------------------------------------------------------------
create function public.my_resources()
returns table (
  resource_id uuid,
  type public.resource_type,
  title text,
  description text,
  subject_id uuid,
  subject_name text,
  level_name text,
  author_name text,
  file_name text,
  file_type text,
  file_size integer,
  published_at timestamptz,
  due_date date,
  -- Jamais ouverte, ou republiée depuis la dernière ouverture.
  is_new boolean,
  last_opened_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.auth_student_id();
begin
  if v_student is null then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
  select r.id, r.type, r.title, r.description, r.subject_id, s.name, l.name, p.full_name,
         r.file_name, r.file_type, r.file_size, r.published_at, r.due_date,
         v.last_opened_at is null or v.last_opened_at < r.published_at,
         v.last_opened_at
  from public.learning_resources r
  join public.subjects s on s.id = r.subject_id
  join public.levels l on l.id = r.level_id
  left join public.profiles p on p.id = r.author_id
  left join public.resource_views v on v.resource_id = r.id and v.student_id = v_student
  where r.is_published
    and r.file_url is not null
    and exists (
      select 1 from public.enrollments e
      where e.student_id = v_student and e.subject_id = r.subject_id and e.active
    )
  order by r.published_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Modules : le middleware lit aussi ceux du centre de l'élève
-- ---------------------------------------------------------------------
create or replace function public.my_modules()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.center_module_keys(coalesce(
    private.auth_center_id(),
    (select a.center_id from public.student_accounts a where a.user_id = (select auth.uid()) and a.active)
  )), '{}');
$$;

insert into private.module_resources (name, module_key, kind) values
  ('resource_views', 'lms', 'table'),
  ('my_resources', 'lms', 'function'),
  ('mark_resource_opened', 'lms', 'function');

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke all on function private.student_takes_subject(uuid) from public, anon;
grant execute on function private.student_takes_subject(uuid) to authenticated;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array['public.mark_resource_opened(uuid)', 'public.my_resources()'] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
