# CentroManager

SaaS de gestion des abonnements et des présences pour les centres de langue et de soutien scolaire.

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Supabase · Zod · React Hook Form · TanStack Query · date-fns (fr) · Recharts · Sonner · Lucide

## Démarrage

```bash
npm install
cp .env.example .env.local   # variables Supabase (phase 2)
npm run dev
```

Scripts : `dev`, `build`, `start`, `lint`, `typecheck`.

## Organisation

```
src/
  app/                    routes (App Router)
    charte/               page de démonstration de la charte graphique
  components/
    ui/                   composants shadcn adaptés à la charte
    layout/               coque applicative, logo, bascule de thème
    shared/               composants métier transverses (montant, statut, état vide…)
    providers/            fournisseurs React (thème)
  config/navigation.ts    entrées de navigation par espace
  lib/
    constants/labels.ts   TOUS les libellés français de l'interface
    format.ts             formatage MAD, pourcentages, dates (jj/mm/aaaa)
```

## Conventions

- Aucun texte en dur dans les composants : tout passe par `LABELS` (`src/lib/constants/labels.ts`).
- Montants : composant `Money` ou `formatMAD` / `formatMADLong`, toujours en chiffres tabulaires (`numeric`).
- Couleurs : tokens uniquement (`primary`, `highlight`, `success`, `overdue`, `absence`), jamais de valeur brute dans un composant.
- Zones tactiles ≥ 44 px (`Button` par défaut `h-11`), boutons d'appel via `size="call"` (≥ 64 px).
- Icônes : Lucide uniquement. Pas d'emoji dans l'interface.
- `any` est interdit (règle ESLint en erreur).
