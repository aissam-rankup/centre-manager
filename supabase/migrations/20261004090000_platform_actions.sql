-- =====================================================================
-- CentroManager — 017 : actions de la console (super-admin)
--
--  * création d'un centre (identité, type, formule, tarif, activation,
--    première échéance) avec son administrateur, créé en même temps ;
--  * modification des informations, du vocabulaire, du tarif et de la
--    formule, de l'échéance ;
--  * enregistrement d'un paiement (remet le centre en service) ;
--  * suspension, réactivation, résiliation (définitive côté accès).
--
-- Chaque fonction exige un super-admin et passe par les triggers d'audit
-- de la migration 015 ; le motif saisi est ajouté à l'événement journalisé
-- (réglage local à la transaction « centromanager.reason »).
-- =====================================================================

-- Une échéance fixée à la main peut précéder le début de la période payée.
alter table public.subscriptions drop constraint subscriptions_check;

-- ---------------------------------------------------------------------
-- Audit : motif et changements de coordonnées
-- ---------------------------------------------------------------------
create or replace function private.log_platform_event(p_center_id uuid, p_action text, p_payload jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(current_setting('centromanager.reason', true), '')), '');
  v_payload jsonb := coalesce(p_payload, '{}');
begin
  if v_reason is not null and p_action in ('center.status_changed', 'center.period_changed') then
    v_payload := v_payload || jsonb_build_object('reason', v_reason);
  end if;
  insert into public.platform_events (actor_id, center_id, action, payload)
  values ((select auth.uid()), p_center_id, p_action, v_payload);
end;
$$;

revoke all on function private.log_platform_event(uuid, text, jsonb) from public, anon, authenticated;

create function private.set_reason(p_reason text)
returns void
language sql
set search_path = ''
as $$
  select set_config('centromanager.reason', coalesce(p_reason, ''), true);
$$;

create function private.centers_log_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.owner_contact_name, new.owner_contact_phone, new.owner_contact_email, new.notes)
     is distinct from (old.owner_contact_name, old.owner_contact_phone, old.owner_contact_email, old.notes) then
    perform private.log_platform_event(new.id, 'center.details_changed',
      jsonb_build_object('owner_contact_name', new.owner_contact_name,
                         'owner_contact_phone', new.owner_contact_phone,
                         'owner_contact_email', new.owner_contact_email,
                         'notes_changed', new.notes is distinct from old.notes));
  end if;
  return new;
end;
$$;

create trigger centers_log_details
after update on public.centers
for each row execute function private.centers_log_details();

-- ---------------------------------------------------------------------
-- Création d'un centre et de son administrateur
-- ---------------------------------------------------------------------
-- Le compte Auth de l'administrateur est créé au préalable par la Server
-- Action (invitation, clé service_role) ; son profil est créé ici, dans la
-- même transaction que le centre.
create function public.platform_create_center(
  p_name text,
  p_slug text,
  p_center_type text,
  p_custom_terms jsonb,
  p_plan public.subscription_plan,
  p_price numeric,
  p_billing_interval public.billing_interval,
  p_status public.center_status,
  p_activation_date date,
  p_first_period_end date,
  p_grace_days smallint,
  p_owner_contact_name text,
  p_owner_contact_phone text,
  p_owner_contact_email text,
  p_notes text,
  p_admin_user_id uuid,
  p_admin_full_name text,
  p_admin_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
begin
  perform private.require_super_admin();

  if p_status not in ('trial', 'active') then
    raise exception 'Un nouveau centre démarre en essai ou actif.' using errcode = '22023';
  end if;
  if p_first_period_end is not null and p_activation_date is not null and p_first_period_end <= p_activation_date then
    raise exception 'La première échéance doit suivre la date d''activation.' using errcode = '22023';
  end if;
  if exists (select 1 from public.centers c where c.slug = p_slug) then
    raise exception 'Cette adresse est déjà utilisée par un autre centre.' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_admin_user_id) then
    raise exception 'Ce compte appartient déjà à un centre.' using errcode = '22023';
  end if;

  insert into public.centers (
    name, slug, center_type, custom_terms, status, activated_at, current_period_end, grace_days,
    price, billing_interval, owner_contact_name, owner_contact_phone, owner_contact_email, notes
  ) values (
    btrim(p_name), p_slug, p_center_type, coalesce(p_custom_terms, '{}'), p_status,
    case when p_status = 'active' then coalesce(p_activation_date, private.today())::timestamptz end,
    p_first_period_end, coalesce(p_grace_days, 5),
    p_price, p_billing_interval,
    nullif(btrim(p_owner_contact_name), ''), nullif(btrim(p_owner_contact_phone), ''),
    nullif(btrim(p_owner_contact_email), ''), nullif(btrim(p_notes), '')
  )
  returning id into v_center_id;

  update public.subscriptions
  set plan = p_plan,
      started_at = coalesce(p_activation_date, private.today()),
      current_period_start = coalesce(p_activation_date, private.today())
  where center_id = v_center_id;

  insert into public.profiles (id, center_id, full_name, role, phone)
  values (p_admin_user_id, v_center_id, btrim(p_admin_full_name), 'admin', nullif(btrim(p_admin_phone), ''));

  perform private.log_platform_event(v_center_id, 'center.admin_invited',
    jsonb_build_object('full_name', btrim(p_admin_full_name),
                       'email', (select u.email from auth.users u where u.id = p_admin_user_id)));
  return v_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Informations et vocabulaire
-- ---------------------------------------------------------------------
create function public.platform_update_center(
  p_center_id uuid,
  p_name text,
  p_slug text,
  p_center_type text,
  p_custom_terms jsonb,
  p_owner_contact_name text,
  p_owner_contact_phone text,
  p_owner_contact_email text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if exists (select 1 from public.centers c where c.slug = p_slug and c.id <> p_center_id) then
    raise exception 'Cette adresse est déjà utilisée par un autre centre.' using errcode = '23505';
  end if;

  update public.centers
  set name = btrim(p_name),
      slug = p_slug,
      center_type = p_center_type,
      custom_terms = coalesce(p_custom_terms, '{}'),
      owner_contact_name = nullif(btrim(p_owner_contact_name), ''),
      owner_contact_phone = nullif(btrim(p_owner_contact_phone), ''),
      owner_contact_email = nullif(btrim(p_owner_contact_email), ''),
      notes = nullif(btrim(p_notes), '')
  where id = p_center_id;
  if not found then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Formule et tarif
-- ---------------------------------------------------------------------
create function public.platform_set_pricing(
  p_center_id uuid,
  p_plan public.subscription_plan,
  p_price numeric,
  p_billing_interval public.billing_interval,
  p_grace_days smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  update public.centers
  set price = p_price, billing_interval = p_billing_interval, grace_days = p_grace_days
  where id = p_center_id;
  if not found then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  update public.subscriptions set plan = p_plan where center_id = p_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Échéance
-- ---------------------------------------------------------------------
-- Fixer ou prolonger l'échéance. Un centre en retard dont l'échéance
-- redevient future repasse actif ; une suspension se lève explicitement
-- (réactivation ou paiement).
create function public.platform_set_due_date(p_center_id uuid, p_due_date date, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  perform private.set_reason(p_reason);
  update public.centers
  set current_period_end = p_due_date,
      status = case when status = 'past_due' and p_due_date >= private.today() then 'active'::public.center_status else status end
  where id = p_center_id and status <> 'cancelled';
  if not found then
    raise exception 'Centre introuvable ou résilié.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Paiement d'abonnement
-- ---------------------------------------------------------------------
create function public.platform_record_payment(
  p_center_id uuid,
  p_amount numeric,
  p_paid_at date,
  p_method public.subscription_payment_method,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  perform private.require_super_admin();
  if p_paid_at > private.today() then
    raise exception 'La date de paiement ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  insert into public.subscription_payments (center_id, amount, paid_at, method, reference, recorded_by)
  values (p_center_id, p_amount, p_paid_at, p_method, nullif(btrim(p_reference), ''), (select auth.uid()))
  returning id into v_payment_id;
  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Statut
-- ---------------------------------------------------------------------
create function public.platform_set_status(p_center_id uuid, p_status public.center_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.center_status;
begin
  perform private.require_super_admin();
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez un motif.' using errcode = '22023';
  end if;
  if p_status not in ('active', 'suspended', 'cancelled') then
    raise exception 'Statut non modifiable manuellement.' using errcode = '22023';
  end if;

  select c.status into v_current from public.centers c where c.id = p_center_id for update;
  if v_current is null then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  if v_current = 'cancelled' then
    raise exception 'Centre résilié : la résiliation est définitive.' using errcode = '22023';
  end if;
  if v_current = p_status then
    return;
  end if;

  perform private.set_reason(btrim(p_reason));
  update public.centers set status = p_status where id = p_center_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Invitation renvoyée ou lien de mot de passe envoyé (journal uniquement :
-- l'envoi est fait par la Server Action, avec la clé service_role).
-- ---------------------------------------------------------------------
create function public.platform_log_invitation(p_center_id uuid, p_user_id uuid, p_password_link boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.center_id = p_center_id) then
    raise exception 'Compte introuvable dans ce centre.' using errcode = 'P0002';
  end if;
  perform private.log_platform_event(p_center_id,
    case when p_password_link then 'center.password_link_sent' else 'center.admin_invited' end,
    jsonb_build_object('email', (select u.email from auth.users u where u.id = p_user_id), 'resent', true));
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
    'public.platform_create_center(text, text, text, jsonb, public.subscription_plan, numeric, public.billing_interval, public.center_status, date, date, smallint, text, text, text, text, uuid, text, text)',
    'public.platform_update_center(uuid, text, text, text, jsonb, text, text, text, text)',
    'public.platform_set_pricing(uuid, public.subscription_plan, numeric, public.billing_interval, smallint)',
    'public.platform_set_due_date(uuid, date, text)',
    'public.platform_record_payment(uuid, numeric, date, public.subscription_payment_method, text)',
    'public.platform_set_status(uuid, public.center_status, text)',
    'public.platform_log_invitation(uuid, uuid, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke all on function private.set_reason(text) from public, anon, authenticated;
