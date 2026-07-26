'use strict';

const EventEmitter = require('events');
const AuroraConnection = require('../src/connection');
const AircraftStore = require('../src/aircraft-store');
const AssignmentStore = require('../src/gates/assignment-store');
const { loadAirport, loadAircraftWakeCategories } = require('../src/gates/airport-loader');
const { buildDashboard } = require('../src/gates/dashboard');
const { destinationPoint } = require('../src/gates/geo');

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
    /** callsign -> { callsign, flightPlan, position } - trafic fictif injecte par le simulateur */
    this.simulated = new Map();
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
        if (!callsigns.includes(cs) && !this.simulated.has(cs)) this.assignments.clear(cs);
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
    if (!this.store.get(callsign) && !this.simulated.has(callsign)) {
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

  /**
   * Injecte ou met a jour un aeronef fictif pour tester le moteur sans
   * connexion Aurora. Deux modes de positionnement :
   *  - gateId fourni : place l'aeronef exactement aux coordonnees de ce
   *    poste (au sol, vitesse 0) - pratique pour tester CORRECT/WRONG_GATE.
   *  - sinon : place l'aeronef a distanceNm/bearingDeg de l'ARP, a
   *    l'altitude/vitesse/etat sol demandes.
   *
   * @returns {{ok: true} | {ok: false, error: string}}
   */
  simulateAircraft(params) {
    const callsign = (params.callsign || '').trim().toUpperCase();
    if (!callsign) return { ok: false, error: 'Indicatif requis' };

    let lat;
    let lon;
    let onGround = !!params.onGround;
    let currentGate = '';

    if (params.gateId) {
      const gate = this.airport.gates.get(params.gateId);
      if (!gate) return { ok: false, error: `Porte inconnue a ${this.airport.icao} : ${params.gateId}` };
      lat = gate.lat;
      lon = gate.lon;
      onGround = true;
      currentGate = params.gateId;
    } else {
      if (!this.airport.referencePoint) {
        return { ok: false, error: `Pas de point de reference configure pour ${this.airport.icao}` };
      }
      const dest = destinationPoint(
        this.airport.referencePoint.lat,
        this.airport.referencePoint.lon,
        Number(params.distanceNm) || 0,
        Number(params.bearingDeg) || 0
      );
      lat = dest.lat;
      lon = dest.lon;
    }

    const flightPlan = {
      callsign,
      departureIcao: (params.departureIcao || 'ZZZZ').toUpperCase(),
      arrivingIcao: this.airport.icao,
      alternateIcao: '',
      estimatedDepartureTime: '',
      aircraftIcao: (params.aircraftIcao || '').toUpperCase(),
      wakeTurbulence: '',
      flightType: '',
      flightRules: '',
      equipment: '',
      cruisingAltitude: '',
      cruisingSpeed: '',
      endurance: '',
      estimatedFlightTime: '',
      route: '',
      remarks: '[SIMULATION]',
    };

    const position = {
      callsign,
      heading: '0',
      track: '-1',
      altitude: String(Math.round(Number(params.altitudeFt) || 0)),
      speed: String(Math.round(Number(params.speedKt) || 0)),
      latitude: String(lat),
      longitude: String(lon),
      ssrSet: '',
      ssrLabel: '',
      waypointLabel: '',
      altitudeLabel: '',
      speedLabel: '',
      assumedStation: '',
      nextStation: '',
      onGround: onGround ? '1' : '0',
      isSelected: '0',
      wasSelected: '0',
      currentGate,
      voice: '0',
      transferAltitude: '',
      verticalSpeed: '0',
      assignedGate: '',
    };

    this.simulated.set(callsign, { callsign, flightPlan, position });
    this.log(
      `[SIM] ${callsign} (${flightPlan.aircraftIcao || '?'}) injecte - ${
        params.gateId ? `poste ${params.gateId}` : `${params.distanceNm}Nm / ${params.altitudeFt}ft`
      }`
    );
    this.pushUpdate();
    return { ok: true };
  }

  removeSimulated(callsign) {
    const cs = (callsign || '').trim().toUpperCase();
    if (this.simulated.delete(cs)) {
      this.assignments.clear(cs);
      this.log(`[SIM] ${cs} retire`);
      this.pushUpdate();
    }
  }

  clearSimulated() {
    for (const cs of this.simulated.keys()) this.assignments.clear(cs);
    this.simulated.clear();
    this.log('[SIM] Tout le trafic simule a ete retire');
    this.pushUpdate();
  }

  listSimulated() {
    return Array.from(this.simulated.keys());
  }

  /** Types ICAO connus (config/aircraft-wake-categories.yaml), pour peupler le simulateur. */
  getAircraftTypes() {
    return Array.from(this.wakeCategories.keys()).sort();
  }

  /** Prefixes compagnie references dans la config de l'aeroport controle. */
  getAirlineCodes() {
    const codes = new Set();
    for (const gate of this.airport.gates.values()) {
      for (const code of gate.airlines) codes.add(code);
    }
    return Array.from(codes).sort();
  }

  /** Postes de l'aeroport controle (non fermes en premier), pour le simulateur. */
  getGateIds() {
    return Array.from(this.airport.gates.values())
      .sort((a, b) => Number(a.closed) - Number(b.closed) || a.id.localeCompare(b.id))
      .map((g) => g.id);
  }

  buildSnapshot() {
    const aircraftList = [...this.store.getAll(), ...this.simulated.values()];
    const dashboard = buildDashboard(aircraftList, this.airport, this.assignments.asMap(), this.wakeCategories);
    const occupancy = Array.from(dashboard.occupancy.entries()).map(([gateId, info]) => ({
      gateId,
      ...info,
    }));
    return {
      icao: this.airport.icao,
      name: this.airport.name,
      status: this.status,
      pending: dashboard.pending,
      taxiAssigned: dashboard.taxiAssigned,
      parked: dashboard.parked,
      occupancy,
      simulated: this.listSimulated(),
    };
  }

  pushUpdate() {
    this.emit('update', this.buildSnapshot());
  }
}

module.exports = GateEngine;
