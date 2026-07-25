'use strict';

const { wakeRank } = require('./occupancy');

/**
 * Extrait le prefixe compagnie d'un callsign Aurora (ex: "AFR275" -> "AFR").
 * Convention IVAO/OACI : 3 lettres au debut du callsign.
 */
function airlinePrefix(callsign) {
  const match = /^([A-Z]{3})/.exec(callsign || '');
  return match ? match[1] : null;
}

/**
 * Propose les postes eligibles pour un aeronef arrivant, tries du plus
 * pertinent au moins pertinent.
 *
 * @param {object} aircraft - entree AircraftStore ({ callsign, flightPlan, position })
 * @param {object} airport - resultat de loadAirport()
 * @param {Map} occupancy - resultat de buildOccupancy()
 * @param {Map} wakeCategories - resultat de loadAircraftWakeCategories()
 *
 * Retourne { candidates: [...], warnings: [...] }
 *   candidates: [{ gateId, group, groupLabel, wakeCategory, airlineMatch }]
 *   warnings: raisons pour lesquelles la suggestion peut etre incertaine
 *             (ex: type avion inconnu, compagnie non couverte par la config)
 */
function suggestGates(aircraft, airport, occupancy, wakeCategories) {
  const warnings = [];
  const prefix = airlinePrefix(aircraft.callsign);
  const aircraftType = aircraft.flightPlan ? aircraft.flightPlan.aircraftIcao : null;

  const aircraftCategory = aircraftType ? wakeCategories.get(aircraftType) : undefined;
  if (aircraftType && aircraftCategory === undefined) {
    warnings.push(`Type avion "${aircraftType}" absent de config/aircraft-wake-categories.yaml`);
  }
  if (!aircraftType) {
    warnings.push('Plan de vol inconnu : impossible de determiner le type avion');
  }

  const candidates = [];

  for (const gate of airport.gates.values()) {
    if (gate.closed) continue;
    if (occupancy.has(gate.id)) continue;
    if (!gate.wakeCategory) continue;

    if (aircraftCategory !== undefined && aircraftCategory !== null) {
      if (wakeRank(gate.wakeCategory) < wakeRank(aircraftCategory)) continue;
    }

    const hasAirlineRule = gate.airlines.length > 0;
    const airlineMatch = hasAirlineRule ? prefix !== null && gate.airlines.includes(prefix) : null;

    if (hasAirlineRule && !airlineMatch) continue;

    candidates.push({
      gateId: gate.id,
      group: gate.group,
      groupLabel: gate.groupLabel,
      wakeCategory: gate.wakeCategory,
      airlineMatch,
    });
  }

  candidates.sort((a, b) => {
    if (a.airlineMatch !== b.airlineMatch) return a.airlineMatch ? -1 : 1;
    return wakeRank(a.wakeCategory) - wakeRank(b.wakeCategory);
  });

  return { candidates, warnings };
}

module.exports = { suggestGates, airlinePrefix };
