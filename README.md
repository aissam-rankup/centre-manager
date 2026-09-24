# CentroManager

SaaS de gestion des abonnements et des présences pour les centres de langue et de soutien scolaire.
Utilisé uniquement par l'équipe du centre : Admin, Assistant (accueil) et Professeur.

## Stack

| Domaine | Choix |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions) · React 19 |
| Langage | TypeScript 6 strict (`any` interdit par ESLint) |
| UI | Tailwind CSS 4 · shadcn/ui (Radix) · lucide-react · Sonner |
| Données | Supabase (Postgres 17, Auth, Storage, RLS) via `@supabase/ssr` |
| Formulaires | Zod · React Hook Form |
| Dates | date-fns (locale `fr`) · `@date-fns/tz` — fuseau `Africa/Casablanca` |
| Graphiques | Recharts |
| Déploiement | Vercel |

## Installation locale

### 1. Prérequis

- Node.js 20.9 ou plus récent (`node -v`)
- npm 10 ou plus récent
- Docker Desktop, démarré (Supabase local tourne dans Docker)

La CLI Supabase est installée comme dépendance du projet : aucune installation globale n'est nécessaire.

### 2. Récupérer le projet et installer les dépendances

```bash
git clone <url-du-depot> centromanager
cd centromanager
npm install
```

### 3. Démarrer Supabase en local

```bash
npm run db:start
```

Le premier démarrage télécharge les images Docker (quelques minutes). La commande applique les migrations de `supabase/migrations`, puis le seed de démonstration `supabase/seed.sql`.

Supabase utilise les ports **5434x** pour cohabiter avec d'autres projets locaux :

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:54341 |
| Base Postgres | postgresql://postgres:postgres@127.0.0.1:54342/postgres |
| Studio | http://127.0.0.1:54343 |
| Emails de test (Mailpit) | http://127.0.0.1:54344 |

### 4. Configurer les variables d'environnement

```bash
cp .env.example .env.local
npm run db:status
```

Copiez `PUBLISHABLE_KEY` dans `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SECRET_KEY` dans `SUPABASE_SERVICE_ROLE_KEY`.

### 5. Lancer l'application

```bash
npm run dev
```

Ouvrez http://localhost:3000.

### 6. Vérifier

```bash
npm run db:test     # tests des policies RLS (pgTAP)
npm run typecheck   # TypeScript strict
npm run lint        # ESLint
npm run build       # build de production
```

## Comptes de démonstration

Mot de passe commun : **`CentroDemo2026!`**

| Rôle | Email | Nom |
| --- | --- | --- |
| Admin | admin@centro.demo | Nadia Berrada |
| Assistant (accueil) | accueil@centro.demo | Karim Lahlou |
| Professeur — Mathématiques (3 niveaux) | prof1@centro.demo | Rachid Benali |
| Professeur — Physique-Chimie (2ème BAC) | prof2@centro.demo | Laila Chakir |
| Professeur — Anglais (TC), Français (1ère BAC) | prof3@centro.demo | Youssef Amrani |

Contenu du seed : 1 centre, 3 niveaux, 6 matières, 40 élèves, 72 inscriptions, 12 créneaux hebdomadaires, 4 semaines de présences, factures du mois précédent et du mois en cours (dont une partie en retard), alertes et relances. Les dates sont calculées à partir du jour du `db:reset`.

## Base de données

| Commande | Effet |
| --- | --- |
| `npm run db:start` / `db:stop` | Démarre / arrête Supabase local |
| `npm run db:status` | Affiche les URL et les clés locales |
| `npm run db:reset` | Recrée la base : migrations + seed |
| `npm run db:test` | Lance les tests pgTAP de `supabase/tests` |
| `npm run db:types` | Régénère `src/lib/supabase/database.types.ts` |

Toute modification de schéma passe par une nouvelle migration :

```bash
npx supabase migration new nom_de_la_migration
```

### Règles d'accès (RLS)

- Tout est cloisonné par centre, y compris par les clés étrangères (clés composites `(id, center_id)`).
- **Admin** : tout son centre. Seul rôle à modifier ou supprimer élèves, matières, niveaux, profils et créneaux. Seul rôle à fixer les tarifs.
- **Assistant** : lecture de tout son centre. Crée élèves, inscriptions (au tarif de la matière), relances et comptes professeur. Sur les factures, ne modifie que `amount_paid`, `status`, `paid_at` et `paid_by`.
- **Professeur** : voit les élèves inscrits à ses matières et ses propres créneaux. Saisit les présences de ses matières, uniquement le jour même. Aucun accès aux factures ni aux prix : il lit les matières et les listes de classe via les vues `subject_catalog` et `class_rosters`, sans tarifs.
- **Compte désactivé** : aucun accès.
- **Planning** : les conflits de salle et de professeur sont refusés par des contraintes d'exclusion.
- **Photos** : bucket privé `student-photos`, chemin `{center_id}/{fichier}`, lecture limitée au même centre.

## Organisation

```
supabase/
  config.toml             configuration locale (ports 5434x, inscriptions publiques fermées)
  migrations/             migrations SQL versionnées
  seed.sql                données de démonstration
  tests/database/         tests pgTAP des policies RLS
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
    supabase/             types générés de la base
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
