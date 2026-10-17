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

function run({ hz, preset = 'cool', work, idleFps = 0, seconds = 120, startScale = 1 }) {
  const state = { preset: QUALITY[preset], autoScale: startScale, lastRender: 0, slowFrames: 0, fastFrames: 0, paused: false, idleFps };
  let resizes = 0;
  const shouldRender = makePacer(state, () => { resizes++; });
  const tick = 1000 / hz;
  let seed = 7;
  const jitter = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.6; };
  let t = 1000, draws = 0, drawsLast10 = 0;
  const end = 1000 + seconds * 1000;
  while (t < end) {
    const now = t + jitter();
    if (shouldRender(now)) {
      draws++;
      if (t > end - 10000) drawsLast10++;
      const w = typeof work === 'function' ? work(state.autoScale) : work;
      t = Math.max(t + tick, Math.ceil((t + w) / tick) * tick); // next offer: the first screen tick after our work
    } else t += tick;
  }
  return { scale: state.autoScale, resizes, fps: drawsLast10 / 10 };
}

// 1. a phone that is fine: no brake, steady 30 fps
let r = run({ hz: 60, work: 6 });
check(r.scale === 1 && Math.abs(r.fps - 30) < 1, `60 Hz, light frames: full sharpness, ${r.fps} fps`);
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

// 6. "Extra smooth" on a phone that keeps up: 60 fps, full sharpness
r = run({ hz: 60, preset: 'smooth', work: 8 });
check(r.scale === 1 && r.fps > 58, `"Extra smooth", light frames: full sharpness, ${r.fps} fps`);

console.log(ok ? 'ALL PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
