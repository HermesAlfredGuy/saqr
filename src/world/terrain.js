// The Asir escarpment: a winding valley cut into layered rock, juniper slopes and terraced
// lower hills. One shared height function drives geometry, collision and prop placement,
// so nothing ever floats or sinks.
import * as THREE from 'three';
import { fbm, ridge, smoothstep, clamp } from './noise.js';

export const CORRIDOR = 21;      // half-width of the flyable air (cliffs start here)
export const TILE_LEN = 340;

export function valleyCenterX(z) {
  return Math.sin(z * 0.0055) * 26 + Math.sin(z * 0.017 + 1.7) * 9 + Math.sin(z * 0.0013) * 18;
}
export function corridorOffset(x, z) { return x - valleyCenterX(z); }

export function groundHeight(x, z) {
  const d = corridorOffset(x, z);
  const ad = Math.abs(d);
  const floor = fbm(x * 0.028, z * 0.028) * 7 - 3.2 + Math.sin(ad * 0.09) * 1.1;
  const bed = -2.2 * Math.exp(-(ad * ad) / 90);                 // dry wadi down the middle
  const w = smoothstep(CORRIDOR - 2, CORRIDOR + 26, ad);         // escarpment face
  const r = ridge(x * 0.013 + 7, z * 0.013, 4);
  const h = 16 + 82 * r + 46 * fbm(x * 0.005, z * 0.005, 3);
  const wall = Math.pow(w, 1.12) * h;
  const terraces = w * (1 - w) * 4.2 * Math.sin(ad * 0.5 + fbm(x * 0.05, z * 0.05) * 2.2);
  return floor + bed + wall + terraces;
}

const C = {
  rockLit: new THREE.Color('#c08d68'),
  rockMid: new THREE.Color('#8f6248'),
  rockDark: new THREE.Color('#4d3634'),
  juniper: new THREE.Color('#41552f'),
  olive: new THREE.Color('#5f6b37'),
  dry: new THREE.Color('#8a7550'),
  terrace: new THREE.Color('#7d6047'),
};

export function terrainMaterials(tex) {
  const normalMap = tex.rockNor;
  const rough = tex.rockRough;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: rough,
  });
  if (normalMap) { normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping; normalMap.repeat.set(34, 46); }
  if (rough) { rough.wrapS = rough.wrapT = THREE.RepeatWrapping; rough.repeat.set(34, 46); }
  return mat;
}

const tmpN = new THREE.Color();

export function createTerrainTile(material) {
  const geo = new THREE.PlaneGeometry(300, TILE_LEN, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;

  const col = new THREE.Color();
  mesh.userData.rebuild = (zOffset) => {
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i) + zOffset));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i) + zOffset;
      const ny = nor.getY(i);
      const slope = clamp(1 - (ny - 0.45) / 0.5, 0, 1);       // 0 flat .. 1 cliff
      const alt = clamp((y + 4) / 70, 0, 1);
      const mott = fbm(x * 0.11, z * 0.11, 3);
      // flat ground: dry valley grass low down, juniper higher up; cliff faces: rock
      col.copy(C.dry).lerp(C.olive, smoothstep(0.15, 0.6, alt) * 0.85);
      col.lerp(C.juniper, smoothstep(0.05, 0.5, alt) * 0.7 * (1 - slope));
      col.lerp(C.terrace, smoothstep(0.5, 0.78, mott) * (1 - slope) * 0.55);
      tmpN.copy(C.rockMid).lerp(C.rockLit, smoothstep(0.52, 0.82, mott));
      tmpN.lerp(C.rockDark, smoothstep(0.62, 0.95, 1 - ny) * 0.55);
      col.lerp(tmpN, smoothstep(0.28, 0.62, slope));
      const shade = 0.86 + mott * 0.28;
      colors[i * 3] = col.r * shade; colors[i * 3 + 1] = col.g * shade; colors[i * 3 + 2] = col.b * shade;
    }
    geo.attributes.color.needsUpdate = true;
    geo.computeBoundingSphere();
    mesh.position.z = zOffset;
  };
  return mesh;
}

// A single warm rock material for the pinnacles, using the CC0 rock-face set.
export function rockMaterial(tex, { repeat = 3 } = {}) {
  const map = tex.rockDiff ? tex.rockDiff.clone() : null;
  const nor = tex.rockNor ? tex.rockNor.clone() : null;
  if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(repeat, repeat * 2); map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; }
  if (nor) { nor.wrapS = nor.wrapT = THREE.RepeatWrapping; nor.repeat.set(repeat, repeat * 2); nor.needsUpdate = true; }
  return new THREE.MeshStandardMaterial({
    color: '#c09079', map, normalMap: nor,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.92, metalness: 0, vertexColors: true,
  });
}
