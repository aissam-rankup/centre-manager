-- =====================================================================
-- CentroManager — 033 : le chèque comme mode de paiement (page 8)
--
-- Seule dans sa migration : une valeur ajoutée à un type énuméré n'est
-- utilisable qu'après la validation de la transaction qui l'ajoute.
-- Les chèques, comme les virements et les cartes, se rapprochent à part :
-- ils n'entrent pas dans l'écart de caisse (seules les espèces se comptent).
-- =====================================================================

alter type public.payment_method add value if not exists 'cheque';
