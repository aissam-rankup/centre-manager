-- =====================================================================
-- CentroManager — 018 : cycle de vie des centres, blocage, support
--
-- Règles validées :
--  * job quotidien : échéance dépassée → past_due ; échéance + délai de
--    grâce dépassés → suspended (jamais pour un centre résilié). Un
--    paiement remet le centre en service (migration 015) ;
--  * centre suspendu ou résilié : tous ses comptes perdent l'accès aux
--    données, appliqué par la RLS (private.auth_center_id / auth_role
--    renvoient NULL) et non seulement par l'interface ; les données ne
--    sont jamais supprimées ;
--  * rappels par courriel (J-7, J-1, jour J, suspension) et récapitulatif
--    quotidien du propriétaire : préparés dans platform_notifications ;
--    l'envoi sera branché quand un service de courriel sera choisi ;
--  * connexion de support : le super-admin ouvre une session limitée dans
--    le temps sur un centre ; il lit les données comme un admin, toute
--    écriture est refusée par trigger (lecture seule), tout est journalisé ;
--  * contact affiché sur l'écran de suspension : réglages de la plateforme.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Réglages de la plateforme
-- ---------------------------------------------------------------------
create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  support_name text,
  support_phone text,
  support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (1);

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

-- ---------------------------------------------------------------------
-- Sessions de support (lecture seule)
-- ---------------------------------------------------------------------
create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  center_id uuid not null references public.centers (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 300),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  check (expires_at > started_at)
);

create index support_sessions_actor_open_idx on public.support_sessions (actor_id) where ended_at is null;

alter table public.support_sessions enable row level security;
revoke all on public.support_sessions from anon, authenticated;

-- Centre consulté en support par le super-admin connecté (NULL sinon).
create function private.support_center_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id
  from public.support_sessions s
  join public.profiles p on p.id = s.actor_id and p.role = 'super_admin' and p.active
  where s.actor_id = (select auth.uid())
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Accès : centre bloqué → aucun centre ni rôle (toutes les policies
-- métier refusent). Super-admin en support → centre consulté, rôle admin.
-- ---------------------------------------------------------------------
create or replace function private.auth_center_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.center_id
       from public.profiles p
       join public.centers c on c.id = p.center_id
      where p.id = (select auth.uid()) and p.active
        and c.status not in ('suspended', 'cancelled')),
    private.support_center_id()
  );
$$;

create or replace function private.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.role = 'super_admin' and private.support_center_id() is not null then 'admin'::public.user_role
           else p.role
         end
  from public.profiles p
  left join public.centers c on c.id = p.center_id
  where p.id = (select auth.uid()) and p.active
    and (p.role = 'super_admin' or c.status not in ('suspended', 'cancelled'));
$$;

-- ---------------------------------------------------------------------
-- Lecture seule en support : triggers sur toutes les tables métier.
-- Les actions de la console (fonctions platform_*) restent possibles :
-- private.require_super_admin() les signale pour la transaction.
-- ---------------------------------------------------------------------
create or replace function private.require_super_admin()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Accès réservé à la plateforme.' using errcode = '42501';
  end if;
  perform set_config('centromanager.platform_action', 'on', true);
end;
$$;

create function private.in_support_write()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and coalesce(current_setting('centromanager.platform_action', true), '') <> 'on'
     and private.support_center_id() is not null;
$$;

create function private.deny_support_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.in_support_write() then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'alerts', 'attendance', 'center_branding', 'centers', 'enrollments', 'follow_ups', 'invoices', 'levels',
    'pack_enrollments', 'pack_subjects', 'packs', 'profiles', 'schedule_slots', 'students', 'subjects',
    'teacher_assignments'
  ] loop
    execute format(
      'create trigger deny_support_writes before insert or update or delete on public.%I
         for each row execute function private.deny_support_writes()', v_table);
  end loop;
end;
$$;

-- Photos : aucun dépôt en support.
create or replace function private.can_write_staff_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.in_support_write()
    and (storage.foldername(p_name))[1] = private.auth_center_id()::text
    and (
      private.is_admin()
      or (storage.foldername(p_name))[2] = (select auth.uid())::text
    );
$$;

drop policy student_photos_insert_staff on storage.objects;
create policy student_photos_insert_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_staff())
  and not (select private.in_support_write())
);

drop policy student_photos_update_admin on storage.objects;
create policy student_photos_update_admin on storage.objects
for update to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_admin())
  and not (select private.in_support_write())
)
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
);

drop policy student_photos_delete_admin on storage.objects;
create policy student_photos_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_admin())
  and not (select private.in_support_write())
);

-- ---------------------------------------------------------------------
-- Hook JWT : statut du centre (redirection rapide du proxy vers l'écran
-- de suspension ; la RLS et la garde serveur font foi).
-- ---------------------------------------------------------------------
grant select (id, status) on public.centers to supabase_auth_admin;

create policy centers_select_auth_admin on public.centers
for select to supabase_auth_admin
using (true);

create or replace function public.custom_access_token_hook(event jsonb)
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
  v_status public.center_status;
begin
  select p.role, p.center_id, p.active, c.status
    into v_role, v_center_id, v_active, v_status
  from public.profiles p
  left join public.centers c on c.id = p.center_id
  where p.id = (event ->> 'user_id')::uuid;

  if v_role is null then
    -- Compte Auth sans profil : aucun accès applicatif.
    v_claims := v_claims - 'user_role' - 'center_id' - 'center_status';
    v_claims := jsonb_set(v_claims, '{profile_active}', 'false'::jsonb);
  else
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{center_id}', coalesce(to_jsonb(v_center_id), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{center_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_active}', to_jsonb(v_active));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- ---------------------------------------------------------------------
-- État d'accès du compte connecté (écran de suspension, bandeaux)
-- ---------------------------------------------------------------------
create function public.my_center_access()
returns table (
  center_id uuid,
  center_name text,
  status public.center_status,
  blocked boolean,
  -- Détails d'échéance : administrateur du centre uniquement.
  current_period_end date,
  suspension_date date,
  days_before_suspension integer,
  support_mode boolean,
  support_expires_at timestamptz,
  contact_name text,
  contact_phone text,
  contact_email text,
  -- Vocabulaire de l'interface : termes du type, surchargés par les termes personnalisés.
  vocabulary jsonb
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
         s.support_name, s.support_phone, s.support_email,
         ty.terms || c.custom_terms
  from target t
  join public.centers c on c.id = t.center_id
  join public.center_types ty on ty.code = c.center_type
  cross join public.platform_settings s;
$$;

-- ---------------------------------------------------------------------
-- Cycle de vie quotidien
-- ---------------------------------------------------------------------
create table public.platform_notifications (
  id bigint generated always as identity primary key,
  -- NULL : récapitulatif du propriétaire de la plateforme.
  center_id uuid references public.centers (id) on delete cascade,
  kind text not null check (kind in ('due_in_7', 'due_in_1', 'due_today', 'suspended', 'owner_digest')),
  scheduled_for date not null,
  recipient text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index platform_notifications_once_idx
  on public.platform_notifications (kind, coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid), scheduled_for);
create index platform_notifications_pending_idx on public.platform_notifications (scheduled_for) where sent_at is null;

alter table public.platform_notifications enable row level security;
revoke all on public.platform_notifications from anon, authenticated;

comment on table public.platform_notifications is
  'Courriels de la plateforme préparés par le job quotidien (rappels d''échéance, suspension, récapitulatif). Envoi : à brancher.';

-- Statuts : retard, puis suspension. Renvoie les centres passés en retard
-- et suspendus ce jour.
create function private.update_center_statuses(p_date date default private.today())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_past_due uuid[];
  v_suspended uuid[];
begin
  perform set_config('centromanager.reason', 'Automatique : échéance dépassée', true);

  with changed as (
    update public.centers c
    set status = 'suspended'
    where c.status in ('trial', 'active', 'past_due')
      and c.current_period_end is not null
      and c.current_period_end + c.grace_days < p_date
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_suspended from changed;

  with changed as (
    update public.centers c
    set status = 'past_due'
    where c.status in ('trial', 'active')
      and c.current_period_end is not null
      and c.current_period_end < p_date
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_past_due from changed;

  perform set_config('centromanager.reason', '', true);
  return jsonb_build_object('past_due', to_jsonb(v_past_due), 'suspended', to_jsonb(v_suspended));
end;
$$;

-- Rappels : J-7, J-1, jour J (centres en service avec un courriel de
-- contact), suspension du jour, récapitulatif du propriétaire.
create function private.queue_platform_notifications(p_date date, p_changes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer;
begin
  insert into public.platform_notifications (center_id, kind, scheduled_for, recipient, payload)
  select c.id,
         case c.current_period_end - p_date when 7 then 'due_in_7' when 1 then 'due_in_1' else 'due_today' end,
         p_date, c.owner_contact_email,
         jsonb_build_object('center_name', c.name, 'due_date', c.current_period_end, 'amount', c.price,
                            'billing_interval', c.billing_interval)
  from public.centers c
  where c.status in ('trial', 'active', 'past_due')
    and c.owner_contact_email is not null
    and c.current_period_end - p_date in (7, 1, 0)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.platform_notifications (center_id, kind, scheduled_for, recipient, payload)
  select c.id, 'suspended', p_date, c.owner_contact_email,
         jsonb_build_object('center_name', c.name, 'due_date', c.current_period_end)
  from public.centers c
  where c.id in (select jsonb_array_elements_text(p_changes -> 'suspended')::uuid)
    and c.owner_contact_email is not null
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.platform_notifications (center_id, kind, scheduled_for, recipient, payload)
  select null, 'owner_digest', p_date, null,
         jsonb_build_object(
           'due_in_7_days', coalesce((
             select jsonb_agg(jsonb_build_object('center_name', c.name, 'due_date', c.current_period_end) order by c.current_period_end)
             from public.centers c
             where c.status in ('trial', 'active', 'past_due')
               and c.current_period_end between p_date and p_date + 7), '[]'),
           'past_due_today', coalesce((
             select jsonb_agg(c.name order by c.name) from public.centers c
             where c.id in (select jsonb_array_elements_text(p_changes -> 'past_due')::uuid)), '[]'),
           'suspended_today', coalesce((
             select jsonb_agg(c.name order by c.name) from public.centers c
             where c.id in (select jsonb_array_elements_text(p_changes -> 'suspended')::uuid)), '[]'))
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_count + v_rows;
end;
$$;

create or replace function private.run_daily_automations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoices integer := private.generate_invoices();
  v_overdue integer := private.mark_overdue_invoices();
  v_centers jsonb := private.update_center_statuses();
  v_notifications integer := private.queue_platform_notifications(private.today(), v_centers);
begin
  return jsonb_build_object(
    'invoices_created', v_invoices,
    'invoices_overdue', v_overdue,
    'centers', v_centers,
    'notifications_queued', v_notifications);
end;
$$;

revoke all on function
  private.update_center_statuses(date),
  private.queue_platform_notifications(date, jsonb),
  private.run_daily_automations()
from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Console : réglages, support, rappels
-- ---------------------------------------------------------------------
create function public.platform_settings_get()
returns table (support_name text, support_phone text, support_email text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query select s.support_name, s.support_phone, s.support_email, s.updated_at from public.platform_settings s;
end;
$$;

create function public.platform_update_settings(p_support_name text, p_support_phone text, p_support_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  update public.platform_settings
  set support_name = nullif(btrim(p_support_name), ''),
      support_phone = nullif(btrim(p_support_phone), ''),
      support_email = nullif(btrim(p_support_email), ''),
      updated_at = now()
  where id = 1;
  perform private.log_platform_event(null, 'platform.settings_changed',
    jsonb_build_object('support_name', p_support_name, 'support_phone', p_support_phone, 'support_email', p_support_email));
end;
$$;

create function public.platform_start_support(p_center_id uuid, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + interval '1 hour';
begin
  perform private.require_super_admin();
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez un motif.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.centers c where c.id = p_center_id) then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;

  update public.support_sessions set ended_at = now()
  where actor_id = (select auth.uid()) and ended_at is null;

  insert into public.support_sessions (actor_id, center_id, reason, expires_at)
  values ((select auth.uid()), p_center_id, btrim(p_reason), v_expires);

  perform private.log_platform_event(p_center_id, 'support.started',
    jsonb_build_object('reason', btrim(p_reason), 'expires_at', v_expires));
  return v_expires;
end;
$$;

create function public.platform_end_support()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
begin
  perform private.require_super_admin();
  update public.support_sessions set ended_at = now()
  where actor_id = (select auth.uid()) and ended_at is null
  returning center_id into v_center_id;
  if v_center_id is not null then
    perform private.log_platform_event(v_center_id, 'support.ended', '{}');
  end if;
end;
$$;

create function public.platform_upcoming_notifications(p_from date default private.today())
returns table (
  notification_id bigint,
  center_id uuid,
  center_name text,
  kind text,
  scheduled_for date,
  recipient text,
  sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select n.id, n.center_id, coalesce(c.name, n.payload ->> 'center_name'), n.kind, n.scheduled_for, n.recipient, n.sent_at
  from public.platform_notifications n
  left join public.centers c on c.id = n.center_id
  where n.scheduled_for >= p_from and n.kind <> 'owner_digest'
  order by n.scheduled_for desc, n.id desc
  limit 50;
end;
$$;

-- Échéances des 7 prochains jours (tableau de bord).
create function public.platform_upcoming_due()
returns table (
  center_id uuid,
  name text,
  status public.center_status,
  current_period_end date,
  days_remaining integer,
  price numeric,
  billing_interval public.billing_interval,
  owner_contact_phone text,
  owner_contact_email text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.id, c.name, c.status, c.current_period_end, (c.current_period_end - private.today())::integer,
         coalesce(c.price, 0), c.billing_interval, c.owner_contact_phone, c.owner_contact_email
  from public.centers c
  where c.status in ('trial', 'active', 'past_due')
    and c.current_period_end between private.today() and private.today() + 7
  order by c.current_period_end, c.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.my_center_access()',
    'public.platform_settings_get()',
    'public.platform_update_settings(text, text, text)',
    'public.platform_start_support(uuid, text)',
    'public.platform_end_support()',
    'public.platform_upcoming_notifications(date)',
    'public.platform_upcoming_due()'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.support_center_id() from public, anon;
grant execute on function private.support_center_id() to authenticated;
revoke all on function private.in_support_write() from public, anon;
grant execute on function private.in_support_write() to authenticated;
