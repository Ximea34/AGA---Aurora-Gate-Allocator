# AGA — Aurora Gate Allocator

Logiciel d'attribution automatique des portes (gates) aux aéronefs à l'arrivée,
via le connecteur Third Party d'Aurora (client ATC du réseau IVAO), sur le
même principe que le projet CoLOA.

## État du projet

Moteur d'allocation de portes (LFLL) + interface Electron (3 espaces de
travail : pending / roulage / stationnés) branchés sur le connecteur Third
Party Aurora en direct. Voir [docs/aurora-connector.md](docs/aurora-connector.md)
pour le detail du protocole.

## Utilisation

```bash
npm install
npm start          # lance l'UI Electron
npm run cli        # client TCP brut (debug protocole)
npm run aggregator # agregateur console (sans UI)
npm run dist        # build le portable .exe (dist/)
```

## Branches

- `MAIN` : version stable
- `BETA` : version en cours de validation
- `DEV` : développement actif (branche courante)

## Versioning

Schéma `C.X.W.Z` (distinct du semver npm à 3 chiffres) :

| Segment | Signification |
|---|---|
| `C` | Version majeure stable |
| `X` | Version mineure |
| `W` | Ajout mineur d'une fonctionnalité |
| `Z` | Correctif de bug |

Le champ `version` de `package.json` reste en semver 3 chiffres (`C.X.W`,
requis par npm/electron-builder) ; le 4ᵉ segment `Z` vit dans
`build.buildVersion` (utilisé pour la version du binaire Windows du .exe
portable). Les deux sont à garder synchronisés sur les 3 premiers chiffres.

## Documentation

- [docs/aurora-connector.md](docs/aurora-connector.md) — structure du
  connecteur Third Party Aurora (protocole, commandes, records).
