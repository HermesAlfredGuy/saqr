// A peregrine, built by hand: lathe body, cambered swept wings with scalloped primaries, barred
// tail. Painted with baked vertex colours (warm leading edge, dark trailing edge) so the bird
// holds a shape at 40 px and at 400. It tucks into an arrow for the stoop and flares to land a
// thermal — the camera is behind it 90% of the time, so the silhouette is the whole job.
import * as THREE from 'three';
import { clamp } from './noise.js';

const C = {
  wingLead: new THREE.Color('#9a9184'),
  wingMid: new THREE.Color('#5f6470'),
  wingTrail: new THREE.Color('#2f3742'),
  tailDark: new THREE.Color('#3b444f'),
  tailBar: new THREE.Color('#8d8579'),
};

function barringTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c98f63'; g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 9) {
    g.fillStyle = `rgba(58,40,34,${0.18 + Math.random() * 0.18})`;
    g.fillRect(0, y, 128, 3.5);
  }
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,235,205' : '60,42,36'},${Math.random() * 0.07})`;
    g.fillRect(Math.random() * 128, Math.random() * 256, 2, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// leading edge sweeps back to the tip; the trailing edge is scalloped into six primaries.
function wingGeometry(span = 1.45) {
  const lead = (k) => 0.47 - 0.61 * Math.pow(k, 1.45);      // k = 0 root .. 1 tip
  const trail = (k) => -0.53 + 0.36 * Math.pow(k, 2.1);
  const s = new THREE.Shape();
  s.moveTo(0, lead(0));
  s.bezierCurveTo(span * 0.34, lead(0.34), span * 0.72, lead(0.72), span, lead(1));
  s.lineTo(span - 0.06, lead(1) - 0.07);
  const N = 6;
  for (let i = 1; i <= N; i++) {
    const k1 = 1 - i / N, k0 = 1 - (i - 1) / N;
    const x1 = span * k1, x0 = span * k0;
    const yTip = trail(k1) - 0.10 * (0.45 + 0.55 * k1);      // feather tip
    s.quadraticCurveTo((x0 + x1) * 0.5 + 0.02, yTip, x1, trail(k1) + 0.012);
  }
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.022, bevelEnabled: true, bevelThickness: 0.013, bevelSize: 0.022, bevelSegments: 2, curveSegments: 12,
  });
  geo.rotateX(-Math.PI / 2);                 // lay flat, leading edge forward (-z)
  geo.translate(0, 0.015, 0);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = clamp(x / span, 0, 1);
    const chordT = clamp((z - trail(k)) / (lead(k) - trail(k) + 0.001), 0, 1);  // 0 trailing .. 1 leading
    // camber + dihedral droop + a little sweep curve
    p.setY(i, y - 0.10 * k * k + 0.028 * Math.sin(Math.PI * k));
    p.setZ(i, z + 0.05 * k * k);
    c.copy(C.wingTrail).lerp(C.wingMid, Math.min(1, chordT * 1.9));
    c.lerp(C.wingLead, Math.max(0, chordT - 0.55) / 0.45 * 0.85);
    const shade = 0.92 + 0.16 * Math.sin(k * 9.1);   // faint feather banding
    colors[i * 3] = c.r * shade; colors[i * 3 + 1] = c.g * shade; colors[i * 3 + 2] = c.b * shade;
  }
  p.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function featherGeometry(len = 0.46, w = 0.085) {
  const s = new THREE.Shape();
  s.moveTo(0, w * 0.5);
  s.quadraticCurveTo(len * 0.55, w * 0.62, len, 0.008);
  s.quadraticCurveTo(len * 0.55, -w * 0.5, 0, -w * 0.5);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.011, bevelEnabled: false, curveSegments: 7 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function createFalcon() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const slate = new THREE.MeshStandardMaterial({ color: '#616670', roughness: 0.56, metalness: 0.05 });
  const mantle = new THREE.MeshStandardMaterial({ color: '#3a4149', roughness: 0.6, metalness: 0.05 });
  const chest = new THREE.MeshStandardMaterial({ map: barringTexture(), color: '#d7a173', roughness: 0.72, metalness: 0 });
  const cream = new THREE.MeshStandardMaterial({ color: '#e9dcc4', roughness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: '#24262b', roughness: 0.42, metalness: 0.1 });
  const cere = new THREE.MeshStandardMaterial({ color: '#e6b148', roughness: 0.5 });
  const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0.04, side: THREE.DoubleSide });
  const tailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.03, side: THREE.DoubleSide });

  // ---- body ----
  const prof = [[0, -0.62], [0.09, -0.50], [0.185, -0.26], [0.215, 0.0], [0.19, 0.22], [0.12, 0.38], [0.055, 0.48], [0, 0.53]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const bodyGeo = new THREE.LatheGeometry(prof, 26);
  bodyGeo.rotateX(-Math.PI / 2);
  bodyGeo.scale(1, 0.86, 1);
  const hull = new THREE.Mesh(bodyGeo, slate);
  hull.castShadow = true;
  body.add(hull);

  // dark mantle over the back — reads as a peregrine from above
  const cloak = new THREE.Mesh(bodyGeo, mantle);
  cloak.scale.set(1.035, 0.9, 1.02);
  cloak.position.y = 0.028;
  body.add(cloak);
  const breast = new THREE.Mesh(new THREE.SphereGeometry(0.172, 20, 14), chest);
  breast.scale.set(0.93, 0.6, 1.5);
  breast.position.set(0, -0.065, -0.03);
  body.add(breast);

  // ---- head ----
  const head = new THREE.Group();
  head.position.set(0, 0.03, -0.5);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.152, 22, 16), mantle);
  skull.scale.set(1, 0.92, 1.14);
  skull.castShadow = true;
  head.add(skull);
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 12), cream);
  throat.scale.set(0.9, 0.78, 1.02);
  throat.position.set(0, -0.048, 0.012);
  head.add(throat);
  // malar stripe: the dark cheek mark that makes a falcon a falcon
  for (const sx of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), mantle);
    stripe.scale.set(0.42, 0.7, 1.15);
    stripe.position.set(sx * 0.105, -0.018, -0.03);
    head.add(stripe);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 12), dark);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, -0.022, -0.145);
  head.add(beak);
  const cereM = new THREE.Mesh(new THREE.SphereGeometry(0.043, 10, 8), cere);
  cereM.scale.set(1, 0.72, 0.85);
  cereM.position.set(0, -0.006, -0.095);
  head.add(cereM);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.031, 10, 8), dark);
    eye.position.set(sx * 0.102, 0.022, -0.032);
    head.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), new THREE.MeshBasicMaterial({ color: '#fff4e2' }));
    glint.position.set(sx * 0.115, 0.042, -0.045);
    head.add(glint);
  }

  // ---- wings ----
  const wgeo = wingGeometry(1.45);
  const fgeo = featherGeometry();

  function makeWing(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.115, 0.045, -0.03);
    const mesh = new THREE.Mesh(wgeo, wingMat);
    mesh.castShadow = true;
    mesh.scale.x = side;
    pivot.add(mesh);
    const tips = [];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(fgeo, wingMat);
      f.position.set(1.16 + i * 0.03, 0.002, -0.19 + i * 0.055);
      f.rotation.y = -0.14 - i * 0.06;
      f.scale.set(0.9 + i * 0.04, 1, 1);
      f.scale.x *= side;
      f.castShadow = true;
      tips.push(f);
      pivot.add(f);
    }
    // coverts along the trailing edge break the plate silhouette into feathers
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fgeo, wingMat);
      f.position.set(0.26 + i * 0.26, -0.004, 0.16 + i * 0.016);
      f.rotation.y = -0.62 - i * 0.05;
      f.scale.set((0.62 + i * 0.06) * side, 1, 1.35);
      f.castShadow = true;
      pivot.add(f);
    }
    body.add(pivot);
    return { pivot, tips, side };
  }
  const wingR = makeWing(1);
  const wingL = makeWing(-1);

  // ---- tail ----
  const tail = new THREE.Group();
  tail.position.set(0, 0.0, 0.44);
  const ts = new THREE.Shape();
  const TL = 0.78, TW = 0.20;
  ts.moveTo(0, 0.05);
  ts.lineTo(TW * 0.75, TL * 0.6);
  ts.lineTo(TW, TL);
  ts.quadraticCurveTo(0, TL + 0.07, -TW, TL);
  ts.lineTo(-TW * 0.75, TL * 0.6);
  ts.lineTo(0, 0.05);
  const tgeo = new THREE.ExtrudeGeometry(ts, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.009, bevelSegments: 1, curveSegments: 8 });
  tgeo.rotateX(-Math.PI / 2);
  {
    const tp = tgeo.attributes.position, tc = new Float32Array(tp.count * 3), cc = new THREE.Color();
    for (let i = 0; i < tp.count; i++) {
      const z = Math.abs(tp.getZ(i));
      const band = Math.sin(z * 26) > 0.35 ? 1 : 0;
      cc.copy(C.tailDark).lerp(C.tailBar, band * 0.65 + clamp(z / TL, 0, 1) * 0.12);
      tc[i * 3] = cc.r; tc[i * 3 + 1] = cc.g; tc[i * 3 + 2] = cc.b;
    }
    tgeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  }
  const tailMesh = new THREE.Mesh(tgeo, tailMat);
  tailMesh.castShadow = true;
  tail.add(tailMesh);
  body.add(tail);

  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.17, 8), cere);
    leg.position.set(sx * 0.07, -0.135, 0.1);
    leg.rotation.x = 0.95;
    body.add(leg);
  }

  root.userData = { body, head, wingL, wingR, tail, tailMesh };
  const f = {
    root, parts: root.userData, phase: Math.random() * 6, t: 0,
    update(dt, { climb = 0, dive = 0, speed01 = 0, flare = 0 } = {}) {
      f.t += dt;
      const tuck = clamp(dive, 0, 1);
      const flapFreq = 1.9 + climb * 3.4;
      const amp = (0.10 + climb * 0.44 + (1 - speed01) * 0.05) * (1 - tuck * 0.8);
      f.phase += dt * flapFreq * Math.PI * 2;
      const s = Math.sin(f.phase);
      const dih = (0.14 + s * amp) * (1 - tuck * 0.8) - tuck * 0.22 + flare * 0.18;
      const sweep = tuck * 0.95 + (1 - speed01) * 0.06 - flare * 0.12;

      wingR.pivot.rotation.z = -dih;
      wingL.pivot.rotation.z = dih;
      wingR.pivot.rotation.y = -sweep;
      wingL.pivot.rotation.y = sweep;
      for (const w of [wingR, wingL]) {
        w.tips.forEach((t, i) => {
          t.rotation.y = (w.side > 0 ? -1 : 1) * (0.14 + i * 0.06 + tuck * 0.26 - flare * 0.07);
          t.rotation.z = (w.side > 0 ? -1 : 1) * (s * Math.abs(amp) * 0.5);
        });
      }
      tail.rotation.x = 0.05 + flare * 0.32 + climb * 0.09 - tuck * 0.14;
      tailMesh.scale.x = 0.86 + flare * 0.38 + tuck * 0.10;
      body.position.y = Math.sin(f.phase) * Math.abs(amp) * 0.03;
      head.rotation.x = -climb * 0.10;
    },
  };
  return f;
}
