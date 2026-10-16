// Morning, noon, sunset and a cozy moonlit night — just by changing a few colour "knobs"
// that every shader shares (no extra work for the graphics chip).
import * as THREE from 'three';
import { U } from '../render/materials.js';
import { smoothstep } from '../util/math.js';

// hour: [sun, sky, ground, shallow, mid, deep, night(0..1)]
const KEYS = [
  [0, '#2b3866', '#4f5f94', '#2e3658', '#3f7f98', '#2c6488', '#1a4470', 1],
  [4.6, '#2b3866', '#4f5f94', '#2e3658', '#3f7f98', '#2c6488', '#1a4470', 1],
  [5.6, '#5a3e52', '#5a4f78', '#3a3049', '#6aa6b6', '#3f86a6', '#2a6488', 0.65],
  [6.6, '#93725c', '#8a8496', '#605a5a', '#8fd8cf', '#47bcc4', '#2a96b2', 0.15],
  [8, '#807462', '#8c949f', '#6b665e', '#8ff0dc', '#3ad1cf', '#20b2c6', 0],
  [12, '#807870', '#8c939f', '#6b6660', '#8ff0dc', '#3ad1cf', '#20b2c6', 0],
  [16.5, '#86735c', '#8e9098', '#6d6559', '#8eecd6', '#3dcbc9', '#22aac0', 0],
  [18, '#977058', '#887a8e', '#655856', '#9ee0c8', '#4ab8bf', '#2a92ae', 0.1],
  [19, '#5e4a66', '#5c5884', '#3f3a52', '#7ab0bc', '#3f86a6', '#2a6488', 0.55],
  [20, '#2e3a68', '#4f5e92', '#2f3658', '#46829a', '#2e668a', '#1b4572', 0.95],
  [24, '#2b3866', '#4f5f94', '#2e3658', '#3f7f98', '#2c6488', '#1a4470', 1],
].map(([h, ...rest]) => [h, ...rest.slice(0, 6).map((c) => new THREE.Color(c)), rest[6]]);

const tmp = Array.from({ length: 6 }, () => new THREE.Color());
const grey = new THREE.Color(0.55, 0.58, 0.62);

export class DayNight {
  constructor(renderer) {
    this.renderer = renderer;
    this.rain = 0;
    this.night = 0;
    this.clear = new THREE.Color();
  }
  update(dt, hour, raining) {
    this.rain += ((raining ? 1 : 0) - this.rain) * Math.min(1, dt * 0.5);
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (hour >= KEYS[i][0] && hour < KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    const k = smoothstep(0, 1, (hour - a[0]) / (b[0] - a[0] || 1));
    for (let i = 0; i < 6; i++) tmp[i].copy(a[i + 1]).lerp(b[i + 1], k);
    const night = a[7] + (b[7] - a[7]) * k;
    this.night = night;
    // rain: greyer light, less sun
    const r = this.rain;
    tmp[0].multiplyScalar(1 - 0.55 * r);
    tmp[1].lerp(grey, r * 0.5 * (1 - night));
    tmp[2].lerp(grey, r * 0.25 * (1 - night));
    tmp[4].lerp(grey, r * 0.25);
    tmp[5].lerp(grey, r * 0.2);
    U.uSunColor.value.copy(tmp[0]);
    U.uSkyColor.value.copy(tmp[1]);
    U.uGroundColor.value.copy(tmp[2]);
    U.uWaterShallow.value.copy(tmp[3]);
    U.uWaterMid.value.copy(tmp[4]);
    U.uWaterDeep.value.copy(tmp[5]);
    U.uNight.value = night;
    U.uGlow.value = smoothstep(0.25, 0.8, night);
    U.uCloud.value = 0.22 + r * 0.25;
    U.uRain.value = r;
    U.uWind.value = 1 + r * 0.8;
    U.uShadowColor.value.setRGB(0.55 + night * 0.2, 0.6 + night * 0.15, 0.78);
    this.clear.copy(tmp[5]).multiplyScalar(0.95);
    this.renderer.setClearColor(this.clear, 1);
  }
}

export function formatClock(hour) {
  const h = Math.floor(hour), m = Math.floor((hour - h) * 60 / 10) * 10;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}
export function timeIcon(hour, raining) {
  if (raining) return '🌧️';
  if (hour >= 5.5 && hour < 7) return '🌅';
  if (hour >= 7 && hour < 17.5) return '☀️';
  if (hour >= 17.5 && hour < 19.5) return '🌇';
  return '🌙';
}
