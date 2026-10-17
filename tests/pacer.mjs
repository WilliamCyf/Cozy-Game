// The frame pacer and its heat brake, fed pretend iPhone timings (no browser needed):
//   node tests/pacer.mjs
// A pretend phone offers frames on its screen rhythm (60 a second, 30 in Low Power Mode, 120 on
// ProMotion screens). When we draw, the next offer comes only after our frame's work is done, at the
// next screen tick, just like a real iPhone. We check that a phone that is really struggling gets
// the brake (fewer pixels = less heat), and a phone that is fine, or in Low Power Mode, does not.
import { makePacer } from '../src/render/pacer.js';
import { QUALITY } from '../src/render/quality.js';

let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };

// work: ms per drawn frame (or a function of the sharpness and the second we're at)
// idle: the slower rate asked for (a page open = 24, resting = 20…), or a function of the second
// late: extra ms the phone is late stamping a frame (a busy moment), as a function of the second
// hidden: true while the app is in the background (the phone offers no frames at all then)
// jit: how much the phone's frame timestamps wobble (ms); after: how long after each screen tick the
// timestamp is taken (a real phone runs the frame a little after the tick); whole: rounded down to whole ms (Safari)
function run({ hz, preset = 'cool', work, idleFps = 0, idle = null, late = null, hidden = null, seconds = 120, startScale = 1, jit = 0.6, after = 0, whole = false }) {
  const state = { preset: QUALITY[preset], autoScale: startScale, lastRender: 0, slowFrames: 0, fastFrames: 0, paused: false, idleFps };
  let resizes = 0;
  const shouldRender = makePacer(state, () => { resizes++; });
  const tick = 1000 / hz;
  let seed = 7;
  const jitter = () => { seed = (seed * 16807) % 2147483647; return after ? after + (seed / 2147483647) * jit : (seed / 2147483647 - 0.5) * jit; };
  let t = 1000, draws = 0, drawsLast10 = 0, guardOn = 0, guardTries = 0, wasGuard = false, firstGuard = -1;
  const end = 1000 + seconds * 1000;
  while (t < end) {
    const sec = (t - 1000) / 1000;
    if (hidden && hidden(sec)) { t += tick; continue; }
    if (idle) state.idleFps = idle(sec);
    if (state.guard !== wasGuard) { wasGuard = state.guard; if (wasGuard) { guardOn++; if (firstGuard < 0) firstGuard = sec; } else guardTries++; }
    let now = t + jitter() + (late ? late(sec) : 0);
    if (whole) now = Math.floor(now);
    if (shouldRender(now)) {
      draws++;
      if (t > end - 10000) drawsLast10++;
      const w = typeof work === 'function' ? work(state.autoScale, sec, state) : work;
      t = Math.max(t + tick, Math.ceil((t + w) / tick) * tick); // next offer: the first screen tick after our work
    } else t += tick;
  }
  return { scale: state.autoScale, resizes, fps: drawsLast10 / 10, guard: state.guard, guardOn, guardTries, firstGuard };
}

// 1. a phone that is fine: no brake, steady 30 fps
let r = run({ hz: 60, work: 6 });
check(r.scale === 1 && r.resizes === 0 && Math.abs(r.fps - 30) < 1, `60 Hz, light frames: full sharpness, no flicker, ${r.fps} fps`);
r = run({ hz: 120, work: 6 });
check(r.scale === 1 && Math.abs(r.fps - 30) < 1, `120 Hz screen, light frames: full sharpness, ${r.fps} fps`);

// 2. a hot, struggling phone (frames take longer than the 33 ms we have): the brake comes on
r = run({ hz: 60, work: 35 });
check(r.scale < 1, `60 Hz, heavy frames (35 ms): fewer pixels (sharpness ${r.scale.toFixed(2)})`);
r = run({ hz: 60, work: 60 });
check(r.scale <= 0.61, `60 Hz, very heavy frames (60 ms): brake all the way (sharpness ${r.scale.toFixed(2)})`);
r = run({ hz: 120, work: 40 });
check(r.scale < 1, `120 Hz, heavy frames (40 ms): fewer pixels (sharpness ${r.scale.toFixed(2)})`);
r = run({ hz: 30, work: 40 });
check(r.scale < 1, `Low Power Mode, heavy frames (40 ms): fewer pixels (sharpness ${r.scale.toFixed(2)})`);
// the brake helps: frames get cheaper with fewer pixels, and the phone settles
r = run({ hz: 60, work: (s) => 12 + 30 * s * s });
check(r.scale < 1 && r.fps > 25, `heavy frames that get lighter with fewer pixels: settles at sharpness ${r.scale.toFixed(2)}, ${r.fps} fps`);

// 3. Low Power Mode (the phone only offers 30 frames a second): that is not "struggling"
r = run({ hz: 30, preset: 'smooth', work: 6 });
check(r.scale === 1, `Low Power Mode with "Extra smooth" chosen: full sharpness (${r.scale.toFixed(2)}), ${r.fps} fps`);
r = run({ hz: 30, work: 6 });
check(r.scale === 1 && Math.abs(r.fps - 30) < 1, `Low Power Mode, "Cool & cozy": full sharpness, ${r.fps} fps`);
r = run({ hz: 30, work: 6, idleFps: 24 });
check(r.scale === 1, `Low Power Mode with a page open (24 fps asked): full sharpness (${r.scale.toFixed(2)}), ${r.fps} fps`);

// 4. resting: nobody touching (20 fps) or the title screen (12 fps) is not "struggling" either
r = run({ hz: 60, work: 6, idleFps: 20 });
check(r.scale === 1 && Math.abs(r.fps - 20) < 1, `resting at 20 fps: full sharpness, ${r.fps} fps`);
r = run({ hz: 60, work: 6, idleFps: 12 });
check(r.scale === 1 && Math.abs(r.fps - 12) < 1, `title screen resting at 12 fps: full sharpness, ${r.fps} fps`);

// 5. when the phone has cooled down, sharpness comes back, step by step
r = run({ hz: 60, work: 6, startScale: 0.76, seconds: 240 });
check(r.scale === 1, `cooled down: sharpness back to ${r.scale.toFixed(2)}`);

// 5b. …also after a page was opened and closed while it cooled (that can put the schedule a little out
//     of step), and with an odd late frame now and then
const hotThenCool = (s, sec) => (sec < 60 ? 37 : 8);
for (const open of [0.5, 1.3, 3, 7]) {
  r = run({ hz: 60, work: hotThenCool, idle: (sec) => (sec >= 70 && sec < 70 + open ? 24 : 0), seconds: 60 + 360 });
  check(r.scale === 1, `hot for a minute, then a page open for ${open} s while cooling: sharpness back to ${r.scale.toFixed(2)} within 6 minutes`);
}
r = run({ hz: 60, work: hotThenCool, late: (sec) => (sec > 60 && Math.abs(sec % 5) < 0.02 ? 5 + (sec % 7) : 0), seconds: 60 + 480 });
check(r.scale === 1, `hot, then cooling with a late frame every 5 s: sharpness back to ${r.scale.toFixed(2)}`);
r = run({ hz: 60, work: hotThenCool, seconds: 60 });
check(r.scale < 1, `(and the hot minute in those cases really did brake: ${r.scale.toFixed(2)})`);

// 3b. Low Power Mode: one odd quick frame now and then (a busy moment) is not a reason to brake
r = run({ hz: 30, preset: 'smooth', work: 6, late: (sec) => (Math.abs(sec % 2.5) < 0.03 ? 10 : 0), seconds: 180 });
check(r.scale === 1, `Low Power Mode, "Extra smooth", an odd quick frame every 2.5 s: full sharpness (${r.scale.toFixed(2)})`);

// 3c. the phone stamps a frame a little late right after a fresh start (start-up, back from the
//     background, a hiccup longer than a few frames): on-time pictures after it must not look late,
//     and sharpness must never flicker
const firstLate = (d, at = 0) => { let done = false; return (sec) => (!done && sec >= at ? ((done = true), d) : 0); };
for (const d of [5, 8, 12, 16]) {
  r = run({ hz: 30, work: 6, late: firstLate(d), seconds: 300 });
  check(r.scale === 1 && r.resizes === 0, `Low Power Mode, first frame ${d} ms late: full sharpness, no flicker (${r.scale.toFixed(2)}, ${r.resizes} changes)`);
  r = run({ hz: 60, preset: 'smooth', work: 6, late: firstLate(d), seconds: 300 });
  check(r.scale === 1 && r.resizes === 0, `"Extra smooth", first frame ${d} ms late: full sharpness, no flicker (${r.scale.toFixed(2)}, ${r.resizes} changes)`);
}
// a hiccup in the middle of play (one 150 ms frame), then the next frame stamped late
r = run({ hz: 30, work: (s, sec) => (sec >= 30 && sec < 30.02 ? 150 : 6), late: firstLate(9, 30.1), seconds: 300 });
check(r.scale === 1 && r.resizes === 0, `Low Power Mode, a hiccup then a late frame: full sharpness, no flicker (${r.scale.toFixed(2)}, ${r.resizes} changes)`);
// steady 18-28 ms frames (busy but on time) with a single 45 ms frame
r = run({ hz: 60, work: (s, sec) => (sec >= 20 && sec < 20.02 ? 45 : 18 + 10 * ((Math.sin(sec * 7) + 1) / 2)), seconds: 300 });
check(r.scale === 1 && r.resizes === 0, `busy but on-time frames with one slow one: full sharpness, no flicker (${r.scale.toFixed(2)}, ${r.resizes} changes)`);

// 6. "Extra smooth" on a phone that keeps up: 60 fps, full sharpness
r = run({ hz: 60, preset: 'smooth', work: 8 });
check(r.scale === 1 && r.fps > 58, `"Extra smooth", light frames: full sharpness, ${r.fps} fps`);

// 7. the heat guard for "Extra smooth" (the default for new phones): 60 fps while the phone keeps up,
//    30 fps by itself when it can't (warm phone, Low Power Mode), and 60 again once it has cooled
r = run({ hz: 60, preset: 'smooth', work: 8, seconds: 600 });
check(!r.guard && r.guardOn === 0 && r.fps > 58 && r.scale === 1, `guard: a phone that keeps up stays at 60 fps for 10 minutes (${r.fps} fps, guard came on ${r.guardOn}x)`);
r = run({ hz: 120, preset: 'smooth', work: 8, seconds: 300 });
check(!r.guard && r.fps > 58 && r.scale === 1, `guard: 120 Hz screen keeps 60 fps (${r.fps} fps)`);
r = run({ hz: 60, preset: 'smooth', work: 20 });
check(r.guard && r.firstGuard < 10 && Math.abs(r.fps - 30) < 1 && r.scale === 1, `guard: a phone that can't keep 60 drops to 30 within ${r.firstGuard.toFixed(1)} s, full sharpness (${r.fps} fps)`);
r = run({ hz: 60, preset: 'smooth', work: (s, sec) => (sec < 60 ? 8 : 22), seconds: 120 });
check(r.guard && r.firstGuard > 60 && r.firstGuard < 70 && Math.abs(r.fps - 30) < 1, `guard: the phone warms up after a minute: 30 fps from ${r.firstGuard.toFixed(1)} s (${r.fps} fps)`);
r = run({ hz: 60, preset: 'smooth', work: (s, sec) => (sec < 60 ? 22 : 8), seconds: 60 + 480 });
check(!r.guard && r.guardTries === 1 && r.fps > 58, `guard: once cool again, back to 60 fps (${r.fps} fps after ${r.guardTries} try)`);
r = run({ hz: 30, preset: 'smooth', work: 6, seconds: 3600 });
check(r.guard && r.guardTries <= 4 && r.scale === 1 && Math.abs(r.fps - 30) < 1, `guard: Low Power Mode for an hour: 30 fps, only ${r.guardTries} quick tries of 60, full sharpness`);
r = run({ hz: 60, preset: 'smooth', work: 45, seconds: 180 });
check(r.guard && r.scale < 1, `guard: a hot phone gets both: 30 fps and fewer pixels (sharpness ${r.scale.toFixed(2)})`);
r = run({ hz: 60, preset: 'smooth', work: 8, hidden: (sec) => sec > 20 && sec < 50, seconds: 120 });
check(!r.guard && r.guardOn === 0 && r.fps > 58, `guard: hiding the app for 30 s doesn't count as slow (${r.fps} fps, guard ${r.guardOn}x)`);
r = run({ hz: 60, preset: 'smooth', work: (s, sec) => (Math.abs(sec - 30) < 0.01 ? 300 : 8), seconds: 120 });
check(!r.guard && r.guardOn === 0, `guard: one 300 ms hiccup doesn't trip it (guard ${r.guardOn}x)`);
r = run({ hz: 60, preset: 'smooth', work: 8, idle: (sec) => (sec % 20 < 6 ? 24 : sec > 100 && sec < 160 ? 20 : 0), seconds: 240 });
check(!r.guard && r.guardOn === 0 && r.fps > 58, `guard: opening pages and resting now and then doesn't trip it (${r.fps} fps, guard ${r.guardOn}x)`);

// a phone that keeps up for a while after cooling, then warms up again (the real heat pattern):
// the waits must grow (5, 10, 20, 40 min), not flip between 60 and 30 every 5 minutes all evening
for (const warmAfter of [10, 60, 180]) {
  let since60 = null;
  const warming = (s, sec, st) => { if (st.guard) { since60 = null; return 8; } if (since60 === null) since60 = sec; return sec - since60 > warmAfter ? 22 : 8; };
  r = run({ hz: 60, preset: 'smooth', work: warming, seconds: 3 * 3600 });
  check(r.guardOn <= 7, `guard: warms up ${warmAfter} s after each try: only ${r.guardOn} switches to 30 in 3 hours (waits grow)`);
}
// graphics chip working flat out at 50-something fps (some frames just miss): that is a warm phone too
let n1 = 0;
r = run({ hz: 60, preset: 'smooth', work: () => (++n1 % 8 === 0 ? 18 : 15.5), seconds: 60 });
check(r.guard, `guard: a phone stuck at about 53 fps drops to 30 (guard on: ${r.guard})`);
let n2 = 0;
r = run({ hz: 60, preset: 'smooth', work: () => (++n2 % 5 === 0 ? 18 : 16), seconds: 60 });
check(r.guard, `guard: a phone stuck at about 50 fps drops to 30 (guard on: ${r.guard})`);
// …but a healthy phone with the odd slightly slow frame keeps 60
let n3 = 0;
r = run({ hz: 60, preset: 'smooth', work: () => (++n3 % 40 === 0 ? 25 : 8), seconds: 600 });
check(!r.guard && r.guardOn === 0 && r.fps > 57, `guard: a healthy phone with an odd slow frame keeps 60 (${r.fps} fps, guard ${r.guardOn}x)`);

// a hiccup that ends at an unlucky moment between two screen ticks, with Safari-like timestamps
// (whole milliseconds, ~1 ms wobble): the pictures after it must not be turned away
// (the hiccup's last picture is stamped d ms after its screen tick: every moment between two ticks is tried)
for (const whole of [false, true]) {
  let unlucky = 0, tried = 0;
  for (let d = 0; d < 16.6; d += 0.1) {
    tried++;
    r = run({ hz: 60, preset: 'smooth', jit: 1, after: 0.4, whole, work: (s, sec) => (Math.abs(sec - 20) < 0.01 ? 70 : 9), late: firstLate(d, 20.05), seconds: 60 });
    if (r.guard || r.guardOn || r.fps < 58) unlucky++;
  }
  check(unlucky === 0, `guard: a hiccup ending at any moment between two screen ticks keeps a healthy phone at 60${whole ? ' (whole-ms timestamps)' : ''} (${unlucky} of ${tried} went wrong)`);
}
r = run({ hz: 60, preset: 'smooth', jit: 1, after: 0.4, whole: true, work: 9, seconds: 600 });
check(!r.guard && r.guardOn === 0 && r.fps > 58, `guard: Safari-like timestamps on a healthy phone: 60 fps for 10 minutes (${r.fps} fps, guard ${r.guardOn}x)`);

console.log(ok ? 'ALL PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
