// The frame pacer: decides, every time the phone offers a frame, whether to draw it, and turns the
// "draw fewer pixels" heat brake on and off. Kept apart from three.js so tests/pacer.mjs can feed it
// pretend phone timings (a hot phone, Low Power Mode, a 120 Hz screen) and check what it does.
//
// The phone's own rhythm, judged every 2 seconds: 60 a second if it offered frames quickly at least
// a few times, else 30 (Low Power Mode). (Not the average gap: when our frames are slow, the gaps
// grow too, and an average would learn our own slowness as "normal" and never brake. And not a
// single quick gap: one odd frame must not switch Low Power Mode to "struggling".)
const RHYTHM_60 = 1000 / 60, RHYTHM_30 = 1000 / 30;

export function makePacer(state, applySize) {
  state.lastRaf = 0;
  state.lastDraw = 0;
  state.rhythm = RHYTHM_60;
  state.quickGaps = 0; state.gaps = 0; state.windowT = 0;

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
    const fps = state.idleFps || state.preset.fps;
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
    // Adaptive resolution: if frames keep arriving late, draw fewer pixels.
    if (since > expected * 1.45 && since < 400) state.slowFrames++;
    else state.slowFrames = Math.max(0, state.slowFrames - 0.25);
    // Cooled down? Judged by the real time between pictures (the schedule above can sit a little
    // out of step after a page was open).
    const drawGap = now - state.lastDraw;
    state.lastDraw = now;
    if (drawGap < expected * 1.15) state.fastFrames++;
    else state.fastFrames = Math.max(0, state.fastFrames - fps); // (one late picture costs a second of progress, not all of it)
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
