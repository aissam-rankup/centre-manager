-- =====================================================================
-- Paiements d'abonnement : modes « chèque » et « autre »
--
-- Migration séparée : une valeur ajoutée à un type énuméré n'est
-- utilisable qu'après la validation de la transaction qui l'ajoute.
-- =====================================================================

alter type public.subscription_payment_method add value if not exists 'cheque';
alter type public.subscription_payment_method add value if not exists 'other';
