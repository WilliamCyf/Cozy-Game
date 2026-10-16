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

export function setText(el, text) {
  const s = String(text);
  if (el._t !== s) { el._t = s; el.textContent = s; }
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
