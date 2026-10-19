// The on-screen interface (HUD): clock, coins, family, the big action button, toasts,
// pop-up sheets and the fishing meters. Text is only rewritten when it changes.
import { h, tapButton, setText, firstLetter } from './dom.js';
import { formatClock, timeIcon } from '../game/daynight.js';
import { FS } from '../game/fishing.js';
import { BAITS, FISH_BY_ID, RARITY, ITEMS, JOURNAL_FISH } from '../game/data.js';
import { fishSVG } from './fishart.js';
import { t, tr, N_, hasThai } from '../i18n/i18n.js';
import { canSpeak, speak, stopSpeaking } from '../audio/speech.js';

// Text handed over by other parts of the game (button labels, fishing hints, messages) may be a T()
// message, plain English (translated here) or already translated (left as it is).
const LATIN = /[A-Za-z]/;
function say(x) {
  if (x && typeof x === 'object') return tr(x);
  if (typeof x !== 'string' || !LATIN.test(x) || hasThai(x)) return x;
  return t(x);
}
const initial = (name) => firstLetter(name).toUpperCase(); // for the family dots
// what the big button says while fishing (one table made once, not a new one every frame)
const FISH_LABEL = [null, N_('Let go!'), '…', N_('Reel in'), N_('Hook it!'), N_('Reel!'), N_('Yay!')];

export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.sheet = null;
    this.toasts = [];
    this.cardOpen = false;
    this.hud = h('div', { class: 'hud' });
    root.appendChild(this.hud);
    this.build();
  }

  get modalOpen() { return !!this.sheet; }

  build() {
    const g = this.game;
    // top bar
    this.clockIcon = h('span', { class: 'ic' }, '☀️');
    this.clockText = h('span', {}, formatClock(8));
    this.dayText = h('small', {}, t('Day {n}', { n: 1 }));
    this.clock = h('div', { class: 'chip clock' }, this.clockIcon, h('span', { class: 'col' }, this.clockText, this.dayText));
    this.coinsText = h('span', {}, '0');
    this.coins = tapButton({ class: 'chip coins', ontap: () => g.openPanel('basket') }, h('span', { class: 'ic' }, '🪙'), this.coinsText);
    this.family = tapButton({ class: 'family', ontap: () => g.openPanel('family') });
    this.menuBtn = tapButton({ class: 'round menu', 'aria-label': t('Menu'), ontap: () => g.openPanel('menu') }, h('span', {}, '☰'));
    this.netDot = h('i', { class: 'net-dot' });
    this.hud.append(h('div', { class: 'top' }, this.clock, this.family, h('div', { class: 'top-right' }, this.coins, this.menuBtn)));
    this.toastBox = h('div', { class: 'toasts' });
    this.hintBox = h('div', { class: 'hint hidden' });
    this.hud.append(this.toastBox, this.hintBox);

    // bottom-right: action button + small buttons
    this.actIcon = h('span', { class: 'act-ic' }, '🎣');
    this.actLabel = h('span', { class: 'act-label' }, '');
    this.action = h('button', { class: 'action', type: 'button', 'aria-label': t('Action') }, h('i', { class: 'ring' }), this.actIcon, this.actLabel);
    const down = (e) => { e.preventDefault(); e.stopPropagation(); this.action.classList.add('pressed'); g.audio.unlock(); g.actionDown(); };
    const up = (e) => { e.preventDefault(); e.stopPropagation(); this.action.classList.remove('pressed'); g.actionUp(); };
    this.action.addEventListener('pointerdown', down);
    this.action.addEventListener('pointerup', up);
    this.action.addEventListener('pointercancel', up);
    this.action.addEventListener('lostpointercapture', up);
    this.action.addEventListener('pointerdown', (e) => { try { this.action.setPointerCapture(e.pointerId); } catch { /* fine */ } });
    window.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !this.modalOpen && !(e.target?.tagName === 'INPUT')) { e.preventDefault(); down(e); } });
    window.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(e); });
    this.emoteBtn = tapButton({ class: 'round small', 'aria-label': t('Emotes'), ontap: () => this.toggleEmotes() }, '😊');
    this.basketBtn = tapButton({ class: 'round small', 'aria-label': t('Basket'), ontap: () => g.openPanel('basket') }, '🧺');
    this.journalBtn = tapButton({ class: 'round small', 'aria-label': t('Fish journal'), ontap: () => g.openPanel('journal') }, '📖');
    this.baitBtn = tapButton({ class: 'bait hidden', ontap: () => this.cycleBait() }, h('span', { class: 'ic' }, '🪱'), h('span', { class: 'bait-name' }, t('Worm')));
    this.power = h('div', { class: 'power hidden' }, h('i'));
    this.reel = h('div', { class: 'reel hidden' }, h('div', { class: 'reel-hint' }, t('Hold to reel!')), h('div', { class: 'tension' }, h('i')));
    this.bite = h('div', { class: 'bite hidden' }, '!');
    this.emotes = h('div', { class: 'emotes hidden' },
      ...[['wave', '👋'], ['heart', '❤️'], ['dance', '💃'], ['cheer', '🎉'], ['sit', '🪑'], ['sleep', '😴']].map(([e, ic]) =>
        tapButton({ class: 'emote', ontap: () => { this.toggleEmotes(false); g.emote(e); } }, ic)));
    this.hud.append(h('div', { class: 'bottom-right' },
      this.emotes,
      h('div', { class: 'side' }, this.journalBtn, this.basketBtn, this.emoteBtn),
      h('div', { class: 'act-wrap' }, this.bite, this.power, this.action, this.reel, this.baitBtn)));
    this.fpsBox = h('div', { class: 'fps hidden' });
    this.hud.append(this.fpsBox);
    this.overlay = h('div', { class: 'overlay hidden' });
    this.root.append(this.overlay);
  }

  toggleEmotes(force) {
    const show = force ?? this.emotes.classList.contains('hidden');
    this.emotes.classList.toggle('hidden', !show);
    if (show) this.game.audio.ui('tap');
  }

  cycleBait() {
    const g = this.game;
    const basket = g.session.state.basket;
    const avail = BAITS.filter((b) => b.free || (basket[b.item] || 0) > 0);
    const i = avail.findIndex((b) => b.id === g.fishing.bait);
    const next = avail[(i + 1) % avail.length];
    g.fishing.bait = next.id;
    g.audio.ui('tick');
    const msg = next.item
      ? t('{name} ({n} left): {desc}', { name: t(next.name), n: basket[next.item], desc: t(next.desc) })
      : t('{name}: {desc}', { name: t(next.name), desc: t(next.desc) });
    this.toast(msg, next.emoji, 1800);
  }

  // ------------------------------------------------------------------ per frame
  update() {
    const g = this.game;
    const s = g.session.state;
    if (!s) return;
    // the clock only changes every 10 game-minutes: rebuild its text only then (no new strings every frame)
    const clockKey = Math.floor(s.time * 6) * 2 + (s.weather === 'rain' ? 1 : 0);
    if (clockKey !== this._clockKey) {
      this._clockKey = clockKey;
      setText(this.clockText, formatClock(s.time));
      setText(this.clockIcon, timeIcon(s.time, s.weather === 'rain'));
    }
    if (s.day !== this._day) { this._day = s.day; setText(this.dayText, t('Day {n}', { n: s.day })); }
    if (this.coinsText._t !== String(s.coins)) {
      setText(this.coinsText, s.coins);
      this.coins.classList.remove('bump');
      void this.coins.offsetWidth;
      this.coins.classList.add('bump');
    }
    // action button
    const fs = g.fishing.state;
    let ic, label, dim = false, kind;
    if (fs !== FS.NONE) {
      kind = 'fish';
      ic = '🎣';
      label = fs === FS.REEL && g.fishing.mg.pulling ? 'Wait…' : FISH_LABEL[fs];
      if (fs === FS.BITE) ic = '❗';
    } else {
      const tg = g.interact.current;
      if (tg) { ic = tg.icon; label = tg.label; dim = !!tg.dim; kind = tg.type; }
      else { ic = '👣'; label = 'Explore'; dim = true; kind = 'none'; }
    }
    if (ic !== this._actIc || label !== this._actLabel || dim !== this._actDim) { // (no new strings every frame)
      this._actIc = ic; this._actLabel = label; this._actDim = dim;
      setText(this.actIcon, ic);
      setText(this.actLabel, say(label)); // translated only when the label changes
      this.action.classList.toggle('dim', dim);
      this.action.classList.toggle('alert', fs === FS.BITE);
    }
    if (fs !== this._fs) { this._fs = fs; this.hud.classList.toggle('fishing', fs !== FS.NONE); }
    // bait selector shows when you could fish
    const showBait = (kind === 'fish' && fs <= FS.WAIT);
    this.baitBtn.classList.toggle('hidden', !showBait);
    if (showBait && g.fishing.bait !== this._baitId) { // only when the bait changes
      this._baitId = g.fishing.bait;
      const b = BAITS.find((x) => x.id === g.fishing.bait) || BAITS[0];
      setText(this.baitBtn.firstChild, b.emoji);
      setText(this.baitBtn.lastChild, t(b.name));
    }
    // fishing meters
    this.power.classList.toggle('hidden', fs !== FS.CHARGE);
    if (fs === FS.CHARGE) {
      const pw = Math.round(g.fishing.power * 100); // only touch the meter when it really moved
      if (pw !== this._pw) { this._pw = pw; this.power.firstChild.style.transform = `scaleY(${pw / 100})`; }
    }
    const reeling = fs === FS.REEL;
    this.reel.classList.toggle('hidden', !reeling);
    this.action.classList.toggle('reeling', reeling);
    if (reeling) {
      const mg = g.fishing.mg;
      const p = Math.round(mg.p * 100);
      if (p !== this._p) { this._p = p; this.action.style.setProperty('--p', p + '%'); }
      const tn = Math.round(mg.tension * 100);
      if (tn !== this._tn) {
        this._tn = tn;
        const bar = this.reel.lastChild.firstChild;
        bar.style.transform = `scaleX(${mg.tension.toFixed(3)})`;
        bar.style.background = mg.tension > 0.7 ? '#e8574a' : mg.tension > 0.4 ? '#f5a23a' : '#7cc95a';
      }
      if (mg.hint !== this._reelHint) { this._reelHint = mg.hint; setText(this.reel.firstChild, say(mg.hint)); }
      this.reel.firstChild.classList.toggle('warn', mg.pulling);
    }
  }

  // The language changed: rewrite every label on screen in the new language, right away.
  relabel() {
    this._day = null; this._clockKey = null; this._actLabel = null; this._reelHint = null; this._hintIn = null; this._hint = null; this._baitId = null;
    this.closeCatch?.(); // (a catch card was written in the old language)
    // messages already on screen were written in the old language: let them fade away now
    for (const el of this.toasts) { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 400); }
    this.toasts = [];
    if (this.bannerEl) { const b = this.bannerEl; this.bannerEl = null; b.classList.remove('in'); setTimeout(() => b.remove(), 400); this.toastBox.classList.remove('below-banner'); }
    for (const [el, key] of [[this.menuBtn, 'Menu'], [this.action, 'Action'], [this.emoteBtn, 'Emotes'], [this.basketBtn, 'Basket'], [this.journalBtn, 'Fish journal']]) el.setAttribute('aria-label', t(key));
    if (this.updatePill) setText(this.updatePill.lastChild, t('New version ready · tap to update'));
    this.refreshSheet(); // an open panel (e.g. Settings) is redrawn in the new language too
    this.update();
  }

  // A new version of the game has arrived: a small button to switch to it when it suits the player.
  updateReady(apply) {
    if (this.updatePill) return;
    this.updatePill = tapButton({ class: 'update-pill', ontap: () => { this.updatePill.classList.add('busy'); apply(); } }, h('span', { class: 'ic' }, '✨'), h('span', {}, t('New version ready · tap to update')));
    this.toastBox.prepend(this.updatePill); // at the top of the message column, messages stack below
    requestAnimationFrame(() => this.updatePill.classList.add('in'));
  }

  biteAlert(on) {
    this.bite.classList.toggle('hidden', !on);
  }

  // The little dot on the family faces: green = together with the family (or ready for them), yellow
  // and blinking = finding the family, grey = no internet (playing on this phone), 📲 = update needed.
  // (Asked a few times a second: nothing changes unless the state did.)
  setNet(state) {
    if (state === this.netState) return;
    this.netState = state;
    this.netDot.className = 'net-dot ' + state;
    this.netDot.textContent = state === 'update' ? '📲' : '';
  }

  renderFamily() {
    const g = this.game;
    this.family.innerHTML = '';
    for (const [pid, o] of g.session.online) {
      const look = o.look || {};
      const me = pid === g.session.pid;
      this.family.appendChild(h('span', { class: 'face' + (me ? ' me' : ''), style: { borderColor: look.accent || '#3aa39a', background: look.shirt || '#fff' } }, initial(o.name)));
    }
    if (g.session.online.size < 4) this.family.appendChild(h('span', { class: 'face add' }, '+'));
    this.family.appendChild(this.netDot);
  }

  // ------------------------------------------------------------------ toasts
  // text: finished text, or a T() message (turned into this phone's language)
  toast(text, icon = '✨', ms = 2600) {
    const el = h('div', { class: 'toast' }, h('span', { class: 'ic' }, icon), h('span', {}, say(text)));
    this.toastBox.appendChild(el);
    this.toasts.push(el);
    while (this.toasts.length > 3) this.toasts.shift().remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => { el.remove(); this.toasts = this.toasts.filter((x) => x !== el); }, 400);
    }, ms);
  }

  hint(text) {
    if (!text) { this.hintBox.classList.add('hidden'); this._hint = null; this._hintIn = null; return; }
    if (this._hintIn === text) return; // called every frame: nothing to do while the hint stays the same
    this._hintIn = text;
    const s = say(text);
    if (this._hint === s) return;
    this._hint = s;
    this.hintBox.textContent = s;
    this.hintBox.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ sheets (pop-up panels)
  // keep: true (or a function saying "right now") for pages where the player types or drags something:
  // news from the island (a fish caught by someone else…) then doesn't redraw the page under their finger.
  openSheet({ title, icon = '', build, onClose, cls = '', keep = false }) {
    this.closeSheet(true);
    this.toggleEmotes(false);
    const body = h('div', { class: 'sheet-body' });
    const close = () => this.closeSheet();
    // title: text, or a little function that makes it (so the title can be redrawn in a new language)
    const titleText = () => (typeof title === 'function' ? title() : title);
    const titleEl = h('span', {}, titleText());
    const panel = h('div', { class: 'sheet ' + cls },
      h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, icon ? h('span', { class: 'ic' }, icon) : null, titleEl), tapButton({ class: 'x', 'aria-label': t('Close'), ontap: close }, '✕')),
      body);
    const back = h('div', { class: 'sheet-back' });
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
    back.appendChild(panel);
    this.root.appendChild(back);
    this.sheet = { back, body, onClose, keep, refresh: () => { setText(titleEl, titleText()); const y = body.scrollTop; body.innerHTML = ''; build(body, close); body.scrollTop = y; } };
    build(body, close);
    requestAnimationFrame(() => back.classList.add('in'));
    this.game.audio.ui('open');
    this.game.input.reset();
    return this.sheet;
  }
  refreshSheet() { this.sheet?.refresh(); }
  closeSheet(silent = false) {
    if (!this.sheet) return;
    const { back, onClose } = this.sheet;
    this.sheet = null;
    back.classList.remove('in');
    setTimeout(() => back.remove(), 250);
    onClose?.();
    if (!silent) this.game.audio.ui('close');
  }

  // ------------------------------------------------------------------ catch card
  showCatch({ fish, extra, size, res }) {
    const g = this.game;
    let art, title, sub = '', badges = [];
    if (extra === 'bottle') {
      art = h('div', { class: 'big-emoji' }, '🍾');
      title = t('Message in a Bottle');
      sub = tr(res?.note);
    } else if (extra === 'chest') {
      art = h('div', { class: 'big-emoji' }, '🧰');
      title = t('Treasure Chest!');
      sub = t('+{n} coins for the family jar!', { n: res?.coins || 0 });
    } else if (extra === 'seaglass') {
      art = h('div', { class: 'big-emoji' }, '💎');
      title = t('Sea Glass');
      sub = t('Shiny! The lighthouse needs these.');
    } else {
      const f = FISH_BY_ID[fish];
      art = h('div', { class: 'card-art', html: fishSVG(fish) });
      title = t(f.name);
      const r = RARITY[f.rar];
      sub = f.junk ? t('Hmm… not a fish. Someone lost a boot!') : t('{n} cm', { n: size });
      if (!f.junk) badges.push(h('span', { class: 'stars', style: { color: r.color } }, '★'.repeat(r.stars) + '☆'.repeat(4 - r.stars), ' ', t(r.label)));
      if (res?.isNew) badges.push(h('span', { class: 'badge new' }, t('NEW! {n}/{total}', { n: Object.keys(g.session.state.journal).length, total: JOURNAL_FISH.length })));
      if (res?.record) badges.push(h('span', { class: 'badge rec' }, t('Family record!')));
    }
    this.closeCatch?.();
    let autoClose = null;
    const close = () => {
      if (!card.isConnected || card.classList.contains('closing')) return;
      clearTimeout(autoClose);
      if (extra === 'bottle') stopSpeaking();
      this.cardOpen = false;
      this.closeCatch = null;
      card.classList.add('closing');
      card.classList.remove('in');
      setTimeout(() => card.remove(), 300);
    };
    this.closeCatch = close;
    const card = h('div', { class: 'catch' }, h('div', { class: 'catch-card' },
      h('div', { class: 'catch-top' }, t('You caught…')),
      art, h('div', { class: 'catch-name' }, title), h('div', { class: 'catch-sub' }, sub), h('div', { class: 'badges' }, badges),
      h('div', { class: 'row' },
        extra === 'bottle' && canSpeak() ? tapButton({ class: 'btn ghost', ontap: () => { clearTimeout(autoClose); speak(sub); } }, t('🔊 Read to me')) : null,
        tapButton({ class: 'btn primary', ontap: close }, extra === 'bottle' ? t('Aww 💛') : t('Yay! 🎉')))));
    card.firstChild.addEventListener('pointerdown', (e) => { e.stopPropagation(); close(); });
    this.root.appendChild(card);
    this.cardOpen = true;
    requestAnimationFrame(() => card.classList.add('in'));
    autoClose = setTimeout(close, extra === 'bottle' ? 9000 : 5000); // (reading aloud keeps it open)
    if (res?.isNew) g.fx.sparkle(g.players.local.x, g.players.local.y + 1, g.players.local.z, 16);
  }

  // A cheerful card at the top that doesn't stop anyone from playing (fades by itself)
  // title / name / text: finished text, English (e.g. a project's name), or T() messages
  banner(emoji, title, name, text) {
    this.bannerEl?.remove();
    const el = h('div', { class: 'banner' }, h('span', { class: 'banner-ic' }, emoji), h('div', {}, h('small', {}, say(title)), h('b', {}, say(name)), h('p', {}, say(text))));
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.classList.remove('in'); setTimeout(() => el.remove(), 400); });
    this.root.appendChild(el);
    this.bannerEl = el;
    this.toastBox.classList.add('below-banner');
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => { el.remove(); if (this.bannerEl === el) this.toastBox.classList.remove('below-banner'); }, 400);
    }, 6500);
  }

  // full-screen message (connection lost etc.)
  showOverlay(html, buttons = []) {
    this.overlay.innerHTML = '';
    this.overlay.append(h('div', { class: 'overlay-card' }, h('div', { html }), h('div', { class: 'row' }, buttons.map(([label, fn, cls]) => tapButton({ class: 'btn ' + (cls || ''), ontap: fn }, say(label))))));
    this.overlay.classList.remove('hidden');
  }
  hideOverlay() { this.overlay.classList.add('hidden'); }

  setFps(text) {
    this.fpsBox.classList.toggle('hidden', !text);
    if (text) setText(this.fpsBox, text);
  }

  itemChip(id, n) {
    const it = ITEMS[id];
    return h('span', { class: 'ichip' }, it?.emoji || '❔', n !== undefined ? h('b', {}, '×' + n) : null);
  }
}
