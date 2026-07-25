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
let currentModalCallsign = null;
let latestSnapshot = null;

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

  const gateRow = el('div', 'row-gate');
  if (item.primarySuggestion) {
    gateRow.appendChild(el('span', 'gate-chip', item.primarySuggestion.gateId));
  } else {
    gateRow.appendChild(el('span', 'gate-chip err', 'AUCUNE'));
  }
  row.appendChild(gateRow);

  row.addEventListener('click', () => openAssignModal(item));
  return row;
}

function buildTaxiRow(item) {
  const row = el('div', 'row');
  row.dataset.callsign = item.callsign;

  const top = el('div', 'row-top');
  top.appendChild(el('span', 'callsign', item.callsign));
  top.appendChild(el('span', 'aircraft-type', item.aircraftType || ''));
  row.appendChild(top);

  const gateRow = el('div', 'row-gate');
  gateRow.appendChild(el('span', 'gate-chip', item.assignedGate));
  row.appendChild(gateRow);

  const actions = el('div', 'row-actions');
  const btnEdit = el('button', 'btn btn-ghost', 'Modifier');
  btnEdit.addEventListener('click', (e) => {
    e.stopPropagation();
    openAssignModal(item);
  });
  const btnClear = el('button', 'btn btn-ghost', 'Retirer');
  btnClear.addEventListener('click', (e) => {
    e.stopPropagation();
    window.aga.clear(item.callsign);
  });
  actions.appendChild(btnEdit);
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

  const gateRow = el('div', 'row-gate');
  gateRow.appendChild(el('span', `gate-chip ${item.state === 'WRONG_GATE' ? 'err' : ''}`, item.currentGate));
  if (item.state === 'WRONG_GATE') {
    const note = el('span', 'row-meta', `attendu: ${item.assignedGate}`);
    gateRow.appendChild(note);
  } else if (item.state === 'UNASSIGNED') {
    gateRow.appendChild(el('span', 'row-meta', 'non assignee'));
  }
  row.appendChild(gateRow);

  const actions = el('div', 'row-actions');
  const btnEdit = el('button', 'btn btn-ghost', 'Reassigner');
  btnEdit.addEventListener('click', (e) => {
    e.stopPropagation();
    openAssignModal(item);
  });
  actions.appendChild(btnEdit);
  row.appendChild(actions);

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

function render(snapshot) {
  latestSnapshot = snapshot;
  document.getElementById('titlebar-icao').textContent = snapshot.icao;

  renderColumn('col-pending', 'count-pending', snapshot.pending, buildPendingRow, 'Aucun trafic en approche');
  renderColumn('col-taxi', 'count-taxi', snapshot.taxiAssigned, buildTaxiRow, 'Aucun trafic au roulage');
  renderColumn('col-parked', 'count-parked', snapshot.parked, buildParkedRow, 'Aucun trafic stationne');

  if (currentModalCallsign) {
    const allItems = [...snapshot.pending, ...snapshot.taxiAssigned, ...snapshot.parked];
    const stillTracked = allItems.find((i) => i.callsign === currentModalCallsign);
    if (stillTracked) refreshModalSuggestions(stillTracked);
    else closeModal();
  }
}

function openAssignModal(item) {
  currentModalCallsign = item.callsign;
  document.getElementById('modal-callsign').textContent = item.callsign;
  document.getElementById('modal-manual-input').value = item.assignedGate || item.currentGate || '';
  refreshModalSuggestions(item);
  document.getElementById('assign-modal').classList.remove('hidden');
}

function refreshModalSuggestions(item) {
  const primaryContainer = document.getElementById('modal-primary');
  const secondaryContainer = document.getElementById('modal-secondary');
  const warningsContainer = document.getElementById('modal-warnings');
  primaryContainer.innerHTML = '';
  secondaryContainer.innerHTML = '';
  warningsContainer.innerHTML = '';

  if (item.primarySuggestion) {
    const btn = el('button', 'btn btn-accent', item.primarySuggestion.gateId);
    btn.addEventListener('click', () => assignAndClose(item.callsign, item.primarySuggestion.gateId));
    primaryContainer.appendChild(btn);
    document.getElementById('modal-primary-block').style.display = '';
  } else {
    document.getElementById('modal-primary-block').style.display = 'none';
  }

  const secondary = item.secondarySuggestions || [];
  if (secondary.length > 0) {
    for (const s of secondary) {
      const btn = el('button', 'btn btn-ghost', s.gateId);
      btn.addEventListener('click', () => assignAndClose(item.callsign, s.gateId));
      secondaryContainer.appendChild(btn);
    }
    document.getElementById('modal-secondary-block').style.display = '';
  } else {
    document.getElementById('modal-secondary-block').style.display = 'none';
  }

  for (const warning of item.warnings || []) {
    warningsContainer.appendChild(el('div', 'warning-line', warning));
  }
}

async function assignAndClose(callsign, gateId) {
  const ok = await window.aga.assign(callsign, gateId);
  if (ok) closeModal();
}

function closeModal() {
  currentModalCallsign = null;
  document.getElementById('assign-modal').classList.add('hidden');
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

document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('assign-modal').addEventListener('click', (e) => {
  if (e.target.id === 'assign-modal') closeModal();
});
document.getElementById('modal-manual-btn').addEventListener('click', () => {
  const gateId = document.getElementById('modal-manual-input').value.trim().toUpperCase();
  if (currentModalCallsign && gateId) {
    assignAndClose(currentModalCallsign, gateId);
  }
});

window.aga.onStatus(setStatus);
window.aga.onUpdate(render);

setStatus('disconnected');
window.aga.getSnapshot().then((snapshot) => {
  if (snapshot) render(snapshot);
});
