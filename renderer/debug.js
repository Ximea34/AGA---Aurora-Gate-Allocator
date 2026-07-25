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

document.getElementById('btn-clear').addEventListener('click', () => {
  body.innerHTML = '';
});
document.getElementById('btn-close').addEventListener('click', () => window.aga.windowAction('close'));
