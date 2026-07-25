'use strict';

/**
 * Agregateur en memoire du trafic Aurora + proposition/attribution de porte.
 *
 * Usage : node src/run-aggregator.js [icao] [host] [port]
 *   ex : node src/run-aggregator.js LFLL
 *
 * - Interroge periodiquement #TR/#FP/#TRPOS pour maintenir l'etat du trafic.
 * - Des qu'un aeronef arrivant sur l'aeroport controle entre en finale
 *   (rayon + altitude configures), propose une porte principale + des
 *   options secondaires (console.log, pas d'attribution automatique).
 * - Commandes clavier (simulent le clic du controleur, pas encore d'UI) :
 *     assign CALLSIGN GATE   -> attribue GATE a CALLSIGN
 *     clear CALLSIGN         -> retire l'attribution
 *     help                   -> rappel des commandes
 * - Affiche a intervalle regulier : tableau du trafic (avec etat
 *   TAXI/WRONG_GATE/CORRECT), occupation des postes, et sequence
 *   d'atterrissage (plus proche + plus bas en premier).
 */

const readline = require('readline');
const AuroraConnection = require('./connection');
const AircraftStore = require('./aircraft-store');
const AssignmentStore = require('./gates/assignment-store');
const { loadAirport, loadAircraftWakeCategories } = require('./gates/airport-loader');
const { buildOccupancy } = require('./gates/occupancy');
const { isOnFinalApproach } = require('./gates/approach');
const { suggestGates } = require('./gates/suggest');
const { computeAircraftState } = require('./gates/state');
const { buildLandingSequence } = require('./gates/sequence');

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
const assignments = new AssignmentStore();

/** callsign -> { gateId, proposedAt } pour eviter de reproposer en boucle */
const proposals = new Map();

conn.on('connect', () => {
  console.log(`Connecte a Aurora sur ${HOST}:${PORT} - aeroport controle : ${airport.icao} (${airport.name})`);
  console.log('Commandes : "assign CALLSIGN GATE", "clear CALLSIGN", "help"');
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
  for (const cs of Array.from(assignments.asMap().keys())) {
    if (!callsigns.includes(cs)) assignments.clear(cs);
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
 * tant qu'il reste en range). Ceci est une SUGGESTION : le controleur reste
 * libre de choisir une autre porte via la commande "assign".
 */
function checkFinalApproach(callsign) {
  const aircraft = store.get(callsign);
  if (!aircraft || !aircraft.position || !aircraft.flightPlan) return;
  if (aircraft.flightPlan.arrivingIcao !== airport.icao) return;
  if (aircraft.position.onGround !== '0') return;
  if (proposals.has(callsign)) return;

  const finalCheck = isOnFinalApproach(aircraft, airport);
  if (!finalCheck || !finalCheck.onFinal) return;

  const occupancy = buildOccupancy(store.getAll(), airport, assignments.asMap());
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
    const assignedGate = assignments.get(a.callsign);
    const state = computeAircraftState(a, airport, assignedGate);
    return {
      callsign: a.callsign,
      dep: a.flightPlan ? a.flightPlan.departureIcao : '',
      arr: a.flightPlan ? a.flightPlan.arrivingIcao : '',
      aircraft: a.flightPlan ? a.flightPlan.aircraftIcao : '',
      onGround: a.position ? a.position.onGround : '',
      currentGate: a.position ? a.position.currentGate : '',
      onFinal: finalCheck ? finalCheck.onFinal : '',
      proposedGate: proposal ? proposal.gateId || '(aucune)' : '',
      assignedGate: assignedGate || '',
      state: state || '',
    };
  });
  console.log(`\n--- ${new Date().toISOString()} (${rows.length} aeronefs, aeroport ${airport.icao}) ---`);
  console.table(rows);

  const occupancy = buildOccupancy(store.getAll(), airport, assignments.asMap());
  const occupancyRows = Array.from(occupancy.entries()).map(([gateId, info]) => ({
    poste: gateId,
    etat: info.occupiedBy ? 'occupe' : info.reservedFor ? 'reserve' : 'bloque (voisinage)',
    occupePar: info.occupiedBy || '',
    reservePour: info.reservedFor || '',
    bloquePar: info.blockedBy || '',
  }));
  if (occupancyRows.length > 0) {
    console.log(`--- Occupation des postes (${airport.icao}) ---`);
    console.table(occupancyRows);
  }

  const sequence = buildLandingSequence(store.getAll(), airport, assignments.asMap());
  if (sequence.length > 0) {
    console.log(`--- Sequence d'atterrissage (${airport.icao}) ---`);
    console.table(
      sequence.map((e) => ({
        callsign: e.callsign,
        distanceNm: e.distanceNm.toFixed(1),
        altitudeFt: e.altitudeFt,
        etat: e.state || '',
      }))
    );
  }
}, PRINT_MS);

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();

  if (cmd === 'assign' && parts.length === 3) {
    const [, callsign, gateId] = parts;
    if (!store.get(callsign)) {
      console.log(`[assign] Aeronef inconnu : ${callsign}`);
      return;
    }
    if (!airport.gates.has(gateId)) {
      console.log(`[assign] Porte inconnue a ${airport.icao} : ${gateId}`);
      return;
    }
    assignments.assign(callsign, gateId);
    console.log(`[assign] ${callsign} -> ${gateId}`);
  } else if (cmd === 'clear' && parts.length === 2) {
    assignments.clear(parts[1]);
    console.log(`[clear] Attribution retiree pour ${parts[1]}`);
  } else if (cmd === 'help') {
    console.log('Commandes : "assign CALLSIGN GATE", "clear CALLSIGN", "help"');
  } else if (line.trim().length > 0) {
    console.log(`Commande inconnue : "${line.trim()}" (tape "help")`);
  }
});

process.on('SIGINT', () => {
  clearInterval(trafficTimer);
  clearInterval(positionTimer);
  clearInterval(printTimer);
  conn.close();
});
