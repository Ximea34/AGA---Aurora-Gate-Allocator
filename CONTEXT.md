# AGA — Aurora Gate Allocator — Contexte de reprise

Document de synthèse pour reprendre le projet avec une autre IA (locale ou
non) sans avoir à relire tout l'historique de conversation. Dernière mise à
jour : 2026-07-26, branche `DEV`.

## But du projet

Logiciel qui attribue automatiquement des portes (gates) aux aéronefs à
l'arrivée sur un aérodrome, pour les contrôleurs du réseau de simulation
**IVAO**, en utilisant le connecteur **Third Party** du client ATC **Aurora**
(même principe que le projet CoLOA). Usable en position de contrôle ou en
observateur. Pas un outil aéronautique réel — contexte simulation/loisir.

Dépôt GitHub : https://github.com/Ximea34/AGA---Aurora-Gate-Allocator
(branche `DEV` poussée, pas encore de `BETA`/`MAIN`).

## Workflow Git du projet

- `DEV` : développement actif (branche courante).
- `BETA` : releases beta, publiées sur le canal de mise à jour Beta.
- `MAIN` : version stable, publiée sur le canal de mise à jour Stable.
- Pas de push automatique vers `MAIN`/`BETA` sans validation explicite de
  l'utilisateur.
- Publier une version = tagger `vX.Y.Z` (stable, depuis `MAIN`) ou
  `vX.Y.Z-beta.N` (beta, depuis `BETA`) et pousser le tag — le workflow
  `.github/workflows/release.yml` build et publie automatiquement la
  Release GitHub (voir section Build & distribution).

## Versioning : `C.X.W.Z`

- `C` version majeure stable, `X` version mineure, `W` ajout mineur de
  fonctionnalité, `Z` correctif de bug.
- `package.json.version` reste en semver 3 chiffres (`C.X.W`, requis par
  npm/electron-builder).
- Le 4ᵉ chiffre `Z` vit dans `package.json.build.buildVersion` (métadonnées
  du binaire Windows de l'installeur). Les deux doivent rester
  synchronisés sur les 3 premiers chiffres.
- Version actuelle : `1.1.0` / `1.1.0.0`.
- **Piège découvert (corrigé en 1.0.3)** : `fs.cpSync` ne peut pas copier
  un dossier situé à l'intérieur de `app.asar` (Electron ne patche que la
  lecture simple, pas la copie récursive). `config/`/`GATES/` sont donc
  livrés via `extraResources` (fichiers loose dans `resources/`, hors
  asar) et exclus du glob `files` de l'asar. `electron/user-data.js` lit
  depuis `process.resourcesPath` quand `app.isPackaged`, sinon le repo en
  dev. Ce bug faisait planter TOUTE installation vraiment neuve (ENOENT
  au premier lancement) — masqué jusque-là uniquement parce que la
  machine de dev avait déjà un config APPDATA cree par des runs non
  packages anterieurs.
- **Piège important** : `electron-updater` ne compare que les 3 premiers
  chiffres (`package.json.version`) pour détecter une mise à jour — le `Z`
  de `buildVersion` seul est invisible pour l'auto-update. Un correctif de
  bug doit donc toujours bumper `W` (3ᵉ chiffre npm) en plus de `Z`, sinon
  les utilisateurs déjà installés ne verront jamais la mise à jour proposée.

## Le connecteur Aurora Third Party

Documentation complète dans [docs/aurora-connector.md](docs/aurora-connector.md).
Résumé :

- TCP ASCII, port **1130**, paquets `#CMD;arg1;arg2;...\r\n`.
- `#TR` → liste des callsigns en range.
- `#FP;CALLSIGN` → plan de vol (champs : dep ICAO, arr ICAO, alternate,
  ETD, type avion ICAO, wake turb, ..., à l'indice `arrivingIcao` = champ 2).
- `#TRPOS;CALLSIGN` → position (21 champs). Les champs clés :
  - 3 = altitude, 4 = speed, 5 = latitude, 6 = longitude, 14 = onGround
    (`'1'`/`'0'`), **17 = currentGate** (label affiché par Aurora),
    21 = assignedGate (géré par Aurora lui-même, pas utilisé par nous).
- `#BAY` → liste des offres de bay ; répond `@BAY;No data in bay` (préfixe
  `@` non documenté) quand vide — géré dans le parser.
- Aurora ne fournit les données de `currentGate` que pour l'aéroport dont le
  layout est chargé/contrôlé activement dans la session (confirmé en test
  live).
- Pas de commande d'écriture d'attribution de porte identifiée dans la doc
  officielle (le mécanisme d'offre/PM du Baylist n'a jamais été testé — et
  n'est plus nécessaire : on n'écrit pas dans Aurora, voir plus bas).

## Décision produit clé : pas d'écriture vers Aurora

Le logiciel **ne modifie jamais** l'état d'Aurora. Il lit le trafic, calcule
des suggestions, et le contrôleur choisit — l'attribution vit uniquement côté
AGA (`AssignmentStore`). Le rapprochement avec la réalité se fait par
cross-check géométrique (voir plus bas), pas en écrivant dans Aurora.

## Architecture du moteur (`src/`)

Tous les modules sont du Node pur, testables en CLI, sans dépendance à
Electron — réutilisés tels quels par `electron/engine.js`.

- `src/parser.js` — parse les lignes brutes Aurora (`parseLine` classifie en
  `traffic` / `trpos` / `flightplan` / `baylist` / `error` / `unknown`).
- `src/connection.js` — `AuroraConnection` (EventEmitter autour du socket
  TCP), émet les events typés ci-dessus.
- `src/aircraft-store.js` — `AircraftStore`, état en mémoire
  callsign → `{ flightPlan, position }`.
- `src/aurora-client.js` — CLI manuel (tape des commandes au clavier), utile
  pour explorer le protocole.
- `src/run-aggregator.js` — CLI agrégateur avec table console (trafic,
  occupation, séquence d'atterrissage) + commandes `assign`/`clear` au
  clavier. Outil de test/debug indépendant de l'UI.

### `src/gates/` — moteur d'allocation

- `geo.js` — conversion DMS→décimal, distance haversine (mètres et NM).
- `gts-loader.js` — parse les fichiers `.gts` (coordonnées des postes,
  format `CODE;ICAO;LAT_DMS;LON_DMS;`).
- `airport-loader.js` — `loadAirport(icao)` fusionne `.gts` +
  `config/airports/<icao>.yaml` → `{ icao, name, referencePoint,
  finalApproachCriteria, gates: Map<id, {lat, lon, closed, wakeCategory,
  group, groupLabel, airlines, linkedGates}> }`. `loadAircraftWakeCategories()`
  charge `config/aircraft-wake-categories.yaml`.
- `occupancy.js` — `crossCheckGate(aircraft, airport)` : confirme la
  `currentGate` d'Aurora seulement si la position lat/lon de l'avion est à
  moins de **50 m** des coordonnées du poste (sinon ignoré). `buildOccupancy
  (aircraftList, airport, assignments?)` construit la map des postes
  indisponibles : occupés (physiquement), bloqués (voisinage), ou réservés
  (attribution contrôleur en attente — libérée automatiquement si l'avion se
  gare ailleurs, cf. état `WRONG_GATE`).
- `approach.js` — `isOnFinalApproach(aircraft, airport)` : dans le rayon +
  sous l'altitude configurés (purement géométrique, ne regarde pas
  `onGround`).
- `suggest.js` — `suggestGates(aircraft, airport, occupancy, wakeCategories)`
  filtre les postes libres compatibles (compagnie **prioritaire** sur
  catégorie de voilure), triés par pertinence.
- `assignment-store.js` — `AssignmentStore`, attribution contrôleur
  callsign→gateId, réassignable à tout moment.
- `state.js` — `computeAircraftState(aircraft, airport, assignedGateId)` →
  exactement 3 états :
  - `TAXI` : au sol, en mouvement (speed≠0), pas de gate reconnue.
  - `WRONG_GATE` : arrêté à une porte ≠ attribution contrôleur.
  - `CORRECT` : arrêté à la porte attribuée.
  - `null` sinon (en vol, pas d'attribution, etc.)
- `sequence.js` — `buildLandingSequence()` : trafic arrivant trié par
  distance puis altitude (plus proche + plus bas en premier), exclut les
  `CORRECT`.
- `dashboard.js` — `buildDashboard(aircraftList, airport, assignments,
  wakeCategories)` : construit les 3 buckets pour l'UI :
  - `pending` : pas de porte attribuée (suggestions incluses).
  - `taxiAssigned` : attribution faite, pas encore stationné.
  - `parked` : arrêté à une porte (état `CORRECT`/`WRONG_GATE`/`UNASSIGNED`).
  - **Important** : les suggestions sont calculées pour TOUS les avions (pas
    seulement `pending`), en excluant l'avion lui-même de l'occupation
    (sinon il se bloquerait sa propre porte). C'était un bug corrigé.

## Config aéroport (`config/`)

- `config/aircraft-wake-categories.yaml` — table générique (réutilisable
  pour d'autres aéroports) type ICAO → catégorie OACI (A-F), basée sur les
  envergures publiques. Non exhaustive, à compléter au besoin.
- `config/airports/lfll.yaml` — config LFLL (Lyon Saint-Exupéry) :
  - `reference_point` (ARP) : 45°43'32"N 005°04'52"E.
  - `final_approach_criteria` : `radius_nm` / `max_altitude_ft` — **valeurs
    actuellement à 20 Nm / 7000 ft pour les tests** (normal : 3 Nm / 2000 ft,
    commenté dans le fichier — à remettre avant toute utilisation réelle).
  - `closed_gates` : tous les postes A + B12/B14/B16.
  - `wake_categories` : catégorie max par poste (source AIP France AD 2 LFLL
    MIA TEXT 01-04, via `GATES/GATE_WAKE.txt`).
  - `gate_blocking` : relation **directionnelle** poste occupé → postes
    neutralisés (PAS symétrique). Ex: `B62: [B61, B63]` mais `B61` seul ne
    bloque rien. Table fournie par l'utilisateur, entièrement remplacée une
    fois (voir historique de conversation) — ne jamais réintroduire une
    logique de clique/symétrie.
  - `gate_groups` : compagnies autorisées par groupe de postes (Terminal 1
    postes C, Terminal 1 postes D, gros porteurs C82/D22, cargo J11-J19,
    aviation générale G). **Terminal 2 et Terminal 3 restent en groupe
    `unassigned`** (ouverts à toute compagnie, filtre wake uniquement) —
    le mapping poste physique ↔ Terminal 2/3 n'est dans aucun fichier
    source fourni. À compléter si l'info est trouvée.
  - Quelques codes ICAO compagnie sont incertains malgré tout (marqués
    "à confirmer" en commentaire : Enter Air = `ENT`, Chalair = `CLG`,
    Nouvelair volontairement omis).
- `GATES/lfll.gts`, `GATES/GATE_WAKE.txt`,
  `GATES/LFLL_compagnies_terminal_porte.txt` — sources brutes fournies par
  l'utilisateur, ne pas modifier (ce sont les fichiers de référence).

## Interface Electron (`electron/`, `renderer/`)

- `electron/engine.js` — `GateEngine` (EventEmitter), encapsule
  `AuroraConnection` + `AircraftStore` + `AssignmentStore` + polling
  (`#TR` toutes les 10s, `#TRPOS` toutes les 5s) + `buildDashboard()`.
  Émet `'log'`, `'status'`, `'update'`.
- `electron/main.js` — process principal, fenêtre principale frameless +
  fenêtre debug frameless séparée (ouverte à la demande), IPC via
  `ipcMain.handle`.
- `electron/preload.js` — `contextBridge` expose `window.aga.*` (connect,
  disconnect, assign, clear, getSnapshot, onStatus, onUpdate, windowAction,
  openDebugWindow, onDebugLog/History, listAirports/setAirport,
  simulate/simulateRemove/simulateClear/getSimOptions,
  getUpdateStatus/setUpdateChannel/checkForUpdate/downloadUpdate/
  installUpdate/onUpdateState). Aucun accès Node direct côté renderer.
- `electron/user-data.js` — copie `config/`/`GATES/` vers APPDATA au
  premier lancement (voir section Build & distribution).
- `electron/settings.js` — persiste `{ updateChannel }` dans
  `APPDATA/settings.json`.
- `electron/updater.js` — `AppUpdater` (EventEmitter), enveloppe
  `electron-updater`, émet `'state'` (idle/checking/available/downloading/
  downloaded/error).
- Fenêtre debug (`renderer/debug.html`/`debug.js`) : en plus des logs bruts,
  contient le **simulateur de trafic** (injecte des aéronefs fictifs via
  `GateEngine.simulateAircraft()` — distance/cap/altitude/vitesse OU poste
  physique exact) et un tableau d'occupation des postes en direct.
- `renderer/index.html` + `renderer.js` — UI principale :
  - Titlebar custom (drag zone + boutons debug/pin/minimize/maximize/close
    en SVG trait fin).
  - Toolbar connexion (host/port + bouton connecter/déconnecter + point de
    statut).
  - **3 colonnes** : Pending / Roulage (porte assignée) / Stationnés.
  - **Pas de modale** : chaque ligne affiche directement des **puces de
    porte cliquables** (suggestion principale en surbrillance accent, porte
    assignée en fond plein, alternatives en contour). Un clic = assignation
    immédiate (`window.aga.assign`), pas de menu à ouvrir. Un petit bouton
    crayon révèle une saisie manuelle inline (pas un popup) pour les cas non
    couverts par les suggestions.
  - Ligne fraîchement apparue → flash `--accent-dim` puis fondu (0.9s,
    désactivé si `prefers-reduced-motion`).
- `renderer/debug.html` + `debug.js` — fenêtre de logs bruts du moteur en
  direct (alimentée par les mêmes events `'log'` que l'ancien CLI
  `run-aggregator.js`).
- `renderer/styles.css` — design system complet en variables CSS, voir
  section suivante.

### Direction artistique (déjà implémentée, à respecter pour toute nouvelle UI)

Outil pro dense façon ATC/ops, dark uniquement :

- Palette : `--bg #0d0f12`, `--surface #14171b`, `--surface-2 #1a1e23`,
  `--border #262b31`, `--text #d7dbe0`, `--text-faint #6b7280`, accent
  unique `--accent #34d3c8` (+ `--accent-dim` translucide), 3 couleurs
  sémantiques seulement : `--ok #3ecf6d`, `--warn #f5a623`, `--err #ef4444`.
- Deux polices : `--font-ui` (sans-serif, labels/UI) et `--font-data`
  (monospace, toute donnée technique — callsigns, coordonnées, portes,
  altitudes).
- Labels de champ : uppercase + letter-spacing + `--text-faint`, jamais de
  gras.
- Bordures 1px partout, jamais d'ombre/gradient, radius 3-6px constant.
- Boutons : `.btn-ghost` (transparent → hover accent+surface-2) et
  `.btn-accent` (contour accent → hover fond plein accent + texte
  `--accent-ink` très sombre).
- Pattern de signalement d'anomalie : bordure gauche 2-3px colorée
  (`.row.ok` / `.row.err`) — utilisé pour `CORRECT`/`WRONG_GATE`.
- `.dot` 7px pour les indicateurs d'état (statut connexion).
- Scrollbar custom fine 8px.
- `user-select: none` par défaut, `text` explicite sur les données
  copiables (callsigns, logs debug).

## Build, distribution & mises à jour

- `npm start` — lance l'UI Electron (mode dev : lit `config/`/`GATES/` du repo).
- `npm run cli` — client TCP manuel (debug protocole).
- `npm run aggregator` — agrégateur console sans UI (avec commandes
  `assign CALLSIGN GATE` / `clear CALLSIGN` au clavier).
- `npm run dist` — build `electron-builder` → **installeur NSIS** Windows
  (`dist/AGA-Aurora-Gate-Allocator-Setup-<version>.exe`, gitignored). Install
  par utilisateur (pas d'admin requis). Génère aussi `latest.yml`
  (ou `beta.yml` selon le canal) nécessaire à `electron-updater`.
- `npm run publish` — comme `dist` + upload vers les Releases GitHub
  (nécessite `GH_TOKEN`, utilisé automatiquement par le workflow CI).

**Config externalisée (`electron/user-data.js`)** : au premier lancement de
l'app packagée, `config/` et `GATES/` sont copiés vers
`app.getPath('userData')` (`%APPDATA%\AGA - Aurora Gate Allocator\` sous
Windows) si absents, puis `airport-loader.js` lit/écrit depuis ce dossier
via `setDataRoot()`. Les CLI de dev n'appellent jamais `setDataRoot()` donc
continuent de lire le repo. Ça permet à l'utilisateur d'éditer sa config
sans droits admin et sans qu'une mise à jour l'écrase.

**Mises à jour automatiques (`electron/updater.js` + `settings.js`)** :
`electron-updater` pointé sur les Releases GitHub du repo
(`aero.ivao.aga` / owner `Ximea34`, repo `AGA---Aurora-Gate-Allocator`).
Deux canaux persistés dans `%APPDATA%\...\settings.json` :
- `latest` (Stable) → Releases publiées depuis `MAIN`.
- `beta` (Beta) → Releases (prerelease) publiées depuis `BETA`.

Téléchargement/installation **manuels** (pas d'auto-download silencieux) :
panneau dans la titlebar (bouton avec pastille accent si MAJ dispo) →
Vérifier / Télécharger / Redémarrer et installer. Désactivé hors app
packagée (`app.isPackaged` false en `npm start`).

**Publication d'une version** : bump `version`/`build.buildVersion` dans
`package.json`, commit, puis `git tag vX.Y.Z` (stable, depuis `MAIN`) ou
`vX.Y.Z-beta.N` (beta, depuis `BETA`), `git push origin <branche> <tag>`.
Le workflow [.github/workflows/release.yml](.github/workflows/release.yml)
(déclenché sur push de tag `v*.*.*`) build et publie automatiquement la
Release GitHub, canal déduit de la présence de `-beta` dans le tag.
Testé localement (`npm run dist`) : génère bien l'installeur + `latest.yml`
avec hash/taille corrects — la partie GitHub Actions elle-même n'a pas
encore été déclenchée en réel (pas de tag poussé à ce stade).

## Points ouverts / à reprendre

1. **Seuils de test à remettre** : `config/airports/lfll.yaml` a
   `radius_nm: 20` et `max_altitude_ft: 7000` (normal : `3` / `2000`) — remis
   à leur valeur réelle avant toute utilisation en conditions normales.
2. **Terminal 2 / Terminal 3** : mapping poste physique ↔ terminal manquant
   dans les sources fournies. Actuellement en groupe `unassigned` (ouvert,
   filtre wake seul). Concerne les aires B/E/K/L/M/N.
3. **Codes ICAO compagnie incertains** : Enter Air (`ENT`), Chalair
   (`CLG`), Nouvelair (omis) — à vérifier.
4. **`config/aircraft-wake-categories.yaml`** non exhaustif : tout type
   ICAO absent déclenche un warning explicite dans les suggestions plutôt
   que de deviner — à enrichir au fil des types rencontrés.
5. **Icône de l'app** : electron-builder utilise l'icône par défaut
   Electron (aucune icône custom définie). À faire si besoin d'une identité
   visuelle.
6. **Pas de tests automatisés** (unit tests) — toute la validation faite
   jusqu'ici est manuelle (scripts `node -e` ponctuels + tests en live
   contre une session Aurora réelle). À considérer si le projet grossit.
7. **BETA/MAIN pas encore créées sur GitHub** — seule `DEV` existe côté
   remote au moment de la rédaction. La sortie de la première version MAIN
   (merge + tag `v1.0.0` + premier run réel du workflow de release) reste à
   faire.
8. **Pas de signature de code** : l'installeur n'est pas signé, Windows
   SmartScreen affichera un avertissement "éditeur inconnu" à
   l'installation (accepté comme compromis pour l'instant, cf. décision
   utilisateur).
9. **Bug de déconnexion Aurora non reproduit** : un cas de "connecte puis
   fermeture immédiate" a été observé une fois (voir historique de
   conversation), corrigé partiellement (confusion `$ERR` protocole vs
   erreur socket réelle, cause du `[erreur] undefined`) et instrumenté avec
   des logs bruts verbeux (`GateEngine.verbose = true`), mais la cause de la
   fermeture immédiate elle-même n'a pas été identifiée avec certitude (non
   reproduite en isolation hors Electron). À surveiller.
10. **Un seul aéroport configuré** (LFLL), mais le sélecteur de terrain
    existe déjà côté UI (toolbar) et liste automatiquement tout aéroport
    ayant un `config/airports/<icao>.yaml` + `GATES/<icao>.gts` — ajouter un
    aéroport ne nécessite aucun changement de code.
