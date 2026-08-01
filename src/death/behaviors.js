/**
 * DeathEvent → pose inicial + impulsos.
 */
import { DeathType } from "./types.js";
import { setPinned, impulse, zeroVel } from "../physics/verlet.js";
import { layoutLimbs } from "../physics/bodyFactory.js";

export function applyDeathBehavior(body, event) {
  const parts = body.parts;
  const sev = body.severed;
  const tipX = event.tip?.x ?? event.playerX + 24;
  const tipY = event.tip?.y ?? event.playerY + 40;
  const sideSpin = (event.offsetX ?? 0) >= 0 ? 1 : -1;
  const imp = Math.max(0.8, Math.min(1.8, event.impact ?? 1));
  const fall = Math.max(0.6, Math.min(2.5, Math.abs(event.velocityY ?? 0) * 0.08 + 0.8));
  const spikeSide = event.side || "bottom";
  let hangTimer = 0;

  const { head, chest, hip, lHand, rHand, lFoot, rFoot } = parts;

  switch (event.type) {
    case DeathType.HANG: {
      // corpo esticado verticalmente sob a ponta
      setPinned(head, tipX, tipY);
      chest.x = tipX;
      chest.y = tipY + 18;
      hip.x = tipX;
      hip.y = tipY + 38;
      zeroVel(chest);
      zeroVel(hip);
      layoutLimbs(parts, sev, sideSpin);
      // pernas balançam um pouco
      if (!sev.legLeft) impulse(lFoot, -1.2 * sideSpin, 0.8);
      if (!sev.legRight) impulse(rFoot, 1.2 * sideSpin, 0.8);
      if (!sev.armLeft) impulse(lHand, -0.8, 0.4);
      if (!sev.armRight) impulse(rHand, 0.8, 0.4);
      hangTimer = 1.0;
      break;
    }
    case DeathType.IMPALE: {
      const cy = spikeSide === "bottom" ? tipY + 14 : Math.max(28, tipY - 14);
      setPinned(chest, tipX, cy);
      head.x = tipX;
      head.y = cy - 18;
      hip.x = tipX;
      hip.y = cy + 20;
      zeroVel(head);
      zeroVel(hip);
      layoutLimbs(parts, sev, sideSpin);
      if (!sev.legLeft) impulse(lFoot, -1.5 * imp, 0.8);
      if (!sev.legRight) impulse(rFoot, 1.5 * imp, 0.8);
      if (!sev.armLeft) impulse(lHand, -1.2 * imp, 0.5);
      if (!sev.armRight) impulse(rHand, 1.2 * imp, 0.5);
      break;
    }
    case DeathType.IMPALE_LEG: {
      layoutLimbs(parts, sev, sideSpin);
      const pin = !sev.legLeft ? lFoot : !sev.legRight ? rFoot : hip;
      setPinned(pin, tipX, tipY + (spikeSide === "bottom" ? 4 : 0));
      impulse(head, sideSpin * 1.5 * imp, 1.0);
      impulse(chest, sideSpin * 1.2 * imp, 1.2);
      impulse(hip, sideSpin * 0.6 * imp, 0.5);
      break;
    }
    case DeathType.BOUNCE: {
      layoutLimbs(parts, sev, sideSpin);
      const away = spikeSide === "top" ? 1 : -1;
      impulse(head, sideSpin * 1.0 * imp, away * 1.8 * imp + fall * 0.2);
      impulse(chest, sideSpin * 0.8 * imp, away * 2.0 * imp);
      impulse(hip, sideSpin * 0.5 * imp, away * 1.5 * imp);
      break;
    }
    case DeathType.SPIN: {
      layoutLimbs(parts, sev, sideSpin);
      const spin = sideSpin * 2.0 * imp;
      impulse(head, spin, fall);
      impulse(chest, spin * 0.4, fall);
      impulse(hip, -spin * 0.3, fall);
      break;
    }
    case DeathType.FLOP: {
      layoutLimbs(parts, sev, sideSpin);
      impulse(head, sideSpin * 0.4, fall);
      impulse(chest, 0, fall * 0.9);
      impulse(hip, -sideSpin * 0.3, fall);
      if (!sev.legLeft) impulse(lFoot, 1.2 * imp, -0.5);
      if (!sev.legRight) impulse(rFoot, -1.3 * imp, -0.6);
      break;
    }
    case DeathType.STALL:
    default: {
      layoutLimbs(parts, sev, 1);
      impulse(head, 0, 0.6);
      impulse(chest, 0, 0.8);
      impulse(hip, 0, 1.0);
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
    impulse(parts.lFoot, 1.8 * s, 1.0);
  }
  if (!severed.legRight && parts.rFoot) {
    impulse(parts.rFoot, -2.0 * s, 1.1);
  }
  impulse(parts.hip, 0.25 * s, 0.7);
  impulse(parts.chest, 0.15 * s, 0.4);
}

