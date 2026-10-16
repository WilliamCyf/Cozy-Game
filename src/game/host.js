// The host's rule book. Only the host phone runs this.
// Players send requests ("I'd like to sell 3 shells"); the host checks the ledger,
// and if it's allowed, writes the ops (journal entries) that everyone applies.
import { CROPS, ITEMS, FISH_BY_ID, RECIPES, SHOP, PROJECTS, PROJECT_BY_ID, LETTERS, BOTTLE_NOTES, JOURNAL_FISH, RARITY, REQUESTS, STICKERS } from './data.js';
import { PICNIC } from '../world/layout.js';
import { SPAWN_RULES, DIG_SPOT } from './spawns.js';
import { HATS } from '../entities/character.js';
import { mulberry32, weightedPick } from '../util/math.js';

// How fast the clock runs: daytime hours are slow and relaxed, nights pass quickly.
export function hourRate(h) {
  return h >= 6 && h < 19 ? 13 / (13.5 * 60) : 11 / (4 * 60);
}

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export class HostLogic {
  constructor(session, world, spawns) {
    this.session = session; // gives access to state + emit()
    this.world = world;
    this.spawns = spawns;
    this.spawnTimers = Object.fromEntries(Object.keys(SPAWN_RULES).map((k) => [k, 3 + Math.random() * 4]));
    this.slow = 0;
    this.lastHour = Math.floor(this.s.time);
    this.rand = mulberry32((Date.now() & 0xffff) + 7);
    if (!this.s.request || this.s.request.day !== this.s.day) this.newRequest();
    // fill the beaches a bit on a brand-new island
    if (Object.keys(this.s.items).length === 0) {
      for (const cat of Object.keys(SPAWN_RULES)) for (let i = 0; i < Math.ceil(SPAWN_RULES[cat].max * 0.6); i++) this.spawn(cat);
    }
  }
  get s() { return this.session.state; }
  ops(list) { this.session.emitOps(list); }
  fx(f) { this.session.emitFx(f); }
  feed(m, extra = {}) { this.ops([['push', ['feed'], { t: Date.now(), m, ...extra }, 30]]); }
  playerName(pid) { return this.s.players[pid]?.name || 'Someone'; }

  // ---------------------------------------------------------------- time passes
  tick(dt) {
    const s = this.s;
    s.clock += dt;
    const prev = s.time;
    s.time += hourRate(s.time) * dt;
    if (s.time >= 24) s.time -= 24;
    if (prev < 6 && s.time >= 6) this.newDay();
    const hour = Math.floor(s.time);
    if (hour !== this.lastHour) {
      this.lastHour = hour;
      this.hourly(hour);
    }
    this.slow += dt;
    if (this.slow < 1) return;
    const step = this.slow;
    this.slow = 0;
    const raining = s.weather === 'rain';
    // crops grow while watered (rain waters everything)
    s.plots.forEach((p, i) => {
      if (!p.crop || p.stage >= 3) return;
      if (!(p.water || raining)) return;
      p.grow = (p.grow || 0) + step;
      if (p.grow >= CROPS[p.crop].stage) {
        this.ops([['set', ['plots', i], { ...p, stage: p.stage + 1, grow: 0, water: raining }]]);
        if (p.stage + 1 === 3) this.fx({ kind: 'sparkle', x: this.world.plots[i].x, z: this.world.plots[i].z });
      }
    });
    // fruit regrows on bushes, coconuts on palms
    s.bushes.forEach((b, i) => {
      if (b.fruit < 3 && s.clock >= b.t) this.ops([['set', ['bushes', i], { fruit: b.fruit + 1, t: s.clock + 75 }]]);
    });
    s.palms.forEach((p, i) => {
      if (!p.ready && s.clock >= p.t) this.ops([['set', ['palms', i], { ready: true, t: 0 }]]);
    });
    // beach treasures wash up
    for (const cat of Object.keys(SPAWN_RULES)) {
      this.spawnTimers[cat] -= step;
      if (this.spawnTimers[cat] <= 0) {
        this.spawnTimers[cat] = SPAWN_RULES[cat].every * (0.7 + Math.random() * 0.6);
        this.spawn(cat);
      }
    }
    // how many family members at once (for the Full House sticker)
    const online = this.session.online.size;
    if (online > (s.stats.maxOnline || 1)) { this.ops([['set', ['stats', 'maxOnline'], online]]); this.checkStickers(); }
    if (raining && s.clock > s.weatherUntil) {
      this.ops([['set', ['weather'], 'sun']]);
      this.feed('🌈 The rain stopped. Look, a rainbow!');
      this.fx({ kind: 'rainbow' });
    }
  }

  hourly(hour) {
    const s = this.s;
    if (s.weather === 'sun' && hour >= 8 && hour <= 17 && Math.random() < 0.07) {
      this.ops([['set', ['weather'], 'rain'], ['set', ['weatherUntil'], s.clock + 110 + Math.random() * 120]]);
      const wet = [];
      s.plots.forEach((p, i) => { if (p.crop && p.stage < 3 && !p.water) wet.push(['set', ['plots', i, 'water'], true]); });
      this.ops(wet);
      this.feed('🌧️ A gentle rain is watering the garden. Frogs love rain!');
    }
  }

  newDay() {
    this.ops([['inc', ['day'], 1], ['inc', ['stats', 'days'], 1]]);
    this.feed(`🌅 Good morning! Day ${this.s.day} on the island.`);
    this.newRequest();
    this.feed('🐢 Captain Shelly has a new request at the shop!');
  }

  newRequest() {
    const s = this.s;
    const ok = REQUESTS.filter((r) => !r.needs || s.projects[r.needs]?.done);
    const prev = s.request?.item;
    let r = ok[Math.floor(Math.random() * ok.length)];
    if (r.item === prev && ok.length > 1) r = ok[(ok.indexOf(r) + 1) % ok.length];
    this.ops([['set', ['request'], { day: s.day, item: r.item, n: r.n, reward: r.reward, bonus: r.bonus || null, done: false }]]);
  }

  // which basket items count for a need like "anyFish" (cheapest first)
  matching(need) {
    const b = this.s.basket;
    let ids;
    if (need === 'anyFish') ids = Object.keys(b).filter((id) => ITEMS[id]?.kind === 'fish');
    else if (need === 'anyDish') ids = RECIPES.filter((r) => !r.special).map((r) => r.id);
    else if (need === 'anyCrop') ids = Object.keys(CROPS);
    else ids = [need];
    return ids.filter((id) => (b[id] || 0) > 0).sort((a, c) => (ITEMS[a]?.value || 0) - (ITEMS[c]?.value || 0));
  }

  a_request(pid) {
    const r = this.s.request;
    if (!r || r.done) return { ok: false, msg: 'Captain Shelly has everything she needs today. Come back tomorrow!' };
    const ids = this.matching(r.item);
    const have = ids.reduce((a, id) => a + this.s.basket[id], 0);
    if (have < r.n) return { ok: false, msg: `You need ${r.n - have} more first.` };
    const ops = [];
    let left = r.n;
    for (const id of ids) {
      const take = Math.min(left, this.s.basket[id]);
      if (take > 0) { ops.push(this.give(id, -take)); left -= take; }
      if (!left) break;
    }
    ops.push(['inc', ['coins'], r.reward], ['inc', ['stats', 'earned'], r.reward], ['inc', ['stats', 'requests'], 1], ['set', ['request', 'done'], true]);
    if (r.bonus) ops.push(this.give(r.bonus, 1));
    this.ops(ops);
    this.feed(`🐢 ${this.playerName(pid)} helped Captain Shelly! +${r.reward} coins for the family jar.`);
    return { ok: true, reward: r.reward, bonus: r.bonus };
  }

  a_rename(pid, req) {
    if (pid !== this.session.pid) return { ok: false, msg: 'Only the host can rename the island.' };
    const name = String(req.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!name) return { ok: false };
    this.ops([['set', ['name'], name]]);
    this.feed(`🏝️ The island is now called “${name}”!`);
    return { ok: true };
  }

  // award any newly earned stickers
  checkStickers() {
    const s = this.s;
    const have = new Set(s.stickers || []);
    for (const st of STICKERS) {
      if (have.has(st.id)) continue;
      let ok = false;
      try { ok = !!st.test(s, FISH_BY_ID); } catch { ok = false; }
      if (ok) {
        this.ops([['push', ['stickers'], st.id, 100]]);
        this.feed(`🏅 New sticker for the family: ${st.emoji} ${st.name}!`);
      }
    }
  }

  spawn(cat) {
    const s = this.s;
    if (cat === 'islet' && !s.projects.bridge?.done) return;
    if (cat === 'forest' && !s.projects.path?.done) return;
    const rule = SPAWN_RULES[cat];
    const items = Object.values(s.items);
    if (items.filter((it) => it.c === cat).length >= rule.max) return;
    const pts = this.spawns[cat];
    if (!pts?.length) return;
    for (let tries = 0; tries < 8; tries++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      if (items.some((it) => Math.abs(it.x - p[0]) < 1.5 && Math.abs(it.z - p[1]) < 1.5)) continue;
      const kind = weightedPick(rule.kinds, (k) => k[1])[0];
      const id = 'i' + s.nextItem;
      this.ops([['inc', ['nextItem'], 1], ['set', ['items', id], { k: kind, x: p[0], z: p[1], c: cat, r: Math.floor(Math.random() * 360) }]]);
      return;
    }
  }

  // ---------------------------------------------------------------- requests from players
  handle(pid, req) {
    const fn = this['a_' + req.a];
    if (!fn) return { ok: false, msg: 'Unknown action' };
    try {
      const res = fn.call(this, pid, req) || { ok: true };
      if (req.a !== 'emote' && req.a !== 'hello') this.checkStickers();
      return res;
    } catch (e) {
      console.warn('action failed', req, e);
      return { ok: false, msg: 'Oops, something went wrong.' };
    }
  }

  give(id, n) { return ['inc', ['basket', id], n, true]; }

  a_hello(pid, req) {
    const prev = this.s.players[pid];
    const rec = { name: String(req.name || 'Friend').slice(0, 14), look: req.look || {}, caught: prev?.caught || 0, joined: prev?.joined || Date.now() };
    this.ops([['set', ['players', pid], rec]]);
    if (!prev) this.feed(`🏝️ ${rec.name} moved onto the island!`);
  }

  a_look(pid, req) {
    const prev = this.s.players[pid];
    if (!prev) return { ok: false };
    const hat = req.look?.hat;
    if (hat && !this.s.hats.includes(hat)) return { ok: false, msg: 'That hat isn’t unlocked yet.' };
    this.ops([['set', ['players', pid, 'look'], req.look], ['set', ['players', pid, 'name'], String(req.name || prev.name).slice(0, 14)]]);
  }

  a_pick(pid, req) {
    const it = this.s.items[req.id];
    if (!it) return { ok: false, msg: 'Someone already picked that up!' };
    this.ops([['set', ['items', req.id], null], this.give(it.k, 1)]);
    this.fx({ kind: 'pop', x: it.x, z: it.z, item: it.k, pid });
    return { ok: true, item: it.k };
  }

  a_shake(pid, req) {
    const p = this.s.palms[req.i], info = this.world.palms[req.i];
    if (!p || !info) return { ok: false };
    this.fx({ kind: 'shake', i: req.i, pid });
    if (!p.ready) return { ok: true, empty: true, msg: 'No coconuts yet… try again later.' };
    const a = Math.random() * Math.PI * 2;
    const x = +(info.top[0] + Math.cos(a) * 1.2).toFixed(2), z = +(info.top[2] + Math.sin(a) * 1.2).toFixed(2);
    const [wx, wz] = this.world.walk.nearestWalkable(x, z, 4);
    const id = 'i' + this.s.nextItem;
    this.ops([
      ['set', ['palms', req.i], { ready: false, t: this.s.clock + 150 }],
      ['inc', ['nextItem'], 1],
      ['set', ['items', id], { k: 'coconut', x: +wx.toFixed(2), z: +wz.toFixed(2), c: 'drop', r: 0, drop: 1 }],
    ]);
    return { ok: true };
  }

  a_bush(pid, req) {
    const b = this.s.bushes[req.i], info = this.world.bushes[req.i];
    if (!b || !info) return { ok: false };
    if (b.fruit <= 0) return { ok: false, msg: 'Picked clean! It will regrow soon.' };
    const kind = info.kind;
    this.ops([['set', ['bushes', req.i], { fruit: b.fruit - 1, t: b.fruit === 3 ? this.s.clock + 75 : b.t }], this.give(kind, 1)]);
    this.fx({ kind: 'pop', x: info.x, z: info.z, item: kind, pid });
    return { ok: true, item: kind };
  }

  plotOpen(i) {
    const extra = this.world.plots[i]?.extra;
    return this.world.plots[i] && (!extra || this.s.projects.garden?.done);
  }

  a_plant(pid, req) {
    const p = this.s.plots[req.i];
    if (!p || !this.plotOpen(req.i)) return { ok: false };
    if (p.crop) return { ok: false, msg: 'Something is already growing here.' };
    if (!CROPS[req.crop]) return { ok: false };
    if ((this.s.basket['seed:' + req.crop] || 0) < 1) return { ok: false, msg: 'No seeds left. Captain Shelly sells more!' };
    this.ops([this.give('seed:' + req.crop, -1), ['set', ['plots', req.i], { crop: req.crop, stage: 0, water: this.s.weather === 'rain', grow: 0, by: pid }]]);
    return { ok: true };
  }

  a_water(pid, req) {
    const p = this.s.plots[req.i];
    if (!p?.crop || p.stage >= 3) return { ok: false };
    if (p.water) return { ok: true, msg: 'Already watered. Plants are happy!' };
    this.ops([['set', ['plots', req.i, 'water'], true]]);
    this.fx({ kind: 'water', x: this.world.plots[req.i].x, z: this.world.plots[req.i].z, pid });
    return { ok: true };
  }

  a_harvest(pid, req) {
    const p = this.s.plots[req.i];
    if (!p?.crop || p.stage < 3) return { ok: false, msg: 'Not ready yet. Keep it watered!' };
    const c = CROPS[p.crop];
    const n = randInt(c.yield[0], c.yield[1]);
    this.ops([this.give(p.crop, n), ['set', ['plots', req.i], { crop: null, stage: 0, water: false, grow: 0 }], ['inc', ['stats', 'crops'], n]]);
    this.fx({ kind: 'pop', x: this.world.plots[req.i].x, z: this.world.plots[req.i].z, item: p.crop, n, pid });
    return { ok: true, item: p.crop, n };
  }

  a_catch(pid, req) {
    const s = this.s;
    const name = this.playerName(pid);
    const ops = [];
    if (req.bait && ['shrimp', 'lure'].includes(req.bait) && (s.basket[req.bait] || 0) > 0) ops.push(this.give(req.bait, -1));
    if (req.extra === 'seaglass') {
      this.ops([...ops, this.give('seaglass', 1)]);
      return { ok: true };
    }
    if (req.extra === 'bottle') {
      const note = BOTTLE_NOTES[Math.floor(Math.random() * BOTTLE_NOTES.length)];
      this.ops([...ops, ['inc', ['coins'], 5], ['inc', ['stats', 'earned'], 5], ['inc', ['stats', 'bottles'], 1]]);
      return { ok: true, note };
    }
    if (req.extra === 'chest') {
      const coins = randInt(90, 220);
      this.ops([...ops, ['inc', ['coins'], coins], ['inc', ['stats', 'earned'], coins]]);
      this.feed(`🧰 ${name} fished up a treasure chest with ${coins} coins!`);
      return { ok: true, coins };
    }
    const f = FISH_BY_ID[req.fish];
    if (!f) return { ok: false };
    const size = Math.max(f.size[0], Math.min(f.size[1], Number(req.size) || f.size[0]));
    const j = s.journal[f.id];
    const isNew = !j && !f.junk;
    const record = j && size > j.best;
    ops.push(this.give('fish:' + f.id, 1));
    if (!f.junk) {
      ops.push(['set', ['journal', f.id], { n: (j?.n || 0) + 1, best: Math.max(size, j?.best || 0), by: j?.by || name, first: j?.first || Date.now() }]);
      ops.push(['inc', ['stats', 'fish'], 1]);
      ops.push(['inc', ['players', pid, 'caught'], 1]);
    }
    this.ops(ops);
    if (isNew) this.checkProjects();
    if (isNew) {
      const total = Object.keys(this.s.journal).length;
      this.feed(`📖 ${name} discovered the ${f.name}! (${total}/${JOURNAL_FISH.length} in the journal)`, { pid });
    } else if (f.rar === 'legendary' || f.rar === 'rare') {
      this.feed(`✨ ${name} caught a ${RARITY[f.rar].label.toLowerCase()} ${f.name}!`, { pid });
    } else if (record) {
      this.feed(`📏 New family record: ${name}'s ${f.name} is ${size} cm!`, { pid });
    }
    return { ok: true, isNew, record };
  }

  a_sell(pid, req) {
    const n = Math.max(1, Math.floor(req.n || 1));
    const have = this.s.basket[req.item] || 0;
    const def = ITEMS[req.item];
    if (!def || have < n) return { ok: false, msg: 'Not enough in the basket.' };
    if (!def.value) return { ok: false, msg: 'That can’t be sold.' };
    const coins = def.value * n;
    this.ops([this.give(req.item, -n), ['inc', ['coins'], coins], ['inc', ['stats', 'earned'], coins]]);
    this.fx({ kind: 'coins', n: coins, pid });
    return { ok: true, coins };
  }

  a_buy(pid, req) {
    const offer = SHOP[req.i];
    if (!offer) return { ok: false };
    if (this.s.coins < offer.price) return { ok: false, msg: 'Not enough coins in the family jar.' };
    this.ops([['inc', ['coins'], -offer.price], this.give(offer.item, offer.n)]);
    return { ok: true };
  }

  a_buyHat(pid, req) {
    const hat = HATS.find((h) => h.id === req.hat);
    if (!hat) return { ok: false };
    if (this.s.hats.includes(hat.id)) return { ok: true };
    if (this.s.coins < hat.price) return { ok: false, msg: 'Not enough coins in the family jar.' };
    this.ops([['inc', ['coins'], -hat.price], ['set', ['hats'], [...this.s.hats, hat.id]]]);
    this.feed(`🎩 The family unlocked the ${hat.name}!`);
    return { ok: true };
  }

  // Which items would a recipe use? ("any fish" uses the least valuable fish first)
  recipeUse(r) {
    const use = {};
    const basket = this.s.basket;
    for (const [k, n] of Object.entries(r.needs)) {
      if (k === 'anyFish') {
        const fishes = Object.keys(basket).filter((id) => ITEMS[id]?.kind === 'fish' && basket[id] > 0)
          .sort((a, b) => ITEMS[a].value - ITEMS[b].value);
        let left = n;
        for (const id of fishes) {
          const take = Math.min(left, basket[id] - (use[id] || 0));
          if (take > 0) { use[id] = (use[id] || 0) + take; left -= take; }
          if (!left) break;
        }
        if (left > 0) return null;
      } else {
        if ((basket[k] || 0) - (use[k] || 0) < n) return null;
        use[k] = (use[k] || 0) + n;
      }
    }
    return use;
  }

  a_cook(pid, req) {
    const r = RECIPES.find((x) => x.id === req.r);
    if (!r) return { ok: false };
    const use = this.recipeUse(r);
    if (!use) return { ok: false, msg: 'Missing some ingredients.' };
    const ops = Object.entries(use).map(([k, n]) => this.give(k, -n));
    ops.push(this.give(r.id, 1), ['inc', ['stats', 'dishes'], 1]);
    this.ops(ops);
    if (r.special) { this.ops([['inc', ['stats', 'feasts'], 1]]); this.feed(`🍱 ${this.playerName(pid)} cooked a Family Feast! Everyone gather round!`); }
    this.fx({ kind: 'cook', pid, r: r.id });
    return { ok: true };
  }

  projectAvailable(p) {
    return !p.after || p.after.every((id) => this.s.projects[id]?.done);
  }

  // How many more of `need` the project still wants
  projectLeft(p, need) {
    const st = this.s.projects[p.id];
    if (need === 'journal') return Math.max(0, p.needs.journal - Object.keys(this.s.journal).length);
    return Math.max(0, p.needs[need] - (st.got[need] || 0));
  }

  a_donate(pid, req) {
    const p = PROJECT_BY_ID[req.p];
    const st = this.s.projects[req.p];
    if (!p || !st || st.done) return { ok: false };
    if (!this.projectAvailable(p)) return { ok: false, msg: 'Finish the other projects first!' };
    const need = req.need;
    if (!(need in p.needs) || need === 'journal') return { ok: false };
    const left = this.projectLeft(p, need);
    if (left <= 0) return { ok: false, msg: 'That part is done already!' };
    const ops = [];
    let n = 0;
    if (need === 'coins') {
      n = Math.min(left, this.s.coins, Math.max(1, Math.floor(req.n || left)));
      if (n <= 0) return { ok: false, msg: 'The family jar is empty.' };
      ops.push(['inc', ['coins'], -n]);
    } else {
      // groups: anyCrop / anyDish take whatever matching items the family has (cheapest first)
      const ids = need === 'anyCrop' ? Object.keys(CROPS) : need === 'anyDish' ? RECIPES.filter((r) => !r.special).map((r) => r.id) : need === 'feast' ? ['feast'] : [need];
      const sorted = ids.filter((id) => (this.s.basket[id] || 0) > 0).sort((a, b) => ITEMS[a].value - ITEMS[b].value);
      let want = Math.min(left, Math.max(1, Math.floor(req.n || left)));
      for (const id of sorted) {
        const take = Math.min(want, this.s.basket[id]);
        if (take > 0) { ops.push(this.give(id, -take)); n += take; want -= take; }
        if (!want) break;
      }
      if (!n) return { ok: false, msg: 'The basket doesn’t have any of that yet.' };
    }
    ops.push(['inc', ['projects', req.p, 'got', need], n], ['inc', ['projects', req.p, 'by', pid], n]);
    this.ops(ops);
    // finished?
    const allDone = Object.keys(p.needs).every((k) => this.projectLeft(p, k) <= 0);
    if (allDone) this.completeProject(p);
    else this.checkProjects();
    return { ok: true, n, done: allDone };
  }

  // finish any project whose needs are all met (some needs fill up by themselves, like the journal)
  checkProjects() {
    for (const p of PROJECTS) {
      const st = this.s.projects[p.id];
      if (!st || st.done || !this.projectAvailable(p)) continue;
      if (Object.keys(p.needs).every((k) => this.projectLeft(p, k) <= 0)) this.completeProject(p);
    }
  }

  completeProject(p) {
    const ops = [['set', ['projects', p.id, 'done'], true]];
    if (p.id === 'festival' && !this.s.hats.includes('crown')) ops.push(['set', ['hats'], [...this.s.hats, 'crown']]);
    this.ops(ops);
    this.feed(`🎉 Family project complete: ${p.name}! ${p.reward}`);
    this.fx({ kind: 'project', id: p.id });
    // finishing one project may unlock (and already satisfy) the next
    if (p.id !== 'festival') this.checkProjects();
  }

  a_mail(pid) {
    const s = this.s;
    if (s.mail.day >= s.day) return { ok: false, msg: 'No new letters today. Check again tomorrow!' };
    const letter = LETTERS[(s.day - 1) % LETTERS.length];
    const ops = [['set', ['mail', 'day'], s.day]];
    for (const [k, n] of Object.entries(letter.gift)) ops.push(k === 'coins' ? ['inc', ['coins'], n] : this.give(k, n));
    this.ops(ops);
    return { ok: true, letter };
  }

  a_dig(pid, req) {
    const s = this.s;
    if (!s.projects.bridge?.done) return { ok: false };
    if (s.treasure.day >= s.day) return { ok: false, msg: 'Already dug up today’s treasure. More tomorrow!' };
    const coins = randInt(60, 140);
    const bonus = ['seaglass', 'coral', 'lure', 'seed:pumpkin'][Math.floor(Math.random() * 4)];
    this.ops([['set', ['treasure', 'day'], s.day], ['inc', ['coins'], coins], ['inc', ['stats', 'earned'], coins], ['inc', ['stats', 'treasures'], 1], this.give(bonus, 1)]);
    this.feed(`🏴‍☠️ ${this.playerName(pid)} dug up buried treasure: ${coins} coins and a ${ITEMS[bonus].name}!`);
    this.fx({ kind: 'pop', x: DIG_SPOT.x, z: DIG_SPOT.z, item: 'chest', pid });
    void req;
    return { ok: true, coins, bonus };
  }

  a_emote(pid, req) {
    const allowed = ['wave', 'heart', 'dance', 'cheer', 'sit', 'laugh', 'sleep'];
    if (!allowed.includes(req.e)) return { ok: false };
    this.fx({ kind: 'emote', pid, e: req.e });
    if (req.e === 'sit') setTimeout(() => this.checkPicnic(pid), 600);
  }

  // Family picnic: 2+ people sitting together at the picnic spot (once a day)
  checkPicnic(pid) {
    const s = this.s;
    if (!s.projects.picnic?.done || (s.picnicDay || 0) >= s.day) return;
    const cx = PICNIC.x + 2, cz = PICNIC.z;
    let n = 0;
    for (const [, o] of this.session.online) {
      const p = o.s;
      if (p && Math.hypot(p[0] - cx, p[1] - cz) < 6 && p[3] === 2) n++; // 2 = sitting animation
    }
    if (n < 2) return;
    this.ops([['set', ['picnicDay'], s.day], ['inc', ['coins'], 30], ['inc', ['stats', 'picnics'], 1], ['inc', ['stats', 'earned'], 30]]);
    this.feed(`🧺 Family picnic! ${n} of you sat together. Everyone feels cozy. +30 coins`);
    this.fx({ kind: 'picnic', pid });
    this.checkStickers();
    this.session.flush();
  }

  a_pet(pid, req) {
    this.ops([['inc', ['stats', 'pets'], 1]]);
    this.fx({ kind: 'pet', pid, who: req.who || 'cat' });
  }

  a_cheat(pid, req) {
    // debug helper (only when the game is started with ?debug)
    if (!this.session.debug) return { ok: false };
    if (req.coins) this.ops([['inc', ['coins'], req.coins]]);
    if (req.item) this.ops([this.give(req.item, req.n || 1)]);
    if (req.time !== undefined) this.s.time = req.time;
    if (req.weather) this.ops([['set', ['weather'], req.weather], ['set', ['weatherUntil'], this.s.clock + 200]]);
    if (req.project) { const p = PROJECT_BY_ID[req.project]; if (p) this.completeProject(p); }
  }
}

export { PROJECTS };
