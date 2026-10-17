// Screens before the game starts: title, "make your islander", and "join family".
import { h, tapButton } from './dom.js';
import { buildLookEditor } from './lookeditor.js';
import { cleanCode } from '../net/transport.js';
import { JOURNAL_FISH } from '../game/data.js';
import { LANGS, getLang, isThai, t } from '../i18n/i18n.js';

export class Screens {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // {getProfile, saveProfile, onHost, onJoin, audio, preview(look|null)}
    this.el = null;
  }

  mount(el) {
    this.hide();
    this.el = el;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
  }
  hide() {
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }

  title(summary) {
    const c = this.ctx;
    const prof = c.getProfile();
    const standalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const sub = !summary ? t('A brand-new island is waiting!')
      : summary.name && summary.name !== 'Cozy Cove'
        ? t('{island} · Day {day} · {n}/{total} fish', { island: summary.name, day: summary.day, n: summary.fish, total: JOURNAL_FISH.length })
        : t('Day {day} · {n}/{total} fish', { day: summary.day, n: summary.fish, total: JOURNAL_FISH.length });
    // language switch: shows the OTHER language, written in that language (so anyone can find it)
    const other = LANGS.find((l) => l.id !== getLang());
    const el = h('div', { class: 'screen title' },
      tapButton({ class: 'lang-btn', ontap: () => { c.audio.ui?.('tap'); c.setLang(other.id); } }, `${other.flag} ${other.label}`),
      h('div', { class: 'logo' },
        h('div', { class: 'logo-sun' }),
        h('div', { class: 'logo-text' }, 'Cozy Cove'), // the logo stays in English (it is the game's name)
        h('div', { class: 'logo-sub' }, t('a little island for the whole family'))),
      h('div', { class: 'title-buttons' },
        tapButton({ class: 'btn primary big', ontap: () => { c.audio.unlock(); this.ensureProfile(() => c.onHost()); } }, h('span', {}, t('🏝️ Play on our island')), h('small', {}, sub)),
        tapButton({ class: 'btn big', ontap: () => { c.audio.unlock(); this.ensureProfile(() => this.join()); } }, h('span', {}, t('🤝 Join family')), h('small', {}, t('Visit someone else’s island'))),
        prof.name ? tapButton({ class: 'btn ghost', ontap: () => this.profile(false, () => this.title(summary)) }, t('👕 {name}’s look', { name: prof.name })) : null),
      !standalone && isIOS ? h('div', { class: 'install' }, h('b', {}, t('Make it an app! ')), t('Tap '), h('span', { class: 'share-ic' }, '⬆︎'), t(' Share, then '), h('b', {}, t('“Add to Home Screen”')), isThai() ? null : '.') : null, // Thai sentences have no full stop
      h('div', { class: 'title-foot' }, t('Up to 4 players · best on the same Wi-Fi')));
    this.mount(el);
  }

  ensureProfile(then) {
    const p = this.ctx.getProfile();
    if (p.name) then();
    else this.profile(true, then);
  }

  profile(first, then) {
    const c = this.ctx;
    const prof = c.getProfile();
    c.preview(prof.look);
    const el = h('div', { class: 'screen profile' },
      h('div', { class: 'screen-card' },
        h('h2', {}, first ? t('Make your islander!') : t('Your look')),
        first ? h('p', { class: 'lead' }, t('Everyone in the family makes their own on their phone.')) : null,
        buildLookEditor({
          profile: prof,
          ownedHats: ['straw', 'sunhat', 'cap', 'beanie', ...(c.ownedHats?.() || [])],
          onChange: (look) => c.preview(look),
          onSave: (p) => { c.saveProfile(p); c.preview(null); then(); },
          saveLabel: first ? t('Let’s go! 🏝️') : t('Save'),
          toast: (msg) => this.flash(msg),
        })));
    this.mount(el);
  }

  join(prefill = '', error = '') {
    const c = this.ctx;
    const input = h('input', { class: 'code-input', maxlength: 9, value: prefill, placeholder: 'CRAB27', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'go', inputmode: 'text' });
    const go = () => {
      const code = cleanCode(input.value);
      if (code.length < 3) { this.flash(t('Type the island code from the host’s phone')); return; }
      input.blur();
      this.connecting(code);
      c.onJoin(code);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    input.addEventListener('input', () => { const v = cleanCode(input.value); if (v !== input.value) input.value = v; });
    const el = h('div', { class: 'screen join' },
      h('div', { class: 'screen-card' },
        h('h2', {}, t('🤝 Join your family')),
        h('p', { class: 'lead' }, t('On the host’s phone, open the menu ☰ → '), h('b', {}, t('Family & Invite')), t(' to see the island code.')),
        input,
        error ? h('p', { class: 'error' }, error) : null,
        h('div', { class: 'row' }, tapButton({ class: 'btn ghost', ontap: () => c.back() }, t('← Back')), tapButton({ class: 'btn primary', ontap: go }, t('Join!')))));
    this.mount(el);
    setTimeout(() => { try { input.focus(); } catch { /* fine */ } }, 350);
  }

  connecting(code) {
    const el = h('div', { class: 'screen join' },
      h('div', { class: 'screen-card center' },
        h('div', { class: 'big-emoji bob' }, '⛵'),
        h('h2', {}, t('Sailing to the island…')),
        h('p', { class: 'lead' }, t('Looking for island {code}', { code: code.replace(/(\d+)$/, ' $1') })),
        h('div', { class: 'spinner' }),
        tapButton({ class: 'btn ghost', ontap: () => this.ctx.back() }, t('Cancel'))));
    this.mount(el);
  }

  message(html, buttons) {
    const el = h('div', { class: 'screen join' }, h('div', { class: 'screen-card center' }, h('div', { html }), h('div', { class: 'row' }, buttons.map(([l, fn, cls]) => tapButton({ class: 'btn ' + (cls || ''), ontap: fn }, l)))));
    this.mount(el);
  }

  flash(text) {
    const el = h('div', { class: 'toast in solo' }, text);
    this.root.appendChild(el);
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 2000);
  }
}
