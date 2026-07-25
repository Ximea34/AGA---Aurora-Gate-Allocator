'use strict';

/**
 * Attributions de porte decidees par le controleur (independantes des
 * donnees Aurora). Le controleur peut reassigner une porte a tout moment.
 */
class AssignmentStore {
  constructor() {
    this.assignments = new Map();
  }

  assign(callsign, gateId) {
    this.assignments.set(callsign, gateId);
  }

  get(callsign) {
    return this.assignments.get(callsign);
  }

  clear(callsign) {
    this.assignments.delete(callsign);
  }

  has(callsign) {
    return this.assignments.has(callsign);
  }

  /** Vue Map<callsign, gateId>, utilisable telle quelle par buildOccupancy. */
  asMap() {
    return this.assignments;
  }
}

module.exports = AssignmentStore;
