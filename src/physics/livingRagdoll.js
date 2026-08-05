/**
 * Sistema contínuo de ossos (vivo + transição pra morte).
 *
 * VIVO: raiz (peito) segue o controle arcade; membros são físicos
 *       e reagem a impactos proporcionais — depois recuperam pose.
 * IMPACTO: applyBoneImpact aplica força no ponto/parte.
 * MORTO: releaseBones() solta a raiz; física assume (ou handoff Planck).
 */

function pt(x, y) {
  return { x, y, ox: x, oy: y, fx: 0, fy: 0 };
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
    /** vivo: raiz pinada + recuperação; morto: solto */
    controlled: true,
    /** 0..1 quanto a pose de controle manda vs física livre */
    controlBlend: 1,
  };
}

/**
 * Impacto contínuo (vivo ou morto).
 * @param {object} body
 * @param {{ part?: string, fx: number, fy: number, strength?: number }} impact
 */
export function applyBoneImpact(body, impact = {}) {
  if (!body?.parts) return;
  const strength = impact.strength ?? 1;
  const fx = (impact.fx ?? 0) * strength;
  const fy = (impact.fy ?? 0) * strength;
  const partName = impact.part || "chest";

  const map = {
    head: body.parts.head,
    chest: body.parts.chest,
    torso: body.parts.chest,
    hip: body.parts.hip,
    groin: body.parts.hip,
    armLeft: body.parts.lHand || body.parts.lShoulder,
    armRight: body.parts.rHand || body.parts.rShoulder,
    legLeft: body.parts.lFoot || body.parts.lKnee,
    legRight: body.parts.rFoot || body.parts.rKnee,
    lHand: body.parts.lHand,
    rHand: body.parts.rHand,
    lFoot: body.parts.lFoot,
    rFoot: body.parts.rFoot,
  };
  const target = map[partName] || body.parts.chest;
  if (!target) return;

  // velocidade verlet (ox/oy)
  target.x += fx * 0.08;
  target.y += fy * 0.08;
  target.ox -= fx * 0.12;
  target.oy -= fy * 0.12;

  // torque no tronco proporcional ao offset horizontal do hit
  const chest = body.parts.chest;
  if (chest) {
    const lever = (target.x - chest.x) / 40;
    body.omega += lever * strength * 0.35 + (fx > 0 ? 0.15 : -0.08) * strength;
  }

  // impactos fortes afrouxam o controle temporariamente
  if (body.controlled) {
    const loosen = Math.min(0.75, strength * 0.12);
    body.controlBlend = Math.max(0.25, (body.controlBlend ?? 1) - loosen);
  }
}

/** Solta a raiz — física assume (antes do handoff Planck ou ragdoll livre). */
export function releaseBones(body) {
  if (!body) return;
  body.controlled = false;
  body.controlBlend = 0;
  if (body.parts?.chest) body.parts.chest.pin = false;
}

export function livingImpulse(body, omegaAdd) {
  if (!body) return;
  body.omega += omegaAdd;
  body.omega = Math.max(-18, Math.min(18, body.omega));
}

export function stepLivingRagdoll(
  body,
  x,
  y,
  dtSec,
  velocityY = 0,
  severed = null
) {
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
  const controlled = body.controlled !== false;
  let blend = body.controlBlend ?? 1;
  if (controlled) {
    // recuperação gradual do controle após impacto
    blend = Math.min(1, blend + dt * 1.8);
    body.controlBlend = blend;
  } else {
    blend = 0;
    body.controlBlend = 0;
  }

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

  function place(name, pin, follow = 0.22) {
    const p = parts[name];
    if (!p) return;
    const [lx, ly] = local[name];
    const wx = cx + lx * cos - ly * sin;
    const wy = cy + lx * sin + ly * cos;
    if (pin && controlled) {
      p.x = wx;
      p.y = wy;
      p.ox = wx;
      p.oy = wy;
      p.pin = true;
      return;
    }
    p.pin = false;
    // follow escalado pelo blend de controle
    const f = follow * blend;
    if (f > 0.001) {
      p.x += (wx - p.x) * f;
      p.y += (wy - p.y) * f;
    }
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
    const vy = (p.y - p.oy) * 0.94 + fall * 0.02 + (controlled ? 0.18 : 0.45) * dt * 60;
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
    place(name, false, controlled ? 0.14 : 0.02);
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
    if (controlled) place("chest", true);
  }
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
    controlBlend: body.controlBlend,
  };
}

/** Energia cinética aproximada dos ossos (pra debug / settle vivo). */
export function bonesKinetic(body) {
  if (!body?.parts) return 0;
  let e = Math.abs(body.omega) * 10;
  for (const p of Object.values(body.parts)) {
    if (!p) continue;
    const vx = p.x - p.ox;
    const vy = p.y - p.oy;
    e += vx * vx + vy * vy;
  }
  return e;
}

