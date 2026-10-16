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

const APP_ID = 'cozy-cove-family-island-v1';
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
function trysteroConfig(code) {
  const c = { appId: APP_ID, password: 'cove-' + code, rtcConfig: { iceServers: ICE } };
  const relay = params.get('relay');
  if (relay) c.relayConfig = { urls: relay.split(',') };
  return c;
}
const usePeer = !params.has('nopeer');
const dbg = params.has('netdebug') ? (...a) => console.log('[dbg] net', ...a) : () => {};
const useTry = !params.has('notry');

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
  // called by the transport when the connection drops
  dropped() {
    if (this.closed) return;
    this.closed = true;
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

// ------------------------------------------------------------------ hosting
export class HostTransport {
  constructor(code, onLink, created = Date.now()) {
    this.code = code;
    this.created = created;
    this.onLink = onLink;
    this.peer = null;
    this.room = null;
    this.peerOk = false;
    this.tryLinks = new Map();
    this.stopped = false;
    this.retry = null;
    this.onStatus = null;
    this.onCollision = null; // another island is using our code
    this.idTaken = 0;
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
    try {
      const peer = new Peer(PEER_PREFIX + this.code.toLowerCase(), peerOptions());
      this.peer = peer;
      peer.on('open', () => { this.peerOk = true; this.idTaken = 0; this.onStatus?.(); });
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
        this.peerOk = false;
        this.onStatus?.();
        if (!peer.destroyed && !this.stopped) setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch { /* ignore */ } }, 1500);
      });
      peer.on('error', (e) => {
        const t = e?.type;
        if (t === 'peer-unavailable') return; // not about us
        this.peerOk = false;
        this.onStatus?.();
        if (t === 'unavailable-id') {
          this.idTaken++;
          // still taken after ~80 s (longer than the server's 60 s timeout for a crashed app):
          // that's someone else's island, not our own old session
          if (this.idTaken >= 13) { this.onCollision?.(); return; }
        }
        // try again in a little while (the old session may still be closing)
        try { peer.destroy(); } catch { /* ignore */ }
        if (!this.stopped) {
          clearTimeout(this.retry);
          this.retry = setTimeout(() => this.startPeer(), t === 'unavailable-id' ? 6000 : 4000);
        }
      });
    } catch (e) {
      console.warn('peerjs failed', e);
    }
  }
  startTrystero() {
    try {
      // Handshake: before two phones connect they say who they are. Hosts only accept guests,
      // guests only accept a host — so guests never connect to each other (simpler & sturdier),
      // and if two HOSTS meet, two islands share a code: the newer island picks a new one.
      const room = joinRoom(trysteroConfig(this.code), 'island-' + this.code.toLowerCase(), {
        onPeerHandshake: async (peerId, send, receive) => {
          await send({ role: 'host', c: this.created });
          const { data } = await receive();
          if (data?.role === 'host') {
            if ((data.c || 0) <= this.created) this.onCollision?.();
            throw new Error('two hosts');
          }
        },
        onJoinError: (d) => dbg('host: handshake refused', d?.error),
      });
      this.room = room;
      const act = room.makeAction('m');
      this.tryAct = act;
      room.onPeerJoin = (peerId) => {
        dbg('host: peer join', peerId);
        let link = this.tryLinks.get(peerId);
        if (link && !link.closed) return;
        link = new Link('trystero', (s) => act.send(s, { target: peerId }), () => {});
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
    try { this.room?.leave(); } catch { /* ignore */ }
    for (const l of this.tryLinks.values()) l.dropped();
    this.tryLinks.clear();
  }
}

// ------------------------------------------------------------------ joining
// Resolves with a Link to the host, or rejects after `timeoutMs`.
export function joinHost(code, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanups = [];
    const finish = (err, link, winner) => {
      if (done) { if (link) link.close(); return; }
      done = true;
      clearTimeout(timer);
      for (const c of cleanups) if (c.kind !== winner) c.fn();
      if (err) reject(err);
      else resolve(link);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);

    if (usePeer) {
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
        peer.on('open', tryConnect);
        peer.on('error', (e) => {
          // host not there (yet)? keep trying for a bit — maybe they're just opening the app
          if (e?.type === 'peer-unavailable' && attempts < 6 && !done) setTimeout(tryConnect, 2500);
        });
      } catch (e) {
        console.warn('peerjs join failed', e);
      }
    }

    if (useTry) {
      try {
        const hosts = new Set();
        let link = null, hostId = null;
        const room = joinRoom(trysteroConfig(code), 'island-' + code.toLowerCase(), {
          onPeerHandshake: async (peerId, send, receive) => {
            await send({ role: 'guest' });
            const { data } = await receive();
            if (data?.role !== 'host') throw new Error('guests don\u2019t connect to each other');
            hosts.add(peerId);
          },
          onJoinError: (d) => dbg('guest: handshake refused', d?.error),
        });
        const act = room.makeAction('m');
        cleanups.push({ kind: 'trystero', fn: () => { try { room.leave(); } catch { /* ignore */ } } });
        room.onPeerJoin = (peerId) => {
          dbg('guest: peer join', peerId, hosts.has(peerId) ? '(host)' : '');
          if (link || !hosts.has(peerId)) return;
          hostId = peerId;
          link = new Link('trystero', (s) => act.send(s, { target: hostId }), () => { try { room.leave(); } catch { /* ignore */ } });
          finish(null, link, 'trystero');
        };
        act.onMessage = (data, meta) => {
          const peerId = meta?.peerId ?? meta;
          if (link && peerId === hostId) link.receive(data);
        };
        room.onPeerLeave = (peerId) => { dbg('guest: peer leave', peerId, peerId === hostId ? '(host!)' : ''); if (link && peerId === hostId) link.dropped(); };
      } catch (e) {
        console.warn('trystero join failed', e);
      }
    }
    if (!usePeer && !useTry) finish(new Error('no transport'));
  });
}

// Friendly island codes, e.g. "CRAB 27": a cozy word + 2 digits (easy for kids to type).
const WORDS = ['CRAB', 'FISH', 'SHELL', 'WAVE', 'SUN', 'PALM', 'BOAT', 'STAR', 'MOON', 'CORAL', 'SAND', 'KELP', 'PEARL', 'TIDE',
  'REEF', 'DUCK', 'FROG', 'BEAR', 'MINT', 'PLUM', 'PEACH', 'LIME', 'KIWI', 'BERRY', 'HONEY', 'TACO', 'CAKE', 'PIE', 'MANGO', 'OTTER',
  'SEAL', 'GULL', 'TURTLE', 'SQUID', 'TUNA', 'KOI', 'LILY', 'DAISY', 'FERN', 'MAPLE', 'CLOUD', 'RAIN', 'BREEZE', 'COCO', 'BEACH', 'COVE', 'ISLE', 'NEMO'];
export function makeIslandCode() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  const n = String(100 + Math.floor(Math.random() * 900));
  return w + n;
}
export function cleanCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
}
