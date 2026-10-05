-- =====================================================================
-- Page 11 : gestion des mots de passe par les responsables
--
--  * qui réinitialise qui (une seule règle, private.password_reset_decision) :
--      - administrateur : assistants, professeurs et élèves de son centre ;
--      - accueil (assistant) : élèves de son centre ;
--      - super-admin : administrateurs de n'importe quel centre ;
--      - jamais soi-même, un autre administrateur, un autre centre ;
--  * mot de passe temporaire : changement obligatoire à la connexion suivante
--    (must_change_password, aussi dans le jeton pour le proxy) ;
--  * sessions de la personne réinitialisée supprimées (déconnexion) ;
--  * 10 réinitialisations par heure et par responsable ;
--  * journal password_events (jamais de mot de passe) ; refus journalisés.
--
-- Le mot de passe lui-même est posé par le serveur avec la clé service_role
-- (auth.admin.updateUserById), après autorisation par la base.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Changement obligatoire
-- ---------------------------------------------------------------------
alter table public.profiles add column must_change_password boolean not null default false;
alter table public.student_accounts add column must_change_password boolean not null default false;

-- Compte créé par un responsable (mot de passe saisi ou généré par quelqu'un
-- d'autre) : à changer à la première connexion. Les fonctions de la base et
-- les données de démonstration (sans session) ne sont pas concernées.
-- Ni l'administrateur ni personne d'autre ne modifie l'indicateur directement :
-- seules les fonctions de la base (propriétaire) et la clé service_role le font.
create function private.guard_must_change_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.must_change_password := (select auth.uid()) is distinct from
        (to_jsonb(new) ->> case when tg_table_name = 'profiles' then 'id' else 'user_id' end)::uuid;
    end if;
    return new;
  end if;
  if new.must_change_password is distinct from old.must_change_password and current_user in ('authenticated', 'anon') then
    raise exception 'Changement obligatoire du mot de passe : modification directe interdite.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_must_change_password
before insert or update on public.profiles
for each row execute function private.guard_must_change_password();

create trigger student_accounts_guard_must_change_password
before insert or update on public.student_accounts
for each row execute function private.guard_must_change_password();

-- Accès élève ouvert par l'accueil ou l'administrateur (fonction de la base) :
-- identifiants donnés par le centre, donc temporaires.
create function private.student_accounts_initial_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> new.user_id then
    new.must_change_password := true;
  end if;
  return new;
end;
$$;

-- Nom postérieur à « student_accounts_guard… » : passe après le garde.
create trigger student_accounts_initial_password
before insert on public.student_accounts
for each row execute function private.student_accounts_initial_password();

-- ---------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------
create type public.password_event_type as enum (
  'reset_by_admin',
  'reset_by_assistant',
  'reset_by_super_admin',
  'self_change',
  'forced_change_completed',
  'denied'
);

create table public.password_events (
  id bigint generated always as identity primary key,
  -- Centre de la personne concernée (null : console de la plateforme).
  center_id uuid references public.centers (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text check (actor_role in ('admin', 'assistant', 'teacher', 'super_admin', 'student_user')),
  target_user_id uuid references auth.users (id) on delete set null,
  target_role text check (target_role in ('admin', 'assistant', 'teacher', 'super_admin', 'student_user')),
  event_type public.password_event_type not null,
  -- Refus seulement : motif court (jamais de mot de passe).
  reason text check (reason is null or reason in ('forbidden', 'other_center', 'self', 'inactive', 'rate_limited', 'not_found')),
  created_at timestamptz not null default now()
);

create index password_events_center_idx on public.password_events (center_id, created_at desc);
create index password_events_target_idx on public.password_events (target_user_id, created_at desc);
create index password_events_actor_idx on public.password_events (actor_id, created_at desc);

alter table public.password_events enable row level security;
revoke all on table public.password_events from anon, authenticated;
grant select on table public.password_events to authenticated;

-- Administrateur : événements de son centre. Super-admin : ses propres réinitialisations.
create policy password_events_select_admin on public.password_events
for select to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

create policy password_events_select_super_admin on public.password_events
for select to authenticated
using (actor_id = (select auth.uid()) and (select private.is_super_admin()));

-- Journal en ajout seul (écritures par les fonctions de la base uniquement).
create function private.password_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Suppression en cascade d'un centre : autorisée.
  if tg_op = 'DELETE' and old.center_id is not null and not exists (select 1 from public.centers c where c.id = old.center_id) then
    return old;
  end if;
  -- Suppression d'un compte (on delete set null) : seuls les auteurs/cibles peuvent devenir nuls.
  if tg_op = 'UPDATE'
     and (new.id, new.center_id, new.event_type, new.created_at, new.actor_role, new.target_role, new.reason)
         is not distinct from (old.id, old.center_id, old.event_type, old.created_at, old.actor_role, old.target_role, old.reason)
     and (new.actor_id is not distinct from old.actor_id or new.actor_id is null)
     and (new.target_user_id is not distinct from old.target_user_id or new.target_user_id is null) then
    return new;
  end if;
  raise exception 'Journal des mots de passe : modification interdite.' using errcode = '42501';
end;
$$;

create trigger password_events_append_only
before update or delete on public.password_events
for each row execute function private.password_events_append_only();

-- ---------------------------------------------------------------------
-- Règle unique : qui peut réinitialiser qui
-- ---------------------------------------------------------------------
-- Cible : profil d'équipe (p_target_user) ou accès élève (p_student_id).
create function private.password_reset_decision(p_actor uuid, p_target_user uuid, p_student_id uuid)
returns table (
  allowed boolean,
  reason text,
  actor_role text,
  actor_center_id uuid,
  target_user_id uuid,
  target_role text,
  target_center_id uuid,
  event_type public.password_event_type
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target_role text;
  v_target_center uuid;
  v_target_user uuid;
  v_target_active boolean;
begin
  select * into v_actor from public.profiles p where p.id = p_actor;

  if p_student_id is not null then
    select a.user_id, 'student_user', a.center_id, a.active
      into v_target_user, v_target_role, v_target_center, v_target_active
    from public.student_accounts a where a.student_id = p_student_id;
  else
    select p.id, p.role::text, p.center_id, p.active
      into v_target_user, v_target_role, v_target_center, v_target_active
    from public.profiles p where p.id = p_target_user;
  end if;

  actor_role := v_actor.role::text;
  actor_center_id := v_actor.center_id;
  target_user_id := v_target_user;
  target_role := v_target_role;
  target_center_id := v_target_center;
  allowed := false;

  if v_actor.id is null or not v_actor.active then
    reason := 'forbidden';
  elsif v_target_user is null then
    reason := 'not_found';
  elsif v_target_user = p_actor then
    reason := 'self';
  elsif v_actor.role = 'super_admin' then
    if v_target_role = 'admin' then
      allowed := true;
      event_type := 'reset_by_super_admin';
    else
      reason := 'forbidden';
    end if;
  elsif v_actor.role in ('admin', 'assistant') then
    if v_target_center is distinct from v_actor.center_id then
      reason := 'other_center';
    elsif (v_actor.role = 'admin' and v_target_role in ('assistant', 'teacher', 'student_user'))
       or (v_actor.role = 'assistant' and v_target_role = 'student_user') then
      allowed := true;
      event_type := case when v_actor.role = 'admin' then 'reset_by_admin' else 'reset_by_assistant' end::public.password_event_type;
    else
      reason := 'forbidden';
    end if;
  else
    reason := 'forbidden';
  end if;

  if allowed and not v_target_active then
    allowed := false;
    reason := 'inactive';
    event_type := null;
  end if;
  return next;
end;
$$;

revoke all on function private.password_reset_decision(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Autorisation (session du responsable) : refus journalisé, limite horaire
-- ---------------------------------------------------------------------
create function public.authorize_password_reset(p_target_user uuid default null, p_student_id uuid default null)
returns table (
  allowed boolean,
  reason text,
  target_user_id uuid,
  target_role text,
  center_slug text,
  full_name text,
  phone text,
  login_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision record;
  v_actor uuid := auth.uid();
begin
  if (p_target_user is null) = (p_student_id is null) then
    raise exception 'Une seule personne à la fois.' using errcode = '22023';
  end if;

  select * into v_decision from private.password_reset_decision(v_actor, p_target_user, p_student_id);

  if v_decision.allowed and (
    select count(*) from public.password_events e
    where e.actor_id = v_actor
      and e.event_type in ('reset_by_admin', 'reset_by_assistant', 'reset_by_super_admin')
      and e.created_at > now() - interval '1 hour'
  ) >= 10 then
    v_decision.allowed := false;
    v_decision.reason := 'rate_limited';
  end if;

  if not v_decision.allowed then
    -- Refus journalisé (la transaction n'est pas annulée : la fonction répond sans erreur).
    insert into public.password_events (center_id, actor_id, actor_role, target_user_id, target_role, event_type, reason)
    values (
      coalesce(v_decision.target_center_id, v_decision.actor_center_id),
      v_actor,
      v_decision.actor_role,
      case when exists (select 1 from auth.users u where u.id = v_decision.target_user_id) then v_decision.target_user_id end,
      v_decision.target_role,
      'denied',
      v_decision.reason
    );
    allowed := false;
    reason := v_decision.reason;
    return next;
    return;
  end if;

  allowed := true;
  target_user_id := v_decision.target_user_id;
  target_role := v_decision.target_role;
  select c.slug into center_slug from public.centers c where c.id = v_decision.target_center_id;
  if v_decision.target_role = 'student_user' then
    -- Élève : nom de l'élève, téléphone du responsable légal, code de connexion.
    select s.full_name, s.guardian_phone, a.login_code into full_name, phone, login_code
    from public.student_accounts a join public.students s on s.id = a.student_id
    where a.user_id = v_decision.target_user_id;
  else
    select p.full_name, p.phone into full_name, phone from public.profiles p where p.id = v_decision.target_user_id;
  end if;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Finalisation (serveur, clé service_role) après la pose du mot de passe :
--    changement obligatoire, sessions supprimées, journal.
-- ---------------------------------------------------------------------
create function public.complete_password_reset(p_actor uuid, p_target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision record;
begin
  -- Même règle, revérifiée (l'appel vient du serveur, l'auteur de sa session).
  select * into v_decision from private.password_reset_decision(
    p_actor,
    case when exists (select 1 from public.profiles p where p.id = p_target_user) then p_target_user end,
    (select a.student_id from public.student_accounts a where a.user_id = p_target_user)
  );
  if not v_decision.allowed then
    raise exception 'Réinitialisation non autorisée.' using errcode = '42501';
  end if;

  if v_decision.target_role = 'student_user' then
    update public.student_accounts set must_change_password = true where user_id = p_target_user;
  else
    update public.profiles set must_change_password = true where id = p_target_user;
  end if;

  perform private.revoke_user_sessions(p_target_user, null);

  insert into public.password_events (center_id, actor_id, actor_role, target_user_id, target_role, event_type)
  values (v_decision.target_center_id, p_actor, v_decision.actor_role, p_target_user, v_decision.target_role, v_decision.event_type);

  if v_decision.event_type = 'reset_by_super_admin' then
    perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
    perform private.log_platform_event(v_decision.target_center_id, 'center.admin_password_reset',
      jsonb_build_object('full_name', (select p.full_name from public.profiles p where p.id = p_target_user)));
  end if;
end;
$$;

-- Sessions d'un compte supprimées (jetons de rafraîchissement compris) ; sauf p_keep_session.
create function private.revoke_user_sessions(p_user uuid, p_keep_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.refresh_tokens r
  where r.user_id = p_user::text and r.session_id is distinct from p_keep_session;
  delete from auth.sessions s
  where s.user_id = p_user and s.id is distinct from p_keep_session;
end;
$$;

revoke all on function private.revoke_user_sessions(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Mot de passe changé par la personne elle-même
-- ---------------------------------------------------------------------
-- Session actuelle encore ouverte (sinon : déconnectée par une
-- réinitialisation) et changement obligatoire en attente.
create function public.my_password_state()
returns table (session_valid boolean, must_change boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      (select exists (select 1 from auth.sessions s where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = auth.uid())
       where nullif(auth.jwt() ->> 'session_id', '') is not null),
      true),
    coalesce(
      (select p.must_change_password from public.profiles p where p.id = auth.uid()),
      (select a.must_change_password from public.student_accounts a where a.user_id = auth.uid()),
      false);
$$;

-- Après un changement réussi (serveur) : indicateur levé, autres sessions fermées, journal.
create function public.complete_my_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_forced boolean;
  v_role text;
  v_center uuid;
begin
  if v_user is null then
    raise exception 'Session requise.' using errcode = '42501';
  end if;

  select p.must_change_password, p.role::text, p.center_id into v_forced, v_role, v_center
  from public.profiles p where p.id = v_user;
  if v_role is null then
    select a.must_change_password, 'student_user', a.center_id into v_forced, v_role, v_center
    from public.student_accounts a where a.user_id = v_user;
  end if;
  if v_role is null then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;

  update public.profiles set must_change_password = false where id = v_user and must_change_password;
  update public.student_accounts set must_change_password = false where user_id = v_user and must_change_password;

  perform private.revoke_user_sessions(v_user, nullif(auth.jwt() ->> 'session_id', '')::uuid);

  insert into public.password_events (center_id, actor_id, actor_role, target_user_id, target_role, event_type)
  values (v_center, v_user, v_role, v_user, v_role,
          case when v_forced then 'forced_change_completed' else 'self_change' end::public.password_event_type);
end;
$$;

-- ---------------------------------------------------------------------
-- Console : administrateurs d'un centre avec leur téléphone
-- ---------------------------------------------------------------------
create function public.platform_center_admins(p_center_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  active boolean,
  last_sign_in_at timestamptz,
  last_reset_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select p.id, p.full_name, u.email::text, p.phone, p.active, u.last_sign_in_at,
         (select max(e.created_at) from public.password_events e
          where e.target_user_id = p.id and e.event_type = 'reset_by_super_admin')
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.center_id = p_center_id and p.role = 'admin'
  order by p.full_name;
end;
$$;

-- ---------------------------------------------------------------------
-- Jeton : changement obligatoire (le proxy redirige sans lire la base)
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
  v_must_change boolean;
begin
  select p.role, p.center_id, p.active, c.status, p.must_change_password
    into v_role, v_center_id, v_active, v_status, v_must_change
  from public.profiles p
  left join public.centers c on c.id = p.center_id
  where p.id = v_user;

  if v_role is not null then
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{center_id}', coalesce(to_jsonb(v_center_id), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{center_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
    v_claims := jsonb_set(v_claims, '{must_change_password}', to_jsonb(coalesce(v_must_change, false)));
    return jsonb_set(event, '{claims}', v_claims);
  end if;

  -- Élève (aucun profil d'équipe).
  select a.center_id, a.active, c.status, a.must_change_password
    into v_center_id, v_active, v_status, v_must_change
  from public.student_accounts a
  join public.centers c on c.id = a.center_id
  where a.user_id = v_user;

  if v_center_id is not null then
    v_claims := jsonb_set(v_claims, '{user_role}', '"student_user"'::jsonb);
    v_claims := jsonb_set(v_claims, '{center_id}', to_jsonb(v_center_id));
    v_claims := jsonb_set(v_claims, '{center_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
    v_claims := jsonb_set(v_claims, '{must_change_password}', to_jsonb(coalesce(v_must_change, false)));
  else
    -- Compte Auth sans profil ni accès élève : aucun accès applicatif.
    v_claims := v_claims - 'user_role' - 'center_id' - 'center_status' - 'must_change_password';
    v_claims := jsonb_set(v_claims, '{profile_active}', 'false'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant select (must_change_password) on public.student_accounts to supabase_auth_admin;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.authorize_password_reset(uuid, uuid)',
    'public.my_password_state()',
    'public.complete_my_password_change()',
    'public.platform_center_admins(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

-- Finalisation d'une réinitialisation : serveur uniquement (clé service_role).
revoke all on function public.complete_password_reset(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_password_reset(uuid, uuid) to service_role;
