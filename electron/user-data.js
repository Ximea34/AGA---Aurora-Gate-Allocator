'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Copie la config par defaut (config/, GATES/) embarquee dans l'app vers le
 * dossier utilisateur (%APPDATA%\<app>\ sur Windows) si elle n'y est pas
 * deja presente, puis retourne ce dossier.
 *
 * But : permettre a l'utilisateur d'editer sa config (postes, compagnies,
 * seuils...) sans toucher aux fichiers installes (souvent proteges/ecrases
 * a chaque mise a jour). Ne recopie jamais par-dessus une config existante -
 * une fois initialisee, seule l'app ne la retouche plus automatiquement.
 */
function bootstrapUserData() {
  const userDataDir = app.getPath('userData');

  // En dev, config/ et GATES/ sont a la racine du repo (frere de electron/).
  // Une fois packagee, ils sont livres hors de l'asar via "extraResources"
  // (electron-builder) car fs.cpSync ne sait pas copier un dossier
  // present a l'INTERIEUR de app.asar (seules les lectures simples sont
  // patchees par Electron, pas la copie recursive).
  const bundledRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const bundledConfigDir = path.join(bundledRoot, 'config');
  const bundledGatesDir = path.join(bundledRoot, 'GATES');
  const userConfigDir = path.join(userDataDir, 'config');
  const userGatesDir = path.join(userDataDir, 'GATES');

  if (!fs.existsSync(userConfigDir) && fs.existsSync(bundledConfigDir)) {
    fs.cpSync(bundledConfigDir, userConfigDir, { recursive: true });
  }
  if (!fs.existsSync(userGatesDir) && fs.existsSync(bundledGatesDir)) {
    fs.cpSync(bundledGatesDir, userGatesDir, { recursive: true });
  }

  return userDataDir;
}

module.exports = { bootstrapUserData };
