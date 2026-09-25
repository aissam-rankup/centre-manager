-- =====================================================================
-- CentroManager — 012 : packs d'abonnement
--
-- Règles validées :
--  * un pack appartient à un niveau et regroupe des matières choisies par
--    l'administrateur, à un prix mensuel unique ;
--  * une seule facture par mois pour le pack (mêmes cycles et échéances
--    qu'une inscription) ;
--  * un élève a soit un pack, soit des matières à l'unité, jamais les deux,
--    et au plus un pack actif ;
--  * souscrire un pack inscrit l'élève à chaque matière du pack : il apparaît
--    dans les listes de classe, l'appel et les alertes d'absences. Ces
--    inscriptions (pack_enrollment_id renseigné) n'ont pas de prix propre et
--    ne sont jamais facturées ; elles suivent le pack (arrêt, reprise,
--    matières ajoutées ou retirées du pack).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.packs (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  level_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  monthly_price numeric(10, 2) not null check (monthly_price >= 0),
  -- Un pack désactivé n'est plus proposé ; les abonnements en cours continuent.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (level_id, center_id) references public.levels (id, center_id) on delete restrict,
  unique (level_id, name),
  unique (id, center_id)
);

create table public.pack_subjects (
  pack_id uuid not null references public.packs (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  primary key (pack_id, subject_id)
);

create table public.pack_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  pack_id uuid not null references public.packs (id) on delete restrict,
  start_date date not null default private.today(),
  price_agreed numeric(10, 2) not null check (price_agreed >= 0),
  active boolean not null default true,
  billing_day smallint generated always as ((case when extract(day from start_date) < 15 then 1 else 15 end)::smallint) stored,
  created_at timestamptz not null default now(),
  unique (id, student_id)
);

comment on column public.pack_enrollments.billing_day is
  'Jour du cycle de facturation (1 ou 15), déduit de la date de souscription.';

create unique index pack_enrollments_one_active_idx on public.pack_enrollments (student_id) where active;
create index pack_enrollments_pack_id_idx on public.pack_enrollments (pack_id);
create index packs_level_id_idx on public.packs (level_id);
create index pack_subjects_subject_id_idx on public.pack_subjects (subject_id);

-- Inscriptions couvertes par un pack.
alter table public.enrollments
  add column pack_enrollment_id uuid references public.pack_enrollments (id) on delete cascade;
create index enrollments_pack_enrollment_id_idx on public.enrollments (pack_enrollment_id);

-- Factures : soit d'une inscription, soit d'un abonnement pack.
alter table public.invoices alter column enrollment_id drop not null;
alter table public.invoices add column pack_enrollment_id uuid;
alter table public.invoices
  add constraint invoices_pack_enrollment_fkey
    foreign key (pack_enrollment_id, student_id) references public.pack_enrollments (id, student_id) on delete cascade,
  add constraint invoices_one_source_check check (num_nonnulls(enrollment_id, pack_enrollment_id) = 1),
  add constraint invoices_pack_enrollment_period_key unique (pack_enrollment_id, period_start);
create index invoices_pack_enrollment_id_idx on public.invoices (pack_enrollment_id);

-- ---------------------------------------------------------------------
-- Aide RLS
-- ---------------------------------------------------------------------
create function private.pack_center_id(p_pack_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.center_id from public.packs p where p.id = p_pack_id;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.packs enable row level security;
alter table public.pack_subjects enable row level security;
alter table public.pack_enrollments enable row level security;

-- packs : lecture admin et assistant (contient les prix), écriture admin.
create policy packs_select_staff on public.packs
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

create policy packs_insert_admin on public.packs
for insert to authenticated
with check ((select private.is_admin()) and center_id = (select private.auth_center_id()));

create policy packs_update_admin on public.packs
for update to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()))
with check (center_id = (select private.auth_center_id()));

create policy packs_delete_admin on public.packs
for delete to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()));

-- pack_subjects
create policy pack_subjects_select_staff on public.pack_subjects
for select to authenticated
using ((select private.is_staff()) and private.pack_center_id(pack_id) = (select private.auth_center_id()));

create policy pack_subjects_insert_admin on public.pack_subjects
for insert to authenticated
with check ((select private.is_admin()) and private.pack_center_id(pack_id) = (select private.auth_center_id()));

create policy pack_subjects_delete_admin on public.pack_subjects
for delete to authenticated
using ((select private.is_admin()) and private.pack_center_id(pack_id) = (select private.auth_center_id()));

-- pack_enrollments : l'assistant souscrit (au prix du pack), l'admin gère.
create policy pack_enrollments_select_staff on public.pack_enrollments
for select to authenticated
using ((select private.is_staff()) and private.student_center_id(student_id) = (select private.auth_center_id()));

create policy pack_enrollments_insert_staff on public.pack_enrollments
for insert to authenticated
with check ((select private.is_staff()) and private.student_center_id(student_id) = (select private.auth_center_id()));

create policy pack_enrollments_update_admin on public.pack_enrollments
for update to authenticated
using ((select private.is_admin()) and private.student_center_id(student_id) = (select private.auth_center_id()))
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy pack_enrollments_delete_admin on public.pack_enrollments
for delete to authenticated
using ((select private.is_admin()) and private.student_center_id(student_id) = (select private.auth_center_id()));

revoke all on public.packs, public.pack_subjects, public.pack_enrollments from anon;

-- ---------------------------------------------------------------------
-- Intégrité des packs
-- ---------------------------------------------------------------------

-- Les matières d'un pack sont celles de son niveau.
create function private.pack_subjects_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.packs p
    join public.subjects s on s.level_id = p.level_id
    where p.id = new.pack_id and s.id = new.subject_id
  ) then
    raise exception 'Les matières du pack doivent appartenir à son niveau.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pack_subjects_before_write
before insert or update on public.pack_subjects
for each row execute function private.pack_subjects_before_write();

-- Le niveau d'un pack ne change pas (ses matières et abonnés en dépendent).
create function private.packs_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.level_id is distinct from old.level_id then
    raise exception 'Le niveau d''un pack ne peut pas être modifié.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger packs_before_update
before update of level_id on public.packs
for each row execute function private.packs_before_update();

-- Souscription : même centre et même niveau que l'élève, prix du pack par
-- défaut (seul l'admin fixe un autre prix), pas de matière à l'unité active.
create function private.pack_enrollments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack public.packs;
begin
  select * into v_pack from public.packs where id = new.pack_id;

  if v_pack.center_id is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et le pack doivent appartenir au même centre.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and not v_pack.active then
    raise exception 'Ce pack n''est plus proposé.' using errcode = '23514';
  end if;

  if new.price_agreed is null then
    new.price_agreed := v_pack.monthly_price;
  end if;

  if private.auth_role() = 'assistant' and new.price_agreed <> v_pack.monthly_price then
    raise exception 'Seul un administrateur peut fixer un tarif.' using errcode = '42501';
  end if;

  if new.active then
    if not exists (
      select 1 from public.students st where st.id = new.student_id and st.level_id = v_pack.level_id
    ) then
      raise exception 'Ce pack n''appartient pas au niveau de l''élève.' using errcode = '23514';
    end if;

    if exists (
      select 1 from public.enrollments e
      where e.student_id = new.student_id and e.active and e.pack_enrollment_id is null
    ) then
      raise exception 'L''élève suit des matières à l''unité : arrêtez-les avant de souscrire un pack.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger pack_enrollments_before_write
before insert or update of student_id, pack_id, price_agreed, active on public.pack_enrollments
for each row execute function private.pack_enrollments_before_write();

-- ---------------------------------------------------------------------
-- Facturation des packs
-- ---------------------------------------------------------------------
create function private.create_pack_period_invoice(p_pack_enrollment_id uuid, p_date date, p_resumed boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.pack_enrollments;
  v_period_start date;
  v_inserted integer;
begin
  select * into v_subscription from public.pack_enrollments where id = p_pack_enrollment_id;
  if v_subscription.id is null or not v_subscription.active or v_subscription.start_date > p_date then
    return false;
  end if;

  v_period_start := private.billing_period_start(p_date, v_subscription.billing_day);

  insert into public.invoices (pack_enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    v_subscription.id,
    v_subscription.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    v_subscription.price_agreed,
    'pending',
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end + 5
  )
  on conflict (pack_enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- Souscription : inscriptions aux matières du pack et première facture
-- (due 5 jours après la souscription). Arrêt / reprise : les matières suivent,
-- et une reprise facture la période en cours.
create function private.pack_enrollments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.enrollments (student_id, subject_id, start_date, price_agreed, active, pack_enrollment_id)
    select new.student_id, ps.subject_id, new.start_date, 0, new.active, new.id
    from public.pack_subjects ps
    where ps.pack_id = new.pack_id;

    if new.active then
      perform private.create_pack_period_invoice(new.id, new.start_date, true);
    end if;
  elsif new.active is distinct from old.active then
    update public.enrollments set active = new.active where pack_enrollment_id = new.id;
    if new.active then
      perform private.create_pack_period_invoice(new.id, private.today(), true);
    end if;
  end if;
  return null;
end;
$$;

create trigger pack_enrollments_after_write
after insert or update of active on public.pack_enrollments
for each row execute function private.pack_enrollments_after_write();

-- Matières ajoutées ou retirées d'un pack : les abonnés suivent.
create function private.pack_subjects_sync_subscribers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.enrollments (student_id, subject_id, start_date, price_agreed, active, pack_enrollment_id)
    select pe.student_id, new.subject_id, greatest(pe.start_date, private.today()), 0, pe.active, pe.id
    from public.pack_enrollments pe
    where pe.pack_id = new.pack_id;
    return null;
  end if;

  delete from public.enrollments e
  using public.pack_enrollments pe
  where pe.pack_id = old.pack_id
    and e.pack_enrollment_id = pe.id
    and e.subject_id = old.subject_id;
  return null;
end;
$$;

create trigger pack_subjects_sync_subscribers
after insert or delete on public.pack_subjects
for each row execute function private.pack_subjects_sync_subscribers();

-- ---------------------------------------------------------------------
-- Inscriptions : prise en compte des packs
-- ---------------------------------------------------------------------

-- Prix : une matière couverte par un pack n'a pas de prix propre.
create or replace function private.enrollments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_price numeric(10, 2);
  v_subject_center uuid;
begin
  select s.monthly_price, s.center_id
    into v_subject_price, v_subject_center
  from public.subjects s
  where s.id = new.subject_id;

  if v_subject_center is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et la matière doivent appartenir au même centre.'
      using errcode = '23514';
  end if;

  if new.pack_enrollment_id is not null then
    new.price_agreed := 0;
    return new;
  end if;

  if new.price_agreed is null then
    new.price_agreed := v_subject_price;
  end if;

  if private.auth_role() = 'assistant' and new.price_agreed <> v_subject_price then
    raise exception 'Seul un administrateur peut fixer un tarif.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Pack et matières à l'unité ne se combinent pas ; les matières d'un pack ne
-- se modifient qu'à travers le pack.
create function private.enrollments_pack_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.pack_enrollment_id is not null and pg_trigger_depth() = 1
     and (new.active is distinct from old.active
          or new.pack_enrollment_id is distinct from old.pack_enrollment_id
          or new.subject_id is distinct from old.subject_id) then
    raise exception 'Cette matière fait partie d''un pack : modifiez ou arrêtez le pack.' using errcode = '23514';
  end if;

  if new.pack_enrollment_id is null and new.active and exists (
    select 1 from public.pack_enrollments pe where pe.student_id = new.student_id and pe.active
  ) then
    raise exception 'L''élève a un pack actif : il ne peut pas prendre de matière à l''unité.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger enrollments_pack_rules
before insert or update of active, pack_enrollment_id, subject_id on public.enrollments
for each row execute function private.enrollments_pack_rules();

-- Pas de facture pour une matière couverte par un pack.
create or replace function private.enrollments_create_first_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := private.billing_period_start(new.start_date, new.billing_day);
begin
  if new.pack_enrollment_id is not null then
    return null;
  end if;

  insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    new.id,
    new.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    new.price_agreed,
    'pending',
    new.start_date + 5
  )
  on conflict (enrollment_id, period_start) do nothing;
  return null;
end;
$$;

create or replace function private.create_period_invoice(p_enrollment_id uuid, p_date date, p_resumed boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments;
  v_period_start date;
  v_inserted integer;
begin
  select * into v_enrollment from public.enrollments where id = p_enrollment_id;
  if v_enrollment.id is null or not v_enrollment.active or v_enrollment.start_date > p_date
     or v_enrollment.pack_enrollment_id is not null then
    return false;
  end if;

  v_period_start := private.billing_period_start(p_date, v_enrollment.billing_day);

  insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    v_enrollment.id,
    v_enrollment.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    v_enrollment.price_agreed,
    'pending',
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end + 5
  )
  on conflict (enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- Génération quotidienne : inscriptions à l'unité et abonnements packs.
create or replace function private.generate_invoices(p_date date default private.today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer := 0;
  v_id uuid;
begin
  for v_id in
    select e.id from public.enrollments e
    where e.active and e.start_date <= p_date and e.pack_enrollment_id is null
  loop
    if private.create_period_invoice(v_id, p_date) then
      v_created := v_created + 1;
    end if;
  end loop;

  for v_id in
    select pe.id from public.pack_enrollments pe where pe.active and pe.start_date <= p_date
  loop
    if private.create_pack_period_invoice(v_id, p_date) then
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$$;

-- L'assistant ne modifie que les colonnes de paiement, source comprise.
create or replace function private.invoices_guard_assistant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.auth_role() = 'assistant' and (
    new.enrollment_id is distinct from old.enrollment_id
    or new.pack_enrollment_id is distinct from old.pack_enrollment_id
    or new.student_id is distinct from old.student_id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.amount_due is distinct from old.amount_due
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Un assistant ne peut modifier que les informations de paiement d''une facture.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Nouvel élève : matières à l'unité ou pack
-- ---------------------------------------------------------------------
drop function public.create_student(uuid, text, uuid, uuid[], text, text, text, text);

create function public.create_student(
  p_student_id uuid,
  p_full_name text,
  p_level_id uuid,
  p_subject_ids uuid[],
  p_guardian_name text default null,
  p_guardian_phone text default null,
  p_notes text default null,
  p_photo_path text default null,
  p_pack_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
begin
  if v_center_id is null or not private.is_staff() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if p_pack_id is not null then
    if coalesce(array_length(p_subject_ids, 1), 0) > 0 then
      raise exception 'Choisissez un pack ou des matières à l''unité, pas les deux.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.packs p where p.id = p_pack_id and p.level_id = p_level_id and p.active) then
      raise exception 'Le pack doit appartenir au niveau choisi.' using errcode = '22023';
    end if;
  else
    if coalesce(array_length(p_subject_ids, 1), 0) = 0 then
      raise exception 'Choisissez au moins une matière.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from unnest(p_subject_ids) as sid
      where not exists (
        select 1 from public.subjects s where s.id = sid and s.level_id = p_level_id
      )
    ) then
      raise exception 'Les matières doivent appartenir au niveau choisi.' using errcode = '22023';
    end if;
  end if;

  if p_photo_path is not null and p_photo_path not like v_center_id::text || '/%' then
    raise exception 'Chemin de photo invalide.' using errcode = '22023';
  end if;

  insert into public.students (id, center_id, full_name, level_id, photo_url, guardian_name, guardian_phone, notes, created_by)
  values (
    p_student_id,
    v_center_id,
    btrim(p_full_name),
    p_level_id,
    p_photo_path,
    nullif(btrim(p_guardian_name), ''),
    nullif(btrim(p_guardian_phone), ''),
    nullif(btrim(p_notes), ''),
    (select auth.uid())
  );

  if p_pack_id is not null then
    -- Prix = tarif du pack ; matières et première facture créées par trigger.
    insert into public.pack_enrollments (student_id, pack_id, start_date)
    values (p_student_id, p_pack_id, private.today());
  else
    -- Prix convenu = tarif de la matière (trigger enrollments_before_write).
    insert into public.enrollments (student_id, subject_id, start_date)
    select p_student_id, sid, private.today()
    from (select distinct unnest(p_subject_ids) as sid) as subjects;
  end if;

  return p_student_id;
end;
$$;

revoke execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid) from public, anon;
grant execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Rapports : abonnés et revenu par pack
-- ---------------------------------------------------------------------
create function public.admin_pack_report()
returns table (
  pack_id uuid,
  pack_name text,
  level_id uuid,
  level_name text,
  level_sort integer,
  monthly_price numeric,
  active boolean,
  subscribers integer,
  agreed_revenue numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.name,
    l.id,
    l.name,
    l.sort_order,
    p.monthly_price,
    p.active,
    (select count(*)::integer from public.pack_enrollments pe where pe.pack_id = p.id and pe.active),
    (select coalesce(sum(pe.price_agreed), 0) from public.pack_enrollments pe where pe.pack_id = p.id and pe.active)
  from public.packs p
  join public.levels l on l.id = p.level_id
  order by l.sort_order, l.name, p.name;
end;
$$;

revoke execute on function public.admin_pack_report() from public, anon;
grant execute on function public.admin_pack_report() to authenticated;

-- Fonctions internes : jamais appelées par les utilisateurs.
revoke all on function
  private.create_pack_period_invoice(uuid, date, boolean)
from public, anon, authenticated;
