// Steering input. Phone: drag anywhere — the stick is the screen, with a drifting anchor so
// long swipes never saturate. Desktop: arrows / WASD. Everything reduces to two axes.
const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  boost: ['Space', 'ShiftLeft'], confirm: ['Enter', 'Space'], pause: ['Escape', 'KeyP'],
};

export function createInput() {
  const keys = new Set();
  const prev = new Set(), cur = new Set();
  const touch = { x: 0, y: 0, drag: false, id: null, ox: 0, oy: 0 };
  const injected = { x: 0, y: 0, actions: new Set() };

  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); touch.x = touch.y = 0; touch.drag = false; });

  const isDown = (a) => injected.actions.has(a) || (BINDINGS[a] || []).some((k) => keys.has(k));

  function setFromPointer(e) {
    const R = 72;
    let dx = (e.clientX - touch.ox) / R, dy = (e.clientY - touch.oy) / R;
    // drift the anchor when the thumb runs out of room, so the input never pins to +/-1
    if (Math.abs(dx) > 1) { touch.ox += (dx - Math.sign(dx)) * R; dx = Math.sign(dx); }
    if (Math.abs(dy) > 1) { touch.oy += (dy - Math.sign(dy)) * R; dy = Math.sign(dy); }
    touch.x = Math.max(-1, Math.min(1, dx));
    touch.y = Math.max(-1, Math.min(1, -dy));
    const stick = document.getElementById('stick');
    if (stick) {
      stick.classList.add('on');
      stick.style.transform = `translate(${touch.ox}px, ${touch.oy}px)`;
      const knob = stick.firstElementChild;
      if (knob) knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    }
  }

  const input = {
    injected,
    get touching() { return touch.drag; },
    poll(dt = 1 / 60) {
      prev.clear(); cur.forEach((a) => prev.add(a)); cur.clear();
      Object.keys(BINDINGS).forEach((a) => isDown(a) && cur.add(a));
      if (!touch.drag && (touch.x || touch.y)) {
        const k = Math.exp(-9 * dt);
        touch.x *= k; touch.y *= k;
        if (Math.abs(touch.x) < 0.01) touch.x = 0;
        if (Math.abs(touch.y) < 0.01) touch.y = 0;
      }
    },
    down: (a) => cur.has(a),
    pressed: (a) => cur.has(a) && !prev.has(a),
    axis(name) {
      let v = 0;
      if (name === 'moveX') v = (cur.has('right') ? 1 : 0) - (cur.has('left') ? 1 : 0) + touch.x + injected.x;
      if (name === 'moveY') v = (cur.has('up') ? 1 : 0) - (cur.has('down') ? 1 : 0) + touch.y + injected.y;
      return Math.max(-1, Math.min(1, v));
    },
    bindTouch(root) {
      const stick = document.getElementById('stick');
      root.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        touch.id = e.pointerId; touch.drag = true;
        touch.ox = e.clientX; touch.oy = e.clientY;
        touch.x = touch.y = 0;
        if (stick) {
          stick.style.transform = `translate(${touch.ox}px, ${touch.oy}px)`;
          stick.classList.add('on');
          const knob = stick.firstElementChild;
          if (knob) knob.style.transform = 'translate(0,0)';
        }
        try { root.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      }, { passive: true });
      root.addEventListener('pointermove', (e) => {
        if (!touch.drag || e.pointerId !== touch.id) return;
        setFromPointer(e);
      }, { passive: true });
      const end = (e) => {
        if (e.pointerId !== touch.id) return;
        touch.drag = false; touch.id = null;
        stick?.classList.remove('on');
      };
      root.addEventListener('pointerup', end, { passive: true });
      root.addEventListener('pointercancel', end, { passive: true });
    },
  };
  return input;
}
