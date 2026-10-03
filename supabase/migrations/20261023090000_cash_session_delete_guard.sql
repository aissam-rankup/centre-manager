-- =====================================================================
-- CentroManager — 045 : une session de caisse ne se supprime pas (page 8, phase 8)
--
-- Aucun rôle applicatif n'a le droit de supprimer une session, mais la clé
-- de service le pouvait : une session clôturée sans reçu disparaissait avec
-- ses mouvements (suppression en cascade). Désormais, seule la suppression
-- du centre lui-même emporte ses sessions de caisse.
-- =====================================================================

create or replace function private.cash_sessions_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.centers c where c.id = old.center_id) then
    return old;
  end if;
  raise exception 'Une session de caisse ne se supprime pas : enregistrez une correction.' using errcode = '42501';
end;
$$;

create trigger cash_sessions_no_delete
before delete on public.cash_sessions
for each row execute function private.cash_sessions_no_delete();
