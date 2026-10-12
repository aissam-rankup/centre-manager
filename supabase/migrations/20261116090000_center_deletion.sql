-- =====================================================================
-- Suppression définitive d'un centre, en deux temps
--
--  1. Demande (platform_request_center_deletion) : centre suspendu ou
--     résilié seulement, motif, nom du centre retapé ; suppression prévue
--     30 jours plus tard. Pendant ce délai le centre reste récupérable :
--     la demande s'annule (platform_cancel_center_deletion) ; il ne peut
--     pas être réactivé, ni remis en service par un paiement.
--  2. Purge, délai écoulé : tâche quotidienne (pg_cron → pg_net → route
--     serveur protégée par un secret) qui supprime d'abord les fichiers du
--     Storage (API, clé service_role), puis les données (purge_center) :
--     toutes les tables du centre, comptes d'authentification compris.
--     Restent : la ligne du centre (nom, pack, tarif, statut résilié, date
--     de purge ; adresse libérée, contacts effacés), l'abonnement, les
--     paiements d'abonnement et le journal de la plateforme.
--
-- Réglages manuels en production (une fois) : extension pg_net, secrets
-- Vault « dirassty_purge_url » et « dirassty_cron_secret », variable
-- PLATFORM_CRON_SECRET du serveur. Sans eux, le super-admin lance la purge
-- depuis la fiche du centre une fois le délai écoulé.
-- =====================================================================

create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- Demande de suppression
-- ---------------------------------------------------------------------
alter table public.centers
  add column deletion_requested_at timestamptz,
  add column deletion_requested_by uuid references auth.users (id) on delete set null,
  add column deletion_reason text check (deletion_reason is null or length(deletion_reason) <= 300),
  add column deletion_scheduled_for timestamptz,
  add column purged_at timestamptz,
  add constraint centers_deletion_check check ((deletion_requested_at is null) = (deletion_scheduled_for is null)),
  add constraint centers_purged_check check (purged_at is null or status = 'cancelled');

comment on column public.centers.deletion_scheduled_for is
  'Suppression définitive prévue (30 jours après la demande) ; nul : aucune demande en cours.';

create index centers_deletion_due_idx on public.centers (deletion_scheduled_for)
  where deletion_scheduled_for is not null and purged_at is null;

-- Journal : la purge supprime des comptes auteurs d'événements. Seul ce
-- passage d'un auteur à « nul » est permis (on delete set null) ; toute
-- autre modification reste interdite.
create or replace function private.platform_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_column text := case tg_table_name when 'platform_events' then 'actor_id' when 'subscription_payments' then 'recorded_by' end;
begin
  if tg_op = 'UPDATE' and v_column is not null
     and (to_jsonb(new) - v_column) = (to_jsonb(old) - v_column)
     and to_jsonb(new) ->> v_column is null then
    return new;
  end if;
  raise exception 'Le journal de la plateforme ne peut pas être modifié.' using errcode = '42501';
end;
$$;

create function public.platform_request_center_deletion(p_center_id uuid, p_reason text, p_confirm_name text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_scheduled timestamptz := now() + interval '30 days';
begin
  perform private.require_super_admin();
  if v_reason is null then
    raise exception 'Indiquez le motif de la suppression.' using errcode = '22023';
  end if;
  if length(v_reason) > 300 then
    raise exception 'Motif trop long (300 caractères au plus).' using errcode = '22023';
  end if;
  select * into v_center from public.centers c where c.id = p_center_id for update;
  if v_center.id is null then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  if v_center.purged_at is not null then
    raise exception 'Les données de ce centre ont déjà été supprimées.' using errcode = '22023';
  end if;
  if v_center.status not in ('suspended', 'cancelled') then
    raise exception 'Suppression impossible : suspendez ou résiliez d''abord le centre.' using errcode = '22023';
  end if;
  if v_center.deletion_requested_at is not null then
    raise exception 'Une suppression est déjà prévue pour ce centre.' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_center.name)) then
    raise exception 'Le nom saisi ne correspond pas au nom du centre.' using errcode = '22023';
  end if;

  update public.centers
  set deletion_requested_at = now(), deletion_requested_by = (select auth.uid()),
      deletion_reason = v_reason, deletion_scheduled_for = v_scheduled
  where id = p_center_id;

  perform private.log_platform_event(p_center_id, 'center.deletion_requested',
    jsonb_build_object('reason', v_reason, 'scheduled_for', v_scheduled));
  return v_scheduled;
end;
$$;

create function public.platform_cancel_center_deletion(p_center_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_super_admin();
  if length(coalesce(v_reason, '')) > 300 then
    raise exception 'Motif trop long (300 caractères au plus).' using errcode = '22023';
  end if;
  select * into v_center from public.centers c where c.id = p_center_id for update;
  if v_center.id is null then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  if v_center.purged_at is not null then
    raise exception 'Les données de ce centre ont déjà été supprimées.' using errcode = '22023';
  end if;
  if v_center.deletion_requested_at is null then
    raise exception 'Aucune suppression n''est prévue pour ce centre.' using errcode = '22023';
  end if;

  update public.centers
  set deletion_requested_at = null, deletion_requested_by = null, deletion_reason = null, deletion_scheduled_for = null
  where id = p_center_id;

  perform private.log_platform_event(p_center_id, 'center.deletion_cancelled',
    jsonb_build_object('reason', v_reason, 'scheduled_for', v_center.deletion_scheduled_for));
end;
$$;

-- Suppression prévue : pas de réactivation ni de remise en service.
create function private.centers_deletion_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.purged_at is not null and new.status is distinct from 'cancelled' then
    raise exception 'Les données de ce centre ont été supprimées : il ne peut plus être réactivé.' using errcode = '22023';
  end if;
  if new.deletion_requested_at is not null and new.status not in ('suspended', 'cancelled') then
    raise exception 'Suppression prévue : annulez-la avant de réactiver le centre.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger centers_deletion_guard
before update on public.centers
for each row execute function private.centers_deletion_guard();

-- Paiement pendant le délai : enregistré, sans remise en service.
create or replace function private.subscription_payments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kept_suspended boolean;
begin
  select c.status = 'suspended' and (c.suspension_kind is distinct from 'unpaid' or c.deletion_requested_at is not null)
    into v_kept_suspended
  from public.centers c where c.id = new.center_id;

  update public.centers c
  set current_period_end = greatest(coalesce(c.current_period_end, new.period_covered_end), new.period_covered_end),
      status = case when v_kept_suspended then c.status else 'active' end,
      activated_at = coalesce(c.activated_at, now())
  where c.id = new.center_id;

  update public.subscriptions s
  set current_period_start = new.period_covered_start
  where s.center_id = new.center_id
    and (s.current_period_start is null or s.current_period_start < new.period_covered_start);

  perform private.log_platform_event(new.center_id, 'subscription.payment_recorded',
    jsonb_build_object(
      'payment_id', new.id, 'amount', new.amount, 'method', new.method, 'reference', new.reference,
      'period_start', new.period_covered_start, 'period_end', new.period_covered_end,
      'kept_suspended', coalesce(v_kept_suspended, false)));
  return new;
end;
$$;

-- Payer un centre dont les données sont supprimées : refusé (statut résilié).

-- ---------------------------------------------------------------------
-- Purge
-- ---------------------------------------------------------------------
-- Tables conservées : facturation et journal de la plateforme.
create function private.purge_kept_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['subscriptions', 'subscription_payments', 'platform_events'];
$$;

-- Centres dont la suppression est due (route serveur : fichiers puis données).
create function public.centers_due_for_purge()
returns table (center_id uuid, name text, scheduled_for timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.deletion_scheduled_for
  from public.centers c
  where c.deletion_scheduled_for <= now() and c.purged_at is null and c.status in ('suspended', 'cancelled')
  order by c.deletion_scheduled_for;
$$;

-- Données du centre supprimées (fichiers déjà supprimés par le serveur).
-- Déclencheurs « utilisateur » des tables du centre suspendus le temps de la
-- transaction (gardes d'immuabilité des reçus, de la caisse, de la paie…) ;
-- les clés étrangères restent appliquées. Renvoie le nombre de lignes et de
-- comptes supprimés.
create function public.purge_center(p_center_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '15s'
as $$
declare
  v_center public.centers;
  v_users uuid[];
  v_tables text[];
  v_pending text[];
  v_table text;
  v_rows bigint := 0;
  v_count bigint;
  v_pass integer := 0;
  v_progress boolean;
begin
  select * into v_center from public.centers c where c.id = p_center_id for update;
  if v_center.id is null then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  if v_center.purged_at is not null then
    raise exception 'Les données de ce centre ont déjà été supprimées.' using errcode = '22023';
  end if;
  if v_center.deletion_scheduled_for is null or v_center.deletion_scheduled_for > now()
     or v_center.status not in ('suspended', 'cancelled') then
    raise exception 'Suppression non due pour ce centre.' using errcode = '22023';
  end if;

  -- Comptes du centre (équipe et élèves), supprimés à la fin.
  select coalesce(array_agg(u.id), '{}') into v_users
  from (
    select p.id from public.profiles p where p.center_id = p_center_id
    union
    select a.user_id from public.student_accounts a where a.center_id = p_center_id
  ) u;

  -- Toutes les tables de données (avec ou sans center_id : les tables sans
  -- center_id sont vidées en cascade), sauf la facturation et le journal.
  select coalesce(array_agg(c.relname::text order by c.relname), '{}') into v_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname <> 'centers'
    and c.relname <> all (private.purge_kept_tables());

  foreach v_table in array v_tables loop
    execute format('alter table public.%I disable trigger user', v_table);
  end loop;

  -- Lignes du centre : plusieurs passes si une clé étrangère impose un ordre.
  select coalesce(array_agg(t), '{}') into v_pending
  from unnest(v_tables) t
  where exists (select 1 from information_schema.columns col
                where col.table_schema = 'public' and col.table_name = t and col.column_name = 'center_id');
  loop
    v_pass := v_pass + 1;
    v_progress := false;
    foreach v_table in array v_pending loop
      begin
        execute format('delete from public.%I where center_id = $1', v_table) using p_center_id;
        get diagnostics v_count = row_count;
        v_rows := v_rows + v_count;
        v_pending := array_remove(v_pending, v_table);
        v_progress := true;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
    exit when cardinality(v_pending) = 0;
    if not v_progress or v_pass > 20 then
      raise exception 'Purge impossible (tables restantes : %).', array_to_string(v_pending, ', ') using errcode = '23503';
    end if;
  end loop;

  delete from auth.users u where u.id = any (v_users);

  foreach v_table in array v_tables loop
    execute format('alter table public.%I enable trigger user', v_table);
  end loop;

  -- Ligne conservée pour la facturation : adresse libérée, contacts effacés.
  update public.centers
  set status = 'cancelled',
      purged_at = now(),
      slug = 'supprime-' || left(replace(p_center_id::text, '-', ''), 12),
      owner_contact_name = null,
      owner_contact_phone = null,
      owner_contact_email = null,
      notes = null,
      custom_terms = '{}'
  where id = p_center_id;
  -- Ancienne adresse libérée (aucune redirection gardée).
  delete from public.center_slug_history where center_id = p_center_id;

  perform private.log_platform_event(p_center_id, 'center.purged',
    jsonb_build_object('rows', v_rows, 'accounts', cardinality(v_users), 'requested_at', v_center.deletion_requested_at));
  return jsonb_build_object('rows', v_rows, 'accounts', cardinality(v_users));
end;
$$;

-- ---------------------------------------------------------------------
-- Tâche quotidienne : appel de la route serveur (pg_net)
-- ---------------------------------------------------------------------
-- Adresse et secret dans Vault (jamais dans le code) :
--   select vault.create_secret('https://dirassty.com/api/platform/purge', 'dirassty_purge_url');
--   select vault.create_secret('<secret>', 'dirassty_cron_secret');
create function private.request_center_purge()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'dirassty_purge_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'dirassty_cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'Purge des centres : secrets Vault absents, rien n''est appelé.';
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end;
$$;

select cron.schedule('centromanager-center-purge', '30 1 * * *', $$select private.request_center_purge()$$);

-- ---------------------------------------------------------------------
-- Console : état de la suppression d'un centre
-- ---------------------------------------------------------------------
create function public.platform_center_deletion(p_center_id uuid)
returns table (
  requested_at timestamptz,
  requested_by_name text,
  reason text,
  scheduled_for timestamptz,
  purged_at timestamptz,
  due boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select c.deletion_requested_at, p.full_name, c.deletion_reason, c.deletion_scheduled_for, c.purged_at,
         c.deletion_scheduled_for is not null and c.deletion_scheduled_for <= now() and c.purged_at is null
  from public.centers c
  left join public.profiles p on p.id = c.deletion_requested_by
  where c.id = p_center_id;
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
    'public.platform_request_center_deletion(uuid, text, text)',
    'public.platform_cancel_center_deletion(uuid, text)',
    'public.platform_center_deletion(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
  foreach v_fn in array array[
    'public.centers_due_for_purge()',
    'public.purge_center(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end;
$$;

revoke all on function private.request_center_purge(), private.purge_kept_tables(), private.centers_deletion_guard()
  from public, anon, authenticated;
