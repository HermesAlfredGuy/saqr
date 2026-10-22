import './style.css';
import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { valleyCenterX, corridorOffset } from './world/terrain.js';
import { createAudio } from './engine/audio.js';
import { createSky } from './world/sky.js';
import { createUI } from './ui/ui.js';
import { createGame } from './game/game.js';

const params = new URLSearchParams(location.search);
const base = import.meta.env.BASE_URL;
const canvas = document.querySelector('#gl');
const app = document.querySelector('#app');

const gfx = createRenderer(canvas, { quality: params.get('quality') || 'auto' });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.25, 2600);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const sky = createSky(gfx.renderer, scene);
gfx.setScene(scene, camera);
window.__gfx = gfx; window.__scene = scene; window.__camera = camera;

const input = createInput();
input.bindTouch(app);
const audio = createAudio();
const ui = createUI(app);

const texLoader = new THREE.TextureLoader();
const loadTex = (file, srgb = false) => new Promise((res) => {
  texLoader.load(base + 'tex/' + file, (t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, gfx.renderer.capabilities.getMaxAnisotropy());
    res(t);
  }, undefined, () => res(null));
});

async function boot() {
  const [rockDiff, rockNor, rockRough] = await Promise.all([
    loadTex('rock_face_diff.jpg', true),
    loadTex('rock_face_nor_gl.jpg'),
    loadTex('rock_face_rough.jpg'),
  ]);
  const tex = { rockDiff, rockNor, rockRough };

  let game;
  const loop = createLoop({
    update: (dt) => game.update(dt),
    render: (frameDt, alpha) => { game.render(frameDt, alpha); gfx.render(frameDt); },
  });
  game = createGame({ scene, camera, sky, audio, input, loop, ui, tex });
  game.reset();
  ui.show('title', game.S);

  document.querySelector('#btn-start').addEventListener('click', () => { audio.play('start'); game.start(); });
  document.querySelector('#btn-retry').addEventListener('click', () => game.start());
  document.querySelectorAll('[data-mute]').forEach((b) => {
    b.setAttribute('aria-pressed', String(audio.muted));
    b.addEventListener('click', () => b.setAttribute('aria-pressed', String(audio.toggleMute())));
  });

  // QA hooks: deterministic stepping + a real autopilot, so a capture is genuine gameplay.
  window.__game = {
    S: game.S, loop, start: game.start, autoplay(on = true) { game.S.autoplay = on; },
    advance: (n) => loop.advance(n), update: game.update, render: game.render, tuning: game.tuning, units: game.units, input,
    world: { valleyCenterX, corridorOffset },
    setBotCrashAt: (t) => { game.S.botCrashAt = t; },
  };
  if (params.has('crashAfter')) game.S.botCrashAt = parseFloat(params.get('crashAfter')) || 0;
  if (params.has('autoplay')) { game.S.autoplay = true; game.start(); }

  document.querySelector('#loader').classList.add('ready');
  loop.start();
}

boot();

// Motion is always full: the OS reduced-motion setting is deliberately ignored (owner decision).
