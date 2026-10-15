-- =====================================================================
-- CentroManager — suppression et archivage des matières
--
-- Une matière ne se supprimait pas dès qu'une inscription y avait existé
-- (même arrêtée : clé étrangère « restrict » des inscriptions) ou qu'elle
-- faisait partie d'un pack. Désormais :
--  * subject_dependencies : ce qui lie la matière (bloquant : inscriptions
--    en cours ou passées, présences, packs, ressources ; détachable :
--    professeurs, créneaux, taux de commission, remises) ;
--  * delete_subject : suppression définitive si rien de bloquant (les liens
--    détachables sont retirés d'abord) ; sinon refus explicite ;
--  * archive_subject : la matière sort des listes de choix (inscription,
--    créneau, affectation, pack, remise, ressource) mais reste dans
--    l'historique et les statistiques ; refusé tant que des élèves la
--    suivent ou qu'un pack proposé la contient ; ses créneaux sont retirés ;
--  * unarchive_subject : réactivation ;
--  * garde-fous : aucune nouvelle inscription, reprise, créneau, affectation,
--    remise, ressource ni pack proposé sur une matière archivée.
-- =====================================================================

alter table public.subjects
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

create index subjects_archived_by_idx on public.subjects (archived_by);

-- Archivage : uniquement par les fonctions ci-dessous (qui retirent les créneaux).
create function private.subjects_guard_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.archived_at, new.archived_by) is distinct from (old.archived_at, old.archived_by)
     and current_user in ('authenticated', 'anon') then
    raise exception 'Archivez ou réactivez la matière depuis l''écran des matières.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger subjects_guard_archive
before update of archived_at, archived_by on public.subjects
for each row execute function private.subjects_guard_archive();

create function private.subject_is_archived(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.archived_at is not null from public.subjects s where s.id = p_subject_id), false);
$$;

revoke all on function private.subject_is_archived(uuid) from public, anon;
grant execute on function private.subject_is_archived(uuid) to authenticated, service_role;

-- Catalogue des matières (professeurs) : date d'archivage ajoutée en fin de vue.
create or replace view public.subject_catalog
with (security_barrier = true)
as
select s.id, s.center_id, s.level_id, s.name, s.archived_at
from public.subjects s
where s.center_id = (select private.auth_center_id());

-- ---------------------------------------------------------------------
-- Garde-fous : rien de nouveau sur une matière archivée
-- ---------------------------------------------------------------------
create function private.reject_archived_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := (to_jsonb(new) ->> 'subject_id')::uuid;
begin
  if v_subject is null or not private.subject_is_archived(v_subject) then
    return new;
  end if;
  -- Mise à jour sans changement de matière : autorisée, sauf la reprise d'une
  -- inscription arrêtée (création, reprise : refusées ; arrêt, facturation : permis).
  if tg_op = 'UPDATE' and (to_jsonb(new) ->> 'subject_id') is not distinct from (to_jsonb(old) ->> 'subject_id') then
    if tg_table_name <> 'enrollments'
       or not (coalesce((to_jsonb(new) ->> 'active')::boolean, false) and not coalesce((to_jsonb(old) ->> 'active')::boolean, false)) then
      return new;
    end if;
  end if;
  raise exception 'Matière archivée : réactivez-la avant de l''utiliser.' using errcode = '22023';
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['enrollments', 'schedule_slots', 'teacher_assignments', 'pack_subjects', 'discounts', 'learning_resources'] loop
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function private.reject_archived_subject()',
      v_table || '_reject_archived_subject', v_table);
  end loop;
end;
$$;

-- Un pack ne se repropose pas s'il contient une matière archivée.
create function private.packs_reject_archived_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active) and exists (
    select 1 from public.pack_subjects ps join public.subjects s on s.id = ps.subject_id
    where ps.pack_id = new.id and s.archived_at is not null
  ) then
    raise exception 'Ce pack contient une matière archivée : retirez-la ou réactivez-la avant de proposer le pack.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger packs_reject_archived_subject
before insert or update of active on public.packs
for each row execute function private.packs_reject_archived_subject();

-- ---------------------------------------------------------------------
-- Dépendances d'une matière (admin du centre)
-- ---------------------------------------------------------------------
create function public.subject_dependencies(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject public.subjects;
begin
  select * into v_subject from public.subjects s where s.id = p_subject_id;
  if v_subject.id is null or not private.is_admin() or v_subject.center_id is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'archived', v_subject.archived_at is not null,
    -- Bloquant : historique à conserver.
    'active_enrollments', (select count(*) from public.enrollments e where e.subject_id = p_subject_id and e.active),
    'past_enrollments', (select count(*) from public.enrollments e where e.subject_id = p_subject_id and not e.active),
    'invoices', (select count(*) from public.invoices i join public.enrollments e on e.id = i.enrollment_id where e.subject_id = p_subject_id),
    'attendance', (select count(*) from public.attendance a where a.subject_id = p_subject_id),
    'packs', (select count(*) from public.pack_subjects ps where ps.subject_id = p_subject_id),
    'active_packs', (select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb)
                     from public.pack_subjects ps join public.packs p on p.id = ps.pack_id
                     where ps.subject_id = p_subject_id and p.active),
    'resources', (select count(*) from public.learning_resources r where r.subject_id = p_subject_id),
    -- Détachable : retiré avant une suppression.
    'teachers', (select count(*) from public.teacher_assignments ta where ta.subject_id = p_subject_id),
    'slots', (select count(*) from public.schedule_slots ss where ss.subject_id = p_subject_id),
    'rates', (select count(*) from public.teacher_commissions tc where tc.subject_id = p_subject_id),
    'discounts', (select count(*) from public.discounts d where d.subject_id = p_subject_id)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Suppression définitive (rien de bloquant)
-- ---------------------------------------------------------------------
create function public.delete_subject(p_subject_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject public.subjects;
  v_deps jsonb;
begin
  select * into v_subject from public.subjects s where s.id = p_subject_id for update;
  if v_subject.id is null or not private.is_admin() or v_subject.center_id is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  v_deps := public.subject_dependencies(p_subject_id);
  if (v_deps ->> 'active_enrollments')::int + (v_deps ->> 'past_enrollments')::int + (v_deps ->> 'attendance')::int
     + (v_deps ->> 'packs')::int + (v_deps ->> 'resources')::int > 0 then
    raise exception 'Matière liée à un historique : archivez-la plutôt que de la supprimer.' using errcode = '23503';
  end if;

  -- Liens détachables d'abord, puis la matière.
  delete from public.teacher_assignments where subject_id = p_subject_id;
  delete from public.schedule_slots where subject_id = p_subject_id;
  delete from public.teacher_commissions where subject_id = p_subject_id;
  delete from public.discounts where subject_id = p_subject_id;
  delete from public.subjects where id = p_subject_id;

  perform private.log_center_event(v_subject.center_id, 'subject.deleted', p_subject_id,
    jsonb_build_object('name', v_subject.name, 'detached', v_deps - 'archived' - 'active_packs'));
end;
$$;

-- ---------------------------------------------------------------------
-- Archivage et réactivation
-- ---------------------------------------------------------------------
create function public.archive_subject(p_subject_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject public.subjects;
  v_active integer;
  v_packs text;
  v_slots integer;
begin
  select * into v_subject from public.subjects s where s.id = p_subject_id for update;
  if v_subject.id is null or not private.is_admin() or v_subject.center_id is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_subject.archived_at is not null then
    return 0;
  end if;

  select count(*) into v_active from public.enrollments e where e.subject_id = p_subject_id and e.active;
  if v_active > 0 then
    raise exception '%', format('Archivage impossible : %s inscription(s) en cours dans cette matière. Arrêtez-les d''abord.', v_active)
      using errcode = '22023';
  end if;
  select string_agg(p.name, ', ' order by p.name) into v_packs
  from public.pack_subjects ps join public.packs p on p.id = ps.pack_id
  where ps.subject_id = p_subject_id and p.active;
  if v_packs is not null then
    raise exception '%', format('Archivage impossible : la matière fait partie d''un pack proposé (%s). Retirez-la du pack ou désactivez le pack.', v_packs)
      using errcode = '22023';
  end if;

  -- Créneaux du planning (modèle hebdomadaire, sans historique) : retirés.
  delete from public.schedule_slots where subject_id = p_subject_id;
  get diagnostics v_slots = row_count;

  update public.subjects set archived_at = now(), archived_by = (select auth.uid()) where id = p_subject_id;

  perform private.log_center_event(v_subject.center_id, 'subject.archived', p_subject_id,
    jsonb_build_object('name', v_subject.name, 'slots_removed', v_slots));
  return v_slots;
end;
$$;

create function public.unarchive_subject(p_subject_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject public.subjects;
begin
  select * into v_subject from public.subjects s where s.id = p_subject_id for update;
  if v_subject.id is null or not private.is_admin() or v_subject.center_id is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_subject.archived_at is null then
    return;
  end if;

  update public.subjects set archived_at = null, archived_by = null where id = p_subject_id;
  perform private.log_center_event(v_subject.center_id, 'subject.unarchived', p_subject_id,
    jsonb_build_object('name', v_subject.name));
end;
$$;

revoke all on function
  public.subject_dependencies(uuid),
  public.delete_subject(uuid),
  public.archive_subject(uuid),
  public.unarchive_subject(uuid)
from public, anon;
grant execute on function
  public.subject_dependencies(uuid),
  public.delete_subject(uuid),
  public.archive_subject(uuid),
  public.unarchive_subject(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- Export des données du centre : date d'archivage des matières.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_center_data(p_export_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_export public.center_exports;
  c uuid;
  f date;
  t date;
begin
  select * into v_export from public.center_exports e where e.id = p_export_id;
  if v_export.id is null or v_export.status <> 'pending' then
    raise exception 'Export introuvable ou déjà traité.' using errcode = 'P0002';
  end if;
  c := v_export.center_id;
  f := coalesce(v_export.period_from, '-infinity'::date);
  t := coalesce(v_export.period_to, 'infinity'::date);

  return json_build_object(
    'eleves', json_build_object('title', 'Élèves', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Nom', s.full_name,
        'Niveau', l.name,
        'Tuteur', s.guardian_name,
        'Téléphone du tuteur', s.guardian_phone,
        'Langue des messages', private.export_label('locale', coalesce(s.message_locale, 'center')),
        'Inscription en cours', exists (select 1 from public.enrollments e where e.student_id = s.id and e.active)
                                 or exists (select 1 from public.pack_enrollments pe where pe.student_id = s.id and pe.active),
        'Accès élève', exists (select 1 from public.student_accounts a where a.student_id = s.id and a.active),
        'Notes', s.notes,
        'Créé le', private.export_time(s.created_at)
      ) order by s.full_name), '[]'::json)
      from public.students s
      join public.levels l on l.id = s.level_id
      where s.center_id = c)),

    'tuteurs', json_build_object('title', 'Tuteurs', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Tuteur', g.guardian_name,
        'Téléphone', g.guardian_phone,
        'Élèves', g.students,
        'Nombre d''élèves', g.n
      ) order by g.guardian_name nulls last, g.guardian_phone), '[]'::json)
      from (
        select s.guardian_name, s.guardian_phone, string_agg(s.full_name, ', ' order by s.full_name) as students, count(*)::integer as n
        from public.students s
        where s.center_id = c and (s.guardian_name is not null or s.guardian_phone is not null)
        group by s.guardian_name, s.guardian_phone
      ) g)),

    'inscriptions', json_build_object('title', 'Inscriptions', 'rows', (
      select coalesce(json_agg(r.row order by r.student, r.course), '[]'::json)
      from (
        select s.full_name as student, sub.name as course, json_build_object(
          'Élève', s.full_name,
          'Niveau', l.name,
          'Type', 'Matière',
          'Matière ou pack', sub.name,
          'Dans un pack', e.pack_enrollment_id is not null,
          'Début', e.start_date,
          'Prix convenu (MAD)', e.price_agreed,
          'Jour de facturation', e.billing_day,
          'Active', e.active
        ) as row
        from public.enrollments e
        join public.students s on s.id = e.student_id
        join public.subjects sub on sub.id = e.subject_id
        join public.levels l on l.id = sub.level_id
        where s.center_id = c
        union all
        select s.full_name, p.name, json_build_object(
          'Élève', s.full_name,
          'Niveau', l.name,
          'Type', 'Pack',
          'Matière ou pack', p.name,
          'Dans un pack', false,
          'Début', pe.start_date,
          'Prix convenu (MAD)', pe.price_agreed,
          'Jour de facturation', pe.billing_day,
          'Active', pe.active
        )
        from public.pack_enrollments pe
        join public.students s on s.id = pe.student_id
        join public.packs p on p.id = pe.pack_id
        left join public.levels l on l.id = p.level_id
        where s.center_id = c
      ) r)),

    'matieres', json_build_object('title', 'Matières et niveaux', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Niveau', l.name,
        'Ordre du niveau', l.sort_order,
        'Matière', sub.name,
        'Prix mensuel (MAD)', sub.monthly_price,
        'Archivée le', to_char(private.local_time(sub.archived_at), 'YYYY-MM-DD')
      ) order by l.sort_order, l.name, sub.name), '[]'::json)
      from public.levels l
      left join public.subjects sub on sub.level_id = l.id
      where l.center_id = c)),

    'packs', json_build_object('title', 'Packs', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Pack', p.name,
        'Niveau', l.name,
        'Prix mensuel (MAD)', p.monthly_price,
        'Matières', (select string_agg(sub.name, ', ' order by sub.name)
                     from public.pack_subjects ps join public.subjects sub on sub.id = ps.subject_id
                     where ps.pack_id = p.id),
        'Actif', p.active
      ) order by p.name), '[]'::json)
      from public.packs p
      left join public.levels l on l.id = p.level_id
      where p.center_id = c)),

    'equipe', json_build_object('title', 'Professeurs et assistants', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Nom', p.full_name,
        'Rôle', private.export_label('role', p.role::text),
        'Courriel', u.email,
        'Téléphone', p.phone,
        'Actif', p.active,
        'Rémunération', private.export_label('pay_mode', p.pay_mode::text),
        'Créé le', private.export_time(p.created_at),
        'Dernière connexion', private.export_time(u.last_sign_in_at)
      ) order by p.role, p.full_name), '[]'::json)
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.center_id = c)),

    'emploi_du_temps', json_build_object('title', 'Emploi du temps', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Jour', private.export_label('day', sl.day_of_week::text),
        'Début', to_char(sl.start_time, 'HH24:MI'),
        'Fin', to_char(sl.end_time, 'HH24:MI'),
        'Niveau', l.name,
        'Matière', sub.name,
        'Professeur', pr.full_name,
        'Salle', coalesce(ro.name, sl.room)
      ) order by (sl.day_of_week + 6) % 7, sl.start_time, l.name), '[]'::json)
      from public.schedule_slots sl
      join public.subjects sub on sub.id = sl.subject_id
      join public.levels l on l.id = sl.level_id
      left join public.profiles pr on pr.id = sl.teacher_id
      left join public.rooms ro on ro.id = sl.room_id
      where sl.center_id = c)),

    'salles', json_build_object('title', 'Salles', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Salle', ro.name,
        'Capacité', ro.capacity,
        'Étage', ro.floor,
        'Active', ro.is_active,
        'Notes', ro.notes
      ) order by ro.name), '[]'::json)
      from public.rooms ro
      where ro.center_id = c)),

    'factures', json_build_object('title', 'Paiements des élèves', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Élève', s.full_name,
        'Matière ou pack', coalesce(sub.name, p.name),
        'Période du', i.period_start,
        'Période au', i.period_end,
        'Échéance', i.due_date,
        'Montant plein (MAD)', i.amount_full,
        'Remise (MAD)', i.discount_amount,
        'Montant dû (MAD)', i.amount_due,
        'Montant payé (MAD)', i.amount_paid,
        'Statut', private.export_label('invoice', i.status::text),
        'Payé le', private.export_time(i.paid_at),
        'Mode de paiement', private.export_label('method', i.payment_method::text),
        'Reçu', r.receipt_number
      ) order by i.period_start, s.full_name), '[]'::json)
      from public.invoices i
      join public.students s on s.id = i.student_id
      left join public.enrollments e on e.id = i.enrollment_id
      left join public.subjects sub on sub.id = e.subject_id
      left join public.pack_enrollments pe on pe.id = i.pack_enrollment_id
      left join public.packs p on p.id = pe.pack_id
      left join public.receipts r on r.id = i.receipt_id
      where s.center_id = c and i.period_start between f and t)),

    'recus', json_build_object('title', 'Reçus', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Numéro', r.receipt_number,
        'Type', private.export_label('receipt', r.kind::text),
        'Émis le', private.export_time(r.issued_at),
        'Élève', r.student_name,
        'Niveau', r.level_name,
        'Période du', r.period_start,
        'Période au', r.period_end,
        'Montant plein (MAD)', r.amount_full,
        'Remise (MAD)', r.discount_applied,
        'Montant payé (MAD)', r.amount_paid,
        'Reste dû (MAD)', r.balance_due,
        'Mode de paiement', private.export_label('method', r.payment_method::text),
        'Émis par', r.issued_by_name,
        'Motif d''annulation', r.cancel_reason
      ) order by r.issued_at, r.receipt_number), '[]'::json)
      from public.receipts r
      where r.center_id = c and (private.local_time(r.issued_at))::date between f and t)),

    'presences', json_build_object('title', 'Présences et absences', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', a.session_date,
        'Élève', s.full_name,
        'Niveau', l.name,
        'Matière', sub.name,
        'Professeur', pr.full_name,
        'Statut', private.export_label('attendance', a.status::text),
        'Note', a.note,
        'Pointé le', private.export_time(a.marked_at)
      ) order by a.session_date, sub.name, s.full_name), '[]'::json)
      from public.attendance a
      join public.students s on s.id = a.student_id
      join public.levels l on l.id = s.level_id
      join public.subjects sub on sub.id = a.subject_id
      left join public.profiles pr on pr.id = a.teacher_id
      where s.center_id = c and a.session_date between f and t)),

    'remises', json_build_object('title', 'Remises', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Élève', s.full_name,
        'Type', private.export_label('discount_type', d.type::text),
        'Valeur', d.value,
        'Portée', private.export_label('discount_scope', d.scope::text),
        'Matière ou pack', coalesce(sub.name, p.name),
        'Motif', private.export_label('discount_reason', d.reason::text),
        'Précision', d.reason_note,
        'Du', d.valid_from,
        'Au', d.valid_to,
        'Active', d.is_active,
        'Accordée le', private.export_time(d.granted_at)
      ) order by s.full_name, d.valid_from), '[]'::json)
      from public.discounts d
      join public.students s on s.id = d.student_id
      left join public.subjects sub on sub.id = d.subject_id
      left join public.packs p on p.id = d.pack_id
      where d.center_id = c)),

    'charges', json_build_object('title', 'Charges', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', x.expense_date,
        'Catégorie', cat.name,
        'Libellé', x.label,
        'Montant (MAD)', x.amount,
        'Mode de paiement', private.export_label('method', x.payment_method::text),
        'Récurrente', x.is_recurring,
        'Statut', private.export_label('expense', x.status::text),
        'Notes', x.notes,
        'Supprimée le', private.export_time(x.deleted_at)
      ) order by x.expense_date, x.label), '[]'::json)
      from public.expenses x
      left join public.expense_categories cat on cat.id = x.category_id
      where x.center_id = c and x.expense_date between f and t)),

    'paie', json_build_object('title', 'Paie', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Année', pp.year,
        'Mois', pp.month,
        'Statut de la période', private.export_label('payroll', pp.status::text),
        'Membre', pl.teacher_name,
        'Rôle', private.export_label('role', pl.member_role::text),
        'Mode', private.export_label('pay_mode', pl.pay_mode::text),
        'Montant calculé (MAD)', pl.computed_amount,
        'Ajustement (MAD)', pl.adjustment_amount,
        'Motif de l''ajustement', pl.adjustment_reason,
        'Montant final (MAD)', pl.final_amount,
        'Payé le', pl.paid_at,
        'Mode de paiement', private.export_label('method', pl.payment_method::text)
      ) order by pp.year, pp.month, pl.teacher_name), '[]'::json)
      from public.payroll_periods pp
      join public.payroll_lines pl on pl.payroll_period_id = pp.id
      where pp.center_id = c and make_date(pp.year, pp.month, 1) between date_trunc('month', f)::date and t)),

    'recus_paie', json_build_object('title', 'Reçus de paie', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Numéro', sp.receipt_number,
        'Type', private.export_label('receipt', sp.kind::text),
        'Émis le', to_char(private.local_time(sp.issued_at), 'YYYY-MM-DD HH24:MI'),
        'Versé le', sp.paid_on,
        'Année', sp.period_year,
        'Mois', sp.period_month,
        'Membre', sp.member_name,
        'Rôle', private.export_label('role', sp.member_role::text),
        'Montant (MAD)', sp.amount,
        'Mode de paiement', private.export_label('method', sp.payment_method::text),
        'Note', sp.note,
        'Annule le reçu', (select o.receipt_number from public.salary_payments o where o.id = sp.cancels_payment_id),
        'Motif de l''annulation', sp.cancel_reason,
        'Émis par', sp.issued_by_name
      ) order by sp.issued_at, sp.receipt_year, sp.receipt_seq), '[]'::json)
      from public.salary_payments sp
      where sp.center_id = c and sp.paid_on between f and t)),

    'caisse', json_build_object('title', 'Sessions de caisse', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date', cs.session_date,
        'Caisse partagée', cs.is_shared,
        'Accueil', ast.full_name,
        'Ouverte le', private.export_time(cs.opened_at),
        'Fond de caisse (MAD)', cs.opening_float,
        'Clôturée le', private.export_time(cs.closed_at),
        'Espèces attendues (MAD)', cs.expected_cash,
        'Espèces comptées (MAD)', cs.counted_cash,
        'Écart (MAD)', cs.variance,
        'Motif de l''écart', cs.variance_reason,
        'Statut', private.export_label('cash', cs.status::text),
        'Validée le', private.export_time(cs.validated_at),
        'Notes', cs.notes
      ) order by cs.session_date, cs.opened_at), '[]'::json)
      from public.cash_sessions cs
      left join public.profiles ast on ast.id = cs.assistant_id
      where cs.center_id = c and cs.session_date between f and t)),

    'mouvements_caisse', json_build_object('title', 'Mouvements de caisse', 'rows', (
      select coalesce(json_agg(json_build_object(
        'Date de la caisse', cs.session_date,
        'Heure', private.export_time(m.created_at),
        'Type', private.export_label('movement', m.kind::text),
        'Montant (MAD)', m.amount,
        'Motif', m.reason
      ) order by m.created_at), '[]'::json)
      from public.cash_movements m
      join public.cash_sessions cs on cs.id = m.cash_session_id
      where m.center_id = c and cs.session_date between f and t))
  );
end;
$function$;
