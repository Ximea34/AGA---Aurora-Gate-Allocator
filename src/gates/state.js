'use strict';

const { crossCheckGate } = require('./occupancy');

const STATE = {
  TAXI: 'TAXI', // au sol, bouge, pas de porte Aurora -> au roulage
  WRONG_GATE: 'WRONG_GATE', // arrete a une porte differente de celle assignee
  CORRECT: 'CORRECT', // arrete a la porte assignee par le controleur
};

/**
 * Classe l'etat d'un aeronef arrive/en cours d'arrivee, tel que defini par
 * le controleur :
 *
 *   TAXI        : au sol, en mouvement, aucune porte reconnue par Aurora
 *   WRONG_GATE  : arrete a une porte, mais differente de l'attribution
 *                 controleur
 *   CORRECT     : arrete a la porte attribuee par le controleur
 *
 * Retourne null si l'etat ne rentre dans aucune de ces 3 categories
 * (aeronef en vol, pas de position, arrete sans porte reconnue, ou pas
 * encore d'attribution controleur alors qu'il est deja a une porte).
 *
 * @param {object} aircraft - entree AircraftStore
 * @param {object} airport - resultat de loadAirport()
 * @param {string|undefined} assignedGateId - porte attribuee par le
 *   controleur pour cet aeronef (AssignmentStore.get(callsign))
 */
function computeAircraftState(aircraft, airport, assignedGateId) {
  const position = aircraft.position;
  if (!position) return null;
  if (position.onGround !== '1') return null;

  const speed = Number(position.speed);
  const stationary = Number.isFinite(speed) && speed === 0;
  const match = crossCheckGate(aircraft, airport);

  if (!stationary && !match) return STATE.TAXI;

  if (stationary && match) {
    if (!assignedGateId) return null;
    return match.gateId === assignedGateId ? STATE.CORRECT : STATE.WRONG_GATE;
  }

  return null;
}

module.exports = { STATE, computeAircraftState };
