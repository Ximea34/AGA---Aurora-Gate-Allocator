'use strict';

/**
 * Client TCP minimal pour le connecteur Third Party d'Aurora (IVAO).
 *
 * Usage :
 *   node src/aurora-client.js [host] [port]
 *
 * Par defaut se connecte a 127.0.0.1:1130 (Aurora doit tourner en local
 * avec "3rd Party Software Access" active dans PVD > Settings > Other).
 *
 * Une fois connecte, envoie automatiquement #TR pour lister le trafic en
 * range. On peut aussi taper des commandes au clavier (ex: #FP;AFR123)
 * qui seront envoyees telles quelles, avec CR/LF ajoute automatiquement.
 */

const net = require('net');
const readline = require('readline');

const HOST = process.argv[2] || '127.0.0.1';
const PORT = Number(process.argv[3]) || 1130;

const socket = new net.Socket();
let buffer = '';

function log(prefix, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${prefix} ${message}`);
}

function sendCommand(raw) {
  const line = raw.endsWith('\r\n') ? raw : `${raw}\r\n`;
  socket.write(line, 'ascii');
  log('>>', raw);
}

socket.connect(PORT, HOST, () => {
  log('--', `Connecte a Aurora sur ${HOST}:${PORT}`);
  sendCommand('#TR');
});

socket.on('data', (data) => {
  buffer += data.toString('ascii');

  let idx;
  while ((idx = buffer.indexOf('\r\n')) >= 0) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    if (line.length > 0) {
      log('<<', line);
    }
  }
});

socket.on('error', (err) => {
  log('!!', `Erreur socket: ${err.message}`);
});

socket.on('close', () => {
  log('--', 'Connexion fermee');
  process.exit(0);
});

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  sendCommand(trimmed);
});
