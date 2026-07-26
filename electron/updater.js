'use strict';

const EventEmitter = require('events');
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const { loadSettings, saveSettings } = require('./settings');

/**
 * Enveloppe electron-updater : verifie/telecharge/installe les mises a jour
 * depuis les Releases GitHub du depot, sur le canal choisi par
 * l'utilisateur ('latest' = Stable/MAIN, 'beta' = BETA).
 *
 * Le telechargement est manuel (autoDownload = false) : l'utilisateur
 * confirme avant de telecharger, puis avant de redemarrer pour installer.
 *
 * Emet 'state' avec { state, version?, percent?, error? } ou state vaut
 * 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' |
 * 'downloaded' | 'error'.
 */
class AppUpdater extends EventEmitter {
  constructor(logFn) {
    super();
    this.log = logFn || (() => {});
    this.state = { state: 'idle' };

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.channel = loadSettings().updateChannel;

    autoUpdater.on('checking-for-update', () => {
      this.log('[maj] Recherche de mise a jour...');
      this._setState({ state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      this.log(`[maj] Mise a jour disponible : ${info.version}`);
      this._setState({ state: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      this.log('[maj] Aucune mise a jour disponible (deja a jour).');
      this._setState({ state: 'not-available' });
    });
    autoUpdater.on('error', (err) => {
      this.log(`[maj] Erreur : ${err.message}`);
      this._setState({ state: 'error', error: err.message });
    });
    autoUpdater.on('download-progress', (p) => {
      this.log(`[maj] Telechargement... ${Math.round(p.percent)}%`);
      this._setState({ state: 'downloading', percent: Math.round(p.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.log(`[maj] Mise a jour ${info.version} telechargee - pret a redemarrer pour installer.`);
      this._setState({ state: 'downloaded', version: info.version });
    });
  }

  _setState(state) {
    this.state = state;
    this.emit('state', state);
  }

  getChannel() {
    return autoUpdater.channel;
  }

  setChannel(channel) {
    autoUpdater.channel = channel;
    saveSettings({ ...loadSettings(), updateChannel: channel });
    this.log(`[maj] Canal de mise a jour : ${channel === 'beta' ? 'BETA' : 'Stable'}`);
    this._setState({ state: 'idle' });
  }

  check() {
    if (!app.isPackaged) {
      this.log('[maj] Verification desactivee en mode developpement (app non packagee).');
      return Promise.resolve(null);
    }
    return autoUpdater.checkForUpdates();
  }

  download() {
    return autoUpdater.downloadUpdate();
  }

  install() {
    autoUpdater.quitAndInstall();
  }
}

module.exports = AppUpdater;
