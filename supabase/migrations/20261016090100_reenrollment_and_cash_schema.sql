-- =====================================================================
-- CentroManager — 034 : réinscription mensuelle et clôture de caisse
-- (page 8, phase 1 : schéma)
--
-- Décisions validées :
--  * la réinscription automatique est une option par centre (désactivée par
--    défaut) : activée, la campagne mensuelle remplace pour ce centre la
--    facturation automatique quotidienne ; désactivée, rien ne change ;
--  * la campagne du mois M couvre toutes les périodes qui commencent en M
--    (cycle du 1er et cycle du 15) ; l'échéance est le N-ième jour de la
--    période (N = payment_due_day : le 5 pour le cycle du 1er, le 19 pour le
--    cycle du 15 avec N = 5) et la facture n'est en retard que le lendemain ;
--  * le brouillon ne crée aucune facture : ses lignes vivent à part
--    (billing_run_lines) ; seule la confirmation, par l'admin, émet les
--    factures (invoices.billing_run_id) ;
--  * les intentions (abandon, pause, matières) s'appliquent aux inscriptions
--    au début de la période, pas à la confirmation : un élève qui part reste
--    dans les listes du mois qu'il a payé ;
--  * un encaissement est un reçu : la session de caisse s'y attache
--    (receipts.cash_session_id), figée par l'immuabilité des reçus ;
--  * les sorties d'espèces du tiroir (remboursement, charge, paie, dépôt en
--    banque) et les corrections après clôture sont des mouvements de caisse
--    datés, motivés, signés : sans eux, chaque sortie serait un faux écart ;
--  * une session commune par centre et par jour (option : une par
--    assistant) ; après une clôture, une nouvelle session peut s'ouvrir le
--    même jour ; clôturée, une session ne change plus, sauf sa validation.
--
-- Les écritures passent par des fonctions SECURITY DEFINER (phases 2 à 7) :
-- les utilisateurs n'ont que la lecture, sauf l'envoi des rappels.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Réglages du centre
-- ---------------------------------------------------------------------
alter table public.centers
  add column auto_reenrollment_enabled boolean not null default false,
  -- Jour du mois où la campagne du mois suivant est préparée (1 à 28 : tous les mois l'ont).
  add column billing_generation_day smallint not null default 25 check (billing_generation_day between 1 and 28),
  -- Échéance : N-ième jour de la période facturée (le 5 du mois au cycle du 1er).
  add column payment_due_day smallint not null default 5 check (payment_due_day between 1 and 28),
  add column reminder_days_before smallint not null default 3 check (reminder_days_before between 0 and 28),
  add column payment_reminders_enabled boolean not null default true,
  -- Modèles des rappels ; vides : modèles par défaut de l'application.
  add column reminder_template_upcoming text
    check (reminder_template_upcoming is null or length(btrim(reminder_template_upcoming)) between 1 and 1000),
  add column reminder_template_due_today text
    check (reminder_template_due_today is null or length(btrim(reminder_template_due_today)) between 1 and 1000),
  add column reminder_template_overdue text
    check (reminder_template_overdue is null or length(btrim(reminder_template_overdue)) between 1 and 1000),
  -- Élève « à risque » : présence sous ce seuil (en %) sur les 30 derniers jours.
  add column risk_attendance_threshold smallint not null default 75 check (risk_attendance_threshold between 1 and 100),
  add column cash_session_per_assistant boolean not null default false,
  -- Écart de caisse (en valeur absolue) au-delà duquel l'admin est alerté.
  add column cash_variance_alert_threshold numeric(10, 2) not null default 50 check (cash_variance_alert_threshold >= 0);

comment on column public.centers.payment_due_day is
  'Échéance des factures de campagne : N-ième jour de la période (élèves). Sans lien avec grace_days (abonnement plateforme).';

grant select (auto_reenrollment_enabled, billing_generation_day, payment_due_day, reminder_days_before,
              payment_reminders_enabled, reminder_template_upcoming, reminder_template_due_today,
              reminder_template_overdue, risk_attendance_threshold, cash_session_per_assistant,
              cash_variance_alert_threshold)
  on public.centers to authenticated;
grant update (auto_reenrollment_enabled, billing_generation_day, payment_due_day, reminder_days_before,
              payment_reminders_enabled, reminder_template_upcoming, reminder_template_due_today,
              reminder_template_overdue, risk_attendance_threshold, cash_session_per_assistant,
              cash_variance_alert_threshold)
  on public.centers to authenticated;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
-- cancelled : mois sans campagne (vacances), brouillon écarté avec un motif.
create type public.billing_run_status as enum ('draft', 'confirmed', 'sent', 'closed', 'cancelled');
create type public.reenrollment_intent as enum ('pending', 'confirmed', 'dropped', 'paused');
create type public.payment_reminder_type as enum ('upcoming', 'due_today', 'overdue');
create type public.payment_reminder_status as enum ('prepared', 'sent', 'failed', 'no_phone');
create type public.cash_session_status as enum ('open', 'closed', 'validated');
-- Montant signé : négatif quand l'argent sort du tiroir.
create type public.cash_movement_kind as enum ('refund', 'expense', 'teacher_pay', 'bank_deposit', 'float_change', 'correction');

-- ---------------------------------------------------------------------
-- Campagnes de facturation
-- ---------------------------------------------------------------------
create table public.billing_runs (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  period_year smallint not null check (period_year between 2020 and 2100),
  period_month smallint not null check (period_month between 1 and 12),
  status public.billing_run_status not null default 'draft',
  generated_at timestamptz not null default now(),
  -- Vide : préparée par le job quotidien.
  generated_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  -- Premier rappel envoyé.
  sent_at timestamptz,
  -- Fin de la dernière période couverte.
  closed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text,
  total_expected numeric(12, 2) not null default 0 check (total_expected >= 0),
  student_count integer not null default 0 check (student_count >= 0),
  notes text check (notes is null or length(notes) <= 1000),
  unique (center_id, period_year, period_month),
  unique (id, center_id),
  check (status in ('draft', 'cancelled') or confirmed_at is not null),
  check (status <> 'sent' or sent_at is not null),
  check (status <> 'closed' or closed_at is not null),
  check (status <> 'cancelled' or (cancelled_at is not null and coalesce(length(btrim(cancel_reason)), 0) between 1 and 300))
);

comment on table public.billing_runs is
  'Campagne mensuelle de réinscription : brouillon revu, confirmé par l''admin (factures émises), puis rappels.';

create index billing_runs_status_idx on public.billing_runs (center_id, status);
create index billing_runs_generated_by_idx on public.billing_runs (generated_by);
create index billing_runs_confirmed_by_idx on public.billing_runs (confirmed_by);
create index billing_runs_cancelled_by_idx on public.billing_runs (cancelled_by);

-- Ligne prévisionnelle : une par inscription ou abonnement pack, comme les factures.
create table public.billing_run_lines (
  id uuid primary key default gen_random_uuid(),
  billing_run_id uuid not null,
  center_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid,
  pack_enrollment_id uuid,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  -- Tarif convenu à l'inscription (price_agreed), remise, net.
  amount_full numeric(10, 2) not null check (amount_full >= 0),
  discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  amount_due numeric(10, 2) not null check (amount_due >= 0),
  discount_id uuid references public.discounts (id) on delete set null,
  discount_snapshot jsonb,
  -- Facture émise à la confirmation.
  invoice_id uuid references public.invoices (id) on delete set null,
  foreign key (billing_run_id, center_id) references public.billing_runs (id, center_id) on delete cascade,
  foreign key (student_id, center_id) references public.students (id, center_id) on delete cascade,
  foreign key (enrollment_id, student_id) references public.enrollments (id, student_id) on delete cascade,
  foreign key (pack_enrollment_id, student_id) references public.pack_enrollments (id, student_id) on delete cascade,
  unique (billing_run_id, enrollment_id),
  unique (billing_run_id, pack_enrollment_id),
  check (num_nonnulls(enrollment_id, pack_enrollment_id) = 1),
  check (period_end >= period_start),
  check (due_date between period_start and period_end),
  check (amount_due = amount_full - discount_amount)
);

create index billing_run_lines_run_idx on public.billing_run_lines (billing_run_id, student_id);
create index billing_run_lines_center_idx on public.billing_run_lines (center_id);
create index billing_run_lines_student_idx on public.billing_run_lines (student_id, center_id);
create index billing_run_lines_enrollment_idx on public.billing_run_lines (enrollment_id, student_id);
create index billing_run_lines_pack_idx on public.billing_run_lines (pack_enrollment_id, student_id);
create index billing_run_lines_discount_idx on public.billing_run_lines (discount_id);
create index billing_run_lines_invoice_idx on public.billing_run_lines (invoice_id);

-- Intention de réinscription : une par élève et par campagne.
create table public.reenrollment_intents (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null,
  billing_run_id uuid not null,
  student_id uuid not null,
  period_year smallint not null,
  period_month smallint not null,
  intent public.reenrollment_intent not null default 'pending',
  -- Listes d'identifiants de matières (ou de packs) : [{subject_id | pack_id, name}].
  subjects_kept jsonb not null default '[]'::jsonb check (jsonb_typeof(subjects_kept) = 'array'),
  subjects_dropped jsonb not null default '[]'::jsonb check (jsonb_typeof(subjects_dropped) = 'array'),
  subjects_added jsonb not null default '[]'::jsonb check (jsonb_typeof(subjects_added) = 'array'),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  reason text check (reason is null or length(btrim(reason)) between 1 and 300),
  -- Appliquée aux inscriptions au début de la période (job quotidien).
  applied_at timestamptz,
  foreign key (billing_run_id, center_id) references public.billing_runs (id, center_id) on delete cascade,
  foreign key (student_id, center_id) references public.students (id, center_id) on delete cascade,
  unique (billing_run_id, student_id),
  check (intent = 'pending' or decided_at is not null),
  check (applied_at is null or intent <> 'pending')
);

create index reenrollment_intents_center_idx on public.reenrollment_intents (center_id, period_year, period_month);
create index reenrollment_intents_student_idx on public.reenrollment_intents (student_id, center_id);
create index reenrollment_intents_decided_by_idx on public.reenrollment_intents (decided_by);

-- Facture émise par une campagne.
alter table public.invoices
  add column billing_run_id uuid references public.billing_runs (id) on delete restrict;

create index invoices_billing_run_idx on public.invoices (billing_run_id);

comment on column public.invoices.billing_run_id is
  'Campagne qui a émis la facture : montant figé, en retard le lendemain de l''échéance.';

-- ---------------------------------------------------------------------
-- Rappels de paiement
-- ---------------------------------------------------------------------
-- Une ligne par facture couverte par le message ; message_id regroupe les
-- factures d'un même envoi (un élève a une facture par matière ou pack).
create table public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  student_id uuid not null,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  billing_run_id uuid references public.billing_runs (id) on delete set null,
  message_id uuid not null,
  reminder_type public.payment_reminder_type not null,
  channel public.notification_channel not null,
  template_used text,
  message_body text check (message_body is null or length(message_body) <= 2000),
  guardian_phone_used text,
  days_overdue smallint check (days_overdue is null or days_overdue >= 0),
  sent_at timestamptz not null default now(),
  sent_by uuid default auth.uid() references public.profiles (id) on delete set null,
  status public.payment_reminder_status not null default 'sent',
  -- Relance explicite d'un rappel déjà envoyé.
  is_repeat boolean not null default false,
  foreign key (student_id, center_id) references public.students (id, center_id) on delete cascade
);

-- Un seul rappel de chaque type par facture, hors relance explicite.
create unique index payment_reminders_once
  on public.payment_reminders (invoice_id, reminder_type)
  where status = 'sent' and not is_repeat;
create index payment_reminders_student_idx on public.payment_reminders (student_id, sent_at desc);
create index payment_reminders_center_idx on public.payment_reminders (center_id, sent_at desc);
create index payment_reminders_message_idx on public.payment_reminders (message_id);
create index payment_reminders_run_idx on public.payment_reminders (billing_run_id);
create index payment_reminders_sent_by_idx on public.payment_reminders (sent_by);
create index payment_reminders_student_center_idx on public.payment_reminders (student_id, center_id);
create index payment_reminders_invoice_idx on public.payment_reminders (invoice_id, sent_at desc);

-- Centre, campagne et auteur posés par la base ; jamais de rappel sur une facture réglée.
create function private.payment_reminders_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  -- Contrôle d'accès avant toute lecture : rien ne filtre sur la facture d'un autre centre.
  if (select auth.uid()) is not null
     and not ((select private.is_staff())
              and private.student_center_id(new.student_id) is not distinct from (select private.auth_center_id())) then
    raise exception 'new row violates row-level security policy for table "payment_reminders"' using errcode = '42501';
  end if;
  new.center_id := private.student_center_id(new.student_id);
  select * into v_invoice from public.invoices i where i.id = new.invoice_id;
  if v_invoice.id is null or v_invoice.student_id <> new.student_id then
    raise exception 'La facture doit appartenir à cet élève.' using errcode = '23514';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'Facture déjà réglée : aucun rappel.' using errcode = '23514';
  end if;
  new.billing_run_id := v_invoice.billing_run_id;
  if (select auth.uid()) is not null then
    new.sent_by := (select auth.uid());
    new.sent_at := now();
  end if;
  return new;
end;
$$;

create trigger payment_reminders_before_insert
before insert on public.payment_reminders
for each row execute function private.payment_reminders_before_insert();

-- ---------------------------------------------------------------------
-- Caisse
-- ---------------------------------------------------------------------
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  session_date date not null default private.today(),
  -- Session commune du centre, ou personnelle (réglage « une session par assistant »).
  is_shared boolean not null default true,
  -- Titulaire d'une session personnelle (vide si son compte a été supprimé).
  assistant_id uuid,
  opened_at timestamptz not null default now(),
  opened_by uuid default auth.uid() references public.profiles (id) on delete set null,
  -- Fonds de caisse : la monnaie du tiroir en début de session.
  opening_float numeric(10, 2) not null default 0 check (opening_float >= 0),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  -- Espèces attendues : fonds + encaissements en espèces + mouvements de caisse.
  expected_cash numeric(12, 2),
  counted_cash numeric(12, 2) check (counted_cash is null or counted_cash >= 0),
  -- Compté − attendu : négatif = manquant, positif = excédent.
  variance numeric(12, 2),
  -- {cash, bank_transfer, card, cheque} : encaissé par mode, figé à la clôture.
  expected_by_method jsonb check (expected_by_method is null or jsonb_typeof(expected_by_method) = 'object'),
  status public.cash_session_status not null default 'open',
  variance_reason text check (variance_reason is null or length(btrim(variance_reason)) between 1 and 500),
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  notes text check (notes is null or length(notes) <= 1000),
  unique (id, center_id),
  foreign key (assistant_id, center_id) references public.profiles (id, center_id) on delete set null (assistant_id),
  check (not is_shared or assistant_id is null),
  check (status = 'open' or (closed_at is not null and expected_cash is not null and counted_cash is not null
                             and variance is not null and expected_by_method is not null)),
  check (variance is null or variance = counted_cash - expected_cash),
  check (variance is null or variance = 0 or variance_reason is not null),
  check (status <> 'validated' or validated_at is not null),
  check (closed_at is null or closed_at >= opened_at)
);

comment on table public.cash_sessions is
  'Session de caisse : ouverte au premier encaissement, clôturée par le comptage, validée par l''admin. Immuable une fois clôturée.';

-- Une seule session commune ouverte par centre et par jour ; une par assistant dans ce mode.
create unique index cash_sessions_one_open_shared
  on public.cash_sessions (center_id, session_date)
  where status = 'open' and is_shared;
create unique index cash_sessions_one_open_personal
  on public.cash_sessions (center_id, session_date, assistant_id)
  where status = 'open' and not is_shared;
create index cash_sessions_center_date_idx on public.cash_sessions (center_id, session_date desc);
create index cash_sessions_assistant_idx on public.cash_sessions (assistant_id, center_id);
create index cash_sessions_opened_by_idx on public.cash_sessions (opened_by);
create index cash_sessions_closed_by_idx on public.cash_sessions (closed_by);
create index cash_sessions_validated_by_idx on public.cash_sessions (validated_by);

-- Clôturée : seule la validation par l'admin reste possible ; validée : plus rien.
-- (Les auteurs effacés avec leur compte passent à vide : seule exception.)
create function private.cash_sessions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actors text[] := array['assistant_id', 'opened_by', 'closed_by', 'validated_by'];
  v_actor text;
begin
  if old.status = 'open' then
    if new.status not in ('open', 'closed') then
      raise exception 'Session de caisse : la validation suit la clôture.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status = 'closed' and new.status = 'validated' then
    if new.validated_by is not null
       and (to_jsonb(new) - array['status', 'validated_at', 'validated_by', 'notes'])
           = (to_jsonb(old) - array['status', 'validated_at', 'validated_by', 'notes']) then
      return new;
    end if;
    raise exception 'Validation : seule la décision de l''admin s''ajoute à la session.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_actors) is distinct from (to_jsonb(old) - v_actors) then
    raise exception 'Session de caisse clôturée : elle ne se modifie plus.' using errcode = '42501';
  end if;
  foreach v_actor in array v_actors loop
    if (to_jsonb(new) ->> v_actor) is distinct from (to_jsonb(old) ->> v_actor) and (to_jsonb(new) ->> v_actor) is not null then
      raise exception 'Session de caisse clôturée : elle ne se modifie plus.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger cash_sessions_guard
before update on public.cash_sessions
for each row execute function private.cash_sessions_guard();

-- Mouvement d'espèces hors encaissement : sortie (remboursement, charge, paie,
-- dépôt en banque), ajustement du fonds, correction d'une session clôturée.
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null,
  cash_session_id uuid not null,
  kind public.cash_movement_kind not null,
  amount numeric(10, 2) not null check (amount <> 0),
  reason text not null check (length(btrim(reason)) between 1 and 300),
  -- Correction après clôture : la session corrigée (le mouvement est daté du jour).
  corrects_session_id uuid,
  receipt_id uuid references public.receipts (id) on delete set null,
  expense_id uuid references public.expenses (id) on delete set null,
  payroll_line_id uuid references public.payroll_lines (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (cash_session_id, center_id) references public.cash_sessions (id, center_id) on delete cascade,
  foreign key (corrects_session_id, center_id) references public.cash_sessions (id, center_id),
  check (kind not in ('refund', 'expense', 'teacher_pay', 'bank_deposit') or amount < 0),
  check (kind <> 'correction' or corrects_session_id is not null),
  check (corrects_session_id is null or corrects_session_id <> cash_session_id)
);

create index cash_movements_session_idx on public.cash_movements (cash_session_id, created_at);
create index cash_movements_center_idx on public.cash_movements (center_id, created_at desc);
create index cash_movements_corrects_idx on public.cash_movements (corrects_session_id, center_id);
create index cash_movements_receipt_idx on public.cash_movements (receipt_id);
create index cash_movements_expense_idx on public.cash_movements (expense_id);
create index cash_movements_payroll_line_idx on public.cash_movements (payroll_line_id);
create index cash_movements_created_by_idx on public.cash_movements (created_by);

-- Encaissement rattaché à sa session de caisse ; figé par receipts_immutable.
alter table public.receipts
  add column cash_session_id uuid,
  add constraint receipts_cash_session_fkey
    foreign key (cash_session_id, center_id) references public.cash_sessions (id, center_id);

create index receipts_cash_session_idx on public.receipts (cash_session_id, center_id);

comment on column public.receipts.cash_session_id is
  'Session de caisse ouverte au moment de l''encaissement ; vide pour les reçus antérieurs à la caisse.';

-- Rien ne s'ajoute à une session clôturée : ni encaissement, ni mouvement.
-- Le verrou partagé fait attendre l'opération si une clôture est en cours,
-- puis la refuse si la session a été clôturée entre-temps.
create function private.cash_session_must_be_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cash_session_id is not null then
    perform 1 from public.cash_sessions cs
    where cs.id = new.cash_session_id and cs.center_id = new.center_id and cs.status = 'open'
    for share;
    if not found then
      raise exception 'Session de caisse clôturée : l''opération va dans la session du jour.' using errcode = '42501';
    end if;
  end if;
  -- Une correction porte sur une session déjà clôturée.
  if tg_table_name = 'cash_movements' and (to_jsonb(new) ->> 'corrects_session_id') is not null and not exists (
    select 1 from public.cash_sessions cs
    where cs.id = (to_jsonb(new) ->> 'corrects_session_id')::uuid and cs.center_id = new.center_id and cs.status <> 'open'
  ) then
    raise exception 'Une correction porte sur une session clôturée.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger receipts_cash_session_open
before insert on public.receipts
for each row execute function private.cash_session_must_be_open();

create trigger cash_movements_session_open
before insert on public.cash_movements
for each row execute function private.cash_session_must_be_open();

-- Un mouvement ne se modifie ni ne se supprime : on le corrige par un autre.
-- (Liens effacés avec leur reçu, charge, ligne de paie ou auteur : seule exception.)
create function private.cash_movements_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_links text[] := array['receipt_id', 'expense_id', 'payroll_line_id', 'created_by'];
  v_link text;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.cash_sessions cs where cs.id = old.cash_session_id) then
      return old;
    end if;
    raise exception 'Un mouvement de caisse ne se supprime pas : enregistrez une correction.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_links) is distinct from (to_jsonb(old) - v_links) then
    raise exception 'Un mouvement de caisse ne se modifie pas : enregistrez une correction.' using errcode = '42501';
  end if;
  foreach v_link in array v_links loop
    if (to_jsonb(new) ->> v_link) is distinct from (to_jsonb(old) ->> v_link) and (to_jsonb(new) ->> v_link) is not null then
      raise exception 'Un mouvement de caisse ne se modifie pas : enregistrez une correction.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger cash_movements_guard
before update or delete on public.cash_movements
for each row execute function private.cash_movements_guard();

-- ---------------------------------------------------------------------
-- Campagne confirmée : figée
-- ---------------------------------------------------------------------
-- Statut : brouillon → confirmée → envoyée → close, ou brouillon → annulée.
-- Hors brouillon, seuls avancent le statut, les dates d'envoi et de clôture
-- et les notes ; close ou annulée, plus rien. Les auteurs effacés avec leur
-- compte passent à vide : seule exception.
create function private.billing_runs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actors text[] := array['generated_by', 'confirmed_by', 'cancelled_by'];
  v_moving text[] := array['status', 'sent_at', 'closed_at', 'notes'];
  v_actor text;
begin
  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('sent', 'closed'))
    or (old.status = 'sent' and new.status = 'closed')
  ) then
    raise exception 'Campagne : passage de « % » à « % » impossible.', old.status, new.status using errcode = '42501';
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  foreach v_actor in array v_actors loop
    if (to_jsonb(new) ->> v_actor) is distinct from (to_jsonb(old) ->> v_actor) and (to_jsonb(new) ->> v_actor) is not null then
      raise exception 'Campagne confirmée : ses auteurs ne changent pas.' using errcode = '42501';
    end if;
  end loop;
  if old.status in ('cancelled', 'closed') and (to_jsonb(new) - v_actors) is distinct from (to_jsonb(old) - v_actors) then
    raise exception 'Campagne close ou annulée : elle ne se modifie plus.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_actors - v_moving) is distinct from (to_jsonb(old) - v_actors - v_moving)
     or (old.sent_at is not null and new.sent_at is distinct from old.sent_at)
     or (old.closed_at is not null and new.closed_at is distinct from old.closed_at) then
    raise exception 'Campagne confirmée : montants et période sont figés.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger billing_runs_guard
before update on public.billing_runs
for each row execute function private.billing_runs_guard();

-- Lignes et intentions d'une campagne confirmée : figées. Seuls se posent
-- ensuite le lien vers la facture émise et la date d'application des
-- intentions ; une suppression n'y passe qu'en cascade (élève, inscription
-- ou campagne supprimés).
create function private.billing_run_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_status public.billing_run_status;
  v_new_status public.billing_run_status;
  v_free text[] := case tg_table_name
    when 'billing_run_lines' then array['invoice_id', 'discount_id']
    else array['applied_at', 'decided_by']
  end;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select br.status into v_old_status from public.billing_runs br where br.id = old.billing_run_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select br.status into v_new_status from public.billing_runs br where br.id = new.billing_run_id;
  end if;

  if tg_op = 'INSERT' then
    if v_new_status is not null and v_new_status <> 'draft' then
      raise exception 'Campagne confirmée : aucune ligne ne s''y ajoute.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_old_status is null or v_old_status = 'draft'
       or not exists (select 1 from public.students st where st.id = old.student_id)
       or (tg_table_name = 'billing_run_lines' and not exists (
             select 1 from public.enrollments e where e.id = (to_jsonb(old) ->> 'enrollment_id')::uuid
             union all
             select 1 from public.pack_enrollments pe where pe.id = (to_jsonb(old) ->> 'pack_enrollment_id')::uuid)) then
      return old;
    end if;
    raise exception 'Campagne confirmée : ses lignes ne se suppriment pas.' using errcode = '42501';
  end if;

  if new.billing_run_id is distinct from old.billing_run_id
     and (coalesce(v_old_status, 'draft') <> 'draft' or coalesce(v_new_status, 'draft') <> 'draft') then
    raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
  end if;
  if v_old_status is not null and v_old_status <> 'draft'
     and (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger billing_run_lines_guard
before insert or update or delete on public.billing_run_lines
for each row execute function private.billing_run_children_guard();

create trigger reenrollment_intents_guard
before insert or update or delete on public.reenrollment_intents
for each row execute function private.billing_run_children_guard();

-- Factures de campagne : seule la confirmation (fonction du propriétaire) les
-- rattache, à une campagne du même centre ; ensuite, ni montant, ni période,
-- ni élève ne changent par une écriture directe, et elles ne se suppriment
-- pas (le paiement et l'annulation de reçu restent possibles).
create function private.invoices_billing_run_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_direct boolean := current_user in ('authenticated', 'anon');
  v_frozen text[] := array['student_id', 'enrollment_id', 'pack_enrollment_id', 'period_start', 'period_end', 'due_date',
                           'amount_full', 'discount_amount', 'amount_due', 'discount_id', 'discount_snapshot',
                           'discount_conflict', 'billing_run_id'];
begin
  if tg_op = 'DELETE' then
    if old.billing_run_id is not null and v_direct then
      raise exception 'Facture de campagne : elle ne se supprime pas (correction motivée).' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.billing_run_id is not null and v_direct
     and (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(v_frozen) k)
         is distinct from (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(v_frozen) k) then
    raise exception 'Facture de campagne : montant et période sont figés.' using errcode = '42501';
  end if;
  if new.billing_run_id is distinct from (case when tg_op = 'UPDATE' then old.billing_run_id end) then
    if v_direct then
      raise exception 'Le rattachement à une campagne se fait par sa confirmation.' using errcode = '42501';
    end if;
    if new.billing_run_id is not null and not exists (
      select 1 from public.billing_runs br
      where br.id = new.billing_run_id and br.center_id = private.student_center_id(new.student_id)
    ) then
      raise exception 'Campagne d''un autre centre.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger invoices_billing_run_guard
before insert or update or delete on public.invoices
for each row execute function private.invoices_billing_run_guard();

-- Facture de campagne : montants revus et confirmés, pas de nouveau calcul de remise.
create or replace function private.invoices_before_insert_discount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.amount_full := coalesce(new.amount_full, new.amount_due);
  if new.billing_run_id is null then
    new := private.apply_invoice_discount(new);
  end if;
  return new;
end;
$$;

-- Recalcul des remises : jamais sur une facture de campagne (montant figé).
create or replace function private.reprice_open_invoices(p_student_id uuid)
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
    where i.student_id = p_student_id and i.status <> 'paid' and i.amount_paid = 0 and i.billing_run_id is null
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

-- Période de l'intention = celle de sa campagne.
create function private.reenrollment_intents_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select br.period_year, br.period_month into new.period_year, new.period_month
  from public.billing_runs br where br.id = new.billing_run_id;
  return new;
end;
$$;

create trigger reenrollment_intents_period
before insert or update of billing_run_id, period_year, period_month on public.reenrollment_intents
for each row execute function private.reenrollment_intents_period();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.billing_runs enable row level security;
alter table public.billing_run_lines enable row level security;
alter table public.reenrollment_intents enable row level security;
alter table public.payment_reminders enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

-- Campagnes : accueil et admin du centre (lecture seule en mode support).
create policy billing_runs_select_staff on public.billing_runs
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

create policy billing_run_lines_select_staff on public.billing_run_lines
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

create policy reenrollment_intents_select_staff on public.reenrollment_intents
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

-- Rappels : accueil et admin ; journal sans modification.
create policy payment_reminders_select_staff on public.payment_reminders
for select to authenticated
using ((select private.is_staff()) and center_id = (select private.auth_center_id()));

create policy payment_reminders_insert_staff on public.payment_reminders
for insert to authenticated
with check ((select private.is_staff()) and private.student_center_id(student_id) = (select private.auth_center_id()));

-- Caisse : l'admin du centre (hors mode support) ; l'assistant, la session
-- commune ou la sienne, jamais celle d'un autre.
create policy cash_sessions_select on public.cash_sessions
for select to authenticated
using (
  center_id = (select private.auth_center_id())
  and (
    (select private.can_read_finance(center_id))
    or ((select private.auth_role()) = 'assistant' and (is_shared or assistant_id = (select auth.uid())))
  )
);

-- Paie et charges restent réservées à l'admin : la clôture les compte quand même.
create policy cash_movements_select on public.cash_movements
for select to authenticated
using (
  center_id = (select private.auth_center_id())
  and exists (select 1 from public.cash_sessions cs where cs.id = cash_session_id)
  and ((select private.can_read_finance(center_id)) or kind not in ('teacher_pay', 'expense'))
);

do $$
declare
  v_table text;
begin
  foreach v_table in array array['billing_runs', 'billing_run_lines', 'reenrollment_intents', 'payment_reminders',
                                 'cash_sessions', 'cash_movements'] loop
    execute format(
      'create trigger deny_support_writes before insert or update or delete on public.%I
         for each row execute function private.deny_support_writes()', v_table);
  end loop;
end;
$$;

revoke all on public.billing_runs, public.billing_run_lines, public.reenrollment_intents, public.payment_reminders,
  public.cash_sessions, public.cash_movements from anon, authenticated;
grant select on public.billing_runs, public.billing_run_lines, public.reenrollment_intents,
  public.cash_sessions, public.cash_movements to authenticated;
grant select, insert on public.payment_reminders to authenticated;
