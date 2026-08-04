/**
 * Física ÚNICA do personagem (vivo + morte).
 *
 * - VIVO: raiz (peito) segue o controle arcade; membros reagem a impactos
 *         e recuperam pose.
 * - IMPACTO: applyBoneImpact aplica força no ponto/parte.
 * - IMPALE: pinPart() fixa um osso no tip do spike (membro ou núcleo).
 * - MORTO / solto: releaseBones() ou pin de núcleo → controlBlend = 0.
 *
 * Não há handoff para outro sistema de física.
 */

function pt(x, y) {
  return { x, y, ox: x, oy: y, fx: 0, fy: 0, pin: false };
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

const PART_MAP = {
  head: "head",
  chest: "chest",
  torso: "chest",
  hip: "hip",
  groin: "hip",
  armLeft: "lHand",
  armRight: "rHand",
  legLeft: "lFoot",
  legRight: "rFoot",
  lHand: "lHand",
  rHand: "rHand",
  lFoot: "lFoot",
  rFoot: "rFoot",
  lShoulder: "lShoulder",
  rShoulder: "rShoulder",
  lKnee: "lKnee",
  rKnee: "rKnee",
};

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
    /** vivo: raiz pinada + recuperação; morto / núcleo impalado: solto */
    controlled: true,
    /** 0..1 quanto a pose de controle manda vs física livre */
    controlBlend: 1,
    /** pins externos (impale): { partKey: { x, y, side, isCore } } */
    externalPins: {},
  };
}

/**
 * Fixa um osso no tip do spike.
 * partName: "head" | "chest" | "torso" | "legLeft" | ...
 * isCore: true → solta o controle arcade (corpo fica pendurado).
 */
export function pinPart(body, partName, x, y, opts = {}) {
  if (!body?.parts) return;
  const key = PART_MAP[partName] || partName;
  const p = body.parts[key];
  if (!p) return;

  p.pin = true;
  p.x = x;
  p.y = y;
  p.ox = x;
  p.oy = y;

  body.externalPins[key] = {
    x,
    y,
    side: opts.side || "bottom",
    isCore: !!opts.isCore,
    /** pin de núcleo fica fixo na tela (player não rola com o mapa) */
    screenFixed: opts.screenFixed != null ? !!opts.screenFixed : !!opts.isCore,
    partName,
  };

  if (opts.isCore) {
    body.controlled = false;
    body.controlBlend = 0;
    if (body.parts.chest && key !== "chest") {
      body.parts.chest.pin = false;
    }
  }
}

/** Remove pin de um osso. */
export function unpinPart(body, partName) {
  if (!body?.parts) return;
  const key = PART_MAP[partName] || partName;
  const p = body.parts[key];
  if (p) p.pin = false;
  delete body.externalPins[key];
}

/** Move pins que acompanham o mapa (não move screenFixed / núcleo). */
export function shiftPins(body, dx) {
  if (!body?.externalPins) return;
  for (const key of Object.keys(body.externalPins)) {
    const pin = body.externalPins[key];
    if (pin.screenFixed || pin.isCore) continue;
    pin.x += dx;
    const p = body.parts[key];
    if (p) {
      p.x = pin.x;
      p.y = pin.y;
      p.ox = pin.x;
      p.oy = pin.y;
    }
  }
}

/** Tem pin de núcleo (cabeça/peito)? */
export function hasCorePin(body) {
  if (!body?.externalPins) return false;
  return Object.values(body.externalPins).some((p) => p.isCore);
}

/**
 * Impacto contínuo (vivo ou morto).
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
  if (!target || target.pin) return;

  target.x += fx * 0.08;
  target.y += fy * 0.08;
  target.ox -= fx * 0.12;
  target.oy -= fy * 0.12;

  const chest = body.parts.chest;
  if (chest && !chest.pin) {
    const lever = (target.x - chest.x) / 40;
    body.omega += lever * strength * 0.35 + (fx > 0 ? 0.15 : -0.08) * strength;
  }

  if (body.controlled) {
    const loosen = Math.min(0.75, strength * 0.12);
    body.controlBlend = Math.max(0.25, (body.controlBlend ?? 1) - loosen);
  }
}

/** Solta a raiz — física assume. */
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
  const corePinned = hasCorePin(body);
  const controlled = body.controlled !== false && !corePinned;
  let blend = body.controlBlend ?? 1;
  if (controlled) {
    blend = Math.min(1, blend + dt * 1.8);
    body.controlBlend = blend;
  } else {
    blend = 0;
    body.controlBlend = 0;
  }

  // quando impalado, amortece menos o spin → corpo balança no pin
  body.omega *= Math.pow(corePinned ? 0.992 : 0.978, dt * 60);
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

  // aplica pins externos (impale)
  for (const key of Object.keys(body.externalPins || {})) {
    const pin = body.externalPins[key];
    const p = parts[key];
    if (!p) continue;
    p.x = pin.x;
    p.y = pin.y;
    p.ox = pin.x;
    p.oy = pin.y;
    p.pin = true;
  }

  function place(name, pin, follow = 0.22) {
    const p = parts[name];
    if (!p) return;
    // pin externo manda
    if (body.externalPins?.[name]) return;
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
    const f = follow * blend;
    if (f > 0.001) {
      p.x += (wx - p.x) * f;
      p.y += (wy - p.y) * f;
    }
  }

  // se núcleo está pinado, não força o peito pro arcade
  if (!corePinned) {
    place("chest", true);
  }
  place("head", false, 0.28);
  place("hip", false, 0.28);
  place("lShoulder", false, 0.26);
  place("rShoulder", false, 0.26);

  const fall = velocityY * 0.1 * dt * 60;
  // impalado: gravidade cheia nos membros livres (pendura de verdade)
  const gravityMul = controlled ? 0.18 : corePinned ? 0.72 : 0.55;
  for (const name of [
    "lHand",
    "rHand",
    "lKnee",
    "rKnee",
    "lFoot",
    "rFoot",
    "head",
    "hip",
    "chest",
  ]) {
    const p = parts[name];
    if (!p || p.pin) continue;
    if (body.externalPins?.[name]) continue;
    const vx = (p.x - p.ox) * 0.94;
    const vy = (p.y - p.oy) * 0.94 + fall * 0.02 + gravityMul * dt * 60;
    p.ox = p.x;
    p.oy = p.y;
    p.x += vx;
    p.y += vy;
  }

  for (const name of ["lHand", "rHand", "lKnee", "rKnee", "lFoot", "rFoot"]) {
    const p = parts[name];
    if (!p) continue;
    if (body.externalPins?.[name]) continue;
    if (body.severed.armLeft && name === "lHand") continue;
    if (body.severed.armRight && name === "rHand") continue;
    if (body.severed.legLeft && (name === "lKnee" || name === "lFoot")) continue;
    if (body.severed.legRight && (name === "rKnee" || name === "rFoot")) continue;
    place(name, false, controlled ? 0.14 : 0.02);
  }

  const iters = corePinned ? 6 : 4;
  for (let i = 0; i < iters; i++) {
    // re-aplica pins antes das constraints
    for (const key of Object.keys(body.externalPins || {})) {
      const pin = body.externalPins[key];
      const p = parts[key];
      if (!p) continue;
      p.x = pin.x;
      p.y = pin.y;
      p.ox = pin.x;
      p.oy = pin.y;
      p.pin = true;
    }
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
    if (controlled && !corePinned) place("chest", true);
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
    hasCorePin: hasCorePin(body),
  };
}

/** Energia cinética aproximada dos ossos. */
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
