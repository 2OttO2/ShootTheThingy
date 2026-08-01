import { DeathType } from "./types.js";
import { setPinned, impulse, zeroVel } from "../physics/verlet.js";
import { layoutLimbs } from "../physics/bodyFactory.js";

export function applyDeathBehavior(body, event) {
  const parts = body.parts;
  const sev = body.severed;
  const tipX = event.tip?.x ?? event.playerX + 24;
  const tipY = event.tip?.y ?? event.playerY + 40;
  const sideSpin = (event.offsetX ?? 0) >= 0 ? 1 : -1;
  const imp = Math.max(0.85, Math.min(1.7, event.impact ?? 1));
  const fall = Math.max(
    0.7,
    Math.min(2.8, Math.abs(event.velocityY ?? 0) * 0.1 + 0.9)
  );
  const spikeSide = event.side || "bottom";
  let hangTimer = 0;

  const { head, chest, hip, lHand, rHand, lKnee, rKnee, lFoot, rFoot } = parts;

  switch (event.type) {
    case DeathType.HANG: {
      setPinned(head, tipX, tipY);
      chest.x = tipX + sideSpin * 3;
      chest.y = tipY + 18;
      hip.x = tipX + sideSpin * 6;
      hip.y = tipY + 38;
      zeroVel(chest);
      zeroVel(hip);
      layoutLimbs(parts, sev, sideSpin);
      impulse(chest, sideSpin * 0.9 * imp, 0.2);
      impulse(hip, sideSpin * 1.4 * imp, 0.8);
      if (!sev.legLeft) {
        impulse(lKnee, -sideSpin * 1.0, 1.0);
        impulse(lFoot, -sideSpin * 1.6 * imp, 1.5);
      }
      if (!sev.legRight) {
        impulse(rKnee, sideSpin * 1.0, 1.0);
        impulse(rFoot, sideSpin * 1.6 * imp, 1.5);
      }
      if (!sev.armLeft) impulse(lHand, -1.4 * imp, 0.8);
      if (!sev.armRight) impulse(rHand, 1.4 * imp, 0.8);
      hangTimer = 1.1;
      break;
    }
    case DeathType.IMPALE: {
      const cy = spikeSide === "bottom" ? tipY + 14 : Math.max(28, tipY - 14);
      setPinned(chest, tipX, cy);
      head.x = tipX - sideSpin * 2;
      head.y = cy - 18;
      hip.x = tipX + sideSpin * 3;
      hip.y = cy + 20;
      zeroVel(head);
      zeroVel(hip);
      layoutLimbs(parts, sev, sideSpin);
      if (!sev.legLeft) {
        impulse(lKnee, -1.6 * imp, 1.0);
        impulse(lFoot, -2.2 * imp, 1.4);
      }
      if (!sev.legRight) {
        impulse(rKnee, 1.6 * imp, 1.0);
        impulse(rFoot, 2.2 * imp, 1.4);
      }
      if (!sev.armLeft) impulse(lHand, -1.8 * imp, 0.7);
      if (!sev.armRight) impulse(rHand, 1.8 * imp, 0.7);
      impulse(head, -sideSpin * 1.0 * imp, -0.3);
      break;
    }
    case DeathType.IMPALE_LEG: {
      layoutLimbs(parts, sev, sideSpin);
      const pin = !sev.legLeft ? lFoot : !sev.legRight ? rFoot : hip;
      setPinned(pin, tipX, tipY + (spikeSide === "bottom" ? 4 : 0));
      impulse(head, sideSpin * 1.8 * imp, 1.2);
      impulse(chest, sideSpin * 1.4 * imp, 1.4);
      impulse(hip, sideSpin * 0.6 * imp, 0.5);
      if (!sev.armLeft) impulse(lHand, -1.5 * imp, 1.4);
      if (!sev.armRight) impulse(rHand, 1.5 * imp, 1.4);
      break;
    }
    case DeathType.BOUNCE: {
      layoutLimbs(parts, sev, sideSpin);
      const away = spikeSide === "top" ? 1 : -1;
      impulse(head, sideSpin * 1.2 * imp, away * 2.0 * imp + fall * 0.25);
      impulse(chest, sideSpin * 0.9 * imp, away * 2.3 * imp);
      impulse(hip, sideSpin * 0.7 * imp, away * 1.7 * imp);
      if (!sev.legLeft) impulse(lFoot, -sideSpin * 1.5, away * 1.2);
      if (!sev.legRight) impulse(rFoot, sideSpin * 1.5, away * 1.2);
      break;
    }
    case DeathType.SPIN: {
      layoutLimbs(parts, sev, sideSpin);
      const spin = sideSpin * 2.4 * imp;
      impulse(head, spin, fall * 0.8);
      impulse(chest, spin * 0.45, fall);
      impulse(hip, -spin * 0.35, fall * 1.05);
      if (!sev.legLeft) impulse(lFoot, -spin * 0.9, fall * 0.7);
      if (!sev.legRight) impulse(rFoot, spin * 0.9, fall * 0.7);
      break;
    }
    case DeathType.FLOP: {
      layoutLimbs(parts, sev, sideSpin);
      impulse(head, sideSpin * 0.6, fall);
      impulse(chest, sideSpin * 0.15, fall * 0.9);
      impulse(hip, -sideSpin * 0.45, fall);
      if (!sev.legLeft) {
        impulse(lKnee, 1.1 * imp, -0.3);
        impulse(lFoot, 1.6 * imp, -0.8);
      }
      if (!sev.legRight) {
        impulse(rKnee, -1.2 * imp, -0.4);
        impulse(rFoot, -1.7 * imp, -0.9);
      }
      if (!sev.armLeft) impulse(lHand, -1.5 * imp, 1.1);
      if (!sev.armRight) impulse(rHand, 1.6 * imp, 1.0);
      break;
    }
    case DeathType.STALL:
    default: {
      layoutLimbs(parts, sev, 1);
      impulse(head, 0, 0.7);
      impulse(chest, 0, 0.9);
      impulse(hip, 0, 1.1);
      if (!sev.legLeft) impulse(lFoot, 1.0, -0.4);
      if (!sev.legRight) impulse(rFoot, -1.1, -0.5);
      break;
    }
  }

  return {
    hangTimer,
    sideSpin,
    spikeTipX: tipX,
    spikeTipY: tipY,
    spikeSide,
  };
}

export function floorKick(body, sideSpin = 1) {
  const { severed, parts } = body;
  const s = sideSpin || 1;
  for (const p of body.points) {
    if (p.pinned) p.pinned = false;
  }
  if (!severed.legLeft && parts.lFoot) {
    impulse(parts.lFoot, 2.2 * s, 1.3);
    if (parts.lKnee) impulse(parts.lKnee, 1.1 * s, 0.6);
  }
  if (!severed.legRight && parts.rFoot) {
    impulse(parts.rFoot, -2.4 * s, 1.4);
    if (parts.rKnee) impulse(parts.rKnee, -1.2 * s, 0.7);
  }
  impulse(parts.hip, 0.3 * s, 1.0);
  impulse(parts.chest, 0.2 * s, 0.55);
  impulse(parts.head, 0.1 * s, 0.35);
  if (!severed.armLeft && parts.lHand) impulse(parts.lHand, -1.2 * s, 0.8);
  if (!severed.armRight && parts.rHand) impulse(parts.rHand, 1.2 * s, 0.8);
}

