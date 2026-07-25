'use strict';

/**
 * Etat en memoire du trafic en range : callsign -> { flightPlan, position }.
 * Alimente par les evenements 'traffic' / 'trpos' / 'flightplan' de AuroraConnection.
 */
class AircraftStore {
  constructor() {
    this.aircraft = new Map();
  }

  /**
   * Met a jour la liste des callsigns en range et retire ceux qui en sont
   * sortis. Retourne les callsigns nouvellement apparus.
   */
  setTraffic(callsigns) {
    const now = Date.now();
    const currentSet = new Set(callsigns);
    const newCallsigns = [];

    for (const cs of callsigns) {
      if (!this.aircraft.has(cs)) {
        this.aircraft.set(cs, { callsign: cs, firstSeen: now });
        newCallsigns.push(cs);
      }
    }

    for (const cs of this.aircraft.keys()) {
      if (!currentSet.has(cs)) {
        this.aircraft.delete(cs);
      }
    }

    return newCallsigns;
  }

  updatePosition(record) {
    const entry = this.aircraft.get(record.callsign) || { callsign: record.callsign };
    entry.position = record;
    entry.lastPositionUpdate = Date.now();
    this.aircraft.set(record.callsign, entry);
  }

  updateFlightPlan(record) {
    const entry = this.aircraft.get(record.callsign) || { callsign: record.callsign };
    entry.flightPlan = record;
    entry.lastFlightPlanUpdate = Date.now();
    this.aircraft.set(record.callsign, entry);
  }

  getCallsigns() {
    return Array.from(this.aircraft.keys());
  }

  get(callsign) {
    return this.aircraft.get(callsign);
  }

  getAll() {
    return Array.from(this.aircraft.values());
  }
}

module.exports = AircraftStore;
