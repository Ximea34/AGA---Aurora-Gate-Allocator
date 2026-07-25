'use strict';

const { distanceNm } = require('./geo');

/**
 * Determine si un aeronef est en approche finale au sens ou AGA doit
 * declencher une proposition de porte : a l'interieur du rayon configure
 * autour du point de reference aerodrome, et sous l'altitude max configuree.
 *
 * @param {object} aircraft - entree AircraftStore ({ callsign, position })
 * @param {object} airport - resultat de loadAirport() (referencePoint, finalApproachCriteria)
 *
 * Retourne { onFinal, distanceNm, altitudeFt } ou null si donnees insuffisantes
 * (pas de position, ou aeroport sans point de reference configure).
 */
function isOnFinalApproach(aircraft, airport) {
  const { referencePoint, finalApproachCriteria } = airport;
  if (!referencePoint || finalApproachCriteria.radiusNm == null || finalApproachCriteria.maxAltitudeFt == null) {
    return null;
  }

  const position = aircraft.position;
  if (!position) return null;

  const lat = Number(position.latitude);
  const lon = Number(position.longitude);
  const altitudeFt = Number(position.altitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(altitudeFt)) {
    return null;
  }

  const distNm = distanceNm(lat, lon, referencePoint.lat, referencePoint.lon);
  const onFinal =
    distNm <= finalApproachCriteria.radiusNm && altitudeFt < finalApproachCriteria.maxAltitudeFt;

  return { onFinal, distanceNm: distNm, altitudeFt };
}

module.exports = { isOnFinalApproach };
