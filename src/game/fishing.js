// Fishing! Hold the button to wind up, let go to cast, wait for a bite, tap to hook,
// then HOLD to reel — but let go when the fish splashes (pulls) or the line snaps.
import * as THREE from 'three';
import { MeshBuilder, blob, box, cylinder, prism, M, hex } from '../render/geo.js';
import { FISH, FISH_BY_ID, RARITY, HOOK_EXTRAS } from './data.js';
import { clamp, lerp, weightedPick } from '../util/math.js';
import { POND_LEVEL, ISLET_CENTER } from '../world/layout.js';

export const FS = { NONE: 0, CHARGE: 1, FLY: 2, WAIT: 3, BITE: 4, REEL: 5, LANDED: 6 };
const MAXLINES = 4;
const SEG = 14;

export function timeOk(t, hour, raining) {
  const day = hour >= 6 && hour < 19;
  switch (t) {
    case 'day': return day;
    case 'night': return !day;
    case 'dawn': return hour >= 5 && hour < 8;
    case 'dusk': return (hour >= 17 && hour < 20) || (hour >= 5 && hour < 7);
    case 'rain': return raining || !day;
    default: return true;
  }
}

export class Fishing {
  constructor(ctx) {
    this.ctx = ctx; // {scene, world, players, session, fx, audio, ui, critters, settings}
    this.state = FS.NONE;
    this.t = 0;
    this.power = 0;
    this.dir = 0;
    this.target = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.bob = new THREE.Vector3();
    this.level = 0;
    this.fish = null;
    this.bait = 'worm';
    this.mg = { p: 0, tension: 0, pulling: false, holding: false, hint: '' };
    this.holding = false;
    this.biteT = 0;
    this.nibbles = [];
    this.missCount = 0;

    // fishing lines for everyone (one draw call)
    const lineGeo = new THREE.BufferGeometry();
    this.linePos = new Float32Array(MAXLINES * SEG * 2 * 3);
    this.lineCol = new Float32Array(MAXLINES * SEG * 2 * 3);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(this.lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 20;
    ctx.scene.add(this.lines);
    // bobbers
    const bb = new MeshBuilder();
    bb.add(blob(0.11, 1, 0, 1, 1), M(0, 0, 0), hex('#ffffff'), { recv: 0, outline: false });
    bb.add(blob(0.115, 1, 0, 2, 0.6), M(0, 0.04, 0), hex('#e8473a'), { recv: 0, outline: false });
    bb.add(box(0.025, 0.14, 0.025), M(0, 0.15, 0), hex('#e8473a'), { recv: 0, outline: false });
    this.bobbers = new THREE.InstancedMesh(bb.toGeometry(), ctx.world.propMat, MAXLINES);
    this.bobbers.frustumCulled = false;
    this.bobbers.count = 0;
    this.bobbers.renderOrder = 21;
    ctx.scene.add(this.bobbers);
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._tip = new THREE.Vector3();
    // the fish that flies out of the water when caught
    this.caughtMesh = new THREE.Mesh(new THREE.BufferGeometry(), ctx.world.propMat);
    this.caughtMesh.visible = false;
    this.caughtMesh.frustumCulled = false;
    ctx.scene.add(this.caughtMesh);
    this.caughtGeo = new Map();
    this.remoteBob = new Map();
  }

  get local() { return this.ctx.players.local; }
  get active() { return this.state !== FS.NONE; }

  // Is there water to fish in, near where the player is looking? Returns the direction.
  findWater(L = this.local) {
    const walk = this.ctx.world.walk;
    const test = (ang) => {
      for (const d of [1.6, 2.6, 3.6]) {
        const x = L.x + Math.sin(ang) * d, z = L.z + Math.cos(ang) * d;
        if (walk.waterDepth(x, z) > 0.35) return true;
      }
      return false;
    };
    if (test(L.heading)) return L.heading;
    let best = null, bestD = 9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (!test(a)) continue;
      const diff = Math.abs(Math.atan2(Math.sin(a - L.heading), Math.cos(a - L.heading)));
      if (diff < bestD) { bestD = diff; best = a; }
    }
    return best;
  }

  habitatAt(x, z) {
    const walk = this.ctx.world.walk;
    if (walk.waterLevelAt(x, z) === POND_LEVEL) return 'pond';
    const di = Math.hypot(x - ISLET_CENTER.x, z - ISLET_CENTER.z);
    if (di > 7 && di < 13.5) return 'reef';
    return walk.waterDepth(x, z) > 2.3 ? 'deep' : 'shore';
  }

  // Choose what will bite (depends on where, when, the weather and the bait)
  chooseFish(hab) {
    const st = this.ctx.session.state;
    const hour = st.time, raining = st.weather === 'rain';
    const bait = this.bait;
    for (const ex of HOOK_EXTRAS) {
      let ch = ex.chance;
      if (ex.id === 'chest' && bait === 'lure') ch *= 2;
      if (ex.id === 'seaglass' && hab === 'pond') ch *= 0.3;
      if (Math.random() < ch) return { extra: ex.id };
    }
    if (Math.random() < (hab === 'pond' ? 0.05 : 0.07)) return { fish: 'boot' };
    const lighthouse = st.projects.lighthouse?.done;
    const cands = FISH.filter((f) => !f.junk && f.hab.includes(hab) && timeOk(f.time, hour, raining));
    const mods = {
      worm: {}, bread: {},
      shrimp: { uncommon: 1.4, rare: 2.0, legendary: 1.5 },
      lure: { uncommon: 1.2, rare: 2.5, legendary: 4.5 },
    }[bait] || {};
    const f = weightedPick(cands, (c) => {
      let w = RARITY[c.rar].weight * (mods[c.rar] || 1);
      if (!st.journal[c.id]) w *= 1.6; // new species show up a bit more often
      if (lighthouse && c.time === 'night') w *= 1.4;
      return w;
    });
    return { fish: f?.id || 'sardine' };
  }

  // ---------------------------------------------------------------- button
  press() {
    const L = this.local;
    this.holding = true;
    switch (this.state) {
      case FS.NONE: {
        const dir = this.findWater(L);
        if (dir === null) return false;
        this.dir = dir;
        L.heading = dir;
        L.emote = null;
        this.state = FS.CHARGE;
        this.t = 0;
        L.char.play('charge');
        this.ctx.audio?.ui('tick');
        return true;
      }
      case FS.WAIT:
        this.ctx.ui?.toast('Reeled in. Try another spot!', '🎣', 1600);
        this.stop();
        return true;
      case FS.BITE:
        this.startReel();
        return true;
      default:
        return true;
    }
  }

  release() {
    this.holding = false;
    if (this.state === FS.CHARGE) this.cast();
  }

  cast() {
    const L = this.local;
    const walk = this.ctx.world.walk;
    const dist = 2.4 + this.power * 6.2;
    // land on water: walk back from the far point until we find some
    let tx = null, tz = null;
    for (let d = dist; d >= 1.4; d -= 0.25) {
      const x = L.x + Math.sin(this.dir) * d, z = L.z + Math.cos(this.dir) * d;
      if (walk.waterDepth(x, z) > 0.3) { tx = x; tz = z; break; }
    }
    if (tx === null) {
      this.ctx.ui?.toast('Too close to land — face the water!', '🙈', 1800);
      this.stop();
      return;
    }
    this.level = walk.waterLevelAt(tx, tz);
    this.target.set(tx, this.level, tz);
    L.char.update(0);
    L.char.rodTip(this.from);
    this.state = FS.FLY;
    this.t = 0;
    L.char.play('cast');
    this.ctx.audio?.cast();
  }

  landed() {
    const L = this.local;
    this.state = FS.WAIT;
    this.t = 0;
    this.ctx.fx.splash(this.target.x, this.level, this.target.z, 0.6);
    this.ctx.audio?.plop();
    this.hab = this.habitatAt(this.target.x, this.target.z);
    this.fish = this.chooseFish(this.hab);
    const speed = this.bait === 'bread' ? 0.65 : 1;
    this.biteT = (2.2 + Math.random() * 4.5) * speed;
    this.nibbles = [];
    const n = Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.nibbles.push(this.biteT * (0.35 + Math.random() * 0.5));
    // sit down if fishing from the sand, like a lazy beach day
    L.sitting = this.ctx.world.walk.flag(L.x, L.z) === 1;
    L.char.play('fish');
    this.ctx.critters?.attract(this.target.x, this.target.z, this.level, this.biteT);
  }

  bite() {
    this.state = FS.BITE;
    this.t = 0;
    this.ctx.fx.splash(this.target.x, this.level, this.target.z, 0.8);
    this.ctx.audio?.bite();
    this.ctx.ui?.biteAlert(true);
  }

  startReel() {
    const f = this.fish;
    const rar = f.extra ? 'junk' : FISH_BY_ID[f.fish].rar;
    const relaxed = this.ctx.settings?.relaxedFishing !== false;
    this.state = FS.REEL;
    this.t = 0;
    this.mg = { p: 0.2, tension: 0, pulling: false, holding: true, phaseT: 0.6 + Math.random() * 0.6, diff: RARITY[rar].diff * (relaxed ? 0.82 : 1.05), hint: 'Hold to reel!' };
    this.ctx.ui?.biteAlert(false);
    this.local.char.play('reel');
    this.ctx.audio?.hook();
  }

  stop() {
    const L = this.local;
    this.state = FS.NONE;
    this.holding = false;
    L.fishState = 0;
    L.sitting = false;
    L.char.play('idle');
    this.ctx.ui?.biteAlert(false);
    this.ctx.critters?.release();
  }

  async caught() {
    const L = this.local;
    this.state = FS.LANDED;
    this.t = 0;
    const f = this.fish;
    const size = f.fish ? Math.round(lerp(FISH_BY_ID[f.fish].size[0], FISH_BY_ID[f.fish].size[1], Math.random() ** 1.6)) : 0;
    this.ctx.fx.splash(this.bob.x, this.level, this.bob.z, 1.2);
    this.ctx.audio?.catchJingle(f.fish ? FISH_BY_ID[f.fish].rar : 'junk');
    this.showCaughtFish(f.fish || null);
    L.sitting = false;
    L.char.play('cheer');
    this.ctx.critters?.release(true);
    const res = await this.ctx.session.request({ a: 'catch', fish: f.fish, extra: f.extra, size, bait: this.bait });
    this.ctx.ui?.showCatch({ ...f, size, res, by: 'me' });
    if (['shrimp', 'lure'].includes(this.bait) && (this.ctx.session.state.basket[this.bait] || 0) <= 0) this.bait = 'worm';
  }

  escaped(msg) {
    this.ctx.ui?.toast(msg, '🐟', 2200);
    this.ctx.audio?.escape();
    this.ctx.fx.splash(this.bob.x, this.level, this.bob.z, 0.7);
    this.stop();
  }

  showCaughtFish(id) {
    let g = this.caughtGeo.get(id || 'extra');
    if (!g) {
      const b = new MeshBuilder();
      if (id) {
        const a = FISH_BY_ID[id].art;
        const big = Math.min(1.6, 0.6 + FISH_BY_ID[id].size[1] / 120);
        b.add(blob(0.22 * big, 1, 0, 1, 0.55), M(0, 0, 0, 0, 0, 0, 0.6, 1, 1.6), hex(a.body), { recv: 0, outline: false });
        b.add(blob(0.2 * big, 1, 0, 2, 0.4), M(0, -0.04 * big, 0.04, 0, 0, 0, 0.55, 1, 1.4), hex(a.belly), { recv: 0, outline: false });
        b.add(prism(0.36 * big, 0.3 * big, 0.06), M(0, 0, -0.33 * big, 0, -Math.PI / 2), hex(a.fin), { recv: 0, outline: false });
        b.add(blob(0.035 * big + 0.01, 0, 0, 3), M(0.09 * big, 0.04 * big, 0.2 * big), hex('#222222'), { recv: 0, outline: false });
        b.add(blob(0.035 * big + 0.01, 0, 0, 3), M(-0.09 * big, 0.04 * big, 0.2 * big), hex('#222222'), { recv: 0, outline: false });
      } else {
        b.add(cylinder(0.12, 0.12, 0.4, 8, { top: true, bottom: true }), M(0, -0.2, 0), hex('#9ad8c8'), { recv: 0, outline: false, glow: 0.6 });
      }
      g = b.toGeometry();
      this.caughtGeo.set(id || 'extra', g);
    }
    this.caughtMesh.geometry = g;
    this.caughtMesh.visible = true;
  }

  // ---------------------------------------------------------------- every frame
  update(dt, input) {
    const L = this.local;
    const st = this.state;
    this.t += dt;
    if (st === FS.CHARGE) {
      // power swings back and forth — let go at the right moment for a long cast
      const k = (this.t / 1.0) % 2;
      this.power = k < 1 ? k : 2 - k;
      if (!this.holding) this.cast();
    } else if (st === FS.FLY) {
      const k = Math.min(1, this.t / 0.55);
      this.bob.lerpVectors(this.from, this.target, k);
      this.bob.y += Math.sin(k * Math.PI) * 2.2;
      if (k >= 1) this.landed();
    } else if (st === FS.WAIT) {
      if (input && input.mag > 0.6) { this.stop(); return; }
      let dip = 0;
      for (const nt of this.nibbles) if (this.t > nt && this.t < nt + 0.25) dip = 0.07;
      if (this.nibbles.length && this.t > this.nibbles[0] + 0.25) { this.nibbles.shift(); this.ctx.audio?.nibble(); this.ctx.fx.ripple(this.target.x, this.level, this.target.z, 0.5); }
      this.bob.set(this.target.x, this.level + Math.sin(this.t * 2.6) * 0.03 - dip, this.target.z);
      if (this.t >= this.biteT) this.bite();
    } else if (st === FS.BITE) {
      this.bob.set(this.target.x + Math.sin(this.t * 40) * 0.03, this.level - 0.16, this.target.z);
      const window = 1.25 + (this.ctx.settings?.relaxedFishing !== false ? 0.35 : 0);
      if (this.t > window) {
        this.missCount++;
        this.ctx.ui?.biteAlert(false);
        if (Math.random() < 0.6) {
          // it nibbled the bait and swam off, but another one might come…
          this.state = FS.WAIT;
          this.t = 0;
          this.biteT = 1.8 + Math.random() * 3;
          this.nibbles = [];
          this.ctx.ui?.toast('Too slow! Tap "Hook it!" when the bobber dips.', '💦', 2200);
        } else this.escaped('It swam away… try again!');
      }
    } else if (st === FS.REEL) {
      this.updateReel(dt);
    } else if (st === FS.LANDED) {
      const k = Math.min(1, this.t / 0.6);
      const head = L.char.headPos(this._v);
      const p = this.caughtMesh.position;
      if (k < 1) {
        p.lerpVectors(this.bob, head, k);
        p.y += Math.sin(k * Math.PI) * 2.0 + 0.5 * k;
        this.caughtMesh.rotation.set(0, this.t * 8, Math.sin(this.t * 20) * 0.5);
      } else {
        p.copy(head).y += 0.55 + Math.sin(this.t * 6) * 0.05;
        this.caughtMesh.rotation.set(0, L.heading + Math.PI / 2, Math.sin(this.t * 10) * 0.3);
      }
      if (this.t > 2.2) {
        this.caughtMesh.visible = false;
        this.stop();
      }
    }
    L.fishState = this.state;
    L.bx = this.bob.x;
    L.bz = this.bob.z;
  }

  updateReel(dt) {
    const mg = this.mg;
    mg.holding = this.holding;
    mg.phaseT -= dt;
    if (mg.phaseT <= 0) {
      mg.pulling = !mg.pulling;
      mg.phaseT = mg.pulling ? (0.5 + Math.random() * 0.6) * (0.75 + mg.diff * 0.45) : 1.0 + Math.random() * 1.2;
      if (mg.pulling) this.ctx.audio?.splash();
    }
    let d = mg.diff;
    if (this.t > 22) d *= 0.5; // the fish gets tired
    if (mg.holding) {
      mg.p += (mg.pulling ? 0.03 : 0.33 * (1.15 - d * 0.35)) * dt;
      mg.tension += (mg.pulling ? 0.52 * d : 0.05) * dt;
    } else {
      mg.tension -= 0.8 * dt;
      if (mg.pulling) mg.p -= 0.07 * d * dt;
    }
    mg.tension = clamp(mg.tension, 0, 1);
    mg.p = clamp(mg.p, 0, 1);
    mg.hint = mg.pulling ? (mg.holding ? 'Let go!' : 'Wait…') : mg.holding ? 'Reeling…' : 'Hold to reel!';
    // the bobber gets pulled towards us as we reel
    const L = this.local;
    const toward = 0.82 * mg.p;
    const jig = mg.pulling ? 0.12 : 0.02;
    this.bob.set(
      lerp(this.target.x, L.x + Math.sin(this.dir) * 1.2, toward) + (Math.random() - 0.5) * jig,
      this.level - (mg.pulling ? 0.08 : 0.02),
      lerp(this.target.z, L.z + Math.cos(this.dir) * 1.2, toward) + (Math.random() - 0.5) * jig,
    );
    if (mg.pulling && Math.random() < dt * 8) this.ctx.fx.splash(this.bob.x, this.level, this.bob.z, 0.35);
    if (mg.holding && Math.random() < dt * 6) this.ctx.audio?.reelClick();
    if (mg.tension >= 1) { this.escaped('Snap! The line broke — let go when the fish pulls.'); return; }
    if (mg.p <= 0.001 && this.t > 3) { this.escaped('The fish swam away. So close!'); return; }
    if (mg.p >= 1) this.caught();
  }

  // Draw lines + bobbers for everyone who's fishing (local + family)
  draw(time) {
    let n = 0;
    const tip = this._tip;
    const pos = this.linePos, col = this.lineCol;
    let v = 0;
    for (const p of this.ctx.players.all()) {
      if (n >= MAXLINES) break;
      const fs = p.local ? this.state : p.fishState;
      if (fs < FS.FLY || fs > FS.REEL) continue;
      let bx, by, bz;
      if (p.local) { bx = this.bob.x; by = this.bob.y; bz = this.bob.z; }
      else {
        // remote players: we only know where their bobber is on the water
        const lvl = this.ctx.world.walk.waterLevelAt(p.bx, p.bz);
        bx = p.bx; bz = p.bz;
        by = lvl + (fs === FS.BITE ? -0.15 : Math.sin(time * 2.6 + n) * 0.03);
        const prev = this.remoteBob.get(p.pid);
        if (fs === FS.BITE && prev !== FS.BITE) this.ctx.fx.splash(bx, lvl, bz, 0.6);
        if (fs === FS.REEL && Math.random() < 0.05) this.ctx.fx.splash(bx, lvl, bz, 0.3);
        this.remoteBob.set(p.pid, fs);
      }
      p.char.rodTip(tip);
      this._m.makeTranslation(bx, by, bz);
      this.bobbers.setMatrixAt(n, this._m);
      // tension colour for our own line
      let r = 0.25, g = 0.2, b = 0.18;
      if (p.local && this.state === FS.REEL) {
        const t = this.mg.tension;
        r = lerp(0.95, 0.95, t); g = lerp(0.95, 0.3, t); b = lerp(0.95, 0.2, t);
      }
      // a sagging line from the rod tip to the bobber
      const sag = fs === FS.REEL ? 0.15 : 0.6;
      for (let i = 0; i < SEG; i++) {
        for (const k of [i / SEG, (i + 1) / SEG]) {
          pos[v * 3] = lerp(tip.x, bx, k);
          pos[v * 3 + 1] = lerp(tip.y, by + 0.05, k) - Math.sin(k * Math.PI) * sag;
          pos[v * 3 + 2] = lerp(tip.z, bz, k);
          col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b;
          v++;
        }
      }
      n++;
    }
    this.bobbers.count = n;
    this.bobbers.instanceMatrix.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, v);
    this.lines.visible = v > 0;
    if (v) {
      this.lines.geometry.attributes.position.needsUpdate = true;
      this.lines.geometry.attributes.color.needsUpdate = true;
    }
  }
}
