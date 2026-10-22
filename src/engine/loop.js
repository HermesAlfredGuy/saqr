// Fixed-timestep simulation with render interpolation (Gaffer On Games, "Fix Your Timestep").
// Game logic runs at a stable 60 Hz regardless of display rate; rendering gets `alpha`
// to interpolate between the previous and current physics states.
// `timeScale` enables hit-stop / slow-mo without touching game code.
export function createLoop({ update, render, step = 1 / 60, maxSteps = 5 }) {
  let acc = 0, last = performance.now(), running = false, raf = 0;
  const loop = {
    timeScale: 1,
    time: 0,
    paused: false,
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(tick); },
    stop() { running = false; cancelAnimationFrame(raf); },
    // Deterministic stepping for automated tests/QA capture: advance n fixed steps.
    advance(n = 1, frameDt = 1 / 30) { for (let i = 0; i < n; i++) { update(step); loop.time += step; } render(frameDt, 1); },
  };
  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    let frame = Math.min((now - last) / 1000, 0.25); // clamp spikes (tab switch, GC)
    last = now;
    if (!loop.paused) {
      acc += frame * loop.timeScale;
      let n = 0;
      while (acc >= step && n < maxSteps) { update(step); loop.time += step; acc -= step; n++; }
      if (n === maxSteps) acc = 0; // spiral-of-death guard
    }
    render(frame, acc / step);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  return loop;
}
