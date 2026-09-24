# CentroManager

SaaS de gestion des abonnements et des présences pour les centres de langue et de soutien scolaire.
Utilisé uniquement par l'équipe du centre : Admin, Assistant (accueil) et Professeur.

## Stack

| Domaine | Choix |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions) · React 19 |
| Langage | TypeScript 6 strict (`any` interdit par ESLint) |
| UI | Tailwind CSS 4 · shadcn/ui (Radix) · lucide-react · Sonner |
| Données | Supabase (Postgres, Auth, Storage, RLS) via `@supabase/ssr` |
| Formulaires | Zod · React Hook Form |
| Dates | date-fns (locale `fr`) · `@date-fns/tz` — fuseau `Africa/Casablanca` |
| Graphiques | Recharts |
| Déploiement | Vercel |

## Installation locale

### 1. Prérequis

- Node.js 20.9 ou plus récent (`node -v`)
- npm 10 ou plus récent
- À partir de la phase 2 : Docker Desktop, pour lancer Supabase en local

### 2. Récupérer le projet et installer les dépendances

```bash
git clone <url-du-depot> centromanager
cd centromanager
npm install
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env.local
```

Renseignez les valeurs décrites dans `.env.example`. En phase 1, elles ne sont pas encore utilisées.

### 4. Lancer l'application

```bash
npm run dev
```

Ouvrez http://localhost:3000. En phase 1, l'accueil redirige vers la charte graphique (`/charte`).

### 5. Vérifier le code

```bash
npm run typecheck   # TypeScript strict
npm run lint        # ESLint
npm run build       # build de production
```

## Organisation

```
src/
  app/                    routes (App Router)
    charte/               démonstration de la charte : tokens, composants, états
  components/
    ui/                   composants shadcn adaptés à la charte
    layout/               coque applicative, logo, bascule de thème
    shared/               composants transverses : montant, pastille, photo élève,
                          tableau responsive, indicateur, états vide / erreur
    providers/            fournisseurs React (thème)
  config/navigation.ts    entrées de navigation par espace
  lib/
    constants/labels.ts   TOUS les libellés français de l'interface
    format.ts             « 1 200 MAD », pourcentages, dates jj/mm/aaaa (Africa/Casablanca)
```

## Conventions

- **Libellés** : aucun texte en dur dans les composants, tout passe par `LABELS`.
- **Couleurs** : tokens uniquement. Les couleurs de la charte (`primary`, `brand`, `highlight`, `success`, `danger`, `warning`) servent aux fonds, bordures et points. Pour le texte, utiliser les nuances `*-ink`, calibrées à 4,5:1 minimum.
- **Ambre** (`highlight`) : un seul usage par écran.
- **Typographie** : `text-title` (28/700), `text-section` (20/600), `text-body` (15, par défaut), `text-caption` (13). Montants et chiffres : `Money` ou classe `numeric`.
- **Espacement** : 4, 8, 12, 16, 24, 32, 48, 64 px (`1, 2, 3, 4, 6, 8, 12, 16` en Tailwind).
- **Interactions** : zones tactiles de 44 px minimum ; boutons du mode appel `size="call"` (64 px).
- **Tableaux** : `DataTable` bascule automatiquement en cartes sous 768 px.
- **Icônes** : lucide-react uniquement. Pas d'emoji.
