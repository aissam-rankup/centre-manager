-- =====================================================================
-- CentroManager — 052 : rôle élève (page 9, phase 3)
--
--  * Nouveau rôle student_user, distinct des trois rôles internes : un
--    compte élève n'a pas de profil d'équipe (public.profiles) ; il vit
--    dans student_accounts, rattaché à la fiche de l'élève. Toutes les
--    règles existantes de l'équipe (is_staff, auth_center_id…) l'ignorent
--    donc : il n'accède à aucune donnée financière ni à un autre élève.
--  * Ouvert par l'accueil ou l'admin, à l'inscription ou plus tard,
--    uniquement si le centre a la plateforme pédagogique (module lms).
--    Le compte Auth est créé par la Server Action (clé service_role,
--    côté serveur) : identifiant = code fourni par le centre (8 caractères),
--    mot de passe généré, affiché une fois. Aucune donnée personnelle
--    demandée à l'élève.
--  * Désactivation en un clic quand l'élève quitte le centre : le compte
--    reste, l'accès est coupé (et le compte Auth bloqué par la Server
--    Action) ; rien n'est supprimé. Réactivable.
--  * Jeton : user_role = student_user, center_id, center_status,
--    profile_active (= compte actif).
-- =====================================================================

create table public.student_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  student_id uuid not null unique,
  center_id uuid not null references public.centers (id) on delete cascade,
  login_code text not null unique check (login_code ~ '^[A-Z0-9]{8}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id) on delete set null,
  foreign key (student_id, center_id) references public.students (id, center_id) on delete cascade,
  check (active or deactivated_at is not null)
);

create index student_accounts_center_idx on public.student_accounts (center_id);
create index student_accounts_created_by_idx on public.student_accounts (created_by);
create index student_accounts_deactivated_by_idx on public.student_accounts (deactivated_by);

comment on table public.student_accounts is
  'Accès élève (rôle student_user) : un compte par élève, ouvert par le centre, désactivable sans suppression.';

-- ---------------------------------------------------------------------
-- Élève connecté
-- ---------------------------------------------------------------------
-- Fiche de l'élève connecté, si son accès est ouvert, actif, son centre
-- en service et la plateforme pédagogique incluse dans son offre.
create function private.auth_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.student_id
  from public.student_accounts a
  join public.centers c on c.id = a.center_id
  where a.user_id = (select auth.uid())
    and a.active
    and c.status not in ('suspended', 'cancelled')
    and private.center_has_module(a.center_id, 'lms');
$$;

create function public.my_student_access()
returns table (
  student_id uuid,
  full_name text,
  level_id uuid,
  level_name text,
  center_id uuid,
  center_name text,
  center_status public.center_status,
  active boolean,
  -- Accès autorisé : compte actif, centre en service, module inclus.
  allowed boolean,
  vocabulary jsonb,
  branding jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select st.id, st.full_name, st.level_id, l.name, c.id, c.name, c.status, a.active,
         a.active and c.status not in ('suspended', 'cancelled') and private.center_has_module(c.id, 'lms'),
         ty.terms || c.custom_terms,
         private.applied_branding(c.id)
  from public.student_accounts a
  join public.students st on st.id = a.student_id
  join public.levels l on l.id = st.level_id
  join public.centers c on c.id = a.center_id
  join public.center_types ty on ty.code = c.center_type
  where a.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Ouverture, désactivation, réactivation (accueil et admin)
-- ---------------------------------------------------------------------
-- Le compte Auth vient d'être créé par la Server Action (service_role) ;
-- il est rattaché ici à la fiche, dans le centre de l'appelant.
create function public.register_student_account(p_student_id uuid, p_user_id uuid, p_login_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center uuid := private.auth_center_id();
begin
  if not private.is_staff() or private.student_center_id(p_student_id) is distinct from v_center then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  perform private.require_module(v_center, 'lms');
  if exists (select 1 from public.student_accounts a where a.student_id = p_student_id) then
    raise exception 'Cet élève a déjà un accès.' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id)
     or exists (select 1 from public.student_accounts a where a.user_id = p_user_id) then
    raise exception 'Ce compte appartient déjà à quelqu''un.' using errcode = '22023';
  end if;
  -- Seul le compte technique de ce code (créé à l'instant par la Server Action) se rattache.
  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id and u.email = 'eleve-' || lower(btrim(p_login_code)) || '@eleves.centromanager.invalid'
  ) then
    raise exception 'Compte de connexion invalide pour ce code.' using errcode = '22023';
  end if;

  insert into public.student_accounts (user_id, student_id, center_id, login_code, created_by)
  values (p_user_id, p_student_id, v_center, upper(btrim(p_login_code)), (select auth.uid()));
end;
$$;

-- Renvoie le compte Auth concerné (la Server Action le bloque ou le débloque).
create function public.set_student_account_active(p_student_id uuid, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center uuid := private.auth_center_id();
  v_user uuid;
begin
  if not private.is_staff() or private.student_center_id(p_student_id) is distinct from v_center then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_active then
    perform private.require_module(v_center, 'lms');
  end if;

  update public.student_accounts
  set active = p_active,
      deactivated_at = case when p_active then null else coalesce(deactivated_at, now()) end,
      deactivated_by = case when p_active then null else coalesce(deactivated_by, (select auth.uid())) end
  where student_id = p_student_id
  returning user_id into v_user;
  if v_user is null then
    raise exception 'Cet élève n''a pas d''accès.' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

-- Compte d'un élève, pour un nouveau mot de passe (Server Action, service_role).
create function public.student_account_user(p_student_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not private.is_staff() or private.student_center_id(p_student_id) is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  perform private.require_module(private.auth_center_id(), 'lms');
  select a.user_id into v_user from public.student_accounts a where a.student_id = p_student_id and a.active;
  if v_user is null then
    raise exception 'Accès élève inexistant ou désactivé.' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------
-- Jeton : rôle élève
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_user uuid := (event ->> 'user_id')::uuid;
  v_role public.user_role;
  v_center_id uuid;
  v_active boolean;
  v_status public.center_status;
begin
  select p.role, p.center_id, p.active, c.status
    into v_role, v_center_id, v_active, v_status
  from public.profiles p
  left join public.centers c on c.id = p.center_id
  where p.id = v_user;

  if v_role is not null then
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{center_id}', coalesce(to_jsonb(v_center_id), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{center_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
    return jsonb_set(event, '{claims}', v_claims);
  end if;

  -- Élève (aucun profil d'équipe).
  select a.center_id, a.active, c.status
    into v_center_id, v_active, v_status
  from public.student_accounts a
  join public.centers c on c.id = a.center_id
  where a.user_id = v_user;

  if v_center_id is not null then
    v_claims := jsonb_set(v_claims, '{user_role}', '"student_user"'::jsonb);
    v_claims := jsonb_set(v_claims, '{center_id}', to_jsonb(v_center_id));
    v_claims := jsonb_set(v_claims, '{center_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
  else
    -- Compte Auth sans profil ni accès élève : aucun accès applicatif.
    v_claims := v_claims - 'user_role' - 'center_id' - 'center_status';
    v_claims := jsonb_set(v_claims, '{profile_active}', 'false'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant select (user_id, center_id, active) on public.student_accounts to supabase_auth_admin;

-- ---------------------------------------------------------------------
-- Données de démonstration : indicateur sur la nouvelle table
-- ---------------------------------------------------------------------
alter table public.student_accounts
  add column is_demo boolean not null default coalesce(nullif(current_setting('centromanager.demo_seed', true), '')::boolean, false);

-- ---------------------------------------------------------------------
-- RLS et droits
-- ---------------------------------------------------------------------
alter table public.student_accounts enable row level security;

-- Équipe du centre : état de l'accès de ses élèves ; élève : son propre accès.
create policy student_accounts_select on public.student_accounts
for select to authenticated
using (
  ((select private.is_staff()) and center_id = (select private.auth_center_id()))
  or user_id = (select auth.uid())
);

create policy student_accounts_select_auth_admin on public.student_accounts
for select to supabase_auth_admin
using (true);

revoke all on public.student_accounts from anon;
revoke insert, update, delete, truncate on public.student_accounts from authenticated;
grant select on public.student_accounts to authenticated;

create trigger student_accounts_deny_support_writes
before insert or update or delete on public.student_accounts
for each row execute function private.deny_support_writes();

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.my_student_access()',
    'public.register_student_account(uuid, uuid, text)',
    'public.set_student_account_active(uuid, boolean)',
    'public.student_account_user(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.auth_student_id() from public, anon;
grant execute on function private.auth_student_id() to authenticated;
