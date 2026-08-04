/**
 * Geometria de colisão: player OBB × spike triângulo.
 *
 * API pública:
 *   playerAabb / isPlayerCollidingWithSpike
 *   findAllSpikeCollisionsQuad / findSpikeCollision / findSpikeCollisionQuad
 *   resolveSpikeContacts → ContactResult
 *
 * Classificação de gameplay (impale/bounce) fica em systems/spikeCollision.js
 */

const EPS = 0.5;
const RESTITUTION = 0.78;

// ─── helpers geométricos ────────────────────────────────────────────

function sign(p1, p2, p3) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

export function pointInTriangle(point, triangle) {
  const [a, b, c] = triangle;
  const b1 = sign(point, a, b) < EPS;
  const b2 = sign(point, b, c) < EPS;
  const b3 = sign(point, c, a) < EPS;
  return b1 === b2 && b2 === b3;
}

function onSegment(a, b, p) {
  return (
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

function segmentsIntersect(a, b, c, d) {
  const d1 = sign(c, d, a);
  const d2 = sign(c, d, b);
  const d3 = sign(a, b, c);
  const d4 = sign(a, b, d);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  if (Math.abs(d1) < EPS && onSegment(c, d, a)) return true;
  if (Math.abs(d2) < EPS && onSegment(c, d, b)) return true;
  if (Math.abs(d3) < EPS && onSegment(a, b, c)) return true;
  if (Math.abs(d4) < EPS && onSegment(a, b, d)) return true;
  return false;
}

function playerCenter(player) {
  if (player.cx != null && player.cy != null) {
    return { x: player.cx, y: player.cy };
  }
  return {
    x: player.x + player.width * 0.5,
    y: player.y + player.height * 0.5,
  };
}

function playerAngle(player) {
  return player.angle || 0;
}

function rotateLocal(lx, ly, ang, cx, cy) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return {
    x: cx + lx * c - ly * s,
    y: cy + lx * s + ly * c,
  };
}

function samplePlayerPoints(player) {
  const w = player.width;
  const h = player.height;
  const { x: cx, y: cy } = playerCenter(player);
  const ang = playerAngle(player);
  const pts = [];
  for (let iy = 0; iy <= 4; iy++) {
    for (let ix = 0; ix <= 2; ix++) {
      const lx = -w * 0.5 + (w * ix) / 2;
      const ly = -h * 0.5 + (h * iy) / 4;
      pts.push(rotateLocal(lx, ly, ang, cx, cy));
    }
  }
  pts.push(rotateLocal(0, -h * 0.5, ang, cx, cy));
  pts.push(rotateLocal(0, h * 0.5, ang, cx, cy));
  pts.push(rotateLocal(-w * 0.5, 0, ang, cx, cy));
  pts.push(rotateLocal(w * 0.5, 0, ang, cx, cy));
  return pts;
}

function playerCorners(player) {
  const w = player.width;
  const h = player.height;
  const { x: cx, y: cy } = playerCenter(player);
  const ang = playerAngle(player);
  const hw = w * 0.5;
  const hh = h * 0.5;
  return [
    rotateLocal(-hw, -hh, ang, cx, cy),
    rotateLocal(hw, -hh, ang, cx, cy),
    rotateLocal(hw, hh, ang, cx, cy),
    rotateLocal(-hw, hh, ang, cx, cy),
  ];
}

function playerEdges(player) {
  const c = playerCorners(player);
  return [
    [c[0], c[1]],
    [c[1], c[2]],
    [c[2], c[3]],
    [c[3], c[0]],
  ];
}

function triAabb(tri) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const v of tri) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  return { minX, maxX, minY, maxY };
}

function aabbOverlap(a, b, pad = EPS) {
  return !(
    a.maxX < b.minX - pad ||
    a.minX > b.maxX + pad ||
    a.maxY < b.minY - pad ||
    a.minY > b.maxY + pad
  );
}

function distPointSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1e-8;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + abx * t;
  const qy = a.y + aby * t;
  return { dist: Math.hypot(p.x - qx, p.y - qy), qx, qy, t };
}

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function outwardNormal(nx, ny, tip, baseA, baseB) {
  const midX = (tip.x + baseA.x + baseB.x) / 3;
  const midY = (tip.y + baseA.y + baseB.y) / 3;
  if (nx * (midX - tip.x) + ny * (midY - tip.y) > 0) {
    return { x: -nx, y: -ny };
  }
  return { x: nx, y: ny };
}

// ─── OBB / overlap ──────────────────────────────────────────────────

export function playerAabb(player) {
  const c = playerCorners(player);
  let minX = c[0].x,
    maxX = c[0].x,
    minY = c[0].y,
    maxY = c[0].y;
  for (let i = 1; i < c.length; i++) {
    minX = Math.min(minX, c[i].x);
    maxX = Math.max(maxX, c[i].x);
    minY = Math.min(minY, c[i].y);
    maxY = Math.max(maxY, c[i].y);
  }
  return { minX, maxX, minY, maxY };
}

export function isPlayerCollidingWithSpike(player, spike) {
  if (!player || !spike?.points || spike.points.length < 3) return false;
  const tri = spike.points;
  if (!aabbOverlap(playerAabb(player), triAabb(tri))) return false;

  if (samplePlayerPoints(player).some((p) => pointInTriangle(p, tri))) {
    return true;
  }

  const edges = playerEdges(player);
  const triEdges = [
    [tri[0], tri[1]],
    [tri[1], tri[2]],
    [tri[2], tri[0]],
  ];
  for (const [a, b] of edges) {
    for (const [c, d] of triEdges) {
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

// ─── análise de contacto ────────────────────────────────────────────

/**
 * Feature + normal (para fora do spike) + penetração + bodyPart.
 */
function analyzeContact(player, hb) {
  const tip = hb.tip || hb.points[0];
  const size = hb.size || 48;
  const { x: cx, y: cy } = playerCenter(player);
  const samples = samplePlayerPoints(player);
  const inside = samples.filter((p) => pointInTriangle(p, hb.points));

  const others = hb.points.filter(
    (p) => Math.hypot(p.x - tip.x, p.y - tip.y) > 2
  );
  const baseA = others[0] || hb.points[1];
  const baseB = others[1] || hb.points[2];

  let avgDistTip = 0;
  let deepest = 0;
  let deepPt = { x: cx, y: cy };

  if (inside.length) {
    for (const p of inside) {
      avgDistTip += Math.hypot(p.x - tip.x, p.y - tip.y);
      const pen =
        hb.side === "bottom"
          ? Math.max(0, tip.y + size * 0.15 - p.y)
          : Math.max(0, p.y - (tip.y - size * 0.15));
      if (pen > deepest) {
        deepest = pen;
        deepPt = p;
      }
    }
    avgDistTip /= inside.length;
  } else {
    avgDistTip = Math.hypot(cx - tip.x, cy - tip.y);
  }

  const distCenterTip = Math.hypot(cx - tip.x, cy - tip.y);
  const tipZone = size * 0.36;

  // feature
  let feature = "base";
  if (distCenterTip < tipZone || avgDistTip < tipZone * 1.1) {
    feature = "tip";
  } else {
    const dL = distPointSegment({ x: cx, y: cy }, tip, baseA);
    const dR = distPointSegment({ x: cx, y: cy }, tip, baseB);
    const dB = distPointSegment({ x: cx, y: cy }, baseA, baseB);
    if (dB.dist <= dL.dist && dB.dist <= dR.dist) feature = "base";
    else if (dL.dist < dR.dist) feature = "edgeL";
    else feature = "edgeR";
  }

  // normal para fora
  let nx = 0;
  let ny = 0;
  if (feature === "tip") {
    ({ x: nx, y: ny } = normalize(cx - tip.x, cy - tip.y));
    if (hb.side === "bottom" && ny < 0.2) ({ x: nx, y: ny } = normalize(nx, 0.4));
    if (hb.side === "top" && ny > -0.2) ({ x: nx, y: ny } = normalize(nx, -0.4));
  } else if (feature === "base") {
    nx = 0;
    ny = hb.side === "bottom" ? -1 : 1;
  } else {
    const edgeB = feature === "edgeL" ? baseA : baseB;
    const n = normalize(-(edgeB.y - tip.y), edgeB.x - tip.x);
    const out = outwardNormal(n.x, n.y, tip, baseA, baseB);
    nx = out.x;
    ny = out.y;
  }

  let penetration = deepest;
  if (penetration < 2 && inside.length) penetration = 4 + inside.length * 1.5;
  if (penetration < 1) penetration = 2;

  // body part em espaço local do player
  const ang = playerAngle(player);
  const cos = Math.cos(-ang);
  const sin = Math.sin(-ang);
  const ly =
    (deepPt.x - cx) * sin + (deepPt.y - cy) * cos;
  const h = player.height || 56;
  let bodyPart = "torso";
  if (ly < -h * 0.2) bodyPart = "head";
  else if (ly > h * 0.14) bodyPart = "legs";
  else if (Math.abs(cx - tip.x) > size * 0.3 && ly < h * 0.08) bodyPart = "arms";

  return {
    hb,
    tip,
    side: hb.side,
    feature,
    bodyPart,
    nx,
    ny,
    penetration,
    contactX: deepPt.x,
    contactY: deepPt.y,
    distTip: distCenterTip,
    offsetX: cx - tip.x,
  };
}

function classifyKind(best, velocityY) {
  const towardTip =
    (best.side === "bottom" && velocityY > 0.5) ||
    (best.side === "top" && velocityY < -0.5);

  if (best.feature !== "tip") return { kind: "bounce", limbKey: null };

  if (best.bodyPart === "legs" || best.bodyPart === "arms") {
    const limbKey =
      best.bodyPart === "arms"
        ? best.offsetX < 0
          ? "armLeft"
          : "armRight"
        : best.offsetX < 0
          ? "legLeft"
          : "legRight";
    return { kind: "impale_limb", limbKey };
  }

  if (
    towardTip ||
    best.penetration > 6 ||
    best.distTip < (best.hb.size || 48) * 0.28
  ) {
    return { kind: "impale_core", limbKey: null };
  }

  return { kind: "bounce", limbKey: null };
}

function computeImpulseY(best, velocityY, kind) {
  const absVy = Math.abs(velocityY);
  const vn = velocityY * best.ny;
  let impulseY =
    vn < 0
      ? -(1 + RESTITUTION) * vn
      : best.ny * (2.5 + Math.min(4, absVy * 0.15));

  if (kind === "bounce") {
    if (best.side === "bottom" && impulseY > -2) {
      impulseY = -Math.max(3.5, absVy * RESTITUTION);
    }
    if (best.side === "top" && impulseY < 2) {
      impulseY = Math.max(3.5, absVy * RESTITUTION);
    }
  }
  return impulseY;
}

const NONE_CONTACT = {
  kind: "none",
  side: null,
  bodyPart: "torso",
  feature: "base",
  tip: null,
  nx: 0,
  ny: 0,
  penetration: 0,
  impulseY: 0,
  offsetX: 0,
  limbKey: null,
  contactX: 0,
  contactY: 0,
};

/**
 * Resolve todos os hits do frame → um ContactResult.
 * kind: none | impale_core | impale_limb | bounce
 */
export function resolveSpikeContacts(player, hits, velocityY = 0) {
  if (!hits?.length) return { ...NONE_CONTACT };

  const analyzed = hits.map((hb) => analyzeContact(player, hb));
  analyzed.sort((a, b) => {
    const score = (c) =>
      (c.feature === "tip" ? 1000 : 0) + c.penetration * 10 - c.distTip * 0.1;
    return score(b) - score(a);
  });
  const best = analyzed[0];
  const { kind, limbKey } = classifyKind(best, velocityY);
  const impulseY = computeImpulseY(best, velocityY, kind);

  return {
    kind,
    side: best.side,
    bodyPart: best.bodyPart,
    feature: best.feature,
    tip: best.tip,
    nx: best.nx,
    ny: best.ny,
    penetration: best.penetration,
    impulseY,
    offsetX: best.offsetX,
    limbKey,
    contactX: best.contactX,
    contactY: best.contactY,
  };
}

// ─── queries ────────────────────────────────────────────────────────

export function findAllSpikeCollisionsQuad(player, tree) {
  if (!player || !tree) return [];
  const aabb = playerAabb(player);
  const range = {
    minX: aabb.minX - 4,
    minY: aabb.minY - 4,
    maxX: aabb.maxX + 4,
    maxY: aabb.maxY + 4,
  };
  const candidates = tree.query(range);
  const seen = new Set();
  const hits = [];
  for (const item of candidates) {
    const hb = item.ref;
    if (!hb || seen.has(hb)) continue;
    seen.add(hb);
    if (!isPlayerCollidingWithSpike(player, hb)) continue;
    hits.push(hb);
  }
  return hits;
}

export function findSpikeCollision(player, hitboxes) {
  if (!player || !hitboxes?.length) return null;
  for (const hb of hitboxes) {
    if (!isPlayerCollidingWithSpike(player, hb)) continue;
    return hb;
  }
  return null;
}

export function findSpikeCollisionQuad(player, tree) {
  return findAllSpikeCollisionsQuad(player, tree)[0] || null;
}
