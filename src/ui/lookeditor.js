// The "make your islander" editor (used on first launch and in the My Look panel).
import { h, tapButton } from './dom.js';
import { HATS, SKIN_TONES, SHIRT_COLORS, ACCENT_COLORS, HAIR_COLORS } from '../entities/character.js';
import { t } from '../i18n/i18n.js';
import { cleanName, limitLetters } from '../util/text.js';

export const hatEmoji = (id) => ({ straw: '👒', sunhat: '🌸', cap: '🧢', beanie: '🧶', bunny: '🐰', cat: '🐱', frog: '🐸', chef: '👨‍🍳', pirate: '🏴‍☠️', flowers: '💐', crown: '👑' }[id] || '🎩');

export function buildLookEditor({ profile, ownedHats, onChange, onSave, saveLabel = t('Save'), toast }) {
  const look = { ...profile.look };
  let name = profile.name || '';
  const wrap = h('div', { class: 'look-editor' });
  const input = h('input', { class: 'name-input', maxlength: 40, value: name, placeholder: t('Type your name'), autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done' });
  limitLetters(input, 12); // stops at 12 letters while typing (what is saved), Thai marks included
  input.addEventListener('input', () => { name = input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  wrap.append(h('label', { class: 'field' }, h('span', {}, t('Name')), input));
  const swatches = (label, key, list) => h('div', { class: 'field' }, h('span', {}, label), h('div', { class: 'swatches' }, list.map((c) => {
    const el = tapButton({ class: 'sw' + (look[key] === c ? ' on' : ''), style: { background: c }, 'aria-label': c, ontap: () => {
      look[key] = c;
      for (const x of el.parentNode.children) x.classList.remove('on');
      el.classList.add('on');
      onChange?.({ ...look });
    } });
    return el;
  })));
  wrap.append(swatches(t('Skin'), 'skin', SKIN_TONES), swatches(t('Shirt'), 'shirt', SHIRT_COLORS), swatches(t('Favourite colour'), 'accent', ACCENT_COLORS), swatches(t('Hair'), 'hair', HAIR_COLORS));
  wrap.append(h('div', { class: 'field' }, h('span', {}, t('Hat')), h('div', { class: 'hats' }, HATS.map((hat) => {
    const has = ownedHats.includes(hat.id);
    const el = tapButton({ class: 'hat' + (look.hat === hat.id ? ' on' : '') + (has ? '' : ' locked'), ontap: () => {
      if (!has) { toast?.(t('Unlock the {name} at Captain Shelly’s shop!', { name: t(hat.name) }), '🔒'); return; }
      look.hat = hat.id;
      for (const x of el.parentNode.children) x.classList.remove('on');
      el.classList.add('on');
      onChange?.({ ...look });
    } }, h('span', {}, has ? hatEmoji(hat.id) : '🔒'), h('small', {}, t(hat.name)));
    return el;
  }))));
  wrap.append(tapButton({ class: 'btn primary wide', ontap: () => {
    input.blur();
    const clean = cleanName(name, t('Islander')); // 12 letters (a Thai letter keeps its marks)
    onSave({ ...profile, name: clean, look: { ...look } });
  } }, saveLabel));
  return wrap;
}
