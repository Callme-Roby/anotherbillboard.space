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

- Skyline central : cinq tours de hauteurs variées, **chacune posée
  directement au sol sur son propre pied** (pas de podium partagé) **et à
  une profondeur (z) différente** — pas toutes alignées sur la même ligne
  face caméra (`SKYLINE` dans `createCentralBuilding.ts`). Les deux
  effets recherchés : que chaque tour se lise clairement comme un
  bâtiment à part plutôt qu'un seul bloc fusionné, et une vraie sensation
  de profondeur/parallaxe entre elles en zoomant — pas seulement une
  silhouette qui varie en hauteur.
  - **Chaque tour est un empilement de volumes** (socle / fût / couronne)
    et non une boîte unique (`createSkyscraper.ts`), habillé de fenêtres,
    d'un mât d'antenne à pointe lumineuse et de spots de toiture. Tout
    cet habillage est de la géométrie *ligne*, rassemblée en exactement
    deux `LineSegments` par bâtiment (un sombre, un clair) quel que soit
    le nombre de fenêtres ou de spots : le détail coûte des sommets, pas
    des draw calls — c'est ce qui empêche "ajouter du détail" de devenir
    "ajouter du coût par frame". C'est aussi ce qui survit à la basse
    résolution interne de la scène (voir post-traitement) : un tiret d'un
    texel se lit encore comme une fenêtre, là où une petite boîte ombrée
    tournerait en bouillie. Densité des grilles de fenêtres réglée à
    l'écran et pas sur le papier : des tirets trop longs se lisaient
    comme des corniches d'étage plutôt que comme des fenêtres.
  - **Les cinq premières positions du classement ont chacune leur tour**,
    de gauche à droite rangs 4 / 3 / 1 / 2 / 5 — la meilleure place au
    centre et la plus haute, les autres redescendant vers les côtés, pour
    que le classement se lise dans la silhouette avant même de lire un
    chiffre (`RANK_SLOT_PLACEHOLDERS`, et `CENTRAL_RANKING_SIZE` côté
    `GET /api/buildings`).
  - **Aucune de ces cinq n'est accrochée de la même façon**
    (`createScreenRig.ts`) — c'est ce qui sépare un pâté de maisons façon
    Times Square de cinq rectangles alignés :
    - `wrap` — l'image tourne le coin du bâtiment sur la face latérale
      (rangs 1 et 4) ;
    - `banner` — ruban vertical en portrait le long du fût (rang 2) ;
    - `stack` — écran principal avec son bandeau défilant suspendu
      dessous (rang 3) ;
    - `crown` — écran surélevé sur pieds au-dessus du toit, incliné vers
      l'arrière (rang 5).
    Chacun ajoute ses propres détails d'écran : cadre/bezel, liseré LED,
    entretoises de fixation vers le mur. Tout reste des plans texturés
    plats (`createPanel.ts`) : les vrais écrans issus de la base viendront
    se poser dans ces supports sans cas particulier par forme.
  - Ces écrans **débordent volontairement** la largeur de la tour qui les
    porte — l'inverse des panneaux au sol (voir plus bas), qui restent
    petits : décrocher un top 5 doit se voir de loin comme une vraie
    récompense, pas un détail qu'il faut chercher. Le rang 4 a dû être
    remonté du socle au fût : la rangée de panneaux au sol se tient à
    z=9, devant tout le cluster, et masquait ce qui était derrière elle —
    constaté à l'écran. Conservé là même après la réduction de taille des
    panneaux au sol (leur rangée ne dépasse plus ~y=1,4) : le wrap se lit
    de toute façon mieux sur les fenêtres du fût que sur un socle nu.
  - **Sommet rotatif** au-dessus de la tour la plus haute : un mât porte
    4 écrans disposés en croix qui tournent lentement ensemble autour de
    son axe (`createRotatingSummit`, `SceneManager` fait avancer la
    rotation chaque frame). Trois passent des annonces du site ; le
    quatrième est l'écran bonus du rang 1, **en plus** du wrap qu'il a
    déjà sur le fût en dessous (`ANNOUNCEMENT_PLACEHOLDERS`) — le
    privilège visible de la première place, vu sous tous les angles à
    mesure que le rotor tourne. `ROTOR_RADIUS` est vérifié contre
    `SKYLINE` : un écran de largeur w centré à ce rayon balaie
    √(r² + (w/2)²) ≈ 2,22 autour du mât, contre ≈ 2,77 pour la surface de
    tour voisine la plus proche. `CAMERA_LOOK_AT.y` est calé en
    conséquence (le sommet culmine maintenant à ~y=10,6, revérifié à
    l'écran).
  - Encore statique : ces emplacements affichent des données de
    démonstration, rien côté scène ne consomme encore
    `GET /api/buildings` — la disposition est prête, le branchement sur
    le vrai classement reste à faire.
- Sol + grille, panneau signature "ROBY" fixe et excentré.
- Caméra perspective à *rig* fixe (position/visée de base posées une
  fois), vue de face au niveau du sol (pas d'angle plongeant) :
  - Le scroll (ou le pincement à deux doigts sur tactile) fait varier
    `camera.zoom` — sur `PerspectiveCamera`, mathématiquement équivalent
    à resserrer le FOV à position fixe (vérifié dans le code source de
    three.js : `tan(FOV effectif/2) = tan(FOV de base/2) / zoom`, pas une
    simple division d'angle — une confusion entre les deux a d'ailleurs
    provoqué un vrai bug pendant le développement, voir plus bas), donc
    un vrai zoom optique plutôt qu'un dolly qui rapproche la caméra. Un
    FOV de base modéré (30°) garde un peu de vraie profondeur/perspective
    sans que ce soit prononcé — l'orthographique pur essayé d'abord
    rendait trop plat.
  - Le zoom arrière minimum s'adapte au ratio d'aspect de l'écran plutôt
    que d'être une constante fixe (`CameraController.computeAspectMinZoom`) :
    sur un écran étroit/haut (mobile), le FOV horizontal effectif à un
    même niveau de zoom est plus étroit qu'en large desktop (même FOV
    vertical, ratio d'aspect plus petit), ce qui coupait les côtés de la
    scène en dézoomant au maximum sur mobile. Résolu en calculant, à
    chaque changement de ratio d'aspect (y compris une rotation d'écran
    en cours de session), le zoom minimum qui garde `CAMERA_OVERVIEW_HALF_WIDTH`
    visible — évalué à la bonne profondeur (`CAMERA_OVERVIEW_CONTENT_Z`,
    celle du panneau signature) et non à celle, arbitraire, du plan de
    visée : la perspective fait qu'un contenu plus proche de la caméra
    occupe plus de largeur écran par unité de monde, une confusion entre
    les deux a produit un vrai bug en développement (le calcul semblait
    juste sur le papier mais le panneau signature restait hors-cadre —
    détecté en vérifiant directement si on le voyait à l'écran, pas en
    se fiant à la formule).
  - **Glisser-déplacer (drag-to-pan)** : la souris (clic-glisser) ou un
    seul doigt au tactile (deux doigts reste réservé au pincement/zoom)
    translate le *rig* caméra (position + visée ensemble, donc la
    direction de vue ne change jamais — un mouvement de type
    truck/pedestal, pas une orbite) pour se déplacer dans toute la scène,
    avec un déplacement borné (`CAMERA_PAN_BOUNDS`) pour ne pas partir
    dans le vide. Amorti différemment du zoom : le glisser suit le
    pointeur au pixel près (`CameraController.applyDragDelta`) plutôt que
    d'amortir en douceur, pour rester "collé" au doigt/à la souris.
- Fond de scène blanc cassé (`BACKGROUND_COLOR`, `#f3efe6`) — sol et ciel
  compris (`createGround.ts`, même couleur exactement, pas juste
  "assortie" à la main) : ils se lisent comme une seule surface continue,
  la grille du sol (recolorée sombre pour rester lisible sur fond clair —
  l'inverse de la version fond-sombre initiale) et les contours noirs de
  chaque forme portent maintenant toute la structure visuelle. Bâtiments/
  panneaux eux-mêmes volontairement inchangés (hors du périmètre demandé
  jusqu'ici).
- Panneaux au sol montés sur une vraie structure de panneau publicitaire
  (`createGroundBillboard.ts`) plutôt qu'un plan posé à même le sol :
  deux poteaux contreventés en croix avec leurs semelles, un cadre/bezel
  autour de l'image, une passerelle d'entretien suspendue dessous et
  trois rampes d'éclairage en col de cygne au-dessus.
  - **C'est l'objet le plus soigné de la scène parce que c'est celui qui
    apparaît le plus** — un par achat, des dizaines à l'écran à la fois.
    D'où le choix inverse de celui des bâtiments : ici tous les panneaux
    partagent **exactement la même** structure, seule la largeur suit le
    panneau porté et la hauteur des poteaux est fixe. Une rangée de
    panneaux à la même hauteur se lit comme une place ; à hauteurs
    dépareillées, comme un accident.
  - Toute la structure tient dans **un seul `LineSegments`**, la couleur
    chaude des têtes de lampe étant portée par un attribut de couleur par
    sommet plutôt que par un second matériau. C'est ce qui permet de la
    détailler autant : 2 draw calls par panneau (structure + image) quelle
    que soit la quantité de détail ajoutée, là où l'ancienne version à
    deux poteaux-boîtes en coûtait déjà 5 pour bien moins. Les couleurs
    sont poussées telles quelles depuis `THREE.Color`, dont les valeurs
    sont déjà dans l'espace linéaire de travail du renderer (vérifié dans
    le `ColorManagement` de three.js) — l'espace attendu pour un attribut
    de couleur.
  - Une tête de lampe dessinée seulement comme une avancée vers l'avant
    est un segment pointé droit sur une caméra frontale : elle se projette
    sur ~1 pixel et les lampes disparaissent. Constaté sur une capture
    rapprochée, corrigé en dessinant la tête comme une barre *en travers*
    de la vue.
- Taille des panneaux au sol réduite une nouvelle fois (courbe
  montant→taille dans `lib/economy.ts` et `placeholders/sizing.ts`,
  panneau signature dans `mockPanels.ts`, hauteur des poteaux dans
  `createGroundBillboard.ts` — tout redescendu ensemble) : le plus grand
  panneau de la scène de démo passe sous le quart de la *plus petite*
  tour et au dixième de la plus haute, soit à peu près le rapport réel
  d'un panneau publicitaire à un immeuble. Ils cachaient les bâtiments et
  rivalisaient visuellement avec eux, ce qui vidait de son sens la
  récompense "position haute dans le classement = visible sur un
  bâtiment" — un panneau au sol énorme rendait un écran de bâtiment moins
  intéressant, pas plus. Les bâtiments doivent rester l'élément qui
  domine visuellement, les panneaux au sol un détail qu'on découvre en
  zoomant.
- En-tête (`Header.tsx`), haut-centre : nom du site, même traitement HUD
  compact que la légende/minimap plutôt qu'une vraie barre de navigation
  (rien à y mettre sur un site one-page) — seul élément du HUD qui n'est
  pas `aria-hidden`, puisque c'est le seul vrai contenu/titre de la page
  (`SITE_NAME`, partagé avec le `<title>` dans `layout.tsx` pour que les
  deux ne puissent pas diverger).
- Post-traitement global unique (`EffectComposer` + `RenderPass` + un
  `ShaderPass` custom `CRTShader` + `OutputPass`) : rendu interne basse
  résolution + upscale `NEAREST` (pixel/aliasing façon PS1), scanlines,
  vignette, aberration chromatique, courbure d'écran (barrel distortion
  façon verre bombé de tube cathodique — l'image est échantillonnée de
  plus en plus loin du centre en approchant des coins, chute en carré de
  la distance) et animation (scanlines qui dérivent lentement + léger
  flicker de luminosité — deux sinusoïdes à fréquences non multiples
  l'une de l'autre pour ne pas lire comme un pouls mécanique, amplitude
  volontairement faible pour rester un effet ressenti plutôt qu'un
  clignotement — voir `CRT_FLICKER_STRENGTH`), plutôt qu'un filtre figé.
  - Tout ce qui tombe hors de l'écran courbé rend dans `uBezelColor`
    (= `BACKGROUND_COLOR`, pas noir) plutôt qu'un bord étiré/collé, pour
    que la courbure se fonde dans la scène au lieu d'ajouter un cadre qui
    détonne avec le reste.
  - Pixelisation assouplie (`INTERNAL_RESOLUTION_SCALE` remonté) et
    surtout compensée par le zoom caméra (`PostProcessing.internalResolution`) :
    cette résolution interne était fixe par rapport au *viewport* mais
    indépendante du zoom caméra, donc un même contour couvert par de
    moins en moins de texels en dézoomant (la géométrie rétrécit à
    l'écran, pas la grille de pixels) — reporté directement comme des
    contours qui "grossissent" visuellement en dézoomant. Compensé en
    augmentant la résolution interne à mesure que le zoom diminue
    (partiellement — racine carrée, plafonnée — une compensation 1:1
    complète a été essayée et a quasiment fait disparaître la
    pixelisation au dézoom max, ce qui n'était pas non plus le but,
    vérifié à l'écran et pas juste sur le papier), recalculée à chaque
    frame mais le redimensionnement du render target réel n'a lieu que
    si la résolution arrondie change vraiment (sinon coûteux/risque de
    saccade à chaque frame d'un zoom en cours).
  - Contours plus fins (`INTERNAL_RESOLUTION_SCALE` remonté encore, 0,42
    → 0,6) : le contour noir (`EdgesGeometry`) de chaque forme fait
    ~1 texel de large quelle que soit cette valeur (WebGL ignore en
    pratique `LineBasicMaterial.linewidth` sur la plupart des
    plateformes), donc c'est cette résolution interne — pas le matériau
    du trait — qui détermine sur combien de vrais pixels écran ce texel
    est étalé à l'agrandissement, et donc l'épaisseur perçue du trait.
  - Scanlines masquées au fond plat de la scène : c'est un motif
    purement écran (`uv.y`), indépendant de ce qui est réellement rendu
    — sans rien de plus il bande aussi le ciel/sol vides, remonté
    directement comme des "lignes horizontales sur toute la page en
    fond". Le sol et le ciel sont tous les deux exactement
    `BACKGROUND_COLOR` (`createGround.ts`) : comparer la couleur
    échantillonnée à cette même référence (`uBezelColor`, déjà utilisée
    pour le bezel de la courbure) sert donc aussi de test "fond vide ou
    vraie géométrie", adouci en `smoothstep` pour ne pas ajouter un bord
    de masque lui-même crénelé — vérifié en isolant une zone de ciel pur
    à l'écran (aucune bande) par opposition à la grille du sol, qui elle
    continue d'en afficher (un vrai élément de l'environnement, pas du
    vide).
  - Vignette masquée par ce même `isContent`, pour la même raison plus
    une autre spécifique à cet effet : non masquée, elle assombrissait le
    fond "vide" (ciel/sol) à l'intérieur de l'écran courbé à mesure qu'on
    approche des bords, alors que juste à côté, hors de l'écran courbé,
    le bezel (`uBezelColor`, retour anticipé du shader avant tout calcul
    de vignette) restait à pleine luminosité — une coupure visible pile à
    la frontière de la courbure, remontée avec une capture montrant une
    fine bande plus claire au raccord. Masquer met fond plat et bezel au
    même niveau (un seul remplissage continu, non ombré) sans toucher à
    la courbure elle-même ni à l'assombrissement réel sur la géométrie
    proche des bords — vérifié en dézoomant au maximum (la frontière de
    courbure est alors la plus visible) : plus aucune coupure au raccord,
    ni au bord haut ni au bord bas, et la vignette continue d'assombrir
    les tours proches des bords de l'écran.
- Minimap (bas-gauche) et légende (bas-droite), mises à jour hors du
  cycle de rendu React (event bus + DOM direct, pas de re-render à
  chaque frame de scroll).

### Mobile / tactile

- Zoom/déplacement tactiles (pincement à deux doigts, glisser à un doigt)
  en plus de la molette/souris desktop — voir la section caméra plus haut
  pour le détail ; même logique des deux côtés (`CameraController.ts`).
  Transition propre entre les deux gestes tactiles : un 2e doigt qui
  rejoint un glisser en cours bascule en pincement sans saut, et relâcher
  ce 2e doigt reprend le glisser depuis la position *actuelle* du doigt
  restant plutôt que son ancienne position.
- Le blocage du scroll/pull-to-refresh/pinch-zoom du navigateur
  (`touch-action`/`overscroll-behavior: none`) est posé sur le conteneur
  de la scène (`<main>` de `page.tsx`), pas globalement sur `html, body` :
  la valeur *effective* de `touch-action` se calcule en remontant les
  ancêtres de l'élément touché (vérifié dans la spec), donc pas besoin de
  la déclarer sur la racine — ce qui laisse `/panneau/nouveau` (formulaire
  post-paiement) défiler normalement, y compris sur un petit écran avec
  le clavier ouvert.
- `viewport.viewportFit: "cover"` (`layout.tsx`) + variables
  `env(safe-area-inset-*)` (`globals.css`) : les éléments fixes (minimap,
  légende, bouton, modal) se calent contre l'encoche/la barre
  d'accueil au lieu de passer dessous.
- Champs de formulaire en `text-base` (16px) : en dessous, iOS Safari
  zoome automatiquement la page au focus d'un champ — un comportement du
  navigateur, pas un bug applicatif, mais qui casse le layout si on ne
  s'en prémunit pas.
- Cibles tactiles agrandies (~44px, boutons/inputs/checkbox) et modal
  d'achat en `max-h-[90vh] overflow-y-auto` pour rester utilisable sur un
  petit viewport.
- Piège relevé en vérifiant au Playwright sur plusieurs largeurs
  (320-414px) : un élément `fixed` centré en `left-1/2` +
  `-translate-x-1/2` calcule sa largeur *avant* la translation, sur
  l'espace entre le repère des 50 % et le bord droit du viewport (donc la
  moitié de la largeur réelle) — le bouton "Réserver un panneau" passait
  ainsi sur deux lignes sur téléphone étroit et débordait sur la légende.
  Fixé avec `whitespace-nowrap` sur le bouton et une légende qui
  n'affiche que l'essentiel (zoom, glisser) en dessous du breakpoint
  `sm`, le reste ne réapparaissant qu'à partir de `sm:` où la place ne
  manque plus. Le dégagement du bouton au-dessus de la légende a dû être
  réaugmenté (`bottom-24` → `bottom-36`) quand l'entrée "glisser" a été
  ajoutée à la légende — revérifié aux mêmes largeurs à chaque fois plutôt
  que supposé bon.

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

### Chargement par zoom (LOD panneaux)

`GET /api/panels?zoom=` (0 = dézoomé au max, 1 = zoomé au max, même
échelle que `CameraController.normalizedZoom`) fait varier le nombre de
panneaux renvoyés (top-N par montant) entre `BASE_LIMIT` (20, à la vue
d'ensemble par défaut) et `MAX_LIMIT` (200, une fois zoomé à fond) — une
fonction continue du zoom, pas un plafond fixe. Le paramètre existait
déjà côté route mais n'était jamais réellement envoyé par le client
(zoom toujours par défaut à 0, donc toujours `BASE_LIMIT`) — trouvé en
relisant le code, pas rapporté comme un bug ; c'était bien la moitié
"pas encore faite" documentée dans le commentaire de la route.

Côté client (`LivePanels.ts`), écoute l'événement `scene:viewchange` (le
même bus que la minimap) et relance la requête quand le zoom a
suffisamment changé (`ZOOM_REFETCH_THRESHOLD`) — pas à chaque frame
d'un zoom en cours, avec un throttle à bord traînant
(`REFETCH_DEBOUNCE_MS` = 400 ms) : la requête part au plus toutes les
400 ms pendant qu'on zoome en continu, avec la valeur de zoom la plus
récente à ce moment-là, plutôt que d'attendre l'arrêt du geste — pour
que les panneaux se révèlent progressivement pendant qu'on zoome, pas
seulement une fois arrêté. Chaque réponse est réconciliée avec ce qui
est déjà affiché (ajoute les nouveaux, retire ceux qui sortent du
budget) plutôt qu'un simple ajout — vérifié en observant les vraies
requêtes réseau pendant un geste de zoom (`?zoom=0.246` →
`?zoom=0.653` → `?zoom=0.966`), pas en supposant que le code faisait
ce qu'il devait.

C'est un vrai budget (moins de panneaux construits/texturés tant qu'on
n'a pas zoomé) mais toujours pas le vrai LOD du brief : filtrage par
`viewport` (bornes monde actuellement visibles), pas seulement un top-N
global — le paramètre `viewport` existe déjà côté route mais n'est pas
encore utilisé, pareil pour l'atlas de textures et l'instancing prévus
par le brief. Prochaine étape, pas encore faite.

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
│   ├── objects/      # Factories de mesh : volume, gratte-ciel (tiers/fenêtres/antennes), skyline, supports d'écran, panneau (mock + réel), sol
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
