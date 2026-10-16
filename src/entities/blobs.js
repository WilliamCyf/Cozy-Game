// Soft round shadows under characters and critters — all drawn in ONE draw call.
import * as THREE from 'three';
import { makeBlobMaterial } from '../render/materials.js';

export class BlobShadows {
  constructor(scene, max = 48) {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, makeBlobMaterial(), max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    this.mesh.count = 0;
    this.max = max;
    this.n = 0;
    this._m = new THREE.Matrix4();
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, y, z, size) {
    if (this.n >= this.max) return;
    this._m.makeScale(size, 1, size).setPosition(x, y + 0.03, z);
    this.mesh.setMatrixAt(this.n++, this._m);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
