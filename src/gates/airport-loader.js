'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadGtsFile } = require('./gts-loader');
const { dmsToDecimal } = require('./geo');

/**
 * Racine des donnees (config/ et GATES/). Par defaut le repo courant, pour
 * que les CLI de dev (run-aggregator.js, tests) continuent de lire les
 * fichiers du projet sans configuration. L'app Electron packagee appelle
 * setDataRoot() au demarrage pour lire/ecrire dans le dossier utilisateur
 * (APPDATA) a la place, afin que la config reste editable sans toucher aux
 * fichiers installes.
 */
let DATA_ROOT = path.join(__dirname, '..', '..');

function setDataRoot(dir) {
  DATA_ROOT = dir;
}

function getDataRoot() {
  return DATA_ROOT;
}

/**
 * Charge la configuration complete d'un aeroport (icao insensible a la casse) :
 * coordonnees .gts + config engine (wake, groupes, compagnies, blocages).
 *
 * Retourne :
 * {
 *   icao, name,
 *   referencePoint: { lat, lon },
 *   finalApproachCriteria: { radiusNm, maxAltitudeFt },
 *   gates: Map<gateId, {
 *     id, lat, lon, closed, wakeCategory,
 *     group, groupLabel, airlines: string[],
 *     linkedGates: string[]
 *   }>
 * }
 */
function loadAirport(icao) {
  const lower = icao.toLowerCase();
  const gtsPath = path.join(DATA_ROOT, 'GATES', `${lower}.gts`);
  const configPath = path.join(DATA_ROOT, 'config', 'airports', `${lower}.yaml`);

  if (!fs.existsSync(gtsPath)) {
    throw new Error(`Fichier de coordonnees introuvable: ${gtsPath}`);
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`Fichier de config introuvable: ${configPath}`);
  }

  const coords = loadGtsFile(gtsPath);
  const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

  const closedSet = new Set(config.closed_gates || []);
  const wakeCategories = config.wake_categories || {};

  // Blocage DIRECTIONNEL : gate_blocking associe un poste occupe a la
  // liste des postes qu'il neutralise. Pas de symetrie implicite - un
  // poste absent des cles ne neutralise rien quand il est occupe.
  const linkedGatesByGate = new Map(Object.entries(config.gate_blocking || {}));

  const groupByGate = new Map();
  for (const [groupKey, group] of Object.entries(config.gate_groups || {})) {
    for (const gateId of group.gates || []) {
      groupByGate.set(gateId, {
        group: groupKey,
        groupLabel: group.label || groupKey,
        airlines: group.airlines || [],
      });
    }
  }

  const gates = new Map();
  for (const coord of coords) {
    const groupInfo = groupByGate.get(coord.id) || { group: null, groupLabel: null, airlines: [] };
    gates.set(coord.id, {
      id: coord.id,
      lat: coord.lat,
      lon: coord.lon,
      closed: closedSet.has(coord.id),
      wakeCategory: wakeCategories[coord.id] || null,
      group: groupInfo.group,
      groupLabel: groupInfo.groupLabel,
      airlines: groupInfo.airlines,
      linkedGates: linkedGatesByGate.get(coord.id) || [],
    });
  }

  const refPoint = config.reference_point;
  const referencePoint = refPoint
    ? { lat: dmsToDecimal(refPoint.lat), lon: dmsToDecimal(refPoint.lon) }
    : null;

  const criteria = config.final_approach_criteria || {};

  return {
    icao: config.icao || icao.toUpperCase(),
    name: config.name || '',
    referencePoint,
    finalApproachCriteria: {
      radiusNm: criteria.radius_nm ?? null,
      maxAltitudeFt: criteria.max_altitude_ft ?? null,
    },
    gates,
  };
}

/**
 * Charge la table generique de categories de voilure par type ICAO.
 * Retourne Map<typeIcao, categorie ('A'..'F')>.
 */
function loadAircraftWakeCategories() {
  const filePath = path.join(DATA_ROOT, 'config', 'aircraft-wake-categories.yaml');
  const data = yaml.load(fs.readFileSync(filePath, 'utf8'));
  return new Map(Object.entries(data.aircraft || {}));
}

/**
 * Liste les aeroports disponibles : tout fichier config/airports/<icao>.yaml
 * est repere ; ceux qui ont un fichier GATES/<icao>.gts correspondant sont
 * "available", les autres "incomplete" (avec la raison) pour que
 * l'utilisateur ait un message explicite plutot qu'une disparition
 * silencieuse de la liste.
 *
 * Retourne { available: [{icao, name}], incomplete: [{icao, name, reason}] }.
 */
function listAvailableAirports() {
  const airportsDir = path.join(DATA_ROOT, 'config', 'airports');
  if (!fs.existsSync(airportsDir)) return { available: [], incomplete: [] };

  const available = [];
  const incomplete = [];

  for (const file of fs.readdirSync(airportsDir)) {
    if (!file.endsWith('.yaml')) continue;
    const icaoGuess = path.basename(file, '.yaml');
    const gtsPath = path.join(DATA_ROOT, 'GATES', `${icaoGuess}.gts`);

    let config;
    try {
      config = yaml.load(fs.readFileSync(path.join(airportsDir, file), 'utf8'));
    } catch (err) {
      incomplete.push({ icao: icaoGuess.toUpperCase(), name: '', reason: `config YAML invalide (${err.message})` });
      continue;
    }

    const icao = config.icao || icaoGuess.toUpperCase();
    const name = config.name || '';

    if (!fs.existsSync(gtsPath)) {
      incomplete.push({ icao, name, reason: `fichier GATES/${icaoGuess}.gts introuvable` });
      continue;
    }

    available.push({ icao, name });
  }

  available.sort((a, b) => a.icao.localeCompare(b.icao));
  return { available, incomplete };
}

module.exports = { loadAirport, loadAircraftWakeCategories, listAvailableAirports, setDataRoot, getDataRoot };
