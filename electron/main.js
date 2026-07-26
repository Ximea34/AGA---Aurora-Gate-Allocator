'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const GateEngine = require('./engine');
const AppUpdater = require('./updater');
const { bootstrapUserData } = require('./user-data');
const { listAvailableAirports, setDataRoot } = require('../src/gates/airport-loader');

app.setName('AGA - Aurora Gate Allocator');

const DEFAULT_ICAO = 'LFLL';
const ICAO = process.env.AGA_ICAO || DEFAULT_ICAO;

let mainWindow = null;
let debugWindow = null;
const logBuffer = [];
const MAX_LOG_LINES = 500;

// La config (config/, GATES/) vit dans le dossier utilisateur (APPDATA) une
// fois l'app packagee, pour rester editable sans droits admin et sans etre
// ecrasee a chaque mise a jour.
const userDataDir = bootstrapUserData();
setDataRoot(userDataDir);

const engine = new GateEngine(ICAO);

function pushLog(line) {
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
  if (debugWindow) debugWindow.webContents.send('debug:log', line);
}

const updater = new AppUpdater((message) => pushLog(`[${new Date().toLocaleTimeString('fr-FR')}] ${message}`));
updater.on('state', (state) => {
  if (mainWindow) mainWindow.webContents.send('updater:state', state);
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d0f12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (debugWindow) debugWindow.close();
  });
}

function createDebugWindow() {
  if (debugWindow) {
    debugWindow.focus();
    return;
  }

  debugWindow = new BrowserWindow({
    width: 640,
    height: 480,
    frame: false,
    backgroundColor: '#0d0f12',
    parent: mainWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  debugWindow.loadFile(path.join(__dirname, '..', 'renderer', 'debug.html'));
  debugWindow.webContents.once('did-finish-load', () => {
    debugWindow.webContents.send('debug:history', logBuffer);
  });

  debugWindow.on('closed', () => {
    debugWindow = null;
  });
}

engine.on('log', (line) => pushLog(line));

engine.on('status', (status) => {
  if (mainWindow) mainWindow.webContents.send('engine:status', status);
  if (debugWindow) debugWindow.webContents.send('engine:status', status);
});

engine.on('update', (snapshot) => {
  if (mainWindow) mainWindow.webContents.send('engine:update', snapshot);
  if (debugWindow) debugWindow.webContents.send('engine:update', snapshot);
});

ipcMain.handle('engine:connect', (event, { host, port }) => {
  engine.connect(host, port);
});

ipcMain.handle('engine:disconnect', () => {
  engine.disconnect();
});

ipcMain.handle('engine:assign', (event, { callsign, gateId }) => {
  return engine.assignGate(callsign, gateId);
});

ipcMain.handle('engine:clear', (event, { callsign }) => {
  engine.clearAssignment(callsign);
});

ipcMain.handle('engine:snapshot', () => {
  return engine.buildSnapshot();
});

ipcMain.handle('engine:list-airports', () => {
  return listAvailableAirports();
});

ipcMain.handle('engine:set-airport', (event, icao) => {
  engine.setAirport(icao);
  return engine.buildSnapshot();
});

ipcMain.handle('engine:simulate', (event, params) => {
  return engine.simulateAircraft(params);
});

ipcMain.handle('engine:simulate-remove', (event, callsign) => {
  engine.removeSimulated(callsign);
});

ipcMain.handle('engine:simulate-clear', () => {
  engine.clearSimulated();
});

ipcMain.handle('engine:sim-options', () => {
  return {
    aircraftTypes: engine.getAircraftTypes(),
    airlines: engine.getAirlineCodes(),
    gateIds: engine.getGateIds(),
  };
});

ipcMain.handle('window:action', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
  else if (action === 'pin') win.setAlwaysOnTop(!win.isAlwaysOnTop());
});

ipcMain.handle('window:open-debug', () => {
  createDebugWindow();
});

ipcMain.handle('updater:get-status', () => ({
  channel: updater.getChannel(),
  version: app.getVersion(),
  isPackaged: app.isPackaged,
}));

ipcMain.handle('updater:set-channel', (event, channel) => {
  updater.setChannel(channel);
});

ipcMain.handle('updater:check', () => updater.check());

ipcMain.handle('updater:download', () => updater.download());

ipcMain.handle('updater:install', () => updater.install());

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  engine.disconnect();
  if (process.platform !== 'darwin') app.quit();
});
