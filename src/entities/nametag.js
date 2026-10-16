// Floating name label above each family member (drawn once into a little picture).
import * as THREE from 'three';

export function makeNameTag(name, color) {
  const cv = document.createElement('canvas');
  const W = 256, H = 72;
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.font = "600 34px Fredoka, ui-rounded, system-ui, sans-serif";
  const text = name.slice(0, 12);
  const tw = Math.min(W - 20, g.measureText(text).width + 34);
  const x0 = (W - tw) / 2;
  g.fillStyle = 'rgba(255, 248, 232, 0.95)';
  roundRect(g, x0, 10, tw, 50, 24);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = color;
  roundRect(g, x0, 10, tw, 50, 24);
  g.stroke();
  g.fillStyle = '#5a3d2b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, 37);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(2.8, 2.8 * (H / W), 1);
  s.renderOrder = 50;
  s.userData.dispose = () => { tex.dispose(); mat.dispose(); };
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
