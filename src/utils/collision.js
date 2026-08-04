/**
 * Colisão jogador (OBB rotacionado) × spike (triângulo)
 *
 * Resolve com:
 *  - penetração (depth)
 *  - normal de contacto
 *  - região tip | base | left | right
 *  - parte do corpo head | torso | legs | arms
 */

const EPS = 0.35;

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

/** Amostra densa do OBB — melhor detecção de penetração */
function samplePlayerPoints(player) {
  const w = player.width;
  const h = player.height;
  const { x: cx, y: cy } = playerCenter(player);
  const ang = playerAngle(player);
  const pts = [];
  for (let iy = 0; iy <= 5; iy++) {
    for (let ix = 0; ix <= 3; ix++) {
      const lx = -w * 0.5 + (w * ix) / 3;
      const ly = -h * 0.5 + (h * iy) / 5;
      pts.push(rotateLocal(lx, ly, ang, cx, cy));
    }
  }
  // eixos principais
  pts.push(rotateLocal(0, -h * 0.5, ang, cx, cy)); // cabeça
  pts.push(rotateLocal(0, h * 0.5, ang, cx, cy)); // pés
  pts.push(rotateLocal(-w * 0.5, 0, ang, cx, cy));
  pts.push(rotateLocal(w * 0.5, 0, ang, cx, cy));
  pts.push({ x: cx, y: cy });
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

/** Distância ponto → segmento + projeção */
function distPointSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby || 1e-8;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + abx * t;
  const qy = a.y + aby * t;
  const dx = p.x - qx;
  const dy = p.y - qy;
  return { dist: Math.hypot(dx, dy), qx, qy, t };
}

/**
 * Normal apontando PARA FORA do triângulo (empurra o player para fora).
 * Para spike de baixo (ponta pra cima): normal da face tende a apontar pra cima perto da ponta.
 */
function edgeOutwardNormal(a, b, tip) {
  let nx = b.y - a.y;
  let ny = a.x - b.x;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  // garante que aponta para o lado oposto ao tip (para fora)
  const midx = (a.x + b.x) * 0.5;
  const midy = (a.y + b.y) * 0.5;
  const toTipX = tip.x - midx;
  const toTipY = tip.y - midy;
  if (nx * toTipX + ny * toTipY > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

export function isPlayerCollidingWithSpike(player, spike) {
  if (!player || !spike?.points || spike.points.length < 3) return false;
  const tri = spike.points;

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

/**
 * Resolve contacto completo: ponto, normal, depth, região, bodyPart.
 */
function resolveContact(player, hb) {
  const tip = hb.tip || hb.points[0];
  const size = hb.size || 48;
  const tri = hb.points;
  const { x: cx, y: cy } = playerCenter(player);
  const samples = samplePlayerPoints(player);

  // pontos do player dentro do triângulo
  const inside = samples.filter((p) => pointInTriangle(p, tri));

  // arestas do triângulo (sem a "aresta virtual")
  const edges = [
    [tri[0], tri[1]],
    [tri[1], tri[2]],
    [tri[2], tri[0]],
  ];

  let bestDepth = 0;
  let contactX = cx;
  let contactY = cy;
  let nx = 0;
  let ny = hb.side === "bottom" ? -1 : 1; // default: empurra para cima (bottom) ou baixo (top)

  if (inside.length) {
    // penetração ≈ distância mínima até a aresta mais próxima, ao longo da normal para fora
    for (const p of inside) {
      let minD = Infinity;
      let closest = null;
      for (const [a, b] of edges) {
        const r = distPointSegment(p, a, b);
        if (r.dist < minD) {
          minD = r.dist;
          const n = edgeOutwardNormal(a, b, tip);
          closest = { ...r, ...n };
        }
      }
      if (closest && minD > bestDepth) {
        bestDepth = minD;
        contactX = p.x;
        contactY = p.y;
        nx = closest.nx;
        ny = closest.ny;
      }
    }
    // se depth ficou 0 (ponto em vértice), usa direção centro→fora tip
    if (bestDepth < 0.5) {
      bestDepth = 4;
      if (hb.side === "bottom") {
        ny = -1;
        nx = (cx - tip.x) / Math.max(size * 0.5, 1);
      } else {
        ny = 1;
        nx = (cx - tip.x) / Math.max(size * 0.5, 1);
      }
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      contactX = tip.x;
      contactY = tip.y;
    }
  } else {
    // só arestas a tocar — pega interseção / ponto mais próximo
    bestDepth = 2;
    const distTip = Math.hypot(cx - tip.x, cy - tip.y);
    if (distTip < size * 0.5) {
      contactX = tip.x;
      contactY = tip.y;
      nx = (cx - tip.x) / (distTip || 1);
      ny = (cy - tip.y) / (distTip || 1);
      if (hb.side === "bottom" && ny > -0.2) ny = -0.85;
      if (hb.side === "top" && ny < 0.2) ny = 0.85;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
    }
  }

  // —— região: tip se contacto perto da ponta ——
  const distContactTip = Math.hypot(contactX - tip.x, contactY - tip.y);
  const distCenterTip = Math.hypot(cx - tip.x, cy - tip.y);
  let region = "base";
  if (distContactTip < size * 0.38 || distCenterTip < size * 0.34) {
    region = "tip";
  } else {
    // lateral se offset X grande
    const ox = cx - tip.x;
    if (Math.abs(ox) > size * 0.22) {
      region = ox > 0 ? "right" : "left";
    }
  }

  // face = region refinada
  let face = region;
  if (region === "tip") face = "tip";
  else if (region === "left" || region === "right") face = region;
  else face = "base";

  // —— body part a partir do ponto de contacto no espaço local do player ——
  const ang = playerAngle(player);
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  const ldx = contactX - cx;
  const ldy = contactY - cy;
  const localY = ldx * s + ldy * c; // +baixo, -cima
  const localX = ldx * c - ldy * s;
  const h = player.height || 56;
  let bodyPart = "torso";
  if (localY < -h * 0.16) bodyPart = "head";
  else if (localY > h * 0.14) bodyPart = "legs";
  else if (Math.abs(localX) > (player.width || 32) * 0.28 && localY < h * 0.08) {
    bodyPart = "arms";
  }

  return {
    ...hb,
    tip,
    contact: { x: contactX, y: contactY },
    normal: { x: nx, y: ny },
    depth: bestDepth,
    region,
    face,
    bodyPart,
    offsetX: cx - tip.x,
    lateral: Math.abs(cx - tip.x) / Math.max(size, 1),
  };
}

export function findSpikeCollision(player, hitboxes) {
  if (!player || !hitboxes?.length) return null;
  for (const hb of hitboxes) {
    if (!isPlayerCollidingWithSpike(player, hb)) continue;
    return resolveContact(player, hb);
  }
  return null;
}

export function findSpikeCollisionQuad(player, tree) {
  if (!player || !tree) return null;
  const aabb = playerAabb(player);
  const range = {
    minX: aabb.minX - 4,
    minY: aabb.minY - 4,
    maxX: aabb.maxX + 4,
    maxY: aabb.maxY + 4,
  };
  const candidates = tree.query(range);
  const seen = new Set();
  const { x: cx, y: cy } = playerCenter(player);
  let best = null;
  let bestScore = Infinity;
  for (const item of candidates) {
    const hb = item.ref;
    if (!hb || seen.has(hb)) continue;
    seen.add(hb);
    if (!isPlayerCollidingWithSpike(player, hb)) continue;
    const packed = resolveContact(player, hb);
    const tip = packed.tip;
    // prioriza tip + maior penetração
    const d = Math.hypot((tip?.x ?? cx) - cx, (tip?.y ?? cy) - cy);
    const score = d - packed.depth * 2;
    if (score < bestScore) {
      bestScore = score;
      best = packed;
    }
  }
  return best;
}

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
    hits.push(resolveContact(player, hb));
  }
  return hits;
}

/**
 * Aplica resposta física realista: separação + reflexão de velocidade.
 * Mutates playerY / speed refs via callbacks.
 *
 * @returns {{ separated: boolean, bounced: boolean, nx: number, ny: number, depth: number }}
 */
export function applySpikeResponse(hit, speedY, restitution = 0.72) {
  if (!hit?.normal) {
    return { separated: false, bounced: false, nx: 0, ny: 0, depth: 0, speedY };
  }
  const nx = hit.normal.x;
  const ny = hit.normal.y;
  const depth = Math.max(0, hit.depth || 0);

  // componente da velocidade na normal (positiva = entrando no spike)
  const vn = speedY * ny; // só temos vy no arcade; nx afeta impulso visual
  let newSpeedY = speedY;
  let bounced = false;

  if (vn < 0) {
    // afastando — só separa
  } else {
    // refletir: v' = v - (1+e)(v·n)n   (só eixo Y no arcade)
    newSpeedY = speedY - (1 + restitution) * vn * ny;
    // garante que sai do spike
    if (hit.side === "bottom" && newSpeedY > -1.2) newSpeedY = -Math.max(3, Math.abs(speedY) * restitution);
    if (hit.side === "top" && newSpeedY < 1.2) newSpeedY = Math.max(3, Math.abs(speedY) * restitution);
    bounced = true;
  }

  return {
    separated: depth > 0,
    bounced,
    nx,
    ny,
    depth,
    speedY: newSpeedY,
    // quanto empurrar o playerY (ao longo de ny)
    pushY: -ny * Math.min(depth + 1.5, 18),
  };
}
