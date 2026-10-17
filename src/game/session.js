// The session ties together: the ledger (state), the rule book (host only) and the network.
// Everything else in the game just calls session.request({...}) and listens for changes —
// it doesn't need to care whether this phone is the host or a guest.
import { applyOps, newWorldState, migrate, saveIsland, loadIsland } from './state.js';
import { HostLogic } from './host.js';
import { HostTransport, joinHost, makeIslandCode } from '../net/transport.js';

// 4: news and replies are message objects (T() in i18n.js) that each phone shows in its own language.
// An older game would choke on them, so it is told "different versions" instead.
export const PROTOCOL = 4;
const dbg = new URLSearchParams(location.search).has('netdebug') ? (...a) => console.log('[dbg] session', ...a) : () => {};
export const MAX_PLAYERS = 4;
const SNAP_MS = 100;

class Emitter {
  constructor() { this.h = {}; }
  on(ev, cb) { (this.h[ev] ||= []).push(cb); return () => { this.h[ev] = this.h[ev].filter((x) => x !== cb); }; }
  emit(ev, ...a) { for (const cb of this.h[ev] || []) { try { cb(...a); } catch (e) { console.error(e); } } }
}

export class Session extends Emitter {
  constructor({ world, spawns, profile, debug = false }) {
    super();
    this.world = world;
    this.spawns = spawns;
    this.profile = profile; // {id, name, look}
    this.pid = profile.id;
    this.debug = debug;
    this.role = null; // 'host' | 'guest'
    this.state = null;
    this.online = new Map(); // pid -> {name, look, s: latest position packet, t: when}
    this.pendingOps = [];
    this.pendingFx = [];
    this.rid = 0;
    this.waiting = new Map();
    this.snapT = 0;
    this.saveT = 0;
    this.myPos = null;
    this.connected = false;
    this.ended = false;
  }

  // ------------------------------------------------------------------ host
  startHost() {
    this.role = 'host';
    const fresh = newWorldState({ code: makeIslandCode(), plots: this.world.plots.length, bushes: this.world.bushes.length, palms: this.world.palms.length });
    const saved = loadIsland();
    this.state = saved ? migrate(saved, { ...fresh, code: saved.code || fresh.code }) : fresh;
    this.logic = new HostLogic(this, this.world, this.spawns);
    this.links = new Set();
    this.logic.a_hello(this.pid, { name: this.profile.name, look: this.profile.look });
    this.online.set(this.pid, { name: this.profile.name, look: this.profile.look, s: null, t: performance.now() });
    this.startTransport();
    this.connected = true;
    this.flush();
    this.emit('state');
    this.emit('players');
    saveIsland(this.state);
    this.startHeartbeat();
  }

  startTransport() {
    this.transport = new HostTransport(this.state.code, (link) => this.acceptLink(link), this.state.created);
    this.transport.onStatus = () => this.emit('netstatus');
    this.transport.onCollision = () => this.changeCode();
    this.transport.start();
  }

  // Another island happens to use our code: pick a fresh one (family already here stay connected).
  changeCode() {
    if (this.changingCode || this.ended) return;
    this.changingCode = true;
    const old = this.transport;
    setTimeout(() => {
      try { old.stop(); } catch { /* ignore */ }
      this.emitOps([['set', ['code'], makeIslandCode()]]);
      this.save();
      this.startTransport();
      this.changingCode = false;
      this.emit('codechanged', this.state.code);
    }, 300);
  }

  // Host only: send someone home (they can come back later).
  // Kick texts stay plain English sentences; the guest's phone shows them in its own language with tr().
  // (Plain text, not T(), so an older game can still show the "different versions" one.)
  kick(pid) {
    for (const l of this.links) {
      if (l.pid === pid) {
        l.send({ k: 'kick', why: 'sent', msg: 'The host sent you home for now. 🏡' });
        setTimeout(() => l.close(), 400);
      }
    }
  }

  acceptLink(link) {
    let pid = null;
    const born = performance.now();
    // a link that never says hello is closed after a while
    const helloTimer = setTimeout(() => { if (!pid) link.close(); }, 30000);
    link.onMessage((m) => {
      if (m.k === 'hello') {
        clearTimeout(helloTimer);
        if (m.v !== PROTOCOL) {
          link.send({ k: 'kick', why: 'version', msg: 'Your game and the host’s game are different versions. Close and reopen both apps to update.' });
          setTimeout(() => link.close(), 500);
          return;
        }
        const id = String(m.pid || '').slice(0, 40);
        if (!id) return;
        if (id === this.pid) {
          link.send({ k: 'kick', why: 'self', msg: 'This phone is already the host of this island. Use another phone to join!' });
          setTimeout(() => link.close(), 500);
          return;
        }
        // same person reconnecting? drop their old link
        for (const other of this.links) if (other.pid === id && other !== link) { dbg('replacing old link of', id); other.pid = null; other.close(); this.links.delete(other); }
        const count = [...this.online.keys()].filter((p) => p !== id).length;
        if (count >= MAX_PLAYERS) {
          link.send({ k: 'kick', why: 'full', msg: 'This island is full (4 players). Try again when someone leaves.' });
          setTimeout(() => link.close(), 500);
          return;
        }
        pid = id;
        link.pid = pid;
        this.links.add(link);
        this.online.set(pid, { name: String(m.name || 'Friend').slice(0, 14), look: m.look || {}, s: m.s || null, t: performance.now() });
        this.logic.a_hello(pid, { name: m.name, look: m.look });
        this.flush();
        link.send({ k: 'welcome', v: PROTOCOL, state: this.state, you: pid, online: this.onlineList() });
        this.broadcast({ k: 'online', online: this.onlineList() }, link);
        this.emit('players');
        this.emit('joined', pid);
        return;
      }
      if (!pid) return;
      const o = this.online.get(pid);
      if (o) o.t = performance.now();
      if (m.k === 'pos') { if (o) o.s = m.s; return; }
      if (m.k === 'req') {
        const res = this.logic.handle(pid, m.req);
        this.flush();
        link.send({ k: 'rep', rid: m.rid, res });
        return;
      }
      if (m.k === 'bye') { dbg('bye from', pid); link.close(); }
    });
    link.onClose(() => {
      clearTimeout(helloTimer);
      this.links.delete(link);
      if (pid && link.pid === pid) {
        this.online.delete(pid);
        this.broadcast({ k: 'online', online: this.onlineList() });
        this.emit('players');
        this.emit('left', pid);
      }
    });
    void born;
  }

  onlineList() {
    return [...this.online.entries()].map(([pid, o]) => ({ pid, name: o.name, look: o.look }));
  }

  broadcast(msg, except = null) {
    if (!this.links) return;
    for (const l of this.links) if (l !== except && l.pid) l.send(msg);
  }

  // host only: record ops, apply them to our ledger, and queue them for everyone else
  emitOps(ops) {
    if (!ops?.length) return;
    applyOps(this.state, ops);
    this.pendingOps.push(...ops);
    this.dirty = true;
    this.emit('ops', ops);
  }
  emitFx(f) {
    this.pendingFx.push(f);
    this.emit('fx', f);
  }
  flush() {
    if (this.role !== 'host') return;
    if (this.pendingOps.length) {
      this.broadcast({ k: 'ev', ops: this.pendingOps });
      this.pendingOps = [];
    }
    if (this.pendingFx.length) {
      this.broadcast({ k: 'fx', list: this.pendingFx });
      this.pendingFx = [];
    }
  }

  // ------------------------------------------------------------------ guest
  async join(code) {
    this.role = 'guest';
    this.code = code;
    const link = await joinHost(code, 22000);
    return new Promise((resolve, reject) => {
      let welcomed = false;
      const t = setTimeout(() => { if (!welcomed) { link.close(); reject(new Error('no welcome')); } }, 9000);
      link.onMessage((m) => {
        if (m.k === 'welcome') {
          welcomed = true;
          clearTimeout(t);
          this.link = link;
          this.state = m.state;
          this.pid = m.you;
          this.online.clear();
          for (const p of m.online) this.online.set(p.pid, { name: p.name, look: p.look, s: null, t: performance.now() });
          this.connected = true;
          this.lastSnap = performance.now();
          this.startHeartbeat();
          this.emit('state');
          this.emit('players');
          resolve();
          return;
        }
        if (m.k === 'kick') {
          clearTimeout(t);
          this.kicked = m;
          reject(Object.assign(new Error(m.msg), { kick: m }));
          return;
        }
        if (!welcomed) return;
        this.onGuestMessage(m);
      });
      link.onClose(() => {
        clearTimeout(t);
        if (!welcomed) { reject(new Error('closed')); return; }
        if (this.link === link) this.lostHost();
      });
      link.send({ k: 'hello', v: PROTOCOL, pid: this.profile.id, name: this.profile.name, look: this.profile.look, s: this.myPos });
    });
  }

  onGuestMessage(m) {
    switch (m.k) {
      case 'ev':
        applyOps(this.state, m.ops);
        this.emit('ops', m.ops);
        break;
      case 'fx':
        for (const f of m.list) this.emit('fx', f);
        break;
      case 'snap': {
        this.lastSnap = performance.now();
        this.lastSnapMsg = m;
        this.state.time = m.tm;
        if (m.w !== this.state.weather) this.state.weather = m.w;
        for (const [pid, s] of Object.entries(m.p)) {
          const o = this.online.get(pid);
          if (o) { o.s = s; o.t = performance.now(); }
        }
        this.emit('snap');
        break;
      }
      case 'online': {
        const prev = new Set(this.online.keys());
        const next = new Map();
        for (const p of m.online) next.set(p.pid, { ...(this.online.get(p.pid) || { s: null, t: performance.now() }), name: p.name, look: p.look });
        this.online = next;
        for (const pid of next.keys()) if (!prev.has(pid)) this.emit('joined', pid);
        for (const pid of prev) if (!next.has(pid)) this.emit('left', pid);
        this.emit('players');
        break;
      }
      case 'rep': {
        const w = this.waiting.get(m.rid);
        if (w) { this.waiting.delete(m.rid); clearTimeout(w.t); w.resolve(m.res || { ok: false }); }
        break;
      }
      case 'kick':
        this.kicked = m;
        break;
      default:
    }
  }

  lostHost() {
    this.connected = false;
    for (const w of this.waiting.values()) { clearTimeout(w.t); w.resolve({ ok: false, msg: 'Connection lost.' }); }
    this.waiting.clear();
    this.emit('lost');
  }

  // Try to get back onto the island after a hiccup (e.g. the host's phone went to sleep).
  async reconnect() {
    const old = this.link;
    this.link = null; // detach first so closing it doesn't count as "lost" again
    try { old?.close(); } catch { /* ignore */ }
    await this.join(this.code);
  }

  // ------------------------------------------------------------------ both
  request(req) {
    if (this.role === 'host') {
      const res = this.logic.handle(this.pid, req);
      this.flush();
      return Promise.resolve(res);
    }
    if (!this.link || !this.connected) return Promise.resolve({ ok: false, msg: 'Reconnecting…' });
    const rid = ++this.rid;
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.waiting.delete(rid); resolve({ ok: false, msg: 'The island didn’t answer. Try again.' }); }, 8000);
      this.waiting.set(rid, { resolve, t });
      this.link.send({ k: 'req', rid, req });
    });
  }

  // A tiny "still here!" every second, even if the screen isn't drawing (menus, slow moments).
  startHeartbeat() {
    clearInterval(this.hb);
    this.hb = setInterval(() => {
      if (document.hidden || this.ended) return;
      const t = performance.now();
      if (this.role === 'guest' && this.connected && t - (this.lastSent || 0) > 900) {
        this.lastSent = t;
        this.link?.send({ k: 'pos', s: this.posProvider?.() || this.myPos });
      } else if (this.role === 'host' && t - (this.snapT || 0) > 900) {
        this.update(0, t);
      }
    }, 1000);
  }

  setMyPos(s) { this.myPos = s; }
  // the game gives us a function that builds our position message when we need it
  get myPos() { return this._myPos || this.posProvider?.() || null; }
  set myPos(v) { this._myPos = v; }

  update(dt, now) {
    if (this.role === 'host') {
      this.logic.tick(dt);
      // drop guests we haven't heard from in a while
      for (const l of this.links) {
        if (l.pid && now - l.lastHeard > 15000) { dbg('timeout', l.pid, now, l.lastHeard); l.close(); }
      }
      // network timing uses the real clock (not the frame rate), so a slow frame never starves it
      if (now - this.snapT >= SNAP_MS) {
        this.snapT = now;
        const me = this.online.get(this.pid);
        if (me) { me.s = this.posProvider?.() || null; me.t = now; }
        const p = {};
        for (const [pid, o] of this.online) if (o.s) p[pid] = o.s;
        this.flush();
        this.broadcast({ k: 'snap', tm: +this.state.time.toFixed(3), w: this.state.weather, p, ...(this.snapExtra?.() || {}) });
      } else this.flush();
      this.saveT += dt;
      if (this.saveT > 12 && this.dirty) this.save();
      else if (this.saveT > 45) this.save(); // keep the time of day saved too
    } else if (this.role === 'guest' && this.connected) {
      if (now - this.snapT >= SNAP_MS && this.posProvider) {
        this.snapT = now;
        this.lastSent = performance.now();
        this.link?.send({ k: 'pos', s: this.posProvider() });
      }
      // keep the clock moving smoothly between snapshots
      if (this.state) {
        this.state.time += (this.state.time >= 6 && this.state.time < 19 ? 13 / (13.5 * 60) : 11 / (4 * 60)) * dt;
        if (this.state.time >= 24) this.state.time -= 24;
      }
      if (now - this.lastSnap > 8000) this.lostHost();
    }
  }

  save() {
    if (this.role !== 'host' || !this.state) return;
    this.saveT = 0;
    this.dirty = false;
    saveIsland(this.state);
  }

  // Host comes back from the background: make sure the matchmakers know we're here.
  wake() {
    if (this.role === 'host') this.transport?.wake();
  }

  leave() {
    this.ended = true;
    clearInterval(this.hb);
    if (this.role === 'host') {
      this.save();
      this.broadcast({ k: 'kick', why: 'closed', msg: 'The host closed the island for now. 🌙' });
      setTimeout(() => this.transport?.stop(), 300);
    } else {
      this.link?.send({ k: 'bye' });
      setTimeout(() => this.link?.close(), 200);
    }
  }

  get code() { return this._code || this.state?.code; }
  set code(v) { this._code = v; }
  get isHost() { return this.role === 'host'; }
}
