'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadGtsFile } = require('./gts-loader');
const { dmsToDecimal } = require('./geo');

const REPO_ROOT = path.join(__dirname, '..', '..');

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
  const gtsPath = path.join(REPO_ROOT, 'GATES', `${lower}.gts`);
  const configPath = path.join(REPO_ROOT, 'config', 'airports', `${lower}.yaml`);

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

  const linkedGatesByGate = new Map();
  for (const group of config.gate_blocking_groups || []) {
    for (const gateId of group) {
      const linked = group.filter((g) => g !== gateId);
      const existing = linkedGatesByGate.get(gateId) || [];
      linkedGatesByGate.set(gateId, [...new Set([...existing, ...linked])]);
    }
  }

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
  const filePath = path.join(REPO_ROOT, 'config', 'aircraft-wake-categories.yaml');
  const data = yaml.load(fs.readFileSync(filePath, 'utf8'));
  return new Map(Object.entries(data.aircraft || {}));
}

module.exports = { loadAirport, loadAircraftWakeCategories };
