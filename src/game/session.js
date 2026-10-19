// The session: this phone's copy of the family island, the rule book, and the network.
//
// Every family member's phone keeps its own full copy of the island, so anyone can play at any time,
// even when nobody else is around. When family members play at the same time, ONE of their phones
// leads: it runs the rule book, like the person holding the family notebook at the market (everyone
// tells them what they bought, they write it down and read it out, so every notebook says the same).
// The other phones visit it. Any phone can lead: if the leading phone goes away, another one takes
// over by itself and the game just keeps going. Copies that were played apart are merged when the
// phones meet again (village.js keeps the books, so nothing anyone did is lost or counted twice).
//
// The rest of the game just calls session.request({...}) and listens for changes; it doesn't need to
// care which phone leads.
import { applyOps, newWorldState, migrate, saveIsland, loadIsland } from './state.js';
import { HostLogic } from './host.js';
import { ensureVillage, mergeVillages, withBookkeeping, digest, oldIslandVid } from './village.js';
import { HostTransport, joinHost, makeIslandCode, isPictureCode } from '../net/transport.js';

// 5: family islands (every phone keeps a copy; any phone can lead; copies are merged when phones meet).
// An older game can't play with this one: it is told "different versions" in words it knows.
export const PROTOCOL = 5;
const OLD_VERSION_MSG = 'Your game and the host’s game are different versions. Close and reopen both apps to update.'; // (an older phone has exactly this sentence in Thai)
const dbg = new URLSearchParams(location.search).has('netdebug') ? (...a) => console.log('[dbg] session', ...a) : () => {};
export const MAX_PLAYERS = 4;
const SNAP_MS = 100;
const QUIET_MS = 5000; // a stored copy just opened: no automatic changes yet while we look for the family
const SEEK_MS = 3500; // how long to look for a family member's leading phone before leading ourselves
const RANK_MS = 2000; // the leading phone went away: each next phone in line waits this much longer
const RETURN_MS = 20000; // someone back within this time just "came back" (no arrival news)

// ---------------------------------------------------------------- what this phone keeps
const COL_KEY = 'cozycove.col'; // this phone's column in the family books (see village.js)
const UNSAVED_KEY = 'cozycove.unsaved'; // set while this phone has written in its column since the last save
const ARCHIVE_KEY = 'cozycove.island.prev'; // islands this phone moved away from (kept, never thrown away by a move)
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const randomId = (p) => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const hidden = () => typeof document !== 'undefined' && document.hidden;

// A phone that wrote in its column and then never saved (it crashed or was closed suddenly) starts a new
// column: the family may already know numbers from the old one that this phone's save doesn't have.
export function newColumn() { const c = randomId('c'); ls.set(COL_KEY, c); return c; }
function myColumn() {
  if (ls.get(UNSAVED_KEY)) { ls.del(UNSAVED_KEY); return newColumn(); }
  return ls.get(COL_KEY) || newColumn();
}

function freshIsland(world) {
  return newWorldState({ code: makeIslandCode(), plots: world.plots.length, bushes: world.bushes.length, palms: world.palms.length });
}
// This phone's copy of the family island (or null), ready to play: filled in for this version of the
// game, with its family books (an island from before family islands gets them now, from its own numbers).
export function openIsland(world) {
  const saved = loadIsland();
  if (!saved) return null;
  const fresh = freshIsland(world);
  const s = migrate(saved, { ...fresh, code: saved.code || fresh.code });
  ensureVillage(s, oldIslandVid);
  if (!isPictureCode(s.code)) s.code = fresh.code; // islands from before picture codes get one
  return s;
}
// Has anyone really played on this island? (an island someone opened once by accident has not)
export const isRealIsland = (s) => !!s && (Object.keys(s.players || {}).length >= 2 || (s.day || 1) >= 3 || Object.keys(s.journal || {}).length >= 3);
// family members who live on the island (not the ones who moved away), first arrivals first
export function membersOf(s) {
  return Object.entries(s?.players || {}).filter(([, p]) => p && !p.left).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0)).map(([pid, p]) => ({ pid, name: p.name, look: p.look }));
}

// Islands this phone moved away from: newest first, up to 3.
export function loadArchive() {
  try { const a = JSON.parse(ls.get(ARCHIVE_KEY) || '[]'); return Array.isArray(a) ? a.filter((s) => s?.vx?.vid) : []; } catch { return []; }
}
export function archiveIsland(state) {
  if (!state?.vx?.vid) return true;
  const list = loadArchive().filter((s) => s.vx.vid !== state.vx.vid);
  list.unshift(state);
  return ls.set(ARCHIVE_KEY, JSON.stringify(list.slice(0, 3)));
}
export function takeFromArchive(vid) {
  const list = loadArchive();
  const i = list.findIndex((s) => s.vx.vid === vid);
  if (i < 0) return null;
  const [s] = list.splice(i, 1);
  ls.set(ARCHIVE_KEY, JSON.stringify(list));
  return s;
}

// An island that came over the network: only the expected shape gets in.
const looksLikeIsland = (s) => !!s && typeof s === 'object' && typeof s.vx?.vid === 'string' && s.vx.c && s.vx.t
  && Array.isArray(s.plots) && Array.isArray(s.bushes) && Array.isArray(s.palms) && s.basket && s.projects && s.players && s.journal;
// Two phones lead the same island at once (they opened it at the same moment, or the network was cut in
// two for a while): one goes over to the other. Both decide from the same two notes, so exactly one
// moves: the one with fewer family members on it; then the one that has led for a shorter time; then
// the run ids (a coin toss both phones agree on).
function staysLeader(a, b) {
  if ((a.n || 0) !== (b.n || 0)) return (a.n || 0) > (b.n || 0);
  if ((a.since || 0) !== (b.since || 0)) return (a.since || 0) < (b.since || 0);
  return String(a.sid) < String(b.sid);
}

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
    this.role = null; // 'host' = this phone runs the rules (it leads) | 'guest' = visiting the leading phone
    // 'alone' (leading its own copy, not at the meeting place yet) | 'leading' (at the meeting place, the
    // family can visit) | 'joining' (being let in by the leading phone) | 'visiting' | 'ended'
    this.phase = 'off';
    this.state = null;
    this.online = new Map(); // pid -> {name, look, s: latest position packet, t: when}
    this.seen = new Map(); // pid -> when they were last online (so a quick return isn't news)
    this.links = new Set();
    this.pendingOps = [];
    this.pendingFx = [];
    this.rid = 0;
    this.waiting = new Map();
    this.queued = [];
    this.snapT = 0;
    this.saveT = 0;
    this.myPos = null;
    this.connected = false;
    this.ended = false;
    this.wiped = false; // "move out of this island": this island must not be saved again
    this.sid = randomId('s'); // this run of the game
    this.since = 0; // when this phone took the island's meeting place
    this.blocked = null; // 'version' | 'other' | 'self': don't meet the family (until the game is opened again)
  }

  // ------------------------------------------------------------------ starting
  // "Play": this phone's own copy, straight away; meanwhile look for the family.
  play({ freshColumn = false } = {}) {
    const s = openIsland(this.world);
    if (!s) { this.startNew(); return; }
    this.state = s;
    this.col = freshColumn ? newColumn() : myColumn();
    this.lead({ quiet: true });
    this.seek();
  }

  // A brand-new family island on this phone (its code is brand-new too: nobody to look for). An island
  // this phone had goes into the archive first: starting a new one never throws an island away.
  startNew() {
    const had = openIsland(this.world);
    if (had && !archiveIsland(had)) { this.saveWarned = true; this.play(); return; } // (no space to keep it: keep playing it instead)
    this.state = ensureVillage(freshIsland(this.world), () => randomId('v'));
    this.col = newColumn();
    this.lead({ quiet: false });
    this.save('both');
    this.claim();
  }

  // "Join your family": visit the phone that leads the family's island and take a copy of it.
  // `old`: the island this phone had until now; it goes into the archive once we are let in.
  // `peeked`: the link from the peek just before, if it is still open (no need to connect again).
  async joinFamily(code, old = null, peeked = null) {
    this.phase = 'joining';
    this.role = 'guest';
    this.joinAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const link = peeked && !peeked.closed ? peeked : await joinHost(code, 22000, this.joinAbort?.signal);
    if (this.ended) { link.close(); throw new Error('cancelled'); }
    const res = await this.hello(link, { move: true, old });
    if (this.ended) throw new Error('cancelled');
    if (res.why === 'full') { this.lead({ quiet: false }); this.tryLater(); return; } // (playing on our own copy for now)
    if (!res.ok) throw Object.assign(new Error(res.why), { kick: res.kick, why: res.why });
  }

  // What island is this? Asked before "Join another family", so nothing changes on this phone yet.
  // The answer comes with the open link (info.link): joining next goes on through it (close it if not).
  static async peek(code, signal) {
    const link = await joinHost(code, 22000, signal);
    return new Promise((resolve, reject) => {
      // (the reason is given first: hanging up afterwards would otherwise report "closed" instead)
      const t = setTimeout(() => { reject(Object.assign(new Error('no answer'), { why: 'noanswer' })); link.close(); }, 9000);
      // A phone with an older version doesn't know this question and stays silent. A hello with no
      // version makes ANY phone answer "different versions" (and never lets this phone in), so the
      // right message can be shown. (A phone with this version answers the question at once.)
      const probe = setTimeout(() => { dbg('peek: no answer yet, asking for the version'); link.send({ k: 'hello', v: 0 }); }, 4500);
      dbg('peek: connected', link.kind);
      link.onMessage((m) => {
        dbg('peek: got', m.k, m.why || '');
        if (m.k === 'peekr') { clearTimeout(t); clearTimeout(probe); resolve({ ...m, link }); }
        else if (m.k === 'kick') { clearTimeout(t); clearTimeout(probe); reject(Object.assign(new Error(m.why), { kick: m, why: m.why })); link.close(); }
      });
      link.onClose(() => { clearTimeout(t); clearTimeout(probe); reject(Object.assign(new Error('closed'), { why: 'closed' })); });
      link.send({ k: 'peek', v: PROTOCOL });
    });
  }

  // ------------------------------------------------------------------ leading
  // This phone runs the rules for its own copy (alone at first; family phones may then visit).
  // quiet: no automatic changes for a few seconds (a stored copy may be behind the family's).
  lead({ quiet }) {
    this.role = 'host';
    this.phase = 'alone';
    this.link = null;
    this.connected = true;
    if (this.logic) this.logic.dead = true;
    this.logic = new HostLogic(this, this.world, this.spawns);
    if (quiet) this.logic.quietUntil = performance.now() + QUIET_MS;
    this.links = new Set();
    this.setOnline(new Map([[this.pid, { name: this.profile.name, look: this.profile.look, s: null, t: performance.now() }]]));
    this.logic.a_hello(this.pid, { name: this.profile.name, look: this.profile.look });
    this.flush();
    this.emit('state');
    this.emit('players');
    this.emit('netstatus');
    this.startHeartbeat();
    this.runQueued();
  }

  // Look for a family member's phone that leads this island right now. Found: visit it.
  // Not found: hold the meeting place ourselves, so the family can find us.
  async seek() {
    if (this.phase !== 'alone' || this.seeking || this.blocked || this.ended || hidden()) return;
    clearTimeout(this.seekTimer);
    const code = this.state.code;
    this.seeking = true;
    this.emit('netstatus');
    await this.releasing; // (the meeting place we just let go of must be closed first, or we'd get it back)
    let link = null;
    try { link = await joinHost(code, SEEK_MS * 4, null, { patience: SEEK_MS }); } catch { /* nobody there */ }
    this.seeking = false;
    if (this.phase !== 'alone' || this.ended || hidden() || code !== this.state.code) { link?.close(); this.emit('netstatus'); return; }
    if (!link) { this.claim(); return; }
    dbg('found the leading phone');
    const res = await this.hello(link);
    if (res.ok || this.ended) return;
    // couldn't go over: keep leading our own copy (and see why)
    this.lead({ quiet: false });
    const k = res.kick;
    if (k?.why === 'version') this.block('version');
    else if (k?.why === 'self') this.block('self');
    else if (k?.why === 'other') this.otherIsland(k.m || {});
    else if (res.why === 'full') this.tryLater();
    else this.claim(); // (it went away meanwhile: then we lead; if it is still there, the two leaders meet)
  }
  later(ms) { clearTimeout(this.seekTimer); this.seekTimer = setTimeout(() => this.seek(), ms); this.emit('netstatus'); }
  // full (4 family members playing): try again in a while, waiting longer each time (30 s .. 5 min)
  tryLater() { this.fullWait = Math.min((this.fullWait || 15000) * 2, 300000); this.later(this.fullWait); }

  // Take the island's meeting place: family phones that open the game find us here.
  claim() {
    if (this.phase !== 'alone' || this.blocked || this.ended || hidden()) return;
    this.phase = 'leading';
    this.since = Date.now();
    this.transport = new HostTransport(this.state.code, (link) => this.acceptLink(link), () => this.meetInfo());
    this.transport.onStatus = () => this.emit('netstatus');
    this.transport.onIdTaken = () => this.probe();
    this.transport.onHostMeet = (theirs, mine) => this.meetLeader(theirs, mine);
    this.transport.start();
    this.emit('netstatus');
  }

  // Let go of the meeting place. handover: tell the visitors first, so they take over at once.
  release(handover = true) {
    const tr = this.transport, links = [...this.links];
    this.transport = null;
    if (handover) this.flush();
    for (const l of links) { l.gone = true; if (handover) l.send({ k: 'handover' }); }
    this.links = new Set();
    const me = this.online.get(this.pid);
    this.setOnline(new Map(me ? [[this.pid, me]] : []));
    // (closed a moment later, so the handover gets out first)
    this.releasing = new Promise((done) => setTimeout(() => {
      for (const l of links) l.close();
      try { tr?.stop(); } catch { /* ignore */ }
      done();
    }, 300));
    if (this.phase === 'leading') this.phase = 'alone';
    this.emit('players');
    this.emit('netstatus');
  }

  meetInfo() {
    return { v: PROTOCOL, vid: this.state?.vx?.vid, n: this.online.size, since: this.since, sid: this.sid, created: this.state?.created || 0, members: membersOf(this.state).length };
  }

  // Another phone leads this code too. `mine` is the note this phone sent it.
  meetLeader(theirs, mine) {
    if (this.phase !== 'leading' || !mine) return;
    if (!theirs || theirs.v !== PROTOCOL) { this.block('version'); return; }
    if (theirs.vid !== mine.vid) { this.otherIsland(theirs); return; }
    if (staysLeader(mine, theirs)) { this.transport?.peerSoon(); return; } // (they come over to us; their PeerJS name is ours soon)
    dbg('going over to the other leading phone');
    this.release(true);
    this.seek();
  }

  // Our meeting-place name is taken: see by whom (usually a family member's phone that leads too).
  async probe() {
    if (this.phase !== 'leading' || this.probing) return;
    this.probing = true;
    try {
      const link = await joinHost(this.state.code, 6000, null, { roads: 'peer' });
      const mine = this.meetInfo();
      const theirs = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(undefined), 4000);
        link.onMessage((m) => {
          if (m.k === 'meet') { clearTimeout(t); resolve(m.m || null); }
          else if (m.k === 'kick') { clearTimeout(t); resolve(m.why === 'version' ? null : undefined); }
        });
        link.onClose(() => { clearTimeout(t); resolve(undefined); });
        link.send({ k: 'meet', m: mine });
      });
      link.close();
      if (theirs !== undefined) this.meetLeader(theirs, mine);
    } catch { /* nobody (it was our own old connection, still closing) */ }
    this.probing = false;
  }

  // Another island uses our code (very rare: there are 32,400 codes). The newer island takes a new code
  // if only one person lives there; otherwise this phone just stops meeting for now (changing the code
  // would leave family members looking for the old one).
  otherIsland(theirs) {
    const c = this.state.created || 0, tc = theirs.created || 0;
    const newer = c !== tc ? c > tc : this.state.vx.vid > String(theirs.vid || '');
    if (!newer) return; // (the other island moves)
    if (membersOf(this.state).length <= 1) this.changeCode();
    else this.block('other');
  }
  changeCode() {
    if (this.changingCode || this.ended || !this.logic) return;
    this.changingCode = true;
    if (this.phase === 'leading') this.release(true);
    this.emitOps([['set', ['code'], makeIslandCode()]]);
    this.flush();
    this.save();
    setTimeout(() => {
      this.changingCode = false;
      if (this.ended) return;
      this.claim();
      this.emit('codechanged', this.state.code);
    }, 600);
  }
  block(why) {
    if (this.blocked) return;
    this.blocked = why;
    clearTimeout(this.seekTimer);
    if (this.phase === 'leading') this.release(true);
    this.emit('netstatus');
    this.emit('blocked', why);
  }

  acceptLink(link) {
    let pid = null;
    const helloTimer = setTimeout(() => { if (!pid) link.close(); }, 30000);
    link.onMessage((m) => {
      if (link.closed || link.gone) return; // e.g. we just let go of the meeting place
      if (!pid) { this.greet(link, m, (id) => { pid = id; clearTimeout(helloTimer); }); return; }
      const o = this.online.get(pid);
      if (o) o.t = performance.now();
      if (m.k === 'pos') { if (o) o.s = m.s; return; }
      if (m.k === 'req') {
        const res = this.logic ? this.logic.handle(pid, m.req) : { ok: false, msg: 'Reconnecting…' };
        this.flush();
        link.send({ k: 'rep', rid: m.rid, res });
        return;
      }
      if (m.k === 'bye') { dbg('bye from', pid); link.close(); }
    });
    link.onClose(() => {
      clearTimeout(helloTimer);
      this.links.delete(link);
      if (pid && link.pid === pid && !link.gone) {
        this.seen.set(pid, performance.now());
        this.online.delete(pid);
        this.broadcast({ k: 'online', online: this.onlineList() });
        this.emit('players');
        this.emit('left', pid);
      }
    });
  }

  // The first thing a phone says on a new link: hello (may I visit?), meet (I lead this island too),
  // or peek (which island is this?).
  greet(link, m, accepted) {
    if (this.phase !== 'leading' || !this.logic) { link.close(); return; }
    if (m.k === 'peek') { // (the link stays open: a hello may follow on it; if not, it closes after 30 s)
      const s = this.state;
      link.send({ k: 'peekr', v: PROTOCOL, vid: s.vx.vid, name: s.name, day: s.day, fish: Object.keys(s.journal).length, faces: membersOf(s).slice(0, 8).map((p) => p.name), n: this.online.size });
      return;
    }
    if (m.k === 'meet') {
      const mine = this.meetInfo();
      link.send({ k: 'meet', m: mine });
      setTimeout(() => link.close(), 1500);
      this.meetLeader(m.m, mine);
      return;
    }
    const refuse = (why, msg, extra) => { link.send({ k: 'kick', why, msg, ...extra }); setTimeout(() => link.close(), 500); };
    if (m.k === 'replica' && link.hello) { this.letIn(link, link.hello, m.state, accepted); return; }
    if (m.k !== 'hello') return;
    if (m.v !== PROTOCOL) { refuse('version', m.v < PROTOCOL ? OLD_VERSION_MSG : 'Different versions of Cozy Cove: update both phones to play together.'); return; }
    const id = String(m.pid || '').slice(0, 40);
    if (!id) return;
    if (id === this.pid) { refuse('self', 'This phone is already on the island.'); return; }
    // a copy of another island that happens to have our code: never mixed with ours
    if (!m.move && m.vid !== this.state.vx.vid) { refuse('other', '', { m: this.meetInfo() }); return; }
    // their copy differs from ours: ask for it (it is merged in, so nothing anyone did is lost)
    if (!m.move && m.digest !== digest(this.state)) { link.hello = m; link.send({ k: 'send' }); return; }
    this.letIn(link, m, null, accepted);
  }

  letIn(link, m, replica, accepted) {
    const id = String(m.pid || '').slice(0, 40);
    link.hello = null;
    if (replica) this.mergeIn(replica);
    // same person on a new link (their phone reconnected): the old link goes
    for (const other of this.links) if (other.pid === id && other !== link) { dbg('replacing old link of', id); other.pid = null; other.gone = true; other.close(); this.links.delete(other); }
    if ([...this.online.keys()].filter((p) => p !== id).length >= MAX_PLAYERS) {
      // full: both copies are merged anyway, and the newcomer plays on its own merged copy for now
      link.send({ k: 'welcome', v: PROTOCOL, full: true, state: this.state, you: id });
      setTimeout(() => link.close(), 800);
      return;
    }
    accepted(id);
    link.pid = id;
    this.links.add(link);
    this.logic.a_hello(id, { name: m.name, look: m.look });
    const rec = this.state.players[id]; // (the rules cleaned up the name and look)
    this.online.set(id, { name: rec.name, look: rec.look, s: m.s || null, t: performance.now() });
    this.flush(); // (the newcomer ignores this: the welcome below already has everything)
    link.send({ k: 'welcome', v: PROTOCOL, state: this.state, you: id, lead: this.pid, online: this.onlineList() });
    this.broadcast({ k: 'online', online: this.onlineList() }, link);
    this.emit('players');
    this.emit('joined', id);
  }

  // A family member's copy comes in: merge it into ours. The visitors already here get the merged
  // island too (only when something changed).
  mergeIn(replica) {
    const theirs = this.checked(replica);
    if (!theirs || theirs.vx.vid !== this.state.vx.vid) return false;
    this.flush(); // (everyone has everything up to now before the island changes under them)
    const before = digest(this.state);
    let merged;
    try { merged = mergeVillages(this.state, theirs); } catch (e) { console.warn('merge failed', e); return false; }
    if (digest(merged) === before) return false;
    this.state = merged;
    this.dirty = true;
    this.broadcast({ k: 'resync', state: this.state });
    this.emit('state');
    this.logic.checkProjects(); // (the merged island may have finished a project or earned a sticker)
    this.logic.checkStickers();
    return true;
  }

  onlineList() {
    return [...this.online.entries()].map(([pid, o]) => ({ pid, name: o.name, look: o.look }));
  }
  setOnline(next) {
    const t = performance.now();
    for (const pid of this.online.keys()) if (!next.has(pid)) this.seen.set(pid, t);
    this.online = next;
  }
  // back within a few seconds (e.g. a new phone took over leading): not news
  quickReturn(pid) { const t = this.seen.get(pid); return t !== undefined && performance.now() - t < RETURN_MS; }

  broadcast(msg, except = null) {
    for (const l of this.links) if (l !== except && l.pid) l.send(msg);
  }

  // the leading phone: record ops (with this phone's bookkeeping), apply them, queue them for everyone
  emitOps(ops, auto = false) {
    if (!ops?.length || this.role !== 'host') return;
    if (!this.marked) { ls.set(UNSAVED_KEY, '1'); this.marked = true; } // (cleared by the next save)
    const full = withBookkeeping(ops, this.col, this.state, { auto });
    applyOps(this.state, full);
    this.pendingOps.push(...full);
    this.dirty = true;
    this.emit('ops', full);
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

  // ------------------------------------------------------------------ visiting
  // Say hello to the leading phone. If our copy differs from its copy, it asks for ours and merges it
  // in; then it lets us in with the merged island. Resolves {ok} or {ok: false, why, kick}.
  hello(link, { move = false, old = null } = {}) {
    this.phase = 'joining';
    if (this.logic) this.logic.dead = true; // (nothing changes here while we go over; taps wait a moment)
    return new Promise((resolve) => {
      let done = false;
      const fail = (why, kick) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        link.close();
        resolve({ ok: false, why, kick });
      };
      const t = setTimeout(() => fail('timeout'), 12000);
      link.onMessage((m) => {
        if (this.ended) return;
        if (!done) {
          if (m.k === 'send') { link.send({ k: 'replica', state: this.state }); return; }
          if (m.k === 'kick') { fail('kick', m); return; }
          if (m.k !== 'welcome') return;
          const st = this.checked(m.state);
          if (!st) { fail('bad'); return; }
          // joining a new family: the island this phone had goes into the archive first (never lost)
          if (old && old.vx?.vid !== st.vx.vid && !archiveIsland(old)) { fail('nospace'); return; }
          done = true;
          clearTimeout(t);
          if (move) this.col = newColumn(); // (a copy we didn't merge ours into: a fresh column)
          this.state = st;
          this.save('both');
          if (m.full) { link.close(); resolve({ ok: false, why: 'full' }); this.emit('full'); return; }
          this.visit(link, m);
          resolve({ ok: true });
          return;
        }
        if (this.link === link) this.onGuestMessage(m);
      });
      link.onClose(() => {
        if (!done) { fail('closed'); return; }
        if (this.link === link) this.lostLeader(false);
      });
      const s = this.state;
      link.send({ k: 'hello', v: PROTOCOL, pid: this.profile.id, name: this.profile.name, look: this.profile.look, s: this.myPos, vid: s?.vx?.vid || null, digest: s && !move ? digest(s) : null, move });
    });
  }

  visit(link, m) {
    if (this.logic) this.logic.dead = true;
    this.logic = null;
    this.role = 'guest';
    this.phase = 'visiting';
    this.link = link;
    this.pid = m.you;
    this.leaderPid = m.lead;
    this.pendingOps = [];
    this.pendingFx = [];
    const next = new Map();
    for (const p of m.online || []) next.set(p.pid, { name: p.name, look: p.look, s: null, t: performance.now() });
    this.setOnline(next);
    this.connected = true;
    this.lastSnap = performance.now();
    this.fullWait = 0;
    this.startHeartbeat();
    this.emit('state');
    this.emit('players');
    this.emit('netstatus');
    this.runQueued(); // (anything tapped while we were being let in goes to the leading phone now)
  }

  onGuestMessage(m) {
    switch (m.k) {
      case 'ev':
        applyOps(this.state, m.ops);
        this.dirty = true;
        this.emit('ops', m.ops);
        if (m.ops.some((op) => op[1][0] === 'code')) this.emit('codechanged', this.state.code);
        break;
      case 'fx':
        for (const f of m.list) this.emit('fx', f);
        break;
      case 'snap': {
        this.lastSnap = performance.now();
        this.lastSnapMsg = m;
        this.state.time = m.tm;
        if (m.w !== this.state.weather) this.state.weather = m.w;
        if (m.ck > this.state.clock) this.state.clock = m.ck; // (so our copy's timers are right if we lead later)
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
        this.setOnline(next);
        for (const pid of next.keys()) if (!prev.has(pid)) this.emit('joined', pid);
        for (const pid of prev) if (!next.has(pid)) this.emit('left', pid);
        this.emit('players');
        break;
      }
      case 'resync': { // the leading phone merged someone's copy in: here is the whole island again
        const st = this.checked(m.state);
        if (st) { this.state = st; this.dirty = true; this.emit('state'); }
        break;
      }
      case 'rep': {
        const w = this.waiting.get(m.rid);
        if (w) { this.waiting.delete(m.rid); clearTimeout(w.t); w.resolve(m.res || { ok: false }); }
        break;
      }
      case 'handover': // the leading phone is going away (e.g. it was put in a pocket): take over at once
        this.lostLeader(true);
        break;
      case 'kick':
        this.lostLeader(false);
        break;
      default:
    }
  }

  // The leading phone went away (it said so, or went quiet). Keep playing on our own copy straight away;
  // after our turn in line (so the family doesn't all grab the meeting place at once), look for whoever
  // leads now, or lead ourselves.
  lostLeader(handover) {
    if (this.phase !== 'visiting') return;
    dbg('the leading phone went away', handover ? '(handover)' : '');
    const old = this.link;
    this.link = null;
    try { old?.close(); } catch { /* ignore */ }
    const line = [...this.online.keys()].filter((p) => p !== this.leaderPid).sort();
    const rank = Math.max(0, line.indexOf(this.pid));
    const asked = [...this.waiting.values()];
    this.waiting.clear();
    for (const w of asked) clearTimeout(w.t);
    this.save();
    this.lead({ quiet: true });
    // what we asked the leading phone for and never heard back about is done here instead
    // (if it did arrive there, it may count twice; but a fish that was caught is never lost)
    for (const w of asked) { w.resolve(this.logic.handle(this.pid, w.req)); this.flush(); }
    this.later(rank * RANK_MS + (handover ? 600 : 0));
  }

  // Tapped Cancel while still joining: stop that try completely (it will never say hello).
  cancel() {
    this.ended = true;
    this.joinAbort?.abort();
  }

  // ------------------------------------------------------------------ both
  request(req) {
    if (this.role === 'host' && this.logic && !this.logic.dead) {
      const res = this.logic.handle(this.pid, req);
      this.flush();
      return Promise.resolve(res);
    }
    if (this.phase === 'visiting' && this.link && this.connected) {
      const rid = ++this.rid;
      return new Promise((resolve) => {
        const t = setTimeout(() => { this.waiting.delete(rid); resolve({ ok: false, msg: 'The island didn’t answer. Try again.' }); }, 8000);
        this.waiting.set(rid, { resolve, t, req });
        this.link.send({ k: 'req', rid, req });
      });
    }
    // being let in by the leading phone right now (a moment): it goes there as soon as we're in
    if (this.phase === 'joining' && this.state) return new Promise((resolve) => this.queued.push({ req, resolve }));
    return Promise.resolve({ ok: false, msg: 'Reconnecting…' });
  }
  runQueued() {
    const q = this.queued;
    this.queued = [];
    for (const { req, resolve } of q) this.request(req).then(resolve);
  }

  // A tiny "still here!" every second, even if the screen isn't drawing (menus, slow moments).
  startHeartbeat() {
    clearInterval(this.hb);
    this.hb = setInterval(() => {
      if (hidden() || this.ended) return;
      const t = performance.now();
      if (this.phase === 'visiting' && t - (this.lastSent || 0) > 900) {
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
      if (this.logic && !this.logic.dead) this.logic.tick(dt);
      // drop visitors we haven't heard from in a while
      for (const l of this.links) {
        if (l.pid && now - l.lastHeard > 15000) { dbg('timeout', l.pid, now, l.lastHeard); l.close(); }
      }
      // network timing uses the real clock (not the frame rate), so a slow frame never starves it
      if (now - this.snapT >= SNAP_MS) {
        this.snapT = now;
        this.flush();
        if (this.links.size) { // (playing alone: nobody to tell, so don't build the message at all)
          const me = this.online.get(this.pid);
          if (me) { me.s = this.posProvider?.() || null; me.t = now; }
          const p = {};
          for (const [pid, o] of this.online) if (o.s) p[pid] = o.s;
          this.broadcast({ k: 'snap', tm: +this.state.time.toFixed(3), w: this.state.weather, ck: Math.floor(this.state.clock), p, ...(this.snapExtra?.() || {}) });
        }
      } else this.flush();
    } else if (this.phase === 'visiting') {
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
      if (now - this.lastSnap > 8000) this.lostLeader(false);
    }
    this.saveT += dt;
    if (this.saveT > 12 && this.dirty) this.save();
    else if (this.saveT > 45 && this.role === 'host') this.save(); // keep the time of day saved too
  }

  // Every family member's phone keeps its copy saved (visitors too: anyone may lead next time).
  // backup: 'both' writes the safety copy too (a copy we just took over, or a brand-new island);
  // the first save of each game moves the last game's save into the safety copy.
  save(backup = null) {
    if (!this.state || this.wiped || this.phase === 'off') return;
    this.saveT = 0;
    this.dirty = false;
    const ok = saveIsland(this.state, backup || (this.backedUp ? null : 'rotate'));
    if (ok) {
      this.backedUp = true;
      if (this.marked) { ls.del(UNSAVED_KEY); this.marked = false; }
    } else if (!this.saveWarned) { this.saveWarned = true; this.emit('savefail'); } // (storage full or switched off: say so once)
  }

  // The phone went into a pocket (or another app came up): leading phones let the family take over
  // straight away (a hidden phone can't run the island for them); everyone saves.
  hide() {
    clearTimeout(this.seekTimer);
    if (this.phase === 'leading') this.release(this.links.size > 0);
    this.save();
  }
  // Back on screen: a phone that let go looks for the family again first (usually it now visits).
  show() {
    if (this.ended) return;
    if (this.phase === 'visiting') { this.lastSnap = performance.now(); return; }
    if (this.phase === 'alone') {
      if (this.logic) this.logic.quietUntil = performance.now() + QUIET_MS;
      this.seek();
    } else if (this.phase === 'leading') this.transport?.wake();
  }

  // Back to the start screen (the island stays on this phone, and the family plays on).
  leave() {
    if (this.ended) return;
    if (this.phase === 'leading') this.release(true);
    this.save();
    if (this.phase === 'visiting') {
      const l = this.link;
      l?.send({ k: 'bye' });
      setTimeout(() => l?.close(), 200);
    }
    this.ended = true;
    this.phase = 'ended';
    clearInterval(this.hb);
    clearTimeout(this.seekTimer);
    if (this.logic) this.logic.dead = true;
  }

  // An island from the network, checked and filled in for this version of the game.
  checked(st) {
    if (!looksLikeIsland(st)) return null;
    try { return migrate(st, freshIsland(this.world)); } catch { return null; }
  }

  // what the little status dot says: 'finding' | 'online' | 'offline' | 'update' | 'alone'
  netState() {
    if (this.blocked === 'version') return 'update';
    if (this.blocked) return 'alone';
    if (this.phase === 'visiting') return 'online';
    if (this.phase === 'joining' || this.seeking) return 'finding';
    if (this.phase === 'leading') { const st = this.transport?.status() || {}; return st.peer || st.trystero ? 'online' : 'offline'; }
    return this.fullWait ? 'alone' : 'finding';
  }
  members() { return membersOf(this.state); }

  get code() { return this.state?.code || this._code; } // (the island's code can change: the ledger knows the latest)
  set code(v) { this._code = v; }
  get isHost() { return this.role === 'host'; }
}

export { loadIsland };
