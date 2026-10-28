// Estat únic compartit pels dos simuladors, amb subscripció i renderitzat agrupat per fotograma.

import { DEFAULT_STATE, cloneState, evaluate } from './engine/model.js';

let state = cloneState(DEFAULT_STATE);
let result = evaluate(state);
const ui = { tab: 'balanc', explain: false, theme: 'dark', reference: null, scenario: null };
const listeners = new Set();
let scheduled = false;
let lastSource = null;

export function getState() { return state; }
export function getResult() { return result; }
export function getUi() { return ui; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const src = lastSource;
    lastSource = null;
    for (const fn of listeners) fn(state, result, ui, src);
  });
}

// mutator: funció que modifica una còpia de l'estat. source: 'user' | 'scenario' | 'anim' ...
export function update(mutator, source = 'user') {
  const next = cloneState(state);
  mutator(next);
  state = next;
  result = evaluate(state);
  lastSource = lastSource === 'user' ? 'user' : source;
  schedule();
}

export function replaceState(next, source = 'scenario') {
  state = cloneState(next);
  result = evaluate(state);
  lastSource = source;
  schedule();
}

export function setUi(patch) {
  Object.assign(ui, patch);
  lastSource = lastSource || 'ui';
  schedule();
}

export function refresh() {
  lastSource = lastSource || 'ui';
  schedule();
}
