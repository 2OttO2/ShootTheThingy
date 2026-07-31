/**
 * Ragdoll 2D estável — versão limpa (sem scroll do mapa).
 * spike_hang | spike_impale | spike_impale_leg | spike_spin | spike_bounce | spike_flop | stall
 */

const GRAVITY = 0.5;
const DAMPING = 0.982;
const ITERATIONS = 4;
const FLOOR_FRICTION = 0.7;
const BOUNCE = 0.28;
const MAX_V = 8;

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

function clampV(p) {
  if (!p || p.pinned) return;
  let vx = p.x - p.ox;
  let vy = p.y - p.oy;
  if (vx > MAX_V) vx = MAX_V;
  if (vx < -MAX_V) vx = -MAX_V;
  if (vy > MAX_V) vy = MAX_V;
  if (vy < -MAX_V) vy = -MAX_V;
  p.ox = p.x - vx;
  p.oy = p.y - vy;
}

function setPinned(p, x, y) {
  p.x = x;
  p.y = y;
  p.ox = x;
  p.oy = y;
  p.pinned = true;
}

function unpin(p) {
  if (p) p.pinned = false;
}

function impulse(p, vx, vy) {
  if (!p || p.pinned) return;
  p.ox = p.x - vx;
  p.oy = p.y - vy;
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
  if (p.pinned) return;
  if (p.y > floorY) {
    p.y = floorY;
    p.ox = p.x + (p.ox - p.x) * FLOOR_FRICTION;
    const vy = p.y - p.oy;
    if (vy > 0) p.oy = p.y + vy * BOUNCE;
    else p.oy = p.y;
  }
  if (p.y < ceilingY) {
    p.y = ceilingY;
    p.oy = p.y;
  }
  const minX = 30;
  const maxX = (typeof window !== "undefined" ? window.innerWidth : 800) - 30;
  if (p.x < minX) {
    p.x = minX;
    p.ox = p.x;
  }
  if (p.x > maxX) {
    p.x = maxX;
    p.ox = p.x;
  }
}

function applyFloorKick(ragdoll) {
  if (ragdoll.floorKicked) return;
  ragdoll.floorKicked = true;
  for (const p of ragdoll.points) unpin(p);
  const { severed, parts, sideSpin } = ragdoll;
  const s = sideSpin || 1;
  if (!severed.legLeft && parts.lFoot) {
    impulse(parts.lFoot, 2.5 * s, 1.5);
    clampV(parts.lFoot);
  }
  if (!severed.legRight && parts.rFoot) {
    impulse(parts.rFoot, -2.8 * s, 1.6);
    clampV(parts.rFoot);
  }
  impulse(parts.hip, 0.4 * s, 1);
  impulse(parts.chest, 0.25 * s, 0.6);
}

export function createRagdoll(x, y, opts = {}) {
  const {
    deathType = "stall",
    velocityY = 0,
    floorY = typeof window !== "undefined" ? window.innerHeight - 10 : 600,
    ceilingY = 5,
    severed = {},
    spikeTipX = null,
    spikeTipY = null,
    spikeSide = "bottom",
    offsetX = 0,
    impact = 1,
  } = opts;

  const sev = {
    legLeft: !!severed.legLeft,
    legRight: !!severed.legRight,
    armLeft: !!severed.armLeft,
    armRight: !!severed.armRight,
  };

  const cx = x + 24;
  const top = y;
  const tipX = spikeTipX ?? cx;
  const tipY = spikeTipY ?? top + 40;
  const sideSpin = offsetX >= 0 ? 1 : -1;
  const imp = Math.max(0.7, Math.min(2, impact));

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
  if (!sev.legLeft) points.push(lKnee, lFoot);
  if (!sev.legRight) points.push(rKnee, rFoot);

  const sticks = [
    stick(head, chest, 16, 1),
    stick(chest, hip, 20, 1),
    stick(chest, lShoulder, 12, 0.95),
    stick(chest, rShoulder, 12, 0.95),
    stick(lShoulder, rShoulder, 22, 0.55),
  ];
  if (!sev.armLeft) sticks.push(stick(lShoulder, lHand, 18, 0.85));
  if (!sev.armRight) sticks.push(stick(rShoulder, rHand, 18, 0.85));
  if (!sev.legLeft) {
    sticks.push(stick(hip, lKnee, 14, 0.9));
    sticks.push(stick(lKnee, lFoot, 14, 0.9));
  }
  if (!sev.legRight) {
    sticks.push(stick(hip, rKnee, 14, 0.9));
    sticks.push(stick(rKnee, rFoot, 14, 0.9));
  }
  if (!sev.legLeft && !sev.legRight) {
    sticks.push(stick(lKnee, rKnee, 16, 0.3));
  }

  const fall = Math.max(0.6, Math.min(3.5, Math.abs(velocityY) * 0.12 + 1.0));
  for (const p of points) impulse(p, 0, fall * 0.35);

  if (deathType === "spike_hang") {
    setPinned(head, tipX, tipY);
    chest.x = tipX + sideSpin * 2;
    chest.y = tipY + 18;
    hip.x = tipX + sideSpin * 4;
    hip.y = tipY + 38;
    impulse(chest, sideSpin * 0.5 * imp, 1.2);
    impulse(hip, sideSpin * 0.8 * imp, 2);
    if (!sev.legLeft) impulse(lFoot, -sideSpin * 2 * imp, 2.5);
    if (!sev.legRight) impulse(rFoot, sideSpin * 2 * imp, 2.5);
  } else if (deathType === "spike_impale") {
    const cy = spikeSide === "bottom" ? tipY + 16 : Math.max(22, tipY - 18);
    setPinned(chest, tipX, cy);
    hip.x = tipX;
    hip.y = cy + 18;
    hip.ox = tipX;
    hip.oy = hip.y;
    head.x = tipX;
    head.y = cy - 16;
    head.ox = tipX;
    head.oy = head.y;
    if (!sev.legLeft) impulse(lFoot, -2.5 * imp, 1.5 * imp);
    if (!sev.legRight) impulse(rFoot, 2.5 * imp, 1.5 * imp);
    if (!sev.armLeft) impulse(lHand, -2 * imp, 0.8);
    if (!sev.armRight) impulse(rHand, 2 * imp, 0.8);
  } else if (deathType === "spike_impale_leg") {
    const pin = !sev.legLeft ? lFoot : !sev.legRight ? rFoot : hip;
    setPinned(pin, tipX, tipY + (spikeSide === "bottom" ? 8 : 0));
    impulse(head, sideSpin * 2.5 * imp, 1.5);
    impulse(chest, sideSpin * 2 * imp, 2);
    impulse(hip, sideSpin * 1.2 * imp, 1);
  } else if (deathType === "spike_spin") {
    const spin = sideSpin * 3 * imp;
    impulse(head, spin, fall);
    impulse(chest, spin * 0.5, fall);
    impulse(hip, -spin * 0.35, fall);
    if (!sev.legLeft) impulse(lFoot, -spin, fall * 0.8);
    if (!sev.legRight) impulse(rFoot, spin, fall * 0.8);
  } else if (deathType === "spike_bounce") {
    const away = spikeSide === "top" ? 1 : -1;
    impulse(head, sideSpin * 1.8 * imp, away * 2.5 * imp + fall * 0.3);
    impulse(chest, sideSpin * 1.4 * imp, away * 3 * imp);
    impulse(hip, sideSpin * 1 * imp, away * 2.2 * imp);
  } else if (deathType === "spike_flop") {
    impulse(head, sideSpin * 0.8, fall);
    impulse(chest, 0, fall * 0.9);
    impulse(hip, -sideSpin * 0.5, fall);
    if (!sev.legLeft) impulse(lFoot, 2 * imp, -1);
    if (!sev.legRight) impulse(rFoot, -2.2 * imp, -1.1);
  } else {
    for (const p of points) {
      impulse(p, (Math.random() - 0.5) * 0.4, 1 + Math.random() * 0.5);
    }
  }

  for (const p of points) clampV(p);

  return {
    points,
    sticks,
    floorY,
    ceilingY,
    alive: true,
    deathType,
    spikeSide,
    severed: sev,
    hangTimer: deathType === "spike_hang" ? 0.8 : 0,
    hangReleased: false,
    floorKicked: false,
    spikeTipX: tipX,
    spikeTipY: tipY,
    sideSpin,
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

export function stepRagdoll(ragdoll, dtNorm = 1) {
  if (!ragdoll || !ragdoll.alive) return;

  const { points, sticks, floorY, ceilingY } = ragdoll;
  const g = GRAVITY * dtNorm;
  const damp = Math.pow(DAMPING, dtNorm);
  const dtSec = dtNorm * (16.67 / 1000);

  // hang: pendura → solta → cai no chão (SEM auto-impale)
  if (ragdoll.deathType === "spike_hang") {
    if (!ragdoll.hangReleased) {
      ragdoll.hangTimer -= dtSec;
      setPinned(ragdoll.parts.head, ragdoll.spikeTipX, ragdoll.spikeTipY);
      if (ragdoll.hangTimer <= 0) {
        ragdoll.hangReleased = true;
        unpin(ragdoll.parts.head);
        impulse(ragdoll.parts.head, 0, 1.8);
        impulse(ragdoll.parts.chest, 0, 2.2);
        impulse(ragdoll.parts.hip, 0, 2.6);
      }
    }
  }

  // impale
  if (ragdoll.deathType === "spike_impale") {
    const c = ragdoll.parts.chest;
    const hip = ragdoll.parts.hip;
    let targetY = c.y;
    if (ragdoll.spikeSide === "bottom") {
      targetY = Math.min(c.y + 0.15 * dtNorm, ragdoll.spikeTipY + 38);
    } else {
      targetY = Math.min(
        c.y + 0.08 * dtNorm,
        Math.max(20, ragdoll.spikeTipY - 4)
      );
    }
    setPinned(c, ragdoll.spikeTipX, targetY);
    hip.x = ragdoll.spikeTipX;
    hip.y = c.y + 18;
    hip.ox = hip.x;
    hip.oy = hip.y;
  }

  // impale leg
  if (ragdoll.deathType === "spike_impale_leg") {
    for (const p of points) {
      if (p.pinned) {
        p.x = ragdoll.spikeTipX;
        p.ox = p.x;
      }
    }
  }

  // verlet
  for (const p of points) {
    if (p.pinned) continue;
    let vx = (p.x - p.ox) * damp;
    let vy = (p.y - p.oy) * damp;
    if (vx > MAX_V) vx = MAX_V;
    if (vx < -MAX_V) vx = -MAX_V;
    if (vy > MAX_V) vy = MAX_V;
    if (vy < -MAX_V) vy = -MAX_V;
    p.ox = p.x;
    p.oy = p.y;
    p.x += vx;
    p.y += vy + g;
  }

  for (let i = 0; i < ITERATIONS; i++) {
    for (const s of sticks) constrain(s);
    for (const p of points) {
      if (!p.pinned) {
        collideWorld(p, floorY, ceilingY);
        clampV(p);
      }
    }
  }

  if (
    !ragdoll.floorKicked &&
    ragdoll.deathType !== "spike_impale" &&
    ragdoll.deathType !== "spike_impale_leg" &&
    ragdoll.parts.hip.y >= floorY - 10
  ) {
    applyFloorKick(ragdoll);
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
    deathType: ragdoll.deathType,
  };
}

export function angleBetween(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

