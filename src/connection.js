'use strict';

const net = require('net');
const EventEmitter = require('events');
const { parseLine } = require('./parser');

/**
 * Connexion TCP evenementielle au connecteur Third Party Aurora.
 *
 * Emet :
 *   'connect'                 - connexion etablie
 *   'sent'     (rawCommand)   - commande envoyee
 *   'raw'      (line)         - chaque ligne brute recue (avant parsing)
 *   'traffic'  (parsed)       - reponse #TR
 *   'trpos'    (parsed)       - reponse #TRPOS
 *   'flightplan' (parsed)     - reponse #FP
 *   'baylist'  (parsed)       - reponse #BAY / @BAY
 *   'unknown'  (parsed)       - ligne non reconnue
 *   'protocolError' (parsed)  - reponse d'erreur du protocole Aurora ($ERR/@ERR)
 *   'error'    (err)          - erreur socket (vraie instance Error)
 *   'close'    (hadError)     - connexion fermee, hadError indique une fermeture anormale
 */
class AuroraConnection extends EventEmitter {
  constructor(host = '127.0.0.1', port = 1130) {
    super();
    this.host = host;
    this.port = port;
    this.socket = null;
    this.buffer = '';
  }

  connect() {
    this.socket = new net.Socket();
    this.socket.connect(this.port, this.host, () => this.emit('connect'));
    this.socket.on('data', (data) => this._onData(data));
    this.socket.on('error', (err) => this.emit('error', err));
    this.socket.on('close', (hadError) => this.emit('close', hadError));
  }

  _onData(data) {
    this.buffer += data.toString('ascii');

    let idx;
    while ((idx = this.buffer.indexOf('\r\n')) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      if (line.length === 0) continue;

      this.emit('raw', line);
      const parsed = parseLine(line);
      // Les erreurs de PROTOCOLE ($ERR/@ERR renvoyees par Aurora) ne sont pas
      // des erreurs socket : ce ne sont pas des instances Error et elles ne
      // doivent pas etre confondues avec l'evenement 'error' du socket.
      if (parsed.type === 'error') {
        this.emit('protocolError', parsed);
      } else {
        this.emit(parsed.type, parsed);
      }
    }
  }

  sendCommand(raw) {
    const line = raw.endsWith('\r\n') ? raw : `${raw}\r\n`;
    this.socket.write(line, 'ascii');
    this.emit('sent', raw);
  }

  close() {
    if (this.socket) this.socket.end();
  }
}

module.exports = AuroraConnection;
