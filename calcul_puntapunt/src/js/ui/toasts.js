// Missatges emergents breus (indicadors de variació, avisos de validació).

import { h } from './dom.js';

const MAX = 3;

export function toast({ level = 'info', title, lines = [], timeout = 6500 }) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const close = h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Tanca', text: '×' });
  const el = h('div', { class: `toast toast-${level}`, role: 'status' },
    h('div', { class: 'toast-body' },
      title ? h('div', { class: 'toast-title', text: title }) : null,
      lines.length ? h('ul', {}, lines.map((l) => h('li', { text: l }))) : null),
    close);
  const remove = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  };
  close.addEventListener('click', remove);
  box.appendChild(el);
  while (box.children.length > MAX) box.firstChild.remove();
  requestAnimationFrame(() => el.classList.add('shown'));
  let timer = setTimeout(remove, timeout);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { timer = setTimeout(remove, 2500); });
}
