'use strict';

const fs = require('fs');
const { dmsToDecimal } = require('./geo');

/**
 * Charge un fichier .gts (coordonnees des postes de stationnement).
 * Format d'une ligne : "CODE;ICAO;LAT_DMS;LON_DMS;"
 *
 * Retourne un tableau [{ id, icao, lat, lon }, ...].
 */
function loadGtsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const gates = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const fields = line.split(';').filter((f) => f.length > 0);
    if (fields.length < 4) continue;

    const [id, icao, latDms, lonDms] = fields;
    gates.push({
      id,
      icao,
      lat: dmsToDecimal(latDms),
      lon: dmsToDecimal(lonDms),
    });
  }

  return gates;
}

module.exports = { loadGtsFile };
