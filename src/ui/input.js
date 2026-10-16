// Touch controls: put a thumb down anywhere on the world and drag -> a joystick appears
// right there (a "floating joystick"). Two fingers pinch to zoom. Keyboard works too.
import { clamp } from '../util/math.js';

const RADIUS = 54; // how far (in screen points) the knob can travel

export class Input {
  constructor(surface, uiRoot) {
    this.surface = surface;
    this.move = { x: 0, y: 0, mag: 0 }; // y > 0 means "down the screen" (towards the camera)
    this.enabled = true;
    this.onPinch = null; // (ratio) => void
    this.onTapWorld = null;
    this.onAnyInput = null;
    this.keys = new Set();
    this.keyHandlers = {};
    this.stick = null; // {id, x0, y0, x, y}
    this.pointers = new Map();
    this.pinch = null;

    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.appendChild(this.knob);
    uiRoot.appendChild(this.base);

    surface.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.moveEv(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    // stop iOS from scrolling / zooming the page
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || e.target === surface) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.reset());
  }

  reset() {
    this.stick = null;
    this.pinch = null;
    this.pointers.clear();
    this.keys.clear();
    this.move.x = this.move.y = this.move.mag = 0;
    this.base.classList.remove('on');
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.onAnyInput?.();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    try { this.surface.setPointerCapture(e.pointerId); } catch { /* not important */ }
    if (this.pointers.size === 2) {
      // two fingers: pinch to zoom (cancel the joystick)
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      this.stick = null;
      this.updateStick();
      return;
    }
    if (!this.stick && this.pointers.size === 1) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() };
      this.updateStick();
    }
  }

  moveEv(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.onPinch?.(d / this.pinch.d0);
      this.pinch.d0 = d;
      return;
    }
    if (this.stick && this.stick.id === e.pointerId) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      // drag the joystick base along if the thumb goes far (feels natural)
      const dx = this.stick.x - this.stick.x0, dy = this.stick.y - this.stick.y0;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS * 1.4) {
        this.stick.x0 = this.stick.x - (dx / d) * RADIUS * 1.4;
        this.stick.y0 = this.stick.y - (dy / d) * RADIUS * 1.4;
      }
      this.updateStick();
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.stick && this.stick.id === e.pointerId) {
      const quick = performance.now() - this.stick.t < 220 && Math.hypot(this.stick.x - this.stick.x0, this.stick.y - this.stick.y0) < 10;
      if (quick) this.onTapWorld?.(e.clientX, e.clientY);
      this.stick = null;
      this.updateStick();
    }
    if (this.pointers.size < 2) this.pinch = null;
  }

  updateStick() {
    const s = this.stick;
    if (!s) {
      this.base.classList.remove('on');
      this.touchMove(0, 0);
      return;
    }
    let dx = s.x - s.x0, dy = s.y - s.y0;
    const d = Math.hypot(dx, dy);
    const k = d > RADIUS ? RADIUS / d : 1;
    dx *= k;
    dy *= k;
    this.base.classList.add('on');
    this.base.style.transform = `translate3d(${s.x0 - RADIUS}px, ${s.y0 - RADIUS}px, 0)`;
    this.knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    this.touchMove(dx / RADIUS, dy / RADIUS);
  }

  touchMove(x, y) {
    const mag = Math.hypot(x, y);
    const dead = 0.12;
    if (mag < dead) { this.tx = 0; this.ty = 0; this.tmag = 0; return; }
    const m = clamp((mag - dead) / (1 - dead), 0, 1);
    this.tx = (x / mag) * m;
    this.ty = (y / mag) * m;
    this.tmag = m;
  }

  key(e, isDown) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (isDown) {
      if (this.keys.has(k)) return;
      this.keys.add(k);
      this.onAnyInput?.();
      this.keyHandlers[k]?.(true);
    } else {
      this.keys.delete(k);
      this.keyHandlers[k]?.(false);
    }
  }

  // Combine touch + keyboard into one movement direction.
  poll() {
    let x = this.tx || 0, y = this.ty || 0, mag = this.tmag || 0;
    const K = this.keys;
    const kx = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0);
    const ky = (K.has('s') || K.has('arrowdown') ? 1 : 0) - (K.has('w') || K.has('arrowup') ? 1 : 0);
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      x = kx / l;
      y = ky / l;
      mag = K.has('shift') ? 0.6 : 1;
      x *= mag; y *= mag;
    }
    if (!this.enabled) { x = y = mag = 0; }
    this.move.x = x;
    this.move.y = y;
    this.move.mag = mag;
    return this.move;
  }
}
