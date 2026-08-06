/**
 * Colisão de pontos do ragdoll com o mundo (chão já no verlet) e spikes (triângulos).
 */

const EPS = 0.01;

function sign(p1, p2, p3) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

export function pointInTriangle(point, tri) {
  const [a, b, c] = tri;
  const b1 = sign(point, a, b) < EPS;
  const b2 = sign(point, b, c) < EPS;
  const b3 = sign(point, c, a) < EPS;
  return b1 === b2 && b2 === b3;
}

/** Empurra o ponto para fora do triângulo, na direção do centro → ponto */
function pushOutOfTriangle(p, tri, strength = 0.6) {
  const cx = (tri[0].x + tri[1].x + tri[2].x) / 3;
  const cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
  let dx = p.x - cx;
  let dy = p.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  // empurra para fora + cancela velocidade para dentro
  p.x += dx * 4 * strength;
  p.y += dy * 4 * strength;
  const vx = p.x - p.ox;
  const vy = p.y - p.oy;
  const into = vx * -dx + vy * -dy;
  if (into > 0) {
    p.ox = p.x - (vx - dx * into * 1.1);
    p.oy = p.y - (vy - dy * into * 1.1);
  }
}

/**
 * @param {object[]} points - pontos do ragdoll
 * @param {object[]} obstacles - hitboxes { points: [3], tip, side }
 */
export function collidePointsWithSpikes(points, obstacles) {
  if (!obstacles?.length) return;
  for (const p of points) {
    if (p.pinned) continue;
    for (const hb of obstacles) {
      if (!hb?.points || hb.points.length < 3) continue;
      if (pointInTriangle(p, hb.points)) {
        pushOutOfTriangle(p, hb.points, 0.75);
      }
    }
  }
}

/**
 * Detecta (sem mudar nada) se alguma parte "âncora" do ragdoll (peito,
 * cabeça, pés) tocou a PONTA de um espeto novo — ou seja, deveria
 * empalar de novo. Só checa essas partes (não mãos/joelhos), senão o
 * corpo fica grudando em qualquer contato de raspão.
 * @param {{chest:object, head:object, lFoot:object, rFoot:object}} parts
 * @param {object[]} obstacles
 * @param {number} tipRadius - distância da ponta que ainda conta como "pegou na ponta"
 */
export function findReimpaleCandidate(parts, obstacles, tipRadius = 22) {
  if (!obstacles?.length) return null;
  const anchors = [
    ["chest", parts.chest],
    ["head", parts.head],
    ["lFoot", parts.lFoot],
    ["rFoot", parts.rFoot],
  ];
  for (const [partKey, p] of anchors) {
    if (!p || p.pinned) continue;
    for (const hb of obstacles) {
      if (!hb?.points || hb.points.length < 3 || !hb.tip) continue;
      if (!pointInTriangle(p, hb.points)) continue;
      const distTip = Math.hypot(p.x - hb.tip.x, p.y - hb.tip.y);
      if (distTip < tipRadius) {
        return { partKey, part: p, hb };
      }
    }
  }
  return null;
}

