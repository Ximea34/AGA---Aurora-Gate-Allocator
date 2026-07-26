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
npm run dist        # build l'installeur NSIS (dist/)
```

En mode dev, la config est lue directement dans `config/`/`GATES/` du
depot. Une fois installee via l'installeur, l'app copie ces dossiers vers
`%APPDATA%\AGA - Aurora Gate Allocator\` au premier lancement (jamais
ecrase ensuite) : c'est ce dossier qu'il faut editer pour changer la
config (postes, compagnies, seuils...) d'une installation.

## Mises a jour automatiques

L'app verifie/telecharge/installe les mises a jour depuis les **Releases
GitHub** du depot (via `electron-updater`), sur un canal choisi dans le
panneau "mises a jour" (bouton en haut a droite de la fenetre) :

- **Stable** (`latest`) : suit les Releases publiees depuis `MAIN`.
- **Beta** (`beta`) : suit les Releases (prerelease) publiees depuis `BETA`.

Desactive en mode dev (`npm start` sans build) - fonctionne uniquement sur
une version installee via l'installeur.

### Publier une version (declenche automatiquement par GitHub Actions)

```bash
# 1. Mettre a jour "version" et "build.buildVersion" dans package.json
# 2. git add package.json && git commit -m "Bump version to X.Y.Z"
git tag vX.Y.Z              # stable, depuis MAIN
git tag vX.Y.Z-beta.N       # beta, depuis BETA
git push origin <branche> vX.Y.Z
```

Le workflow [.github/workflows/release.yml](.github/workflows/release.yml)
build l'installeur et publie automatiquement la Release GitHub (canal
deduit du suffixe `-beta` dans le tag).

## Branches

- `MAIN` : version stable, publiee sur le canal de mise a jour Stable.
- `BETA` : version en cours de validation, publiee sur le canal Beta.
- `DEV` : développement actif (branche courante).

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
`build.buildVersion` (utilisé pour la version du binaire Windows de
l'installeur). Les deux sont à garder synchronisés sur les 3 premiers
chiffres. Version actuelle : `1.0.0` / `1.0.0.0`.

## Documentation

- [docs/aurora-connector.md](docs/aurora-connector.md) — structure du
  connecteur Third Party Aurora (protocole, commandes, records).
