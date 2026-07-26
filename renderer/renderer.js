'use strict';

const STATUS_LABELS = {
  disconnected: 'Deconnecte',
  connecting: 'Connexion...',
  connected: 'Connecte',
  error: 'Erreur',
};

const STATUS_DOT_CLASS = {
  disconnected: '',
  connecting: 'warn',
  connected: 'ok',
  error: 'err',
};

const knownCallsigns = new Set();
const editingRows = new Set();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setStatus(status) {
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  dot.className = `dot ${STATUS_DOT_CLASS[status] || ''}`;
  label.textContent = STATUS_LABELS[status] || status;

  document.getElementById('btn-connect').disabled = status === 'connected' || status === 'connecting';
  document.getElementById('btn-disconnect').disabled = status !== 'connected';
}

/**
 * Puces de porte cliquables : un clic assigne directement, pas de menu.
 * La porte courante/assignee est mise en avant (active). Un petit bouton
 * crayon permet une saisie manuelle inline si la porte voulue n'est pas
 * dans les suggestions.
 */
function buildGateChips(item, extraActions) {
  const wrap = el('div');

  const chipsRow = el('div', 'row-gate');
  const candidates = [];
  if (item.primarySuggestion) candidates.push(item.primarySuggestion.gateId);
  for (const s of item.secondarySuggestions || []) {
    if (!candidates.includes(s.gateId)) candidates.push(s.gateId);
  }
  if (item.assignedGate && !candidates.includes(item.assignedGate)) candidates.unshift(item.assignedGate);
  if (item.currentGate && !candidates.includes(item.currentGate)) candidates.push(item.currentGate);

  for (const gateId of candidates) {
    const chip = el('button', 'gate-chip-btn', gateId);
    if (gateId === item.primarySuggestion?.gateId && gateId !== item.assignedGate) {
      chip.classList.add('primary');
    }
    if (gateId === item.assignedGate) chip.classList.add('active');
    if (item.state === 'WRONG_GATE' && gateId === item.currentGate) chip.classList.add('err');
    chip.title = gateId === item.assignedGate ? 'Porte assignee' : 'Assigner cette porte';
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      window.aga.assign(item.callsign, gateId);
    });
    chipsRow.appendChild(chip);
  }

  const editToggle = el('button', 'gate-edit-toggle');
  editToggle.title = 'Saisie manuelle';
  editToggle.innerHTML = '<svg viewBox="0 0 16 16"><path d="M11 2l3 3-8 8H3v-3z"/></svg>';
  editToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleManualEdit(item.callsign, wrap, item);
  });
  chipsRow.appendChild(editToggle);

  for (const action of extraActions || []) {
    const btn = el('button', 'btn btn-ghost', action.label);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      action.onClick();
    });
    chipsRow.appendChild(btn);
  }

  wrap.appendChild(chipsRow);

  if (editingRows.has(item.callsign)) {
    wrap.appendChild(buildManualEditRow(item));
  }

  for (const warning of item.warnings || []) {
    wrap.appendChild(el('div', 'warning-line', warning));
  }

  return wrap;
}

function buildManualEditRow(item) {
  const row = el('div', 'gate-manual-row');
  const input = el('input', 'field code');
  input.placeholder = 'EX: C23';
  input.value = item.assignedGate || item.currentGate || '';
  row.appendChild(input);

  const confirm = el('button', 'btn btn-accent', 'OK');
  confirm.addEventListener('click', (e) => {
    e.stopPropagation();
    const gateId = input.value.trim().toUpperCase();
    if (gateId) window.aga.assign(item.callsign, gateId);
    editingRows.delete(item.callsign);
  });
  row.appendChild(confirm);

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm.click();
    if (e.key === 'Escape') {
      editingRows.delete(item.callsign);
      renderLatest();
    }
  });

  return row;
}

function toggleManualEdit(callsign, wrapEl, item) {
  if (editingRows.has(callsign)) {
    editingRows.delete(callsign);
  } else {
    editingRows.add(callsign);
  }
  const existing = wrapEl.querySelector('.gate-manual-row');
  if (existing) {
    existing.remove();
  } else if (editingRows.has(callsign)) {
    wrapEl.appendChild(buildManualEditRow(item));
    wrapEl.querySelector('.gate-manual-row input').focus();
  }
}

/**
 * Ligne meta commune : toujours presente (meme structure dans les 3
 * colonnes) pour que les etiquettes gardent la meme hauteur. Le contenu
 * varie selon le contexte mais reste une seule ligne de spans.
 */
function buildMetaLine(parts) {
  const meta = el('div', 'row-meta');
  for (const part of parts) {
    const span = el('span');
    span.appendChild(document.createTextNode(`${part.label} `));
    span.appendChild(el('span', 'value', part.value));
    meta.appendChild(span);
  }
  return meta;
}

function buildRowTop(item) {
  const top = el('div', 'row-top');
  top.appendChild(el('span', 'callsign', item.callsign));
  top.appendChild(el('span', 'aircraft-type', item.aircraftType || ''));
  return top;
}

function buildPendingRow(item) {
  const row = el('div', 'row');
  row.dataset.callsign = item.callsign;
  row.appendChild(buildRowTop(item));

  const parts = [];
  if (item.departureIcao) parts.push({ label: 'DEP', value: item.departureIcao });
  if (item.distanceNm != null) parts.push({ label: 'DIST', value: `${item.distanceNm.toFixed(1)}NM` });
  if (item.altitudeFt != null) parts.push({ label: 'ALT', value: `${item.altitudeFt}FT` });
  row.appendChild(buildMetaLine(parts));

  row.appendChild(buildGateChips(item));

  return row;
}

function buildTaxiRow(item) {
  const row = el('div', 'row');
  row.dataset.callsign = item.callsign;
  row.appendChild(buildRowTop(item));

  const parts = [];
  if (item.departureIcao) parts.push({ label: 'DEP', value: item.departureIcao });
  row.appendChild(buildMetaLine(parts));

  row.appendChild(
    buildGateChips(item, [{ label: 'Retirer', onClick: () => window.aga.clear(item.callsign) }])
  );

  return row;
}

function buildParkedRow(item) {
  const stateClass = item.state === 'CORRECT' ? 'ok' : item.state === 'WRONG_GATE' ? 'err' : '';
  const row = el('div', `row ${stateClass}`);
  row.dataset.callsign = item.callsign;
  row.appendChild(buildRowTop(item));

  const parts = [];
  if (item.departureIcao) parts.push({ label: 'DEP', value: item.departureIcao });
  if (item.state === 'WRONG_GATE') {
    parts.push({ label: 'A', value: item.currentGate });
    parts.push({ label: 'ATTENDU', value: item.assignedGate });
  } else if (item.state === 'UNASSIGNED') {
    parts.push({ label: 'A', value: item.currentGate });
  }
  row.appendChild(buildMetaLine(parts));

  row.appendChild(buildGateChips(item));

  return row;
}

function renderColumn(containerId, countId, items, builder, emptyMessage) {
  const container = document.getElementById(containerId);
  const scrollTop = container.scrollTop;
  container.innerHTML = '';
  document.getElementById(countId).textContent = String(items.length);

  if (items.length === 0) {
    container.appendChild(el('div', 'empty-hint', emptyMessage));
    return;
  }

  for (const item of items) {
    const row = builder(item);
    if (!knownCallsigns.has(`${containerId}:${item.callsign}`)) {
      row.classList.add('flash');
      knownCallsigns.add(`${containerId}:${item.callsign}`);
    }
    container.appendChild(row);
  }
  container.scrollTop = scrollTop;
}

let latestSnapshot = null;

function render(snapshot) {
  latestSnapshot = snapshot;
  document.getElementById('titlebar-icao').textContent = snapshot.icao;

  renderColumn('col-pending', 'count-pending', snapshot.pending, buildPendingRow, 'Aucun trafic en approche');
  renderColumn('col-taxi', 'count-taxi', snapshot.taxiAssigned, buildTaxiRow, 'Aucun trafic au roulage');
  renderColumn('col-parked', 'count-parked', snapshot.parked, buildParkedRow, 'Aucun trafic stationne');
}

function renderLatest() {
  if (latestSnapshot) render(latestSnapshot);
}

document.getElementById('btn-minimize').addEventListener('click', () => window.aga.windowAction('minimize'));
document.getElementById('btn-maximize').addEventListener('click', () => window.aga.windowAction('maximize'));
document.getElementById('btn-close').addEventListener('click', () => window.aga.windowAction('close'));
document.getElementById('btn-pin').addEventListener('click', (e) => {
  window.aga.windowAction('pin');
  e.currentTarget.classList.toggle('active');
});
document.getElementById('btn-debug').addEventListener('click', () => window.aga.openDebugWindow());

document.getElementById('btn-connect').addEventListener('click', () => {
  const host = document.getElementById('input-host').value.trim() || '127.0.0.1';
  const port = Number(document.getElementById('input-port').value) || 1130;
  window.aga.connect(host, port);
});
document.getElementById('btn-disconnect').addEventListener('click', () => window.aga.disconnect());

const airportSelect = document.getElementById('select-airport');
airportSelect.addEventListener('change', () => {
  window.aga.setAirport(airportSelect.value);
});

async function initAirportSelect() {
  const [airports, snapshot] = await Promise.all([window.aga.listAirports(), window.aga.getSnapshot()]);
  airportSelect.innerHTML = '';
  for (const airport of airports) {
    const option = el('option', null, airport.icao);
    option.value = airport.icao;
    option.title = airport.name;
    airportSelect.appendChild(option);
  }
  if (snapshot) airportSelect.value = snapshot.icao;
}

// ---------- Mises a jour ----------

const UPDATE_STATE_TEXT = {
  idle: 'Pret',
  checking: 'Recherche...',
  available: (s) => `Disponible : v${s.version}`,
  'not-available': 'A jour',
  downloading: (s) => `Telechargement... ${s.percent}%`,
  downloaded: (s) => `Pret a installer (v${s.version})`,
  error: (s) => `Erreur : ${s.error}`,
};

function renderUpdateState(state) {
  const text = UPDATE_STATE_TEXT[state.state];
  document.getElementById('update-status').textContent = typeof text === 'function' ? text(state) : text || state.state;
  document.getElementById('update-download').classList.toggle('hidden', state.state !== 'available');
  document.getElementById('update-install').classList.toggle('hidden', state.state !== 'downloaded');
  document.getElementById('update-dot').classList.toggle('visible', state.state === 'available' || state.state === 'downloaded');
}

const updatePanel = document.getElementById('update-panel');
document.getElementById('btn-update').addEventListener('click', (e) => {
  e.stopPropagation();
  updatePanel.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!updatePanel.classList.contains('hidden') && !e.target.closest('.update-wrap')) {
    updatePanel.classList.add('hidden');
  }
});

document.getElementById('update-channel').addEventListener('change', (e) => {
  window.aga.setUpdateChannel(e.target.value);
});

document.getElementById('update-check').addEventListener('click', async () => {
  try {
    await window.aga.checkForUpdate();
  } catch (err) {
    document.getElementById('update-status').textContent = `Erreur : ${err.message}`;
  }
});
document.getElementById('update-download').addEventListener('click', async () => {
  try {
    await window.aga.downloadUpdate();
  } catch (err) {
    document.getElementById('update-status').textContent = `Erreur : ${err.message}`;
  }
});
document.getElementById('update-install').addEventListener('click', () => window.aga.installUpdate());

window.aga.onUpdateState(renderUpdateState);

async function initUpdatePanel() {
  const status = await window.aga.getUpdateStatus();
  document.getElementById('update-version').textContent = status.version;
  document.getElementById('update-channel').value = status.channel;
}

window.aga.onStatus(setStatus);
window.aga.onUpdate(render);

setStatus('disconnected');
initAirportSelect();
initUpdatePanel();
window.aga.getSnapshot().then((snapshot) => {
  if (snapshot) render(snapshot);
});
