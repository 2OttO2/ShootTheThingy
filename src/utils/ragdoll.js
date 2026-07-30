/**
 * Ragdoll 2D leve — integração Verlet + constraints de distância.
 * Ativa na morte do player (spike / stall).
 */

const GRAVITY = 0.45;
const DAMPING = 0.988;
const ITERATIONS = 4;
const FLOOR_FRICTION = 0.85;
const BOUNCE = 0.35;

function point(x, y, pinned = false) {
  return {
    x,
    y,
    ox: x,
    oy: y,
    pinned,
  };
}

function stick(a, b, length = null, stiffness = 1) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    a,
    b,
    length: length ?? Math.hypot(dx, dy),
    stiffness,
  };
}

/**
 * Cria um ragdoll humanoide simples a partir da posição do player.
 */
export function createRagdoll(x, y, opts = {}) {
  const {
    deathType = "stall",
    velocityY = 0,
    moveSpeed = 0,
    floorY = window.innerHeight - 10,
    ceilingY = 5,
  } = opts;

  const s = 1;
  const cx = x + 24;
  const top = y;

  const head = point(cx, top + 10);
  const chest = point(cx, top + 28);
  const hip = point(cx, top + 48);
  const lShoulder = point(cx - 12, top + 26);
  const rShoulder = point(cx + 12, top + 26);
  const lHand = point(cx - 18, top + 42);
  const rHand = point(cx + 18, top + 42);
  const lKnee = point(cx - 8, top + 58);
  const rKnee = point(cx + 8, top + 58);
  const lFoot = point(cx - 10, top + 70);
  const rFoot = point(cx + 10, top + 70);

  const points = [
    head, chest, hip,
    lShoulder, rShoulder, lHand, rHand,
    lKnee, rKnee, lFoot, rFoot,
  ];

  const sticks = [
    stick(head, chest, 16 * s, 1),
    stick(chest, hip, 20 * s, 1),
    stick(chest, lShoulder, 12 * s, 0.95),
    stick(chest, rShoulder, 12 * s, 0.95),
    stick(lShoulder, rShoulder, 22 * s, 0.7),
    stick(lShoulder, lHand, 18 * s, 0.9),
    stick(rShoulder, rHand, 18 * s, 0.9),
    stick(hip, lKnee, 14 * s, 0.95),
    stick(hip, rKnee, 14 * s, 0.95),
    stick(lKnee, lFoot, 14 * s, 0.95),
    stick(rKnee, rFoot, 14 * s, 0.95),
    stick(lKnee, rKnee, 16 * s, 0.4),
  ];

  const baseVx = -moveSpeed * 1.8 - 1.5;
  let baseVy = velocityY * 0.35;

  const impulses = points.map(() => ({
    vx: baseVx + (Math.random() - 0.5) * 2,
    vy: baseVy,
  }));

  if (deathType === "spike_top") {
    impulses[0].vy -= 8 + Math.random() * 4;
    impulses[1].vy -= 6;
    impulses[2].vy += 4;
    impulses[5].vx -= 6 + Math.random() * 4;
    impulses[6].vx += 6 + Math.random() * 4;
    impulses[9].vy += 3;
    impulses[10].vy += 3;
  } else if (deathType === "spike_side") {
    const side = Math.random() > 0.5 ? 1 : -1;
    impulses[0].vx += side * 10;
    impulses[0].vy -= 3;
    impulses[1].vx += side * 7;
    impulses[2].vx += side * 4;
    impulses[5].vx += side * 12;
    impulses[6].vx -= side * 5;
  } else {
    impulses.forEach((imp) => {
      imp.vx *= 0.4;
      imp.vy = Math.max(imp.vy, 1) + Math.random();
    });
  }

  points.forEach((p, i) => {
    p.ox = p.x - impulses[i].vx;
    p.oy = p.y - impulses[i].vy;
  });

  return {
    points,
    sticks,
    floorY,
    ceilingY,
    alive: true,
    parts: {
      head, chest, hip,
      lShoulder, rShoulder, lHand, rHand,
      lKnee, rKnee, lFoot, rFoot,
    },
  };
}

function constrain(stick) {
  const { a, b, length, stiffness } = stick;
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

function collideWorld(p, floorY, ceilingY) {
  if (p.y > floorY) {
    p.y = floorY;
    p.ox = p.x + (p.ox - p.x) * FLOOR_FRICTION;
    const vy = p.y - p.oy;
    if (vy > 0) {
      p.oy = p.y + vy * BOUNCE;
    } else {
      p.oy = p.y;
    }
  }
  if (p.y < ceilingY) {
    p.y = ceilingY;
    p.oy = p.y + (p.y - p.oy) * BOUNCE;
  }
  const minX = 20;
  const maxX = (typeof window !== "undefined" ? window.innerWidth : 800) - 20;
  if (p.x < minX) {
    p.x = minX;
    p.ox = p.x + (p.x - p.ox) * 0.5;
  }
  if (p.x > maxX) {
    p.x = maxX;
    p.ox = p.x + (p.x - p.ox) * 0.5;
  }
}

export function stepRagdoll(ragdoll, dtNorm = 1) {
  if (!ragdoll || !ragdoll.alive) return;

  const { points, sticks, floorY, ceilingY } = ragdoll;
  const g = GRAVITY * dtNorm * dtNorm;
  const damp = Math.pow(DAMPING, dtNorm);

  for (const p of points) {
    if (p.pinned) continue;
    const vx = (p.x - p.ox) * damp;
    const vy = (p.y - p.oy) * damp;
    p.ox = p.x;
    p.oy = p.y;
    p.x += vx;
    p.y += vy + g;
  }

  for (let i = 0; i < ITERATIONS; i++) {
    for (const s of sticks) constrain(s);
    for (const p of points) {
      if (!p.pinned) collideWorld(p, floorY, ceilingY);
    }
  }
}

export function ragdollSnapshot(ragdoll) {
  if (!ragdoll) return null;
  const { parts } = ragdoll;
  return {
    head: { x: parts.head.x, y: parts.head.y },
    chest: { x: parts.chest.x, y: parts.chest.y },
    hip: { x: parts.hip.x, y: parts.hip.y },
    lShoulder: { x: parts.lShoulder.x, y: parts.lShoulder.y },
    rShoulder: { x: parts.rShoulder.x, y: parts.rShoulder.y },
    lHand: { x: parts.lHand.x, y: parts.lHand.y },
    rHand: { x: parts.rHand.x, y: parts.rHand.y },
    lKnee: { x: parts.lKnee.x, y: parts.lKnee.y },
    rKnee: { x: parts.rKnee.x, y: parts.rKnee.y },
    lFoot: { x: parts.lFoot.x, y: parts.lFoot.y },
    rFoot: { x: parts.rFoot.x, y: parts.rFoot.y },
  };
}

export function angleBetween(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
