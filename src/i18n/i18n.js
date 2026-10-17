// Languages. The English sentence itself is the "key":
//   t('Day {n}', { n: 3 })  ->  'Day 3'  or  'วันที่ 3'
// If a Thai translation is missing, the English text is shown instead (never a blank).
//
// Text made on the HOST phone (feed news, "you can't do that" replies…) travels to the other
// phones, which may use a different language. So the host sends a message object instead of
// finished text:  T('{name} caught a {fish}!', { name, fish: T(fishName) })
// and every phone turns it into words in its own language with tr(msg).
import TH from './th/index.js';

const TABLES = { th: TH };
export const LANGS = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'th', label: 'ภาษาไทย', flag: '🇹🇭' },
];

let lang = 'en';
let table = null;
export const missing = new Set(); // English keys with no translation (shown in tests)

export function detectLang() {
  const list = [...(navigator.languages || []), navigator.language || ''];
  return list.some((l) => /^th\b/i.test(l)) ? 'th' : 'en';
}

export function setLang(id) {
  lang = TABLES[id] ? id : 'en';
  table = TABLES[lang] || null;
  try { document.documentElement.lang = lang; } catch { /* no document in tests */ }
}
export const getLang = () => lang;
export const isThai = () => lang === 'th';

// Put the values into the {placeholders}. Only message objects (from T) get translated;
// plain strings such as player names are left exactly as they are.
function fill(s, p) {
  if (!p) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? (p[k] && typeof p[k] === 'object' ? tr(p[k]) : String(p[k])) : m));
}

// One English word can need two different Thai words (the fish you caught vs. the "go fishing"
// button), so a key may start with a context: t('action|Fish'). English shows the part after '|'.
export function t(s, p) {
  if (typeof s !== 'string') return fill(String(s ?? ''), p);
  if (table) {
    const v = table[s];
    if (v !== undefined) return fill(v, p);
    if (s && missing.size < 2000) missing.add(s);
  }
  const bar = s.indexOf('|');
  return fill(bar > 0 ? s.slice(bar + 1) : s, p);
}

// A message to be translated later, on each phone.
export const T = (k, p) => (p ? { k, p } : { k });

// Turn anything into text: a T() message, a plain (English) string, or a number.
export function tr(m) {
  if (m === null || m === undefined) return '';
  if (typeof m === 'object') return m.k !== undefined ? t(m.k, m.p) : '';
  return typeof m === 'string' ? t(m) : String(m);
}

// Clock text for the HUD: "7:30 AM" in English, "07:30 น." in Thai (Thai clocks use 24 hours).
export function formatClock(time) {
  const h = Math.floor(time), m = Math.floor((time - h) * 6) * 10;
  const mm = String(m).padStart(2, '0');
  if (lang === 'th') return `${String(h).padStart(2, '0')}:${mm} น.`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

// The island's name. A family that never renamed it keeps the default name, shown in each phone's language.
export const DEFAULT_ISLAND_NAME = 'Cozy Cove';
export const islandName = (name) => (!name || name === DEFAULT_ISLAND_NAME ? t(DEFAULT_ISLAND_NAME) : name);

// The font list for text drawn into pictures (name tags, photo captions).
export const CANVAS_FONT = "Fredoka, Mali, ui-rounded, system-ui, sans-serif";

// Thai letters? (used to wait for the Thai font before drawing a name tag)
export const hasThai = (s) => /[\u0E00-\u0E7F]/.test(s || '');

// Choose the language straight away (before any screen is built):
// ?lang=th in the address > the choice saved in Settings > the iPhone's own language.
(function chooseAtStart() {
  let id = null;
  try { id = new URLSearchParams(location.search).get('lang'); } catch { /* ignore */ }
  if (!id) { try { id = JSON.parse(localStorage.getItem('cozycove.settings') || '{}').lang; } catch { /* ignore */ } }
  if (!id) { try { id = detectLang(); } catch { id = 'en'; } }
  setLang(id);
})();

if (typeof window !== 'undefined') window.__i18n = { missing, getLang, t, tr };
