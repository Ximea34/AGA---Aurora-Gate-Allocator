'use strict';

const body = document.getElementById('debug-body');

function appendLine(line) {
  const node = document.createElement('div');
  node.textContent = line;
  body.appendChild(node);
  body.scrollTop = body.scrollHeight;
}

window.aga.onDebugHistory((lines) => {
  body.innerHTML = '';
  for (const line of lines) appendLine(line);
});

window.aga.onDebugLog((line) => appendLine(line));

document.getElementById('btn-clear-log').addEventListener('click', () => {
  body.innerHTML = '';
});
document.getElementById('btn-close').addEventListener('click', () => window.aga.windowAction('close'));

// ---------- Simulateur de trafic ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fillSelect(select, values, placeholder) {
  select.innerHTML = '';
  if (placeholder) {
    const opt = el('option', null, placeholder);
    opt.value = '';
    select.appendChild(opt);
  }
  for (const value of values) {
    const opt = el('option', null, value);
    opt.value = value;
    select.appendChild(opt);
  }
}

async function initSimOptions() {
  const options = await window.aga.getSimOptions();
  fillSelect(document.getElementById('sim-airline'), options.airlines, '—');
  fillSelect(document.getElementById('sim-aircraft-type'), options.aircraftTypes, '—');

  const gateSelect = document.getElementById('sim-gate');
  gateSelect.innerHTML = '';
  const noneOpt = el('option', null, '— aucun (calcule via rayon/cap) —');
  noneOpt.value = '';
  gateSelect.appendChild(noneOpt);
  for (const gateId of options.gateIds) {
    const opt = el('option', null, gateId);
    opt.value = gateId;
    gateSelect.appendChild(opt);
  }
}

document.getElementById('sim-airline').addEventListener('change', (e) => {
  const prefix = e.target.value;
  const csInput = document.getElementById('sim-callsign');
  if (prefix && (csInput.value.trim() === '' || /^[A-Z]{3}$/.test(csInput.value.trim()))) {
    csInput.value = prefix;
  } else if (prefix) {
    csInput.value = prefix + csInput.value.trim().replace(/^[A-Z]{3}/, '');
  }
});

document.getElementById('sim-gate').addEventListener('change', (e) => {
  const disabled = e.target.value !== '';
  for (const id of ['sim-distance', 'sim-bearing', 'sim-onground']) {
    document.getElementById(id).disabled = disabled;
  }
  if (disabled) document.getElementById('sim-onground').checked = true;
});

document.getElementById('sim-inject').addEventListener('click', async () => {
  const errorEl = document.getElementById('sim-error');
  errorEl.textContent = '';

  const params = {
    callsign: document.getElementById('sim-callsign').value,
    aircraftIcao: document.getElementById('sim-aircraft-type').value,
    departureIcao: document.getElementById('sim-departure').value,
    flightRules: document.getElementById('sim-flight-rules').value,
    distanceNm: document.getElementById('sim-distance').value,
    bearingDeg: document.getElementById('sim-bearing').value,
    altitudeFt: document.getElementById('sim-altitude').value,
    speedKt: document.getElementById('sim-speed').value,
    onGround: document.getElementById('sim-onground').checked,
    gateId: document.getElementById('sim-gate').value || null,
  };

  const result = await window.aga.simulate(params);
  if (!result.ok) errorEl.textContent = result.error;
});

document.getElementById('sim-clear-all').addEventListener('click', () => window.aga.simulateClear());

function renderSimList(callsigns) {
  const list = document.getElementById('sim-list');
  document.getElementById('sim-count').textContent = String(callsigns.length);
  list.innerHTML = '';

  if (callsigns.length === 0) {
    list.appendChild(el('div', 'empty-hint', 'Aucun trafic simule'));
    return;
  }

  for (const callsign of callsigns) {
    const row = el('div', 'sim-list-row');
    row.appendChild(el('span', null, callsign));
    const btn = el('button', 'btn btn-ghost', 'Retirer');
    btn.addEventListener('click', () => window.aga.simulateRemove(callsign));
    row.appendChild(btn);
    list.appendChild(row);
  }
}

const STATE_LABEL = { occupiedBy: 'occupe', blockedBy: 'bloque', reservedFor: 'reserve' };

function renderOccupancy(occupancy) {
  const table = document.getElementById('occupancy-table');
  document.getElementById('occupancy-count').textContent = String(occupancy.length);
  table.querySelectorAll('.grid-row:not(.head)').forEach((n) => n.remove());

  for (const entry of occupancy) {
    const row = el('div', 'grid-row');
    row.appendChild(el('span', null, entry.gateId));

    let stateKey = 'blockedBy';
    if (entry.occupiedBy) stateKey = 'occupiedBy';
    else if (entry.reservedFor) stateKey = 'reservedFor';
    const stateClass = { occupiedBy: 'state-occupe', blockedBy: 'state-bloque', reservedFor: 'state-reserve' }[stateKey];
    row.appendChild(el('span', stateClass, STATE_LABEL[stateKey]));

    row.appendChild(el('span', null, entry.occupiedBy || entry.reservedFor || ''));
    row.appendChild(el('span', null, entry.blockedBy || ''));
    table.appendChild(row);
  }
}

let lastIcao = null;

window.aga.onUpdate((snapshot) => {
  if (snapshot.icao !== lastIcao) {
    lastIcao = snapshot.icao;
    initSimOptions();
  }
  renderSimList(snapshot.simulated || []);
  renderOccupancy(snapshot.occupancy || []);
});

initSimOptions();
window.aga.getSnapshot().then((snapshot) => {
  if (snapshot) {
    lastIcao = snapshot.icao;
    renderSimList(snapshot.simulated || []);
    renderOccupancy(snapshot.occupancy || []);
  }
});
