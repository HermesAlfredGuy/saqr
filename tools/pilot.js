// Pilot logic shared by the dry run and the recorder. Runs inside the page.
export const PILOT_SRC = `
window.__pilotStep = function (g, S) {
  const px = S.pos.x, py = S.pos.y, pz = S.pos.z;
  const cx0 = g.world.valleyCenterX(pz - 34);
  let ax = S.botAxes.x, ay = S.botAxes.y;

  if (S.time >= 19.5) {
    // finale: pick the tallest mass ahead, aim for its face and hold altitude — real collision
    let near = null, best = -1;
    for (const u of g.units) {
      const dz = pz - u.z;
      if (dz < 8 || dz > 85) continue;
      const score = Math.min(u.top, 60) - Math.abs(px - u.x) * 0.35 - dz * 0.05;
      if (score > best) { best = score; near = u; }
    }
    if (near) {
      ax = Math.max(-1, Math.min(1, (near.x - px) / 2.5));
      ay = Math.max(-1, Math.min(1, (Math.min(near.top * 0.6, 26) - py) / 4));
    } else {
      ax = 1; ay = 0.3;                        // no tower in reach: take the wall instead
    }
    return { ax, ay };
  }

  const threats = g.units
    .map((u) => ({ x: u.x, z: u.z, r: u.r, top: u.top, dz: pz - u.z }))
    .filter((u) => u.dz > -6 && u.dz < 80 && py < u.top + 3);
  if (threats.length) {
    let best = 0, bestScore = -1e9;
    for (let off = -13; off <= 13; off += 2.6) {
      const cx = cx0 + off;
      let sc = -Math.abs(off) * 0.3;
      for (const u of threats) {
        const w = 1 - u.dz / 80;
        sc += Math.min((Math.abs(cx - u.x) - u.r - 2) / 2.5, 7) * w;
      }
      if (sc > bestScore) { bestScore = sc; best = cx - px; }
    }
    const want = Math.max(-1, Math.min(1, best / 4));
    ax = ax * 0.25 + want * 0.85;
    ax = Math.max(-1, Math.min(1, ax));
    const shelf = threats.find((u) => u.dz > 5 && u.dz < 30 && u.top < py + 2 && Math.abs(px - u.x) < u.r + 7);
    if (shelf) ay = Math.max(ay, 0.85);
  }
  // stay off the deck and out of the walls
  const corr = g.world.corridorOffset(px, pz);
  if (Math.abs(corr) > 12) ax = Math.max(-1, Math.min(1, ax - Math.sign(corr) * 0.6));
  if (py < 16) ay = Math.max(ay, 0.8);
  if (py > 48) ay = Math.min(ay, -0.5);
  return { ax, ay };
};
`;

export function pilotFromPage() {
  return `window.__pilotStep(window.__game, window.__game.S)`;
}
