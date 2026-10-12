-- =====================================================================
-- Console de la plateforme : fiche du centre, suspension manuelle
--
--  * suspension : motif (impayé, demande du client, fin de contrat,
--    autre), précision, date. La suspension automatique (job quotidien,
--    échéance + délai de grâce dépassés) reste « impayé » ;
--  * suspension manuelle (platform_suspend_center) : nom du centre à
--    retaper, sessions de tous les comptes du centre supprimées (équipe et
--    élèves). Les données ne sont jamais touchées ; la RLS coupe l'accès
--    dès la suspension (migration 018) ;
--  * un paiement remet en service un centre suspendu pour impayé, jamais
--    un centre suspendu pour un autre motif (réactivation explicite) ;
--  * réactivation (platform_reactivate_center) : immédiate ;
--  * adresse du centre (center_for_host) : indique un centre suspendu,
--    pour afficher l'écran de suspension à tout visiteur, même sans session ;
--  * fiche : compteurs (élèves, professeurs, assistants), dernière
--    connexion d'un administrateur, totaux des paiements d'abonnement par
--    mois, trimestre et année. Aucun détail financier interne du centre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Motif de suspension
-- ---------------------------------------------------------------------
alter table public.centers
  add column suspension_kind text check (suspension_kind in ('unpaid', 'client_request', 'contract_end', 'other')),
  add column suspension_note text check (suspension_note is null or length(suspension_note) <= 300),
  add column suspended_at timestamptz;

-- Centres déjà suspendus : par le job quotidien ou pour impayé.
update public.centers set suspension_kind = 'unpaid', suspended_at = now() where status = 'suspended';

alter table public.centers
  add constraint centers_suspension_state_check check ((status = 'suspended') = (suspension_kind is not null));

comment on column public.centers.suspension_kind is
  'Motif de la suspension en cours : unpaid (job quotidien ou impayé), client_request, contract_end, other.';

-- Passage en « suspendu » : motif « impayé » par défaut (job quotidien,
-- ancien chemin platform_set_status) ; sortie : motif effacé.
create function private.centers_suspension_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'suspended' then
    if old.status is distinct from 'suspended' then
      new.suspension_kind := coalesce(new.suspension_kind, 'unpaid');
      new.suspended_at := now();
    end if;
  else
    new.suspension_kind := null;
    new.suspension_note := null;
    new.suspended_at := null;
  end if;
  return new;
end;
$$;

create trigger centers_suspension_fields
before update on public.centers
for each row execute function private.centers_suspension_fields();

-- Paiement : remet en service, sauf une suspension manuelle (autre motif
-- qu'un impayé), levée uniquement par « Réactiver l'accès ».
create or replace function private.subscription_payments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kept_suspended boolean;
begin
  select c.status = 'suspended' and c.suspension_kind is distinct from 'unpaid'
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

-- ---------------------------------------------------------------------
-- Sessions de tous les comptes d'un centre (équipe et élèves)
-- ---------------------------------------------------------------------
-- Renvoie le nombre de comptes qui avaient une session ouverte.
create function private.revoke_center_sessions(p_center_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users uuid[];
  v_signed_in integer;
  v_user uuid;
begin
  select coalesce(array_agg(u.id), '{}') into v_users
  from (
    select p.id from public.profiles p where p.center_id = p_center_id
    union
    select a.user_id from public.student_accounts a where a.center_id = p_center_id
  ) u;

  select count(distinct s.user_id)::integer into v_signed_in
  from auth.sessions s where s.user_id = any (v_users);

  foreach v_user in array v_users loop
    perform private.revoke_user_sessions(v_user, null);
  end loop;
  return v_signed_in;
end;
$$;

revoke all on function private.revoke_center_sessions(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Suspendre / réactiver l'accès
-- ---------------------------------------------------------------------
create function public.platform_suspend_center(
  p_center_id uuid,
  p_kind text,
  p_note text,
  p_confirm_name text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_signed_out integer;
begin
  perform private.require_super_admin();
  if p_kind is null or p_kind not in ('unpaid', 'client_request', 'contract_end', 'other') then
    raise exception 'Choisissez un motif de suspension.' using errcode = '22023';
  end if;
  if p_kind = 'other' and v_note is null then
    raise exception 'Précisez le motif de la suspension.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Motif trop long (300 caractères au plus).' using errcode = '22023';
  end if;

  select * into v_center from public.centers c where c.id = p_center_id for update;
  if v_center.id is null then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  if v_center.status = 'cancelled' then
    raise exception 'Centre résilié : il ne peut pas être suspendu.' using errcode = '22023';
  end if;
  if v_center.status = 'suspended' then
    raise exception 'Ce centre est déjà suspendu.' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_center.name)) then
    raise exception 'Le nom saisi ne correspond pas au nom du centre.' using errcode = '22023';
  end if;

  update public.centers
  set status = 'suspended', suspension_kind = p_kind, suspension_note = v_note
  where id = p_center_id;

  v_signed_out := private.revoke_center_sessions(p_center_id);

  perform private.log_platform_event(p_center_id, 'center.access_suspended',
    jsonb_build_object('kind', p_kind, 'reason', v_note, 'signed_out', v_signed_out));
  return v_signed_out;
end;
$$;

create function public.platform_reactivate_center(p_center_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_super_admin();
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Motif trop long (300 caractères au plus).' using errcode = '22023';
  end if;
  select * into v_center from public.centers c where c.id = p_center_id for update;
  if v_center.id is null then
    raise exception 'Centre introuvable.' using errcode = 'P0002';
  end if;
  if v_center.status <> 'suspended' then
    raise exception 'Ce centre n''est pas suspendu.' using errcode = '22023';
  end if;

  update public.centers set status = 'active' where id = p_center_id;

  perform private.log_platform_event(p_center_id, 'center.access_reactivated',
    jsonb_build_object('previous_kind', v_center.suspension_kind, 'reason', v_note));
end;
$$;

-- ---------------------------------------------------------------------
-- Adresse d'un centre : centre suspendu signalé (écran de suspension)
-- ---------------------------------------------------------------------
drop function public.center_for_host(text, text);

create function public.center_for_host(p_slug text default null, p_domain text default null)
returns table (center_id uuid, name text, slug text, white_label boolean, branding jsonb, moved boolean, blocked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select c.id, false as moved
    from public.centers c
    where p_slug is not null and c.slug = lower(p_slug)
    union all
    select h.center_id, true
    from public.center_slug_history h
    where p_slug is not null and h.old_slug = lower(p_slug) and not private.is_reserved_slug(h.old_slug)
    union all
    select b.center_id, false
    from public.center_branding b
    where p_domain is not null and b.custom_domain = lower(p_domain) and b.domain_verified
      and private.center_has_module(b.center_id, 'white_label')
  )
  select c.id, c.name, c.slug, private.center_has_module(c.id, 'white_label'), private.applied_branding(c.id), t.moved,
         c.status = 'suspended'
  from target t
  join public.centers c on c.id = t.id
  where c.status <> 'cancelled'
  order by t.moved
  limit 1;
$$;

revoke all on function public.center_for_host(text, text) from public;
grant execute on function public.center_for_host(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Fiche du centre : compteurs et suspension
-- ---------------------------------------------------------------------
create function public.platform_center_overview(p_center_id uuid)
returns table (
  students_count integer,
  active_students integer,
  teachers_count integer,
  assistants_count integer,
  admins_count integer,
  student_accounts_count integer,
  last_admin_sign_in_at timestamptz,
  suspension_kind text,
  suspension_note text,
  suspended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select
    (select count(*)::integer from public.students st where st.center_id = c.id),
    (select count(*)::integer from public.students st
      where st.center_id = c.id
        and (exists (select 1 from public.enrollments e where e.student_id = st.id and e.active)
             or exists (select 1 from public.pack_enrollments pe where pe.student_id = st.id and pe.active))),
    (select count(*)::integer from public.profiles p where p.center_id = c.id and p.role = 'teacher' and p.active),
    (select count(*)::integer from public.profiles p where p.center_id = c.id and p.role = 'assistant' and p.active),
    (select count(*)::integer from public.profiles p where p.center_id = c.id and p.role = 'admin' and p.active),
    (select count(*)::integer from public.student_accounts a where a.center_id = c.id and a.active),
    (select max(u.last_sign_in_at) from public.profiles p join auth.users u on u.id = p.id
      where p.center_id = c.id and p.role = 'admin'),
    c.suspension_kind, c.suspension_note, c.suspended_at
  from public.centers c
  where c.id = p_center_id;
end;
$$;

-- Totaux des paiements d'abonnement d'un centre : par mois, trimestre, année.
create function public.platform_center_payment_totals(p_center_id uuid)
returns table (
  granularity text,
  period_start date,
  total numeric,
  payments_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select g.granularity, date_trunc(g.granularity, p.paid_at)::date, sum(p.amount), count(*)::integer
  from public.subscription_payments p
  cross join (values ('month'), ('quarter'), ('year')) as g(granularity)
  where p.center_id = p_center_id
  group by g.granularity, date_trunc(g.granularity, p.paid_at)
  order by g.granularity, 2 desc;
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
    'public.platform_suspend_center(uuid, text, text, text)',
    'public.platform_reactivate_center(uuid, text)',
    'public.platform_center_overview(uuid)',
    'public.platform_center_payment_totals(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
