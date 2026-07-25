'use strict';

const { distanceNm } = require('./geo');
const { STATE, computeAircraftState } = require('./state');

/**
 * Construit la liste des aeronefs arrivant sur l'aeroport controle, triee
 * par ordre de sequence d'atterrissage : le plus proche puis le plus bas
 * en premier. Les aeronefs deja correctement arrives (STATE.CORRECT) sont
 * exclus - ils n'ont plus besoin d'attention du controleur.
 *
 * @param {Array} aircraftList - entrees AircraftStore
 * @param {object} airport - resultat de loadAirport()
 * @param {Map} [assignments] - Map<callsign, gateId> (AssignmentStore.asMap())
 *
 * Retourne [{ callsign, distanceNm, altitudeFt, state }] trie.
 */
function buildLandingSequence(aircraftList, airport, assignments) {
  const entries = [];

  for (const aircraft of aircraftList) {
    if (!aircraft.flightPlan || aircraft.flightPlan.arrivingIcao !== airport.icao) continue;
    if (!aircraft.position || !airport.referencePoint) continue;

    const lat = Number(aircraft.position.latitude);
    const lon = Number(aircraft.position.longitude);
    const altitudeFt = Number(aircraft.position.altitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const assignedGateId = assignments ? assignments.get(aircraft.callsign) : undefined;
    const state = computeAircraftState(aircraft, airport, assignedGateId);
    if (state === STATE.CORRECT) continue;

    entries.push({
      callsign: aircraft.callsign,
      distanceNm: distanceNm(lat, lon, airport.referencePoint.lat, airport.referencePoint.lon),
      altitudeFt: Number.isFinite(altitudeFt) ? altitudeFt : null,
      state,
    });
  }

  entries.sort((a, b) => {
    if (a.distanceNm !== b.distanceNm) return a.distanceNm - b.distanceNm;
    return (a.altitudeFt ?? 0) - (b.altitudeFt ?? 0);
  });

  return entries;
}

module.exports = { buildLandingSequence };
