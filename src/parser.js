'use strict';

/**
 * Parsing des reponses du connecteur Third Party Aurora.
 * Reference: docs/aurora-connector.md
 */

const TRPOS_FIELDS = [
  'heading',
  'track',
  'altitude',
  'speed',
  'latitude',
  'longitude',
  'ssrSet',
  'ssrLabel',
  'waypointLabel',
  'altitudeLabel',
  'speedLabel',
  'assumedStation',
  'nextStation',
  'onGround',
  'isSelected',
  'wasSelected',
  'currentGate',
  'voice',
  'transferAltitude',
  'verticalSpeed',
  'assignedGate',
];

const FLIGHT_PLAN_FIELDS = [
  'departureIcao',
  'arrivingIcao',
  'alternateIcao',
  'estimatedDepartureTime',
  'aircraftIcao',
  'wakeTurbulence',
  'flightType',
  'flightRules',
  'equipment',
  'cruisingAltitude',
  'cruisingSpeed',
  'endurance',
  'estimatedFlightTime',
  'route',
  'remarks',
];

const BAYLIST_FIELDS = [
  'sender',
  'receiver',
  'callsign',
  'text1',
  'text2',
  'time',
  'state',
];

function splitArgs(line) {
  return line.split(';');
}

/**
 * "#TR;CALLSIGN1;CALLSIGN2;..." -> ["CALLSIGN1", "CALLSIGN2", ...]
 */
function parseTrafficList(line) {
  const parts = splitArgs(line);
  return parts.slice(1).filter((c) => c.length > 0);
}

/**
 * "#TRPOS;CALLSIGN;f1;f2;...;f21" -> { callsign, heading, ... }
 */
function parseTrpos(line) {
  const parts = splitArgs(line);
  const callsign = parts[1];
  const values = parts.slice(2);
  const record = { callsign };
  TRPOS_FIELDS.forEach((name, i) => {
    record[name] = values[i] ?? '';
  });
  return record;
}

/**
 * "#FP;CALLSIGN;f1;f2;...;f15" -> { callsign, departureIcao, ... }
 */
function parseFlightPlan(line) {
  const parts = splitArgs(line);
  const callsign = parts[1];
  const values = parts.slice(2);
  const record = { callsign };
  FLIGHT_PLAN_FIELDS.forEach((name, i) => {
    record[name] = values[i] ?? '';
  });
  return record;
}

/**
 * "#BAY;rec1;rec2;..." avec chaque record "sender|receiver|callsign|text1|text2|time|state"
 *
 * En pratique, quand aucune donnee n'est disponible, Aurora repond avec le
 * prefixe non documente "@BAY;No data in bay" plutot que "#BAY;...".
 */
function parseBaylist(line) {
  const parts = splitArgs(line);
  const records = parts.slice(1).filter((r) => r.length > 0 && !/^no data/i.test(r));
  return records.map((rec) => {
    const values = rec.split('|');
    const entry = {};
    BAYLIST_FIELDS.forEach((name, i) => {
      entry[name] = values[i] ?? '';
    });
    return entry;
  });
}

/**
 * Classifie une ligne brute recue d'Aurora et la parse selon son type.
 * Retourne toujours { type, raw, ... } avec type parmi :
 *   'traffic' | 'trpos' | 'flightplan' | 'baylist' | 'error' | 'unknown'
 */
function parseLine(line) {
  const head = line.split(';')[0];

  switch (head) {
    case '#TR':
      return { type: 'traffic', raw: line, callsigns: parseTrafficList(line) };
    case '#TRPOS':
      return { type: 'trpos', raw: line, record: parseTrpos(line) };
    case '#FP':
      return { type: 'flightplan', raw: line, record: parseFlightPlan(line) };
    case '#BAY':
    case '@BAY':
      return { type: 'baylist', raw: line, records: parseBaylist(line) };
    default:
      if (head.startsWith('$') || head === '@ERR') {
        return { type: 'error', raw: line };
      }
      return { type: 'unknown', raw: line };
  }
}

module.exports = {
  parseTrafficList,
  parseTrpos,
  parseFlightPlan,
  parseBaylist,
  parseLine,
};
