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
 * Construit l'ensemble des postes indisponibles (occupes ou bloques par
 * voisinage) a partir de la liste d'aeronefs connus.
 *
 * Retourne Map<gateId, { occupiedBy: callsign|null, blockedBy: gateId|null }>
 */
function buildOccupancy(aircraftList, airport) {
  const occupancy = new Map();

  for (const aircraft of aircraftList) {
    const match = crossCheckGate(aircraft, airport);
    if (!match) continue;

    occupancy.set(match.gateId, { occupiedBy: aircraft.callsign, blockedBy: null });

    const gate = airport.gates.get(match.gateId);
    for (const linkedId of gate.linkedGates) {
      if (!occupancy.has(linkedId)) {
        occupancy.set(linkedId, { occupiedBy: null, blockedBy: match.gateId });
      }
    }
  }

  return occupancy;
}

module.exports = { crossCheckGate, buildOccupancy, wakeRank, CROSS_CHECK_THRESHOLD_M };
