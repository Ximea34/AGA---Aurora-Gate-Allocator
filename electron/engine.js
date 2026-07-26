'use strict';

const EventEmitter = require('events');
const AuroraConnection = require('../src/connection');
const AircraftStore = require('../src/aircraft-store');
const AssignmentStore = require('../src/gates/assignment-store');
const { loadAirport, loadAircraftWakeCategories } = require('../src/gates/airport-loader');
const { buildDashboard } = require('../src/gates/dashboard');

const TRAFFIC_POLL_MS = 10000;
const POSITION_REFRESH_MS = 5000;

/**
 * Encapsule la connexion Aurora + le moteur d'allocation pour le process
 * principal Electron. Emet :
 *   'log'    (line)     - ligne de log destinee a la fenetre debug
 *   'status' (status)   - 'disconnected' | 'connecting' | 'connected' | 'error'
 *   'update' (snapshot) - dashboard recalcule ({ airport, pending, taxiAssigned, parked })
 */
class GateEngine extends EventEmitter {
  constructor(icao) {
    super();
    this.icao = icao;
    this.airport = loadAirport(icao);
    this.wakeCategories = loadAircraftWakeCategories();
    this.store = new AircraftStore();
    this.assignments = new AssignmentStore();
    this.conn = null;
    this.trafficTimer = null;
    this.positionTimer = null;
    this.status = 'disconnected';
  }

  log(message) {
    this.emit('log', `[${new Date().toLocaleTimeString('fr-FR')}] ${message}`);
  }

  /**
   * Change l'aeroport controle. Les attributions du controleur sont
   * remises a zero (elles referencent des postes de l'ancien aeroport) ;
   * le trafic Aurora connu reste en memoire, seule la vue changera.
   */
  setAirport(icao) {
    this.icao = icao.toUpperCase();
    this.airport = loadAirport(this.icao);
    this.assignments = new AssignmentStore();
    this.log(`Aeroport controle : ${this.airport.icao} (${this.airport.name})`);
    this.pushUpdate();
  }

  setStatus(status) {
    this.status = status;
    this.emit('status', status);
  }

  connect(host, port) {
    if (this.conn) this.disconnect();

    this.setStatus('connecting');
    this.log(`Connexion a Aurora ${host}:${port}...`);
    this.conn = new AuroraConnection(host, port);

    this.conn.on('connect', () => {
      this.setStatus('connected');
      this.log(`Connecte - aeroport controle : ${this.airport.icao} (${this.airport.name})`);
      this.conn.sendCommand('#TR');
      this.trafficTimer = setInterval(() => this.conn.sendCommand('#TR'), TRAFFIC_POLL_MS);
      this.positionTimer = setInterval(() => {
        for (const cs of this.store.getCallsigns()) {
          this.conn.sendCommand(`#TRPOS;${cs}`);
        }
      }, POSITION_REFRESH_MS);
    });

    this.conn.on('traffic', ({ callsigns }) => {
      const newCallsigns = this.store.setTraffic(callsigns);
      for (const cs of newCallsigns) {
        this.log(`Nouveau trafic en range : ${cs}`);
        this.conn.sendCommand(`#FP;${cs}`);
        this.conn.sendCommand(`#TRPOS;${cs}`);
      }
      for (const cs of Array.from(this.assignments.asMap().keys())) {
        if (!callsigns.includes(cs)) this.assignments.clear(cs);
      }
      this.pushUpdate();
    });

    this.conn.on('trpos', ({ record }) => {
      this.store.updatePosition(record);
      this.pushUpdate();
    });

    this.conn.on('flightplan', ({ record }) => {
      this.store.updateFlightPlan(record);
      this.pushUpdate();
    });

    this.conn.on('error', (err) => {
      this.setStatus('error');
      this.log(`[erreur] ${err.message}`);
    });

    this.conn.on('close', () => {
      this.setStatus('disconnected');
      this.log('Connexion fermee.');
      this._stopTimers();
    });

    this.conn.connect();
  }

  disconnect() {
    if (!this.conn) return;
    this._stopTimers();
    this.conn.close();
    this.conn = null;
    this.setStatus('disconnected');
  }

  _stopTimers() {
    if (this.trafficTimer) clearInterval(this.trafficTimer);
    if (this.positionTimer) clearInterval(this.positionTimer);
    this.trafficTimer = null;
    this.positionTimer = null;
  }

  assignGate(callsign, gateId) {
    if (!this.store.get(callsign)) {
      this.log(`[assign] Aeronef inconnu : ${callsign}`);
      return false;
    }
    if (!this.airport.gates.has(gateId)) {
      this.log(`[assign] Porte inconnue a ${this.airport.icao} : ${gateId}`);
      return false;
    }
    this.assignments.assign(callsign, gateId);
    this.log(`[assign] ${callsign} -> ${gateId}`);
    this.pushUpdate();
    return true;
  }

  clearAssignment(callsign) {
    this.assignments.clear(callsign);
    this.log(`[clear] Attribution retiree pour ${callsign}`);
    this.pushUpdate();
  }

  buildSnapshot() {
    const dashboard = buildDashboard(this.store.getAll(), this.airport, this.assignments.asMap(), this.wakeCategories);
    return {
      icao: this.airport.icao,
      name: this.airport.name,
      status: this.status,
      pending: dashboard.pending,
      taxiAssigned: dashboard.taxiAssigned,
      parked: dashboard.parked,
    };
  }

  pushUpdate() {
    this.emit('update', this.buildSnapshot());
  }
}

module.exports = GateEngine;
