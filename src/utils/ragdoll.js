/**
 * Ragdoll 2D — Verlet + constraints.
 * spike_hang = pendurado pela CABEÇA (ponta do spike do teto)
 * spike_impale = corpo atravessado (spike de baixo ou base)
 * spike_side = chute / tombo lateral
 */

const GRAVITY = 0.45;
const DAMPING = 0.988;
const ITERATIONS = 4;
const FLOOR_FRICTION = 0.85;
const BOUNCE = 0.35;

function point(x, y, pinned = false) {
  return { x, y, ox: x, oy: y, pinned };
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

export function createRagdoll(x, y, opts = {}) {
  const {
    deathType = "stall",
    velocityY = 0,
    moveSpeed = 0,
    floorY = typeof window !== "undefined" ? window.innerHeight - 10 : 600,
    ceilingY = 5,
    severed = {},
    spikeTipX = null,
    spikeTipY = null,
    spikeSide = "bottom",
  } = opts;

  const sev = {
    legLeft: !!severed.legLeft,
    legRight: !!severed.legRight,
    armLeft: !!severed.armLeft,
    armRight: !!severed.armRight,
  };

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

  const points = [head, chest, hip, lShoulder, rShoulder];
  if (!sev.armLeft) points.push(lHand);
  if (!sev.armRight) points.push(rHand);
  if (!sev.legLeft) {
    points.push(lKnee, lFoot);
  }
  if (!sev.legRight) {
    points.push(rKnee, rFoot);
  }

  const sticks = [
    stick(head, chest, 16 * s, 1),
    stick(chest, hip, 20 * s, 1),
    stick(chest, lShoulder, 12 * s, 0.95),
    stick(chest, rShoulder, 12 * s, 0.95),
    stick(lShoulder, rShoulder, 22 * s, 0.7),
  ];
  if (!sev.armLeft) sticks.push(stick(lShoulder, lHand, 18 * s, 0.9));
  if (!sev.armRight) sticks.push(stick(rShoulder, rHand, 18 * s, 0.9));
  if (!sev.legLeft) {
    sticks.push(stick(hip, lKnee, 14 * s, 0.95));
    sticks.push(stick(lKnee, lFoot, 14 * s, 0.95));
  }
  if (!sev.legRight) {
    sticks.push(stick(hip, rKnee, 14 * s, 0.95));
    sticks.push(stick(rKnee, rFoot, 14 * s, 0.95));
  }
  if (!sev.legLeft && !sev.legRight) {
    sticks.push(stick(lKnee, rKnee, 16 * s, 0.4));
  }

  const baseVx = -moveSpeed * 1.5 - 1.2;
  const baseVy = velocityY * 0.3;
  const impulses = new Map();
  for (const p of points) {
    impulses.set(p, {
      vx: baseVx + (Math.random() - 0.5) * 2,
      vy: baseVy,
    });
  }

  const tipX = spikeTipX ?? cx;
  const tipY = spikeTipY ?? top + 40;

  if (deathType === "spike_hang") {
    // pendurado pela CABEÇA na ponta do spike do teto
    head.x = tipX;
    head.y = tipY;
    head.ox = tipX;
    head.oy = tipY;
    head.pinned = true;
    // corpo pendura pra baixo
    chest.x = tipX + (Math.random() - 0.5) * 4;
    chest.y = tipY + 18;
    hip.x = tipX + (Math.random() - 0.5) * 6;
    hip.y = tipY + 40;
    impulses.get(chest).vy += 2;
    impulses.get(hip).vy += 4;
    if (!sev.legLeft) {
      impulses.get(lFoot).vx -= 5;
      impulses.get(lFoot).vy += 6;
    }
    if (!sev.legRight) {
      impulses.get(rFoot).vx += 5;
      impulses.get(rFoot).vy += 6;
    }
    if (!sev.armLeft) impulses.get(lHand).vx -= 4;
    if (!sev.armRight) impulses.get(rHand).vx += 4;
  } else if (deathType === "spike_impale" || deathType === "spike_top") {
    // impale — peito na ponta (baixo) ou base
    if (spikeSide === "top") {
      // enfiado na base do spike de cima — peito alto
      chest.x = tipX;
      chest.y = Math.max(12, tipY - 40);
      chest.ox = chest.x;
      chest.oy = chest.y;
      chest.pinned = true;
      head.x = tipX;
      head.y = chest.y - 16;
    } else {
      // spike de baixo atravessa o torso
      chest.x = tipX;
      chest.y = tipY + 10;
      chest.ox = tipX;
      chest.oy = tipY + 10;
      chest.pinned = true;
      hip.x = tipX;
      hip.y = tipY + 28;
      hip.ox = tipX;
      hip.oy = tipY + 28;
    }
    impulses.get(head).vx += (Math.random() - 0.5) * 5;
    if (!sev.legLeft) {
      impulses.get(lFoot).vx -= 9;
      impulses.get(lFoot).vy += 3;
    }
    if (!sev.legRight) {
      impulses.get(rFoot).vx += 9;
      impulses.get(rFoot).vy += 3;
    }
    if (!sev.armLeft) impulses.get(lHand).vx -= 8;
    if (!sev.armRight) impulses.get(rHand).vx += 8;
  } else if (deathType === "spike_side") {
    const side = -1;
    impulses.get(head).vx += side * 8;
    impulses.get(head).vy -= 4;
    impulses.get(chest).vx += side * 6;
    impulses.get(hip).vx += side * 3;
    if (!sev.legLeft) {
      impulses.get(lFoot).vx -= side * 14;
      impulses.get(lFoot).vy -= 8;
    }
    if (!sev.legRight) {
      impulses.get(rFoot).vx -= side * 16;
      impulses.get(rFoot).vy -= 10;
    }
    if (!sev.armLeft) impulses.get(lHand).vx += side * 10;
    if (!sev.armRight) impulses.get(rHand).vx -= side * 6;
  } else {
    for (const imp of impulses.values()) {
      imp.vx *= 0.4;
      imp.vy = Math.max(imp.vy, 1) + Math.random();
    }
  }

  for (const p of points) {
    const imp = impulses.get(p);
    if (!imp || p.pinned) continue;
    p.ox = p.x - imp.vx;
    p.oy = p.y - imp.vy;
  }

  return {
    points,
    sticks,
    floorY,
    ceilingY,
    alive: true,
    deathType,
    spikeSide,
    severed: sev,
    hangTimer: deathType === "spike_hang" ? 1.4 : 0,
    hangReleased: false,
    spikeTipX: tipX,
    spikeTipY: tipY,
    parts: {
      head,
      chest,
      hip,
      lShoulder,
      rShoulder,
      lHand,
      rHand,
      lKnee,
      rKnee,
      lFoot,
      rFoot,
    },
  };
}

function constrain(s) {
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

function collideWorld(p, floorY, ceilingY) {
  if (p.y > floorY) {
    p.y = floorY;
    p.ox = p.x + (p.ox - p.x) * FLOOR_FRICTION;
    const vy = p.y - p.oy;
    if (vy > 0) p.oy = p.y + vy * BOUNCE;
    else p.oy = p.y;
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
  const dtSec = dtNorm * (16.67 / 1000);

  // hang pela CABEÇA
  if (ragdoll.deathType === "spike_hang" && !ragdoll.hangReleased) {
    ragdoll.hangTimer -= dtSec;
    const h = ragdoll.parts.head;
    h.x = ragdoll.spikeTipX;
    h.y = ragdoll.spikeTipY;
    h.ox = h.x;
    h.oy = h.y;
    h.pinned = true;

    if (ragdoll.hangTimer <= 0) {
      ragdoll.hangReleased = true;
      h.pinned = false;
      // solta e cai
      h.oy = h.y - 1.5;
      ragdoll.parts.chest.oy = ragdoll.parts.chest.y - 2;
      ragdoll.parts.hip.oy = ragdoll.parts.hip.y - 3;
    }
  }

  // impale
  if (ragdoll.deathType === "spike_impale" || ragdoll.deathType === "spike_top") {
    const c = ragdoll.parts.chest;
    c.x = ragdoll.spikeTipX;
    if (ragdoll.spikeSide === "bottom") {
      c.y = Math.min(c.y + 0.12 * dtNorm, ragdoll.spikeTipY + 36);
    } else {
      // preso mais pra cima no spike do teto
      c.y = Math.max(c.y, 16);
    }
    c.ox = c.x;
    c.oy = c.y;
    c.pinned = true;

    const hip = ragdoll.parts.hip;
    hip.x = ragdoll.spikeTipX + (hip.x - ragdoll.spikeTipX) * 0.25;
  }

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
  const { parts, severed } = ragdoll;
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
    severed: { ...severed },
  };
}

export function angleBetween(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

