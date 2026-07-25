'use strict';

const { distanceMeters } = require('./geo');

/** Distance max (m) pour considerer qu'un aeronef est bien au poste indique. */
const CROSS_CHECK_THRESHOLD_M = 50;

const WAKE_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];

function wakeRank(letter) {
  return WAKE_ORDER.indexOf(letter);
}

/**
 * Determine, pour un aeronef donne (record AircraftStore), le poste ou il se
 * trouve reellement :
 *  - si `position.currentGate` correspond a un poste connu de l'aeroport ET
 *    que la position lat/lon de l'aeronef est proche des coordonnees de ce
 *    poste (< CROSS_CHECK_THRESHOLD_M), le match est confirme ;
 *  - sinon, le label Aurora est ignore (poste inconnu ou incoherent).
 *
 * Retourne { gateId, distanceM } ou null si aucun match fiable.
 */
function crossCheckGate(aircraft, airport) {
  const position = aircraft.position;
  if (!position || !position.currentGate) return null;

  const gate = airport.gates.get(position.currentGate);
  if (!gate) return null;

  const lat = Number(position.latitude);
  const lon = Number(position.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const distanceM = distanceMeters(lat, lon, gate.lat, gate.lon);
  if (distanceM > CROSS_CHECK_THRESHOLD_M) return null;

  return { gateId: gate.id, distanceM };
}

/**
 * Construit l'ensemble des postes indisponibles (occupes physiquement,
 * bloques par voisinage, ou reserves pour un aeronef attendu a une porte
 * assignee par le controleur) a partir de la liste d'aeronefs connus.
 *
 * @param {Array} aircraftList - entrees AircraftStore
 * @param {object} airport - resultat de loadAirport()
 * @param {Map} [assignments] - Map<callsign, gateId> des attributions
 *   controleur (cf. AssignmentStore). Optionnel : sans ce parametre, seule
 *   l'occupation physique est calculee.
 *
 * Retourne Map<gateId, { occupiedBy, blockedBy, reservedFor }>
 * (un seul des trois champs est non-null par entree).
 *
 * Regle de reservation : si un aeronef s'est vu assigner une porte par le
 * controleur mais se trouve physiquement ailleurs (poste different confirme
 * par cross-check), sa porte assignee redevient disponible - on ne la
 * reserve pas. Le poste ou il se trouve reellement est de toute facon deja
 * marque occupe par la passe d'occupation physique ci-dessus.
 */
function buildOccupancy(aircraftList, airport, assignments) {
  const occupancy = new Map();
  const matches = new Map();

  for (const aircraft of aircraftList) {
    const match = crossCheckGate(aircraft, airport);
    if (!match) continue;
    matches.set(aircraft.callsign, match);

    occupancy.set(match.gateId, { occupiedBy: aircraft.callsign, blockedBy: null, reservedFor: null });

    const gate = airport.gates.get(match.gateId);
    for (const linkedId of gate.linkedGates) {
      if (!occupancy.has(linkedId)) {
        occupancy.set(linkedId, { occupiedBy: null, blockedBy: match.gateId, reservedFor: null });
      }
    }
  }

  if (assignments) {
    for (const aircraft of aircraftList) {
      const gateId = assignments.get(aircraft.callsign);
      if (!gateId) continue;

      const match = matches.get(aircraft.callsign);
      if (match && match.gateId !== gateId) continue; // a la mauvaise porte : on ne reserve pas

      if (!occupancy.has(gateId)) {
        occupancy.set(gateId, { occupiedBy: null, blockedBy: null, reservedFor: aircraft.callsign });
      }
    }
  }

  return occupancy;
}

module.exports = { crossCheckGate, buildOccupancy, wakeRank, CROSS_CHECK_THRESHOLD_M };
