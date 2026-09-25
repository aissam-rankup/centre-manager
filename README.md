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

Supabase utilise les ports **5532x** pour cohabiter avec d'autres projets locaux :

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:55321 |
| Base Postgres | postgresql://postgres:postgres@127.0.0.1:55322/postgres |
| Studio | http://127.0.0.1:55323 |
| Emails de test (Mailpit) | http://127.0.0.1:55324 |

> **Windows** : Hyper-V réserve dynamiquement des plages de ports (`netsh interface ipv4 show excludedportrange protocol=tcp`). Si `supabase start` échoue avec « bind: An attempt was made to access a socket in a way forbidden », changez les ports dans `supabase/config.toml` (et `NEXT_PUBLIC_SUPABASE_URL`) vers une plage libre.

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
npm run db:test     # tests pgTAP : policies RLS et hook JWT
npm run typecheck   # types de routes Next + TypeScript strict
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

## Authentification et espaces

| Espace | Rôle | URL |
| --- | --- | --- |
| Connexion | — | `/connexion` |
| Accueil (assistant) | `assistant` | `/assistant` |
| Professeur | `teacher` | `/professeur` |
| Administration | `admin` | `/admin` |
| Compte inactif | compte désactivé ou sans profil | `/compte-inactif` |

- **Connexion** : email et mot de passe, via une Server Action (`src/lib/auth/actions.ts`). Les inscriptions publiques sont fermées ; les comptes sont créés par l'administration.
- **Proxy** (`src/proxy.ts`) : rafraîchit la session, impose une session sur toutes les pages (sauf `/connexion`) et oriente `/` et `/connexion` vers l'espace du rôle. La page demandée est conservée dans `?suivant=` ; seuls les chemins internes du bon espace sont acceptés.
- **Garde serveur** (`requireRole` dans `src/lib/auth/session.ts`) : chaque espace vérifie le rôle et l'activation **en base**. C'est la source de vérité : une désactivation ou un changement de rôle s'applique immédiatement, même si le jeton n'est pas encore renouvelé.
- **Jeton** : le hook `custom_access_token_hook` ajoute `user_role`, `center_id` et `profile_active` au JWT. Il sert uniquement aux redirections rapides du proxy.
- **La charte graphique** (`/charte`) n'est disponible qu'en développement.

### Mise en production (Supabase hébergé)

1. Appliquer les migrations : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.
2. Activer le hook : **Authentication > Hooks > Customize Access Token**, fonction `public.custom_access_token_hook`.
3. Désactiver les inscriptions publiques : **Authentication > Sign In / Providers > Allow new users to sign up** décoché.
4. Renseigner les variables de `.env.example` dans Vercel (`SUPABASE_SERVICE_ROLE_KEY` en variable serveur uniquement).

## Mode appel (professeur)

- L'accueil du professeur liste ses séances du jour, avec l'état de l'appel.
- Une carte par élève (photo 200 px), boutons Présent / Absent de 64 px. Marquer passe à l'élève suivant non marqué.
- Navigation : glissement horizontal sur mobile, flèches ← → au clavier. Raccourcis : P (présent), A (absent).
- Récapitulatif avant validation : toucher un élève inverse son statut. L'appel déjà fait s'ouvre directement sur le récapitulatif, pour correction.
- L'appel n'est possible que le jour de la séance (règle vérifiée aussi par la RLS).
- Démo : prof1 a une séance chaque jour du lundi au jeudi et le samedi ; prof2 le mardi et le vendredi ; prof3 le mardi, le mercredi, le vendredi et le samedi.

## Espace administrateur

- **Tableau de bord** : encaissé et attendu du mois, reste à encaisser (en MAD et en %), effectif, taux d'absence par matière sur 30 jours (graphique + tableau). Filtre par niveau.
  - *Attendu du mois* : factures dont la période commence dans le mois civil en cours. *Encaissé* : la part payée de ces factures.
  - *Taux d'absence* : absences ÷ présences saisies.
- **Niveaux et matières** : création, modification, suppression et tarifs. Une suppression est refusée tant que l'élément est utilisé. Un nouveau tarif s'applique aux nouvelles inscriptions ; le prix convenu des inscriptions existantes se modifie depuis la fiche élève.
- **Planning** : grille hebdomadaire filtrable par niveau. Seuls les professeurs affectés à la matière sont proposés. Les conflits de salle et de professeur sont signalés dans le formulaire et refusés par la base.
- **Utilisateurs** : création (mot de passe provisoire à communiquer), modification, désactivation / réactivation (la connexion est aussi bloquée côté Auth). Un administrateur ne peut ni se désactiver ni changer son propre rôle ; le rôle professeur est figé.
- **Élèves** : liste complète (recherche, niveau, statut de paiement), fiche avec modification, suppression définitive (photo comprise) et gestion des inscriptions (prix convenu, arrêt, reprise, ajout). Pour changer un élève de niveau, arrêter d'abord ses inscriptions au niveau actuel.
- **Rapports** : effectifs par niveau et par matière, revenu mensuel (somme des prix convenus), classement des matières par taux d'absence (30 jours, 90 jours ou depuis le début). Export CSV compatible Excel (séparateur « ; », UTF-8).

## Règles de facturation

- **Deux cycles** : le 1er et le 15 du mois, déterminés par la date d'inscription (jour 1 à 14 : cycle du 1er ; jour 15 à 31 : cycle du 15).
- **Période** : un mois complet à partir du jour du cycle (ex. du 15/09 au 14/10).
- **Échéance** : début de période + 5 jours (le 6 ou le 20). La **première facture**, créée dès l'inscription, est due 5 jours après la date d'inscription.
- **Paiement intégral** uniquement. Marquer une facture comme payée résout automatiquement l'alerte de retard liée.
- **Retard** : une facture impayée dont l'échéance est dépassée est affichée « En retard ».
- **Relances du jour** : élèves en retard, du plus ancien retard au plus récent. Un élève relancé aujourd'hui en sort jusqu'au lendemain.

## Automatisations

Une tâche **pg_cron** (`centromanager-daily-automations`) s'exécute chaque jour à 00:10 UTC (01:10 à Casablanca, 00:10 pendant le ramadan) :

- **Factures** : pour chaque inscription active, la facture de la période en cours est créée au prix convenu (cycles du 1er et du 15), échéance au début de période + 5 jours. La tâche est idempotente : une facture par inscription et par période.
- **Retards** : une facture « en attente » dont l'échéance est dépassée passe « en retard » et ouvre une alerte de paiement. Payer la facture ferme l'alerte et retire l'élève de la liste de relance.

En continu, par triggers :

- **Absences consécutives** : à la 3e absence de suite dans une matière, une alerte s'ouvre (le compteur suit ensuite : 4, 5…). Elle se ferme au retour de l'élève dans la matière, ou dès qu'une relance « absence » est enregistrée. Une série déjà traitée ne rouvre pas d'alerte.
- **Reprise d'une inscription** : la période en cours est facturée aussitôt (mois complet), due 5 jours après la reprise.

Lancer les tâches du jour à la main (Studio → SQL Editor, ou `psql`) :

```sql
select private.run_daily_automations();
```

Historique des exécutions : `select * from cron.job_run_details order by start_time desc;`

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
- **Planning** : les conflits de salle et de professeur sont refusés par des contraintes d'exclusion ; un créneau exige un professeur affecté à la matière.
- **Inscriptions** : un élève ne suit activement que des matières de son niveau.
- **Photos** : bucket privé `student-photos`, chemin `{center_id}/{fichier}`, lecture limitée au même centre.

## Organisation

```
supabase/
  config.toml             configuration locale (ports 5532x, inscriptions publiques fermées)
  migrations/             migrations SQL versionnées
  seed.sql                données de démonstration
  tests/database/         tests pgTAP (policies RLS, hook JWT)
src/
  proxy.ts                session et redirections (ex-middleware)
  app/                    routes (App Router)
    (auth)/connexion/     page de connexion
    assistant/            espace accueil
    professeur/           espace professeur ((shell) = pages avec navigation)
    admin/                espace administration
    compte-inactif/       compte désactivé ou sans profil
    charte/               démonstration de la charte (développement uniquement)
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
    auth/                 routes par rôle, session serveur, Server Actions, schémas Zod
    supabase/             clients (navigateur, serveur, service_role, proxy) et types générés
    env.ts, env.server.ts variables d'environnement validées (Zod)
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
