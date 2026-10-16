// Measures CPU time per frame in a few busy situations.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:8080/?nosw&autostart=host&name=Mom&notut&nopeer&notry&debug&perf');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(2000);
async function measure(label, setup) {
  await page.evaluate(setup);
  await page.waitForTimeout(1500);
  await page.evaluate(() => Object.assign(window.__perf, { n: 0, update: 0, render: 0, maxUpdate: 0 }));
  const m0 = await page.evaluate(() => performance.memory.usedJSHeapSize);
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => { const p = window.__perf, i = window.__game.R.renderer.info.render; return { frames: p.n, updateMs: +(p.update / p.n).toFixed(2), renderCpuMs: +(p.render / p.n).toFixed(2), worstUpdateMs: +p.maxUpdate.toFixed(2), draws: i.calls, tris: i.triangles }; });
  const m1 = await page.evaluate(() => performance.memory.usedJSHeapSize);
  console.log(label.padEnd(22), JSON.stringify(r), 'heap', (m0 / 1e6).toFixed(1), '->', (m1 / 1e6).toFixed(1), 'MB');
}
await measure('cottage (spawn)', () => {});
await measure('walking on beach', () => { const g = window.__game; g.players.local.x = -45; g.players.local.z = 10; g.input.keys.add('d'); });
await measure('pier fishing', () => { const g = window.__game; g.input.keys.clear(); g.players.local.x = 24; g.players.local.z = 56; g.players.local.heading = 0; g.fishing.press(); setTimeout(() => g.fishing.release(), 400); });
await measure('forest + waterfall', () => { const g = window.__game; g.fishing.stop(); g.players.local.x = 44; g.players.local.z = -24; });
await measure('night lanterns', () => { const g = window.__game; g.players.local.x = 2; g.players.local.z = 18; g.session.state.time = 22; });
await measure('rain', () => { const g = window.__game; g.session.request({ a: 'cheat', weather: 'rain' }); g.session.state.time = 12; });
await browser.close();
