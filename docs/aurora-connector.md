# Connecteur Third Party Aurora — Notes de structure

Source : https://wiki.ivao.aero/en/home/devops/manuals/Aurora-3rd-parties-documentation

Aurora est le client ATC utilisé sur le réseau de simulation IVAO. Le connecteur
"Third Party" expose une API TCP/ASCII permettant à un outil externe (comme AGA)
de dialoguer avec l'instance Aurora d'un contrôleur.

## Transport

| Propriété | Valeur |
|---|---|
| Protocole | TCP |
| Port | 1130 |
| Encodage | ASCII |
| Révision courante | A |

Structure de paquet :

```
[identifiant:1 octet][commande:2-5 octets][;arg1;arg2;...]<CR><LF>
```

- Champs séparés par `;`
- Paquet délimité par `CR/LF`
- Le point-virgule (`;`) est interdit dans le contenu des messages clients

Identifiants :

| Identifiant | Signification | Sens |
|---|---|---|
| `#` | Message de communication | Client ↔ Serveur |
| `$` | Message d'erreur (`@ERR` pour commande inconnue) | Serveur → Client |

## Commandes pertinentes pour l'attribution de portes

### `#BAY` — Liste des bays (offres/attributions)

- Requête : `#BAY` (aucun argument)
- Réponse : `#BAY;<Baylist>`
- Format de la Baylist :
  - Séparateur d'enregistrement : `;`
  - Séparateur de champ : `|`
  - Champs :
    1. Sender
    2. Receiver
    3. Callsign
    4. Text 1
    5. Text 2
    6. Time
    7. State (`0`=créé non envoyé, `1`=offre/révision, `2`=accepté, `3`=rejeté)

### `#LBGTE` — Label gate (affichage de l'attribution)

- Requête : `#LBGTE`
- Réponse : `#LBGTE;CALLSIGN;GATE`

### `#TRPOS` — Position trafic (Traffic Position Record)

- Requête : `#TRPOS;CALLSIGN`
- Réponse : `#TRPOS;CALLSIGN;<Flight position record>`

Champs du Flight Position Record :

| # | Champ |
|---|---|
| 1 | Heading |
| 2 | Track |
| 3 | Altitude |
| 4 | Speed |
| 5 | Latitude |
| 6 | Longitude |
| 7 | SSR set |
| 8 | SSR label |
| 9 | Waypoint label |
| 10 | Altitude label |
| 11 | Speed label |
| 12 | Assumed station |
| 13 | Next station |
| 14 | On ground |
| 15 | Is selected |
| 16 | Was selected |
| **17** | **Current gate** |
| 18 | Voice |
| 19 | Transfer altitude (XFL) |
| 20 | Vertical Speed |
| **21** | **Assigned gate** |

### `#FP` — Flight plan (utile pour connaître le type d'appareil, l'aéroport d'arrivée, etc.)

- Requête : `#FP;CALLSIGN`
- Réponse : `#FP;CALLSIGN;<Flight plan record>`

Champs du Flight Plan Record :

| # | Champ |
|---|---|
| 1 | Departure ICAO |
| 2 | Arriving ICAO |
| 3 | Alternate ICAO |
| 4 | Estimated departure time |
| 5 | Aircraft ICAO |
| 6 | Wake turbulence |
| 7 | Flight rules (I/V/Y/Z) |
| 8 | Flight type (S/N/G/M/X) |
| 9 | Equipment |
| 10 | Cruising altitude |
| 11 | Cruising speed |
| 12 | Endurance |
| 13 | Estimated flight time |
| 14 | Route |
| 15 | Remarks |

### `#TR` — Trafic en range

- Requête : `#TR`
- Réponse : `#TR;TRAF1;TRAF2;TRAF3;...` (liste de callsigns)

Utile pour lister les aéronefs à traiter, puis interroger `#FP` et `#TRPOS` pour
chacun.

## Ecarts constates par rapport a la doc (tests reels du 2026-07-25)

- `#BAY` sans donnee ne repond pas avec le prefixe `#BAY;...` documente, mais
  avec `@BAY;No data in bay` (identifiant `@` non documente dans la section
  "Identifier"). A surveiller : le prefixe `@` semble reserve aux reponses
  "vides"/informatives plutot qu'aux erreurs (`$` documente pour les erreurs).
- `#TRPOS` et `#FP` correspondent exactement au format documente. Exemple reel
  valide sur `AFR275` (LFPG -> LFLL, A321) : `currentGate = J35`,
  `assignedGate` vide (aucune offre de bay active), coherent avec `#BAY` vide
  au meme instant.
- Champs 7/8 du Flight Plan Record : la doc les nomme "Flight type" puis
  "Flight rules" dans cet ordre, mais les valeurs reelles observees (ex.
  `I;S`) correspondent a l'inverse (`I` = regle de vol IFR, `S` = type de
  vol Scheduled). Corrige dans `src/parser.js` (champ 7 = `flightRules`,
  champ 8 = `flightType`) - c'est ce champ 7 qui sert a filtrer le trafic
  VFR du moteur.

## Portee des donnees de gate (test agregateur du 2026-07-25)

Sur une session avec 16 aeronefs en range (plusieurs aeroports LFML, LFKF,
LFGI, LFLL...), seuls les aeronefs au sol a **LFLL** (aeroport controle par
la position Aurora active, `assumedStation = LFLL_GND`) avaient `currentGate`
renseigne (`TVF912Z` -> C83, `TSC575` -> D23). Les aeronefs au sol sur
d'autres terrains (`CCM2TJ` a LFML, `CCM24QO` a LFKF, `FCHPM`/`FCBYP` a
LFGI) ont `onGround = 1` mais `currentGate` vide.

=> Le connecteur ne fournit les donnees de gate que pour l'aeroport dont le
layout de parkings est charge dans Aurora, c'est a dire celui controle par
l'utilisateur. C'est coherent avec l'usage cible d'AGA : l'allocateur ne
traitera que le trafic arrivant sur l'aeroport controle, pas le trafic en
route ou au sol ailleurs.

## Ce qu'il manque pour l'attribution automatique

- Le connecteur ne semble pas exposer de **commande pour définir/écrire**
  l'attribution d'une porte à un aéronef (seulement `#LBGTE` en requête pour lire
  le label affiché). Le mécanisme d'écriture passe probablement par le système de
  **Baylist** (`#BAY`, cf. section "Send commands via PM" de la doc : `offer`,
  `revise`, `accept`, `reject` avec `CallSign;Text1;Text2`).
- À vérifier/tester en conditions réelles avec une connexion Aurora active :
  - Comment envoyer une offre de bay via PM (format exact des commandes
    `offer`/`revise`/`accept`/`reject`).
  - Le référentiel des portes disponibles par aéroport (pas fourni par le
    connecteur — probablement à maintenir côté AGA, par ICAO).

## Prochaines étapes

1. Écrire un client TCP minimal (parsing paquets `#CMD;args...\r\n`) pour se
   connecter à Aurora et logger les réponses brutes de `#TR`, `#FP`, `#TRPOS`,
   `#BAY`.
2. Confirmer le format d'écriture d'une attribution de porte (offer/revise via
   PM).
3. Modéliser en interne : Aéroport → liste de portes → contraintes (type
   d'appareil, compagnie, etc.) → algorithme d'attribution.
