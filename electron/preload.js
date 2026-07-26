'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aga', {
  connect: (host, port) => ipcRenderer.invoke('engine:connect', { host, port }),
  disconnect: () => ipcRenderer.invoke('engine:disconnect'),
  assign: (callsign, gateId) => ipcRenderer.invoke('engine:assign', { callsign, gateId }),
  clear: (callsign) => ipcRenderer.invoke('engine:clear', { callsign }),
  getSnapshot: () => ipcRenderer.invoke('engine:snapshot'),
  listAirports: () => ipcRenderer.invoke('engine:list-airports'),
  setAirport: (icao) => ipcRenderer.invoke('engine:set-airport', icao),

  simulate: (params) => ipcRenderer.invoke('engine:simulate', params),
  simulateRemove: (callsign) => ipcRenderer.invoke('engine:simulate-remove', callsign),
  simulateClear: () => ipcRenderer.invoke('engine:simulate-clear'),
  getSimOptions: () => ipcRenderer.invoke('engine:sim-options'),

  onStatus: (callback) => ipcRenderer.on('engine:status', (event, status) => callback(status)),
  onUpdate: (callback) => ipcRenderer.on('engine:update', (event, snapshot) => callback(snapshot)),

  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  openDebugWindow: () => ipcRenderer.invoke('window:open-debug'),

  onDebugLog: (callback) => ipcRenderer.on('debug:log', (event, line) => callback(line)),
  onDebugHistory: (callback) => ipcRenderer.on('debug:history', (event, lines) => callback(lines)),
});
