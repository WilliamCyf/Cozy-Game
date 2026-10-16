// Local stand-ins for the internet matchmakers, used only for testing on a computer:
//  - a PeerJS signalling server on port 9000
//  - a tiny Nostr relay (what Trystero uses) on port 7777
import { ExpressPeerServer } from 'peer';
import express from 'express';
import { WebSocketServer } from 'ws';

export function startServers({ peerPort = 9000, relayPort = 7777, log = false } = {}) {
  const app = express();
  const server = app.listen(peerPort, '127.0.0.1');
  app.use('/', ExpressPeerServer(server, { path: '/' }));
  const peer = server;
  const wss = new WebSocketServer({ port: relayPort, host: '127.0.0.1' });
  const subs = new Map(); // ws -> Map(subId -> filters)
  const matches = (ev, f) => {
    if (f.kinds && !f.kinds.includes(ev.kind)) return false;
    if (f.since && ev.created_at < f.since - 5) return false;
    for (const [k, vals] of Object.entries(f)) {
      if (k[0] !== '#') continue;
      const tag = k.slice(1);
      if (!ev.tags.some((t) => t[0] === tag && vals.includes(t[1]))) return false;
    }
    return true;
  };
  wss.on('connection', (ws) => {
    subs.set(ws, new Map());
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      const [type, a, ...rest] = msg;
      if (type === 'REQ') {
        subs.get(ws).set(a, rest);
        ws.send(JSON.stringify(['EOSE', a]));
      } else if (type === 'CLOSE') {
        subs.get(ws)?.delete(a);
      } else if (type === 'EVENT') {
        const ev = a;
        ws.send(JSON.stringify(['OK', ev.id, true, '']));
        for (const [client, m] of subs) {
          for (const [subId, filters] of m) {
            if (filters.some((f) => matches(ev, f))) client.send(JSON.stringify(['EVENT', subId, ev]));
          }
        }
        if (log) console.log('relay event kind', ev.kind);
      }
    });
    ws.on('close', () => subs.delete(ws));
  });
  return { close: () => { try { peer.close?.(); } catch { /* ignore */ } wss.close(); } };
}

if (process.argv[1]?.endsWith('servers.mjs')) {
  startServers({ log: true });
  console.log('peer server :9000, nostr relay :7777');
}
