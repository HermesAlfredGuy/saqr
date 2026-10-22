// Asir at last light: graded sunset sky with a low sun, lit cloud bands, layered distant
// ridges (aerial perspective), matching fog, and the key/fill rig that makes rock and feather
// read. No HDRI needed — the sky itself is baked into a PMREM for reflections.
import * as THREE from 'three';
import { fbm } from './noise.js';

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;              // pin to the far plane
}`;

const frag = /* glsl */`
precision highp float;
uniform vec3 topC, midC, horC, gndC, sunC, sunDir;
uniform float time;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horC, midC, smoothstep(0.0, 0.17, h));
  col = mix(col, topC, smoothstep(0.13, 0.66, h));
  col = mix(col, gndC, smoothstep(0.0, -0.16, h));

  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunC * (pow(s, 9.0) * 0.24 + pow(s, 48.0) * 0.55);
  col += sunC * pow(s, 2.0) * exp(-abs(h) * 26.0) * 0.3;      // horizon pillar of light
  col += sunC * smoothstep(0.99980, 0.99991, s) * 26.0;        // disc (HDR -> blooms)

  // lit cloud bands
  vec2 uv = vec2(atan(d.z, d.x) * 2.6 + time * 0.0035, h * 8.0);
  float n = fbm(uv * vec2(1.0, 1.7) + 13.0);
  float band = smoothstep(0.004, 0.05, h) * (1.0 - smoothstep(0.34, 0.70, h));
  float c = smoothstep(0.455, 0.76, n) * band;
  vec3 cloudCol = mix(vec3(0.10, 0.055, 0.10), sunC * 1.15, clamp(pow(s, 1.6) * 1.1 + 0.10, 0.0, 1.0));
  col = mix(col, cloudCol, c * 0.88);

  // high cirrus streaks catching the last light
  float st = fbm(vec2(atan(d.z, d.x) * 3.4, h * 26.0));
  float streak = smoothstep(0.60, 0.86, st) * smoothstep(0.20, 0.45, h) * (1.0 - smoothstep(0.66, 0.95, h));
  col = mix(col, mix(topC * 1.5, sunC * 0.85, 0.45), streak * 0.45);

  gl_FragColor = vec4(col, 1.0);
}`;

const PAL = {
  zenith: '#241a40', mid: '#8a3f58', horizon: '#ff8f4d', ground: '#3f2430', sun: '#ffeccd',
};

function ridgeLayer({ width, baseY, seed, height, colorA, colorB, notchX, notchW, z, sunColor }) {
  const N = 110;
  const pos = [], col = [], idx = [];
  const cA = new THREE.Color(colorA), cB = new THREE.Color(colorB);
  const cS = new THREE.Color(sunColor);
  const tmp = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (t - 0.5) * width;
    const u = (x / width) * 9 + seed;
    let h = height * (0.42 + 0.58 * fbm(u, seed * 0.7, 4));
    h *= 0.62 + 0.55 * Math.abs(Math.sin(x * 0.0035 + seed * 3.1));
    // swing a saddle under the sun so the disc always sits in the range, never on a spike
    const notch = 1 - 0.72 * Math.exp(-Math.pow((x - notchX) / notchW, 2));
    h *= notch;
    const topY = baseY + h;
    pos.push(x, topY, 0, x, baseY - 260, 0);
    const lit = 1 - Math.min(1, Math.abs(x - notchX) / (width * 0.42));
    tmp.copy(cA).lerp(cS, lit * 0.45);
    col.push(tmp.r, tmp.g, tmp.b);
    tmp.copy(cB).lerp(cS, lit * 0.28);
    col.push(tmp.r, tmp.g, tmp.b);
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: true }));
  mesh.position.z = z;
  mesh.frustumCulled = false;
  return mesh;
}

export function createSky(renderer, scene, { sunElevation = 13, sunAzimuth = 186 } = {}) {
  const sunDir = new THREE.Vector3()
    .setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sunElevation), THREE.MathUtils.degToRad(sunAzimuth));

  const uniforms = {
    topC: { value: new THREE.Color(PAL.zenith) },
    midC: { value: new THREE.Color(PAL.mid) },
    horC: { value: new THREE.Color(PAL.horizon) },
    gndC: { value: new THREE.Color(PAL.ground) },
    sunC: { value: new THREE.Color(PAL.sun) },
    sunDir: { value: sunDir.clone() },
    time: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 32),
    new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, side: THREE.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // Fog matches the horizon so the terrain dissolves into the sky, not into grey.
  scene.fog = new THREE.FogExp2(new THREE.Color('#e08a5e'), 0.0020);

  // Environment reflections from the sky itself.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 24), sky.material);
  envScene.add(envSky);
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  // distant ranges, three layers of aerial perspective
  const far = new THREE.Group();
  far.matrixAutoUpdate = true;
  const layers = [
    { z: -430, width: 1500, height: 95, baseY: 4, seed: 3.1, colorA: '#5f3d4b', colorB: '#8d5c66', notchX: -110, notchW: 240 },
    { z: -640, width: 2100, height: 125, baseY: 10, seed: 8.7, colorA: '#7d515b', colorB: '#a8737a', notchX: -165, notchW: 320 },
    { z: -880, width: 2800, height: 165, baseY: 18, seed: 15.4, colorA: '#a06c70', colorB: '#c9948c', notchX: -230, notchW: 420 },
  ];
  const ridges = layers.map((L) => {
    const m = ridgeLayer({ ...L, sunColor: '#ffd0a0' });
    far.add(m);
    return { mesh: m, L };
  });
  scene.add(far);

  const hemi = new THREE.HemisphereLight('#8ea6cc', '#6b4636', 1.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#ffb96e', 4.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 320;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  // warm bounce off the lit rock, aimed back at the bird so its silhouette never goes to mud
  const fill = new THREE.DirectionalLight('#b9c3d8', 2.0);
  fill.position.set(36, 42, 70);
  scene.add(fill, fill.target);

  return {
    sky, sun, hemi, fill, sunDir, far, ridges,
    update(dt, pos) {
      uniforms.time.value += dt;
      sky.position.copy(pos);
      far.position.set(pos.x * 0.55, 0, pos.z);
      // parallax: nearer layers track the player's lateral drift more than far ones
      ridges[0].mesh.position.x = -pos.x * 0.55;
      ridges[1].mesh.position.x = -pos.x * 0.45;
      ridges[2].mesh.position.x = -pos.x * 0.35;
      sun.target.position.copy(pos);
      sun.position.copy(pos).addScaledVector(sunDir, 140);
      fill.target.position.copy(pos);
      fill.position.set(pos.x + 36, pos.y + 42, pos.z + 70);
    },
  };
}
