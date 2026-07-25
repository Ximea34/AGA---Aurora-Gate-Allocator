'use strict';

/**
 * Agregateur en memoire du trafic Aurora + proposition de porte.
 *
 * Usage : node src/run-aggregator.js [icao] [host] [port]
 *   ex : node src/run-aggregator.js LFLL
 *
 * Interroge periodiquement #TR pour connaitre le trafic en range, demande
 * #FP et #TRPOS pour chaque nouvel aeronef, rafraichit #TRPOS regulierement,
 * affiche un tableau consolide, et declenche une proposition de porte des
 * qu'un aeronef arrivant sur l'aeroport controle entre en finale (rayon +
 * altitude configures dans config/airports/<icao>.yaml).
 */

const AuroraConnection = require('./connection');
const AircraftStore = require('./aircraft-store');
const { loadAirport, loadAircraftWakeCategories } = require('./gates/airport-loader');
const { buildOccupancy } = require('./gates/occupancy');
const { isOnFinalApproach } = require('./gates/approach');
const { suggestGates } = require('./gates/suggest');

const ICAO = (process.argv[2] || 'LFLL').toUpperCase();
const HOST = process.argv[3] || '127.0.0.1';
const PORT = Number(process.argv[4]) || 1130;

const TRAFFIC_POLL_MS = 10000;
const POSITION_REFRESH_MS = 5000;
const PRINT_MS = 5000;

const airport = loadAirport(ICAO);
const wakeCategories = loadAircraftWakeCategories();

if (!airport.referencePoint) {
  console.warn(
    `[avertissement] Pas de reference_point configure pour ${ICAO} : la detection "en finale" est desactivee.`
  );
}

const conn = new AuroraConnection(HOST, PORT);
const store = new AircraftStore();

/** callsign -> { gateId, proposedAt } pour eviter de reproposer en boucle */
const proposals = new Map();

conn.on('connect', () => {
  console.log(`Connecte a Aurora sur ${HOST}:${PORT} - aeroport controle : ${airport.icao} (${airport.name})`);
  conn.sendCommand('#TR');
});

conn.on('traffic', ({ callsigns }) => {
  const newCallsigns = store.setTraffic(callsigns);
  for (const cs of newCallsigns) {
    conn.sendCommand(`#FP;${cs}`);
    conn.sendCommand(`#TRPOS;${cs}`);
  }
  for (const cs of proposals.keys()) {
    if (!callsigns.includes(cs)) proposals.delete(cs);
  }
});

conn.on('trpos', ({ record }) => {
  store.updatePosition(record);
  checkFinalApproach(record.callsign);
});
conn.on('flightplan', ({ record }) => {
  store.updateFlightPlan(record);
  checkFinalApproach(record.callsign);
});

conn.on('error', (err) => console.error(`[erreur] ${err.message}`));
conn.on('close', () => {
  console.log('Connexion fermee.');
  process.exit(0);
});

/**
 * Verifie si l'aeronef vient d'entrer dans l'enveloppe "finale" et, si oui,
 * calcule et affiche une proposition de porte (une seule fois par aeronef,
 * tant qu'il reste en range).
 */
function checkFinalApproach(callsign) {
  const aircraft = store.get(callsign);
  if (!aircraft || !aircraft.position || !aircraft.flightPlan) return;
  if (aircraft.flightPlan.arrivingIcao !== airport.icao) return;
  if (aircraft.position.onGround !== '0') return;
  if (proposals.has(callsign)) return;

  const finalCheck = isOnFinalApproach(aircraft, airport);
  if (!finalCheck || !finalCheck.onFinal) return;

  const occupancy = buildOccupancy(store.getAll(), airport);
  const { candidates, warnings } = suggestGates(aircraft, airport, occupancy, wakeCategories);
  const best = candidates[0] || null;

  proposals.set(callsign, { gateId: best ? best.gateId : null, proposedAt: Date.now() });

  console.log(`\n>>> ${callsign} en finale pour ${airport.icao} (${finalCheck.distanceNm.toFixed(1)} Nm, ${finalCheck.altitudeFt} ft)`);
  if (best) {
    console.log(`    Porte proposee : ${best.gateId} (${best.groupLabel}, categorie ${best.wakeCategory})`);
    if (candidates.length > 1) {
      console.log(`    Autres options : ${candidates.slice(1, 4).map((c) => c.gateId).join(', ')}`);
    }
  } else {
    console.log('    Aucune porte eligible trouvee.');
  }
  for (const warning of warnings) {
    console.log(`    [attention] ${warning}`);
  }
}

conn.connect();

const trafficTimer = setInterval(() => conn.sendCommand('#TR'), TRAFFIC_POLL_MS);

const positionTimer = setInterval(() => {
  for (const cs of store.getCallsigns()) {
    conn.sendCommand(`#TRPOS;${cs}`);
  }
}, POSITION_REFRESH_MS);

const printTimer = setInterval(() => {
  const rows = store.getAll().map((a) => {
    const finalCheck = a.position ? isOnFinalApproach(a, airport) : null;
    const proposal = proposals.get(a.callsign);
    return {
      callsign: a.callsign,
      dep: a.flightPlan ? a.flightPlan.departureIcao : '',
      arr: a.flightPlan ? a.flightPlan.arrivingIcao : '',
      aircraft: a.flightPlan ? a.flightPlan.aircraftIcao : '',
      onGround: a.position ? a.position.onGround : '',
      currentGate: a.position ? a.position.currentGate : '',
      assignedGate: a.position ? a.position.assignedGate : '',
      onFinal: finalCheck ? finalCheck.onFinal : '',
      proposedGate: proposal ? proposal.gateId || '(aucune)' : '',
    };
  });
  console.log(`\n--- ${new Date().toISOString()} (${rows.length} aeronefs, aeroport ${airport.icao}) ---`);
  console.table(rows);
}, PRINT_MS);

process.on('SIGINT', () => {
  clearInterval(trafficTimer);
  clearInterval(positionTimer);
  clearInterval(printTimer);
  conn.close();
});
