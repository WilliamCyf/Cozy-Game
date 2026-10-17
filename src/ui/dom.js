// Tiny helper to build page elements:  h('div', {class: 'x', onclick: fn}, 'text', child…)
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(3)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  return el;
}

// Buttons that react instantly to a finger (no 300 ms wait) and can't double-fire.
export function tapButton(attrs, ...kids) {
  const { ontap, ...rest } = attrs;
  const el = h('button', { type: 'button', ...rest }, ...kids);
  let down = false;
  el.addEventListener('pointerdown', (e) => { down = true; el.classList.add('pressed'); e.stopPropagation(); });
  el.addEventListener('pointerleave', () => { down = false; el.classList.remove('pressed'); });
  el.addEventListener('pointercancel', () => { down = false; el.classList.remove('pressed'); });
  el.addEventListener('pointerup', (e) => {
    el.classList.remove('pressed');
    if (!down) return;
    down = false;
    e.stopPropagation();
    if (!el.disabled) ontap?.(e);
  });
  el.addEventListener('click', (e) => e.preventDefault());
  return el;
}

// Give a text box the keyboard from inside a button's tap. A moment after the tap, the phone also
// sends an old-style "mouse press" for it, which lands on whatever is now under the finger and would
// take the keyboard away again: that one press is ignored, and the box is given the keyboard again.
export function focusAfterTap(input) {
  if (!input) return;
  input.focus();
  const stop = (e) => { if (e.target !== input) e.preventDefault(); };
  const again = () => { if (input.isConnected) input.focus(); };
  document.addEventListener('mousedown', stop, true);
  document.addEventListener('click', again, { capture: true, once: true });
  setTimeout(() => { document.removeEventListener('mousedown', stop, true); document.removeEventListener('click', again, true); }, 700);
}

export function setText(el, text) {
  const s = String(text);
  if (el._t !== s) { el._t = s; el.textContent = s; }
}

// First letter of a name (for the little face circles). Thai initials are written with the first
// consonant only (แม่ -> ม, น้อง -> น), so skip a vowel written before it and leave off tone marks.
const THAI_INITIAL = /^[\u0E40-\u0E44]?([\u0E01-\u0E2E])/;
export const firstLetter = (name) => {
  const s = String(name || '').trim() || '?';
  const m = THAI_INITIAL.exec(s);
  return m ? m[1] : Array.from(s)[0];
};

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
