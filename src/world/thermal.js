// Thermals: columns of warm rising air. Air is invisible, so it is drawn as light — a soft
// volumetric shaft plus dust motes spiralling up it, all on the GPU (no per-frame CPU work).
import * as THREE from 'three';

const columnVert = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const columnFrag = /* glsl */`
precision highp float;
uniform vec3 col; uniform float time, intensity;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=noise(p)*a; p*=2.1; a*=0.5;} return s; }
void main() {
  vec2 p = vec2(vUv.x * 7.0, vUv.y * 2.4 - time * 0.42);
  float n = fbm(p + fbm(p * 1.7) * 1.2);
  float filaments = smoothstep(0.42, 0.82, n);
  float vfade = smoothstep(0.0, 0.10, vUv.y) * (1.0 - smoothstep(0.62, 1.0, vUv.y));
  float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
  float a = filaments * vfade * (0.22 + 0.55 * facing) * intensity;
  vec3 c = col * (0.55 + n * 1.5) * (0.6 + facing * 0.9);
  gl_FragColor = vec4(c * a, a);
}`;

const moteVert = /* glsl */`
attribute float aAngle, aRadius, aSpeed, aPhase, aSize;
uniform float time, intensity;
varying float vA;
void main() {
  float t = fract(aPhase + time * aSpeed);
  float ang = aAngle + t * 7.0;
  float rr = aRadius * (0.35 + t * 0.75);
  vec3 pos = vec3(cos(ang) * rr, t, sin(ang) * rr);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (240.0 / max(1.0, -mv.z)) * (0.6 + t * 0.8);
  vA = (1.0 - t) * smoothstep(0.0, 0.12, t) * intensity;
}`;

const moteFrag = /* glsl */`
precision highp float;
uniform vec3 col;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.0, length(d));
  gl_FragColor = vec4(col * m * m * vA, m * m * vA * 0.9);
}`;

export function createThermalField(scene, { count = 4 } = {}) {
  const list = [];
  const col = new THREE.Color('#ffc186');
  const geoCol = new THREE.CylinderGeometry(1, 1, 1, 26, 1, true);

  function spawn() {
    const group = new THREE.Group();
    const uni = { time: { value: 0 }, intensity: { value: 1 }, col: { value: col.clone() } };
    const shaft = new THREE.Mesh(geoCol, new THREE.ShaderMaterial({
      vertexShader: columnVert, fragmentShader: columnFrag, uniforms: uni,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    shaft.renderOrder = 3;
    group.add(shaft);

    const N = 110;
    const g = new THREE.BufferGeometry();
    const ang = new Float32Array(N), rad = new Float32Array(N), spd = new Float32Array(N), ph = new Float32Array(N), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      ang[i] = Math.random() * Math.PI * 2;
      rad[i] = 0.15 + Math.random() * 0.95;
      spd[i] = 0.06 + Math.random() * 0.10;
      ph[i] = Math.random();
      sz[i] = 0.5 + Math.random() * 1.5;
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aAngle', new THREE.BufferAttribute(ang, 1));
    g.setAttribute('aRadius', new THREE.BufferAttribute(rad, 1));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const motes = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: moteVert, fragmentShader: moteFrag, uniforms: uni,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    motes.frustumCulled = false;
    motes.renderOrder = 4;
    group.add(motes);

    group.visible = false;
    scene.add(group);
    const t = { group, uni, radius: 9, height: 62, active: false, ride: 0, x: 0, z: 0, baseY: 0 };
    list.push(t);
    return t;
  }
  for (let i = 0; i < count; i++) spawn();

  return {
    list,
    place(t, x, baseY, z, radius = 9, height = 62) {
      t.x = x; t.z = z; t.baseY = baseY; t.radius = radius; t.height = height;
      t.group.position.set(x, baseY, z);
      t.group.scale.set(radius, height, radius);
      t.group.visible = true;
      t.uni.intensity.value = 1;
    },
    hide(t) { t.group.visible = false; },
    update(dt, time) {
      for (const t of list) {
        if (!t.group.visible) continue;
        t.uni.time.value = time;
        t.uni.intensity.value += ((t.active ? 2.1 : 1.0) - t.uni.intensity.value) * Math.min(1, dt * 5);
      }
    },
  };
}
