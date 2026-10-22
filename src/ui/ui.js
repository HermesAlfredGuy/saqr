// HUD + screens. DOM for crisp type, one accent colour, everything out of the flight path.
export function createUI(root) {
  const $ = (s) => root.querySelector(s);
  const screens = { title: $('#screen-title'), over: $('#screen-over') };
  const hud = $('#hud');
  const el = {
    score: $('#hud-score'), best: $('#hud-best'), speed: $('#hud-speed'),
    lift: $('#hud-lift'), liftBar: $('#hud-lift i'), liftNum: $('#hud-lift-num'),
    pops: $('#pops'), toast: $('#toast'), hint: $('#hint'),
    final: $('#final-score'), finalBest: $('#final-best'), finalThermals: $('#final-thermals'), finalDist: $('#final-dist'),
  };
  let lastScore = -1, hintShown = false, toastT = 0;

  return {
    show(name, S) {
      Object.entries(screens).forEach(([k, s]) => s.classList.toggle('is-on', k === name));
      hud.classList.toggle('is-on', name === 'play');
      if (name === 'over') {
        el.final.textContent = Math.round(S.score).toLocaleString('en-US');
        el.finalBest.textContent = Math.round(S.best).toLocaleString('en-US');
        el.finalThermals.textContent = S.rides;
        el.finalDist.textContent = `${Math.round(S.dist)} m`;
      }
      if (name === 'play') {
        if (!hintShown) { hintShown = true; el.hint.classList.add('on'); setTimeout(() => el.hint.classList.remove('on'), 4200); }
        el.best.textContent = Math.round(S.best).toLocaleString('en-US');
      }
    },
    hideHud() { hud.classList.remove('is-on'); },
    hud(S, sp01) {
      const sc = Math.round(S.score);
      if (sc !== lastScore) {
        el.score.textContent = sc.toLocaleString('en-US');
        el.score.classList.remove('bump'); void el.score.offsetWidth; el.score.classList.add('bump');
        lastScore = sc;
      }
      el.speed.textContent = Math.round(S.speed * 3.6);
      const riding = S.thermalRide > 0;
      el.lift.classList.toggle('on', riding);
      if (riding) {
        el.liftBar.style.transform = `scaleY(${Math.max(0.06, S.thermal)})`;
        el.liftNum.textContent = `+${Math.round(S.thermal * 100)}`;
      }
      if (toastT > 0) { toastT -= 1 / 60; if (toastT <= 0) el.toast.classList.remove('on'); }
    },
    pop(text, sub) {
      const p = document.createElement('div');
      p.className = 'pop';
      p.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
      el.pops.append(p);
      setTimeout(() => p.remove(), 1000);
    },
    toast(text) {
      el.toast.textContent = text;
      el.toast.classList.remove('on'); void el.toast.offsetWidth; el.toast.classList.add('on');
      toastT = 1.2;
    },
    flash() { root.classList.remove('hit'); void root.offsetWidth; root.classList.add('hit'); },
  };
}
