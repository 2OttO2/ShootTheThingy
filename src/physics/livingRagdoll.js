/**
 * Ragdoll vivo: tronco segue player, membros balançam (menos gelatina).
 */
function pt(x, y) {
  return { x, y, ox: x, oy: y };
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function stick(a, b, len, stiff = 0.5) {
  return { a, b, len: len ?? dist(a, b), stiff };
}

function constrain(s) {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  const diff = ((s.len - d) / d) * 0.5 * s.stiff;
  const ox = dx * diff;
  const oy = dy * diff;
  if (!s.a.pin) {
    s.a.x -= ox;
    s.a.y -= oy;
  }
  if (!s.b.pin) {
    s.b.x += ox;
    s.b.y += oy;
  }
}

export function createLivingRagdoll(x, y, severed = {}) {
  const cx = x + 24;
  const top = y;
  const sev = {
    legLeft: !!severed.legLeft,
    legRight: !!severed.legRight,
    armLeft: !!severed.armLeft,
    armRight: !!severed.armRight,
  };

  const head = pt(cx, top + 12);
  const chest = pt(cx, top + 30);
  const hip = pt(cx, top + 50);
  const lShoulder = pt(cx - 12, top + 28);
  const rShoulder = pt(cx + 12, top + 28);
  const lHand = pt(cx - 18, top + 48);
  const rHand = pt(cx + 18, top + 48);
  const lKnee = pt(cx - 8, top + 64);
  const rKnee = pt(cx + 8, top + 64);
  const lFoot = pt(cx - 10, top + 78);
  const rFoot = pt(cx + 10, top + 78);

  chest.pin = true;

  const points = [head, chest, hip, lShoulder, rShoulder];
  if (!sev.armLeft) points.push(lHand);
  if (!sev.armRight) points.push(rHand);
  if (!sev.legLeft) points.push(lKnee, lFoot);
  if (!sev.legRight) points.push(rKnee, rFoot);

  const sticks = [
    stick(head, chest, 17, 0.72),
    stick(chest, hip, 20, 0.68),
    stick(chest, lShoulder, 12, 0.55),
    stick(chest, rShoulder, 12, 0.55),
    stick(lShoulder, rShoulder, 24, 0.35),
  ];
  if (!sev.armLeft) sticks.push(stick(lShoulder, lHand, 20, 0.4));
  if (!sev.armRight) sticks.push(stick(rShoulder, rHand, 20, 0.4));
  if (!sev.legLeft) {
    sticks.push(stick(hip, lKnee, 15, 0.48));
    sticks.push(stick(lKnee, lFoot, 15, 0.42));
  }
  if (!sev.legRight) {
    sticks.push(stick(hip, rKnee, 15, 0.48));
    sticks.push(stick(rKnee, rFoot, 15, 0.42));
  }

  return {
    points,
    sticks,
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
    severed: sev,
    angle: 0,
    omega: 0,
  };
}

export function stepLivingRagdoll(body, x, y, dtSec, velocityY = 0, severed = null) {
  if (!body) return;
  if (severed) {
    body.severed = {
      legLeft: !!severed.legLeft,
      legRight: !!severed.legRight,
      armLeft: !!severed.armLeft,
      armRight: !!severed.armRight,
    };
  }

  const dt = Math.min(dtSec, 0.033);
  const { parts } = body;

  body.omega *= Math.pow(0.978, dt * 60);
  body.angle += body.omega * dt;

  const cx = x + 24;
  const cy = y + 32;
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);

  const local = {
    head: [0, -20],
    chest: [0, 0],
    hip: [0, 20],
    lShoulder: [-12, -2],
    rShoulder: [12, -2],
    lHand: [-16, 18],
    rHand: [16, 18],
    lKnee: [-8, 36],
    rKnee: [8, 36],
    lFoot: [-10, 52],
    rFoot: [10, 52],
  };

  // follow mais firme = menos gelatina
  function place(name, pin, follow = 0.22) {
    const p = parts[name];
    if (!p) return;
    const [lx, ly] = local[name];
    const wx = cx + lx * cos - ly * sin;
    const wy = cy + lx * sin + ly * cos;
    if (pin) {
      p.x = wx;
      p.y = wy;
      p.ox = wx;
      p.oy = wy;
      p.pin = true;
      return;
    }
    p.pin = false;
    p.x += (wx - p.x) * follow;
    p.y += (wy - p.y) * follow;
  }

  place("chest", true);
  place("head", false, 0.28);
  place("hip", false, 0.28);
  place("lShoulder", false, 0.26);
  place("rShoulder", false, 0.26);

  const fall = velocityY * 0.1 * dt * 60;
  for (const name of [
    "lHand",
    "rHand",
    "lKnee",
    "rKnee",
    "lFoot",
    "rFoot",
    "head",
    "hip",
  ]) {
    const p = parts[name];
    if (!p || p.pin) continue;
    const vx = (p.x - p.ox) * 0.94;
    const vy = (p.y - p.oy) * 0.94 + fall * 0.02 + 0.18 * dt * 60;
    p.ox = p.x;
    p.oy = p.y;
    p.x += vx;
    p.y += vy;
  }

  for (const name of ["lHand", "rHand", "lKnee", "rKnee", "lFoot", "rFoot"]) {
    const p = parts[name];
    if (!p) continue;
    if (body.severed.armLeft && name === "lHand") continue;
    if (body.severed.armRight && name === "rHand") continue;
    if (body.severed.legLeft && (name === "lKnee" || name === "lFoot")) continue;
    if (body.severed.legRight && (name === "rKnee" || name === "rFoot")) continue;
    place(name, false, 0.14);
  }

  for (let i = 0; i < 4; i++) {
    for (const s of body.sticks) {
      const sev = body.severed;
      if (sev.armLeft && (s.a === parts.lHand || s.b === parts.lHand)) continue;
      if (sev.armRight && (s.a === parts.rHand || s.b === parts.rHand)) continue;
      if (
        sev.legLeft &&
        (s.a === parts.lKnee ||
          s.b === parts.lKnee ||
          s.a === parts.lFoot ||
          s.b === parts.lFoot)
      )
        continue;
      if (
        sev.legRight &&
        (s.a === parts.rKnee ||
          s.b === parts.rKnee ||
          s.a === parts.rFoot ||
          s.b === parts.rFoot)
      )
        continue;
      constrain(s);
    }
    place("chest", true);
  }
}

export function livingImpulse(body, omegaAdd) {
  if (!body) return;
  body.omega += omegaAdd;
  body.omega = Math.max(-18, Math.min(18, body.omega));
}

export function livingSnapshot(body) {
  if (!body) return null;
  const p = body.parts;
  const sev = body.severed;
  return {
    head: { x: p.head.x, y: p.head.y },
    chest: { x: p.chest.x, y: p.chest.y },
    hip: { x: p.hip.x, y: p.hip.y },
    lShoulder: { x: p.lShoulder.x, y: p.lShoulder.y },
    rShoulder: { x: p.rShoulder.x, y: p.rShoulder.y },
    lHand: p.lHand
      ? { x: p.lHand.x, y: p.lHand.y }
      : { x: p.lShoulder.x, y: p.lShoulder.y + 16 },
    rHand: p.rHand
      ? { x: p.rHand.x, y: p.rHand.y }
      : { x: p.rShoulder.x, y: p.rShoulder.y + 16 },
    lKnee: p.lKnee
      ? { x: p.lKnee.x, y: p.lKnee.y }
      : { x: p.hip.x - 8, y: p.hip.y + 14 },
    rKnee: p.rKnee
      ? { x: p.rKnee.x, y: p.rKnee.y }
      : { x: p.hip.x + 8, y: p.hip.y + 14 },
    lFoot: p.lFoot
      ? { x: p.lFoot.x, y: p.lFoot.y }
      : { x: p.hip.x - 10, y: p.hip.y + 28 },
    rFoot: p.rFoot
      ? { x: p.rFoot.x, y: p.rFoot.y }
      : { x: p.hip.x + 10, y: p.hip.y + 28 },
    severed: { ...sev },
  };
}

