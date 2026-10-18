// The family island's books, tested without a browser:  node tests/village.mjs
// Pretend phones play alone and together in random orders (hundreds of times), with the real rule book
// too. A "true" ledger is kept on the side: after everyone has met, every family total must match it,
// whoever led, whatever the order; nothing may be counted twice, nothing lost, nothing ever below zero.
globalThis.location ||= { search: '' }; // (the rule book's text helpers look at the address once)
const { applyOps, newWorldState, migrate } = await import('../src/game/state.js');
const V = await import('../src/game/village.js');
const { HostLogic } = await import('../src/game/host.js');
const { withBookkeeping, ensureVillage, mergeVillages, settleCounters, digest, oldIslandVid } = V;

let ok = true, checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { ok = false; console.log('FAIL ' + msg); } return !!cond; };
const section = (good, msg) => console.log(`${good ? 'PASS' : 'FAIL'} ${msg}`);
const clone = (v) => JSON.parse(JSON.stringify(v));
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
function diff(x, y, p = '') {
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) diff(x[k], y[k], p + '/' + k); }
  else console.log('   differs at', p, JSON.stringify(x), '->', JSON.stringify(y));
}
const sum = (cols, skipFix = false) => Object.entries(cols || {}).reduce((a, [c, x]) => a + (skipFix && c === 'fix' ? 0 : (x[0] || 0) - (x[1] || 0)), 0);
const at = (o, path) => path.reduce((v, k) => v?.[k], o);
// the plain numbers the game reads must always equal the books
function booksMatch(s, where) {
  let good = true;
  for (const [key, cols] of Object.entries(s.vx.c)) {
    const path = key.split('/');
    if ((path[0] === 'players' || path[0] === 'journal') && !at(s, path.slice(0, 2))) continue;
    const v = at(s, path) || 0, books = Math.round(sum(cols) * 1000) / 1000;
    good = check(v === Math.max(0, books) && books >= 0, `${key}: plain ${v} = books ${books}, never below zero ${where}`) && good;
  }
  return good;
}
// things that are only about "right now" on the leading phone (finds on the beach, the hour, the weather)
const lasting = (s) => { const y = clone(s); for (const k of ['items', 'time', 'weather', 'weatherUntil', 'nextItem']) delete y[k]; return JSON.stringify(sortKeys(y)); };

const ITEMS = ['shell', 'driftwood', 'flower', 'seaglass', 'fish:koi'];
const FISH = ['sardine', 'koi', 'tuna', 'eel'];
const fresh = (vid = 'v1', code = 'CRAB123') => ensureVillage(newWorldState({ code, plots: 4, bushes: 2, palms: 2 }), () => vid);

// ---------------------------------------------------------------- pretend phones (made-up actions)
// Each phone writes only in its own column; `lead` leads, `visitors` are online with it.
let fakeNow = 1_700_000_000_000;
function play(lead, visitors, act, truth, r, spend) {
  const made = act(lead.state, lead.id, r, truth, spend);
  if (!made) return;
  const full = withBookkeeping(made.ops, lead.col, lead.state, { auto: !!made.auto, now: fakeNow += 1 + Math.floor(r() * 3) });
  applyOps(lead.state, full);
  for (const v of visitors) applyOps(v.state, full);
}
function randomAction(state, pid, r, truth, spend) {
  const x = r();
  const coins = (n) => { truth.coins += n; return [['inc', ['coins'], n], ...(n > 0 ? [['inc', ['stats', 'earned'], n]] : [])]; };
  if (x < 0.2) return { ops: coins(1 + Math.floor(r() * 30)) };
  if (x < 0.4) { const it = ITEMS[Math.floor(r() * ITEMS.length)]; truth.basket[it] = (truth.basket[it] || 0) + 1; return { ops: [['inc', ['basket', it], 1, true]] }; }
  if (spend && x < 0.5) { // sell what this copy has (two copies apart may sell the same things)
    const it = ITEMS[Math.floor(r() * ITEMS.length)], have = state.basket[it] || 0;
    if (!have) return null;
    const n = 1 + Math.floor(r() * have);
    truth.basket[it] = (truth.basket[it] || 0) - n;
    return { ops: [['inc', ['basket', it], -n, true], ...coins(n * 3)] };
  }
  if (spend && x < 0.56) { const price = 5 + Math.floor(r() * 40); if (state.coins < price) return null; return { ops: coins(-price) }; }
  if (x < 0.7) {
    const f = FISH[Math.floor(r() * FISH.length)], size = 10 + Math.floor(r() * 50);
    truth.fish.add(f); truth.n[f] = (truth.n[f] || 0) + 1; truth.best[f] = Math.max(truth.best[f] || 0, size);
    const ops = [['inc', ['journal', f, 'n'], 1], ['max', ['journal', f, 'best'], size], ['inc', ['stats', 'fish'], 1], ['inc', ['players', pid, 'caught'], 1]];
    if (!state.journal[f]) ops.unshift(['set', ['journal', f, 'first'], 1000 + truth.t], ['set', ['journal', f, 'by'], pid]);
    truth.caught[pid] = (truth.caught[pid] || 0) + 1;
    return { ops };
  }
  if (x < 0.8) { const n = 1 + Math.floor(r() * 3); truth.got += n; return { ops: [['inc', ['projects', 'bridge', 'got', 'driftwood'], n], ['inc', ['projects', 'bridge', 'by', pid], n]] }; }
  if (x < 0.86) { const i = Math.floor(r() * 4); return { ops: [['set', ['plots', i], { crop: 'carrot', stage: 0, water: false, grow: 0, by: pid }]] }; }
  if (x < 0.91) { // a crop grows by itself (no stamp)
    const i = Math.floor(r() * 4), p = state.plots[i];
    if (!p.crop || p.stage >= 3) return null;
    return { ops: [['set', ['plots', i], { ...p, stage: p.stage + 1 }]], auto: true };
  }
  if (x < 0.95) { const h = ['bunny', 'cat', 'frog'][Math.floor(r() * 3)]; truth.hats.add(h); return { ops: [['add', ['hats'], h]] }; }
  return { ops: [['set', ['name'], 'Island ' + Math.floor(r() * 100)]] };
}
// meeting: `joiner` comes to `lead`; the leader merges, and every phone there gets the merged copy
function meet(lead, joiner, visitors) {
  lead.state = mergeVillages(lead.state, joiner.state);
  joiner.state = clone(lead.state);
  for (const v of visitors) v.state = clone(lead.state);
}
const newTruth = (s) => ({ coins: s.coins, basket: { ...s.basket }, fish: new Set(), n: {}, best: {}, caught: {}, got: 0, hats: new Set(s.hats), t: 0 });

// ---------------------------------------------------------------- 1. random family histories
{
  let good = true, n = 0;
  for (let seed = 1; seed <= 400 && good; seed++) {
    const r = rng(seed);
    const spend = seed % 2 === 0; // (half the histories also spend, with copies apart spending the same things)
    const start = fresh();
    const phones = ['pA', 'pB', 'pC'].map((id) => ({ id, col: id + '.1', state: clone(start) }));
    const truth = newTruth(start);
    for (let round = 0; round < 25; round++) {
      const order = phones.slice().sort(() => r() - 0.5);
      const together = order.slice(0, 1 + Math.floor(r() * 3));
      const [lead, ...vis] = together;
      const joined = []; // (a phone gets the merged copy once IT has joined, one after another)
      for (const v of vis) { meet(lead, v, joined); joined.push(v); }
      for (let k = 0; k < 6; k++) { truth.t++; play(lead, vis, randomAction, truth, r, spend); }
      for (const p of order.slice(together.length)) if (r() < 0.5) for (let k = 0; k < 4; k++) { truth.t++; play(p, [], randomAction, truth, r, spend); }
    }
    const order = phones.slice().sort(() => r() - 0.5);
    const [lead, ...rest] = order;
    const joined = [];
    for (const v of rest) { meet(lead, v, joined); joined.push(v); }
    const s = lead.state;
    const where = `(history ${seed}${spend ? ', with spending' : ''})`;
    n++;
    // things nobody can spend: exact
    for (const f of FISH) {
      good = check(!!s.journal[f] === truth.fish.has(f), `journal knows ${f} ${where}`) && good;
      if (truth.fish.has(f)) {
        good = check(s.journal[f].n === truth.n[f], `${f} caught ${s.journal[f].n} times = ${truth.n[f]} ${where}`) && good;
        good = check(s.journal[f].best === truth.best[f], `${f} best ${s.journal[f].best} = ${truth.best[f]} ${where}`) && good;
      }
    }
    for (const [pid, c] of Object.entries(truth.caught)) good = check(s.players[pid]?.caught === c, `${pid} caught ${s.players[pid]?.caught} = ${c} ${where}`) && good;
    good = check((s.projects.bridge.got.driftwood || 0) === truth.got, `bridge driftwood ${s.projects.bridge.got.driftwood} = ${truth.got} ${where}`) && good;
    good = check([...truth.hats].every((h) => s.hats.includes(h)) && new Set(s.hats).size === s.hats.length, `hats: all, once each ${where}`) && good;
    // coins and basket: exact without spending; with spending, two copies apart may have spent the same
    // things: then the total is topped up to zero (never minus), and nothing else is ever added
    const fixOf = (key) => s.vx.c[key]?.fix?.[0] || 0;
    const totals = [['coins', s.coins, truth.coins], ...ITEMS.map((it) => ['basket/' + it, s.basket[it] || 0, truth.basket[it] || 0])];
    for (const [key, shown, real] of totals) {
      if (!spend) good = check(shown === real && !fixOf(key), `${key}: ${shown} = true total ${real} ${where}`) && good;
      else good = check(shown >= 0 && shown >= real && shown === Math.round((real + fixOf(key)) * 1000) / 1000, `${key}: ${shown} = true total ${real} + top-up ${fixOf(key)}, never minus ${where}`) && good;
    }
    for (const p of rest) good = check(JSON.stringify(p.state) === JSON.stringify(s), `${p.id} has the same island as ${lead.id} ${where}`) && good;
    good = check(rest.every((p) => digest(p.state) === digest(s)), `same fingerprint on every phone ${where}`) && good;
    good = booksMatch(s, where) && good;
  }
  section(good, `${n} random family histories (half with spending): every total right, never minus, every phone the same island`);
}

// ---------------------------------------------------------------- 2. merging is order-free and safe to repeat
{
  let good = true;
  for (let seed = 500; seed < 700 && good; seed++) {
    const r = rng(seed);
    const spend = seed % 2 === 1;
    const start = fresh();
    const ph = ['pA', 'pB', 'pC'].map((id) => ({ id, col: id + '.1', state: clone(start) }));
    const truth = newTruth(start);
    for (const p of ph) for (let k = 0; k < 15; k++) { truth.t++; play(p, [], randomAction, truth, r, spend); }
    const [A, B, C] = ph.map((p) => p.state);
    const ab = mergeVillages(A, B), ba = mergeVillages(B, A);
    if (lasting(ab) !== lasting(ba)) { good = false; console.log('FAIL A+B differs from B+A', seed); diff(JSON.parse(lasting(ab)), JSON.parse(lasting(ba))); }
    if (digest(ab) !== digest(ba)) { good = false; console.log('FAIL A+B and B+A have different fingerprints', seed); }
    // grouping: every phone's column comes out the same. (Only a top-up for things spent twice can
    // differ: it depends on what was known when the minus showed up. The total is still never minus.)
    const abc1 = mergeVillages(mergeVillages(A, B), C), abc2 = mergeVillages(A, mergeVillages(B, C));
    const cols = (x) => JSON.stringify(sortKeys(Object.fromEntries(Object.entries(x.vx.c).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([c]) => c !== 'fix'))]))));
    const rest = (x) => { const y = JSON.parse(lasting(x)); delete y.vx.c; delete y.coins; delete y.basket; return JSON.stringify(y); };
    if (cols(abc1) !== cols(abc2) || rest(abc1) !== rest(abc2)) { good = false; console.log('FAIL (A+B)+C differs from A+(B+C)', seed); diff(JSON.parse(rest(abc1)), JSON.parse(rest(abc2))); }
    if (!spend && lasting(abc1) !== lasting(abc2)) { good = false; console.log('FAIL (A+B)+C differs from A+(B+C) (no spending)', seed); }
    if (!booksMatch(abc1, `(grouping, ${seed})`) || !booksMatch(abc2, `(grouping, ${seed})`)) good = false;
    const aa = mergeVillages(ab, ab);
    if (JSON.stringify(aa) !== JSON.stringify(ab)) { good = false; console.log('FAIL merging twice changes things', seed); diff(ab, aa); }
    const aba = mergeVillages(ab, B);
    if (lasting(aba) !== lasting(ab)) { good = false; console.log('FAIL merging an old copy again changes things', seed); diff(JSON.parse(lasting(ab)), JSON.parse(lasting(aba))); }
    if (digest(aba) !== digest(ab)) { good = false; console.log('FAIL an old copy again changes the fingerprint', seed); }
  }
  check(good, 'merging: order-free, grouping-free, and safe to repeat');
  section(good, 'merging is order-free (A+B = B+A), grouping-free, safe to repeat, same fingerprint (200 tries)');
}

// ---------------------------------------------------------------- 3. the real rule book on pretend phones
// The rule book from the game (host.js), unchanged. A Phone is what the session gives it: the island,
// who is online, and emitOps(), which adds the bookkeeping for this phone's column.
const WORLD = {
  plots: Array.from({ length: 6 }, (_, i) => ({ x: i * 2, z: 0, extra: i >= 4 })),
  bushes: [{ kind: 'berry', x: 0, z: 5 }, { kind: 'orange', x: 3, z: 5 }],
  palms: [{ top: [0, 5, 10] }, { top: [4, 5, 10] }],
  walk: { nearestWalkable: (x, z) => [x, z] },
};
const SPAWNS = { beach: [[1, 1], [6, 6], [11, 11], [16, 16]], forest: [[20, 20]], meadow: [[30, 30]], islet: [[40, 40]] };
const islandFor = (vid = 'vFam') => ensureVillage(newWorldState({ code: 'FAM1234', plots: WORLD.plots.length, bushes: WORLD.bushes.length, palms: WORLD.palms.length }), () => vid);
class Phone {
  constructor(name, state, gen = 1) {
    this.name = name; this.pid = 'p' + name; this.col = this.pid + '.' + gen;
    this.state = state; this.visitors = []; this.online = new Map([[this.pid, { name }]]); this.debug = true;
    this.skew = 0; // (a phone whose clock is set wrong)
  }
  lead() { this.logic = new HostLogic(this, WORLD, SPAWNS); this.logic.a_hello(this.pid, { name: this.name, look: {} }); return this; }
  stop() { if (this.logic) this.logic.dead = true; this.logic = null; this.visitors = []; this.online = new Map([[this.pid, { name: this.name }]]); }
  // what the session does for the rule book
  emitOps(ops, auto) {
    if (!ops?.length) return;
    const full = withBookkeeping(ops, this.col, this.state, { auto, now: (fakeNow += 7) + this.skew });
    applyOps(this.state, full);
    for (const v of this.visitors) applyOps(v.state, full);
  }
  emitFx() {} broadcast() {} emit() {} flush() {}
  onlineList() { return [...this.online.keys()].map((pid) => ({ pid })); }
  // a family member arrives: merge their copy in, then they get the merged one and see every change
  welcome(v) {
    this.state = mergeVillages(this.state, v.state);
    this.logic.checkProjects(); this.logic.checkStickers();
    this.logic.a_hello(v.pid, { name: v.name, look: {} });
    v.state = clone(this.state);
    this.visitors.push(v); this.online.set(v.pid, { name: v.name });
  }
  do(req, who = this) { return this.logic.handle(who.pid, req); }
  wait(sec) { for (let i = 0; i < sec; i++) this.logic.tick(1); }
}

// 3a. a phone that crashed before saving starts a NEW column, so the numbers others already have from
// it are never written over (with its old column, they would be: "max" keeps only the bigger)
{
  const mum = new Phone('Mum', islandFor()).lead();
  const kid = new Phone('Kid', clone(mum.state));
  mum.welcome(kid);
  const saved = clone(mum.state); // Mum's phone saved here…
  for (let i = 0; i < 6; i++) mum.do({ a: 'cheat', coins: 6 }); // …the kid saw these on their phone…
  mum.stop(); // …and then Mum's phone crashed before saving again
  const run = (gen) => {
    const m2 = new Phone('Mum', clone(saved), gen).lead();
    for (let i = 0; i < 4; i++) m2.do({ a: 'cheat', coins: 5 });
    const k2 = new Phone('Kid', clone(kid.state)).lead();
    k2.welcome(m2);
    return k2.state.coins;
  };
  const right = run(2), wrong = run(1);
  const good = check(right === 50 + 6 * 6 + 4 * 5, `crash: new column keeps everything (coins ${right} = ${50 + 36 + 20})`)
    && check(wrong < right, `(the same column again would have lost coins: ${wrong})`);
  section(good, 'a phone that crashed before saving never makes the family lose coins (new column)');
}

// 3b. an old copy playing alone: its timers (regrowth, growth) never undo what the family did since
{
  const dad = new Phone('Dad', islandFor()).lead();
  dad.do({ a: 'cheat', item: 'seed:strawberry', n: 2 });
  dad.do({ a: 'plant', i: 1, crop: 'carrot' });
  dad.state.plots[1] = { ...dad.state.plots[1], stage: 3 }; // (a ripe carrot)
  dad.state.bushes[0] = { fruit: 1, t: dad.state.clock + 5 };
  const kidCopy = clone(dad.state); // the kid's phone has this copy
  dad.do({ a: 'harvest', i: 1 });
  dad.do({ a: 'plant', i: 1, crop: 'strawberry' });
  dad.do({ a: 'bush', i: 0 }); // fruit 1 -> 0
  const carrots = dad.state.basket.carrot;
  const kid = new Phone('Kid', kidCopy).lead();
  kid.wait(400); // alone for a while: the bush regrows on the kid's copy, the old carrot is still there
  const regrew = kid.state.bushes[0].fruit;
  kid.stop();
  let good = check(regrew === 3, `(the kid's old copy regrew the bush: ${regrew})`);
  for (const [first, second] of [[dad, kid], [kid, dad]]) {
    const a = new Phone(first.name, clone(first.state)).lead(), b = new Phone(second.name, clone(second.state));
    a.welcome(b);
    const s = a.state;
    good = check(s.plots[1].crop === 'strawberry' && s.plots[1].stage === 0, `${a.name} leads: Dad's strawberry stays (not the old carrot): ${s.plots[1].crop}`) && good;
    good = check(s.bushes[0].fruit === 0, `${a.name} leads: the bush Dad picked stays picked: ${s.bushes[0].fruit}`) && good;
    good = check(s.basket.carrot === carrots, `${a.name} leads: carrots counted once: ${s.basket.carrot}`) && good;
  }
  section(good, 'an old copy playing alone never undoes what the family did since (no stamp for automatic changes)');
}

// 3c. once-a-day things stay once a day; every copy asks for the same request on the same day
{
  const dad = new Phone('Dad', islandFor()).lead();
  dad.do({ a: 'cheat', project: 'bridge' });
  const kidCopy = clone(dad.state);
  const letter = dad.do({ a: 'mail' }), dig = dad.do({ a: 'dig' });
  let good = check(letter.ok && dig.ok, `(Dad read the letter and dug the treasure: ${letter.ok}, ${dig.ok})`);
  const kid = new Phone('Kid', kidCopy);
  dad.welcome(kid);
  good = check(!dad.do({ a: 'mail' }, kid).ok && !dad.do({ a: 'dig' }, kid).ok, 'after merging, the letter and treasure are already taken today') && good;
  // two copies of the same island start a new day apart: Captain Shelly asks both for the same thing
  const a = new Phone('A', clone(dad.state)).lead(), b = new Phone('B', clone(dad.state)).lead();
  a.logic.newDay(); b.logic.newDay();
  const ra = a.state.request, rb = b.state.request;
  good = check(ra.day === rb.day && ra.item === rb.item && ra.n === rb.n && ra.reward === rb.reward, `same request on both copies: ${ra.item} x${ra.n} = ${rb.item} x${rb.n}`) && good;
  // and the next days too (a few, to be sure it isn't luck)
  for (let d = 0; d < 5; d++) { a.logic.newDay(); b.logic.newDay(); good = check(a.state.request.item === b.state.request.item, `day ${a.state.day}: same request`) && good; }
  good = check(a.state.stats.days === a.state.day, `days lived ${a.state.stats.days} = day ${a.state.day}`) && good;
  const m = mergeVillages(a.state, b.state);
  good = check(m.day === a.state.day && m.stats.days === a.state.day, `merged: same day, days lived not doubled (${m.stats.days})`) && good;
  section(good, 'once-a-day letters and treasure stay once a day; every copy rolls the same daily request');
}

// 3d. a phone whose clock is set a year ahead can't make the family's later changes look older
{
  const YEAR = 365 * 24 * 3600 * 1000;
  const dad = new Phone('Dad', islandFor()).lead();
  const kid = new Phone('Kid', clone(dad.state));
  kid.skew = YEAR;
  kid.lead();
  kid.do({ a: 'plant', i: 2, crop: 'carrot' }); // stamped a year ahead
  kid.state.plots[2] = { ...kid.state.plots[2], stage: 3 }; // (it ripened)
  const kidOld = clone(kid.state);
  kid.stop();
  dad.welcome(kid);
  dad.do({ a: 'harvest', i: 2 }); // Dad harvests the kid's carrot…
  dad.do({ a: 'cheat', item: 'seed:pumpkin', n: 1 });
  dad.do({ a: 'plant', i: 2, crop: 'pumpkin' }); // …and plants a pumpkin
  const carrots = dad.state.basket.carrot;
  // later the kid's phone shows up with its old copy (still the ripe carrot, stamped a year ahead)
  const late = new Phone('Kid', kidOld);
  dad.visitors = []; dad.online.delete('pKid');
  dad.welcome(late);
  const good = check(dad.state.plots[2].crop === 'pumpkin', `Dad's pumpkin stays (not the kid's old carrot): ${dad.state.plots[2].crop}`)
    && check(dad.state.basket.carrot === carrots, `the carrot is not back to harvest twice (carrots ${dad.state.basket.carrot})`);
  section(good, 'a phone with its clock a year ahead can’t undo what others did after it');
}

// 3e. two copies spend the same coins and shells while apart: never minus, nothing made up
{
  let good = true;
  const base = islandFor();
  base.basket.shell = 5; base.vx.c['basket/shell'] = { base: [5, 0] };
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 2, 0], [2, 0, 1]]) {
    const ph = ['A', 'B', 'C'].map((n) => new Phone(n, clone(base)).lead());
    ph[0].do({ a: 'sell', item: 'shell', n: 5 });
    ph[1].do({ a: 'sell', item: 'shell', n: 5 });
    ph[1].do({ a: 'buy', i: 0 }); // (spends coins)
    ph[2].do({ a: 'cheat', item: 'shell', n: 2 }); // the third found 2 new shells
    for (const p of ph) p.stop();
    const [x, y, z] = order.map((i) => ph[i]);
    // pairs meet first, then everyone
    const lead = new Phone(x.name, clone(x.state)).lead();
    lead.welcome(new Phone(y.name, clone(y.state)));
    const mid = lead.state.basket.shell || 0;
    lead.welcome(new Phone(z.name, clone(z.state)));
    const end = lead.state.basket.shell || 0;
    good = check(mid >= 0 && end >= 0 && end <= 2, `meeting order ${order.join('')}: shells ${mid} then ${end} (never minus, never more than the 2 new ones)`) && good;
    good = check(lead.state.coins >= 0, `coins never minus (${lead.state.coins})`) && good;
    good = booksMatch(lead.state, `(order ${order.join('')})`) && good;
    // and the next shell found shows as one more
    lead.do({ a: 'cheat', item: 'shell', n: 1 });
    good = check((lead.state.basket.shell || 0) === end + 1, `the next shell shows as one more (${lead.state.basket.shell})`) && good;
  }
  section(good, 'things spent twice while apart never show a minus number, and nothing is made up');
}

// 3f. an island from before family islands: the same id on every copy, every number kept
{
  const old = newWorldState({ code: 'CRAB123', plots: 4, bushes: 2, palms: 2 });
  old.coins = 1234; old.basket = { shell: 7, 'seed:carrot': 2 }; old.stats.fish = 40; old.stats.days = 9; old.day = 9;
  old.journal = { koi: { n: 3, best: 40, by: 'Dad', first: 5 } };
  old.players = { pDad: { name: 'Dad', look: {}, caught: 40, joined: 1 } };
  old.projects.path = { got: { driftwood: 6, coins: 30 }, done: true, by: { pDad: 36 } };
  delete old.vx;
  const saved = JSON.parse(JSON.stringify(old)); // (as it comes out of the phone's storage)
  const freshIsland = () => ensureVillage(newWorldState({ code: 'NEW9999', plots: 4, bushes: 2, palms: 2 }), () => 'vNew');
  const open = () => ensureVillage(migrate(clone(saved), freshIsland()), oldIslandVid); // what the game does at start
  const a = open(), b = open();
  let good = check(a.vx.vid === b.vx.vid && a.vx.vid === oldIslandVid(saved), `the same id every time it is opened (${a.vx.vid})`);
  good = check(a.coins === 1234 && a.basket.shell === 7 && a.journal.koi.n === 3 && a.players.pDad.caught === 40 && a.stats.fish === 40 && a.stats.days === 9, 'every number kept') && good;
  good = check(a.code === 'CRAB123' && !a.vx.c['basket/seed:strawberry'], 'its own code, and none of the brand-new island’s books mixed in') && good;
  good = check(ensureVillage(a, () => 'other').vx.vid === a.vx.vid, 'a family island is started once (never re-based)') && good;
  const dad = clone(a);
  applyOps(dad, withBookkeeping([['inc', ['coins'], 10], ['inc', ['basket', 'shell'], -2, true]], 'pDad.1', dad));
  const m = mergeVillages(dad, b);
  good = check(m.coins === 1244 && m.basket.shell === 5, `merged with a copy from before: nothing counted twice (coins ${m.coins}, shells ${m.basket.shell})`) && good;
  good = booksMatch(m, '(old island)') && good;
  section(good, 'an island from before family islands keeps everything and gets the same id on every copy');
}

// 3g. different islands are never mixed
{
  const a = fresh(), b = fresh('v2', 'FISH456');
  b.coins = 999;
  const m = mergeVillages(a, b);
  const good = check(m === a && m.coins === a.coins, 'two different islands are never merged');
  section(good, 'two different islands are never mixed together');
}

// 3h. automatic changes never get a stamp; a person's do (and the newest stamp is never older than one held)
{
  const dad = new Phone('Dad', islandFor()).lead();
  dad.do({ a: 'plant', i: 0, crop: 'carrot' });
  const stamp = dad.state.vx.t['plots/0'];
  dad.do({ a: 'water', i: 0 });
  dad.state.weather = 'rain'; dad.state.weatherUntil = dad.state.clock + 1e9;
  dad.wait(300); // grows in the rain
  let good = check(dad.state.plots[0].stage > 0, `(the carrot grew: stage ${dad.state.plots[0].stage})`);
  good = check(JSON.stringify(dad.state.vx.t['plots/0']) === JSON.stringify(stamp), 'growing and watering kept the planting stamp') && good;
  good = check(!Object.keys(dad.state.vx.t).some((k) => k.startsWith('bushes') || k.startsWith('palms')), 'regrowth never stamps') && good;
  const held = clone(dad.state);
  held.vx.t.name = [Date.now() + 1e12, 'zzz'];
  const out = withBookkeeping([['set', ['name'], 'Sunny']], 'pDad.1', held, { now: Date.now() });
  good = check(out[1][2][0] === held.vx.t.name[0] + 1, 'a new stamp is always after the one this copy holds') && good;
  // 'fix' and counters settle the same way twice (settling is safe to repeat)
  const s1 = clone(dad.state); settleCounters(s1); const s2 = clone(s1); settleCounters(s2);
  good = check(JSON.stringify(s1) === JSON.stringify(s2), 'settling twice changes nothing') && good;
  section(good, 'automatic changes keep the person’s stamp; stamps never go back in time');
}

console.log(`${checks} checks`);
console.log(ok ? 'ALL PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
