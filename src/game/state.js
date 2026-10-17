// The island's "ledger": everything the family owns and has done.
// Changes are small "ops" (like journal entries):
//   ['set', path, value]     e.g. ['set', ['plots', 3, 'water'], true]
//   ['inc', path, n, prune]  e.g. ['inc', ['basket', 'shell'], 1]
//   ['push', path, value, max]
// The host makes the ops; every phone applies the same ops in the same order,
// so all copies of the ledger stay identical.
import { START_STATE, PROJECTS } from './data.js';
import { shortText } from '../util/text.js';

export const SAVE_KEY = 'cozycove.island.v1';
export const SCHEMA = 1;

const clone = (v) => (v === undefined || v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));

export function newWorldState({ code, plots, bushes, palms }) {
  const s = {
    v: SCHEMA,
    code,
    created: Date.now(),
    clock: 0, // seconds of play time (only goes forward)
    day: 1,
    time: 7.6, // hour of the day (0..24)
    weather: 'sun',
    weatherUntil: 0,
    coins: START_STATE.coins,
    basket: { ...START_STATE.basket },
    journal: {},
    plots: Array.from({ length: plots }, () => ({ crop: null, stage: 0, water: false, grow: 0 })),
    bushes: Array.from({ length: bushes }, () => ({ fruit: 3, t: 0 })),
    palms: Array.from({ length: palms }, () => ({ ready: true, t: 0 })),
    items: {},
    projects: Object.fromEntries(PROJECTS.map((p) => [p.id, { got: {}, done: false, by: {} }])),
    hats: [...START_STATE.hats],
    players: {},
    mail: { day: 0 },
    treasure: { day: 0 },
    stats: { fish: 0, dishes: 0, crops: 0, earned: 0, days: 1, feasts: 0, requests: 0, maxOnline: 1, pets: 0, treasures: 0, picnics: 0 },
    feed: [],
    nextItem: 1,
    name: 'Cozy Cove',
    request: null, // Captain Shelly's request of the day
    stickers: [],
    picnicDay: 0,
  };
  return s;
}

// Fill in anything missing (keeps old saves working after updates).
export function migrate(saved, fresh) {
  if (!saved || typeof saved !== 'object') return fresh;
  const out = { ...fresh, ...saved };
  for (const k of ['journal', 'items', 'players', 'mail', 'treasure', 'stats']) {
    out[k] = { ...fresh[k], ...(saved[k] || {}) };
  }
  // The basket is NOT topped up with the starting seeds: an item that was used up is simply gone
  // (an empty slot is removed from the basket, so filling gaps would hand out free seeds every time).
  out.basket = saved.basket && typeof saved.basket === 'object' ? { ...saved.basket } : { ...fresh.basket };
  out.projects = { ...fresh.projects };
  for (const id of Object.keys(fresh.projects)) {
    if (saved.projects?.[id]) out.projects[id] = { ...fresh.projects[id], ...saved.projects[id] };
  }
  // arrays: keep saved entries, make sure the length matches the island
  for (const k of ['plots', 'bushes', 'palms']) {
    const arr = Array.isArray(saved[k]) ? saved[k] : [];
    out[k] = fresh[k].map((d, i) => (arr[i] && typeof arr[i] === 'object' ? { ...d, ...arr[i] } : d));
  }
  out.hats = Array.from(new Set([...(fresh.hats || []), ...(saved.hats || [])]));
  out.feed = Array.isArray(saved.feed) ? saved.feed.slice(-30) : [];
  out.stickers = Array.isArray(saved.stickers) ? saved.stickers : [];
  out.name = typeof saved.name === 'string' && saved.name.trim() ? shortText(saved.name, 24) : fresh.name; // (24 letters, like a_rename)
  out.v = SCHEMA;
  return out;
}

export function applyOp(state, op) {
  const [kind, path, v, extra] = op;
  let o = state;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (o[key] === undefined || o[key] === null) o[key] = typeof path[i + 1] === 'number' ? [] : {};
    o = o[key];
  }
  const k = path[path.length - 1];
  if (kind === 'set') {
    if (v === null && !Array.isArray(o)) delete o[k];
    else o[k] = clone(v);
  } else if (kind === 'inc') {
    o[k] = Math.round(((o[k] || 0) + v) * 1000) / 1000;
    if (extra && o[k] <= 0) delete o[k];
  } else if (kind === 'push') {
    if (!Array.isArray(o[k])) o[k] = [];
    o[k].push(clone(v));
    if (extra && o[k].length > extra) o[k].splice(0, o[k].length - extra);
  }
}

export function applyOps(state, ops) {
  for (const op of ops) {
    try {
      applyOp(state, op);
    } catch (e) {
      console.warn('bad op', op, e);
    }
  }
}

export function saveIsland(state) {
  try {
    const json = JSON.stringify(state);
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_KEY + '.bak', prev);
    localStorage.setItem(SAVE_KEY, json);
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadIsland() {
  for (const key of [SAVE_KEY, SAVE_KEY + '.bak']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const s = JSON.parse(raw);
      if (s && typeof s === 'object' && s.v) return s;
    } catch { /* try the backup */ }
  }
  return null;
}

export const basketCount = (state, id) => state.basket[id] || 0;
