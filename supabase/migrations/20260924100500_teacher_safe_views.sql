-- =====================================================================
-- CentroManager — 006 : vues sans prix
--
-- Les professeurs n'ont aucun accès aux tables subjects et enrollments
-- (elles contiennent les tarifs). Ces vues exposent uniquement les colonnes
-- non financières. Elles s'exécutent avec les droits de leur propriétaire
-- (security_invoker = false) et appliquent donc elles-mêmes le filtrage :
-- toute ligne hors du centre de l'utilisateur est exclue.
-- =====================================================================

-- Catalogue des matières du centre, sans tarif.
create view public.subject_catalog
with (security_barrier = true)
as
select s.id, s.center_id, s.level_id, s.name
from public.subjects s
where s.center_id = (select private.auth_center_id());

-- Listes de classe : staff = tout le centre ; professeur = ses matières.
create view public.class_rosters
with (security_barrier = true)
as
select e.id, e.student_id, e.subject_id, e.start_date, e.active
from public.enrollments e
join public.students st on st.id = e.student_id
where st.center_id = (select private.auth_center_id())
  and ((select private.is_staff()) or private.teaches_subject(e.subject_id));

comment on view public.subject_catalog is
  'Matières du centre de l''utilisateur, sans tarif. Filtrage appliqué par la vue.';
comment on view public.class_rosters is
  'Inscriptions visibles par l''utilisateur, sans prix. Filtrage appliqué par la vue.';

revoke all on public.subject_catalog, public.class_rosters from anon, authenticated;
grant select on public.subject_catalog, public.class_rosters to authenticated;

-- Aucun droit par défaut pour anon sur les futurs objets du schéma public.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;
