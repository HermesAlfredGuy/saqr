// Renderer + post stack. Colour pipeline: scene -> bloom + lens -> vignette/grain -> sRGB.
// Buffers are 8-bit on purpose: half-float targets break bloom's mipmap blur on software GL and
// on several mobile GPUs, and a black screen is worse than a little highlight clipping.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, SMAAEffect, NoiseEffect, BlendFunction, ChromaticAberrationEffect,
} from 'postprocessing';

export function createRenderer(canvas, { quality = 'auto' } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas, powerPreference: 'high-performance', antialias: false, stencil: false, depth: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const maxDpr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);

  const composer = new EffectComposer(renderer);
  const bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.86, luminanceSmoothing: 0.28, mipmapBlur: true, radius: 0.65 });
  const chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0005, 0.0005), radialModulation: true, modulationOffset: 0.35 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.LINEAR });
  const vignette = new VignetteEffect({ darkness: 0.32, offset: 0.42 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
  noise.blendMode.opacity.value = 0.07;
  const smaa = new SMAAEffect();

  function setScene(scene, camera) {
    composer.removeAllPasses();
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, bloom, chroma));
    composer.addPass(new EffectPass(camera, tone, vignette, noise, smaa));
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio?.(renderer.getPixelRatio());
    composer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  resize();

  // adaptive resolution: hold frame rate on phones rather than hold pixels
  let acc = 0, frames = 0;
  function adapt(dt) {
    acc += dt; frames++;
    if (acc < 1) return;
    const fps = frames / acc; acc = 0; frames = 0;
    if (fps < 52 && dpr > 0.7) dpr = Math.max(0.7, dpr - 0.15);
    else if (fps > 58 && dpr < maxDpr) dpr = Math.min(maxDpr, dpr + 0.1);
    else return;
    renderer.setPixelRatio(dpr);
    resize();
  }

  return {
    renderer, composer, bloom, chroma, vignette, setScene, resize,
    render(dt) { adapt(dt); composer.render(dt); },
  };
}
