# Another Billboard

Site vitrine one-page : un hero plein écran en scène 3D interactive où les
visiteurs paient (montant libre) pour afficher la bannière de leur site sur
un panneau au sol ou un écran de bâtiment.

Voir le brief complet pour le produit cible. Ce document couvre l'état
actuel du code et son architecture.

## Stack

- **Next.js** (App Router, TypeScript, Turbopack) — hébergé sur **Vercel**
- **Three.js** — un seul moteur/renderer pour toute la scène (pas de
  react-three-fiber : contrôle direct du render loop, de l'EffectComposer
  et du futur instancing/LOD)
- **Neon** (Postgres serverless) via **Drizzle ORM** — connexion
  `neon-http`
- **Stripe** (Checkout) pour le paiement, **Pusher** pour la diffusion
  temps réel, **Resend** pour l'email transactionnel
- **cheerio** + **node-vibrant** pour le scraping (titre/description/
  favicon/couleur dominante)

## Démarrer

```bash
npm install
cp .env.example .env.local   # renseigner les variables nécessaires (voir le fichier)
npm run db:push              # crée les tables sur la base configurée dans DATABASE_URL
npm run db:seed              # peuple la table buildings (une fois)
npm run dev                  # http://localhost:3000
```

L'app démarre et affiche la scène même sans aucune variable
d'environnement configurée : la connexion DB et les clients Stripe/
Pusher/Resend sont tous "lazy" (ne s'initialisent qu'à l'usage réel), et
tout échec réseau/config est intercepté avec un repli propre plutôt
qu'un crash — voir [Comportement en l'absence de config](#comportement-en-labsence-de-config).

### Scripts

| Script                | Effet                                                  |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`           | Serveur de dev (Turbopack)                              |
| `npm run build`         | Build de production                                      |
| `npm run lint`          | ESLint                                                    |
| `npm run typecheck`     | `next typegen` puis `tsc --noEmit`                       |
| `npm run db:generate`    | Génère une migration SQL à partir du schéma Drizzle       |
| `npm run db:push`        | Pousse le schéma directement sur la base (dev rapide)    |
| `npm run db:studio`      | UI d'inspection de la base (Drizzle Studio)              |
| `npm run db:seed`        | Peuple `buildings` (bâtiment central + paliers) — idempotent, ne fait rien si déjà peuplée |

## Ce qui est fait

### Scène 3D (première étape)

- Bâtiment central : un cluster de tours de hauteurs variées sur un
  podium commun (silhouette irrégulière façon Shinjuku/Times Square),
  avec 4 écrans de classement sur la façade du podium (alimentés par les
  vrais top-4 paiements une fois qu'il y en a — voir plus bas).
- Sol + grille, panneau signature "ROBY" fixe et excentré.
- Caméra perspective fixe (position posée une fois, ne bouge jamais),
  vue de face au niveau du sol (pas d'angle plongeant) : le scroll fait
  varier `camera.zoom` — sur `PerspectiveCamera`, mathématiquement
  équivalent à resserrer le FOV à position fixe (vérifié dans le code
  source de three.js), donc un vrai zoom optique plutôt qu'un dolly qui
  rapproche la caméra. Un FOV de base modéré (30°) garde un peu de
  vraie profondeur/perspective sans que ce soit prononcé — l'orthographique
  pur essayé d'abord rendait trop plat.
- Post-traitement global unique (`EffectComposer` + `RenderPass` + un
  `ShaderPass` custom `CRTShader` + `OutputPass`) : rendu interne basse
  résolution + upscale `NEAREST` (pixel/aliasing façon PS1), scanlines,
  vignette, aberration chromatique.
- Minimap (bas-gauche) et légende (bas-droite), mises à jour hors du
  cycle de rendu React (event bus + DOM direct, pas de re-render à
  chaque frame de scroll).

### Flow de paiement complet

1. **Achat** : bouton "Réserver un panneau" → modal (montant libre,
   catégorie, email optionnel) → `POST /api/checkout` crée une session
   Stripe Checkout.
2. **Confirmation** : `POST /api/webhooks/stripe` vérifie la signature,
   confirme le paiement, crée un panneau *en attente* (sans URL/
   position — voir le commentaire sur `panels` dans `schema.ts`).
   Idempotent : `db.batch()` enregistre l'événement Stripe traité en
   même temps que son effet (`neon-http` n'a pas de vraies
   transactions — vérifié directement contre le driver — donc c'est le
   mécanisme d'atomicité utilisé partout où c'est nécessaire), pour
   qu'une notification Stripe redélivrée (documenté comme pouvant
   arriver) soit un no-op plutôt qu'un double paiement appliqué.
3. **URL du site** : redirigé sur `/panneau/nouveau?session_id=...`
   (page dédiée), l'utilisateur renseigne son URL →
   `POST /api/panels/claim` (route ajoutée, hors des 5 du brief mais
   nécessaire au flow qu'il décrit).
4. **Scraping** (`src/lib/scrape/`) : titre/description via
   `og:title`/`og:description` (repli sur `<title>`/meta description),
   favicon via plusieurs candidats (icônes déclarées + convention
   `/favicon.ico`), couleur dominante via node-vibrant — testé en
   conditions réelles pendant le développement (voir
   [Limites connues](#limites-connues)).
5. **Placement** (`src/lib/placement/`) : position non chevauchante par
   recherche en spirale depuis le centre, taille par une courbe
   logarithmique du montant (`src/lib/economy.ts` — pas de palier fixe,
   pas de plafond, croissance amortie).
6. **Diffusion temps réel** (Pusher) : le panneau apparaît chez tous les
   visiteurs connectés sans rechargement (`src/three/engine/LivePanels.ts`
   — ajoute/replace juste le mesh concerné, jamais un rebuild complet de
   la scène).
7. **Agrandissement** : `POST /api/panels/:id/boost` crée une session
   Stripe séparée ; le webhook additionne le montant et recalcule la
   taille.
8. **Notification "dépassé"** (Resend) : si `notifyOnOutgrown` était
   coché, email envoyé aux panneaux dont le montant vient d'être
   dépassé par le changement.

### Bâtiments

`GET /api/buildings` renvoie chaque bâtiment seedé avec son état
débloqué (calculé à la lecture depuis le total cumulé, pas stocké — voir
le commentaire sur `buildings` dans `schema.ts`) et le classement actuel
du bâtiment central (top 4 par montant, calculé en direct).

### Sécurité / robustesse notables

- `src/lib/api/serializePanel.ts` : tout panneau envoyé à un client
  (listing, diffusion temps réel) passe par ce sérialiseur — `ownerEmail`
  et l'id de session Stripe ne sortent jamais du serveur.
- Scraping défensif : timeout + plafond d'octets sur chaque fetch externe
  (`src/lib/scrape/fetchWithLimits.ts`), extraction de couleur avec son
  propre timeout et repli sur une couleur neutre.
- Webhook Stripe : signature vérifiée avant tout traitement, idempotence
  par événement (voir plus haut).

## Comportement en l'absence de config

Chaque intégration externe a un client "lazy" qui ne s'initialise qu'à
l'usage (`src/lib/db/client.ts`, `stripe.ts`, `pusher/server.ts`,
`resend.ts`) : rien ne casse au démarrage ni au build si une variable
d'environnement manque. Ce que ça donne concrètement sans config :

- La scène s'affiche avec des panneaux de démonstration (mock) tant
  qu'aucun panneau réel n'existe — `GET /api/panels` échouant proprement
  bascule dessus automatiquement (`LivePanels.loadRealPanels`).
- Les routes de paiement répondent une erreur claire (401/502) plutôt que
  de planter.
- Diffusion temps réel : silencieusement désactivée si les variables
  `NEXT_PUBLIC_PUSHER_*` sont absentes.

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Scène plein écran + minimap + légende + CTA d'achat
│   ├── panneau/nouveau/page.tsx  # Formulaire URL post-paiement (Suspense + useSearchParams)
│   ├── layout.tsx, globals.css
│   └── api/
│       ├── checkout/route.ts          # POST — nouveau panneau
│       ├── webhooks/stripe/route.ts   # POST — confirmation Stripe
│       ├── panels/route.ts            # GET  — listing (catégorie, LOD provisoire)
│       ├── panels/claim/route.ts      # POST — soumission URL post-paiement
│       ├── panels/[id]/boost/route.ts # POST — agrandissement
│       └── buildings/route.ts         # GET  — bâtiments + classement central
├── components/
│   ├── scene/      # SceneCanvas, Minimap, Legend
│   └── purchase/    # PurchaseTrigger, PurchaseModal, ClaimForm
├── three/
│   ├── engine/      # SceneManager (orchestrateur), CameraController, PostProcessing,
│   │                 # LivePanels (données réelles + temps réel), constants, sceneEvents
│   ├── objects/      # Factories de mesh : bâtiment, bâtiment central, panneau (mock + réel), sol
│   ├── shaders/      # CRTShader
│   └── placeholders/ # Données/mise en page de démonstration (utilisées tant qu'aucun panneau réel n'existe)
└── lib/
    ├── db/
    │   ├── schema.ts    # Tables Drizzle : panels, buildings, stripe_events
    │   ├── client.ts    # Client neon-http (lazy)
    │   ├── seed.ts       # Peuplement de `buildings`
    │   └── queries/      # Toutes les requêtes (panels.ts, buildings.ts, stripeEvents.ts)
    ├── scrape/           # Métadonnées + couleur dominante
    ├── placement/        # Algo de placement (spirale, sans chevauchement)
    ├── stripe.ts, stripe/checkout.ts
    ├── pusher/           # server.ts (trigger), client.ts (subscribe)
    ├── resend.ts
    ├── economy.ts        # Montant min, courbe taille, paliers de déblocage — tout le tuning produit
    ├── categories.ts
    ├── realtime.ts       # Noms de canal/événements partagés serveur/client
    └── api/
        ├── serializePanel.ts  # Jamais renvoyer une ligne DB brute à un client
        └── fetchPanels.ts     # Fetch côté client de GET /api/panels
```

`SceneManager` reste le seul point d'entrée du moteur 3D. `LivePanels`
est le seul endroit qui touche aux panneaux affichés : bascule
démo→réel, ajout/mise à jour ciblée par événement temps réel, jamais de
reconstruction complète de la scène.

### Pourquoi pas react-three-fiber

Le brief demande un contrôle fin et peu courant : un unique
`EffectComposer` custom, du `InstancedMesh` par typologie de bâtiment, un
atlas de texture dynamique, un diff explicite des panneaux visibles par
frame. Du Three.js "vanilla" dans une classe dédiée (`SceneManager`) rend
ce contrôle direct plutôt que de le négocier à travers une couche
déclarative React — plus simple à raisonner ici vu ce qui est demandé.

## Limites connues

- **LOD provisoire** : `GET /api/panels?zoom=` fait varier une limite
  globale, sans filtrage spatial par `viewport` (paramètre accepté, pas
  encore utilisé). La vraie formule continue *par zone visible* du brief
  a besoin du calcul de frustum de la caméra côté client — prochain
  chantier.
- **Favicons cross-origin** : le favicon d'un site externe est chargé
  directement depuis son origine pour la texture du panneau et pour
  l'extraction de couleur ; certains hôtes n'envoient pas d'en-têtes CORS
  permissifs, et node-vibrant (backend jimp) ne décode pas le SVG ni
  l'ICO — testé en conditions réelles pendant le développement (voir
  `src/lib/scrape/color.ts`). Repli propre sur une couleur/texture par
  défaut à chaque fois, mais la vraie solution est de proxifier et
  mettre en cache les favicons via notre propre origine (rejoint l'atlas
  de texture du brief).
- **node-vibrant / avis de sécurité** : sa chaîne de dépendances
  (`@jimp/core` → `file-type`) porte un avis modéré (boucle infinie sur
  entrée `.asf` malformée, `npm audit`). Contenu par un plafond
  d'octets + timeout sur chaque fetch/extraction (voir
  `src/lib/scrape/color.ts`) plutôt que retiré, puisque explicitement
  suggéré par le brief.
- **Bâtiments additionnels** : la table + l'API existent (débloqués
  calculés depuis le total cumulé), mais la scène 3D n'affiche encore que
  le bâtiment central — faire apparaître dynamiquement les bâtiments
  débloqués est un chantier 3D à part.

## Prochaines étapes

- Clic direct dans la scène 3D sur un emplacement libre (raycasting) —
  actuellement un bouton générique ouvre la modal, pas encore de
  sélection d'un emplacement précis.
- Affichage 3D des bâtiments débloqués (au-delà du bâtiment central).
- LOD réel par viewport + zoom continu, atlas de texture dynamique,
  `InstancedMesh` par typologie de bâtiment.
- Personnages/oiseaux en sprites billboard.
- Filtre par catégorie côté UI (le filtre existe déjà côté API).
