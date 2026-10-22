// Game feel. These few systems are the difference between "a demo" and "a game".
//  - ChaseCamera: critically-damped follow + look-ahead + speed FOV kick + trauma shake
//  - Trauma shake (Squirrel Eiserloh, "Juicing Your Cameras With Math"): shake = trauma²
//  - Hit-stop: freeze the sim for ~60-90 ms on impactful events (loop.timeScale)
//  - Particles: one pooled additive InstancedMesh, zero allocations per burst
import * as THREE from 'three';

const damp = (a, b, lambda, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));
const noise1 = (t) => Math.sin(t * 1.7) * 0.5 + Math.sin(t * 3.1 + 1.3) * 0.3 + Math.sin(t * 7.3 + 4.1) * 0.2;

export class ChaseCamera {
  constructor(camera, { offset = new THREE.Vector3(0, 3.2, 8), lookAhead = 6, lookLift = 0.6, stiffness = 6, baseFov = 62 } = {}) {
    Object.assign(this, { camera, offset, lookAhead, lookLift, stiffness, baseFov });
    this.trauma = 0; this.t = 0; this.fovKick = 0; this.shakeScale = 1;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this._tmp = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  addTrauma(x) { this.trauma = Math.min(1, this.trauma + x); }
  snap(target) { this.update(target, 1, 0, true); }
  // target: { position: Vector3, quaternion: Quaternion, speed01: 0..1 }
  update(target, dt, speed01 = 0, snap = false) {
    this.t += dt;
    const desired = this._tmp.copy(this.offset).applyQuaternion(target.quaternion).add(target.position);
    if (snap) this.pos.copy(desired);
    else this.pos.set(damp(this.pos.x, desired.x, this.stiffness, dt), damp(this.pos.y, desired.y, this.stiffness, dt), damp(this.pos.z, desired.z, this.stiffness, dt));
    const ahead = new THREE.Vector3(0, this.lookLift, -this.lookAhead).applyQuaternion(target.quaternion).add(target.position);
    if (snap) this.look.copy(ahead); else this.look.lerp(ahead, 1 - Math.exp(-10 * dt));

    const shake = this.trauma * this.trauma * this.shakeScale;
    this.camera.position.copy(this.pos).add(new THREE.Vector3(noise1(this.t * 23) * 0.5 * shake, noise1(this.t * 19 + 7) * 0.5 * shake, 0));
    this.camera.lookAt(this.look);
    this.camera.rotateZ(noise1(this.t * 17 + 3) * 0.06 * shake);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);

    this.fovKick = damp(this.fovKick, speed01 * 14, 4, dt);
    this.camera.fov = this.baseFov + this.fovKick;
    this.camera.updateProjectionMatrix();
  }
}

export function hitStop(loop, ms = 70, scale = 0.05) {
  loop.timeScale = scale;
  clearTimeout(hitStop._t);
  hitStop._t = setTimeout(() => (loop.timeScale = 1), ms);
}

function softDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Particles {
  constructor(scene, max = 1500) {
    this.max = max; this.alive = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: softDotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);
    this.p = Array.from({ length: max }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 1, color: new THREE.Color(), drag: 2, grav: 0 }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this.camera = null;
  }
  // HDR colours (>1) bloom nicely: new THREE.Color(4, 2, 0.5)
  burst(at, { count = 30, speed = 8, color = new THREE.Color(3, 2, 1), life = 0.7, size = 0.35, drag = 3, grav = -4, spread = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.p.find((q) => q.life <= 0); if (!p) return;
      p.pos.copy(at);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6 * spread));
      p.life = p.max = life * (0.6 + Math.random() * 0.6); p.size = size * (0.5 + Math.random()); p.color.copy(color); p.drag = drag; p.grav = grav;
    }
  }
  trail(at, vel, color, size = 0.25, life = 0.35) {
    const p = this.p.find((q) => q.life <= 0); if (!p) return;
    p.pos.copy(at); p.vel.copy(vel); p.life = p.max = life; p.size = size; p.color.copy(color); p.drag = 4; p.grav = 0;
  }
  update(dt) {
    let n = 0;
    const camQ = this.camera ? this.camera.quaternion : this._q;
    for (const p of this.p) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt)); p.vel.y += p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = Math.max(0, p.life / p.max), s = p.size * (0.3 + 0.7 * k);
      this._m.compose(p.pos, camQ, this._s.set(s, s, s)); // billboard toward camera
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.instanceColor.setXYZ(n, p.color.r * k, p.color.g * k, p.color.b * k);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}
