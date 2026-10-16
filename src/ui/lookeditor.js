// The "make your islander" editor (used on first launch and in the My Look panel).
import { h, tapButton } from './dom.js';
import { HATS, SKIN_TONES, SHIRT_COLORS, ACCENT_COLORS, HAIR_COLORS } from '../entities/character.js';

export const hatEmoji = (id) => ({ straw: '👒', sunhat: '🌸', cap: '🧢', beanie: '🧶', bunny: '🐰', cat: '🐱', frog: '🐸', chef: '👨‍🍳', pirate: '🏴‍☠️', flowers: '💐', crown: '👑' }[id] || '🎩');

export function buildLookEditor({ profile, ownedHats, onChange, onSave, saveLabel = 'Save', toast }) {
  const look = { ...profile.look };
  let name = profile.name || '';
  const wrap = h('div', { class: 'look-editor' });
  const input = h('input', { class: 'name-input', maxlength: 12, value: name, placeholder: 'Type your name', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done' });
  input.addEventListener('input', () => { name = input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  wrap.append(h('label', { class: 'field' }, h('span', {}, 'Name'), input));
  const swatches = (label, key, list) => h('div', { class: 'field' }, h('span', {}, label), h('div', { class: 'swatches' }, list.map((c) => {
    const el = tapButton({ class: 'sw' + (look[key] === c ? ' on' : ''), style: { background: c }, 'aria-label': c, ontap: () => {
      look[key] = c;
      for (const x of el.parentNode.children) x.classList.remove('on');
      el.classList.add('on');
      onChange?.({ ...look });
    } });
    return el;
  })));
  wrap.append(swatches('Skin', 'skin', SKIN_TONES), swatches('Shirt', 'shirt', SHIRT_COLORS), swatches('Favourite colour', 'accent', ACCENT_COLORS), swatches('Hair', 'hair', HAIR_COLORS));
  wrap.append(h('div', { class: 'field' }, h('span', {}, 'Hat'), h('div', { class: 'hats' }, HATS.map((hat) => {
    const has = ownedHats.includes(hat.id);
    const el = tapButton({ class: 'hat' + (look.hat === hat.id ? ' on' : '') + (has ? '' : ' locked'), ontap: () => {
      if (!has) { toast?.(`Unlock the ${hat.name} at Captain Shelly’s shop!`, '🔒'); return; }
      look.hat = hat.id;
      for (const x of el.parentNode.children) x.classList.remove('on');
      el.classList.add('on');
      onChange?.({ ...look });
    } }, h('span', {}, has ? hatEmoji(hat.id) : '🔒'), h('small', {}, hat.name));
    return el;
  }))));
  wrap.append(tapButton({ class: 'btn primary wide', ontap: () => {
    input.blur();
    const clean = (name || '').trim().replace(/\s+/g, ' ').slice(0, 12) || 'Islander';
    onSave({ ...profile, name: clean, look: { ...look } });
  } }, saveLabel));
  return wrap;
}
