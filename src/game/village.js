// The family island: every member's phone keeps its own full copy of the island, so anyone can play at
// any time, even alone. When copies meet again they are merged, and nothing anyone did is lost or counted
// twice. Think of the family business books: each phone writes only in ITS OWN column, so merging two
// copies of the books is simply "take the newest version of every column", and every total is the sum of
// all the columns.
//
// state.vx holds that bookkeeping:
//   vid  the island's id (two copies are only ever merged when they are the same island)
//   c    counters  c[key][column] = [added, taken]   e.g. c['basket/shell']['p8a2.k3f9'] = [12, 5]
//        A column belongs to one phone (its profile id + a "generation": a phone that crashed before
//        saving, or that took someone else's copy, starts a new column so it can never write over numbers
//        other phones already remember). The shared column 'fix' tops up a total that went below zero.
//   t    stamps  t[key] = [time, column]  for things a PERSON replaces, like planting in a plot: the newest
//        person's change wins. Automatic changes (growth, regrowth, rain) never get a stamp, so an old copy
//        can never overwrite what the family did since.
// Nothing here runs every frame: bookkeeping is added when something happens (a few times a minute), and
// merging only happens when a family member joins.

// ---------------------------------------------------------------- which paths are which
// Counts that go up and down: value = sum of every column's added minus taken.
export function counterKey(path) {
  const [a, b, c, d] = path;
  const n = path.length;
  if (a === 'coins' && n === 1) return 'coins';
  if (a === 'basket' && n === 2) return 'basket/' + b;
  if (a === 'stats' && n === 2 && !RECORDS.has(b)) return 'stats/' + b;
  if (a === 'projects' && n === 4 && (c === 'got' || c === 'by')) return `projects/${b}/${c}/${d}`;
  if (a === 'players' && n === 3 && c === 'caught') return `players/${b}/caught`;
  if (a === 'journal' && n === 3 && c === 'n') return `journal/${b}/n`;
  return null;
}
const keyPath = (key) => key.split('/');
// records that only go up (the most players at once, the days lived on the island): the biggest wins
const RECORDS = new Set(['maxOnline', 'days']);

// Things a person replaces as a whole: the newest stamp wins.
export function lwwKey(path) {
  const [a, b, c] = path;
  switch (a) {
    case 'plots': case 'bushes': case 'palms': return path.length >= 2 ? `${a}/${b}` : null;
    case 'name': case 'code': return a;
    case 'players': return path.length >= 3 && (c === 'name' || c === 'look' || c === 'left' || c === 'copy') ? `players/${b}/${c}` : null;
    default: return null;
  }
}
function lwwPath(key) {
  const p = keyPath(key);
  if (p[0] === 'plots' || p[0] === 'bushes' || p[0] === 'palms') p[1] = Number(p[1]);
  return p;
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
// is stamp x newer than stamp y? (time first, then the column name, so every phone decides the same)
const newer = (x, y) => (!y ? !!x : !x ? false : x[0] !== y[0] ? x[0] > y[0] : String(x[1]) > String(y[1]));
const sameStamp = (x, y) => (!x && !y) || (!!x && !!y && x[0] === y[0] && String(x[1]) === String(y[1]));
// With the same stamp (nobody touched it since), the copy that is "further along" by itself wins:
// a crop that grew more, a bush that regrew more fruit, a palm with coconuts again.
function further(kind, a, b) {
  const score = (v) => (!v ? [-1] : kind === 'plots' ? [v.stage || 0, v.grow || 0, v.water ? 1 : 0] : kind === 'bushes' ? [v.fruit || 0, -(v.t || 0)] : kind === 'palms' ? [v.ready ? 1 : 0, -(v.t || 0)] : [0]);
  const x = score(a), y = score(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return JSON.stringify(a) >= JSON.stringify(b); // (all equal: either; this keeps every phone deciding the same)
}

// ---------------------------------------------------------------- bookkeeping for each change
// The leading phone's changes get their bookkeeping notes added here, so every visitor's copy, which
// applies the very same notes, stays exactly equal to the leader's. `col` = this phone's column.
// auto: changes nobody made by hand (growth, regrowth, rain, the day's new request): no stamps.
// A stamp is never older than the one this copy already holds (so a phone whose clock is set wrong
// can't make the family's next change look "older" than its own).
export function withBookkeeping(ops, col, state, { auto = false, now = Date.now() } = {}) {
  const out = ops.slice();
  let stamped = null;
  for (const op of ops) {
    const [kind, path, v] = op;
    if (kind === 'inc') {
      const key = counterKey(path);
      if (key && v) out.push(['inc', ['vx', 'c', key, col, v > 0 ? 0 : 1], Math.abs(v)]);
    } else if (kind === 'set' && !auto) {
      const key = lwwKey(path);
      if (key && !(stamped ||= new Set()).has(key)) {
        stamped.add(key);
        const held = state?.vx?.t?.[key];
        out.push(['set', ['vx', 't', key], [Math.max(now, held ? held[0] + 1 : 0), col]]);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- an island's books, started once
// A brand-new island, or an island from before family islands: everything it has so far goes into one
// frozen "base" column, which no phone ever writes again. Run it AFTER migrate() (never before: the
// fresh island's books must not end up on a saved island).
export function ensureVillage(state, makeId) {
  if (state.vx && state.vx.vid && state.vx.c && state.vx.t) return state;
  const c = {};
  const base = (key, v) => { if (typeof v === 'number' && v) c[key] = { base: [Math.max(0, v), Math.max(0, -v)] }; };
  base('coins', state.coins);
  for (const [k, v] of Object.entries(state.basket || {})) base('basket/' + k, v);
  for (const [k, v] of Object.entries(state.stats || {})) if (!RECORDS.has(k)) base('stats/' + k, v);
  for (const [p, st] of Object.entries(state.projects || {})) {
    for (const [k, v] of Object.entries(st?.got || {})) base(`projects/${p}/got/${k}`, v);
    for (const [k, v] of Object.entries(st?.by || {})) base(`projects/${p}/by/${k}`, v);
  }
  for (const [pid, rec] of Object.entries(state.players || {})) base(`players/${pid}/caught`, rec?.caught);
  for (const [f, j] of Object.entries(state.journal || {})) base(`journal/${f}/n`, j?.n);
  state.vx = { vid: makeId(state), c, t: {} };
  return state;
}
// the id an island from before family islands gets: the same on every copy of it (safe to repeat)
export const oldIslandVid = (state) => 'i' + Number(state.created || 0).toString(36) + (state.code || '');

// ---------------------------------------------------------------- merging two copies
// `mine` is the leading phone's copy, `theirs` a family member's copy of the SAME island. Returns a new
// merged copy. Things that only matter right now (finds lying on the beach, the hour, the weather) stay the
// leader's.
export function mergeVillages(mine, theirs) {
  if (!mine?.vx || !theirs?.vx || mine.vx.vid !== theirs.vx.vid) return mine;
  const out = clone(mine);
  const A = mine.vx, B = theirs.vx;

  // counters: the newest version of every column
  const c = out.vx.c;
  for (const [key, cols] of Object.entries(B.c || {})) {
    const mc = (c[key] ||= {});
    for (const [col, x] of Object.entries(cols)) {
      const p = x[0] || 0, n = x[1] || 0, m = mc[col]; // (a column that only ever added has no "taken" yet)
      mc[col] = m ? [Math.max(m[0] || 0, p), Math.max(m[1] || 0, n)] : [p, n];
    }
  }

  // things a person replaced: the newest stamp wins; same stamp: the copy further along by itself
  const keys = new Set([...Object.keys(A.t || {}), ...Object.keys(B.t || {})]);
  for (const kind of ['plots', 'bushes', 'palms']) for (let i = 0; i < Math.max(mine[kind]?.length || 0, theirs[kind]?.length || 0); i++) keys.add(`${kind}/${i}`);
  for (const key of keys) {
    const sa = A.t?.[key], sb = B.t?.[key], path = lwwPath(key);
    const va = getAt(mine, path), vb = getAt(theirs, path);
    let takeTheirs;
    if (sameStamp(sa, sb)) {
      const kind = path[0];
      if (kind !== 'plots' && kind !== 'bushes' && kind !== 'palms') continue;
      if (vb === undefined) continue;
      takeTheirs = va === undefined || !further(kind, va, vb);
    } else takeTheirs = newer(sb, sa);
    if (!takeTheirs) continue;
    if (sb) out.vx.t[key] = sb.slice();
    setAt(out, path, clone(vb));
  }

  // family members: anyone who lives in either copy lives in the merged one
  out.players ||= {};
  for (const [pid, rec] of Object.entries(theirs.players || {})) {
    const m = out.players[pid];
    if (!m) { out.players[pid] = clone(rec); continue; }
    if (rec.joined && (!m.joined || rec.joined < m.joined)) m.joined = rec.joined;
    for (const k of ['name', 'look']) if (m[k] == null && rec[k] != null) m[k] = clone(rec[k]);
  }

  // the fish journal: every fish either copy found; the biggest size; who found it first
  out.journal ||= {};
  for (const [f, j] of Object.entries(theirs.journal || {})) {
    const m = out.journal[f];
    if (!m) { out.journal[f] = clone(j); continue; }
    m.best = Math.max(m.best || 0, j.best || 0);
    if (j.first && (!m.first || j.first < m.first || (j.first === m.first && String(j.by) < String(m.by)))) { m.first = j.first; m.by = j.by; }
  }

  // numbers that only go forward, and collections that only grow
  for (const k of ['day', 'clock', 'nextItem', 'picnicDay']) out[k] = Math.max(mine[k] || 0, theirs[k] || 0);
  for (const k of ['mail', 'treasure']) { out[k] = { ...(mine[k] || {}) }; out[k].day = Math.max(mine[k]?.day || 0, theirs[k]?.day || 0); }
  out.stats ||= {};
  for (const k of RECORDS) out.stats[k] = Math.max(mine.stats?.[k] || 1, theirs.stats?.[k] || 1);
  for (const k of ['hats', 'stickers']) out[k] = [...new Set([...(mine[k] || []), ...(theirs[k] || [])])].sort();
  for (const [p, st] of Object.entries(theirs.projects || {})) {
    const m = (out.projects[p] ||= { got: {}, done: false, by: {} });
    if (st?.done) m.done = true;
  }
  // Captain Shelly's request: the later day wins; on the same day, a request that was done wins
  const rq = (r) => (r ? [r.day || 0, r.done ? 1 : 0, JSON.stringify(r)] : [-1, 0, '']);
  const ra = rq(mine.request), rb = rq(theirs.request);
  if (rb[0] > ra[0] || (rb[0] === ra[0] && (rb[1] > ra[1] || (rb[1] === ra[1] && rb[2] > ra[2])))) out.request = clone(theirs.request);

  // news: both copies' news, newest 30 (in one fixed order, so every phone shows the same)
  const seen = new Set();
  const feed = [];
  for (const e of [...(mine.feed || []), ...(theirs.feed || [])]) {
    const id = e.t + '|' + JSON.stringify(e.m);
    if (seen.has(id)) continue;
    seen.add(id);
    feed.push([id, clone(e)]);
  }
  feed.sort((x, y) => x[1].t - y[1].t || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  out.feed = feed.slice(-30).map((x) => x[1]);

  settleCounters(out);
  return out;
}

// Write every total from the books into the plain fields the game reads (coins, basket…). A total below
// zero (two phones spent the same things while apart) is topped up to zero in the shared 'fix' column,
// which merges like any other column, so the top-up is never made twice.
export function settleCounters(state) {
  for (const [key, cols] of Object.entries(state.vx.c)) {
    let total = 0;
    for (const [col, x] of Object.entries(cols)) {
      if (x.length !== 2 || x[0] == null || x[1] == null) cols[col] = [x[0] || 0, x[1] || 0]; // (always written [added, taken])
      if (col !== 'fix') total += (x[0] || 0) - (x[1] || 0);
    }
    total = Math.round(total * 1000) / 1000;
    const fix = cols.fix ? cols.fix[0] : 0;
    if (total + fix < 0) cols.fix = [Math.round(-total * 1000) / 1000, 0];
    total = Math.round((total + (cols.fix ? cols.fix[0] : 0)) * 1000) / 1000;
    const path = keyPath(key);
    if (path[0] === 'basket') setAt(state, path, total > 0 ? total : undefined);
    else if (path[0] === 'players' || path[0] === 'journal') { if (getAt(state, path.slice(0, 2))) setAt(state, path, total); } // (only for someone/something that exists)
    else setAt(state, path, total);
  }
  return state;
}

// ---------------------------------------------------------------- a short fingerprint of a copy
// Two phones compare fingerprints first: the whole copy only travels when they differ.
export function digest(state) {
  const pick = {
    c: state.vx?.c, t: state.vx?.t, j: state.journal, pl: state.players, h: [...(state.hats || [])].sort(), s: [...(state.stickers || [])].sort(),
    pr: Object.fromEntries(Object.entries(state.projects || {}).map(([k, v]) => [k, !!v?.done])), p: state.plots, b: state.bushes, pa: state.palms,
    d: state.day, n: state.name, r: state.request, m: state.mail?.day, tr: state.treasure?.day, pd: state.picnicDay, f: (state.feed || []).map((e) => e.t),
  };
  const str = JSON.stringify(sortKeys(pick));
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + '.' + str.length.toString(36);
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]); return o; }
  return v;
}
