// Screens before the game starts: title, "make your islander", and "join family".
import { h, tapButton } from './dom.js';
import { buildLookEditor } from './lookeditor.js';
import { CODE_WORDS, splitCode } from '../net/transport.js';
import { JOURNAL_FISH } from '../game/data.js';
import { LANGS, getLang, isThai, t, versionText, islandName } from '../i18n/i18n.js';

// "TURTLE482" -> "🐢 TURTLE 482"
export function prettyCode(code) {
  const sc = splitCode(code);
  return sc ? `${sc.pic ? sc.pic + ' ' : ''}${sc.word} ${sc.num}` : String(code || '');
}

export class Screens {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // {getProfile, saveProfile, onPlay, onNew, onJoin, onBack, audio, preview(look|null)}
    this.el = null;
  }

  // kind: which screen is showing ('title', 'profile', 'join'…), so an update never interrupts typing
  mount(el, kind = '') {
    this.hide();
    this.kind = kind;
    this.el = el;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
  }
  hide() {
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    this.kind = '';
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }

  // summary: {island: {name, day, fish} | null, back: {vid, name, day} | null}
  title(summary) {
    const c = this.ctx;
    const prof = c.getProfile();
    const standalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isl = summary?.island, back = summary?.back;
    const sub = !isl ? ''
      : isl.name && isl.name !== 'Cozy Cove'
        ? t('{island} · Day {day} · {n}/{total} fish', { island: isl.name, day: isl.day, n: isl.fish, total: JOURNAL_FISH.length })
        : t('Day {day} · {n}/{total} fish', { day: isl.day, n: isl.fish, total: JOURNAL_FISH.length });
    const tap = (fn) => () => { c.audio.unlock(); this.ensureProfile(fn); };
    // with an island: play it (any time, even when nobody else is on), or move to another family's.
    // Without: join the family's island (the usual way in), or start a brand-new one.
    const buttons = isl
      ? [tapButton({ class: 'btn primary big', ontap: tap(() => c.onPlay()) }, h('span', {}, t('🏝️ Play')), h('small', {}, sub)),
        tapButton({ class: 'btn big', ontap: tap(() => this.join()) }, h('span', {}, t('🤝 Join another family')), h('small', {}, t('Move to a family member’s island')))]
      : [tapButton({ class: 'btn primary big', ontap: tap(() => this.join()) }, h('span', {}, t('🤝 Join your family')), h('small', {}, t('Play on your family’s island'))),
        tapButton({ class: 'btn ghost', ontap: tap(() => this.newIsland()) }, t('🌱 Start a new family island'))];
    if (back) buttons.push(tapButton({ class: 'btn ghost small', ontap: tap(() => c.onBack(back.vid)) }, t('↩️ Back to {island} · Day {day}', { island: islandName(back.name), day: back.day })));
    // language switch: shows the OTHER language, written in that language (so anyone can find it)
    const other = LANGS.find((l) => l.id !== getLang());
    const el = h('div', { class: 'screen title' },
      tapButton({ class: 'lang-btn', ontap: () => { c.audio.ui?.('tap'); c.setLang(other.id); } }, `${other.flag} ${other.label}`),
      h('div', { class: 'logo' },
        h('div', { class: 'logo-sun' }),
        h('div', { class: 'logo-text' }, 'Cozy Cove'), // the logo stays in English (it is the game's name)
        h('div', { class: 'logo-sub' }, t('a little island for the whole family'))),
      h('div', { class: 'title-buttons' }, ...buttons,
        prof.name ? tapButton({ class: 'btn ghost', ontap: () => this.profile(false, () => this.title(summary)) }, t('👕 {name}’s look', { name: prof.name })) : null),
      !standalone && isIOS ? h('div', { class: 'install' }, h('b', {}, t('Make it an app! ')), t('Tap '), h('span', { class: 'share-ic' }, '⬆︎'), t(' Share, then '), h('b', {}, t('“Add to Home Screen”')), isThai() ? null : '.',
        // the iPhone keeps a Home Screen app's things apart from Safari's: say so before anyone thinks the island was lost
        isl ? h('small', { class: 'install-note' }, t('The Home Screen app keeps its own copy: open it once and join your family there too.')) : null) : null, // Thai sentences have no full stop
      h('div', { class: 'title-foot' }, t('Up to 4 players · best on the same Wi-Fi'), h('small', { class: 'ver' }, t('Version: {when}', { when: versionText() }))));
    this.mount(el, 'title');
  }

  // The very first screen on a brand-new phone: choose a language. Everything is written in BOTH
  // languages here, so whoever holds the phone can read it. The phone's own language is suggested.
  langChooser(done) {
    const suggested = getLang();
    const order = [...LANGS].sort((a, b) => (a.id === suggested ? -1 : b.id === suggested ? 1 : 0));
    const el = h('div', { class: 'screen lang-screen' },
      h('div', { class: 'screen-card center lang-card' },
        h('div', { class: 'big-emoji bob' }, '🏝️'),
        h('h2', { 'data-noi18n': '' }, 'เลือกภาษา', h('br'), h('small', {}, 'Choose your language')),
        h('div', { class: 'lang-pick' }, order.map((L) => tapButton({ class: 'btn big' + (L.id === suggested ? ' primary' : ''), ontap: () => { this.ctx.audio.unlock(); done(L.id); } },
          h('span', { class: 'flag' }, L.flag), h('span', {}, L.label)))),
        h('p', { class: 'lead', 'data-noi18n': '' }, 'เปลี่ยนได้ทุกเมื่อในเมนู ☰', h('br'), 'You can change it any time in the menu ☰')));
    this.mount(el, 'lang');
  }

  // "Start a new family island": a short question first, because most people want to JOIN their
  // family's island instead (one island for the whole family).
  newIsland() {
    const c = this.ctx;
    const el = h('div', { class: 'screen join' },
      h('div', { class: 'screen-card center' },
        h('div', { class: 'big-emoji bob' }, '🌱'),
        h('h2', {}, t('Start a new family island?')),
        h('p', { class: 'lead' }, t('If someone in your family already plays Cozy Cove, join their island instead: the whole family shares one island.')),
        h('div', { class: 'col-buttons' },
          tapButton({ class: 'btn primary', ontap: () => c.onNew() }, t('🌱 Start a new island')),
          tapButton({ class: 'btn', ontap: () => this.join() }, t('🤝 Join your family')),
          tapButton({ class: 'btn ghost', ontap: () => c.back() }, t('← Back')))));
    this.mount(el, 'new');
  }

  // The first time this version opens an island from before family islands: is it the family's island?
  familyChoice(info, { ours, join }) {
    const el = h('div', { class: 'screen join' },
      h('div', { class: 'screen-card center' },
        h('div', { class: 'big-emoji bob' }, '🏡'),
        h('h2', {}, t('Family islands are here!')),
        h('p', { class: 'lead' }, t('Now every family member’s phone keeps the island, and anyone can play any time, even when the others are away.')),
        h('p', { class: 'lead' }, h('b', {}, t('Is {island} (Day {day}) your family’s island?', { island: islandName(info.name), day: info.day }))),
        h('div', { class: 'col-buttons' },
          tapButton({ class: 'btn primary', ontap: () => { this.ctx.audio.unlock(); ours(); } }, t('🏡 Yes, this is our family island')),
          tapButton({ class: 'btn', ontap: () => { this.ctx.audio.unlock(); join(); } }, t('🤝 No, I’ll join my family’s island'))),
        h('p', { class: 'lead small' }, t('If you join your family, this island stays safe on this phone. You can go back to it from the start screen.'))));
    this.mount(el, 'choice');
  }

  // Joining another family while this phone has an island: say what happens, then Move or Stay.
  moveCard(info, here, { move, stay }) {
    const faces = (info.faces || []).filter(Boolean).slice(0, 6).join(', ');
    const el = h('div', { class: 'screen join' },
      h('div', { class: 'screen-card center' },
        h('div', { class: 'big-emoji bob' }, '🧳'),
        h('h2', {}, t('Move to {island}?', { island: islandName(info.name) })),
        h('p', { class: 'lead' }, h('b', {}, t('Day {day} · {n}/{total} fish', { day: info.day, n: info.fish, total: JOURNAL_FISH.length })), faces ? h('br') : null, faces),
        h('p', { class: 'lead' }, t('Your island {island} (Day {day}) stays safe on this phone: you can go back to it any time from the start screen.', { island: islandName(here.name), day: here.day })),
        h('div', { class: 'row' },
          tapButton({ class: 'btn ghost', ontap: () => stay() }, t('Stay')),
          tapButton({ class: 'btn primary', ontap: () => { this.ctx.audio.unlock(); move(); } }, t('🧳 Move')))));
    this.mount(el, 'move');
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
    this.mount(el, 'profile');
  }

  // Join: tap the picture shown on a family member's phone, then type its 3 numbers (no English needed).
  join(prefill = '', error = '') {
    const c = this.ctx;
    const pre = splitCode(prefill);
    let word = pre?.pic ? pre.word : null;
    const num = h('input', { class: 'num-input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 3, value: pre?.pic ? pre.num : '', placeholder: '123', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': t('The 3 numbers') });
    const chosen = h('span', { class: 'num-pic' }, pre?.pic || '❔');
    let going = null;
    const go = () => {
      clearTimeout(going);
      const digits = num.value.replace(/\D/g, '');
      if (!word) { num.blur(); this.flash(t('First tap the picture you see on the other phone')); return; }
      if (digits.length !== 3) { this.flash(t('Type the 3 numbers next to the picture')); num.focus(); return; }
      num.blur();
      const code = word + digits;
      this.connecting(code);
      c.onJoin(code);
    };
    const grid = h('div', { class: 'pic-grid' });
    for (const [w, pic] of CODE_WORDS) {
      const b = tapButton({ class: 'pic' + (w === word ? ' on' : ''), 'aria-label': w, ontap: () => {
        word = w;
        for (const x of grid.children) x.classList.toggle('on', x === b);
        chosen.textContent = pic;
        c.audio.ui?.('tap');
        if (num.value.replace(/\D/g, '').length === 3) go();
        else try { num.focus(); } catch { /* fine */ }
      } }, pic);
      grid.appendChild(b);
    }
    // the number keypad has no "Go" key on iPhone: join by itself once all 3 numbers are typed
    num.addEventListener('input', () => {
      const v = num.value.replace(/\D/g, '').slice(0, 3);
      if (v !== num.value) num.value = v;
      clearTimeout(going);
      if (v.length === 3) going = setTimeout(go, 450);
    });
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const el = h('div', { class: 'screen join' },
      h('div', { class: 'screen-card' },
        h('h2', {}, t('🤝 Join your family')),
        h('p', { class: 'lead' }, t('On a family member’s phone, open the menu ☰ → '), h('b', {}, t('Family & Invite')), t(' to see the island code.')),
        h('div', { class: 'step' }, h('b', {}, '1'), t('Tap the same picture')),
        grid,
        h('div', { class: 'step' }, h('b', {}, '2'), t('Type the 3 numbers')),
        h('div', { class: 'num-row' }, chosen, num),
        error ? h('p', { class: 'error' }, error) : null,
        h('div', { class: 'row' }, tapButton({ class: 'btn ghost', ontap: () => { clearTimeout(going); c.back(); } }, t('← Back')), tapButton({ class: 'btn primary', ontap: go }, t('Join!')))));
    this.mount(el, 'join');
  }

  connecting(code) {
    const el = h('div', { class: 'screen join' },
      h('div', { class: 'screen-card center' },
        h('div', { class: 'big-emoji bob' }, '⛵'),
        h('h2', {}, t('Sailing to the island…')),
        h('p', { class: 'lead' }, t('Looking for island {code}', { code: prettyCode(code) })),
        h('div', { class: 'spinner' }),
        tapButton({ class: 'btn ghost', ontap: () => this.ctx.back() }, t('Cancel'))));
    this.mount(el, 'connecting');
  }

  message(html, buttons) {
    const el = h('div', { class: 'screen join' }, h('div', { class: 'screen-card center' }, h('div', { html }), h('div', { class: 'row' }, buttons.map(([l, fn, cls]) => tapButton({ class: 'btn ' + (cls || ''), ontap: fn }, l)))));
    this.mount(el, 'message');
  }

  flash(text) {
    const el = h('div', { class: 'toast in solo' }, text);
    this.root.appendChild(el);
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 2000);
  }
}
