/**
 * Ragdoll 2D estável.
 * spike_hang   — ponta teto: pendura cabeça → solta → cai
 * spike_impale — ponta: peito preso no spike
 * spike_loose  — base: corpo solto, kick leve
 * stall
 */

const GRAVITY = 0.28;
const DAMPING = 0.98;
const ITERATIONS = 3;
const FLOOR_FRICTION = 0.75;
const BOUNCE = 0.25;
const MAX_V = 6; // clamp velocidade por eixo
const MAX_SCROLL = 2.2; // px por frame (não voa pra fora)

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
    stick(lShoulder, rShoulder, 22, 0.65),
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
    sticks.push(stick(lKnee, rKnee, 16, 0.35));
  }

  const tipX = spikeTipX ?? cx;
  const tipY = spikeTipY ?? top + 40;

  // impulso inicial LEVE (herda um pouco da física do jogo)
  const inheritVx = Math.max(-3, Math.min(0, -moveSpeed * 0.25));
  const inheritVy = Math.max(-2, Math.min(3, velocityY * 0.12));

  function impulse(p, vx, vy) {
    p.ox = p.x - vx;
    p.oy = p.y - vy;
  }

  // aplica herança em todos
  for (const p of points) {
    impulse(p, inheritVx, inheritVy);
  }

  if (deathType === "spike_hang") {
    setPinned(head, tipX, tipY);
    // corpo só "pendura" — sem impulso forte
    impulse(chest, inheritVx, 0.5);
    impulse(hip, inheritVx, 1.0);
  } else if (deathType === "spike_impale") {
    const cy = spikeSide === "bottom" ? tipY + 16 : Math.max(20, tipY - 24);
    setPinned(chest, tipX, cy);
    hip.x = tipX;
    hip.y = cy + 20;
    hip.ox = tipX;
    hip.oy = hip.y;
    head.x = tipX;
    head.y = cy - 16;
    head.ox = tipX;
    head.oy = head.y;
    // agita membros de leve
    if (!sev.legLeft) impulse(lFoot, -2.5, 1.5);
    if (!sev.legRight) impulse(rFoot, 2.5, 1.5);
    if (!sev.armLeft) impulse(lHand, -2, 0.5);
    if (!sev.armRight) impulse(rHand, 2, 0.5);
  } else if (deathType === "spike_loose") {
    // kick moderado
    impulse(head, inheritVx - 1.5, inheritVy - 0.5);
    impulse(chest, inheritVx - 1, inheritVy);
    if (!sev.legLeft) impulse(lFoot, 3, -2);
    if (!sev.legRight) impulse(rFoot, -3.5, -2.2);
    if (!sev.armLeft) impulse(lHand, -2, -0.5);
    if (!sev.armRight) impulse(rHand, 2, -0.5);
  }

  // clamp inicial
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
    hangTimer: deathType === "spike_hang" ? 0.9 : 0,
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
  // mantém na tela
  const minX = 8;
  const maxX = (typeof window !== "undefined" ? window.innerWidth : 800) - 8;
  if (p.x < minX) {
    p.x = minX;
    p.ox = p.x + (p.x - p.ox) * 0.3;
  }
  if (p.x > maxX) {
    p.x = maxX;
    p.ox = p.x + (p.x - p.ox) * 0.3;
  }
}

function applyFloorKick(ragdoll) {
  if (ragdoll.floorKicked) return;
  ragdoll.floorKicked = true;
  for (const p of ragdoll.points) p.pinned = false;
  const { severed, parts } = ragdoll;
  // chute LEVE
  if (!severed.legLeft && parts.lFoot) {
    parts.lFoot.ox = parts.lFoot.x + 3;
    parts.lFoot.oy = parts.lFoot.y + 1;
    clampV(parts.lFoot);
  }
  if (!severed.legRight && parts.rFoot) {
    parts.rFoot.ox = parts.rFoot.x - 3.5;
    parts.rFoot.oy = parts.rFoot.y + 1.2;
    clampV(parts.rFoot);
  }
  parts.hip.oy = parts.hip.y + 0.8;
  parts.chest.oy = parts.chest.y + 0.4;
}

function applyImpale(ragdoll, tipX, tipY, side) {
  ragdoll.deathType = "spike_impale";
  ragdoll.spikeSide = side;
  ragdoll.spikeTipX = tipX;
  ragdoll.spikeTipY = tipY;
  const cy = side === "bottom" ? tipY + 16 : Math.max(20, tipY - 24);
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

export function stepRagdoll(ragdoll, dtNorm = 1, scrollSpeed = 0) {
  if (!ragdoll || !ragdoll.alive) return;

  const { points, sticks, floorY, ceilingY } = ragdoll;
  const g = GRAVITY * dtNorm; // linear — mais estável
  const damp = Math.pow(DAMPING, dtNorm);
  const dtSec = dtNorm * (16.67 / 1000);
  // scroll suave (corpo acompanha o mundo sem sumir)
  const scroll = Math.min(MAX_SCROLL, Math.max(0, scrollSpeed) * 0.35 * dtNorm);

  if (scroll > 0) {
    ragdoll.spikeTipX -= scroll;
  }

  // --- HANG ---
  if (ragdoll.deathType === "spike_hang") {
    if (!ragdoll.hangReleased) {
      ragdoll.hangTimer -= dtSec;
      setPinned(ragdoll.parts.head, ragdoll.spikeTipX, ragdoll.spikeTipY);
      if (ragdoll.hangTimer <= 0) {
        ragdoll.hangReleased = true;
        ragdoll.parts.head.pinned = false;
        // queda suave
        ragdoll.parts.head.oy = ragdoll.parts.head.y - 0.8;
        ragdoll.parts.chest.oy = ragdoll.parts.chest.y - 1.2;
        ragdoll.parts.hip.oy = ragdoll.parts.hip.y - 1.5;
      }
    } else if (!ragdoll.floorKicked) {
      const chest = ragdoll.parts.chest;
      const bottomTipY = floorY - 60;
      if (chest.y >= bottomTipY && chest.y <= bottomTipY + 48) {
        applyImpale(ragdoll, chest.x, bottomTipY, "bottom");
      }
    }
  }

  // --- IMPALE ---
  if (ragdoll.deathType === "spike_impale") {
    const c = ragdoll.parts.chest;
    const hip = ragdoll.parts.hip;
    const targetY =
      ragdoll.spikeSide === "bottom"
        ? Math.min(c.y + 0.08 * dtNorm, ragdoll.spikeTipY + 36)
        : Math.min(c.y + 0.05 * dtNorm, ragdoll.spikeTipY - 2);
    setPinned(c, ragdoll.spikeTipX, targetY);
    hip.x = ragdoll.spikeTipX * 0.7 + hip.x * 0.3;
    hip.y = c.y + 18;
    // não deixa hip acumular velocidade absurda
    hip.ox = hip.x;
    hip.oy = hip.y;
  }

  // --- LOOSE secondary impale ---
  if (ragdoll.deathType === "spike_loose") {
    const chest = ragdoll.parts.chest;
    const bottomTipY = floorY - 60;
    if (
      chest.y >= bottomTipY &&
      chest.y <= bottomTipY + 48 &&
      Math.abs(chest.x - ragdoll.spikeTipX) < 40
    ) {
      applyImpale(ragdoll, ragdoll.spikeTipX, bottomTipY, "bottom");
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
    p.x += vx - scroll;
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

  // chão → kick leve
  if (
    !ragdoll.floorKicked &&
    ragdoll.deathType !== "spike_impale" &&
    ragdoll.parts.hip.y >= floorY - 10
  ) {
    applyFloorKick(ragdoll);
  }

  // amortece quando o jogo está quase parado
  if (scrollSpeed < 0.5 && ragdoll.deathType === "spike_loose") {
    for (const p of points) {
      if (p.pinned) continue;
      p.ox = p.x - (p.x - p.ox) * 0.85;
      p.oy = p.y - (p.y - p.oy) * 0.85;
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
    deathType: ragdoll.deathType,
  };
}

export function angleBetween(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

