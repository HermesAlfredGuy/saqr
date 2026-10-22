// SAQR — the game. One fixed-step simulation: steer, stoop, ride thermals, dodge rock.
import * as THREE from 'three';
import { ChaseCamera, Particles, hitStop } from '../engine/juice.js';
import { createTerrainTile, terrainMaterials, rockMaterial, groundHeight, valleyCenterX, corridorOffset, CORRIDOR, TILE_LEN } from '../world/terrain.js';
import { createRockPool } from '../world/rocks.js';
import { createThermalField } from '../world/thermal.js';
import { createFalcon } from '../world/falcon.js';
import { createMotes, createMist, createFlock, createScrub } from '../world/ambient.js';
import { clamp } from '../world/noise.js';

export const TUNING = {
  speed: 27, minSpeed: 18, maxSpeed: 46,
  turnMax: 21, turnLambda: 4.6,
  climbMax: 16, climbLambda: 5.0,
  diveGain: 11, energyLambda: 0.5,
  minAlt: 3.0, maxAlt: 54,
  thermalLift: 15, thermalScore: 78,
  nearMissBonus: 25,
  rockSpacing: [40, 62], thermalSpacing: [66, 104],
};


// World layout gets its own seeded RNG (?seed=), so a run can be replayed frame-for-frame in QA
// even though particles and motes keep drawing from Math.random.
function makeWorldRand(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const worldRand = makeWorldRand(Number(new URLSearchParams(location.search).get('seed')) || 20261022);

export function createGame({ scene, camera, sky, audio, input, loop, ui, tex }) {
  // ---------- world ----------
  const terrainMat = terrainMaterials(tex);
  const tiles = [0, 1, 2].map((i) => {
    const t = createTerrainTile(terrainMat);
    t.userData.rebuild(-i * TILE_LEN);
    scene.add(t);
    return t;
  });

  const rockMat = rockMaterial(tex, { repeat: 2.6 });
  const rocks = createRockPool(rockMat, 26);
  rocks.pool.forEach((m) => { m.visible = false; scene.add(m); });

  const thermals = createThermalField(scene, { count: 4 });
  const falcon = createFalcon();
  falcon.root.scale.setScalar(1.45);
  scene.add(falcon.root);
  // hero rim: a light that only touches the bird, so its edges hold against any rock behind it
  const rim = new THREE.DirectionalLight('#ffd9ae', 3.1);
  rim.position.set(-24, 14, -34);
  rim.layers.set(1);
  scene.add(rim, rim.target);
  falcon.root.traverse((o) => o.layers.enable(1));
  camera.layers.enable(1);
  const fx = new Particles(scene, 1400);
  fx.camera = camera;
  const motes = createMotes(scene, 220);
  const mist = createMist(scene, 7);
  const flock = createFlock(scene, 14);
  const scrub = createScrub(scene, { trees: 340, stones: 180 });

  const cam = new ChaseCamera(camera, { offset: new THREE.Vector3(0, 1.85, 7.0), lookAhead: 21, lookLift: 2.1, stiffness: 5.4, baseFov: 62 });

  // each rock: world position + collision cylinder
  const units = [];   // { mesh, x, z, r, top, scored }

  const S = {
    state: 'title', score: 0, best: 0, time: 0, dist: 0, speed: TUNING.speed,
    pos: new THREE.Vector3(0, 22, 0), prev: new THREE.Vector3(0, 22, 0),
    vel: new THREE.Vector3(), vy: 0, bank: 0, pitch: 0, yaw: 0,
    thermal: 0, thermalRide: 0, rides: 0, insideThermal: null, rideCount: 0,
    invuln: 0, crashT: 0, shakeT: 0, autoplay: false, botCrashAt: 0, hint: 0,
    nextRockZ: -70, nextThermalZ: -110, driveByTouch: false, botAxes: { x: 0, y: 0 },
  };
  try { S.best = +localStorage.getItem('saqr-best') || 0; } catch { /* private mode */ }

  const heading = new THREE.Quaternion();
  const camFrame = new THREE.Quaternion();
  const e3 = new THREE.Euler();
  const tmpV = new THREE.Vector3();

  function reset() {
    S.score = 0; S.time = 0; S.dist = 0; S.speed = TUNING.speed; S.vel.set(0, 0, 0); S.vy = 0;
    S.bank = S.pitch = S.yaw = 0; S.thermal = 0; S.thermalRide = 0; S.rideCount = 0; S.rides = 0;
    S.invuln = 0; S.crashT = 0; S.insideThermal = null;
    S.pos.set(0, 24, 0); S.prev.copy(S.pos);
    S.nextRockZ = -80; S.nextThermalZ = -120;
    for (const u of units) { u.mesh.visible = false; }
    units.length = 0;
    rocks.pool.forEach((m) => (m.visible = false));
    thermals.list.forEach((t) => { t.group.visible = false; t.active = false; });
    tiles.forEach((t, i) => t.userData.rebuild(-i * TILE_LEN));
    loop.timeScale = 1;
    scrub.seed(S.pos);
    cam.snap({ position: S.pos, quaternion: heading });
  }

  // ---------- spawning ----------
  function placeRock(x, z, r, h, flatten = 1, rot = 0) {
    const mesh = rocks.take();
    if (!mesh) return null;
    mesh.geometry = rocks.geos[Math.floor(worldRand() * rocks.geos.length)];
    const baseY = groundHeight(x, z) - 3;
    mesh.position.set(x, baseY, z);
    mesh.scale.set(r, h + 3, r * flatten);
    mesh.rotation.y = rot;
    const u = { mesh, x, z, r: r * Math.max(1, flatten), rMin: r * Math.min(1, flatten), top: baseY + h + 3, scored: false };
    units.push(u);
    return u;
  }

  function spawnCluster(z) {
    const cx = valleyCenterX(z);
    const roll = worldRand();
    if (roll < 0.34) {
      // gate: one shoulder each side, a clean gap down the middle
      const r1 = 3.2 + worldRand() * 2.4, r2 = 3 + worldRand() * 2.4;
      placeRock(cx - CORRIDOR + r1, z, r1, 34 + worldRand() * 26, 0.8 + worldRand() * 0.5);
      placeRock(cx + CORRIDOR - r2, z + (worldRand() - 0.5) * 12, r2, 30 + worldRand() * 30, 0.8 + worldRand() * 0.5);
    } else if (roll < 0.62) {
      // lone fin, off-centre: read the gap, commit
      const side = worldRand() < 0.5 ? -1 : 1;
      const r = 2.6 + worldRand() * 2.2;
      placeRock(cx + side * (10 + worldRand() * 5), z, r, 24 + worldRand() * 28, 0.55 + worldRand() * 0.5);
    } else if (roll < 0.82) {
      // low shelf: fly over it, or thread the sides
      const side = worldRand() < 0.5 ? -1 : 1;
      const r = 5 + worldRand() * 3;
      placeRock(cx + side * (8 + worldRand() * 5), z, r, 10 + worldRand() * 5, 1.5);
    } else {
      // slalom pair, staggered in depth
      const side = worldRand() < 0.5 ? -1 : 1;
      const r = 2.8 + worldRand() * 1.8;
      placeRock(cx + side * (10 + worldRand() * 4), z, r, 30 + worldRand() * 26);
      placeRock(cx - side * (11 + worldRand() * 5), z - 26, r * 0.9, 26 + worldRand() * 28);
    }
  }

  function spawnThermal(z) {
    const t = thermals.list.find((k) => !k.group.visible);
    if (!t) return;
    const x = valleyCenterX(z) + (worldRand() - 0.5) * 20;
    const bx = groundHeight(x, z) + 2;
    thermals.place(t, x, bx, z, 7.5 + worldRand() * 3.2, 58 + worldRand() * 16);
  }

  // ---------- scoring ----------
  function addScore(n) { S.score += n; }

  function enterThermal(t) {
    t.active = true; S.insideThermal = t; S.thermalRide = 0; S.rideCount++;
    audio.play('thermal');
    ui.toast('THERMAL');
    cam.addTrauma(0.1);
  }
  function leaveThermal(t) {
    t.active = false;
    if (S.thermalRide > 0.35) {
      const bonus = Math.round(S.thermalRide * 150) + 60;
      addScore(bonus);
      S.rides++;
      ui.pop(`SOAR +${bonus}`);
      audio.play('soar');
      cam.fovKick += 4;
    }
    S.insideThermal = null; S.thermalRide = 0;
  }

  function nearMiss(u) {
    addScore(TUNING.nearMissBonus);
    audio.play('whoosh');
    ui.pop(`+${TUNING.nearMissBonus}`, 'CLOSE');
    cam.addTrauma(0.18);
  }

  function crash(u) {
    if (S.state !== 'play') return;
    S.state = 'crash'; S.crashT = 0; S.shakeT = 0;
    S.vel.set(-S.vel.x * 0.3, 0, 0);
    S.vy = 4;
    audio.play('crash');
    cam.addTrauma(1);
    hitStop(loop, 120, 0.08);
    fx.burst(S.pos, { count: 46, speed: 15, color: new THREE.Color(3.8, 2.5, 1.6), life: 1.1, size: 0.34, grav: -7, drag: 1.4 });
    // rock debris: few, big, heavy — this is what makes it read as impact rather than sparkle
    fx.burst(S.pos, { count: 16, speed: 9.5, color: new THREE.Color(1.9, 1.15, 0.72), life: 1.9, size: 1.25, grav: -13, drag: 0.7 });
    // torn feathers, light and slow
    fx.burst(S.pos, { count: 14, speed: 5.5, color: new THREE.Color(3.4, 3.1, 2.8), life: 2.2, size: 0.5, grav: -1.6, drag: 2.6 });
    // dust plume lifting off the rock
    fx.burst(S.pos, { count: 12, speed: 2.4, color: new THREE.Color(1.5, 0.85, 0.5), life: 2.6, size: 2.6, grav: 0.9, drag: 1.1 });
    ui.flash();
    ui.hideHud();
  }

  function over() {
    S.state = 'over';
    if (S.score > S.best) { S.best = Math.round(S.score); try { localStorage.setItem('saqr-best', S.best); } catch { /* ignore */ } }
    ui.show('over', S);
    loop.timeScale = 1;
  }

  function start() {
    reset();
    S.state = 'play'; S.hint = 3.4;
    audio.play('start');
    ui.show('play', S);
    cam.snap({ position: S.pos, quaternion: heading });
  }

  // ---------- autopilot (QA + attract mode) ----------
  function bot(dt) {
    const px = S.pos.x, py = S.pos.y, pz = S.pos.z;
    const tt = loop.time;
    let targetX = valleyCenterX(pz - 45) + Math.sin(tt * 0.55) * 5;
    let targetY = 30 + Math.sin(tt * 0.42) * 7;
    let bestZ = -1e9;
    for (const t of thermals.list) {
      if (!t.group.visible) continue;
      const dz = pz - t.z;
      if (dz > -10 && dz < 95 && dz > bestZ) { bestZ = dz; targetX = t.x; targetY = clamp(t.baseY + t.height * 0.5, 14, 46); }
    }
    // steer around towers that are close ahead
    for (const u of units) {
      if (!u.mesh.visible) continue;
      const dz = pz - u.z;
      if (dz < -6 || dz > 54) continue;
      const gap = Math.abs(px - u.x);
      const danger = u.r + 5.5;
      if (gap < danger && py < u.top + 2) {
        const dir = px >= u.x ? 1 : -1;
        const w = 1 - dz / 54;
        targetX = px + dir * (danger - gap + 9) * w * 1.35;
        if (u.top < py + 6) targetY = u.top + 8;      // low shelf: hop it
      }
    }
    // QA: after a set time the bot "misjudges" and flies into a tower — real collision, real crash
    if (S.botCrashAt > 0 && S.time > S.botCrashAt) {
      let near = null, nd = 1e9;
      for (const u of units) {
        const dz = pz - u.z;
        if (dz < 4 || dz > 40) continue;
        if (dz < nd) { nd = dz; near = u; }
      }
      if (near) { targetX = near.x; targetY = Math.min(near.top - 4, py); }
    }
    const ax = clamp((targetX - px) / 7, -1, 1);
    const ay = clamp((targetY - py) / 5.5, -1, 1);
    if (S.driveByTouch) { S.botAxes.x = ax; S.botAxes.y = ay; }
    else { input.injected.x = ax; input.injected.y = ay; }
  }

  // ---------- update ----------
  function update(dt) {
    input.poll(dt);
    const playing = S.state === 'play';
    const attract = S.state === 'title';

    // world streaming (always, so title/over screens still live)
    if (S.state === 'play' || S.state === 'title') {
      while (S.nextRockZ > S.pos.z - 320) { spawnCluster(S.nextRockZ); S.nextRockZ -= TUNING.rockSpacing[0] + worldRand() * (TUNING.rockSpacing[1] - TUNING.rockSpacing[0]); }
      while (S.nextThermalZ > S.pos.z - 330) { spawnThermal(S.nextThermalZ); S.nextThermalZ -= TUNING.thermalSpacing[0] + worldRand() * (TUNING.thermalSpacing[1] - TUNING.thermalSpacing[0]); }
    }
    // retire passed towers and drop them from the live list, otherwise dead units pile up and
    // the autopilot (and collision pass) keeps dodging rocks that are no longer in the world
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (u.z > S.pos.z + 30) { u.mesh.visible = false; units.splice(i, 1); }
    }
    for (const t of thermals.list) if (t.group.visible && t.z > S.pos.z + 40) { t.group.visible = false; t.active = false; }
    for (const t of tiles) if (t.position.z > S.pos.z + TILE_LEN * 0.55) {
      const min = Math.min(...tiles.map((o) => o.position.z));
      t.userData.rebuild(min - TILE_LEN);
    }

    if (playing || attract) {
      if (playing && S.autoplay) bot(dt);
      if (attract) bot(dt);

      const ax = input.axis('moveX'), ay = input.axis('moveY');
      S.prev.copy(S.pos);

      // lateral: inertia with a firm centre — it answers fast but never snaps
      S.vel.x = THREE.MathUtils.damp(S.vel.x, ax * TUNING.turnMax, TUNING.turnLambda, dt);
      S.vy = THREE.MathUtils.damp(S.vy, ay * TUNING.climbMax, TUNING.climbLambda, dt);

      // energy: diving builds speed, climbing spends it (the falcon economy)
      const dive = clamp(-ay, 0, 1);
      S.speed += (dive * TUNING.diveGain - (S.speed - TUNING.speed) * TUNING.energyLambda) * dt;
      S.speed = clamp(S.speed, TUNING.minSpeed, TUNING.maxSpeed);

      S.pos.x += S.vel.x * dt;
      S.pos.z -= S.speed * dt;
      S.pos.y += S.vy * dt;

      // thermal lift + score
      let inside = null;
      for (const t of thermals.list) {
        if (!t.group.visible) continue;
        const dx = S.pos.x - t.x, dz = S.pos.z - t.z;
        const inCol = dx * dx + dz * dz < (t.radius * 0.95) ** 2 && S.pos.y > t.baseY + 1 && S.pos.y < t.baseY + t.height;
        t.active = inCol;
        if (inCol) inside = t;
      }
      if (inside) {
        if (S.insideThermal !== inside) enterThermal(inside);
        S.thermalRide += dt;
        S.pos.y += (TUNING.thermalLift * (1 - clamp(S.thermalRide / 2.4, 0, 0.5))) * dt;
        S.vy = THREE.MathUtils.damp(S.vy, 7, 2.5, dt);
        addScore(TUNING.thermalScore * dt);
        if (playing) {
          S.thermal = clamp(S.thermalRide / 2.2, 0, 1);
          if (Math.random() < 0.5) fx.trail(tmpV.set(S.pos.x + (Math.random() - 0.5) * 2, S.pos.y - 1.2, S.pos.z + 1.5), new THREE.Vector3(0, 6 + Math.random() * 5, 0), new THREE.Color(2.2, 1.3, 0.6), 0.18, 0.55);
        }
      } else if (S.insideThermal) {
        leaveThermal(S.insideThermal);
      }

      // valley walls: soft shoulder, then rock
      const d = corridorOffset(S.pos.x, S.pos.z);
      if (Math.abs(d) > CORRIDOR - 5) {
        const over = Math.abs(d) - (CORRIDOR - 5);
        S.pos.x -= Math.sign(d) * over * 1.6 * dt * 4;
        S.vel.x *= 0.9;
      }
      const ground = groundHeight(S.pos.x, S.pos.z);
      if (S.pos.y < ground + TUNING.minAlt) {
        S.pos.y = ground + TUNING.minAlt;
        if (S.vy < 0) S.vy *= -0.15;
        if (playing && S.speed > 26 && Math.random() < 0.35) fx.trail(tmpV.set(S.pos.x, S.pos.y - 0.6, S.pos.z + 1), new THREE.Vector3(0, 2.2, 6), new THREE.Color(2.4, 1.6, 1.0), 0.5, 0.5);
      }
      if (S.pos.y > TUNING.maxAlt) { S.pos.y = TUNING.maxAlt; S.vy = Math.min(S.vy, 0); }

      S.bank = THREE.MathUtils.damp(S.bank, -S.vel.x * 0.052 - ax * 0.16, 5.2, dt);
      S.pitch = THREE.MathUtils.damp(S.pitch, -S.vy * 0.026 - (S.speed - TUNING.speed) * 0.004, 6, dt);
      S.yaw = THREE.MathUtils.damp(S.yaw, -S.vel.x * 0.012, 4, dt);

      if (playing) {
        S.time += dt; S.dist += S.speed * dt;
        addScore(S.speed * dt * 0.9);                 // distance is the baseline, thermals are the jackpot
        S.invuln = Math.max(0, S.invuln - dt);
        if (S.hint > 0) S.hint -= dt;

        // collisions
        for (const u of units) {
          if (!u.mesh.visible) continue;
          const dz = S.pos.z - u.z;
          if (Math.abs(dz) > 26) continue;
          const dx = S.pos.x - u.x;
          const rad = Math.max(0.55, u.rMin * 0.9 + 0.55);
          const dist2 = (dx * dx) / (rad * rad) + (dz * dz) / (Math.max(1.2, u.r * 0.95) ** 2);
          if (S.pos.y < u.top && dist2 < 1) { crash(u); break; }
          if (!u.scored && Math.abs(dz) < 12 && Math.abs(dx) < u.r + 3.4 && S.pos.y < u.top + 3) {
            u.scored = true; nearMiss(u);
          }
        }
        if (S.state === 'play' && Math.abs(corridorOffset(S.pos.x, S.pos.z)) > CORRIDOR + 1.2) crash(null);
        if (S.state === 'play' && S.pos.y < ground + 1.2) crash(null);

        // speed streaks from the wingtips
        const sp01 = clamp((S.speed - TUNING.minSpeed) / (TUNING.maxSpeed - TUNING.minSpeed), 0, 1);
        if (sp01 > 0.45 && Math.random() < sp01 * 0.8) {
          const side = Math.random() < 0.5 ? -1 : 1;
          fx.trail(tmpV.set(S.pos.x + side * 1.35, S.pos.y + 0.1, S.pos.z + 0.4), new THREE.Vector3(side * 0.6, 0.4, 3.4), new THREE.Color(2.6, 2.2, 2.0), 0.09, 0.4);
        }
      }
    } else if (S.state === 'crash') {
      S.crashT += dt;
      S.prev.copy(S.pos);
      S.pos.y += S.vy * dt; S.vy -= 16 * dt;
      S.pos.x += S.vel.x * dt;
      S.pos.z -= S.speed * dt * 0.35;
      if (S.crashT > 0.55 && S.crashT - dt <= 0.55) { loop.timeScale = 0.55; }
      if (S.crashT > 1.7) { loop.timeScale = 1; over(); }
    }

    scrub.update(dt, S.pos);
    fx.update(dt);
    thermals.update(dt, loop.time);
  }

  // ---------- render ----------
  const fovBase = () => (camera.aspect < 0.85 ? 76 : 62);

  function render(frameDt, alpha) {
    const p = falcon.root.position.lerpVectors(S.prev, S.pos, alpha);
    e3.set(S.pitch, S.yaw, S.bank);
    falcon.root.quaternion.setFromEuler(e3);

    const sp01 = clamp((S.speed - TUNING.minSpeed) / (TUNING.maxSpeed - TUNING.minSpeed), 0, 1);
    const climbing = clamp(S.vy / TUNING.climbMax, 0, 1);
    const diving = clamp(-S.vy / TUNING.climbMax, 0, 1) * 0.5 + sp01 * 0.75;
    falcon.update(frameDt, { climb: climbing, dive: clamp(diving, 0, 1), speed01: sp01, flare: S.insideThermal ? 0.5 : 0 });

    // camera frame: heading + a slice of bank/pitch so the world tips without the horizon
    e3.set(S.pitch * 0.35, S.yaw * 0.6, S.bank * 0.24);
    camFrame.setFromEuler(e3);
    cam.baseFov = fovBase() + (S.state === 'title' ? -6 : 0);
    cam.offset.z = S.state === 'crash' ? 5.6 : 7.0 + sp01 * 1.7;
    cam.update({ position: p, quaternion: camFrame }, Math.max(frameDt, 1e-4), sp01 * 0.85);

    // title/over: slow orbit hero shot instead of a chase cam
    if (S.state === 'title' || S.state === 'over') {
      const t = performance.now() / 1000;
      const orbit = S.state === 'title' ? t * 0.16 : t * 0.05;
      const r = S.state === 'crash' ? 11 : 9.5;
      const desired = tmpV.set(
        p.x + Math.sin(orbit) * r * 0.85,
        p.y + 2.2 + Math.sin(t * 0.4) * 0.35,
        p.z + Math.cos(orbit) * r,
      );
      camera.position.lerp(desired, 1 - Math.exp(-3.2 * Math.max(frameDt, 1e-4)));
      camera.lookAt(p.x + Math.sin(orbit) * 0.6, p.y + 0.15, p.z);
      camera.fov = THREE.MathUtils.damp(camera.fov, fovBase() - 8, 3, Math.max(frameDt, 1e-4));
      camera.updateProjectionMatrix();
    }

    sky.update(frameDt, p);
    motes.update(frameDt, camera.position, camera.quaternion);
    mist.update(frameDt, p);
    flock.update(frameDt, p);
    if (audio.setWind) audio.setWind(sp01, S.state === 'play' || S.state === 'title');

    if (S.state === 'play') ui.hud(S, sp01);
  }

  return { S, update, render, start, reset, cam, tuning: TUNING, units };
}
