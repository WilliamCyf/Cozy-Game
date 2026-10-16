// Players: YOUR character (moved by your thumb) and your family's characters
// (moved by updates arriving over the network ~10 times a second).
// Family members are drawn ~0.12 s "in the past" so we can glide smoothly between
// updates instead of jumping — this is called interpolation.
import * as THREE from 'three';
import { Character } from '../entities/character.js';
import { makeNameTag } from '../entities/nametag.js';
import { damp, dampAngle, angleDiff, clamp, lerp } from '../util/math.js';
import { sampleMaskShadow } from '../render/textures.js';
import { SPAWN } from '../world/layout.js';

export const ANIMS = ['idle', 'walk', 'sit', 'fish', 'cast', 'charge', 'reel', 'cheer', 'wave', 'dance', 'heart', 'shake', 'water', 'pick', 'plant', 'cook', 'sleep'];
const ANIM_IDX = Object.fromEntries(ANIMS.map((a, i) => [a, i]));
const WALK = 3.9, RUN = 5.6;
const INTERP_DELAY = 120;

export class PlayerManager {
  constructor(ctx) {
    this.ctx = ctx; // {scene, world, session, input, rig, blobs, fx, audio}
    const { session, scene } = ctx;
    const me = session.profile;
    this.local = {
      char: new Character(me.look, scene),
      x: SPAWN.x, z: SPAWN.z, y: 0.8, vx: 0, vz: 0, heading: 0,
      lock: 0, // seconds the player can't move (picking something up, etc.)
      lockAnim: null,
      emote: null, emoteT: 0,
      fishState: 0, bx: 0, bz: 0,
      sitting: false,
      wading: false,
      stepT: 0,
      idleT: 0,
    };
    const L = this.local;
    [L.x, L.z] = ctx.world.walk.nearestWalkable(SPAWN.x + (Math.random() - 0.5) * 3, SPAWN.z + (Math.random() - 0.5) * 2);
    L.y = ctx.world.walk.groundY(L.x, L.z);
    this.remotes = new Map();
    this._v = new THREE.Vector3();
    this.list = []; // everyone on the island, refreshed once per frame (reused, no garbage)
    this.pool = [];
  }

  setLocalLook(look) { this.local.char.setLook(look); }

  // short "busy" animation for the local player (picking, shaking, watering…)
  doAction(anim, seconds) {
    const L = this.local;
    L.lock = seconds;
    L.lockAnim = anim;
    L.emote = null;
    L.char.play(anim);
  }
  emote(e, seconds = 2.6) {
    const L = this.local;
    if (L.fishState) return;
    L.emote = e;
    L.emoteT = e === 'sit' || e === 'sleep' ? 9999 : seconds;
    L.char.play(e === 'laugh' ? 'cheer' : e);
  }
  faceTowards(x, z) {
    const L = this.local;
    L.heading = Math.atan2(x - L.x, z - L.z);
  }

  updateLocal(dt) {
    const { input, world, rig } = this.ctx;
    const L = this.local;
    const mv = input.poll();
    const busy = L.lock > 0 || L.fishState > 0 || this.ctx.ui?.modalOpen;
    let tx = 0, tz = 0;
    if (!busy && mv.mag > 0) {
      const sp = mv.mag > 0.92 ? RUN : WALK * clamp(mv.mag / 0.92, 0.25, 1);
      tx = mv.x / mv.mag * sp;
      tz = mv.y / mv.mag * sp;
      if (L.emote) { L.emote = null; }
    }
    L.vx = damp(L.vx, tx, busy ? 20 : 10, dt);
    L.vz = damp(L.vz, tz, busy ? 20 : 10, dt);
    const speed = Math.hypot(L.vx, L.vz);
    if (speed > 0.05) {
      const walk = world.walk;
      const nx = L.x + L.vx * dt, nz = L.z + L.vz * dt;
      if (walk.canWalk(nx, nz)) { L.x = nx; L.z = nz; }
      else if (walk.canWalk(nx, L.z)) { L.x = nx; L.vz *= 0.5; }
      else if (walk.canWalk(L.x, nz)) { L.z = nz; L.vx *= 0.5; }
      else { L.vx *= 0.2; L.vz *= 0.2; }
      if (tx || tz) L.heading = dampAngle(L.heading, Math.atan2(L.vx, L.vz), 14, dt);
    }
    // safety net: if we're somehow inside something, pop out
    if (!world.walk.canWalk(L.x, L.z)) [L.x, L.z] = world.walk.nearestWalkable(L.x, L.z, 6);
    const gy = world.walk.groundY(L.x, L.z);
    L.y = Math.abs(gy - L.y) > 1.5 ? gy : damp(L.y, gy, 18, dt);
    const flag = world.walk.flag(L.x, L.z);
    L.wading = flag === 2;
    L.onWood = flag === 3;

    // animation choice
    const c = L.char;
    if (L.lock > 0) {
      L.lock -= dt;
      if (L.lock <= 0) { L.lockAnim = null; }
    }
    if (L.emote) {
      L.emoteT -= dt;
      if (L.emoteT <= 0) L.emote = null;
    }
    if (!L.lockAnim && !L.fishState) {
      if (L.emote) c.play(L.emote === 'laugh' ? 'cheer' : L.emote);
      else c.play('idle');
    }
    c.x = L.x; c.y = L.y; c.z = L.z; c.heading = L.heading;
    c.speed = L.lock > 0 ? 0 : speed;
    c.sitting = L.sitting;
    c.uniforms.uShade.value = damp(c.uniforms.uShade.value, sampleMaskShadow(world.mask, L.x, L.z) > 0.45 ? 1 : 0, 8, dt);
    c.update(dt);

    // footsteps
    if (speed > 1) {
      L.stepT -= dt * speed;
      if (L.stepT <= 0) {
        L.stepT = 1.25;
        this.ctx.fx?.step(L.x, L.y, L.z, L.wading, L.onWood);
        this.ctx.audio?.step(L.wading ? 'water' : L.onWood ? 'wood' : 'sand');
      }
      L.idleT = 0;
    } else L.idleT += dt;

    rig.update(dt, L.x, L.y, L.z, L.vx, L.vz);
    L.anim = c.anim === 'idle' && speed > 0.25 ? 'walk' : c.anim;
  }

  // The little position message sent ~10x a second (built only when it's actually sent)
  packet() {
    const L = this.local;
    const r2 = (v) => Math.round(v * 100) / 100;
    return [r2(L.x), r2(L.z), r2(L.heading), ANIM_IDX[L.anim] ?? 0, L.fishState, r2(L.bx), r2(L.bz), (L.sitting ? 1 : 0) | (L.wading ? 2 : 0)];
  }

  // Remote players: create/remove characters to match who's online, and glide them along.
  syncRoster() {
    const { session, scene } = this.ctx;
    for (const [pid, o] of session.online) {
      if (pid === session.pid) continue;
      let r = this.remotes.get(pid);
      if (!r) {
        r = { char: new Character(o.look || {}, scene), tag: makeNameTag(o.name || 'Friend', o.look?.accent || '#3aa39a'), buf: [], lastS: null, x: 0, z: 0, y: 0, heading: 0, lookKey: JSON.stringify(o.look || {}), name: o.name, speed: 0, seen: false };
        scene.add(r.tag);
        r.char.setVisible(false);
        r.tag.visible = false;
        this.remotes.set(pid, r);
      }
      const key = JSON.stringify(o.look || {});
      if (key !== r.lookKey) { r.lookKey = key; r.char.setLook(o.look || {}); }
      if (o.name !== r.name) {
        r.name = o.name;
        scene.remove(r.tag);
        r.tag.userData.dispose?.();
        r.tag = makeNameTag(o.name || 'Friend', o.look?.accent || '#3aa39a');
        scene.add(r.tag);
      }
    }
    for (const [pid, r] of this.remotes) {
      if (!session.online.has(pid) || pid === session.pid) {
        r.char.dispose();
        scene.remove(r.tag);
        r.tag.userData.dispose?.();
        this.remotes.delete(pid);
      }
    }
  }

  updateRemotes(dt, now) {
    const { session, world } = this.ctx;
    for (const [pid, r] of this.remotes) {
      const o = session.online.get(pid);
      if (o?.s && o.s !== r.lastS) {
        r.lastS = o.s;
        r.buf.push({ t: o.t || now, s: o.s });
        if (r.buf.length > 10) r.buf.shift();
      }
      if (!r.buf.length) continue;
      const rt = now - INTERP_DELAY;
      let a = r.buf[0], b = r.buf[r.buf.length - 1];
      for (let i = r.buf.length - 1; i > 0; i--) {
        if (r.buf[i - 1].t <= rt) { a = r.buf[i - 1]; b = r.buf[i]; break; }
      }
      const span = b.t - a.t;
      const k = span > 0 ? clamp((rt - a.t) / span, 0, 1) : 1;
      const tx = lerp(a.s[0], b.s[0], k), tz = lerp(a.s[1], b.s[1], k);
      const th = a.s[2] + angleDiff(a.s[2], b.s[2]) * k;
      if (!r.seen) { r.x = tx; r.z = tz; r.heading = th; r.y = world.walk.groundY(tx, tz); r.seen = true; r.char.setVisible(true); r.tag.visible = true; }
      const ox = r.x, oz = r.z;
      // big jump (teleport / reconnect) -> snap, otherwise glide
      if (Math.hypot(tx - r.x, tz - r.z) > 6) { r.x = tx; r.z = tz; }
      else { r.x = damp(r.x, tx, 18, dt); r.z = damp(r.z, tz, 18, dt); }
      r.heading = dampAngle(r.heading, th, 16, dt);
      r.speed = damp(r.speed, Math.hypot(r.x - ox, r.z - oz) / Math.max(dt, 1e-3), 10, dt);
      r.y = damp(r.y, world.walk.groundY(r.x, r.z), 14, dt);
      const s = b.s;
      const c = r.char;
      const anim = ANIMS[s[3]] || 'idle';
      c.play(anim === 'walk' ? 'idle' : anim);
      c.sitting = !!(s[7] & 1);
      c.x = r.x; c.y = r.y; c.z = r.z; c.heading = r.heading; c.speed = r.speed;
      c.uniforms.uShade.value = damp(c.uniforms.uShade.value, sampleMaskShadow(world.mask, r.x, r.z) > 0.45 ? 1 : 0, 8, dt);
      c.update(dt);
      r.fishState = s[4]; r.bx = s[5]; r.bz = s[6];
      r.wading = !!(s[7] & 2);
      r.tag.position.set(r.x, r.y + 2.35, r.z);
      // footsteps for others too (no sound, just puffs)
      if (r.speed > 1) {
        r.stepT = (r.stepT ?? 1) - dt * r.speed;
        if (r.stepT <= 0) { r.stepT = 1.25; this.ctx.fx?.step(r.x, r.y, r.z, r.wading, world.walk.isWood(r.x, r.z)); }
      }
    }
  }

  update(dt, now) {
    this.updateLocal(dt);
    this.updateRemotes(dt, now);
    // refresh the shared "everyone" list in place
    const list = this.list;
    let n = 0;
    const put = (pid, src, char, local) => {
      const e = this.pool[n] || (this.pool[n] = {});
      e.pid = pid; e.char = char; e.x = src.x; e.y = src.y; e.z = src.z;
      e.fishState = src.fishState; e.bx = src.bx; e.bz = src.bz; e.local = local;
      list[n++] = e;
    };
    put(this.ctx.session.pid, this.local, this.local.char, true);
    for (const [pid, r] of this.remotes) if (r.seen) put(pid, r, r.char, false);
    list.length = n;
  }

  // Every character on the island (for shadows, fishing lines, nearby checks…)
  all() { return this.list; }
  charOf(pid) {
    if (pid === this.ctx.session.pid) return this.local.char;
    return this.remotes.get(pid)?.char || null;
  }
  setOutlines(on) {
    this.local.char.setOutline(on);
    for (const r of this.remotes.values()) r.char.setOutline(on);
  }
}
