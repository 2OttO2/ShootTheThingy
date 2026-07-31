/**
 * Ragdoll estilo Happy Wheels — queda rápida + reações por tipo de contato.
 *
 * spike_hang      — ponta teto na cabeça: pendura e solta
 * spike_impale    — ponta no torso: espetado
 * spike_impale_leg— ponta nas pernas: preso baixo, corpo cai pra frente
 * spike_spin      — de lado / glance: gira e cai
 * spike_bounce    — base: ricocheteia e flop
 * spike_flop      — contato mole: corpo mole cai
 * stall
 */

const GRAVITY = 0.55;
const DAMPING = 0.978;
const ITERATIONS = 4;
const FLOOR_FRICTION = 0.68;
const BOUNCE = 0.28;
const MAX_V = 9;

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

function impulse(p, vx, vy) {
  p.ox = p.x - vx;
  p.oy = p.y - vy;
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
    impact = 1, // 0.5..2 escala pela velocidade do hit
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
  const sideSpin = offsetX >= 0 ? 1 : -1; // lado do impacto
  const imp = Math.max(0.6, Math.min(2.2, impact));

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
  if (!sev.armLeft) sticks.push(stick(lShoulder, lHand, 18, 0.8));
  if (!sev.armRight) sticks.push(stick(rShoulder, rHand, 18, 0.8));
  if (!sev.legLeft) {
    sticks.push(stick(hip, lKnee, 14, 0.85));
    sticks.push(stick(lKnee, lFoot, 14, 0.85));
  }
  if (!sev.legRight) {
    sticks.push(stick(hip, rKnee, 14, 0.85));
    sticks.push(stick(rKnee, rFoot, 14, 0.85));
  }
  if (!sev.legLeft && !sev.legRight) {
    sticks.push(stick(lKnee, rKnee, 16, 0.25));
  }

  // herança vertical do impacto (queda rápida)
  const fall = Math.max(0.5, Math.min(4, Math.abs(velocityY) * 0.15 + 1.2));

  // baseline: tudo começa caindo
  for (const p of points) impulse(p, 0, fall * 0.4);

  if (deathType === "spike_hang") {
    setPinned(head, tipX, tipY);
    chest.x = tipX + sideSpin * 2;
    chest.y = tipY + 18;
    hip.x = tipX + sideSpin * 4;
    hip.y = tipY + 40;
    impulse(chest, sideSpin * 0.5 * imp, 1.5);
    impulse(hip, sideSpin * 0.8 * imp, 2.5);
    if (!sev.legLeft) impulse(lFoot, -sideSpin * 2 * imp, 3);
    if (!sev.legRight) impulse(rFoot, sideSpin * 2 * imp, 3);
    if (!sev.armLeft) impulse(lHand, -1.5 * imp, 1);
    if (!sev.armRight) impulse(rHand, 1.5 * imp, 1);
  } else if (deathType === "spike_impale") {
    const cy = spikeSide === "bottom" ? tipY + 16 : Math.max(22, tipY - 18);
    setPinned(chest, tipX, cy);
    hip.x = tipX + sideSpin * 3;
    hip.y = cy + 18;
    head.x = tipX - sideSpin * 2;
    head.y = cy - 16;
    impulse(head, -sideSpin * 1.5 * imp, -0.5);
    if (!sev.legLeft) impulse(lFoot, -3 * imp, 2 * imp);
    if (!sev.legRight) impulse(rFoot, 3 * imp, 2 * imp);
    if (!sev.armLeft) impulse(lHand, -2.5 * imp, 1);
    if (!sev.armRight) impulse(rHand, 2.5 * imp, 1);
  } else if (deathType === "spike_impale_leg") {
    // perna na ponta — hip/pé preso, tronco tomba
    const pin = !sev.legLeft ? lFoot : !sev.legRight ? rFoot : hip;
    setPinned(pin, tipX, tipY + (spikeSide === "bottom" ? 8 : 0));
    impulse(head, sideSpin * 3 * imp, 2);
    impulse(chest, sideSpin * 2.5 * imp, 2.5);
    impulse(hip, sideSpin * 1.5 * imp, 1);
    if (!sev.armLeft) impulse(lHand, -2 * imp, 2);
    if (!sev.armRight) impulse(rHand, 2 * imp, 2);
  } else if (deathType === "spike_spin") {
    // glance / lado — gira feito roda
    const spin = sideSpin * 3.5 * imp;
    impulse(head, spin, fall);
    impulse(chest, spin * 0.6, fall * 1.1);
    impulse(hip, -spin * 0.4, fall * 1.2);
    if (!sev.legLeft) impulse(lFoot, -spin * 1.2, fall);
    if (!sev.legRight) impulse(rFoot, spin * 1.2, fall);
    if (!sev.armLeft) impulse(lHand, -spin, fall * 0.5);
    if (!sev.armRight) impulse(rHand, spin, fall * 0.5);
  } else if (deathType === "spike_bounce") {
    // base — ricochete pra longe do spike
    const away = spikeSide === "top" ? 1 : -1; // top empurra pra baixo; bottom pra cima
    impulse(head, sideSpin * 2 * imp, away * 3 * imp + fall * 0.3);
    impulse(chest, sideSpin * 1.5 * imp, away * 3.5 * imp);
    impulse(hip, sideSpin * 1 * imp, away * 2.5 * imp);
    if (!sev.legLeft) impulse(lFoot, -sideSpin * 2, away * 2);
    if (!sev.legRight) impulse(rFoot, sideSpin * 2, away * 2);
  } else if (deathType === "spike_flop") {
    // mole — membros desgovernados
    impulse(head, sideSpin * 0.8, fall * 1.2);
    impulse(chest, 0, fall);
    impulse(hip, -sideSpin * 0.5, fall * 1.3);
    if (!sev.legLeft) impulse(lFoot, 2.5 * imp, -1);
    if (!sev.legRight) impulse(rFoot, -3 * imp, -1.2);
    if (!sev.armLeft) impulse(lHand, -2 * imp, 2);
    if (!sev.armRight) impulse(rHand, 2.2 * imp, 1.5);
  } else {
    // stall
    for (const p of points) impulse(p, (Math.random() - 0.5) * 0.5, 1 + Math.random());
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
    hangTimer: deathType === "spike_hang" ? 0.75 : 0,
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
  for (const p of ragdoll.points) p.pinned = false;
  const { severed, parts, sideSpin } = ragdoll;
  const s = sideSpin || 1;
  if (!severed.legLeft && parts.lFoot) {
    impulse(parts.lFoot, 3 * s, 1.5);
    clampV(parts.lFoot);
  }
  if (!severed.legRight && parts.rFoot) {
    impulse(parts.rFoot, -3.2 * s, 1.6);
    clampV(parts.rFoot);
  }
  impulse(parts.hip, 0.5 * s, 1.2);
  impulse(parts.chest, 0.3 * s, 0.8);
}

function applyImpale(ragdoll, tipX, tipY, side) {
  ragdoll.deathType = "spike_impale";
  ragdoll.spikeSide = side;
  ragdoll.spikeTipX = tipX;
  ragdoll.spikeTipY = tipY;
  const cy = side === "bottom" ? tipY + 16 : Math.max(22, tipY - 18);
  setPinned(ragdoll.parts.chest, tipX, cy);
  ragdoll.parts.hip.x = tipX;
  ragdoll.parts.hip.y = cy + 18;
  ragdoll.parts.hip.ox = tipX;
  ragdoll.parts.hip.oy = cy + 18;
  ragdoll.parts.head.x = tipX;
  ragdoll.parts.head.y = cy - 16;
  ragdoll.parts.head.ox = tipX;
  ragdoll.parts.head.oy = cy - 16;
}

export function stepRagdoll(ragdoll, dtNorm = 1) {
  if (!ragdoll || !ragdoll.alive) return;

  const { points, sticks, floorY, ceilingY } = ragdoll;
  const g = GRAVITY * dtNorm;
  const damp = Math.pow(DAMPING, dtNorm);
  const dtSec = dtNorm * (16.67 / 1000);

  if (ragdoll.deathType === "spike_hang") {
    if (!ragdoll.hangReleased) {
      ragdoll.hangTimer -= dtSec;
      setPinned(ragdoll.parts.head, ragdoll.spikeTipX, ragdoll.spikeTipY);
      if (ragdoll.hangTimer <= 0) {
        ragdoll.hangReleased = true;
        ragdoll.parts.head.pinned = false;
        // queda rápida ao soltar
        impulse(ragdoll.parts.head, 0, 2);
        impulse(ragdoll.parts.chest, 0, 2.5);
        impulse(ragdoll.parts.hip, 0, 3);
      }
    } else if (!ragdoll.floorKicked) {
      const chest = ragdoll.parts.chest;
      const bottomTipY = floorY - 60;
      if (chest.y >= bottomTipY && chest.y <= bottomTipY + 52) {
        applyImpale(ragdoll, chest.x, bottomTipY, "bottom");
      }
    }
  }

  if (ragdoll.deathType === "spike_impale") {
    const c = ragdoll.parts.chest;
    const hip = ragdoll.parts.hip;
    let targetY = c.y;
    if (ragdoll.spikeSide === "bottom") {
      targetY = Math.min(c.y + 0.18 * dtNorm, ragdoll.spikeTipY + 40);
    } else {
      targetY = Math.min(c.y + 0.1 * dtNorm, Math.max(20, ragdoll.spikeTipY - 4));
    }
    setPinned(c, ragdoll.spikeTipX, targetY);
    hip.x = ragdoll.spikeTipX;
    hip.y = c.y + 18;
    hip.ox = hip.x;
    hip.oy = hip.y;
  }

  if (ragdoll.deathType === "spike_impale_leg") {
    // mantém o pin do pé se existir
    for (const p of points) {
      if (p.pinned) {
        p.x = ragdoll.spikeTipX;
        p.ox = p.x;
      }
    }
  }

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

