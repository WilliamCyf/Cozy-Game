// The family village's books, tested without a browser:  node tests/village.mjs
// Pretend phones play alone and together in random orders (thousands of times). A "true" ledger is
// kept on the side: after everyone has met, every family total must match it exactly, whoever led,
// whatever the order, and merging must never count anything twice.
import { applyOps, newWorldState } from '../src/game/state.js';
import { withBookkeeping, ensureVillage, mergeVillages, counterKey } from '../src/game/village.js';

let ok = true, checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { ok = false; console.log('FAIL ' + msg); } };
const clone = (v) => JSON.parse(JSON.stringify(v));
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

const ITEMS = ['shell', 'driftwood', 'flower', 'seaglass', 'fish:koi'];
const FISH = ['sardine', 'koi', 'tuna', 'eel'];
const fresh = () => ensureVillage(newWorldState({ code: 'CRAB123', plots: 4, bushes: 2, palms: 2 }), () => 'v1');

// one family session: `lead` leads, `visitors` are with them; `act` makes the ops for one action
function play(lead, visitors, act, truth, r, clock) {
  const ops = act(lead.state, lead.id, r, truth);
  if (!ops) return;
  const full = withBookkeeping(ops, lead.id, clock.t++);
  applyOps(lead.state, full);
  for (const v of visitors) applyOps(v.state, full);
}
// what the rule book might do (the same kinds of ops host.js writes)
function randomAction(state, pid, r, truth) {
  const x = r();
  if (x < 0.25) { const n = 1 + Math.floor(r() * 30); truth.coins += n; return [['inc', ['coins'], n], ['inc', ['stats', 'earned'], n]]; }
  if (x < 0.5) { const it = ITEMS[Math.floor(r() * ITEMS.length)]; truth.basket[it] = (truth.basket[it] || 0) + 1; return [['inc', ['basket', it], 1, true]]; }
  if (x < 0.7) {
    const f = FISH[Math.floor(r() * FISH.length)], size = 10 + Math.floor(r() * 50);
    truth.fish.add(f); truth.n[f] = (truth.n[f] || 0) + 1; truth.best[f] = Math.max(truth.best[f] || 0, size);
    const ops = [['inc', ['journal', f, 'n'], 1], ['max', ['journal', f, 'best'], size], ['inc', ['stats', 'fish'], 1], ['inc', ['players', pid, 'caught'], 1]];
    if (!state.journal[f]) ops.unshift(['set', ['journal', f, 'first'], 1000 + truth.t], ['set', ['journal', f, 'by'], pid]);
    truth.caught[pid] = (truth.caught[pid] || 0) + 1;
    return ops;
  }
  if (x < 0.82) { const n = 1 + Math.floor(r() * 3); truth.got += n; return [['inc', ['projects', 'bridge', 'got', 'driftwood'], n], ['inc', ['projects', 'bridge', 'by', pid], n]]; }
  if (x < 0.9) { const i = Math.floor(r() * 4); return [['set', ['plots', i], { crop: 'carrot', stage: Math.floor(r() * 4), water: false, grow: 0, by: pid }]]; }
  if (x < 0.95) { const h = ['bunny', 'cat', 'frog'][Math.floor(r() * 3)]; truth.hats.add(h); return [['add', ['hats'], h]]; }
  return [['set', ['name'], 'Island ' + Math.floor(r() * 100)]];
}
// meeting: `joiner` comes to `lead`; the leader merges, and every phone there gets the merged copy
function meet(lead, joiner, visitors) {
  lead.state = mergeVillages(lead.state, joiner.state, lead.id);
  joiner.state = clone(lead.state);
  for (const v of visitors) v.state = clone(lead.state);
}
const sum = (cols) => Object.values(cols || {}).reduce((a, x) => a + (x[0] || 0) - (x[1] || 0), 0);

// ---------------------------------------------------------------- 1. random family histories
for (let seed = 1; seed <= 400; seed++) {
  const r = rng(seed);
  const start = fresh();
  const phones = ['pA', 'pB', 'pC'].map((id) => ({ id, state: clone(start) }));
  const truth = { coins: start.coins, basket: { ...start.basket }, fish: new Set(), n: {}, best: {}, caught: {}, got: 0, hats: new Set(start.hats), t: 0 };
  const clock = { t: 1 };
  for (let round = 0; round < 25; round++) {
    // who is online together this time (the rest play alone, or not at all)
    const order = phones.slice().sort(() => r() - 0.5);
    const together = order.slice(0, 1 + Math.floor(r() * 3));
    const [lead, ...vis] = together;
    const joined = []; // (phones get the merged village once THEY have joined, one after another)
    for (const v of vis) { meet(lead, v, joined); joined.push(v); }
    for (let k = 0; k < 6; k++) { truth.t++; play(lead, vis, randomAction, truth, r, clock); }
    for (const p of order.slice(together.length)) if (r() < 0.5) for (let k = 0; k < 4; k++) { truth.t++; play(p, [], randomAction, truth, r, clock); }
  }
  // everyone meets at the end (in a random order, with a random leader)
  const order = phones.slice().sort(() => r() - 0.5);
  const [lead, ...rest] = order;
  const joined = [];
  for (const v of rest) { meet(lead, v, joined); joined.push(v); }
  const s = lead.state;
  const where = `(history ${seed})`;
  check(s.coins === truth.coins, `coins ${s.coins} = true total ${truth.coins} ${where}`);
  for (const it of ITEMS) check((s.basket[it] || 0) === (truth.basket[it] || 0), `${it}: ${s.basket[it] || 0} = ${truth.basket[it] || 0} ${where}`);
  for (const f of FISH) {
    check(!!s.journal[f] === truth.fish.has(f), `journal knows ${f} ${where}`);
    if (truth.fish.has(f)) {
      check(s.journal[f].n === truth.n[f], `${f} caught ${s.journal[f].n} times = ${truth.n[f]} ${where}`);
      check(s.journal[f].best === truth.best[f], `${f} best ${s.journal[f].best} = ${truth.best[f]} ${where}`);
    }
  }
  for (const [pid, n] of Object.entries(truth.caught)) check(s.players[pid]?.caught === n, `${pid} caught ${s.players[pid]?.caught} = ${n} ${where}`);
  check((s.projects.bridge.got.driftwood || 0) === truth.got, `bridge driftwood ${s.projects.bridge.got.driftwood} = ${truth.got} ${where}`);
  check([...truth.hats].every((h) => s.hats.includes(h)) && new Set(s.hats).size === s.hats.length, `hats: all, once each ${where}`);
  // every phone ends with the very same village
  for (const p of rest) check(JSON.stringify(p.state) === JSON.stringify(s), `${p.id} has the same village as ${lead.id} ${where}`);
  // and the plain numbers always equal the books
  for (const [key, cols] of Object.entries(s.vx.c)) {
    const path = key.split('/');
    let v = s; for (const k of path) v = v?.[k];
    check((v || 0) === Math.max(0, sum(cols)), `${key} plain ${v} = books ${sum(cols)} ${where}`);
  }
  if (!ok) break;
}
console.log(`${ok ? 'PASS' : 'FAIL'} 400 random family histories: every total exact, every phone the same village`);

// ---------------------------------------------------------------- 2. merging is order-free and safe to repeat
{
  let good = true;
  for (let seed = 500; seed < 700 && good; seed++) {
    const r = rng(seed);
    const start = fresh();
    const ph = ['pA', 'pB', 'pC'].map((id) => ({ id, state: clone(start) }));
    const truth = { coins: 0, basket: {}, fish: new Set(), n: {}, best: {}, caught: {}, got: 0, hats: new Set(), t: 0 };
    const clock = { t: 1 };
    for (const p of ph) for (let k = 0; k < 15; k++) { truth.t++; play(p, [], randomAction, truth, r, clock); }
    const [A, B, C] = ph.map((p) => p.state);
    const merged = (x) => { const y = clone(x); delete y.items; delete y.time; return JSON.stringify(sortKeys(y)); };
    const ab = mergeVillages(A, B, 'pA'), ba = mergeVillages(B, A, 'pA');
    const counts = (x) => JSON.stringify(sortKeys({ c: x.coins, b: x.basket, j: x.journal, p: x.projects, h: [...x.hats].sort(), pl: x.players, n: x.name, pt: x.plots }));
    if (counts(ab) !== counts(ba)) { good = false; console.log('FAIL A+B differs from B+A', seed); }
    const abc1 = mergeVillages(mergeVillages(A, B, 'pA'), C, 'pA'), abc2 = mergeVillages(A, mergeVillages(B, C, 'pB'), 'pA');
    if (counts(abc1) !== counts(abc2)) { good = false; console.log('FAIL (A+B)+C differs from A+(B+C)', seed); }
    const aa = mergeVillages(ab, ab, 'pA');
    if (merged(aa) !== merged(ab)) { good = false; console.log('FAIL merging twice changes things', seed); diff(ab, aa); }
    const aba = mergeVillages(ab, B, 'pA');
    if (merged(aba) !== merged(ab)) { good = false; console.log('FAIL merging an old copy again changes things', seed); }
  }
  check(good, 'merging: order-free, grouping-free, and safe to repeat');
  console.log(`${good ? 'PASS' : 'FAIL'} merging is order-free (A+B = B+A), grouping-free, and safe to repeat (200 tries)`);
}
function diff(x, y, p = '') {
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) diff(x[k], y[k], p + '/' + k); }
  else console.log('   differs at', p, JSON.stringify(x), '->', JSON.stringify(y));
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

// ---------------------------------------------------------------- 3. spending the same things twice while apart
{
  const start = fresh();
  start.basket.shell = 5; start.vx.c['basket/shell'] = { base: [5, 0] };
  const A = clone(start), B = clone(start);
  // both sold the same 5 shells while apart
  applyOps(A, withBookkeeping([['inc', ['basket', 'shell'], -5, true]], 'pA', 1));
  applyOps(B, withBookkeeping([['inc', ['basket', 'shell'], -5, true]], 'pB', 2));
  const m = mergeVillages(A, B, 'pA');
  const none = !m.basket.shell;
  check(none, `sold twice while apart: the basket shows no shells (not −5): ${m.basket.shell}`);
  applyOps(m, withBookkeeping([['inc', ['basket', 'shell'], 1, true]], 'pA', 3));
  const one = m.basket.shell === 1;
  check(one, `…and the next shell found shows as 1 (${m.basket.shell})`);
  console.log(`${none && one ? 'PASS' : 'FAIL'} things spent twice while apart never show a minus number`);
}

// ---------------------------------------------------------------- 4. an island from before family villages
{
  const old = newWorldState({ code: 'CRAB123', plots: 4, bushes: 2, palms: 2 });
  old.coins = 1234; old.basket = { shell: 7, 'seed:carrot': 2 }; old.stats.fish = 40;
  old.journal = { koi: { n: 3, best: 40, by: 'Dad', first: 5 } };
  old.players = { pDad: { name: 'Dad', look: {}, caught: 40, joined: 1 } };
  old.projects.path = { got: { driftwood: 6, coins: 30 }, done: true, by: { pDad: 36 } };
  const v = ensureVillage(clone(old), () => 'vOld');
  check(v.coins === 1234 && v.basket.shell === 7 && v.journal.koi.n === 3 && v.players.pDad.caught === 40, 'an old island keeps every number when it becomes a village');
  const after = clone(v);
  applyOps(after, withBookkeeping([['inc', ['coins'], 10], ['inc', ['basket', 'shell'], -2, true]], 'pDad', 1));
  const mum = clone(v); // Mum joined before Dad played on
  const m = mergeVillages(after, mum, 'pDad');
  check(m.coins === 1244 && m.basket.shell === 5, `old island, then merged with a copy from before: nothing counted twice (coins ${m.coins}, shells ${m.basket.shell})`);
  check(ensureVillage(v, () => 'other').vx.vid === 'vOld', 'a village is started once (never re-based)');
  console.log(`${m.coins === 1244 ? 'PASS' : 'FAIL'} an island from before family villages keeps everything and merges correctly`);
}

// ---------------------------------------------------------------- 5. different villages are never mixed
{
  const a = fresh(), b = ensureVillage(newWorldState({ code: 'FISH456', plots: 4, bushes: 2, palms: 2 }), () => 'v2');
  b.coins = 999;
  const m = mergeVillages(a, b, 'pA');
  check(m === a && m.coins === a.coins, 'two different villages are never merged');
  console.log(`${m === a ? 'PASS' : 'FAIL'} two different villages are never mixed together`);
}
void counterKey;
console.log(`${checks} checks`);
console.log(ok ? 'ALL PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
