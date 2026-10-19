// Cozy Cove — app start-up and the main loop.
import './util/polyfills.js';
import './render/three-setup.js';
import * as THREE from 'three';
import { createRenderer } from './render/renderer.js';
import { CameraRig } from './render/camera.js';
import { U } from './render/materials.js';
import { buildWorld } from './world/world.js';
import { computeSpawnPoints } from './game/spawns.js';
import { Session, openIsland, isRealIsland, loadArchive, archiveIsland, takeFromArchive } from './game/session.js';
import { Game } from './game/game.js';
import { DayNight } from './game/daynight.js';
import { Character, SKIN_TONES, SHIRT_COLORS, ACCENT_COLORS, HAIR_COLORS } from './entities/character.js';
import { Audio } from './audio/audio.js';
import { Input } from './ui/input.js';
import { Screens } from './ui/screens.js';
import { loadIsland, saveIsland, SAVE_KEY } from './game/state.js';
import { clamp } from './util/math.js';
import * as L from './world/layout.js';
import { getLang, setLang, t, tr, hasThai, BUILD_ID } from './i18n/i18n.js';

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
// New phones start on "Extra smooth" (60 fps); its heat guard drops to 30 by itself when the phone
// can't keep up or warms up (see render/pacer.js).
const DEFAULT_SETTINGS = { quality: 'smooth', music: 0.6, sfx: 0.8, relaxedFishing: true, nameTags: true, showFps: false };
function loadSettings() {
  const saved = store.get('cozycove.settings', {});
  const s = { ...DEFAULT_SETTINGS, ...saved };
  // a phone that already played before 60 fps was the default keeps what it had (30 fps)
  if (!saved.quality && (profile.name || loadIsland())) s.quality = 'cool';
  if (params.get('quality')) s.quality = params.get('quality');
  if (params.has('fps')) s.showFps = true;
  s.lang = params.get('lang') || s.lang || getLang(); // first launch: follow the iPhone's language
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
  if (m && msg) m.textContent = hasThai(msg) ? msg : t(msg); // the world builder sends English messages
};

let R, rig, scene, world, spawns, audio, input, screens, game = null, titleDay;
let profile = loadProfile();
const settings = loadSettings();
let previewChar = null;

function fatal(msg) {
  window.__booted = true; // (we got far enough to explain the problem: the loading-screen check stays quiet)
  console.error(msg);
  const m = document.getElementById('boot-msg');
  if (m) m.innerHTML = msg;
  bootEl?.classList.remove('hide');
}

async function boot() {
  try {
    R = createRenderer(canvas);
  } catch (e) {
    fatal(t('Oh no — this phone couldn’t start the 3D graphics. Try closing other apps and opening Cozy Cove again.'));
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
  progress(0.97, t('Waking up the crabs…'));
  audio = new Audio();
  audio.setVolumes(settings.music, settings.sfx); // (music switched off in Settings stays off on the title screen too)
  input = new Input(canvas, uiRoot);
  titleDay = new DayNight(R.renderer);
  screens = new Screens(uiRoot, {
    getProfile: () => profile,
    saveProfile: (p) => { profile = p; store.set('cozycove.profile', p); },
    ownedHats: () => loadIsland()?.hats || [],
    onPlay: () => startPlay(),
    onNew: () => startNew(),
    onJoin: (code) => startJoin(code),
    onBack: (vid) => backTo(vid),
    back: () => { cancelStart(); if (!game) showTitle(); },
    audio,
    preview: (look) => setPreview(look),
    setLang: (id) => changeLang(id),
  });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    R.state.paused = true;
    game?.session?.save();
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
  window.__booted = true;
  try { sessionStorage.removeItem('cozycove.bootRetry'); } catch { /* ignore */ } // the game started fine
  // came back after an update/reload while playing? jump straight back in
  const resume = (() => { try { return JSON.parse(sessionStorage.getItem('cozycove.resume') || 'null'); } catch { return null; } })();
  const auto = params.get('autostart');
  if (auto === 'new') startNew();
  else if (auto === 'host' || resume?.mode === 'play' || resume?.mode === 'host') { keepOldIsland(); startPlay(); }
  else if (params.get('join') || (resume?.mode === 'guest' && resume.code)) startJoin(params.get('join') || resume.code); // (a visitor from before this update: back to the family)
  else if (firstVisit) screens.langChooser((id) => changeLang(id)); // very first time: pick a language
  else oldIslandCheck(() => showTitle());
  if (justUpdated) setTimeout(() => (game ? game.ui.toast(t('Cozy Cove was updated to the newest version!'), '✨', 3200) : screens.flash(t('✨ Updated to the newest version!'))), game ? 4500 : 900);
}

// Brand-new phone (never played, never chose a language)? Then the first screen asks for the
// language in both languages, so a Thai reader on an English iPhone can still find Thai.
const firstVisit = !store.get('cozycove.settings', {}).lang && !profile.name && !loadIsland() && !params.has('lang');
// Did this phone just get a new version? (we say so, so everyone knows the update worked)
const justUpdated = (() => {
  const before = store.get('cozycove.build', null);
  store.set('cozycove.build', BUILD_ID);
  return !!before && before !== BUILD_ID;
})();

// Switch language (title screen, menu or Settings). It happens instantly: every label on screen is
// rewritten in place. No reload, so nobody on the island gets disconnected.
function changeLang(id) {
  settings.lang = id;
  store.set('cozycove.settings', settings);
  setLang(id);
  if (game) game.relabel();
  else showTitle();
}
window.__changeLang = changeLang; // used by the Settings panel and the menu

function showTitle() {
  if (game) return; // (a late tap from the title screen while the game is starting)
  if (updateWaiting) { applyUpdate(); return; } // a new version arrived while on another screen
  const saved = loadIsland();
  const prev = loadArchive()[0]; // (the island this phone moved away from last: "Back to …")
  screens.title({
    island: saved ? { day: saved.day, fish: Object.keys(saved.journal || {}).length, name: saved.name } : null,
    back: prev && prev.vx.vid !== saved?.vx?.vid ? { vid: prev.vx.vid, name: prev.name, day: prev.day } : null,
  });
}

// ---------------------------------------------------------------- islands from before family islands
// Until now one phone kept the island and the others visited it. Now every family member's phone keeps
// a copy. The first time this version starts on a phone with an island from before, it asks (once)
// whether that is the family's island. One opened just once by accident goes into the archive quietly.
const removeIsland = () => { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY + '.bak'); } catch { /* ignore */ } };
function oldIslandCheck(then) {
  const saved = loadIsland();
  if (!saved || saved.vx) { then(); return; }
  const s = openIsland(world); // (with its family books now: the same island id on every copy of it)
  if (!isRealIsland(s)) {
    if (archiveIsland(s)) removeIsland();
    then();
    return;
  }
  screens.familyChoice({ name: s.name, day: s.day, fish: Object.keys(s.journal || {}).length }, {
    ours: () => { saveIsland(s, 'both'); then(); },
    join: () => {
      if (!archiveIsland(s)) { screens.flash(t('This phone is out of space, so the island couldn’t be saved. Free up some space on the iPhone.')); return; }
      removeIsland();
      screens.ensureProfile(() => screens.join());
    },
  });
}
// (it was being played when the game updated itself: it's this family's island, no need to ask)
function keepOldIsland() {
  const saved = loadIsland();
  if (saved && !saved.vx) saveIsland(openIsland(world), 'both');
}

// A character standing on the deck so you can see your look on the title screen
function setPreview(look) {
  if (game) return;
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
  if (game) { session.leave(); return; } // only ever one game at a time
  screens.hide();
  if (previewChar) { previewChar.dispose(); previewChar = null; }
  game = new Game({ R, rig, scene, world, spawns, session, profile, settings, audio, input, uiRoot,
    saveProfileFn: (p) => { profile = p; store.set('cozycove.profile', p); },
    saveSettingsFn: (s) => store.set('cozycove.settings', s) });
  rig.setZoom(1);
  try { sessionStorage.setItem('cozycove.resume', JSON.stringify({ mode: 'play' })); } catch { /* ignore */ }
  window.__game = game;
  if (updateWaiting) game.ui.updateReady(() => applyUpdate()); // a new version arrived before the game started
}
// Only ever ONE game at a time, however many times a button is tapped. Each start gets a ticket
// number (like at a deli counter); a join that finishes late, after Cancel or after another start,
// sees its ticket is out of date and quietly stops.
let ticket = 0, joining = false, pendingJoin = null, pendingPeek = null;
// "Play": this phone's copy of the family island, straight away (the family is found meanwhile)
function startPlay(opts) {
  if (game) return;
  cancelStart();
  const session = makeSession();
  session.play(opts);
  startGame(session);
  navigator.storage?.persist?.().catch(() => {}); // ask the phone to keep the island safe when space runs low
}
function startNew() {
  if (game) return;
  cancelStart();
  const session = makeSession();
  session.startNew();
  startGame(session);
  navigator.storage?.persist?.().catch(() => {});
}
function cancelStart() {
  ticket++; joining = false;
  pendingJoin?.cancel(); // a join still on its way stops (and never says hello to the leading phone)
  pendingJoin = null;
  pendingPeek?.abort();
  pendingPeek = null;
  if (!game) { try { sessionStorage.removeItem('cozycove.resume'); } catch { /* ignore */ } } // (no jumping back in after a reload)
}
// what went wrong while joining, in this phone's language
function joinError(e) {
  if (e?.kick?.msg) return tr(e.kick.msg); // (a "no" from the leading phone: English, or a message object)
  if (e?.why === 'noanswer') return t('That phone didn’t answer. Make sure both phones have the newest version of Cozy Cove.');
  if (e?.why === 'nospace') return t('This phone is out of space, so the island couldn’t be saved. Free up some space on the iPhone.');
  return t('Couldn’t find that island. Check the code, and make sure Cozy Cove is open on a family member’s phone (same Wi-Fi works best).');
}
// "Join your family": first a look at the island (nothing changes yet), then join it.
async function startJoin(code) {
  if (game || joining) return;
  cancelStart();
  joining = true;
  const mine = ticket;
  screens.connecting(code);
  const abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
  pendingPeek = abort;
  let info;
  try {
    info = await Session.peek(code, abort?.signal);
  } catch (e) {
    if (mine !== ticket || game) return;
    joining = false;
    pendingPeek = null;
    screens.join(code, joinError(e));
    if (e?.why === 'version' || e?.why === 'noanswer') checkForUpdate(true); // maybe this phone is the old one: fetch the new version
    return;
  }
  if (mine !== ticket || game) { info.link.close(); return; }
  pendingPeek = null;
  const here = openIsland(world);
  if (here && here.vx.vid === info.vid) { info.link.close(); joining = false; startPlay(); return; } // it is this phone's family island already
  if (here && isRealIsland(here)) { // moving to another family: ask first (this island is kept safe)
    joining = false;
    screens.moveCard(info, { name: here.name, day: here.day }, { move: () => joinNow(code, here, info.link), stay: () => { info.link.close(); showTitle(); } });
    return;
  }
  joining = false;
  joinNow(code, here, info.link);
}
async function joinNow(code, old, peeked = null) {
  if (game || joining) return;
  joining = true;
  const mine = ++ticket;
  screens.connecting(code);
  const session = makeSession();
  pendingJoin = session;
  try {
    await session.joinFamily(code, old, peeked);
    if (pendingJoin === session) pendingJoin = null;
    if (params.has('debug') && window.__slowJoin) await new Promise((r) => setTimeout(r, window.__slowJoin)); // (tests only: a slow phone)
    if (mine !== ticket || game) { session.leave(); return; }
    joining = false;
    startGame(session);
  } catch (e) {
    if (pendingJoin === session) pendingJoin = null;
    if (mine !== ticket || game) return;
    joining = false;
    try { sessionStorage.removeItem('cozycove.resume'); } catch { /* ignore */ }
    screens.join(code, joinError(e));
    if (e?.kick?.why === 'version') checkForUpdate(true);
  }
}
// "↩️ Back to …": the island this phone moved away from becomes this phone's island again (the one it
// has now goes into the archive in its place), and it is merged with the family's copy when they meet.
function backTo(vid) {
  if (game) return;
  const s = takeFromArchive(vid);
  if (!s) { showTitle(); return; }
  const here = openIsland(world);
  if ((here && here.vx.vid !== vid && !archiveIsland(here)) || !saveIsland(s, 'both')) {
    archiveIsland(s); // (put it back: nothing is lost)
    screens.flash(t('This phone is out of space, so the island couldn’t be saved. Free up some space on the iPhone.'));
    return;
  }
  startPlay({ freshColumn: true });
}

// ---------------------------------------------------------------- the loop
let last = performance.now();
let titleT = 0;
// the title screen draws slower when nobody has touched it for half a minute (cooler phone)
let titleTouch = performance.now();
const touched = () => { titleTouch = performance.now(); };
addEventListener('pointerdown', touched, { capture: true, passive: true });
addEventListener('keydown', touched, { capture: true, passive: true });
// ?perf: measure how many milliseconds each frame's work takes (game logic vs. preparing the drawing)
const perf = params.has('perf') ? { n: 0, update: 0, render: 0, maxUpdate: 0 } : null;
if (perf) window.__perf = perf;
function loop(now) {
  requestAnimationFrame(loop);
  if (!R.shouldRender(now)) return;
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  try {
    if (game) {
      const t0 = performance.now();
      game.update(dt, now);
      const t1 = performance.now();
      game.render();
      if (perf) {
        const t2 = performance.now();
        perf.n++; perf.update += t1 - t0; perf.render += t2 - t1;
        perf.maxUpdate = Math.max(perf.maxUpdate, t1 - t0);
      }
    } else {
      // title screen: drift the camera gently over the island
      titleT += dt;
      U.uTime.value = titleT % 1000;
      R.state.idleFps = now - titleTouch > 30000 ? 12 : 0;
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
      game?.session?.hide(); // (saves; a leading phone lets the family take over)
      input.reset();
    } else {
      R.state.paused = false;
      last = performance.now();
      game?.session?.show();
      if (game) game.lastTouch = performance.now();
    }
  });
  window.addEventListener('pagehide', () => game?.session?.hide());
}

// ---------------------------------------------------------------- updates
// The service worker keeps a copy of the game on the phone. When a new version is published,
// the phone fetches it in the background, then we switch to it at a good moment:
// straight away when nobody is playing, or when the player taps "Update" during a game.
let swReg = null, lastUpdateCheck = 0, updateWaiting = false;
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  if (params.has('nosw')) return;
  let hadCopy = !!navigator.serviceWorker.controller; // no copy yet = very first visit, nothing to update
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => { swReg = reg; }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadCopy) newVersionReady();
    hadCopy = true; // (the first visit's own copy has arrived: the NEXT change is a real update)
  });
  // iPhones keep the app paused in the background instead of restarting it, so look for a new
  // version every time the game comes back on screen (one tiny file, at most once a minute)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
}
function checkForUpdate(force = false) {
  const now = Date.now();
  if (!swReg || (!force && now - lastUpdateCheck < 60000)) return Promise.resolve(swReg);
  lastUpdateCheck = now;
  return swReg.update().then(() => swReg, () => swReg);
}
window.__checkForUpdate = checkForUpdate;
async function newVersionReady() {
  if (updateWaiting) return;
  // Already running the newest copy? (happens when the page itself loaded the new version first)
  const files = await askCopyForFiles();
  const me = document.querySelector('script[type="module"][src*="app."]')?.getAttribute('src');
  if (files && me && ('./' + me.replace(/^\.\//, '')) in files) return;
  if (updateWaiting) return;
  updateWaiting = true;
  if (game) game.ui.updateReady(() => applyUpdate()); // playing: a little "Update" button
  else if (!screens?.kind || screens.kind === 'title') applyUpdate(); // on the title: switch now
  // (on any other screen, e.g. typing a name or an island code, it waits for the title or the game)
}
// Ask the phone's (new) copy which files it holds. Old copies don't answer: then we can't tell.
function askCopyForFiles() {
  return new Promise((resolve) => {
    const copy = navigator.serviceWorker.controller;
    if (!copy || typeof MessageChannel === 'undefined') { resolve(null); return; }
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data && typeof e.data === 'object' ? e.data : null); };
    try { copy.postMessage('which-files', [ch.port2]); } catch { clearTimeout(timer); resolve(null); }
  });
}
function applyUpdate() {
  game?.session?.leave(); // (saves; a leading phone lets the family take over while this one restarts)
  // (the resume note in sessionStorage brings a player straight back into their game)
  location.reload();
}
window.__applyUpdate = applyUpdate;

boot();
