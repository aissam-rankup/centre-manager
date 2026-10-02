-- =====================================================================
-- CentroManager — 022 : socle des modules financiers (page 6)
--
--  * mode de paiement commun (reçus, paie, charges) ;
--  * coordonnées du centre (en-tête des reçus et fiches de paie) ;
--  * journal interne du centre : qui a fait quoi (remises, paie, charges,
--    annulations de reçu), lisible par l'admin du centre uniquement ;
--  * accès aux données financières détaillées : admin du centre, jamais
--    en mode support (le super-admin ne voit pas les finances d'un client).
-- =====================================================================

create type public.payment_method as enum ('cash', 'bank_transfer', 'card');

-- ---------------------------------------------------------------------
-- Coordonnées du centre
-- ---------------------------------------------------------------------
alter table public.centers
  add column address text check (address is null or length(btrim(address)) between 1 and 200),
  add column phone text check (phone is null or length(btrim(phone)) between 1 and 30);

grant select (address, phone) on public.centers to authenticated;
grant update (address, phone) on public.centers to authenticated;

-- ---------------------------------------------------------------------
-- Accès aux finances détaillées : admin du centre, hors mode support
-- ---------------------------------------------------------------------
create function private.can_read_finance(p_center_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_admin()
     and p_center_id = private.auth_center_id()
     and private.support_center_id() is null;
$$;

-- ---------------------------------------------------------------------
-- Journal interne du centre
-- ---------------------------------------------------------------------
create table public.center_events (
  id bigint generated always as identity primary key,
  center_id uuid not null references public.centers (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index center_events_center_created_idx on public.center_events (center_id, created_at desc);
create index center_events_actor_idx on public.center_events (actor_id);

alter table public.center_events enable row level security;

create policy center_events_select_admin on public.center_events
for select to authenticated
using ((select private.can_read_finance(center_id)));

revoke all on public.center_events from anon, authenticated;
grant select on public.center_events to authenticated;

-- Écriture réservée aux fonctions du serveur ; aucune modification ensuite.
create function private.center_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Suppression en cascade d'un centre : autorisée.
  if tg_op = 'DELETE' and not exists (select 1 from public.centers c where c.id = old.center_id) then
    return old;
  end if;
  raise exception 'Le journal du centre ne se modifie pas.' using errcode = '42501';
end;
$$;

create trigger center_events_append_only
before update or delete on public.center_events
for each row execute function private.center_events_append_only();

create function private.log_center_event(
  p_center_id uuid,
  p_action text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.center_events (center_id, actor_id, action, entity_id, payload)
  values (p_center_id, (select auth.uid()), p_action, p_entity_id, coalesce(p_payload, '{}'::jsonb));
$$;

revoke all on function private.can_read_finance(uuid), private.log_center_event(uuid, text, uuid, jsonb)
from public, anon;
grant execute on function private.can_read_finance(uuid) to authenticated, service_role;
grant execute on function private.log_center_event(uuid, text, uuid, jsonb) to service_role;
