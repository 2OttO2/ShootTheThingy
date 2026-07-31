/**
 * Colisão jogador (AABB) × spike (triângulo).
 * Usa epsilon, pontos de amostra no corpo e interseção de segmentos.
 */

const EPS = 0.5;

function sign(p1, p2, p3) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

/** Ponto dentro do triângulo (barycentric / same-side), com margem EPS */
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
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // colinear / toque
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

/** Amostra pontos no corpo do player (não só os 4 cantos) */
function samplePlayerPoints(player) {
  const { x, y, width: w, height: h } = player;
  const pts = [];
  // grade 3x4 cobre torso/cabeça/pernas
  for (let iy = 0; iy <= 3; iy++) {
    for (let ix = 0; ix <= 2; ix++) {
      pts.push({
        x: x + (w * ix) / 2,
        y: y + (h * iy) / 3,
      });
    }
  }
  // centro
  pts.push({ x: x + w * 0.5, y: y + h * 0.5 });
  return pts;
}

function playerEdges(player) {
  const { x, y, width: w, height: h } = player;
  const tl = { x, y };
  const tr = { x: x + w, y };
  const br = { x: x + w, y: y + h };
  const bl = { x, y: y + h };
  return [
    [tl, tr],
    [tr, br],
    [br, bl],
    [bl, tl],
  ];
}

/**
 * @param {{x,y,width,height}} player
 * @param {{points: [{x,y},{x,y},{x,y}], side?: string, index?: number}} spike
 * @returns {boolean}
 */
export function isPlayerCollidingWithSpike(player, spike) {
  if (!player || !spike?.points || spike.points.length < 3) return false;

  const tri = spike.points;

  // 1) qualquer amostra do corpo dentro do triângulo
  const samples = samplePlayerPoints(player);
  if (samples.some((p) => pointInTriangle(p, tri))) return true;

  // 2) vértice do spike dentro do AABB do player
  for (const v of tri) {
    if (
      v.x >= player.x - EPS &&
      v.x <= player.x + player.width + EPS &&
      v.y >= player.y - EPS &&
      v.y <= player.y + player.height + EPS
    ) {
      return true;
    }
  }

  // 3) arestas se cruzam
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
 * Testa lista de hitboxes e devolve info do primeiro hit.
 * @returns {null | { side, index, hitbox, contactY }}
 */
export function findSpikeCollision(player, hitboxes) {
  for (let i = 0; i < hitboxes.length; i++) {
    const hb = hitboxes[i];
    if (isPlayerCollidingWithSpike(player, hb)) {
      // y médio do triângulo como referência de contato
      const cy =
        (hb.points[0].y + hb.points[1].y + hb.points[2].y) / 3;
      return {
        side: hb.side ?? "unknown",
        index: hb.index ?? i,
        hitbox: hb,
        contactY: cy,
        tip: hb.tip ?? null,
      };
    }
  }
  return null;
}

