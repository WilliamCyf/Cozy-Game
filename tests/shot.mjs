// Takes a screenshot of the game in a simulated iPhone.
//   node tests/shot.mjs "<query string>" out.png [portrait|landscape] [waitMs]
import { chromium } from 'playwright';

const [, , query = '', out = 'shot.png', orient = 'portrait', wait = '2500'] = process.argv;
const port = process.env.PORT || 8080;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const vp = orient === 'landscape' ? { width: 844, height: 390 } : { width: 390, height: 844 };
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${port}/?${query}`);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 }).catch(() => logs.push('timeout waiting for __game'));
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
const info = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return null;
  const i = g.R.renderer.info;
  return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, dpr: g.R.state.dpr };
}).catch(() => null);
console.log(JSON.stringify(info));
for (const l of logs.slice(0, 30)) console.log(l);
await browser.close();
