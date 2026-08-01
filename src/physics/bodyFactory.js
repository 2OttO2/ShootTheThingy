/**
 * Cria esqueleto humanoide em pose em pé e helpers de layout.
 */
import { point, stick, zeroVel } from "./verlet.js";

export function createStandingBody(x, y, severed = {}) {
  const sev = {
    legLeft: !!severed.legLeft,
    legRight: !!severed.legRight,
    armLeft: !!severed.armLeft,
    armRight: !!severed.armRight,
  };

  const cx = x + 24;
  const top = y;

  const head = point(cx, top + 10);
  const chest = point(cx, top + 28);
  const hip = point(cx, top + 48);
  const lShoulder = point(cx - 11, top + 26);
  const rShoulder = point(cx + 11, top + 26);
  const lHand = point(cx - 16, top + 44);
  const rHand = point(cx + 16, top + 44);
  const lKnee = point(cx - 7, top + 60);
  const rKnee = point(cx + 7, top + 60);
  const lFoot = point(cx - 9, top + 74);
  const rFoot = point(cx + 9, top + 74);

  const parts = {
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
  };

  const points = [head, chest, hip, lShoulder, rShoulder];
  if (!sev.armLeft) points.push(lHand);
  if (!sev.armRight) points.push(rHand);
  if (!sev.legLeft) points.push(lKnee, lFoot);
  if (!sev.legRight) points.push(rKnee, rFoot);

  const sticks = [
    stick(head, chest, 17, 1),
    stick(chest, hip, 20, 1),
    stick(chest, lShoulder, 11, 0.95),
    stick(chest, rShoulder, 11, 0.95),
    stick(lShoulder, rShoulder, 22, 0.5),
  ];
  if (!sev.armLeft) sticks.push(stick(lShoulder, lHand, 18, 0.8));
  if (!sev.armRight) sticks.push(stick(rShoulder, rHand, 18, 0.8));
  if (!sev.legLeft) {
    sticks.push(stick(hip, lKnee, 14, 0.88));
    sticks.push(stick(lKnee, lFoot, 14, 0.88));
  }
  if (!sev.legRight) {
    sticks.push(stick(hip, rKnee, 14, 0.88));
    sticks.push(stick(rKnee, rFoot, 14, 0.88));
  }
  if (!sev.legLeft && !sev.legRight) {
    sticks.push(stick(lKnee, rKnee, 16, 0.25));
  }

  return { parts, points, sticks, severed: sev };
}

/** Reposiciona membros em pose natural relativa a chest/hip */
export function layoutLimbs(parts, sev, side = 1) {
  const { chest, hip, lShoulder, rShoulder, lHand, rHand, lKnee, rKnee, lFoot, rFoot } =
    parts;

  lShoulder.x = chest.x - 11;
  lShoulder.y = chest.y + 1;
  rShoulder.x = chest.x + 11;
  rShoulder.y = chest.y + 1;
  zeroVel(lShoulder);
  zeroVel(rShoulder);

  if (!sev.armLeft) {
    lHand.x = lShoulder.x - 6 * side;
    lHand.y = lShoulder.y + 16;
    zeroVel(lHand);
  }
  if (!sev.armRight) {
    rHand.x = rShoulder.x + 6 * side;
    rHand.y = rShoulder.y + 16;
    zeroVel(rHand);
  }
  if (!sev.legLeft) {
    lKnee.x = hip.x - 7;
    lKnee.y = hip.y + 12;
    lFoot.x = hip.x - 9;
    lFoot.y = hip.y + 24;
    zeroVel(lKnee);
    zeroVel(lFoot);
  }
  if (!sev.legRight) {
    rKnee.x = hip.x + 7;
    rKnee.y = hip.y + 12;
    rFoot.x = hip.x + 9;
    rFoot.y = hip.y + 24;
    zeroVel(rKnee);
    zeroVel(rFoot);
  }
}
