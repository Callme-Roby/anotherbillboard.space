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
  `neon-http`, prête pour l'intégration Vercel Marketplace
- **Stripe**, **Pusher/Ably**, **Resend** — prévus au brief, pas encore
  intégrés (voir [Prochaines étapes](#prochaines-étapes))

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner DATABASE_URL si besoin
npm run dev                  # http://localhost:3000
```

Sans `DATABASE_URL`, l'app démarre quand même : rien dans le rendu actuel
n'interroge la base (voir plus bas). Un warning s'affiche juste au premier
import du client DB.

### Scripts

| Script              | Effet                                                |
| -------------------- | ----------------------------------------------------- |
| `npm run dev`         | Serveur de dev (Turbopack)                            |
| `npm run build`       | Build de production                                    |
| `npm run lint`        | ESLint                                                  |
| `npm run typecheck`   | `next typegen` puis `tsc --noEmit`                     |
| `npm run db:generate`  | Génère une migration SQL à partir du schéma Drizzle     |
| `npm run db:push`      | Pousse le schéma directement sur la base (dev rapide)  |
| `npm run db:studio`    | UI d'inspection de la base (Drizzle Studio)            |

## Ce qui est fait

Cette première étape pose l'architecture et produit un premier rendu
statique de la scène — pas encore le flow de paiement.

- **Structure de dossiers** prête pour le reste du produit (voir
  [Architecture](#architecture)).
- **Connexion Neon/Drizzle** configurée : schéma `panels` / `buildings`
  fidèle au brief (`src/lib/db/schema.ts`), migration initiale générée
  (`drizzle/0000_*.sql`), client lazy-safe qui ne casse rien tant qu'aucune
  route ne l'utilise réellement.
- **Scène Three.js** : bâtiment central placeholder (tour à paliers +
  4 écrans de classement), une poignée de panneaux placeholder (texture
  générée sur canvas, taille dérivée d'un montant mock), panneau
  signature "Built by Roby" fixe et excentré, sol + grille.
- **Caméra** : dolly au scroll (zoom avant/arrière progressif, amorti),
  parallaxe naturelle par perspective — pas de système de couches séparé.
- **Post-traitement global unique** (`EffectComposer` + `RenderPass` +
  un `ShaderPass` custom `CRTShader` + `OutputPass`) : rendu interne basse
  résolution + upscale `NEAREST` (pixel/aliasing façon PS1), scanlines,
  vignette, aberration chromatique.
- **Minimap** (bas-gauche) et **légende** (bas-droite), mises à jour hors
  du cycle de rendu React (event bus + DOM direct, pas de re-render à
  chaque frame de scroll).
- **Stubs des 5 routes API** du brief (`checkout`, `webhooks/stripe`,
  `panels`, `panels/:id/boost`, `buildings`) : signatures/paths corrects,
  répondent `501` — logique réelle au prochain chantier.

Vérifié : `npm run build`, `npm run lint`, `npm run typecheck` passent tous
sans erreur ; rendu contrôlé visuellement (Playwright + Chromium headless)
à plusieurs niveaux de zoom.

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Scène plein écran + minimap + légende
│   ├── layout.tsx, globals.css
│   └── api/
│       ├── checkout/route.ts
│       ├── webhooks/stripe/route.ts
│       ├── panels/route.ts
│       ├── panels/[id]/boost/route.ts
│       └── buildings/route.ts
├── components/scene/         # SceneCanvas, Minimap, Legend (React, 'use client')
├── three/
│   ├── engine/                # SceneManager (orchestrateur), CameraController,
│   │                           # PostProcessing, constants, sceneEvents (bus scène -> UI)
│   ├── objects/                # Factories de mesh : bâtiment, bâtiment central, panneau, sol
│   ├── shaders/                # CRTShader (post-traitement)
│   └── placeholders/           # Données mock + layout/sizing temporaires
│                                # (à remplacer par l'algo de placement réel)
└── lib/db/
    ├── schema.ts               # Tables Drizzle `panels` / `buildings`
    └── client.ts                # Client neon-http
```

`SceneManager` est le seul point d'entrée du moteur 3D : un renderer, une
scène, une caméra. Chaque sous-système (post-processing, caméra, objets)
est un module séparé qu'il orchestre, pour rester extensible sans
refonte (LOD, instancing, atlas de textures — voir brief) quand le vrai
contenu (paiements, scraping) arrivera.

### Pourquoi pas react-three-fiber

Le brief demande un contrôle fin et peu courant : un unique
`EffectComposer` custom, du `InstancedMesh` par typologie de bâtiment, un
atlas de texture dynamique, un diff explicite des panneaux visibles par
frame. Du Three.js "vanilla" dans une classe dédiée (`SceneManager`) rend
ce contrôle direct plutôt que de le négocier à travers une couche
déclarative React — plus simple à raisonner ici vu ce qui est demandé.

## Prochaines étapes

Flow de paiement complet : Stripe Checkout (`/api/checkout`), webhook de
confirmation + scraping des métadonnées du site + calcul de taille
(`/api/webhooks/stripe`), diffusion temps réel (Pusher/Ably) des nouveaux
panneaux, boost (`/api/panels/:id/boost`), notification email (Resend),
LOD réel piloté par `GET /api/panels?category=&viewport=&zoom=`,
déblocage des bâtiments (`GET /api/buildings`), personnages/oiseaux en
sprites billboard.
