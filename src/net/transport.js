// How the phones find each other and talk.
//
// Phones talk DIRECTLY to each other (WebRTC, "peer to peer") — no game server in the middle,
// so it's fast and private. But to *find* each other they need a matchmaker for a moment,
// like a receptionist connecting a phone call. We use TWO free matchmakers at the same time:
//   1. PeerJS cloud
//   2. Trystero (Nostr relays — many independent servers)
// Whichever connects first wins. If one is down, the other still works.
import { Peer } from 'peerjs';
import { joinRoom } from 'trystero';

// (v5: family islands. Older versions use another name on the relay road, so the two never mix there.)
const APP_ID = 'cozy-cove-family-island-v5';
const PEER_PREFIX = 'cozycove-v1-';
const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const CHUNK = 12000;

// Test/development overrides: ?signal=localhost:9000&relay=ws://localhost:7777&nopeer&notry
const params = new URLSearchParams(location.search);
function peerOptions() {
  const o = { debug: 0, config: { iceServers: ICE } };
  const sig = params.get('signal');
  if (sig) {
    const [host, port] = sig.split(':');
    Object.assign(o, { host, port: Number(port || 9000), path: '/', secure: false });
  }
  return o;
}
// (No relay password: the room's name already has the island code in it, and the relay's own password
// check gets out of step after a phone was frozen, see introduce() below.)
function trysteroConfig(code) {
  const c = { appId: APP_ID, rtcConfig: { iceServers: ICE } };
  const relay = params.get('relay');
  if (relay) c.relayConfig = { urls: relay.split(',') };
  return c;
}
const usePeer = !params.has('nopeer');
// Leaving a Trystero room takes a moment; joining the same room again before that finishes gets the
// old, closing room back. And joining again straight after leaving can stall the handshake with the
// phones still in the room for ~25 s (see HANGUP_WAIT). So a new join waits until the last room has
// really been left, and a moment more.
const REJOIN_WAIT = 1500;
let roomLeaving = Promise.resolve();
function leaveRoom(room) {
  roomLeaving = Promise.resolve().then(() => room.leave()).catch(() => {}).then(() => new Promise((r) => setTimeout(r, REJOIN_WAIT)));
  return roomLeaving;
}
const dbg = params.has('netdebug') ? (...a) => console.log('[dbg] net', ...a) : () => {};
// On the Trystero road, the host hanging up on one phone (that phone went quiet, or a newer
// connection of the same player replaced it) is invisible to that phone: the room stays open.
// So the host says so with this tiny signal. (Not JSON: older versions of the game just ignore it.)
const HANGUP = '\u0000hangup';
// After a hang-up the guest waits a moment before letting go and joining again: joining straight
// away can stall the handshake for ~25 s.
const HANGUP_WAIT = 1500; // (measured: joining at once stalled 3 times in 8; after 1.5 s, 0 times in 20)
const useTry = !params.has('notry');

// The relay road's handshake: two phones say who they are. A note from an earlier try between the same
// two phones can still be on its way (one of them was frozen for a while, say), and reading it as the
// answer would put every later handshake between them out of step. So each note carries a fresh
// number, and we only finish once the other phone has echoed OUR number back: by then its newest note
// has arrived too (notes arrive in order), and that one is the answer.
async function introduce(send, receive, info) {
  const n = Math.random().toString(36).slice(2, 10);
  await send({ ...info, n });
  let theirs = null;
  for (let i = 0; i < 16; i++) {
    const { data } = await receive();
    if (data?.ack === n) { if (theirs) return theirs; continue; }
    if (data && typeof data.n === 'string' && data.role) { theirs = data; await send({ ack: data.n }); }
  }
  throw new Error('no clear answer');
}

// A Link = one open conversation with one other phone.
// Big messages are cut into pieces (chunks) and glued back together on arrival.
class Link {
  constructor(kind, sendRaw, closeRaw) {
    this.kind = kind;
    this.sendRaw = sendRaw;
    this.closeRaw = closeRaw;
    this.closed = false;
    this.msgCb = null;
    this.closeCb = null;
    this.parts = new Map();
    this.seq = 0;
    this.lastHeard = performance.now();
  }
  send(obj) {
    if (this.closed) return;
    const s = JSON.stringify(obj);
    try {
      if (s.length <= CHUNK) this.sendRaw(s);
      else {
        const id = (++this.seq).toString(36);
        const n = Math.ceil(s.length / CHUNK);
        for (let i = 0; i < n; i++) this.sendRaw(`~${id}|${i}|${n}|${s.slice(i * CHUNK, (i + 1) * CHUNK)}`);
      }
    } catch (e) {
      console.warn('send failed', e);
    }
  }
  receive(raw) {
    this.lastHeard = performance.now();
    if (typeof raw !== 'string') return;
    let s = raw;
    if (s[0] === '~') {
      const a = s.indexOf('|'), b = s.indexOf('|', a + 1), c = s.indexOf('|', b + 1);
      const id = s.slice(1, a), i = Number(s.slice(a + 1, b)), n = Number(s.slice(b + 1, c));
      let entry = this.parts.get(id);
      if (!entry) this.parts.set(id, (entry = { got: 0, pieces: new Array(n) }));
      if (entry.pieces[i] === undefined) { entry.pieces[i] = s.slice(c + 1); entry.got++; }
      if (entry.got < n) return;
      this.parts.delete(id);
      s = entry.pieces.join('');
    }
    let msg;
    try { msg = JSON.parse(s); } catch { return; }
    this.msgCb?.(msg);
  }
  onMessage(cb) { this.msgCb = cb; }
  onClose(cb) { this.closeCb = cb; }
  // called by the transport when the connection drops (we still let go of what we hold:
  // a guest's own matchmaker connection or chat room, so nothing keeps running in the background)
  dropped() {
    if (this.closed) return;
    this.closed = true;
    try { this.closeRaw(); } catch { /* already gone */ }
    this.closeCb?.();
  }
  // we hang up ourselves (still tell our listener, exactly once)
  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.closeRaw(); } catch { /* already gone */ }
    this.closeCb?.();
  }
}

// ------------------------------------------------------------------ leading (holding the meeting place)
// The phone that leads the family's game right now holds the island's "meeting place": its PeerJS name
// and its Trystero room. Family phones that open the game look there first.
export class HostTransport {
  constructor(code, onLink, meetInfo = () => null) {
    this.code = code;
    this.meetInfo = meetInfo; // who we are, for when we meet another leading phone of the same island
    this.onLink = onLink;
    this.peer = null;
    this.room = null;
    this.peerOk = false;
    this.tryLinks = new Map();
    this.stopped = false;
    this.retry = null;
    this.onStatus = null;
    this.onIdTaken = null; // someone already holds our PeerJS name (usually a family member's phone: go and meet it)
    this.onHostMeet = null; // another phone leading this code showed up in the Trystero room
  }
  start() {
    if (usePeer) this.startPeer();
    if (useTry) this.startTrystero();
  }
  status() {
    return { peer: this.peerOk, trystero: !!this.room };
  }
  startPeer() {
    if (this.stopped) return;
    clearTimeout(this.retry);
    if (this.peer && !this.peer.destroyed) return; // one matchmaker connection only (a second would fight over our name)
    try {
      const peer = new Peer(PEER_PREFIX + this.code.toLowerCase(), peerOptions());
      this.peer = peer;
      let opened = false;
      peer.on('open', () => { opened = true; this.peerOk = true; this.takenWait = 0; this.reconnectWait = 1500; this.onStatus?.(); });
      peer.on('connection', (conn) => {
        let link = null;
        conn.on('open', () => {
          link = new Link('peerjs', (s) => conn.send(s), () => conn.close());
          conn.on('data', (d) => link.receive(d));
          this.onLink(link);
        });
        conn.on('close', () => link?.dropped());
        conn.on('error', () => link?.dropped());
      });
      peer.on('disconnected', () => {
        if (peer !== this.peer) return;
        this.peerOk = false;
        this.onStatus?.();
        // only the line to the matchmaker dropped: the family's own connections keep working.
        // Reconnect, waiting a bit longer each time it fails (so a long outage doesn't drain the battery)
        const wait = this.reconnectWait || 1500;
        this.reconnectWait = Math.min(wait * 2, 30000);
        if (!peer.destroyed && !this.stopped) setTimeout(() => { try { if (!peer.destroyed && peer.disconnected) peer.reconnect(); } catch { /* ignore */ } }, wait);
      });
      peer.on('error', (e) => {
        if (peer !== this.peer) return; // an old one we already replaced
        const t = e?.type;
        if (t === 'peer-unavailable') return; // not about us
        this.peerOk = false;
        this.onStatus?.();
        // a hiccup on the line to the matchmaker: keep this peer (and every family member connected
        // through it); the 'disconnected' handler above reconnects it
        if (opened && !peer.destroyed && (t === 'network' || t === 'socket-error' || t === 'socket-closed' || t === 'disconnected')) return;
        // our name is taken: by a family member's phone that leads too (the session goes to meet it), or
        // by our own old connection that is still closing. Try again in a while, waiting longer each
        // time (6 s .. 1 min), so a phone that keeps it for long doesn't cost battery.
        let wait = 4000;
        if (t === 'unavailable-id') {
          this.takenWait = Math.min((this.takenWait || 3000) * 2, 60000);
          wait = this.takenWait;
          this.onIdTaken?.();
        }
        try { peer.destroy(); } catch { /* ignore */ }
        if (!this.stopped) {
          clearTimeout(this.retry);
          this.retry = setTimeout(() => this.startPeer(), wait);
        }
      });
    } catch (e) {
      console.warn('peerjs failed', e);
    }
  }
  startTrystero() {
    // (a room this phone was in a moment ago, e.g. while looking for the family, must be left first)
    roomLeaving.then(() => { if (!this.stopped) this.joinTrystero(); });
  }
  joinTrystero() {
    try {
      // Handshake: before two phones talk they say who they are. A leading phone only talks to visitors,
      // visitors only talk to a leading phone (simpler and sturdier). Two LEADING phones don't talk here:
      // each tells the session who the other is, and the session decides which one goes over to the
      // other (see session.js). Nobody is turned away at the handshake itself, though: the relay road
      // keeps a connection it saw turned away half-open for minutes, and the same two phones could then
      // not reach each other later, when one of them leads. So the connection is simply not used.
      const roles = new Map();
      const room = joinRoom(trysteroConfig(this.code), 'island-' + this.code.toLowerCase(), {
        onPeerHandshake: async (peerId, send, receive) => {
          const mine = this.meetInfo();
          const data = await introduce(send, receive, { role: 'host', m: mine });
          roles.set(peerId, data.role);
          if (data.role === 'host') this.onHostMeet?.(data.m || null, mine);
        },
        onJoinError: (d) => dbg('host: handshake refused', d?.error),
      });
      if (this.stopped) { leaveRoom(room); return; }
      this.room = room;
      const act = room.makeAction('m');
      this.tryAct = act;
      room.onPeerJoin = (peerId) => {
        dbg('host: peer join', peerId, roles.get(peerId));
        if (roles.get(peerId) !== 'guest') return; // (another leading phone: not talked to here)
        let link = this.tryLinks.get(peerId);
        if (link && !link.closed) return;
        link = new Link('trystero', (s) => act.send(s, { target: peerId }), () => { try { act.send(HANGUP, { target: peerId }); } catch { /* ignore */ } });
        this.tryLinks.set(peerId, link);
        this.onLink(link);
      };
      room.onPeerLeave = (peerId) => {
        dbg('host: peer leave', peerId);
        const link = this.tryLinks.get(peerId);
        this.tryLinks.delete(peerId);
        link?.dropped();
      };
      act.onMessage = (data, meta) => {
        const peerId = meta?.peerId ?? meta;
        this.tryLinks.get(peerId)?.receive(data);
      };
    } catch (e) {
      console.warn('trystero failed', e);
    }
  }
  // The phone holding our PeerJS name is letting go of it (it is coming over to us): try again soon,
  // not after the long wait.
  peerSoon() {
    if (!usePeer || this.stopped || this.peerOk) return;
    clearTimeout(this.retry);
    this.takenWait = 0;
    this.retry = setTimeout(() => this.startPeer(), 1500);
  }
  // After returning from the background: make sure we're still reachable.
  wake() {
    if (this.stopped) return;
    if (usePeer && (!this.peer || this.peer.destroyed)) this.startPeer();
    else if (this.peer?.disconnected) { try { this.peer.reconnect(); } catch { /* ignore */ } }
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    try { this.peer?.destroy(); } catch { /* ignore */ }
    try { if (this.room) leaveRoom(this.room); } catch { /* ignore */ }
    for (const l of this.tryLinks.values()) l.dropped();
    this.tryLinks.clear();
  }
}

// ------------------------------------------------------------------ visiting
// Resolves with a Link to the phone holding the island's meeting place, or rejects after `timeoutMs`
// (or when `signal` is aborted: the player tapped Cancel, so everything this try opened is closed
// straight away). roads: 'both', or 'peer' for a quick check on PeerJS only.
// patience: give up this long after a road is really open (not counting the moment the phone was too busy
// to start, e.g. while the game is being set up); timeoutMs stays the longest it can take in all.
export function joinHost(code, timeoutMs = 20000, signal = null, { roads = 'both', patience = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanups = [];
    const finish = (err, link, winner) => {
      if (done) { if (link) link.close(); return; }
      done = true;
      clearTimeout(timer);
      clearTimeout(patient);
      for (const c of cleanups) if (c.kind !== winner) c.fn();
      if (err) reject(err);
      else resolve(link);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    let patient = null;
    const roadOpen = () => { if (patience && !patient && !done) patient = setTimeout(() => finish(new Error('timeout')), patience); };
    if (signal?.aborted) { finish(new Error('cancelled')); return; }
    signal?.addEventListener('abort', () => finish(new Error('cancelled')), { once: true });

    const withPeer = usePeer, withTry = useTry && roads !== 'peer';
    if (withPeer) {
      let peer;
      try {
        peer = new Peer(peerOptions());
        cleanups.push({ kind: 'peerjs', fn: () => { try { peer.destroy(); } catch { /* ignore */ } } });
        let attempts = 0;
        const tryConnect = () => {
          if (done) return;
          attempts++;
          const conn = peer.connect(PEER_PREFIX + code.toLowerCase(), { reliable: true, serialization: 'raw' });
          let link = null;
          conn.on('open', () => {
            link = new Link('peerjs', (s) => conn.send(s), () => { conn.close(); setTimeout(() => peer.destroy(), 500); });
            conn.on('data', (d) => link.receive(d));
            finish(null, link, 'peerjs');
          });
          conn.on('close', () => link?.dropped());
          conn.on('error', () => link?.dropped());
        };
        peer.on('open', () => { roadOpen(); tryConnect(); });
        peer.on('error', (e) => {
          // host not there (yet)? keep trying for a bit — maybe they're just opening the app
          if (e?.type === 'peer-unavailable' && attempts < 6 && !done) setTimeout(tryConnect, 2500);
        });
      } catch (e) {
        console.warn('peerjs join failed', e);
      }
    }

    if (withTry) {
      // (wait until a room we used before has really been left, or we would get that old room back)
      roomLeaving.then(() => { if (!done) joinTrystero(); });
    }
    function joinTrystero() {
      try {
        const hosts = new Set();
        let link = null, hostId = null;
        const room = joinRoom(trysteroConfig(code), 'island-' + code.toLowerCase(), {
          onPeerHandshake: async (peerId, send, receive) => {
            const data = await introduce(send, receive, { role: 'guest' });
            if (data.role === 'host') hosts.add(peerId); // (another visitor: not talked to, see above)
          },
          onJoinError: (d) => dbg('guest: handshake refused', d?.error),
        });
        const act = room.makeAction('m');
        cleanups.push({ kind: 'trystero', fn: () => { try { leaveRoom(room); } catch { /* ignore */ } } });
        if (done) { leaveRoom(room); return; } // finished while we waited
        roadOpen();
        room.onPeerJoin = (peerId) => {
          dbg('guest: peer join', peerId, hosts.has(peerId) ? '(host)' : '');
          if (link || !hosts.has(peerId)) return;
          hostId = peerId;
          link = new Link('trystero', (s) => act.send(s, { target: hostId }), () => { try { leaveRoom(room); } catch { /* ignore */ } });
          finish(null, link, 'trystero');
        };
        act.onMessage = (data, meta) => {
          const peerId = meta?.peerId ?? meta;
          if (!link || peerId !== hostId) return;
          if (data === HANGUP) { // reconnects like any drop, after a moment (see HANGUP_WAIT)
            dbg('guest: the host hung up');
            const l = link;
            setTimeout(() => l.dropped(), HANGUP_WAIT); // (dropping starts the rejoin at once, so the pause comes first)
            return;
          }
          link.receive(data);
        };
        room.onPeerLeave = (peerId) => { dbg('guest: peer leave', peerId, peerId === hostId ? '(host!)' : ''); if (link && peerId === hostId) link.dropped(); };
      } catch (e) {
        console.warn('trystero join failed', e);
      }
    }
    if (!withPeer && !withTry) finish(new Error('no transport'));
  });
}

// Friendly island codes, e.g. "🐢 TURTLE 482": a picture word + 3 numbers.
// Every word has its own picture, so joining is "tap the turtle, type 482": nobody has to read
// English letters (Mum reads Thai, little ones may not read yet).
export const CODE_WORDS = [
  ['CRAB', '🦀'], ['FISH', '🐟'], ['SHELL', '🐚'], ['WAVE', '🌊'], ['SUN', '☀️'], ['PALM', '🌴'],
  ['BOAT', '⛵'], ['STAR', '⭐'], ['MOON', '🌙'], ['CLOUD', '☁️'], ['RAIN', '🌧️'], ['DUCK', '🦆'],
  ['FROG', '🐸'], ['BEAR', '🐻'], ['OTTER', '🦦'], ['SEAL', '🦭'], ['TURTLE', '🐢'], ['SQUID', '🦑'],
  ['OCTO', '🐙'], ['WHALE', '🐳'], ['NEMO', '🐠'], ['PEACH', '🍑'], ['KIWI', '🥝'], ['BERRY', '🍓'],
  ['HONEY', '🍯'], ['TACO', '🌮'], ['CAKE', '🍰'], ['MANGO', '🥭'], ['COCO', '🥥'], ['DAISY', '🌼'],
  ['MAPLE', '🍁'], ['BUNNY', '🐰'], ['KITTY', '🐱'], ['PANDA', '🐼'], ['CHICK', '🐥'], ['BEE', '🐝'],
];
const CODE_PIC = Object.fromEntries(CODE_WORDS);
export function makeIslandCode() {
  const w = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)][0];
  const n = String(100 + Math.floor(Math.random() * 900));
  return w + n;
}
// "TURTLE482" -> { word: 'TURTLE', num: '482', pic: '🐢' }  (pic is '' for an old-style code)
export function splitCode(code) {
  const m = /^([A-Z]+)(\d+)$/.exec(cleanCode(code));
  return m ? { word: m[1], num: m[2], pic: CODE_PIC[m[1]] || '' } : null;
}
export const isPictureCode = (code) => !!splitCode(code)?.pic && splitCode(code).num.length === 3;
export function cleanCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
}
