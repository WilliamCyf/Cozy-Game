// The renderer = the part that turns the 3D world into pixels.
// Heat control lives here:
//  * frame cap  - draw 30 pictures a second by default (half the work of 60)
//  * resolution - draw fewer pixels than the screen's maximum, and lower it
//                 automatically if the phone is struggling (it gets slower when hot)
import * as THREE from 'three';

export const QUALITY = {
  cool: { label: 'Cool & cozy (30 fps)', fps: 30, maxDpr: 2.0, minDpr: 1.0, outlines: true },
  smooth: { label: 'Extra smooth (60 fps)', fps: 60, maxDpr: 2.0, minDpr: 1.0, outlines: true },
  saver: { label: 'Battery saver', fps: 30, maxDpr: 1.35, minDpr: 0.9, outlines: false },
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'default',
    preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x1aa6c2, 1);
  renderer.info.autoReset = true;

  const state = {
    preset: QUALITY.cool,
    qualityName: 'cool',
    dpr: 1.5,
    autoScale: 1, // lowered automatically when frames get slow
    width: 1, height: 1,
    lastRender: 0,
    slowFrames: 0, fastFrames: 0,
    onResize: null,
    paused: false,
    idleFps: 0,
    lastRaf: 0, rafGap: 1000 / 60, // how often the phone offers to draw (30 times a second in Low Power Mode)
  };

  function applySize() {
    const w = Math.max(1, Math.floor(window.innerWidth)), h = Math.max(1, Math.floor(window.innerHeight));
    state.width = w;
    state.height = h;
    const native = window.devicePixelRatio || 1;
    const dpr = Math.max(state.preset.minDpr, Math.min(native, state.preset.maxDpr) * state.autoScale);
    state.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    state.onResize?.(w, h);
  }

  function setQuality(name) {
    state.qualityName = QUALITY[name] ? name : 'cool';
    state.preset = QUALITY[state.qualityName];
    state.autoScale = 1;
    state.slowFrames = state.fastFrames = 0;
    applySize();
  }

  // Called every animation frame by the browser. Returns true if we should draw now.
  function shouldRender(now) {
    if (state.paused) return false;
    const gap = now - state.lastRaf;
    state.lastRaf = now;
    if (gap > 4 && gap < 100) state.rafGap += (gap - state.rafGap) * 0.05;
    const fps = state.idleFps || state.preset.fps;
    const interval = 1000 / fps;
    const since = now - state.lastRender;
    // the soonest a frame can really come: the phone only offers frames every rafGap ms, so asking for
    // 60 fps in Low Power Mode (or 24 fps on a 30 Hz rhythm) is not the phone "struggling"
    const expected = Math.max(interval, Math.ceil((interval - 4) / state.rafGap) * state.rafGap);
    // small tolerance so a 60 Hz screen gives a steady "every other frame" rhythm
    if (since < interval - 4) return false;
    // Move the "last drawn" clock forward in whole steps so the rhythm stays even.
    if (since > interval * 3) state.lastRender = now;
    else state.lastRender += interval * Math.max(1, Math.floor((since + 4) / interval));
    // Adaptive resolution: if frames keep arriving late, draw fewer pixels.
    if (since > expected * 1.45 && since < 400) state.slowFrames++;
    else state.slowFrames = Math.max(0, state.slowFrames - 0.25);
    if (since < expected * 1.15) state.fastFrames++;
    else state.fastFrames = 0;
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
  }

  window.addEventListener('resize', () => applySize());
  window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
  applySize();
  return { renderer, state, applySize, setQuality, shouldRender };
}
