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
function buildGateChips(item) {
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

function buildPendingRow(item) {
  const row = el('div', 'row');
  row.dataset.callsign = item.callsign;

  const top = el('div', 'row-top');
  top.appendChild(el('span', 'callsign', item.callsign));
  top.appendChild(el('span', 'aircraft-type', item.aircraftType || ''));
  row.appendChild(top);

  const meta = el('div', 'row-meta');
  if (item.distanceNm != null) {
    const d = el('span');
    d.appendChild(document.createTextNode('DIST '));
    d.appendChild(el('span', 'value', `${item.distanceNm.toFixed(1)}NM`));
    meta.appendChild(d);
  }
  if (item.altitudeFt != null) {
    const a = el('span');
    a.appendChild(document.createTextNode('ALT '));
    a.appendChild(el('span', 'value', `${item.altitudeFt}FT`));
    meta.appendChild(a);
  }
  row.appendChild(meta);
  row.appendChild(buildGateChips(item));

  return row;
}

function buildTaxiRow(item) {
  const row = el('div', 'row');
  row.dataset.callsign = item.callsign;

  const top = el('div', 'row-top');
  top.appendChild(el('span', 'callsign', item.callsign));
  top.appendChild(el('span', 'aircraft-type', item.aircraftType || ''));
  row.appendChild(top);
  row.appendChild(buildGateChips(item));

  const actions = el('div', 'row-actions');
  const btnClear = el('button', 'btn btn-ghost', 'Retirer');
  btnClear.addEventListener('click', (e) => {
    e.stopPropagation();
    window.aga.clear(item.callsign);
  });
  actions.appendChild(btnClear);
  row.appendChild(actions);

  return row;
}

function buildParkedRow(item) {
  const stateClass = item.state === 'CORRECT' ? 'ok' : item.state === 'WRONG_GATE' ? 'err' : '';
  const row = el('div', `row ${stateClass}`);
  row.dataset.callsign = item.callsign;

  const top = el('div', 'row-top');
  top.appendChild(el('span', 'callsign', item.callsign));
  top.appendChild(el('span', 'aircraft-type', item.aircraftType || ''));
  row.appendChild(top);

  if (item.state === 'WRONG_GATE') {
    row.appendChild(el('div', 'row-meta', `A ${item.currentGate} — attendu ${item.assignedGate}`));
  } else if (item.state === 'UNASSIGNED') {
    row.appendChild(el('div', 'row-meta', `A ${item.currentGate} — non assignee`));
  }

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

window.aga.onStatus(setStatus);
window.aga.onUpdate(render);

setStatus('disconnected');
initAirportSelect();
window.aga.getSnapshot().then((snapshot) => {
  if (snapshot) render(snapshot);
});
