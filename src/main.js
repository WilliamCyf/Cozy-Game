// Cozy Cove — app start-up and the main loop.
import './render/three-setup.js';
import * as THREE from 'three';
import { createRenderer } from './render/renderer.js';
import { CameraRig } from './render/camera.js';
import { U } from './render/materials.js';
import { buildWorld } from './world/world.js';
import { computeSpawnPoints } from './game/spawns.js';
import { Session } from './game/session.js';
import { Game } from './game/game.js';
import { DayNight } from './game/daynight.js';
import { Character, SKIN_TONES, SHIRT_COLORS, ACCENT_COLORS, HAIR_COLORS } from './entities/character.js';
import { Audio } from './audio/audio.js';
import { Input } from './ui/input.js';
import { Screens } from './ui/screens.js';
import { loadIsland } from './game/state.js';
import { clamp } from './util/math.js';
import * as L from './world/layout.js';

const params = new URLSearchParams(location.search);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

// ---------------------------------------------------------------- profile & settings (saved on this phone)
function loadProfile() {
  let p = store.get('cozycove.profile', null);
  if (!p || !p.id) {
    p = {
      id: 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      name: '',
      look: { skin: pick(SKIN_TONES), shirt: pick(SHIRT_COLORS), accent: pick(ACCENT_COLORS), hair: pick(HAIR_COLORS), hat: 'straw' },
      tut: {},
    };
    store.set('cozycove.profile', p);
  }
  if (params.get('name')) p.name = params.get('name');
  if (params.has('notut')) p.tut = { moved: 1, fished: 1, board: 1, planted: 1 };
  return p;
}
const DEFAULT_SETTINGS = { quality: 'cool', music: 0.6, sfx: 0.8, relaxedFishing: true, nameTags: true, showFps: false };
function loadSettings() {
  const s = { ...DEFAULT_SETTINGS, ...store.get('cozycove.settings', {}) };
  if (params.get('quality')) s.quality = params.get('quality');
  if (params.has('fps')) s.showFps = true;
  return s;
}

// ---------------------------------------------------------------- boot
const canvas = document.getElementById('gl');
const uiRoot = document.getElementById('ui');
const bootEl = document.getElementById('boot');
const progress = (p, msg) => {
  const fill = document.getElementById('boot-fill');
  if (fill) fill.style.width = `${Math.round(p * 100)}%`;
  const m = document.getElementById('boot-msg');
  if (m && msg) m.textContent = msg;
};

let R, rig, scene, world, spawns, audio, input, screens, game = null, titleDay;
let profile = loadProfile();
const settings = loadSettings();
let previewChar = null;

function fatal(msg) {
  console.error(msg);
  const m = document.getElementById('boot-msg');
  if (m) m.innerHTML = msg;
  bootEl?.classList.remove('hide');
}

async function boot() {
  try {
    R = createRenderer(canvas);
  } catch (e) {
    fatal('Oh no — this phone couldn’t start the 3D graphics. Try closing other apps and opening Cozy Cove again.');
    return;
  }
  R.setQuality(settings.quality);
  rig = new CameraRig();
  scene = new THREE.Scene();
  R.state.onResize = (w, h) => {
    rig.resize(w, h);
    U.uPointScale.value = h * R.state.dpr * rig.camera.projectionMatrix.elements[5] * 0.5;
  };
  R.applySize();
  world = await buildWorld(scene, progress);
  spawns = computeSpawnPoints(world.terrain, world.walk);
  progress(0.97, 'Waking up the crabs…');
  audio = new Audio();
  input = new Input(canvas, uiRoot);
  titleDay = new DayNight(R.renderer);
  screens = new Screens(uiRoot, {
    getProfile: () => profile,
    saveProfile: (p) => { profile = p; store.set('cozycove.profile', p); },
    ownedHats: () => loadIsland()?.hats || [],
    onHost: () => startHost(),
    onJoin: (code) => startJoin(code),
    back: () => { cancelJoin = true; showTitle(); },
    audio,
    preview: (look) => setPreview(look),
  });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    R.state.paused = true;
    if (game?.session?.isHost) game.session.save();
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  setupLifecycle();
  registerSW();
  requestAnimationFrame(loop);
  // first frames compile the shaders; then reveal
  setTimeout(() => {
    bootEl.classList.add('hide');
    setTimeout(() => bootEl.remove(), 600);
  }, 250);
  // came back after an update/reload while playing? jump straight back in
  const resume = (() => { try { return JSON.parse(sessionStorage.getItem('cozycove.resume') || 'null'); } catch { return null; } })();
  const auto = params.get('autostart');
  if (auto === 'host' || resume?.mode === 'host') startHost();
  else if (params.get('join') || resume?.mode === 'guest') { const code = params.get('join') || resume.code; screens.connecting(code); startJoin(code); }
  else showTitle();
}

function showTitle() {
  const saved = loadIsland();
  screens.title(saved ? { day: saved.day, fish: Object.keys(saved.journal || {}).length } : null);
}

// A character standing on the deck so you can see your look on the title screen
function setPreview(look) {
  if (!look) { previewChar?.setVisible(false); return; }
  if (!previewChar) previewChar = new Character(look, scene);
  else previewChar.setLook(look);
  previewChar.setVisible(true);
  previewChar.x = 1.5; previewChar.z = 33.8; previewChar.y = L.COTTAGE.deck.y; previewChar.heading = 0.25;
  previewChar.play('wave');
}

// ---------------------------------------------------------------- start playing
function makeSession() {
  return new Session({ world, spawns, profile, debug: params.has('debug') });
}
function startGame(session) {
  screens.hide();
  if (previewChar) { previewChar.dispose(); previewChar = null; }
  game = new Game({ R, rig, scene, world, spawns, session, profile, settings, audio, input, uiRoot,
    saveProfileFn: (p) => { profile = p; store.set('cozycove.profile', p); },
    saveSettingsFn: (s) => store.set('cozycove.settings', s) });
  rig.setZoom(1);
  try { sessionStorage.setItem('cozycove.resume', JSON.stringify({ mode: session.role, code: session.code })); } catch { /* ignore */ }
  window.__game = game;
}
function startHost() {
  const session = makeSession();
  session.startHost();
  startGame(session);
}
let cancelJoin = false;
async function startJoin(code) {
  cancelJoin = false;
  const session = makeSession();
  try {
    await session.join(code);
    if (cancelJoin) { session.leave(); return; }
    startGame(session);
  } catch (e) {
    if (cancelJoin) return;
    try { sessionStorage.removeItem('cozycove.resume'); } catch { /* ignore */ }
    const msg = e?.kick?.msg || 'Couldn’t find that island. Check the code, and make sure Cozy Cove is open on the host’s phone (same Wi-Fi works best).';
    screens.join(code, msg);
  }
}

// ---------------------------------------------------------------- the loop
let last = performance.now();
let titleT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!R.shouldRender(now)) return;
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  try {
    if (game) {
      game.update(dt, now);
      game.render();
    } else {
      // title screen: drift the camera gently over the island
      titleT += dt;
      U.uTime.value = titleT % 1000;
      titleDay.update(dt, 9.2, false);
      if (previewChar?.mesh.visible) {
        previewChar.update(dt);
        rig.setZoom(1.6);
        // aim a little "below" the character so it shows above the editor card
        const portrait = window.innerHeight > window.innerWidth;
        rig.update(dt, previewChar.x + (portrait ? 0 : 3), previewChar.y, previewChar.z + (portrait ? 3.2 : 0.8));
      } else {
        rig.setZoom(0.85);
        rig.update(dt, Math.sin(titleT * 0.05) * 6 + 2, 0.8, 26 + Math.cos(titleT * 0.04) * 4);
      }
      R.renderer.render(scene, rig.camera);
    }
  } catch (e) {
    console.error(e);
  }
}

// ---------------------------------------------------------------- phone life: sleep, wake, close
function setupLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      R.state.paused = true;
      if (game?.session?.isHost) game.session.save();
      input.reset();
    } else {
      R.state.paused = false;
      last = performance.now();
      game?.session?.wake();
      if (game) game.lastTouch = performance.now();
    }
  });
  window.addEventListener('pagehide', () => { if (game?.session?.isHost) game.session.save(); });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  if (params.has('nosw')) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();
