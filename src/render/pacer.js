// The frame pacer: decides, every time the phone offers a frame, whether to draw it, and turns the
// "draw fewer pixels" heat brake on and off. Kept apart from three.js so tests/pacer.mjs can feed it
// pretend phone timings (a hot phone, Low Power Mode, a 120 Hz screen) and check what it does.
//
// The phone's own rhythm, judged every 2 seconds: 60 a second if it offered frames quickly at least
// a few times, else 30 (Low Power Mode). (Not the average gap: when our frames are slow, the gaps
// grow too, and an average would learn our own slowness as "normal" and never brake. And not a
// single quick gap: one odd frame must not switch Low Power Mode to "struggling".)
const RHYTHM_60 = 1000 / 60, RHYTHM_30 = 1000 / 30;
// The heat guard for "Extra smooth" (60 fps): if 60 pictures a second can't be kept up for a few
// seconds (a warm iPhone slows itself down, and so does Low Power Mode), aim for 30 instead. After
// the phone has been cool for a while, try 60 again; each try that fails waits twice as long. A try
// only counts as working once it has held 60 for as long as we waited (a cooled phone keeps up for
// a few minutes before it warms up again; judging it on its first seconds would flip back and forth).
// 55, not lower: a phone that only manages 50-something has its graphics chip working flat out.
const GUARD_WINDOW = 4000, GUARD_MIN_FPS = 55, GUARD_FPS = 30;
const GUARD_RETRY = 5 * 60000, GUARD_RETRY_MAX = 40 * 60000;

export function makePacer(state, applySize) {
  state.lastRaf = 0;
  state.lastDraw = 0;
  state.rhythm = RHYTHM_60;
  state.quickGaps = 0; state.gaps = 0; state.windowT = 0;
  resetGuard(state);

  // Called every animation frame by the browser. Returns true if we should draw now.
  return function shouldRender(now) {
    if (state.paused) return false;
    const gap = now - state.lastRaf;
    state.lastRaf = now;
    if (gap > 4 && gap < 100) { state.gaps++; if (gap <= 25) state.quickGaps++; }
    if (now - state.windowT > 2000) {
      if (state.gaps) state.rhythm = state.quickGaps >= 3 ? RHYTHM_60 : RHYTHM_30; // Low Power Mode offers 30 a second
      state.quickGaps = state.gaps = 0;
      state.windowT = now;
    }
    // heat guard: measure only while 60 is wanted (not resting, not with a page open), and start the
    // count again after a gap (the app was hidden, or a hiccup) so that time isn't counted as slow
    const wants60 = state.preset.fps > GUARD_FPS && !state.idleFps;
    if (!wants60 || gap > 250) state.guardFrom = 0;
    if (wants60 && state.guard && now - state.guardT > state.guardWait && state.autoScale === 1 && state.slowFrames === 0) {
      state.guard = false; state.guardRetry = true; state.guardT = now; state.guardFrom = 0; // been cool for a while: try 60 again
    }
    const fps = state.idleFps || (state.guard ? GUARD_FPS : state.preset.fps);
    const interval = 1000 / fps;
    const since = now - state.lastRender;
    // the soonest a frame can really come on this rhythm: asking for 60 fps in Low Power Mode
    // (or 24 fps on a 30 Hz rhythm) is not the phone "struggling"
    const expected = Math.max(interval, Math.ceil((interval - 4) / state.rhythm) * state.rhythm);
    // small tolerance so a 60 Hz screen gives a steady "every other frame" rhythm
    if (since < interval - 4) return false;
    // Move the "last drawn" clock forward in whole steps so the rhythm stays even.
    if (since > interval * 3) state.lastRender = now;
    else state.lastRender += interval * Math.max(1, Math.floor((since + 4) / interval));
    // Adaptive resolution: if frames keep arriving late, draw fewer pixels. "Late" must be true by
    // the schedule AND by the real time since the last picture (the schedule can sit a little out of
    // step after a start, a page or a hiccup, and then on-time pictures would look late).
    const drawGap = now - state.lastDraw;
    state.lastDraw = now;
    if (since > expected * 1.45 && since < 400 && drawGap > expected * 1.15) state.slowFrames++;
    else state.slowFrames = Math.max(0, state.slowFrames - 0.25);
    // Cooled down? Judged by the real time between pictures.
    if (drawGap < expected * 1.15) state.fastFrames++;
    else state.fastFrames = Math.max(0, state.fastFrames - fps); // (one late picture costs a second of progress, not all of it)
    if (wants60 && !state.guard) {
      if (!state.guardFrom) { state.guardFrom = now; state.guardFrames = 0; }
      else state.guardFrames++;
      if (now - state.guardFrom >= GUARD_WINDOW) {
        const got = (state.guardFrames * 1000) / (now - state.guardFrom);
        if (got < GUARD_MIN_FPS) {
          if (state.guardRetry) state.guardWait = Math.min(state.guardWait * 2, GUARD_RETRY_MAX); // the try failed: wait longer
          state.guard = true; state.guardT = now; state.guardRetry = false;
        } else if (state.guardRetry && now - state.guardT > state.guardWait) {
          state.guardWait = GUARD_RETRY; state.guardRetry = false; // held 60 as long as we waited: it really worked
        }
        state.guardFrom = now; state.guardFrames = 0;
      }
    }
    if (state.slowFrames > fps * 2.5) {
      state.slowFrames = 0;
      if (state.autoScale > 0.62) {
        state.autoScale = Math.max(0.6, state.autoScale - 0.12);
        applySize();
      }
    } else if (state.fastFrames > fps * 40 && state.autoScale < 1) {
      // been smooth for a long while: carefully step back up
      state.fastFrames = 0;
      state.autoScale = Math.min(1, state.autoScale + 0.06);
      applySize();
    }
    return true;
  };
}

// Start the heat guard afresh (a new Graphics choice).
export function resetGuard(state) {
  state.guard = false; state.guardT = 0; state.guardWait = GUARD_RETRY; state.guardRetry = false;
  state.guardFrom = 0; state.guardFrames = 0;
}
