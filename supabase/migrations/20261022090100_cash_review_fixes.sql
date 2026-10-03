-- =====================================================================
-- CentroManager — 044 : caisse, corrections de la revue (page 8, phase 6)
--
--  * Fonds de caisse : tant qu'aucun encaissement n'est passé dans la
--    session, il se saisit (ou se corrige) à l'ouverture explicite et au
--    premier encaissement, même si une annulation ou un mouvement a ouvert
--    la caisse avant (avec un fonds nul).
--  * Ouverture simultanée : jamais d'opération sans caisse.
--  * Une facture ne se crée pas non plus directement « réglée ».
-- =====================================================================

create or replace function private.open_cash_session_for(p_center_id uuid, p_user uuid, p_float numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shared boolean;
  v_today date := private.today();
  v_id uuid;
begin
  select not c.cash_session_per_assistant into v_shared from public.centers c where c.id = p_center_id;
  select cs.id into v_id
  from public.cash_sessions cs
  where cs.center_id = p_center_id and cs.status = 'open' and cs.session_date = v_today
    and case when v_shared then cs.is_shared else not cs.is_shared and cs.assistant_id = p_user end
  for share;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.cash_sessions (center_id, session_date, is_shared, assistant_id, opened_by, opening_float)
    values (p_center_id, v_today, v_shared, case when v_shared then null else p_user end, p_user, coalesce(p_float, 0))
    returning id into v_id;
  exception when unique_violation then
    -- Ouverte au même instant par quelqu'un d'autre : on la rejoint.
    select cs.id into v_id
    from public.cash_sessions cs
    where cs.center_id = p_center_id and cs.status = 'open' and cs.session_date = v_today
      and case when v_shared then cs.is_shared else not cs.is_shared and cs.assistant_id = p_user end
    for share;
    -- Rejointe puis clôturée dans le même instant : jamais d'opération sans caisse.
    if v_id is null then
      raise exception 'La caisse vient de changer : réessayez.' using errcode = '40001';
    end if;
    return v_id;
  end;

  perform private.log_center_event(p_center_id, 'cash_session.opened', v_id,
    jsonb_build_object('opening_float', coalesce(p_float, 0), 'shared', v_shared, 'session_date', v_today));
  return v_id;
end;
$$;

-- Ouvrir la caisse (accueil et admin) ; déjà ouverte sans encaissement : le
-- fonds saisi la remplace (consigné) ; après un encaissement, il est figé.
create or replace function public.open_cash_session(p_opening_float numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := (select private.auth_center_id());
  v_id uuid;
  v_float numeric;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not (select private.is_staff()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_opening_float is null or p_opening_float < 0 or p_opening_float > 99999999.99
     or p_opening_float <> round(p_opening_float, 2) then
    raise exception 'Fonds de caisse : un montant positif, au centime près.' using errcode = '22023';
  end if;
  v_id := private.open_cash_session_for(v_center_id, (select auth.uid()), p_opening_float);

  select cs.opening_float into v_float from public.cash_sessions cs where cs.id = v_id for update;
  if v_float <> p_opening_float and not exists (
    select 1 from public.receipts rc where rc.cash_session_id = v_id and rc.kind = 'payment'
  ) then
    update public.cash_sessions cs set opening_float = p_opening_float where cs.id = v_id;
    perform private.log_center_event(v_center_id, 'cash_session.float_set', v_id,
      jsonb_build_object('previous', v_float, 'opening_float', p_opening_float));
  end if;
  return v_id;
end;
$$;

create or replace function private.invoices_payment_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Création directe d'une facture déjà réglée : refusée aussi.
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon')
       and (new.status = 'paid' or coalesce(new.amount_paid, 0) <> 0 or new.paid_at is not null
            or new.paid_by is not null or new.payment_method is not null or new.receipt_id is not null) then
      raise exception 'Un encaissement passe par l''écran de paiement (reçu et caisse).' using errcode = '42501';
    end if;
    return new;
  end if;
  if current_user in ('authenticated', 'anon')
     and ((new.status is distinct from old.status and 'paid' in (new.status, old.status))
          or new.amount_paid is distinct from old.amount_paid
          or new.paid_at is distinct from old.paid_at
          or new.paid_by is distinct from old.paid_by
          or new.payment_method is distinct from old.payment_method
          or new.receipt_id is distinct from old.receipt_id) then
    raise exception 'Un encaissement passe par l''écran de paiement (reçu et caisse).' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger invoices_payment_guard on public.invoices;
create trigger invoices_payment_guard
before insert or update on public.invoices
for each row execute function private.invoices_payment_guard();
