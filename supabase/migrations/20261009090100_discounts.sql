-- =====================================================================
-- CentroManager — 023 : remises accordées aux élèves (page 6, module 4)
--
-- Règles validées :
--  * la remise remplace le « prix convenu » : le prix d'une inscription est
--    toujours le tarif de la matière (ou du pack) et n'est plus modifiable ;
--    les prix convenus déjà baissés sont convertis en remises « autre » ;
--  * pourcentage ou montant fixe (par facture mensuelle de la matière ou du
--    pack), sur toutes les matières de l'élève ou sur une seule (ou un pack) ;
--  * plusieurs remises sur une même facture : la plus favorable à l'élève
--    s'applique et le conflit est signalé ;
--  * chaque facture porte son tarif plein, la remise appliquée et le net
--    à encaisser ; les factures non réglées sont recalculées dès qu'une
--    remise change, les factures réglées ne bougent plus ;
--  * seul l'admin crée, modifie ou supprime une remise ; l'assistant la voit.
-- =====================================================================

create type public.discount_type as enum ('percentage', 'fixed_amount');
create type public.discount_scope as enum ('all_subjects', 'specific_subject');
create type public.discount_reason as enum ('sibling', 'social', 'merit', 'referral', 'other');

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  student_id uuid not null,
  type public.discount_type not null,
  value numeric(10, 2) not null check (value > 0),
  scope public.discount_scope not null,
  -- Portée « une matière » : la matière, ou le pack de l'élève.
  subject_id uuid,
  pack_id uuid,
  reason public.discount_reason not null,
  reason_note text check (reason_note is null or length(btrim(reason_note)) between 1 and 200),
  granted_by uuid default auth.uid() references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  valid_from date not null default private.today(),
  valid_to date,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  foreign key (student_id, center_id) references public.students (id, center_id) on delete cascade,
  foreign key (subject_id, center_id) references public.subjects (id, center_id) on delete cascade,
  foreign key (pack_id, center_id) references public.packs (id, center_id) on delete cascade,
  constraint discounts_percentage_check check (type <> 'percentage' or value <= 100),
  constraint discounts_scope_check check (
    (scope = 'all_subjects' and subject_id is null and pack_id is null)
    or (scope = 'specific_subject' and num_nonnulls(subject_id, pack_id) = 1)
  ),
  constraint discounts_period_check check (valid_to is null or valid_to >= valid_from),
  constraint discounts_other_note_check check (reason <> 'other' or reason_note is not null)
);

create index discounts_student_idx on public.discounts (student_id);
create index discounts_center_idx on public.discounts (center_id);
create index discounts_subject_idx on public.discounts (subject_id);
create index discounts_pack_idx on public.discounts (pack_id);
create index discounts_granted_by_idx on public.discounts (granted_by);

comment on column public.discounts.value is
  'Pourcentage (0–100) ou montant en MAD retiré de chaque facture mensuelle concernée.';

-- ---------------------------------------------------------------------
-- Factures : tarif plein, remise, net
-- ---------------------------------------------------------------------
alter table public.invoices
  add column amount_full numeric(10, 2),
  add column discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  add column discount_id uuid references public.discounts (id) on delete set null,
  -- Remise telle qu'appliquée : {type, value, reason, reason_note}.
  add column discount_snapshot jsonb,
  -- Plusieurs remises possibles : la plus favorable a été retenue.
  add column discount_conflict boolean not null default false;

update public.invoices set amount_full = amount_due;

alter table public.invoices
  alter column amount_full set not null,
  add constraint invoices_amount_full_check check (amount_full >= 0),
  add constraint invoices_net_check check (amount_due = amount_full - discount_amount);

create index invoices_discount_idx on public.invoices (discount_id);

-- Montant retiré par une remise sur une facture de tarif plein donné.
create function private.discount_reduction(p_type public.discount_type, p_value numeric, p_full numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(least(p_full, case when p_type = 'percentage' then p_full * p_value / 100 else p_value end), 2);
$$;

-- Remise la plus favorable pour une facture (matière ou pack, période).
create function private.best_discount(
  p_student_id uuid,
  p_subject_id uuid,
  p_pack_id uuid,
  p_period_start date,
  p_period_end date,
  p_full numeric
)
returns table (discount_id uuid, amount numeric, snapshot jsonb, conflict boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select d.*, private.discount_reduction(d.type, d.value, p_full) as reduction
    from public.discounts d
    where d.student_id = p_student_id
      and d.is_active
      and d.valid_from <= p_period_end
      and (d.valid_to is null or d.valid_to >= p_period_start)
      and (
        d.scope = 'all_subjects'
        or (p_subject_id is not null and d.subject_id = p_subject_id)
        or (p_pack_id is not null and d.pack_id = p_pack_id)
      )
  )
  select c.id,
         c.reduction,
         jsonb_build_object('type', c.type, 'value', c.value, 'reason', c.reason, 'reason_note', c.reason_note),
         (select count(*) from candidates) > 1
  from candidates c
  order by c.reduction desc, c.granted_at
  limit 1;
$$;

-- Applique la remise à une facture (ligne en cours d'écriture).
create function private.apply_invoice_discount(p_invoice public.invoices)
returns public.invoices
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
  v_pack_id uuid;
  v_best record;
begin
  if p_invoice.enrollment_id is not null then
    select e.subject_id into v_subject_id from public.enrollments e where e.id = p_invoice.enrollment_id;
  else
    select pe.pack_id into v_pack_id from public.pack_enrollments pe where pe.id = p_invoice.pack_enrollment_id;
  end if;

  select * into v_best
  from private.best_discount(p_invoice.student_id, v_subject_id, v_pack_id,
                             p_invoice.period_start, p_invoice.period_end, p_invoice.amount_full);

  p_invoice.discount_id := v_best.discount_id;
  p_invoice.discount_amount := coalesce(v_best.amount, 0);
  p_invoice.discount_snapshot := v_best.snapshot;
  p_invoice.discount_conflict := coalesce(v_best.conflict, false);
  p_invoice.amount_due := p_invoice.amount_full - p_invoice.discount_amount;
  return p_invoice;
end;
$$;

-- Nouvelle facture : tarif plein = montant fourni, puis remise.
create function private.invoices_before_insert_discount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.amount_full := coalesce(new.amount_full, new.amount_due);
  new := private.apply_invoice_discount(new);
  return new;
end;
$$;

create trigger invoices_before_insert_discount
before insert on public.invoices
for each row execute function private.invoices_before_insert_discount();

-- Recalcul des factures non réglées d'un élève (remise créée, modifiée, retirée).
create function private.reprice_open_invoices(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_new public.invoices;
  v_count integer := 0;
begin
  for v_invoice in
    select * from public.invoices i
    where i.student_id = p_student_id and i.status <> 'paid' and i.amount_paid = 0
    for update
  loop
    v_new := private.apply_invoice_discount(v_invoice);
    if (v_new.discount_id, v_new.discount_amount, v_new.discount_conflict)
       is distinct from (v_invoice.discount_id, v_invoice.discount_amount, v_invoice.discount_conflict) then
      update public.invoices
      set discount_id = v_new.discount_id,
          discount_amount = v_new.discount_amount,
          discount_snapshot = v_new.discount_snapshot,
          discount_conflict = v_new.discount_conflict,
          amount_due = v_new.amount_due
      where id = v_invoice.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Remises : contrôles, recalcul, journal
-- ---------------------------------------------------------------------
create function private.discounts_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  select * into v_student from public.students s where s.id = new.student_id;
  new.center_id := v_student.center_id;

  if new.subject_id is not null and not exists (
    select 1 from public.subjects s where s.id = new.subject_id and s.level_id = v_student.level_id
  ) then
    raise exception 'La matière doit appartenir au niveau de l''élève.' using errcode = '23514';
  end if;
  if new.pack_id is not null and not exists (
    select 1 from public.packs p where p.id = new.pack_id and p.level_id = v_student.level_id
  ) then
    raise exception 'Le pack doit appartenir au niveau de l''élève.' using errcode = '23514';
  end if;

  new.reason_note := nullif(btrim(new.reason_note), '');
  if tg_op = 'UPDATE' then
    new.granted_by := old.granted_by;
    new.granted_at := old.granted_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger discounts_before_write
before insert or update on public.discounts
for each row execute function private.discounts_before_write();

create function private.discounts_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.discounts := coalesce(new, old);
begin
  perform private.reprice_open_invoices(v_row.student_id);
  perform private.log_center_event(
    v_row.center_id,
    case tg_op when 'INSERT' then 'discount.granted' when 'UPDATE' then 'discount.updated' else 'discount.deleted' end,
    v_row.id,
    jsonb_build_object('student_id', v_row.student_id, 'type', v_row.type, 'value', v_row.value,
                       'scope', v_row.scope, 'reason', v_row.reason, 'is_active', v_row.is_active)
  );
  return null;
end;
$$;

create trigger discounts_after_write
after insert or update or delete on public.discounts
for each row execute function private.discounts_after_write();

-- Remises qui se chevauchent sur une même facture possible (à arbitrer).
create view public.discount_overlaps
with (security_invoker = true)
as
select a.center_id, a.student_id, a.id as discount_id, b.id as other_discount_id
from public.discounts a
join public.discounts b
  on b.student_id = a.student_id
 and b.id > a.id
 and b.is_active
 and b.valid_from <= coalesce(a.valid_to, 'infinity'::date)
 and a.valid_from <= coalesce(b.valid_to, 'infinity'::date)
 and (
   a.scope = 'all_subjects' or b.scope = 'all_subjects'
   or a.subject_id = b.subject_id or a.pack_id = b.pack_id
 )
where a.is_active;

-- ---------------------------------------------------------------------
-- RLS : lecture admin et assistant, écriture admin
-- ---------------------------------------------------------------------
alter table public.discounts enable row level security;

create policy discounts_select_staff on public.discounts
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

create policy discounts_insert_admin on public.discounts
for insert to authenticated
with check ((select private.is_admin()) and private.student_center_id(student_id) = (select private.auth_center_id()));

create policy discounts_update_admin on public.discounts
for update to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()))
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy discounts_delete_admin on public.discounts
for delete to authenticated
using ((select private.is_admin()) and center_id = (select private.auth_center_id()));

create trigger deny_support_writes
before insert or update or delete on public.discounts
for each row execute function private.deny_support_writes();

revoke all on public.discounts, public.discount_overlaps from anon;
revoke all on public.discount_overlaps from authenticated;
grant select on public.discount_overlaps to authenticated;

-- ---------------------------------------------------------------------
-- Prix convenus baissés → remises « autre » (même montant)
-- Inscriptions actives du niveau actuel de l'élève (les inscriptions
-- arrêtées gardent leur ancien prix). Ordre : tarif plein des factures d'abord, puis remises (le recalcul des
-- factures ouvertes retrouve alors le même net), puis rattachement des
-- factures réglées à leur remise.
-- ---------------------------------------------------------------------
update public.invoices i
set amount_full = s.monthly_price,
    discount_amount = s.monthly_price - i.amount_due
from public.enrollments e
join public.subjects s on s.id = e.subject_id
join public.students st on st.id = e.student_id and st.level_id = s.level_id
where i.enrollment_id = e.id and e.pack_enrollment_id is null and e.active
  and e.price_agreed < s.monthly_price and i.amount_due = e.price_agreed;

update public.invoices i
set amount_full = p.monthly_price,
    discount_amount = p.monthly_price - i.amount_due
from public.pack_enrollments pe
join public.packs p on p.id = pe.pack_id
join public.students st on st.id = pe.student_id and st.level_id = p.level_id
where i.pack_enrollment_id = pe.id and pe.active
  and pe.price_agreed < p.monthly_price and i.amount_due = pe.price_agreed;

insert into public.discounts (center_id, student_id, type, value, scope, subject_id, reason, reason_note,
                              granted_by, granted_at, valid_from)
select st.center_id, e.student_id, 'fixed_amount', s.monthly_price - e.price_agreed, 'specific_subject', s.id,
       'other', 'Prix convenu', null, now(), e.start_date
from public.enrollments e
join public.subjects s on s.id = e.subject_id
join public.students st on st.id = e.student_id and st.level_id = s.level_id
where e.pack_enrollment_id is null and e.active and e.price_agreed < s.monthly_price;

insert into public.discounts (center_id, student_id, type, value, scope, pack_id, reason, reason_note,
                              granted_by, granted_at, valid_from)
select st.center_id, pe.student_id, 'fixed_amount', p.monthly_price - pe.price_agreed, 'specific_subject', p.id,
       'other', 'Prix convenu', null, now(), pe.start_date
from public.pack_enrollments pe
join public.packs p on p.id = pe.pack_id
join public.students st on st.id = pe.student_id and st.level_id = p.level_id
where pe.active and pe.price_agreed < p.monthly_price;

-- Factures déjà réglées : rattachées à la remise convertie.
update public.invoices i
set discount_id = d.id,
    discount_snapshot = jsonb_build_object('type', d.type, 'value', d.value, 'reason', d.reason, 'reason_note', d.reason_note)
from public.enrollments e
join public.discounts d on d.student_id = e.student_id and d.subject_id = e.subject_id and d.reason_note = 'Prix convenu'
where i.enrollment_id = e.id and i.discount_amount > 0 and i.discount_id is null;

update public.invoices i
set discount_id = d.id,
    discount_snapshot = jsonb_build_object('type', d.type, 'value', d.value, 'reason', d.reason, 'reason_note', d.reason_note)
from public.pack_enrollments pe
join public.discounts d on d.student_id = pe.student_id and d.pack_id = pe.pack_id and d.reason_note = 'Prix convenu'
where i.pack_enrollment_id = pe.id and i.discount_amount > 0 and i.discount_id is null;

update public.enrollments e
set price_agreed = s.monthly_price
from public.subjects s, public.students st
where s.id = e.subject_id and st.id = e.student_id and st.level_id = s.level_id
  and e.pack_enrollment_id is null and e.active and e.price_agreed < s.monthly_price;

update public.pack_enrollments pe
set price_agreed = p.monthly_price
from public.packs p, public.students st
where p.id = pe.pack_id and st.id = pe.student_id and st.level_id = p.level_id
  and pe.active and pe.price_agreed < p.monthly_price;

-- ---------------------------------------------------------------------
-- Prix d'une inscription : toujours le tarif, jamais modifié à la main
-- ---------------------------------------------------------------------
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

  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    new.price_agreed := v_subject_price;
  elsif new.price_agreed is distinct from old.price_agreed then
    raise exception 'Le tarif d''une inscription ne se modifie pas : accordez une remise.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.pack_enrollments_before_write()
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

  if tg_op = 'INSERT' or new.pack_id is distinct from old.pack_id then
    new.price_agreed := v_pack.monthly_price;
  elsif new.price_agreed is distinct from old.price_agreed then
    raise exception 'Le tarif d''un pack souscrit ne se modifie pas : accordez une remise.' using errcode = '42501';
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

revoke all on function
  private.discount_reduction(public.discount_type, numeric, numeric),
  private.best_discount(uuid, uuid, uuid, date, date, numeric),
  private.apply_invoice_discount(public.invoices),
  private.reprice_open_invoices(uuid)
from public, anon, authenticated;
grant execute on function private.discount_reduction(public.discount_type, numeric, numeric) to authenticated;
