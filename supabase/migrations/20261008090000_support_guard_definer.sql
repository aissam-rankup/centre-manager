-- =====================================================================
-- CentroManager — 021 : garde-fou du mode support indépendant de l'appelant
--
-- Le trigger « lecture seule en support » (migration 018) appelait
-- private.in_support_write() avec les droits de l'appelant : le rôle
-- service_role (scripts d'administration, clé serveur) n'ayant pas le droit
-- d'exécuter cette fonction, toute écriture par la clé serveur sur une
-- table métier échouait. Le trigger s'exécute désormais avec les droits de
-- son propriétaire ; la règle est inchangée (seul un super-admin en
-- session de support est bloqué).
-- =====================================================================

alter function private.deny_support_writes() security definer;

grant execute on function private.in_support_write() to service_role;
grant execute on function private.support_center_id() to service_role;
