'use strict';

/**
 * Agregateur en memoire du trafic Aurora.
 *
 * Usage : node src/run-aggregator.js [host] [port]
 *
 * Interroge periodiquement #TR pour connaitre le trafic en range, demande
 * #FP et #TRPOS pour chaque nouvel aeronef, rafraichit #TRPOS regulierement
 * pour les aeronefs deja connus, et affiche un tableau consolide en console.
 */

const AuroraConnection = require('./connection');
const AircraftStore = require('./aircraft-store');

const HOST = process.argv[2] || '127.0.0.1';
const PORT = Number(process.argv[3]) || 1130;

const TRAFFIC_POLL_MS = 10000;
const POSITION_REFRESH_MS = 15000;
const PRINT_MS = 5000;

const conn = new AuroraConnection(HOST, PORT);
const store = new AircraftStore();

conn.on('connect', () => {
  console.log(`Connecte a Aurora sur ${HOST}:${PORT}`);
  conn.sendCommand('#TR');
});

conn.on('traffic', ({ callsigns }) => {
  const newCallsigns = store.setTraffic(callsigns);
  for (const cs of newCallsigns) {
    conn.sendCommand(`#FP;${cs}`);
    conn.sendCommand(`#TRPOS;${cs}`);
  }
});

conn.on('trpos', ({ record }) => store.updatePosition(record));
conn.on('flightplan', ({ record }) => store.updateFlightPlan(record));

conn.on('error', (err) => console.error(`[erreur] ${err.message}`));
conn.on('close', () => {
  console.log('Connexion fermee.');
  process.exit(0);
});

conn.connect();

const trafficTimer = setInterval(() => conn.sendCommand('#TR'), TRAFFIC_POLL_MS);

const positionTimer = setInterval(() => {
  for (const cs of store.getCallsigns()) {
    conn.sendCommand(`#TRPOS;${cs}`);
  }
}, POSITION_REFRESH_MS);

const printTimer = setInterval(() => {
  const rows = store.getAll().map((a) => ({
    callsign: a.callsign,
    dep: a.flightPlan ? a.flightPlan.departureIcao : '',
    arr: a.flightPlan ? a.flightPlan.arrivingIcao : '',
    aircraft: a.flightPlan ? a.flightPlan.aircraftIcao : '',
    onGround: a.position ? a.position.onGround : '',
    currentGate: a.position ? a.position.currentGate : '',
    assignedGate: a.position ? a.position.assignedGate : '',
  }));
  console.log(`\n--- ${new Date().toISOString()} (${rows.length} aeronefs) ---`);
  console.table(rows);
}, PRINT_MS);

process.on('SIGINT', () => {
  clearInterval(trafficTimer);
  clearInterval(positionTimer);
  clearInterval(printTimer);
  conn.close();
});
