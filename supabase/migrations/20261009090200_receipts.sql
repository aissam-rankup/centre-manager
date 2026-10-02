-- =====================================================================
-- CentroManager — 024 : reçus de paiement (page 6, module 1)
--
-- Règles validées :
--  * un encaissement règle une ou plusieurs factures entières de l'élève
--    (pas de paiement partiel) et produit un seul reçu, détaillé par matière ;
--  * numéro « ANNEE-NNNN » par centre et par année, sans trou ni doublon :
--    compteur verrouillé dans la transaction de l'encaissement (une séquence
--    Postgres laisserait des trous en cas d'annulation de transaction) ;
--  * le reçu fige tout ce qu'il affiche (élève, matières, remises, centre,
--    caissier) : il ne se modifie jamais ; seules les traces d'impression,
--    de partage et le PDF s'y ajoutent ;
--  * une correction passe par un reçu d'annulation lié au premier (admin) :
--    les factures redeviennent à régler.
-- =====================================================================

create type public.receipt_kind as enum ('payment', 'cancellation');
create type public.receipt_format as enum ('a5', 'ticket_80mm');

-- ---------------------------------------------------------------------
-- Réglages du centre
-- ---------------------------------------------------------------------
alter table public.centers
  add column receipt_format public.receipt_format not null default 'a5',
  -- Modèle du message WhatsApp ; vide : modèle par défaut de l'application.
  add column receipt_whatsapp_template text
    check (receipt_whatsapp_template is null or length(btrim(receipt_whatsapp_template)) between 1 and 1000);

grant select (receipt_format, receipt_whatsapp_template) on public.centers to authenticated;
grant update (receipt_format, receipt_whatsapp_template) on public.centers to authenticated;

-- ---------------------------------------------------------------------
-- Reçus
-- ---------------------------------------------------------------------
create table public.receipt_counters (
  center_id uuid not null references public.centers (id) on delete cascade,
  year smallint not null,
  last_number integer not null check (last_number > 0),
  primary key (center_id, year)
);

alter table public.receipt_counters enable row level security;
revoke all on public.receipt_counters from anon, authenticated;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  -- L'élève peut être supprimé : le reçu reste (nom figé ci-dessous).
  student_id uuid references public.students (id) on delete set null,
  kind public.receipt_kind not null default 'payment',
  receipt_year smallint not null,
  receipt_seq integer not null check (receipt_seq > 0),
  receipt_number text generated always as (receipt_year::text || '-' || lpad(receipt_seq::text, 4, '0')) stored,
  issued_at timestamptz not null default now(),
  -- Montants (négatifs sur un reçu d'annulation).
  amount_full numeric(10, 2) not null,
  discount_applied numeric(10, 2) not null default 0,
  amount_paid numeric(10, 2) not null,
  period_start date not null,
  period_end date not null,
  -- [{invoice_id, subject, level, pack, period_start, period_end, amount_full,
  --   discount_amount, discount, amount_paid}]
  subjects_covered jsonb not null check (jsonb_typeof(subjects_covered) = 'array'),
  payment_method public.payment_method not null,
  -- Reste dû par l'élève après ce paiement (factures échues non réglées).
  balance_due numeric(10, 2) not null default 0 check (balance_due >= 0),
  student_name text not null,
  level_name text,
  -- {name, address, phone, branding} au moment de l'émission.
  center_snapshot jsonb not null,
  issued_by uuid default auth.uid() references public.profiles (id) on delete set null,
  issued_by_name text,
  cancels_receipt_id uuid references public.receipts (id) on delete restrict,
  cancel_reason text,
  pdf_url text,
  whatsapp_sent_at timestamptz,
  printed_at timestamptz,
  unique (center_id, receipt_year, receipt_seq),
  unique (cancels_receipt_id),
  check (period_end >= period_start),
  check (amount_paid = amount_full - discount_applied),
  check ((kind = 'cancellation') = (cancels_receipt_id is not null)),
  check (kind = 'payment' or length(btrim(cancel_reason)) between 1 and 300),
  check (kind = 'cancellation' or amount_paid >= 0),
  check (kind = 'payment' or amount_paid <= 0)
);

create index receipts_center_issued_idx on public.receipts (center_id, issued_at desc);
create index receipts_student_idx on public.receipts (student_id, issued_at desc);
create index receipts_issued_by_idx on public.receipts (issued_by);

-- Factures : mode de paiement et reçu.
alter table public.invoices
  add column payment_method public.payment_method,
  add column receipt_id uuid references public.receipts (id) on delete set null;

create index invoices_receipt_idx on public.invoices (receipt_id);

-- Immuable : seules les traces (PDF, impression, WhatsApp) s'ajoutent.
create function private.receipts_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.centers c where c.id = old.center_id) then
      return old;
    end if;
    raise exception 'Un reçu ne se supprime pas : émettez un reçu d''annulation.' using errcode = '42501';
  end if;

  if (to_jsonb(new) - array['pdf_url', 'whatsapp_sent_at', 'printed_at', 'student_id', 'receipt_number'])
     is distinct from (to_jsonb(old) - array['pdf_url', 'whatsapp_sent_at', 'printed_at', 'student_id', 'receipt_number'])
     or (new.student_id is distinct from old.student_id and new.student_id is not null) then
    raise exception 'Un reçu ne se modifie pas : émettez un reçu d''annulation.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger receipts_immutable
before update or delete on public.receipts
for each row execute function private.receipts_immutable();

-- ---------------------------------------------------------------------
-- Numérotation et émission
-- ---------------------------------------------------------------------
create function private.next_receipt_seq(p_center_id uuid, p_year smallint)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.receipt_counters as c (center_id, year, last_number)
  values (p_center_id, p_year, 1)
  on conflict (center_id, year) do update set last_number = c.last_number + 1
  returning last_number;
$$;

-- Reste dû : factures échues non réglées de l'élève.
create function private.student_balance_due(p_student_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(i.amount_due - i.amount_paid), 0)
  from public.invoices i
  where i.student_id = p_student_id and i.status <> 'paid' and i.due_date <= private.today();
$$;

-- Reçu d'un encaissement déjà enregistré sur les factures.
create function private.issue_receipt(
  p_invoice_ids uuid[],
  p_issued_at timestamptz default now(),
  p_issued_by uuid default auth.uid()
)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_center public.centers;
  v_receipt public.receipts;
  v_lines jsonb;
  v_method public.payment_method;
  v_year smallint := extract(year from p_issued_at at time zone 'Africa/Casablanca')::smallint;
begin
  select st.* into v_student
  from public.students st
  where st.id = (select i.student_id from public.invoices i where i.id = p_invoice_ids[1]);
  select * into v_center from public.centers c where c.id = v_student.center_id;

  select jsonb_agg(jsonb_build_object(
           'invoice_id', i.id,
           'subject', coalesce(s.name, p.name),
           'level', l.name,
           'pack', i.pack_enrollment_id is not null,
           'period_start', i.period_start,
           'period_end', i.period_end,
           'amount_full', i.amount_full,
           'discount_amount', i.discount_amount,
           'discount', i.discount_snapshot,
           'amount_paid', i.amount_paid
         ) order by i.period_start, coalesce(s.name, p.name)),
         min(i.payment_method)
    into v_lines, v_method
  from public.invoices i
  left join public.enrollments e on e.id = i.enrollment_id
  left join public.subjects s on s.id = e.subject_id
  left join public.pack_enrollments pe on pe.id = i.pack_enrollment_id
  left join public.packs p on p.id = pe.pack_id
  left join public.levels l on l.id = coalesce(s.level_id, p.level_id)
  where i.id = any (p_invoice_ids);

  insert into public.receipts (
    center_id, student_id, kind, receipt_year, receipt_seq, issued_at,
    amount_full, discount_applied, amount_paid, period_start, period_end, subjects_covered,
    payment_method, balance_due, student_name, level_name, center_snapshot, issued_by, issued_by_name
  )
  select
    v_center.id, v_student.id, 'payment', v_year, private.next_receipt_seq(v_center.id, v_year), p_issued_at,
    sum(i.amount_full), sum(i.discount_amount), sum(i.amount_paid), min(i.period_start), max(i.period_end), v_lines,
    v_method, private.student_balance_due(v_student.id), v_student.full_name,
    (select l.name from public.levels l where l.id = v_student.level_id),
    jsonb_build_object('name', v_center.name, 'address', v_center.address, 'phone', v_center.phone,
                       'branding', private.applied_branding(v_center.id)),
    p_issued_by,
    (select pr.full_name from public.profiles pr where pr.id = p_issued_by)
  from public.invoices i
  where i.id = any (p_invoice_ids)
  returning * into v_receipt;

  update public.invoices set receipt_id = v_receipt.id where id = any (p_invoice_ids);
  return v_receipt;
end;
$$;

-- Encaissement : factures entières d'un même élève, un reçu.
create function public.record_payment(
  p_student_id uuid,
  p_invoice_ids uuid[],
  p_method public.payment_method
)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_found integer;
begin
  if not private.is_staff() or private.student_center_id(p_student_id) is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_invoice_ids) as x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Choisissez au moins une facture.' using errcode = '22023';
  end if;

  -- Verrou : deux encaissements simultanés de la même facture sont impossibles.
  select count(*) into v_found
  from (
    select 1 from public.invoices i
    where i.id = any (v_ids) and i.student_id = p_student_id and i.status <> 'paid'
    for update
  ) as locked;
  if v_found <> array_length(v_ids, 1) then
    raise exception 'Facture introuvable ou déjà payée.' using errcode = 'P0002';
  end if;

  update public.invoices
  set status = 'paid',
      amount_paid = amount_due,
      paid_at = now(),
      paid_by = (select auth.uid()),
      payment_method = p_method
  where id = any (v_ids);

  return private.issue_receipt(v_ids);
end;
$$;

-- L'ancien encaissement d'une facture passe par le reçu (espèces).
create or replace function public.mark_invoice_paid(p_invoice_id uuid)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null or v_invoice.status = 'paid' then
    raise exception 'Facture introuvable ou déjà payée.' using errcode = 'P0002';
  end if;
  perform public.record_payment(v_invoice.student_id, array[p_invoice_id], 'cash');
  select * into v_invoice from public.invoices where id = p_invoice_id;
  return v_invoice;
end;
$$;

-- Annulation (admin) : reçu négatif lié, factures de nouveau à régler.
create function public.cancel_receipt(p_receipt_id uuid, p_reason text)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.receipts;
  v_cancel public.receipts;
  v_year smallint := extract(year from now() at time zone 'Africa/Casablanca')::smallint;
begin
  select * into v_original from public.receipts r where r.id = p_receipt_id for update;
  if v_original.id is null or not private.is_admin() or v_original.center_id is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_original.kind <> 'payment' then
    raise exception 'Un reçu d''annulation ne s''annule pas.' using errcode = '22023';
  end if;
  if exists (select 1 from public.receipts r where r.cancels_receipt_id = p_receipt_id) then
    raise exception 'Ce reçu est déjà annulé.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez le motif de l''annulation.' using errcode = '22023';
  end if;

  insert into public.receipts (
    center_id, student_id, kind, receipt_year, receipt_seq,
    amount_full, discount_applied, amount_paid, period_start, period_end, subjects_covered,
    payment_method, balance_due, student_name, level_name, center_snapshot, issued_by, issued_by_name,
    cancels_receipt_id, cancel_reason
  )
  values (
    v_original.center_id, v_original.student_id, 'cancellation', v_year,
    private.next_receipt_seq(v_original.center_id, v_year),
    -v_original.amount_full, -v_original.discount_applied, -v_original.amount_paid,
    v_original.period_start, v_original.period_end, v_original.subjects_covered,
    v_original.payment_method, 0, v_original.student_name, v_original.level_name, v_original.center_snapshot,
    (select auth.uid()), (select pr.full_name from public.profiles pr where pr.id = (select auth.uid())),
    v_original.id, btrim(p_reason)
  )
  returning * into v_cancel;

  update public.invoices
  set status = case when due_date <= private.today() then 'overdue' else 'pending' end::public.invoice_status,
      amount_paid = 0,
      paid_at = null,
      paid_by = null,
      payment_method = null,
      receipt_id = null
  where receipt_id = v_original.id;

  perform private.log_center_event(v_original.center_id, 'receipt.cancelled', v_cancel.id,
    jsonb_build_object('receipt_number', v_original.receipt_number, 'amount', v_original.amount_paid,
                       'reason', btrim(p_reason)));
  return v_cancel;
end;
$$;

-- Traces d'impression et de partage.
create function public.mark_receipt_printed(p_receipt_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.receipts set printed_at = now() where id = p_receipt_id;
$$;

-- ---------------------------------------------------------------------
-- RLS : lecture admin et assistant ; aucune écriture directe hors traces
-- ---------------------------------------------------------------------
alter table public.receipts enable row level security;

create policy receipts_select_staff on public.receipts
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

create policy receipts_update_staff on public.receipts
for update to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()))
with check (center_id = (select private.auth_center_id()));

create trigger deny_support_writes
before insert or update or delete on public.receipts
for each row execute function private.deny_support_writes();

revoke all on public.receipts from anon, authenticated;
grant select on public.receipts to authenticated;
grant update (pdf_url, whatsapp_sent_at, printed_at) on public.receipts to authenticated;

-- ---------------------------------------------------------------------
-- Stockage des PDF : bucket privé « receipts », {center_id}/{receipt_id}.pdf
-- (dépôt et liens signés par le serveur).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 1048576, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy receipts_files_select_staff on storage.objects
for select to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.is_staff())
);

-- ---------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------
revoke all on function
  private.next_receipt_seq(uuid, smallint),
  private.student_balance_due(uuid),
  private.issue_receipt(uuid[], timestamptz, uuid)
from public, anon, authenticated;

revoke all on function
  public.record_payment(uuid, uuid[], public.payment_method),
  public.cancel_receipt(uuid, text),
  public.mark_receipt_printed(uuid)
from public, anon;
grant execute on function
  public.record_payment(uuid, uuid[], public.payment_method),
  public.cancel_receipt(uuid, text),
  public.mark_receipt_printed(uuid)
to authenticated;
