// The camera floats above and behind the player, looking down at the island,
// like a drone following you. It works out how far away to be from the screen shape
// so portrait and landscape both show a nice amount of the world.
import * as THREE from 'three';
import { damp, clamp } from '../util/math.js';

const FOV = 30;
const T = Math.tan((FOV / 2) * (Math.PI / 180));

export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 4, 300);
    this.pitch = 1.03; // ~59 degrees looking down
    this.zoom = 1; // pinch to change (0.7 .. 1.6)
    this.baseDist = 30;
    this.target = new THREE.Vector3();
    this.smoothed = new THREE.Vector3();
    this.lookAhead = new THREE.Vector2();
    this.shake = 0;
    this.first = true;
  }
  resize(w, h) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Portrait: show ~14 m across. Landscape: show ~12.5 m top-to-bottom.
    const wantW = 14, wantH = 12.5;
    this.baseDist = Math.max(wantW / 2 / (T * aspect), wantH / 2 / T);
    this.camera.far = this.baseDist * 1.6 + 120;
    this.camera.near = Math.max(2, this.baseDist * 0.25);
    this.camera.updateProjectionMatrix();
  }
  get distance() { return this.baseDist / this.zoom; }
  setZoom(z) { this.zoom = clamp(z, 0.7, 1.6); }
  // tx/tz: where to look (the player); vx/vz: player velocity (we look a bit ahead)
  update(dt, tx, ty, tz, vx = 0, vz = 0) {
    this.lookAhead.x = damp(this.lookAhead.x, vx * 0.35, 2.5, dt);
    this.lookAhead.y = damp(this.lookAhead.y, vz * 0.35, 2.5, dt);
    this.target.set(tx + this.lookAhead.x, ty, tz + this.lookAhead.y);
    if (this.first) { this.smoothed.copy(this.target); this.first = false; }
    this.smoothed.x = damp(this.smoothed.x, this.target.x, 6, dt);
    this.smoothed.y = damp(this.smoothed.y, this.target.y, 3, dt);
    this.smoothed.z = damp(this.smoothed.z, this.target.z, 6, dt);
    const d = this.distance;
    let sx = 0, sz = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      sx = (Math.random() - 0.5) * this.shake * 0.3;
      sz = (Math.random() - 0.5) * this.shake * 0.3;
    }
    const c = this.camera;
    c.position.set(this.smoothed.x + sx, this.smoothed.y + Math.sin(this.pitch) * d, this.smoothed.z + Math.cos(this.pitch) * d + sz);
    c.lookAt(this.smoothed.x + sx, this.smoothed.y, this.smoothed.z + sz);
  }
  snap() { this.first = true; }
}
