// Real touch events: drag the floating joystick, tap the big button.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8080/?nosw&autostart=host&name=Mom&notut&nopeer&notry&debug');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(1000);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
const pos = () => page.evaluate(() => { const L = window.__game.players.local; return [+L.x.toFixed(2), +L.z.toFixed(2)]; });
const p0 = await pos();
// drag from (120, 500) upward-left
await touch('touchStart', [[120, 500]]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[120 - i * 4, 500 - i * 8]]); await page.waitForTimeout(40); }
await page.waitForTimeout(1500);
const stick = await page.evaluate(() => ({ on: document.querySelector('.stick-base').classList.contains('on'), mv: window.__game.input.move }));
await touch('touchEnd', []);
await page.waitForTimeout(300);
const p1 = await pos();
console.log('joystick shown while dragging:', stick.on, 'move vector', JSON.stringify(stick.mv));
console.log('moved from', p0, 'to', p1, p1[1] < p0[1] - 0.5 ? 'PASS (moved north)' : 'FAIL');
const after = await page.evaluate(() => ({ on: document.querySelector('.stick-base').classList.contains('on'), mv: window.__game.input.move.mag }));
console.log('joystick hidden after release:', !after.on, 'stopped:', after.mv === 0);
// tap the action button near the sell crate: put player next to it first
await page.evaluate(() => { const L = window.__game.players.local; L.x = 5.2; L.z = 31.6; });
await page.waitForTimeout(600);
const box = await page.locator('.action').boundingBox();
await touch('touchStart', [[box.x + box.width / 2, box.y + box.height / 2]]);
await page.waitForTimeout(80);
await touch('touchEnd', []);
await page.waitForTimeout(900);
const sheet = await page.evaluate(() => document.querySelector('.sheet-title')?.textContent || null);
console.log('tapping the button opened:', sheet, sheet?.includes('Market') ? 'PASS' : 'FAIL');
// two-finger pinch zooms
await page.evaluate(() => window.__game.ui.closeSheet());
await page.waitForTimeout(400);
const z0 = await page.evaluate(() => window.__game.rig.zoom);
await touch('touchStart', [[150, 400], [250, 400]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[150 - i * 10, 400], [250 + i * 10, 400]]); await page.waitForTimeout(30); }
await touch('touchEnd', []);
const z1 = await page.evaluate(() => window.__game.rig.zoom);
console.log('pinch zoom', z0.toFixed(2), '->', z1.toFixed(2), z1 > z0 ? 'PASS' : 'FAIL');
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no errors');
await browser.close();
