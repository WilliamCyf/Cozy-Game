// The renderer = the part that turns the 3D world into pixels.
// Heat control lives here:
//  * frame cap  - draw 30 pictures a second by default (half the work of 60)
//  * resolution - draw fewer pixels than the screen's maximum, and lower it
//                 automatically if the phone is struggling (it gets slower when hot)
import * as THREE from 'three';
import { makePacer } from './pacer.js';
import { QUALITY } from './quality.js';

export { QUALITY }; // (the Graphics choices live in quality.js)

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

  const shouldRender = makePacer(state, () => applySize()); // (when to draw, and the heat brake: see pacer.js)

  window.addEventListener('resize', () => applySize());
  window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
  applySize();
  return { renderer, state, applySize, setQuality, shouldRender };
}
