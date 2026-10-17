// The conductor: wires every part of the game together and runs them each frame.
import { BlobShadows } from '../entities/blobs.js';
import { FX } from './fx.js';
import { PlayerManager } from './players.js';
import { Fishing, FS } from './fishing.js';
import { Critters } from './critters.js';
import { WorldView } from './worldview.js';
import { Interact } from './interact.js';
import { DayNight } from './daynight.js';
import { UI } from '../ui/ui.js';
import { escapeHTML } from '../ui/dom.js';
import { PANELS, plantPanel, letterPanel, boardPanel } from '../ui/panels.js';
import { ITEMS, CROPS, PROJECT_BY_ID, itemName } from './data.js';
import { U } from '../render/materials.js';
import * as L from '../world/layout.js';
import { SAVE_KEY } from './state.js';
import { t, tr, islandName, CANVAS_FONT } from '../i18n/i18n.js';

const EMOTE_ICON = { wave: '👋', heart: '❤️', dance: '💃', cheer: '🎉', sit: '🪑', sleep: '💤', laugh: '😄' };

export class Game {
  constructor(o) {
    Object.assign(this, o); // R, rig, scene, world, spawns, session, profile, settings, audio, input, uiRoot, saveProfileFn, saveSettingsFn
    const { scene, world, session } = this;
    this.blobs = new BlobShadows(scene);
    this.fx = new FX(scene, world.atlas, this.rig.camera, this.uiRoot);
    this.ui = new UI(this.uiRoot, this);
    this.players = new PlayerManager({ scene, world, session, input: this.input, rig: this.rig, fx: this.fx, audio: this.audio, ui: this.ui, settings: this.settings });
    this.critters = new Critters({ scene, world, session, fx: this.fx, audio: this.audio, blobs: this.blobs, spawns: this.spawns });
    this.fishing = new Fishing({ scene, world, players: this.players, session, fx: this.fx, audio: this.audio, ui: this.ui, critters: this.critters, settings: this.settings });
    this.worldview = new WorldView(world, session, this.fx);
    this.worldview.onFirework = () => this.audio.boom();
    this.interact = new Interact({ world, session, players: this.players, fishing: this.fishing, critters: this.critters });
    this.daynight = new DayNight(this.R.renderer);
    this.time = 0;
    this.lastTouch = performance.now();
    this.actionHeld = false;
    this.recentWaves = new Map();
    this.feedSeen = session.state.feed.length;
    this.cooking = null;
    this.audioT = 0;
    this.fpsT = 0; this.fpsN = 0;

    this.input.onAnyInput = () => { this.lastTouch = performance.now(); this.audio.unlock(); };
    this.input.onPinch = (ratio) => this.rig.setZoom(this.rig.zoom * ratio);
    this.input.keyHandlers['e'] = (d) => d && this.ui.toggleEmotes();
    this.input.keyHandlers['b'] = (d) => d && this.openPanel('basket');
    this.input.keyHandlers['j'] = (d) => d && this.openPanel('journal');

    session.on('ops', (ops) => this.onOps(ops));
    session.on('fx', (f) => this.onFx(f));
    session.on('players', () => { this.players.syncRoster(); this.ui.renderFamily(); });
    session.on('joined', (pid) => { if (pid !== session.pid) { this.ui.toast(t('{name} arrived on the island!', { name: session.online.get(pid)?.name || t('Someone') }), '👋', 2600); this.audio.chime(); } });
    session.on('left', (pid) => { const n = session.state.players[pid]?.name; if (n) this.ui.toast(t('{name} went home for now.', { name: n }), '🏡', 2200); });
    session.on('snap', () => { if (session.lastSnapMsg?.cat) this.critters.setRemoteCat(session.lastSnapMsg.cat); });
    session.on('netstatus', () => this.ui.renderFamily());
    session.on('codechanged', (code) => {
      this.ui.toast(t('Another island was using our code, so we got a new one: {code}', { code }), '🔑', 6000);
      try { sessionStorage.setItem('cozycove.resume', JSON.stringify({ mode: 'host', code })); } catch { /* ignore */ }
    });
    session.on('lost', () => this.onLost());
    if (session.isHost) session.snapExtra = () => ({ cat: this.critters.catState() });
    session.posProvider = () => this.players.packet();

    this.players.syncRoster();
    this.ui.renderFamily();
    this.applySettings();
    this.rig.snap();
    // welcome
    setTimeout(() => {
      const s = session.state;
      this.ui.toast(session.isHost ? t('Welcome home, {name}! Day {day} on {island}.', { name: this.profile.name, day: s.day, island: islandName(s.name) }) : t('Welcome to the family island, {name}!', { name: this.profile.name }), '🏝️', 3200);
      if ((s.mail?.day || 0) < s.day) setTimeout(() => this.ui.toast(t('There’s a letter in the mailbox by the cottage!'), '✉️', 3000), 3500);
    }, 600);
  }

  // ------------------------------------------------------------------ ledger changes & effects
  onOps(ops) {
    const s = this.session.state;
    for (const op of ops) {
      if (op[0] === 'push' && op[1][0] === 'feed') {
        const e = op[2];
        if (e.pid && e.pid === this.session.pid) continue;
        const msg = tr(e.m); // translate first, then split off the leading emoji as the icon
        this.ui.toast(msg.replace(/^\S+\s/, ''), msg.split(' ')[0], 3600);
      }
    }
    if (this.ui.sheet && ops.some((op) => ['basket', 'coins', 'projects', 'journal', 'hats', 'request', 'stickers', 'name'].includes(op[1][0]))) {
      clearTimeout(this._refreshT);
      this._refreshT = setTimeout(() => this.ui.refreshSheet(), 120);
    }
    void s;
  }

  onFx(f) {
    const me = f.pid === this.session.pid;
    const P = this.players.local;
    const near = (x, z, r = 18) => Math.abs(x - P.x) < r && Math.abs(z - P.z) < r;
    switch (f.kind) {
      case 'pop': {
        const it = ITEMS[f.item];
        const y = this.world.walk.groundY(f.x, f.z);
        this.fx.label(f.x, y + 1.2, f.z, `+${f.n || 1} ${it?.kind === 'seed' ? it.cropEmoji : it?.emoji || ''}`, me ? 'mine' : '');
        if (near(f.x, f.z)) { this.fx.sparkle(f.x, y, f.z, 5); this.audio.pop(); }
        break;
      }
      case 'shake': {
        const p = this.world.palms[f.i];
        if (p && near(p.x, p.z)) { this.fx.leaves(p.top[0], p.top[1] - 0.5, p.top[2], 10); this.audio.rustle(); }
        break;
      }
      case 'water': if (near(f.x, f.z)) { this.fx.water(f.x, this.world.terrain.heightAt(f.x, f.z), f.z); this.audio.pour(); } break;
      case 'sparkle': if (near(f.x, f.z)) this.fx.sparkle(f.x, this.world.terrain.heightAt(f.x, f.z), f.z, 12); break;
      case 'project': this.celebrate(f.id); break;
      case 'emote': {
        if (me) break;
        const c = this.players.charOf(f.pid);
        const r = this.players.remotes.get(f.pid);
        if (c && r) {
          this.fx.label(r.x, r.y + 2.6, r.z, EMOTE_ICON[f.e] || '✨', 'big');
          if (f.e === 'heart') this.fx.hearts(r.x, r.y, r.z, 5);
          if (f.e === 'dance') this.fx.notes(r.x, r.y, r.z, 3);
          if (f.e === 'wave') {
            this.recentWaves.set(f.pid, performance.now());
            if (this.myWaveT && performance.now() - this.myWaveT < 2500 && Math.hypot(r.x - P.x, r.z - P.z) < 2.6) this.highFive(r);
          }
        }
        break;
      }
      case 'pet': this.critters.petCat(f.pid); break;
      case 'cook': if (near(L.CAMPFIRE.x, L.CAMPFIRE.z)) this.fx.sparkle(L.CAMPFIRE.x, this.world.fire.y + 0.6, L.CAMPFIRE.z, 10, [1, 0.8, 0.5]); break;
      case 'rainbow': this.showRainbow(); break;
      case 'picnic': {
        const y = this.world.terrain.heightAt(L.PICNIC.x + 2, L.PICNIC.z);
        for (let i = 0; i < 3; i++) setTimeout(() => this.fx.hearts(L.PICNIC.x + 2 + (Math.random() - 0.5) * 4, y - 1, L.PICNIC.z + (Math.random() - 0.5) * 3, 6), i * 300);
        this.audio.fanfare();
        break;
      }
      default:
    }
  }

  celebrate(id) {
    const p = PROJECT_BY_ID[id];
    this.audio.fanfare();
    const P = this.players.local;
    for (let i = 0; i < 4; i++) setTimeout(() => { this.fx.burst(P.x + (Math.random() - 0.5) * 10, P.y + 7 + Math.random() * 3, P.z - 4, [[1, 0.5, 0.55], [1, 0.85, 0.4], [0.5, 0.8, 1]]); this.audio.boom(); }, i * 450);
    this.ui.banner(p.emoji, t('Project complete!'), t(p.name), t(p.reward));
    if (!this.fishing.active) this.players.emote('cheer', 2.5);
  }

  highFive(r) {
    this.myWaveT = 0;
    this.fx.sparkle((r.x + this.players.local.x) / 2, r.y + 1, (r.z + this.players.local.z) / 2, 14, [1, 0.9, 0.5]);
    this.fx.label((r.x + this.players.local.x) / 2, r.y + 2.2, (r.z + this.players.local.z) / 2, t('High five! 🙌'), 'big');
    this.audio.clap();
  }

  showRainbow() {
    const el = document.createElement('div');
    el.className = 'rainbow';
    this.uiRoot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 3000); }, 16000);
  }

  // ------------------------------------------------------------------ the big button
  actionDown() {
    if (this.actionHeld) return;
    this.actionHeld = true;
    this.lastTouch = performance.now();
    if (this.ui.modalOpen) return;
    this.ui.closeCatch?.();
    if (this.cooking) return;
    const target = this.interact.current;
    if (this.fishing.active || target?.type === 'fish') {
      if (this.fishing.press()) this.tutorial('fished');
      return;
    }
    if (target) this.doInteract(target);
  }
  actionUp() {
    if (!this.actionHeld) return;
    this.actionHeld = false;
    if (this.fishing.active) this.fishing.release();
  }

  async doInteract(tg) {
    const S = this.session, P = this.players;
    const ask = async (req, anim, secs) => {
      if (anim) P.doAction(anim, secs);
      P.faceTowards(tg.x, tg.z);
      const res = await S.request(req);
      if (!res?.ok && res?.msg) { this.ui.toast(tr(res.msg), '🙈', 2000); this.audio.ui('error'); }
      else if (res?.msg) this.ui.toast(tr(res.msg), tg.icon, 1800);
      return res;
    };
    switch (tg.type) {
      case 'pick': ask({ a: 'pick', id: tg.id }, 'pick', 0.5); break;
      case 'bush': if (tg.dim) this.ui.toast(t('Picked clean — fruit grows back in a little while.'), '🌿', 1800); else ask({ a: 'bush', i: tg.i }, 'pick', 0.5); break;
      case 'shake': {
        const res = await ask({ a: 'shake', i: tg.i }, 'shake', 0.9);
        if (res?.ok && !res.empty) this.tutorial('shook');
        break;
      }
      case 'plot': {
        const st = S.state.plots[tg.i];
        if (!st?.crop) { plantPanel(this, tg.i); break; }
        if (st.stage >= 3) { const r = await ask({ a: 'harvest', i: tg.i }, 'pick', 0.6); if (r?.ok) this.audio.chime(); break; }
        if (!st.water && S.state.weather !== 'rain') { P.faceTowards(tg.x, tg.z); ask({ a: 'water', i: tg.i }, 'water', 1.1); break; }
        this.ui.toast(t('This {crop} is growing happily. Stage {n} of 4.', { crop: t(CROPS[st.crop].name).toLowerCase(), n: st.stage + 1 }), CROPS[st.crop].emoji, 1800);
        break;
      }
      case 'board': this.openPanel('board'); this.tutorial('board'); break;
      case 'logs': boardPanel(this, 'path'); break;
      case 'bridge': boardPanel(this, 'bridge'); break;
      case 'lighthouse': boardPanel(this, 'lighthouse'); break;
      case 'shop': this.openPanel('shop'); break;
      case 'sell': this.openPanel('sell'); break;
      case 'cook': this.openPanel('cook'); break;
      case 'mail': {
        const r = await S.request({ a: 'mail' });
        if (r?.ok) { this.audio.letter(); letterPanel(this, r.letter); } else this.ui.toast(tr(r?.msg) || t('No mail.'), '✉️', 1800);
        break;
      }
      case 'dig': {
        P.doAction('pick', 1.2);
        P.faceTowards(tg.x, tg.z);
        const r = await S.request({ a: 'dig' });
        if (r?.ok) { this.audio.fanfare(); this.ui.toast(t('Treasure! +{coins} coins and a {item}!', { coins: r.coins, item: itemName(r.bonus) }), '🏴‍☠️', 3000); } else if (r?.msg) this.ui.toast(tr(r.msg), '⛏️', 2000);
        break;
      }
      case 'pet': P.faceTowards(tg.x, tg.z); P.emote('heart', 1.6); S.request({ a: 'pet' }); break;
      case 'friend': this.emote('wave'); break;
      case 'bench': case 'picnic': this.emote('sit'); break;
      default:
    }
  }

  emote(e) {
    if (this.fishing.active) return;
    this.players.emote(e);
    const P = this.players.local;
    this.fx.label(P.x, P.y + 2.6, P.z, EMOTE_ICON[e] || '✨', 'big');
    if (e === 'heart') this.fx.hearts(P.x, P.y, P.z, 5);
    if (e === 'dance') this.fx.notes(P.x, P.y, P.z, 3);
    if (e === 'wave') {
      this.myWaveT = performance.now();
      for (const [pid, wt] of this.recentWaves) {
        const r = this.players.remotes.get(pid);
        if (r && performance.now() - wt < 2500 && Math.hypot(r.x - P.x, r.z - P.z) < 2.6) { this.highFive(r); break; }
      }
    }
    this.audio.chime();
    this.session.request({ a: 'emote', e });
  }

  async cook(r) {
    if (this.cooking) return;
    const P = this.players;
    P.faceTowards(L.CAMPFIRE.x, L.CAMPFIRE.z);
    this.cooking = { r, t: r.time };
    P.doAction('cook', r.time);
    this.audio.sizzle();
    this.ui.toast(t('Cooking {name}…', { name: t(r.name) }), '🍳', r.time * 1000);
  }

  openPanel(name, ...args) {
    const fn = PANELS[name];
    if (fn) fn(this, ...args);
  }

  // ------------------------------------------------------------------ looks & settings
  setLook(look) {
    this.saveProfile({ ...this.profile, look });
  }
  applyPreview(look) { this.players.setLocalLook(look); }
  previewLook(on) {
    this._zoomBefore ??= this.rig.zoom;
    if (on) { this._zoomBefore = this.rig.zoom; this.rig.setZoom(1.6); }
    else { this.rig.setZoom(this._zoomBefore || 1); this.players.setLocalLook(this.profile.look); }
  }
  saveProfile(p) {
    this.profile = p;
    this.session.profile = p;
    this.saveProfileFn(p);
    this.players.setLocalLook(p.look);
    this.session.request({ a: 'look', look: p.look, name: p.name });
    const me = this.session.online.get(this.session.pid);
    if (me) { me.look = p.look; me.name = p.name; }
    this.ui.renderFamily();
  }
  // switch language (the app saves and reloads, so every label is rebuilt in the new language)
  changeLang(id) { window.__changeLang?.(id); }
  setSetting(k, v) {
    this.settings[k] = v;
    this.saveSettingsFn(this.settings);
    this.applySettings();
  }
  applySettings() {
    const st = this.settings;
    if (this.R.state.qualityName !== st.quality) this.R.setQuality(st.quality);
    const outlines = this.R.state.preset.outlines !== false;
    this.world.setOutlines(outlines);
    this.players.setOutlines(outlines);
    this.audio.setVolumes(st.music, st.sfx);
    for (const r of this.players.remotes.values()) r.tag.visible = st.nameTags && r.seen;
    if (!st.showFps) this.ui.setFps('');
  }

  tutorial(step) {
    const tut = (this.profile.tut ||= {});
    if (tut[step]) return;
    tut[step] = true;
    this.saveProfileFn(this.profile);
  }
  updateHints() {
    const tut = this.profile.tut || {};
    const P = this.players.local;
    if (!tut.moved) {
      if (Math.hypot(P.x - L.SPAWN.x, P.z - L.SPAWN.z) > 6) this.tutorial('moved');
      return this.ui.hint(t('👆 Slide your thumb on the island to walk around'));
    }
    if (!tut.fished) return this.ui.hint(t('🎣 Walk to the water and press the big button to fish'));
    if (!tut.board && this.session.state.stats.fish > 0) return this.ui.hint(t('📋 Visit the Family Board next to the cottage'));
    if (!tut.planted && tut.board) return this.ui.hint(t('🌱 Plant seeds in the garden by the cottage'));
    this.ui.hint(null);
  }

  // ------------------------------------------------------------------ photo mode
  takePhoto() {
    const { renderer } = this.R;
    renderer.render(this.scene, this.rig.camera);
    const src = renderer.domElement;
    const W = src.width, H = src.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.drawImage(src, 0, 0);
    // cozy frame + caption
    const pad = Math.round(Math.min(W, H) * 0.03);
    g.lineWidth = pad;
    g.strokeStyle = '#fff8e8';
    g.strokeRect(pad / 2, pad / 2, W - pad, H - pad);
    g.font = `600 ${Math.round(pad * 1.3)}px ${CANVAS_FONT}`;
    g.fillStyle = 'rgba(255,248,232,0.92)';
    const text = `${islandName(this.session.state.name)} · ${t('Day {n}', { n: this.session.state.day })}`;
    const tw = g.measureText(text).width;
    g.fillRect(W - tw - pad * 3, H - pad * 3.2, tw + pad * 2, pad * 2);
    g.fillStyle = '#5a3d2b';
    g.fillText(text, W - tw - pad * 2, H - pad * 1.75);
    const flash = document.createElement('div');
    flash.className = 'flash';
    this.uiRoot.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
    this.audio.chime();
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `cozy-cove-day-${this.session.state.day}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Cozy Cove' }); return; } catch { /* cancelled */ }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  // ------------------------------------------------------------------ connection troubles (guests)
  onLost() {
    if (this.leaving) return;
    if (this.fishing.active) this.fishing.stop();
    const kick = this.session.kicked;
    if (kick && ['closed', 'full', 'version', 'self', 'sent'].includes(kick.why)) {
      this.ui.showOverlay(`<div class="big-emoji">🌙</div><p>${escapeHTML(tr(kick.msg))}</p>`, [[t('Back to menu'), () => this.backToMenu(), 'primary']]);
      return;
    }
    this.ui.showOverlay(`<div class="big-emoji">📡</div><p><b>${t('Lost the connection to the island…')}</b></p><p class="small">${t('Reconnecting. (Is the host’s phone awake?)')}</p><div class="spinner"></div>`, [[t('Back to menu'), () => this.backToMenu(), 'ghost']]);
    this.reconnectLoop();
  }
  async reconnectLoop() {
    const start = Date.now();
    while (!this.leaving && !this.session.connected && Date.now() - start < 180000) {
      try {
        await this.session.reconnect();
        this.ui.hideOverlay();
        this.ui.toast(t('Back on the island!'), '🏝️', 2000);
        this.players.syncRoster();
        this.ui.renderFamily();
        return;
      } catch (e) {
        if (e?.kick) { this.onLost(); return; }
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    if (!this.session.connected && !this.leaving) {
      this.ui.showOverlay(`<div class="big-emoji">🏝️</div><p>${t('Couldn’t reach the island. Ask the host to open Cozy Cove, then try again.')}</p>`, [[t('Back to menu'), () => this.backToMenu(), 'primary']]);
    }
  }

  backToMenu() {
    this.leaving = true;
    try { sessionStorage.removeItem('cozycove.resume'); } catch { /* ignore */ }
    location.reload();
  }
  leave() {
    this.leaving = true;
    this.session.leave();
    try { sessionStorage.removeItem('cozycove.resume'); } catch { /* ignore */ }
    setTimeout(() => location.reload(), 500);
  }
  resetIsland() {
    this.leaving = true;
    this.session.leave();
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY + '.bak'); } catch { /* ignore */ }
    setTimeout(() => location.reload(), 500);
  }
  async checkUpdate() {
    this.ui.toast(t('Checking for updates…'), '🔄', 1500);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      if (reg?.waiting || reg?.installing) {
        this.ui.toast(t('Updating Cozy Cove…'), '✨', 1500);
        if (this.session.isHost) this.session.save();
        setTimeout(() => location.reload(), 1500);
      } else this.ui.toast(t('You have the newest version!'), '✅', 1800);
    } catch { this.ui.toast(t('Couldn’t check right now.'), '🙈', 1500); }
  }

  // ------------------------------------------------------------------ every frame
  update(dt, now) {
    this.time += dt;
    U.uTime.value = this.time % 1000;
    const S = this.session;
    S.update(dt, now);
    const st = S.state;
    this.daynight.update(dt, st.time, st.weather === 'rain');
    this.critters.ctx.night = this.daynight.night;

    // finish cooking
    if (this.cooking) {
      this.cooking.t -= dt;
      if (Math.random() < dt * 6) this.fx.step(L.CAMPFIRE.x + (Math.random() - 0.5), this.world.fire.y + 0.9, L.CAMPFIRE.z + (Math.random() - 0.5), false, false);
      if (this.cooking.t <= 0) {
        const r = this.cooking.r;
        this.cooking = null;
        S.request({ a: 'cook', r: r.id }).then((res) => {
          if (res?.ok) { this.ui.toast(t('Made {name}!', { name: t(r.name) }), r.emoji, 2200); this.audio.chime(); this.fx.label(this.players.local.x, this.players.local.y + 2, this.players.local.z, `+1 ${r.emoji}`, 'mine'); }
          else this.ui.toast(tr(res?.msg) || t('Oops, the pot tipped over!'), '🙈');
        });
      }
    }

    this.blobs.begin();
    this.players.update(dt, now);
    this.fishing.update(dt, this.input.move);
    const P = this.players.local;
    const plist = this.players.all();
    for (let i = 0; i < plist.length; i++) this.blobs.add(plist[i].x, plist[i].y, plist[i].z, 1.05);
    this.critters.update(dt, this.time, P.x, P.z, plist, S.isHost);
    this.blobs.end();
    this.interact.update(dt);
    this.worldview.update(dt, this.time, this.daynight.night, P.x, P.z);
    if (this.daynight.rain > 0.05) this.fx.rain(P.x, P.z, this.daynight.rain, dt);
    this.ambientFx(dt, P);
    this.fishing.draw(this.time);
    this.fx.update(dt);
    this.ui.update(dt);
    this.updateHints();

    // ambience: how close is the waterfall?
    this.audioT -= dt;
    if (this.audioT <= 0) {
      this.audioT = 0.4;
      this.audio.setScene({ night: this.daynight.night, rain: this.daynight.rain, fallDist: Math.hypot(P.x - L.WATERFALL.x - 2, P.z - L.WATERFALL.z) });
      if (S.isHost && this.ui.toasts.length === 0 && S.transport) {
        const stn = S.transport.status();
        this.ui.setNet(stn.peer || stn.trystero ? 'online' : 'offline', stn.peer || stn.trystero);
      } else if (!S.isHost) this.ui.setNet(S.connected ? 'online' : 'offline', S.connected);
    }

    // save power: if nobody has touched the screen for a while, slow down the frame rate
    const idle = performance.now() - this.lastTouch > 40000 && !this.fishing.active;
    this.R.state.idleFps = this.ui.sheet ? 24 : idle ? 20 : 0;

    if (this.settings.showFps) {
      this.fpsN++;
      this.fpsT += dt;
      if (this.fpsT > 1) {
        const info = this.R.renderer.info.render;
        this.ui.setFps(t('{fps} fps · {calls} draws · {tris}k tris · {dpr}x', { fps: Math.round(this.fpsN / this.fpsT), calls: info.calls, tris: (info.triangles / 1000).toFixed(0), dpr: this.R.state.dpr.toFixed(2) })); // once a second
        this.fpsN = 0; this.fpsT = 0;
      }
    }
    void FS;
  }

  // little touches: mist where the waterfall lands, leaves drifting from palm trees
  ambientFx(dt, P) {
    this.mistT = (this.mistT || 0) - dt;
    const fx = this.world.lipX + 2.8, fz = L.WATERFALL.z;
    if (this.mistT <= 0 && Math.abs(P.x - fx) < 26 && Math.abs(P.z - fz) < 26) {
      this.mistT = 0.12;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
      this.fx.spawn(fx + Math.cos(a) * r, 0.2, fz + Math.sin(a) * r * 1.4, (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 1.6, 0.9, 7, 1, 1, 1, 0.55, 0, 1.4);
      if (Math.random() < 0.5) this.fx.spawn(fx + (Math.random() - 0.5) * 2.5, 0.1, fz + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.6, 0.18, 0, 1, 1, 1, 0.9, 8);
    }
    this.leafT = (this.leafT || 2) - dt;
    if (this.leafT <= 0) {
      this.leafT = 2.5 + Math.random() * 4;
      let best = null, bd = 16 * 16;
      for (const p of this.world.palms) {
        const d = (p.x - P.x) ** 2 + (p.z - P.z) ** 2;
        if (d < bd && Math.random() < 0.6) { bd = d; best = p; }
      }
      if (best) this.fx.leaves(best.top[0], best.top[1] - 0.3, best.top[2], 1, [0.5, 0.78, 0.3]);
    }
  }

  render() {
    this.R.renderer.render(this.scene, this.rig.camera);
  }
}
