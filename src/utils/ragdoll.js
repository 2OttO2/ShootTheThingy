/**
 * Ragdoll 2D — o player é fixo em X na tela.
 * NÃO herdar gameSpeed como velocidade horizontal (isso fazia o corpo voar).
 *
 * spike_hang   — ponta do teto: cabeça presa → solta → cai
 * spike_impale — ponta: peito preso no spike
 * spike_loose  — base: cai/kicka no lugar
 * stall
 */

const GRAVITY = 0.32;
const DAMPING = 0.985;
const ITERATIONS = 4;
const FLOOR_FRICTION = 0.7;
const BOUNCE = 0.22;
const MAX_V = 5;

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
  let vx = p.x - p.ox;
  let vy = p.y - p.oy;
  vx = Math.max(-MAX_V, Math.min(MAX_V, vx));
  vy = Math.max(-MAX_V, Math.min(MAX_V, vy));
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
  } = opts;

  const sev = {
    legLeft: !!severed.legLeft,
    legRight: !!severed.legRight,
    armLeft: !!severed.armLeft,
    armRight: !!severed.armRight,
  };

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
  if (!sev.legLeft) points.push(lKnee, lFoot);
  if (!sev.legRight) points.push(rKnee, rFoot);

  const sticks = [
    stick(head, chest, 16, 1),
    stick(chest, hip, 20, 1),
    stick(chest, lShoulder, 12, 0.95),
    stick(chest, rShoulder, 12, 0.95),
    stick(lShoulder, rShoulder, 22, 0.6),
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

  const tipX = spikeTipX ?? cx;
  const tipY = spikeTipY ?? top + 40;

  // só um resquício da velocidade VERTICAL do player (nada de “correr” pra esquerda)
  const fall = Math.max(-1.5, Math.min(2.5, velocityY * 0.08));

  function impulse(p, vx, vy) {
    p.ox = p.x - vx;
    p.oy = p.y - vy;
  }

  for (const p of points) {
    impulse(p, 0, fall);
  }

  if (deathType === "spike_hang") {
    // cabeça na ponta do spike de cima
    setPinned(head, tipX, tipY);
    chest.x = tipX;
    chest.y = tipY + 18;
    chest.ox = tipX;
    chest.oy = chest.y;
    hip.x = tipX;
    hip.y = tipY + 38;
    hip.ox = tipX;
    hip.oy = hip.y;
    impulse(hip, 0, 1.2);
    if (!sev.legLeft) impulse(lFoot, -1, 1.5);
    if (!sev.legRight) impulse(rFoot, 1, 1.5);
  } else if (deathType === "spike_impale") {
    const cy = spikeSide === "bottom" ? tipY + 18 : Math.max(22, tipY - 20);
    setPinned(chest, tipX, cy);
    hip.x = tipX;
    hip.y = cy + 20;
    hip.ox = tipX;
    hip.oy = hip.y;
    head.x = tipX;
    head.y = cy - 16;
    head.ox = tipX;
    head.oy = head.y;
    if (!sev.legLeft) impulse(lFoot, -2, 1);
    if (!sev.legRight) impulse(rFoot, 2, 1);
    if (!sev.armLeft) impulse(lHand, -1.5, 0.3);
    if (!sev.armRight) impulse(rHand, 1.5, 0.3);
  } else if (deathType === "spike_loose") {
    // tombo local, sem voar
    impulse(head, -0.8, fall - 0.3);
    impulse(chest, -0.4, fall);
    if (!sev.legLeft) impulse(lFoot, 2, -1.5);
    if (!sev.legRight) impulse(rFoot, -2.2, -1.6);
    if (!sev.armLeft) impulse(lHand, -1.2, -0.3);
    if (!sev.armRight) impulse(rHand, 1.2, -0.3);
  }

  for (const p of points) {
    if (!p.pinned) clampV(p);
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
    hangTimer: deathType === "spike_hang" ? 1.0 : 0,
    hangReleased: false,
    floorKicked: false,
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
    p.oy = p.y;
  }
  const minX = 40;
  const maxX = (typeof window !== "undefined" ? window.innerWidth : 800) - 40;
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
  for (const p of ragdoll.points) p.pinned = false;
  const { severed, parts } = ragdoll;
  if (!severed.legLeft && parts.lFoot) {
    parts.lFoot.ox = parts.lFoot.x + 2.5;
    parts.lFoot.oy = parts.lFoot.y + 0.8;
    clampV(parts.lFoot);
  }
  if (!severed.legRight && parts.rFoot) {
    parts.rFoot.ox = parts.rFoot.x - 2.8;
    parts.rFoot.oy = parts.rFoot.y + 1;
    clampV(parts.rFoot);
  }
  parts.hip.oy = parts.hip.y + 0.6;
  parts.chest.oy = parts.chest.y + 0.3;
}

function applyImpale(ragdoll, tipX, tipY, side) {
  ragdoll.deathType = "spike_impale";
  ragdoll.spikeSide = side;
  ragdoll.spikeTipX = tipX;
  ragdoll.spikeTipY = tipY;
  const cy = side === "bottom" ? tipY + 18 : Math.max(22, tipY - 20);
  setPinned(ragdoll.parts.chest, tipX, cy);
  ragdoll.parts.hip.x = tipX;
  ragdoll.parts.hip.y = cy + 20;
  ragdoll.parts.hip.ox = tipX;
  ragdoll.parts.hip.oy = cy + 20;
  ragdoll.parts.head.x = tipX;
  ragdoll.parts.head.y = cy - 16;
  ragdoll.parts.head.ox = tipX;
  ragdoll.parts.head.oy = cy - 16;
}

/**
 * scrollSpeed é IGNORADO de propósito — player é fixo na tela.
 * Mantido na assinatura pra não quebrar a chamada no Player.
 */
export function stepRagdoll(ragdoll, dtNorm = 1, _scrollSpeed = 0) {
  if (!ragdoll || !ragdoll.alive) return;

  const { points, sticks, floorY, ceilingY } = ragdoll;
  const g = GRAVITY * dtNorm;
  const damp = Math.pow(DAMPING, dtNorm);
  const dtSec = dtNorm * (16.67 / 1000);

  // ===== HANG =====
  if (ragdoll.deathType === "spike_hang") {
    if (!ragdoll.hangReleased) {
      ragdoll.hangTimer -= dtSec;
      // cabeça FICA na ponta (spike congelado na morte)
      setPinned(ragdoll.parts.head, ragdoll.spikeTipX, ragdoll.spikeTipY);
      if (ragdoll.hangTimer <= 0) {
        ragdoll.hangReleased = true;
        ragdoll.parts.head.pinned = false;
        ragdoll.parts.head.oy = ragdoll.parts.head.y - 0.6;
        ragdoll.parts.chest.oy = ragdoll.parts.chest.y - 1;
        ragdoll.parts.hip.oy = ragdoll.parts.hip.y - 1.2;
      }
    } else if (!ragdoll.floorKicked) {
      const chest = ragdoll.parts.chest;
      const bottomTipY = floorY - 60;
      // caiu na faixa do spike de baixo → impale
      if (chest.y >= bottomTipY && chest.y <= bottomTipY + 50) {
        applyImpale(ragdoll, chest.x, bottomTipY, "bottom");
      }
    }
  }

  // ===== IMPALE =====
  if (ragdoll.deathType === "spike_impale") {
    const c = ragdoll.parts.chest;
    const hip = ragdoll.parts.hip;
    let targetY = c.y;
    if (ragdoll.spikeSide === "bottom") {
      targetY = Math.min(c.y + 0.1 * dtNorm, ragdoll.spikeTipY + 38);
    } else {
      targetY = Math.min(c.y + 0.06 * dtNorm, Math.max(20, ragdoll.spikeTipY - 4));
    }
    setPinned(c, ragdoll.spikeTipX, targetY);
    hip.x = ragdoll.spikeTipX;
    hip.y = c.y + 18;
    hip.ox = hip.x;
    hip.oy = hip.y;
  }

  // verlet — SEM scroll horizontal do jogo
  for (const p of points) {
    if (p.pinned) continue;
    let vx = (p.x - p.ox) * damp;
    let vy = (p.y - p.oy) * damp;
    vx = Math.max(-MAX_V, Math.min(MAX_V, vx));
    vy = Math.max(-MAX_V, Math.min(MAX_V, vy));
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

  // chão → kick
  if (
    !ragdoll.floorKicked &&
    ragdoll.deathType !== "spike_impale" &&
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

