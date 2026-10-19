// Two versions of the game in one family (while the phones update): the version before family islands
// and this one can't play together, and each phone must say so clearly instead of hanging or breaking.
//   node tests/versions.mjs [old-commit]      (needs `npm run serve` running; the old version is taken
//                                              from git, by default the last version with one host phone)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { startServers } from './servers.mjs';

const OLD = process.argv[2] || '9c58320'; // (PROTOCOL 4: one phone hosts, the others visit)
const dir = mkdtempSync(join(tmpdir(), 'cozy-old-'));
execSync(`git archive ${OLD} docs | tar -x -C ${dir}`, { cwd: new URL('..', import.meta.url).pathname });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const oldServer = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const body = readFileSync(join(dir, 'docs', p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body); } catch { res.writeHead(404); res.end(); }
}).listen(8081);
const servers = startServers();
const net = '&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777';
const NEW = `http://localhost:${process.env.PORT || 8080}/?nosw&notut&lang=en&quality=saver` + net;
const OLDURL = 'http://localhost:8081/?nosw&notut&lang=en&quality=saver' + net;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-GB' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  return p;
}
const errorText = (p) => p.evaluate(() => document.querySelector('.screen.join .error')?.textContent || '');

try {
  // 1. an old phone hosts its island; a phone with this version tries to join it
  const oldHost = await phone('old host');
  await oldHost.goto(OLDURL + '&autostart=host&name=Gran');
  await oldHost.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  const code1 = await oldHost.evaluate(() => window.__game.session.code);
  await wait(2000);
  const kid = await phone('new kid');
  await kid.goto(NEW + `&join=${code1}&name=Kid`);
  await kid.waitForSelector('.screen.join .error', { timeout: 60000 }).catch(() => {});
  const e1 = await errorText(kid);
  check(/different version/i.test(e1) && !/host/i.test(e1), `new phone → old host: told the versions differ, in family words ("${e1}")`);
  check(!(await kid.evaluate(() => !!window.__game)) && !(await kid.evaluate(() => localStorage.getItem('cozycove.island.v1'))), '…and nothing changed on the new phone (no game, no island)');
  check(await oldHost.evaluate(() => window.__game.session.online.size) === 1, 'the old host is fine and alone');

  // 2. a phone with this version leads its family island; an old phone tries to join it
  const mum = await phone('new mum');
  await mum.goto(NEW + '&autostart=new&name=Mum');
  await mum.waitForFunction(() => window.__game?.session?.phase === 'leading', null, { timeout: 90000 });
  const code2 = await mum.evaluate(() => window.__game.session.code);
  await wait(2000);
  const dad = await phone('old dad');
  await dad.goto(OLDURL + `&join=${code2}&name=Dad`);
  await dad.waitForSelector('.screen.join .error', { timeout: 60000 }).catch(() => {});
  const e2 = await errorText(dad);
  check(/different versions/i.test(e2), `old phone → new island: told the versions differ, in words the old version knows ("${e2}")`);
  check(await mum.evaluate(() => window.__game.session.online.size === 1 && !document.querySelector('.overlay:not(.hidden)')), 'Mum’s game just goes on');
} catch (e) {
  console.error('TEST CRASHED', e);
  ok = false;
} finally {
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
  console.log(ok && !errors.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
  await browser.close();
  servers.close?.();
  oldServer.close();
  process.exit(ok && !errors.length ? 0 : 1);
}
