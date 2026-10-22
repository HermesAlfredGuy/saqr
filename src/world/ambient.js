// Atmosphere props: warm dust motes streaming past the bird (speed you can see), valley mist,
// and a distant flock. All instanced / batched — a dozen draw calls for the whole sky.
import * as THREE from 'three';
import { groundHeight, valleyCenterX } from './terrain.js';

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,230,200,0.55)');
  r.addColorStop(1, 'rgba(255,200,160,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createMotes(scene, count = 240) {
  const tex = dotTexture();
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    toneMapped: false, opacity: 0.5,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  scene.add(mesh);
  const P = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    P.push({ x: (Math.random() - 0.5) * 70, y: (Math.random() - 0.5) * 46, z: -Math.random() * 90, size: 0.035 + Math.random() * 0.075, drift: 0.4 + Math.random() });
    c.setHSL(0.07 + Math.random() * 0.04, 0.75, 0.6 + Math.random() * 0.25);
    mesh.instanceColor.setXYZ(i, c.r * 1.6, c.g * 1.2, c.b);
  }
  return {
    mesh,
    update(dt, camPos, camQuat) {
      for (let i = 0; i < count; i++) {
        const p = P[i];
        p.z += dt * 12 * p.drift;             // they stream backwards past the bird
        if (p.z > camPos.z + 8) {
          p.z = camPos.z - 95 - Math.random() * 20;
          p.x = camPos.x + (Math.random() - 0.5) * 70;
          p.y = camPos.y + (Math.random() - 0.5) * 46;
        }
        const sz = p.size;
        m.compose(s.set(camPos.x + p.x, camPos.y + p.y, camPos.z + p.z), camQuat, s.clone().set(sz, sz, sz));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const x = 40 + Math.random() * 176, y = 60 + Math.random() * 136, r = 40 + Math.random() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,214,180,0.20)');
    grd.addColorStop(0.55, 'rgba(255,206,172,0.10)');
    grd.addColorStop(1, 'rgba(255,200,170,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export function createMist(scene, count = 5) {
  const tex = mistTexture();
  const group = new THREE.Group();
  const planes = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.0,
      color: '#ffd2ae', blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: true,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(150, 90), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI;
    m.userData = { life: 0.55 + Math.random() * 0.35, drift: (Math.random() - 0.5) * 1.4 };
    group.add(m);
    planes.push(m);
  }
  scene.add(group);
  return {
    update(dt, pos) {
      planes.forEach((m, i) => {
        if (m.position.z > pos.z + 30 || m.position.z < pos.z - 420) {
          const z = pos.z - 90 - Math.random() * 300;
          const x = valleyCenterX(z) + (Math.random() - 0.5) * 70;
          m.position.set(x, groundHeight(x, z) + 4 + Math.random() * 12, z);
          m.rotation.z = Math.random() * Math.PI;
        }
        m.position.x += m.userData.drift * dt;
        m.material.opacity += (m.userData.life * 0.09 - m.material.opacity) * Math.min(1, dt * 0.7);
      });
    },
  };
}

export function createFlock(scene, count = 16) {
  const g = new THREE.BufferGeometry();
  // a tiny V silhouette: two thin triangles
  const v = new Float32Array([
    0, 0, 0.35, -0.9, 0.1, -0.25, 0, 0, -0.1,
    0, 0, 0.35, 0, 0, -0.1, 0.9, 0.1, -0.25,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#3a2b36', side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.55 });
  const mesh = new THREE.InstancedMesh(g, mat, count);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const birds = Array.from({ length: count }, () => ({
    ox: (Math.random() - 0.5) * 160, oy: 20 + Math.random() * 60, oz: -120 - Math.random() * 240,
    r: 8 + Math.random() * 26, a: Math.random() * 6.28, sp: 0.12 + Math.random() * 0.2, sc: 1.1 + Math.random() * 1.6,
  }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  return {
    update(dt, pos) {
      birds.forEach((b, i) => {
        b.a += dt * b.sp;
        p.set(pos.x + b.ox + Math.cos(b.a) * b.r, b.oy + Math.sin(b.a * 1.7) * 3, pos.z + b.oz + Math.sin(b.a) * b.r * 0.5);
        e.set(0, b.a + Math.PI * 0.5, Math.sin(b.a * 3) * 0.25);
        q.setFromEuler(e);
        m.compose(p, q, s.setScalar(b.sc));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Scrub + boulders: the valley floor needs scale cues. Two instanced meshes, recycled ahead of
// the bird; no collision, purely scenery, so they can be dense and cheap.
export function createScrub(scene, { trees = 300, stones = 160 } = {}) {
  const mk = (geo, mat, n, colorFn) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const treeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, flatShading: false });
  const stoneGeo = new THREE.IcosahedronGeometry(1, 0);
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, flatShading: true });
  const treeMesh = mk(treeGeo, treeMat, trees);
  const stoneMesh = mk(stoneGeo, stoneMat, stones);

  const P = [];
  const c = new THREE.Color();
  const treeCols = ['#3d4a30', '#4a5636', '#354027', '#545e3c'];
  const stoneCols = ['#a9836a', '#8f6a56', '#b99878', '#7d5b4b'];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();

  function placeTree(i, zHint) {
    const z = zHint ?? (S0.z - 20 - Math.random() * 330);
    const x = valleyCenterX(z) + (Math.random() - 0.5) * 130;
    const y = groundHeight(x, z);
    const sc = 0.9 + Math.random() * 2.2;
    P[i] = { x, y: y - sc * 0.35, z, sx: sc * (0.8 + Math.random() * 0.5), sy: sc * (0.55 + Math.random() * 0.5), sz: sc * (0.8 + Math.random() * 0.5), rot: Math.random() * 6.28 };
    const col = new THREE.Color(treeCols[(Math.random() * treeCols.length) | 0]);
    treeMesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
  }
  const S0 = { z: 0 };
  const P2 = [];
  function placeStone(i, zHint) {
    const z = zHint ?? (S0.z - 20 - Math.random() * 330);
    const x = valleyCenterX(z) + (Math.random() - 0.5) * 150;
    const y = groundHeight(x, z);
    const sc = 0.7 + Math.random() * 3.4;
    P2[i] = { x, y: y + sc * 0.15, z, sx: sc * (0.9 + Math.random()), sy: sc * (0.6 + Math.random() * 0.7), sz: sc * (0.9 + Math.random()), rot: Math.random() * 6.28 };
    const col = new THREE.Color(stoneCols[(Math.random() * stoneCols.length) | 0]);
    stoneMesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
  }
  const write = (mesh, arr, list) => {
    for (let i = 0; i < list.length; i++) {
      const p = list[i]; if (!p) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      m4.compose(v.set(p.x, p.y, p.z), q, s.set(p.sx, p.sy, p.sz));
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };

  return {
    meshes: [treeMesh, stoneMesh],
    seed(pos) {
      S0.z = pos.z;
      for (let i = 0; i < trees; i++) placeTree(i, pos.z - 20 - Math.random() * 330);
      for (let i = 0; i < stones; i++) placeStone(i, pos.z - 20 - Math.random() * 330);
      write(treeMesh, null, P); write(stoneMesh, null, P2);
    },
    update(dt, pos) {
      let dirtyT = false, dirtyS = false;
      for (let i = 0; i < trees; i++) {
        const p = P[i];
        if (!p || p.z > pos.z + 30) { placeTree(i, pos.z - 330 - Math.random() * 40); dirtyT = true; }
      }
      for (let i = 0; i < stones; i++) {
        const p = P2[i];
        if (!p || p.z > pos.z + 30) { placeStone(i, pos.z - 330 - Math.random() * 40); dirtyS = true; }
      }
      if (dirtyT) write(treeMesh, null, P);
      if (dirtyS) write(stoneMesh, null, P2);
    },
  };
}
