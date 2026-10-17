// Checks the translations, like an auditor ticking off every line:
//   node tools/i18n-check.mjs            (exit code 1 if something must be fixed)
//   node tools/i18n-check.mjs --unused   (also list Thai entries nobody uses)
// 1. every English text used with t()/T()/tr() or in the game data has a Thai version
// 2. Thai versions keep the same {placeholders} (and the leading emoji, for news messages)
// 3. no key is built from a template literal (t(`Hi ${name}`) can never be translated)
// 4. no local variable is named t / T / tr in files that use the translator (it would hide it)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const showUnused = process.argv.includes('--unused');
const errors = [], warnings = [];

const { PARTS } = await import(pathToFileURL(join(SRC, 'i18n/th/index.js')).href);
const TH = {};
for (const [part, table] of Object.entries(PARTS)) {
  for (const [k, v] of Object.entries(table)) {
    if (typeof v !== 'string') { errors.push(`th/${part}.js: value for "${k}" is not a string`); continue; }
    if (k in TH && TH[k].v !== v) warnings.push(`"${k}" is translated differently in th/${TH[k].part}.js and th/${part}.js`);
    TH[k] = { v, part };
  }
}

// ---------------------------------------------------------------- scan the source code
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'i18n') walk(p, out); } else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

// Remove comments, string/template text and regex literals so only real code is left
// (template ${...} parts are kept, they are code).
function codeOnly(src) {
  let out = '', i = 0;
  const stack = []; // template nesting
  let prevSig = ''; // last significant char (to tell a regex from a division)
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (stack.length && stack[stack.length - 1] === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); out += '"'; i++; prevSig = '"'; continue; }
      if (c === '$' && n === '{') { stack.push('expr'); out += '${'; i += 2; prevSig = '{'; continue; }
      i++; continue;
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; out += ' '; continue; }
    if (c === "'" || c === '"') {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++; out += '""'; prevSig = '"'; continue;
    }
    if (c === '`') { stack.push('tpl'); out += '"'; i++; continue; }
    if (c === '{' && stack.length) { stack.push('brace'); }
    if (c === '}' && stack.length) {
      const top = stack[stack.length - 1];
      if (top === 'expr') { stack.pop(); out += '}'; i++; prevSig = '}'; continue; }
      if (top === 'brace') stack.pop();
    }
    if (c === '/' && (prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prevSig) || /\b(return|typeof|case)$/.test(out.trimEnd()))) {
      // regex literal
      i++;
      let inClass = false;
      while (i < src.length) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') inClass = true; else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        else if (d === '\n') break;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] || '')) i++;
      out += '/r/'; prevSig = '/'; continue;
    }
    out += c;
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return out;
}

const used = new Map(); // key -> first place
const KEY_CALL = /(?<![\w$.])(t|T|tr)\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g;
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  const imp = src.match(/import\s*\{([^}]*)\}\s*from\s*['"][./]*i18n\/i18n\.js['"]/);
  const importedNames = new Set((imp?.[1] || '').split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter((n) => ['t', 'T', 'tr'].includes(n)));
  const importsI18n = importedNames.size > 0;
  for (const m of src.matchAll(KEY_CALL)) {
    const lit = m[2];
    if (lit[0] === '`' && lit.includes('${')) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`${rel}:${line}: ${m[1]}() key is a template with \${…} inside: use {placeholders} instead`);
      continue;
    }
    let key;
    try { key = new Function('return ' + lit)(); } catch { continue; }
    if (!used.has(key)) used.set(key, `${rel}:${src.slice(0, m.index).split('\n').length}`);
  }
  if (importsI18n) {
    const code = codeOnly(src);
    const lines = code.split('\n');
    lines.forEach((ln, idx) => {
      if (/^\s*import\b/.test(ln)) return;
      for (const m of ln.matchAll(/(?<![\w$.\\])(t|T|tr)(?![\w$])/g)) {
        if (!importedNames.has(m[1])) continue;
        const after = ln.slice(m.index + m[0].length);
        if (/^\s*\(/.test(after)) continue; // a call: fine
        if (/^\s*:/.test(after) && /[{,]\s*$/.test(ln.slice(0, m.index))) continue; // object key  { t: 1 }
        errors.push(`${rel}:${idx + 1}: "${m[1]}" is used as a variable here, but this file uses ${m[1]}() for translations: rename the variable`);
      }
    });
  }
}

// ---------------------------------------------------------------- texts in the game data
const data = await import(pathToFileURL(join(SRC, 'game/data.js')).href);
const { HATS } = await import(pathToFileURL(join(SRC, 'entities/character.js')).href);
const dataKeys = new Map();
const TEXT_FIELDS = new Set(['label', 'name', 'desc', 'reward', 'from', 'text', 'hint']);
function collect(v, where, depth = 0) {
  if (depth > 4 || v === null || v === undefined) return;
  if (Array.isArray(v)) { v.forEach((x, i) => (typeof x === 'string' && where === 'BOTTLE_NOTES' ? dataKeys.set(x, where) : collect(x, where, depth + 1))); return; }
  if (typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' && TEXT_FIELDS.has(k)) { if (!dataKeys.has(x)) dataKeys.set(x, `${where}.${k}`); } else if (typeof x === 'object') collect(x, where, depth + 1);
    }
  }
}
for (const [name, v] of Object.entries(data)) if (!['START_STATE', 'SHOP', 'HOOK_EXTRAS'].includes(name)) collect(v, name);
collect(HATS, 'HATS');
const { QUALITY } = await import(pathToFileURL(join(SRC, 'render/renderer.js')).href);
collect(QUALITY, 'QUALITY');

// ---------------------------------------------------------------- compare
const need = new Map([...dataKeys, ...used]);
const missingKeys = [...need].filter(([k]) => k.trim() && /[A-Za-z]/.test(k) && !(k in TH));
for (const [k, where] of missingKeys) errors.push(`missing Thai for "${k}"  (${where})`);

const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const lead = (s) => (s.match(/^(\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*)/u) || [])[1] || '';
for (const [k, { v, part }] of Object.entries(TH)) {
  if (ph(k) !== ph(v)) errors.push(`th/${part}.js: placeholders differ for "${k}": English {${ph(k)}} vs Thai {${ph(v)}}`);
  if (lead(k) && lead(v) !== lead(k)) warnings.push(`th/${part}.js: "${k}" starts with ${lead(k)} but the Thai does not`);
  if (!v.trim()) errors.push(`th/${part}.js: empty Thai for "${k}"`);
}
const unused = Object.keys(TH).filter((k) => !need.has(k));

console.log(`Thai entries: ${Object.keys(TH).length} · texts found in code: ${used.size} · in game data: ${dataKeys.size}`);
console.log(`missing: ${missingKeys.length} · Thai entries not found in code: ${unused.length} (may be used with names from variables)`);
if (showUnused) for (const k of unused) console.log(`  unused? "${k}" (th/${TH[k].part}.js)`);
for (const w of warnings) console.log('WARN  ' + w);
for (const e of errors) console.log('ERROR ' + e);
console.log(errors.length ? `\n${errors.length} problem(s) to fix.` : '\nAll good! ✓');
process.exit(errors.length ? 1 : 0);
