/**
 * Colisão jogador (OBB rotacionado) × spike (triângulo)
 * + detecção de face: tip | base | left | right
 */

const EPS = 0.5;

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

function onSegment(a, b, p) {
  return (
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

/** Centro do player (aceita cx/cy ou x/y + size) */
function playerCenter(player) {
  if (player.cx != null && player.cy != null) {
    return { x: player.cx, y: player.cy };
  }
  return {
    x: player.x + player.width * 0.5,
    y: player.y + player.height * 0.5,
  };
}

/** angle em radianos (0 = em pé) */
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

/** Grid de pontos no retângulo local, rotacionado com o corpo */
function samplePlayerPoints(player) {
  const w = player.width;
  const h = player.height;
  const { x: cx, y: cy } = playerCenter(player);
  const ang = playerAngle(player);
  const pts = [];
  for (let iy = 0; iy <= 3; iy++) {
    for (let ix = 0; ix <= 2; ix++) {
      const lx = -w * 0.5 + (w * ix) / 2;
      const ly = -h * 0.5 + (h * iy) / 3;
      pts.push(rotateLocal(lx, ly, ang, cx, cy));
    }
  }
  pts.push({ x: cx, y: cy });
  // extremos cabeça / pés no eixo local Y
  pts.push(rotateLocal(0, -h * 0.5, ang, cx, cy));
  pts.push(rotateLocal(0, h * 0.5, ang, cx, cy));
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

/** AABB do OBB (pra culling rápido) */
function playerAabb(player) {
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

  // culling com AABB do OBB
  const aabb = playerAabb(player);
  let tMinX = Infinity,
    tMaxX = -Infinity,
    tMinY = Infinity,
    tMaxY = -Infinity;
  for (const v of tri) {
    tMinX = Math.min(tMinX, v.x);
    tMaxX = Math.max(tMaxX, v.x);
    tMinY = Math.min(tMinY, v.y);
    tMaxY = Math.max(tMaxY, v.y);
  }
  if (
    aabb.maxX < tMinX - EPS ||
    aabb.minX > tMaxX + EPS ||
    aabb.maxY < tMinY - EPS ||
    aabb.minY > tMaxY + EPS
  ) {
    return false;
  }

  if (samplePlayerPoints(player).some((p) => pointInTriangle(p, tri))) return true;

  // vértice do spike dentro do OBB? (amostra + edges cobre bem)
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

function contactRegion(player, hb) {
  if (!hb?.tip) return "tip";
  const tip = hb.tip;
  const { x: cx, y: cy } = playerCenter(player);

  const distTip = Math.hypot(cx - tip.x, cy - tip.y);
  const basePts = hb.points.filter(
    (p) => Math.hypot(p.x - tip.x, p.y - tip.y) > 2
  );
  let bx = tip.x;
  let by = tip.y;
  if (basePts.length) {
    bx = basePts.reduce((s, p) => s + p.x, 0) / basePts.length;
    by = basePts.reduce((s, p) => s + p.y, 0) / basePts.length;
  }
  const distBase = Math.hypot(cx - bx, cy - by);

  if (hb.side === "bottom") {
    const tipZone = tip.y + (by - tip.y) * 0.42;
    if (cy <= tipZone || distTip < distBase * 0.85 || distTip < 38) return "tip";
    return "base";
  }
  if (distTip < 48 || distTip < distBase * 0.85) return "tip";
  return "base";
}

/**
 * Face: tip | base | left | right
 * Usa pontos do OBB rotacionado.
 */
function contactFace(player, hb, region) {
  if (!hb?.points || hb.points.length < 3) return region || "tip";

  const tip = hb.tip || hb.points[0];
  const pts = samplePlayerPoints(player);
  const { x: cx, y: cy } = playerCenter(player);

  let tipHits = 0;
  let leftHits = 0;
  let rightHits = 0;
  let baseHits = 0;

  const size = hb.size || 48;
  for (const p of pts) {
    if (!pointInTriangle(p, hb.points)) continue;
    const dx = p.x - tip.x;
    const dy = p.y - tip.y;
    const dist = Math.hypot(dx, dy);
    if (dist < size * 0.38) {
      tipHits++;
      continue;
    }
    if (hb.side === "bottom") {
      if (p.y > tip.y + size * 0.55) baseHits++;
      else if (dx < -size * 0.12) leftHits++;
      else if (dx > size * 0.12) rightHits++;
      else tipHits++;
    } else {
      if (p.y < tip.y - size * 0.55) baseHits++;
      else if (dx < -size * 0.12) leftHits++;
      else if (dx > size * 0.12) rightHits++;
      else tipHits++;
    }
  }

  const offsetX = cx - tip.x;
  const lateral = Math.abs(offsetX) / Math.max(size * 0.5, 1);
  const lateralThresh = 0.55;

  if (tipHits >= leftHits && tipHits >= rightHits && tipHits >= baseHits && tipHits > 0) {
    return "tip";
  }
  if (baseHits > tipHits && baseHits >= leftHits && baseHits >= rightHits) {
    return "base";
  }
  if (leftHits > rightHits && leftHits > 0) return "left";
  if (rightHits > leftHits && rightHits > 0) return "right";

  const distToTip = Math.hypot(cx - tip.x, cy - tip.y);
  if (distToTip < size * 0.42) return "tip";

  if (lateral > lateralThresh * 1.25 && region !== "tip" && distToTip > size * 0.5) {
    return offsetX > 0 ? "right" : "left";
  }

  if (region === "base") return "base";
  return "tip";
}

function classifyBodyPart(player, hb) {
  if (!hb?.tip) return "torso";
  const samples = samplePlayerPoints(player);
  const inside = samples.filter((p) => pointInTriangle(p, hb.points));
  if (!inside.length) return "torso";

  // eixo local do player: ly negativo = cabeça
  const { x: cx, y: cy } = playerCenter(player);
  const ang = playerAngle(player);
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  let avgLy = 0;
  for (const p of inside) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const ly = dx * s + dy * c; // local Y
    avgLy += ly;
  }
  avgLy /= inside.length;
  const h = player.height || 56;
  if (avgLy < -h * 0.22) return "head";
  if (avgLy > h * 0.18) return "legs";
  return "torso";
}

export function findSpikeCollision(player, hitboxes) {
  if (!player || !hitboxes?.length) return null;
  for (const hb of hitboxes) {
    if (!isPlayerCollidingWithSpike(player, hb)) continue;
    const region = contactRegion(player, hb);
    const face = contactFace(player, hb, region);
    const bodyPart = classifyBodyPart(player, hb);
    const { x: cx } = playerCenter(player);
    const tip = hb.tip || hb.points[0];
    return {
      ...hb,
      region,
      face,
      bodyPart,
      tip,
      offsetX: cx - (tip?.x ?? cx),
      lateral: Math.abs(cx - (tip?.x ?? cx)) / Math.max(hb.size || 48, 1),
    };
  }
  return null;
}

