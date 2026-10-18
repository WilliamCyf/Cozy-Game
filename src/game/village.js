// The family village: every member's phone keeps its own full copy of the village, so anyone can play
// at any time, even alone. When copies meet again they are merged, and nothing anyone did is lost or
// counted twice. Think of the family business books: each phone writes only in ITS OWN column, so
// merging two copies of the books is simply "take the newest version of every column", and every total
// is the sum of all the columns.
//
// state.vx holds that bookkeeping:
//   vid  the village's id (two copies are only ever merged when they are the same village)
//   c    counters  c[key][column] = [added, taken]   e.g. c['basket/shell']['p8a2…'] = [12, 5]
//        (a column is the id of the phone that was leading the game when it happened)
//   t    last-writer-wins stamps  t[key] = [time, column]   for things that are replaced, like a plot
// Nothing here runs every frame: the bookkeeping is added when something happens (a few times a
// minute), and merging only happens when a family member joins.

// ---------------------------------------------------------------- which paths are which
// Counts that go up and down: value = sum of every column's added minus taken.
export function counterKey(path) {
  const [a, b, c, d] = path;
  const n = path.length;
  if (a === 'coins' && n === 1) return 'coins';
  if (a === 'basket' && n === 2) return 'basket/' + b;
  if (a === 'stats' && n === 2 && b !== 'maxOnline') return 'stats/' + b;
  if (a === 'projects' && n === 4 && (c === 'got' || c === 'by')) return `projects/${b}/${c}/${d}`;
  if (a === 'players' && n === 3 && c === 'caught') return `players/${b}/caught`;
  if (a === 'journal' && n === 3 && c === 'n') return `journal/${b}/n`;
  return null;
}
const keyPath = (key) => key.split('/');

// Things that are replaced as a whole: the newest change wins (its time, then the column, decides).
export function lwwKey(path) {
  const [a, b, c] = path;
  switch (a) {
    case 'plots': case 'bushes': case 'palms': return path.length >= 2 ? `${a}/${b}` : null;
    case 'request': case 'name': case 'code': case 'mail': case 'treasure': case 'picnicDay': return a;
    case 'weather': case 'weatherUntil': return 'weather';
    case 'players': return path.length >= 3 && (c === 'name' || c === 'look' || c === 'left') ? `players/${b}/${c}` : null;
    default: return null;
  }
}
// which plain fields a stamp key stands for
function lwwPaths(key) {
  if (key === 'weather') return [['weather'], ['weatherUntil']];
  const p = keyPath(key);
  if (p[0] === 'plots' || p[0] === 'bushes' || p[0] === 'palms') p[1] = Number(p[1]);
  return [p];
}

const clone = (v) => (v === undefined || v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));
function getAt(o, path) {
  for (const k of path) { if (o == null) return undefined; o = o[k]; }
  return o;
}
function setAt(o, path, v) {
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = typeof path[i + 1] === 'number' ? [] : {};
    o = o[k];
  }
  const last = path[path.length - 1];
  if (v === undefined) delete o[last];
  else o[last] = v;
}
const later = (x, y) => (!y ? true : !x ? false : x[0] !== y[0] ? x[0] > y[0] : String(x[1]) > String(y[1]));

// ---------------------------------------------------------------- bookkeeping for each change
// The leading phone's changes get their bookkeeping notes added here (so every visitor's copy, which
// applies the same notes, stays exactly equal to the leader's). `col` = the leading phone's column.
export function withBookkeeping(ops, col, now = Date.now()) {
  const out = ops.slice();
  let stamped = null;
  for (const op of ops) {
    const [kind, path, v] = op;
    if (kind === 'inc') {
      const key = counterKey(path);
      if (key && v) out.push(['inc', ['vx', 'c', key, col, v > 0 ? 0 : 1], Math.abs(v)]);
    } else if (kind === 'set') {
      const key = lwwKey(path);
      if (key && !(stamped ||= new Set()).has(key)) { stamped.add(key); out.push(['set', ['vx', 't', key], [now, col]]); }
    }
  }
  return out;
}

// ---------------------------------------------------------------- a village's books, started once
// A brand-new village, or an island from before family villages: everything it has so far goes into
// one frozen "base" column, which no phone ever writes again.
export function ensureVillage(state, makeId) {
  if (state.vx && state.vx.vid && state.vx.c && state.vx.t) return state;
  const c = {};
  const base = (key, v) => { if (typeof v === 'number' && v) c[key] = { base: [Math.max(0, v), Math.max(0, -v)] }; };
  base('coins', state.coins);
  for (const [k, v] of Object.entries(state.basket || {})) base('basket/' + k, v);
  for (const [k, v] of Object.entries(state.stats || {})) if (k !== 'maxOnline') base('stats/' + k, v);
  for (const [p, st] of Object.entries(state.projects || {})) {
    for (const [k, v] of Object.entries(st?.got || {})) base(`projects/${p}/got/${k}`, v);
    for (const [k, v] of Object.entries(st?.by || {})) base(`projects/${p}/by/${k}`, v);
  }
  for (const [pid, rec] of Object.entries(state.players || {})) base(`players/${pid}/caught`, rec?.caught);
  for (const [f, j] of Object.entries(state.journal || {})) base(`journal/${f}/n`, j?.n);
  state.vx = { vid: makeId(), c, t: {} };
  return state;
}

// ---------------------------------------------------------------- merging two copies
// `mine` is the leading phone's copy, `theirs` a family member's copy of the SAME village. Returns a new
// merged copy. Things that only matter right now (finds lying on the beach, the hour of the day) stay
// the leader's. `col` is the leader's column: if two phones spent the same things while apart, a total
// can come out below zero; it is topped up to zero in that column (nobody sees a "−3 shells" basket).
export function mergeVillages(mine, theirs, col) {
  if (!mine?.vx || !theirs?.vx || mine.vx.vid !== theirs.vx.vid) return mine;
  const out = clone(mine);
  const A = mine.vx, B = theirs.vx;

  // counters: newest version of every column
  const c = out.vx.c;
  for (const [key, cols] of Object.entries(B.c || {})) {
    const mc = (c[key] ||= {});
    for (const [col2, x] of Object.entries(cols)) {
      const p = x[0] || 0, n = x[1] || 0, m = mc[col2]; // (a column that only ever added has no "taken" yet)
      mc[col2] = m ? [Math.max(m[0] || 0, p), Math.max(m[1] || 0, n)] : [p, n];
    }
  }

  // replaced things: the newest one wins
  for (const [key, stamp] of Object.entries(B.t || {})) {
    if (!later(stamp, A.t?.[key])) continue;
    out.vx.t[key] = stamp.slice();
    for (const path of lwwPaths(key)) setAt(out, path, clone(getAt(theirs, path)));
  }

  // family members: anyone who lives in either copy lives in the merged one
  out.players ||= {};
  for (const [pid, rec] of Object.entries(theirs.players || {})) {
    const m = out.players[pid];
    if (!m) { out.players[pid] = clone(rec); continue; }
    if (rec.joined && (!m.joined || rec.joined < m.joined)) m.joined = rec.joined;
    if (!m.name && rec.name) m.name = rec.name;
    if (!m.look && rec.look) m.look = clone(rec.look);
  }

  // the fish journal: every fish either copy found; biggest size; who found it first
  out.journal ||= {};
  for (const [f, j] of Object.entries(theirs.journal || {})) {
    const m = out.journal[f];
    if (!m) { out.journal[f] = clone(j); continue; }
    m.best = Math.max(m.best || 0, j.best || 0);
    if (j.first && (!m.first || j.first < m.first)) { m.first = j.first; m.by = j.by; }
  }

  // only-forward numbers, and collections that only grow
  for (const k of ['day', 'clock', 'nextItem']) out[k] = Math.max(mine[k] || 0, theirs[k] || 0);
  out.stats ||= {};
  out.stats.maxOnline = Math.max(mine.stats?.maxOnline || 1, theirs.stats?.maxOnline || 1);
  for (const k of ['hats', 'stickers']) {
    const have = new Set(out[k] || []);
    out[k] = [...(out[k] || [])];
    for (const x of theirs[k] || []) if (!have.has(x)) { have.add(x); out[k].push(x); }
  }
  for (const [p, st] of Object.entries(theirs.projects || {})) {
    const m = (out.projects[p] ||= { got: {}, done: false, by: {} });
    if (st?.done) m.done = true;
  }

  // news: both copies' news, newest 30
  const seen = new Set();
  const feed = [];
  for (const e of [...(mine.feed || []), ...(theirs.feed || [])]) {
    const id = e.t + '|' + JSON.stringify(e.m);
    if (seen.has(id)) continue;
    seen.add(id);
    feed.push(clone(e));
  }
  feed.sort((x, y) => x.t - y.t);
  out.feed = feed.slice(-30);

  settleCounters(out, col);
  return out;
}

// Write every total from the books into the plain fields the game reads (coins, basket…).
export function settleCounters(state, col) {
  for (const [key, cols] of Object.entries(state.vx.c)) {
    let total = 0;
    for (const [c2, x] of Object.entries(cols)) {
      if (x.length !== 2 || x[0] == null || x[1] == null) cols[c2] = [x[0] || 0, x[1] || 0]; // (always written [added, taken])
      total += (x[0] || 0) - (x[1] || 0);
    }
    total = Math.round(total * 1000) / 1000;
    if (total < 0) { // spent twice while apart: top up in the leader's own column
      const m = (cols[col] ||= [0, 0]);
      m[0] = Math.round(((m[0] || 0) - total) * 1000) / 1000;
      total = 0;
    }
    const path = keyPath(key);
    if (path[0] === 'basket') {
      if (total > 0) setAt(state, path, total);
      else setAt(state, path, undefined);
    } else if (path[0] === 'players' || path[0] === 'journal') {
      if (getAt(state, path.slice(0, 2))) setAt(state, path, total); // (only for someone/something that exists)
    } else setAt(state, path, total);
  }
  return state;
}
