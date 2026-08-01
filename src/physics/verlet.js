/**
 * Motor Verlet puro — sem saber o que é spike/hang.
 * API: point, stick, impulse, setPinned, unpin, stepPoints, constrainAll, collideWorld
 */

export const DEFAULTS = {
  gravity: 0.48,
  damping: 0.984,
  iterations: 4,
  floorFriction: 0.72,
  bounce: 0.25,
  maxV: 7,
};

export function point(x, y, pinned = false) {
  return { x, y, ox: x, oy: y, pinned };
}

export function stick(a, b, length = null, stiffness = 1) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    a,
    b,
    length: length ?? Math.hypot(dx, dy),
    stiffness,
  };
}

export function setPinned(p, x, y) {
  p.x = x;
  p.y = y;
  p.ox = x;
  p.oy = y;
  p.pinned = true;
}

export function unpin(p) {
  if (p) p.pinned = false;
}

export function impulse(p, vx, vy) {
  if (!p || p.pinned) return;
  p.ox = p.x - vx;
  p.oy = p.y - vy;
}

export function zeroVel(p) {
  p.ox = p.x;
  p.oy = p.y;
}

export function clampV(p, maxV = DEFAULTS.maxV) {
  if (!p || p.pinned) return;
  let vx = p.x - p.ox;
  let vy = p.y - p.oy;
  if (vx > maxV) vx = maxV;
  if (vx < -maxV) vx = -maxV;
  if (vy > maxV) vy = maxV;
  if (vy < -maxV) vy = -maxV;
  p.ox = p.x - vx;
  p.oy = p.y - vy;
}

function constrainOne(s) {
  const { a, b, length, stiffness } = s;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const diff = ((length - dist) / dist) * 0.5 * stiffness;
  const ox = dx * diff;
  const oy = dy * diff;
  if (!a.pinned) {
    a.x -= ox;
    a.y -= oy;
  }
  if (!b.pinned) {
    b.x += ox;
    b.y += oy;
  }
}

export function constrainAll(sticks, iterations = DEFAULTS.iterations) {
  for (let i = 0; i < iterations; i++) {
    for (const s of sticks) constrainOne(s);
  }
}

export function collideWorld(p, floorY, ceilingY, opts = {}) {
  if (p.pinned) return;
  const friction = opts.floorFriction ?? DEFAULTS.floorFriction;
  const bounce = opts.bounce ?? DEFAULTS.bounce;
  if (p.y > floorY) {
    p.y = floorY;
    p.ox = p.x + (p.ox - p.x) * friction;
    const vy = p.y - p.oy;
    if (vy > 0) p.oy = p.y + vy * bounce;
    else p.oy = p.y;
  }
  if (p.y < ceilingY) {
    p.y = ceilingY;
    p.oy = p.y;
  }
  const maxX = opts.maxX ?? (typeof window !== "undefined" ? window.innerWidth : 800) - 20;
  if (p.x > maxX) {
    p.x = maxX;
    p.ox = p.x;
  }
}

/**
 * Integra um frame: verlet + constraints + chão.
 * @param {object} body - { points, sticks, floorY, ceilingY }
 * @param {number} dtNorm
 * @param {object} [opts] - gravity, damping, scroll (px pra esquerda)
 */
export function stepBody(body, dtNorm = 1, opts = {}) {
  const g = (opts.gravity ?? DEFAULTS.gravity) * dtNorm;
  const damp = Math.pow(opts.damping ?? DEFAULTS.damping, dtNorm);
  const scroll = opts.scroll ?? 0;
  const maxV = opts.maxV ?? DEFAULTS.maxV;

  for (const p of body.points) {
    if (p.pinned) continue;
    let vx = (p.x - p.ox) * damp;
    let vy = (p.y - p.oy) * damp;
    if (vx > maxV) vx = maxV;
    if (vx < -maxV) vx = -maxV;
    if (vy > maxV) vy = maxV;
    if (vy < -maxV) vy = -maxV;
    p.ox = p.x;
    p.oy = p.y;
    p.x += vx - scroll;
    p.y += vy + g;
  }

  constrainAll(body.sticks, opts.iterations ?? DEFAULTS.iterations);

  for (const p of body.points) {
    if (!p.pinned) {
      collideWorld(p, body.floorY, body.ceilingY, opts);
      clampV(p, maxV);
    }
  }
}

export function angleBetween(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
