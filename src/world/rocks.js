// The cliffs you dodge: Asir rock — fluted, stratified, sometimes a mesa, sometimes a needle.
// Smooth-shaded with baked per-vertex strata colours, so it reads as stone at 5 m and 80 m.
import * as THREE from 'three';
import { fbm, smoothstep } from './noise.js';

const BAND = {
  dark: new THREE.Color('#5a3f36'),
  mid: new THREE.Color('#8a6450'),
  lit: new THREE.Color('#c08e6c'),
  moss: new THREE.Color('#49512f'),
};

export function makeRockGeometry(seed, { mesa = false, seg = 24, rings = 30 } = {}) {
  const geo = new THREE.CylinderGeometry(mesa ? 0.62 : 0.26, 1, 1, seg, rings, false);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const lean = (Math.sin(seed * 2.3) * 0.5) * 0.35;
  const lean2 = (Math.cos(seed * 1.7) * 0.5) * 0.3;
  for (let i = 0; i < p.count; i++) {
    const ry = p.getY(i) + 0.5;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    // taper: a broad plinth that narrows upward, or a blocky mesa
    const taper = mesa ? 0.82 + 0.18 * (1 - ry) : 0.30 + 0.70 * (1 - ry) + 0.10 * Math.sin(ry * 3.1);
    // fluting: vertical ribs carved by wind, plus ledges every few metres
    const flute = 1 + 0.075 * Math.cos(a * 5 + seed * 2.1) + 0.045 * Math.cos(a * 9 + seed);
    const ledge = 1 + 0.075 * Math.sin(ry * 15 + seed * 3.7) + 0.05 * Math.sin(ry * 34 + seed);
    let k = taper * flute * ledge;
    k *= 1 + 0.24 * (fbm(Math.cos(a) * 1.7 + seed, Math.sin(a) * 1.7 + ry * 1.1, 3) - 0.5) * 2;
    p.setX(i, p.getX(i) * k + ry * lean);
    p.setZ(i, p.getZ(i) * k + ry * lean2);

    const band = smoothstep(0.0, 0.32, Math.abs(Math.sin(ry * 6.2 + seed * 2.1)));
    const c = new THREE.Color().copy(BAND.mid).lerp(BAND.dark, band * 0.75);
    c.lerp(BAND.lit, smoothstep(0.5, 1.0, ry) * 0.5);
    if (ry > 0.7 && fbm(a * 2 + seed, ry * 4, 2) > 0.52) c.lerp(BAND.moss, 0.4);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  p.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.translate(0, 0.5, 0);
  geo.computeVertexNormals();
  return geo;
}

export function createRockPool(material, count = 16) {
  const geos = Array.from({ length: 10 }, (_, i) => makeRockGeometry(i * 3.13 + 1, { mesa: i % 4 === 3 }));
  const pool = Array.from({ length: count }, () => {
    const m = new THREE.Mesh(geos[0], material);
    m.visible = false;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  });
  return {
    pool, geos,
    take() {
      const m = pool.find((x) => !x.visible);
      if (!m) return null;
      m.visible = true;
      return m;
    },
  };
}
