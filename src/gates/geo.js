'use strict';

/**
 * Utilitaires geographiques : conversion DMS -> decimal et distance haversine.
 */

const DMS_PATTERN = /^([NSEW])(\d+)\.(\d+)\.(\d+(?:\.\d+)?)$/;

/**
 * Convertit une coordonnee au format Aurora/.gts "N045.43.27.360" ou
 * "E005.04.59.090" en degres decimaux signes.
 */
function dmsToDecimal(value) {
  const match = DMS_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Format DMS invalide: ${value}`);
  }
  const [, dir, deg, min, sec] = match;
  const decimal = Number(deg) + Number(min) / 60 + Number(sec) / 3600;
  return dir === 'S' || dir === 'W' ? -decimal : decimal;
}

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Distance en metres entre deux points (lat/lon decimaux), formule haversine.
 */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

module.exports = { dmsToDecimal, distanceMeters };
