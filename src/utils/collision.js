/**
 * Colisão jogador (AABB) × spike (triângulo).
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

function samplePlayerPoints(player) {
  const { x, y, width: w, height: h } = player;
  const pts = [];
  for (let iy = 0; iy <= 3; iy++) {
    for (let ix = 0; ix <= 2; ix++) {
      pts.push({ x: x + (w * ix) / 2, y: y + (h * iy) / 3 });
    }
  }
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

export function isPlayerCollidingWithSpike(player, spike) {
  if (!player || !spike?.points || spike.points.length < 3) return false;
  const tri = spike.points;
  if (samplePlayerPoints(player).some((p) => pointInTriangle(p, tri))) return true;
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
  const cx = player.x + player.width * 0.5;
  const cy =
    hb.side === "top"
      ? player.y + player.height * 0.2
      : player.y + player.height * 0.65;

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
    const midY = (tip.y + by) / 2;
    if (cy <= midY + 8 || distTip < distBase) return "tip";
    return "base";
  }
  if (distTip < 42 || distTip < distBase * 0.9) return "tip";
  return "base";
}

/** Parte do corpo mais próxima da ponta: head | torso | legs */
function contactBodyPart(player, hb) {
  if (!hb?.tip) return "torso";
  const tip = hb.tip;
  const headY = player.y + player.height * 0.15;
  const torsoY = player.y + player.height * 0.45;
  const legsY = player.y + player.height * 0.8;
  const dHead = Math.abs(tip.y - headY);
  const dTorso = Math.abs(tip.y - torsoY);
  const dLegs = Math.abs(tip.y - legsY);
  if (dHead <= dTorso && dHead <= dLegs) return "head";
  if (dLegs <= dTorso) return "legs";
  return "torso";
}

export function findSpikeCollision(player, hitboxes) {
  for (let i = 0; i < hitboxes.length; i++) {
    const hb = hitboxes[i];
    if (isPlayerCollidingWithSpike(player, hb)) {
      const tip = hb.tip ?? null;
      const cx = player.x + player.width * 0.5;
      const offsetX = tip ? cx - tip.x : 0;
      return {
        side: hb.side ?? "unknown",
        index: hb.index ?? i,
        hitbox: hb,
        tip,
        region: contactRegion(player, hb),
        bodyPart: contactBodyPart(player, hb),
        offsetX, // <0 bateu lado esquerdo da ponta
      };
    }
  }
  return null;
}
