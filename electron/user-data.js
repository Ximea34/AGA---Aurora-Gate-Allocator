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

  const bundledConfigDir = path.join(__dirname, '..', 'config');
  const bundledGatesDir = path.join(__dirname, '..', 'GATES');
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
