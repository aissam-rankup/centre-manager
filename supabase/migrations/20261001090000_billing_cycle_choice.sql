-- =====================================================================
-- CentroManager — 014 : cycle de paiement choisi, échéance le jour même,
-- suivi des notes d'élève (notifications).
--
-- Règles validées :
--  * à l'inscription, le cycle (le 1er ou le 15) est choisi ; à défaut, il
--    suit le cycle déjà en place pour l'élève, sinon la date d'inscription ;
--  * la première facture couvre la période du cycle en cours
--    (ex. inscrit le 20/09, cycle du 1er : période du 01/09 au 30/09) ;
--  * une facture est due le premier jour de sa période (ou le jour de
--    l'inscription / de la reprise) et passe en retard le jour même si elle
--    n'est pas réglée : plus de délai de 5 jours ;
--  * les factures existantes gardent leur échéance.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cycle choisi (colonne ordinaire, valeurs 1 ou 15)
-- ---------------------------------------------------------------------
alter table public.enrollments alter column billing_day drop expression;
alter table public.enrollments
  add constraint enrollments_billing_day_check check (billing_day in (1, 15));

alter table public.pack_enrollments alter column billing_day drop expression;
alter table public.pack_enrollments
  add constraint pack_enrollments_billing_day_check check (billing_day in (1, 15));

comment on column public.enrollments.billing_day is
  'Jour du cycle de facturation (1 ou 15), choisi à l''inscription.';
comment on column public.pack_enrollments.billing_day is
  'Jour du cycle de facturation (1 ou 15), choisi à la souscription.';

-- Cycle par défaut : celui du pack, sinon celui déjà en place pour l'élève,
-- sinon d'après la date d'inscription.
create function private.default_billing_day(p_student_id uuid, p_start_date date)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.billing_day from public.enrollments e
      where e.student_id = p_student_id and e.active order by e.start_date desc limit 1),
    (select pe.billing_day from public.pack_enrollments pe
      where pe.student_id = p_student_id and pe.active order by pe.start_date desc limit 1),
    (case when extract(day from p_start_date) < 15 then 1 else 15 end)::smallint
  );
$$;

create function private.enrollments_billing_day_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.billing_day is null then
    if new.pack_enrollment_id is not null then
      select pe.billing_day into new.billing_day from public.pack_enrollments pe where pe.id = new.pack_enrollment_id;
    else
      new.billing_day := private.default_billing_day(new.student_id, new.start_date);
    end if;
  end if;
  return new;
end;
$$;

create trigger enrollments_billing_day_default
before insert on public.enrollments
for each row execute function private.enrollments_billing_day_default();

create function private.pack_enrollments_billing_day_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.billing_day is null then
    new.billing_day := private.default_billing_day(new.student_id, new.start_date);
  end if;
  return new;
end;
$$;

create trigger pack_enrollments_billing_day_default
before insert on public.pack_enrollments
for each row execute function private.pack_enrollments_billing_day_default();

-- ---------------------------------------------------------------------
-- Échéances : le jour même
-- ---------------------------------------------------------------------
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
    new.start_date
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
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end
  )
  on conflict (enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

create or replace function private.create_pack_period_invoice(p_pack_enrollment_id uuid, p_date date, p_resumed boolean default false)
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
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end
  )
  on conflict (pack_enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- En retard dès le jour de l'échéance s'il n'est pas réglé.
create or replace function private.invoice_is_overdue(p_status public.invoice_status, p_due_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'overdue' or (p_status = 'pending' and p_due_date <= private.today());
$$;

create or replace function private.mark_overdue_invoices(p_date date default private.today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with switched as (
    update public.invoices
    set status = 'overdue'
    where status = 'pending' and due_date <= p_date
    returning id, student_id, amount_due, due_date
  ),
  alerted as (
    insert into public.alerts (student_id, type, payload)
    select s.student_id, 'overdue_payment',
           jsonb_build_object('invoice_id', s.id, 'amount_due', s.amount_due, 'due_date', s.due_date)
    from switched s
    where not exists (
      select 1 from public.alerts a
      where a.type = 'overdue_payment' and a.payload ->> 'invoice_id' = s.id::text
    )
    returning 1
  )
  select count(*)::integer into v_count from switched;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Nouvel élève : cycle choisi
-- ---------------------------------------------------------------------
drop function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid);

create function public.create_student(
  p_student_id uuid,
  p_full_name text,
  p_level_id uuid,
  p_subject_ids uuid[],
  p_guardian_name text default null,
  p_guardian_phone text default null,
  p_notes text default null,
  p_photo_path text default null,
  p_pack_id uuid default null,
  p_billing_day smallint default null
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

  if p_billing_day is not null and p_billing_day not in (1, 15) then
    raise exception 'Le cycle de paiement doit être le 1er ou le 15.' using errcode = '22023';
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
    insert into public.pack_enrollments (student_id, pack_id, start_date, billing_day)
    values (p_student_id, p_pack_id, private.today(), p_billing_day);
  else
    -- Prix convenu = tarif de la matière (trigger enrollments_before_write).
    insert into public.enrollments (student_id, subject_id, start_date, billing_day)
    select p_student_id, sid, private.today(), p_billing_day
    from (select distinct unnest(p_subject_ids) as sid) as subjects;
  end if;

  return p_student_id;
end;
$$;

revoke execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid, smallint) from public, anon;
grant execute on function public.create_student(uuid, text, uuid, uuid[], text, text, text, text, uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------
-- Notes d'élève : date et auteur de la dernière modification
-- ---------------------------------------------------------------------
alter table public.students
  add column notes_updated_at timestamptz,
  add column notes_updated_by uuid references public.profiles (id) on delete set null;

create function private.students_track_notes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.notes is not null then
      new.notes_updated_at := now();
      new.notes_updated_by := coalesce(new.created_by, (select auth.uid()));
    end if;
  elsif new.notes is distinct from old.notes then
    new.notes_updated_at := now();
    new.notes_updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger students_track_notes
before insert or update of notes on public.students
for each row execute function private.students_track_notes();

update public.students set notes_updated_at = created_at, notes_updated_by = created_by where notes is not null;
