-- =====================================================================
-- CentroManager — 027 : remises visibles dans les listes d'élèves
--
-- Annuaire des élèves (accueil, administration) : remises en cours de
-- validité aujourd'hui, pour le badge des cartes. Colonne ajoutée en fin de
-- vue (vues dépendantes inchangées).
-- =====================================================================

create or replace view public.student_directory
with (security_invoker = true)
as
select
  s.id,
  s.center_id,
  s.full_name,
  s.search_name,
  s.level_id,
  l.name as level_name,
  l.sort_order as level_sort_order,
  s.photo_url,
  s.guardian_name,
  s.guardian_phone,
  s.created_at,
  coalesce(b.overdue_count, 0) as overdue_count,
  coalesce(b.overdue_amount, 0)::numeric(10, 2) as overdue_amount,
  coalesce(b.unpaid_amount, 0)::numeric(10, 2) as unpaid_amount,
  coalesce(b.overdue_count, 0) > 0 as is_overdue,
  -- [{type, value, reason, reason_note, scope, target}] ; lisible par l'équipe uniquement (RLS des remises).
  coalesce(d.discounts, '[]'::jsonb) as discounts
from public.students s
join public.levels l on l.id = s.level_id
left join lateral (
  select
    count(*) filter (where private.invoice_is_overdue(i.status, i.due_date))::integer as overdue_count,
    sum(i.amount_due - i.amount_paid) filter (where private.invoice_is_overdue(i.status, i.due_date)) as overdue_amount,
    sum(i.amount_due - i.amount_paid) filter (where i.status <> 'paid') as unpaid_amount
  from public.invoices i
  where i.student_id = s.id
) b on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
           'type', x.type, 'value', x.value, 'reason', x.reason, 'reason_note', x.reason_note,
           'scope', x.scope, 'target', coalesce(sub.name, p.name)
         ) order by x.granted_at) as discounts
  from public.discounts x
  left join public.subjects sub on sub.id = x.subject_id
  left join public.packs p on p.id = x.pack_id
  where x.student_id = s.id
    and x.is_active
    and x.valid_from <= private.today()
    and (x.valid_to is null or x.valid_to >= private.today())
) d on true;
