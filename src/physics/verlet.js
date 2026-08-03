/**
 * Verlet com "soft until stretch limit":
 * - stiffness moderado → mole, não robô
 * - se dist > length * maxStretch → correção forte (não vira macarrão)
 */

export const DEFAULTS = {
  gravity: 0.52,
  damping: 0.99,
  iterations: 5,
  floorFriction: 0.45,
  bounce: 0.55,
  maxV: 9,
  maxStretch: 1.35, // acima disso o osso "trava"
};

export function point(x, y, pinned = false) {
  return { x, y, ox: x, oy: y, pinned };
}

export function stick(a, b, length = null, stiffness = 0.55) {
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
  const sp = Math.hypot(vx, vy);
  if (sp > maxV) {
    const s = maxV / sp;
    vx *= s;
    vy *= s;
  }
  p.ox = p.x - vx;
  p.oy = p.y - vy;
}

function constrainOne(s, maxStretch = DEFAULTS.maxStretch) {
  const { a, b, length, stiffness } = s;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;

  // se esticou demais, força quase rígida
  let k = stiffness;
  if (dist > length * maxStretch) k = Math.max(k, 0.95);
  else if (dist < length * 0.5) k = Math.max(k, 0.8); // evita colapsar

  const diff = ((length - dist) / dist) * 0.5 * k;
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
    const vx = p.x - p.ox;
    p.ox = p.x - vx * (1 - friction);
    const vy = p.y - p.oy;
    if (vy > 0) p.oy = p.y + vy * bounce;
    else p.oy = p.y;
  }
  if (p.y < ceilingY) {
    p.y = ceilingY;
    const vx = p.x - p.ox;
    p.ox = p.x - vx * (1 - friction * 0.5);
    const vy = p.y - p.oy;
    // vy < 0 = subindo e bateu no teto → inverte (bounce)
    if (vy < 0) p.oy = p.y + vy * bounce;
    else p.oy = p.y;
  }
  const maxX =
    opts.maxX ??
    (typeof window !== "undefined" ? window.innerWidth : 800) - 20;
  const minX = opts.minX ?? 16;
  if (p.x > maxX) {
    p.x = maxX;
    p.ox = p.x;
  }
  if (p.x < minX) {
    p.x = minX;
    p.ox = p.x;
  }
}

export function stepBody(body, dtNorm = 1, opts = {}) {
  const g = (opts.gravity ?? DEFAULTS.gravity) * dtNorm;
  const damp = Math.pow(opts.damping ?? DEFAULTS.damping, dtNorm);
  const scroll = opts.scroll ?? 0;
  const maxV = opts.maxV ?? DEFAULTS.maxV;

  for (const p of body.points) {
    if (p.pinned) continue;
    let vx = (p.x - p.ox) * damp;
    let vy = (p.y - p.oy) * damp;
    const sp = Math.hypot(vx, vy);
    if (sp > maxV) {
      const s = maxV / sp;
      vx *= s;
      vy *= s;
    }
    p.ox = p.x;
    p.oy = p.y;
    p.x += vx * dtNorm - scroll;
    p.y += vy * dtNorm + g;
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
