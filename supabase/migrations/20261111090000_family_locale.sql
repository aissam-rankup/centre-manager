-- =====================================================================
-- Langue des messages aux familles (phase 4c du multilingue)
--
--  * centers.family_locale : langue par défaut des messages et documents
--    remis aux familles (WhatsApp, reçus, fiche d'assiduité) ; français
--    par défaut, modifiable par l'administrateur (réglages du centre) ;
--  * students.message_locale : langue propre à une famille ; vide = langue
--    du centre ;
--  * set_student_message_locale : réglage par l'équipe du centre (accueil
--    compris : la mise à jour directe des élèves est réservée à l'admin).
-- =====================================================================

alter table public.centers
  add column family_locale text not null default 'fr'
    check (family_locale in ('fr', 'ar', 'en'));

comment on column public.centers.family_locale is
  'Langue par défaut des messages et documents remis aux familles (fr, ar, en).';

grant select (family_locale) on public.centers to authenticated;
grant update (family_locale) on public.centers to authenticated;

alter table public.students
  add column message_locale text
    check (message_locale is null or message_locale in ('fr', 'ar', 'en'));

comment on column public.students.message_locale is
  'Langue des messages et documents remis à la famille ; vide : langue du centre (centers.family_locale).';

create function public.set_student_message_locale(p_student_id uuid, p_locale text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
begin
  if v_center_id is null or not private.is_staff() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_locale is not null and p_locale not in ('fr', 'ar', 'en') then
    raise exception 'Langue inconnue.' using errcode = '22023';
  end if;

  update public.students
  set message_locale = p_locale
  where id = p_student_id and center_id = v_center_id;

  if not found then
    raise exception 'Élève introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.set_student_message_locale(uuid, text) is
  'Langue des messages d''une famille (vide : langue du centre) ; équipe du centre de l''élève.';

revoke execute on function public.set_student_message_locale(uuid, text) from public, anon;
grant execute on function public.set_student_message_locale(uuid, text) to authenticated;
