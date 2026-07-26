'use strict';

const { crossCheckGate, buildOccupancy } = require('./occupancy');
const { isOnFinalApproach } = require('./approach');
const { suggestGates } = require('./suggest');

/**
 * Construit le tableau de bord UI : 3 espaces de travail du controleur.
 *
 *   pending      : trafic arrivant, pas encore de porte attribuee
 *   taxiAssigned : porte attribuee, pas encore arrete a une porte
 *   parked       : arrete a une porte (correcte, mauvaise, ou non assignee)
 *
 * @param {Array} aircraftList - AircraftStore.getAll()
 * @param {object} airport - loadAirport()
 * @param {Map} assignments - AssignmentStore.asMap()
 * @param {Map} wakeCategories - loadAircraftWakeCategories()
 */
function buildDashboard(aircraftList, airport, assignments, wakeCategories) {
  const occupancy = buildOccupancy(aircraftList, airport, assignments);

  const pending = [];
  const taxiAssigned = [];
  const parked = [];

  for (const aircraft of aircraftList) {
    if (!aircraft.flightPlan || aircraft.flightPlan.arrivingIcao !== airport.icao) continue;
    if (!aircraft.position) continue;
    // Le trafic VFR n'a pas besoin d'attribution de porte par le
    // controleur - masque des 3 colonnes. Reste toutefois compte dans
    // l'occupation globale (calculee plus haut sur aircraftList complet) :
    // s'il est physiquement gare a un poste, celui-ci reste bien bloque
    // pour les suggestions faites aux autres aeronefs.
    if (aircraft.flightPlan.flightRules === 'V') continue;

    const assignedGateId = assignments.get(aircraft.callsign);
    const match = crossCheckGate(aircraft, airport);
    const speed = Number(aircraft.position.speed);
    const stationary = Number.isFinite(speed) && speed === 0;

    // Suggestions calculees en excluant l'aeronef lui-meme de l'occupation,
    // pour que sa propre porte (actuelle ou reservee) reste proposable lors
    // d'une reassignation, quel que soit son espace de travail actuel.
    const others = aircraftList.filter((a) => a.callsign !== aircraft.callsign);
    const othersAssignments = new Map(assignments);
    othersAssignments.delete(aircraft.callsign);
    const occupancyForSelf = buildOccupancy(others, airport, othersAssignments);
    const { candidates, warnings } = suggestGates(aircraft, airport, occupancyForSelf, wakeCategories);

    const base = {
      callsign: aircraft.callsign,
      aircraftType: aircraft.flightPlan.aircraftIcao,
      departureIcao: aircraft.flightPlan.departureIcao,
      assignedGate: assignedGateId || null,
      primarySuggestion: candidates[0] || null,
      secondarySuggestions: candidates.slice(1, 5),
      warnings,
    };

    if (match && stationary) {
      parked.push({
        ...base,
        currentGate: match.gateId,
        state: !assignedGateId ? 'UNASSIGNED' : match.gateId === assignedGateId ? 'CORRECT' : 'WRONG_GATE',
      });
      continue;
    }

    if (assignedGateId) {
      taxiAssigned.push({
        ...base,
        onGround: aircraft.position.onGround === '1',
      });
      continue;
    }

    const finalCheck = airport.referencePoint ? isOnFinalApproach(aircraft, airport) : null;

    pending.push({
      ...base,
      distanceNm: finalCheck ? finalCheck.distanceNm : null,
      altitudeFt: finalCheck ? finalCheck.altitudeFt : null,
      onFinal: finalCheck ? finalCheck.onFinal : false,
    });
  }

  pending.sort((a, b) => (a.distanceNm ?? Infinity) - (b.distanceNm ?? Infinity));

  return { pending, taxiAssigned, parked, occupancy };
}

module.exports = { buildDashboard };
