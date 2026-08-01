/**
 * DeathEvent → configuração de física (pins, impulsos, timers).
 * Não importa React. Não integra Verlet — só descreve a pose inicial.
 */
import { DeathType } from "./types.js";
import { setPinned, impulse, zeroVel } from "../physics/verlet.js";
import { layoutLimbs } from "../physics/bodyFactory.js";

/**
 * Aplica pose + impulsos iniciais no body a partir do DeathEvent.
 * @returns {{ hangTimer: number, sideSpin: number, spikeTipX: number, spikeTipY: number, spikeSide: string }}
 */
export function applyDeathBehavior(body, event) {
  const parts = body.parts;
  const sev = body.severed;
  const tipX = event.tip?.x ?? event.playerX + 24;
  const tipY = event.tip?.y ?? event.playerY + 40;
  const sideSpin = (event.offsetX ?? 0) >= 0 ? 1 : -1;
  const imp = Math.max(0.7, Math.min(2, event.impact ?? 1));
  const fall = Math.max(
    0.5,
    Math.min(3, Math.abs(event.velocityY ?? 0) * 0.1 + 0.9)
  );
  const spikeSide = event.side || "bottom";
  let hangTimer = 0;

  const { head, chest, hip, lHand, rHand, lFoot, rFoot } = parts;

  switch (event.type) {
    case DeathType.HANG: {
      setPinned(head, tipX, tipY);
      chest.x = tipX + sideSpin * 2;
      chest.y = tipY + 17;
      hip.x = tipX + sideSpin * 3;
      hip.y = tipY + 37;
      zeroVel(chest);
      zeroVel(hip);
      layoutLimbs(parts, sev, sideSpin);
      impulse(hip, sideSpin * 0.4 * imp, 1.2);
      if (!sev.legLeft) impulse(lFoot, -sideSpin * 1.2 * imp, 1.5);
      if (!sev.legRight) impulse(rFoot, sideSpin * 1.2 * imp, 1.5);
      hangTimer = 0.85;
      break;
    }
    case DeathType.IMPALE: {
      const cy = spikeSide === "bottom" ? tipY + 16 : Math.max(24, tipY - 16);
      setPinned(chest, tipX, cy);
      head.x = tipX;
      head.y = cy - 17;
      hip.x = tipX;
      hip.y = cy + 20;
      zeroVel(head);
      zeroVel(hip);
      layoutLimbs(parts, sev, sideSpin);
      if (!sev.legLeft) impulse(lFoot, -2 * imp, 1.2 * imp);
      if (!sev.legRight) impulse(rFoot, 2 * imp, 1.2 * imp);
      if (!sev.armLeft) impulse(lHand, -1.5 * imp, 0.6);
      if (!sev.armRight) impulse(rHand, 1.5 * imp, 0.6);
      break;
    }
    case DeathType.IMPALE_LEG: {
      layoutLimbs(parts, sev, sideSpin);
      const pin = !sev.legLeft ? lFoot : !sev.legRight ? rFoot : hip;
      setPinned(pin, tipX, tipY + (spikeSide === "bottom" ? 6 : 0));
      impulse(head, sideSpin * 2 * imp, 1.2);
      impulse(chest, sideSpin * 1.6 * imp, 1.6);
      impulse(hip, sideSpin * 1 * imp, 0.8);
      break;
    }
    case DeathType.SPIN: {
      layoutLimbs(parts, sev, sideSpin);
      const spin = sideSpin * 2.4 * imp;
      impulse(head, spin, fall);
      impulse(chest, spin * 0.45, fall);
      impulse(hip, -spin * 0.3, fall);
      if (!sev.legLeft) impulse(lFoot, -spin * 0.8, fall * 0.7);
      if (!sev.legRight) impulse(rFoot, spin * 0.8, fall * 0.7);
      break;
    }
    case DeathType.BOUNCE: {
      layoutLimbs(parts, sev, sideSpin);
      const away = spikeSide === "top" ? 1 : -1;
      impulse(head, sideSpin * 1.4 * imp, away * 2 * imp + fall * 0.25);
      impulse(chest, sideSpin * 1.1 * imp, away * 2.4 * imp);
      impulse(hip, sideSpin * 0.8 * imp, away * 1.8 * imp);
      break;
    }
    case DeathType.FLOP: {
      layoutLimbs(parts, sev, sideSpin);
      impulse(head, sideSpin * 0.6, fall);
      impulse(chest, 0, fall * 0.85);
      impulse(hip, -sideSpin * 0.4, fall);
      if (!sev.legLeft) impulse(lFoot, 1.6 * imp, -0.8);
      if (!sev.legRight) impulse(rFoot, -1.8 * imp, -0.9);
      break;
    }
    case DeathType.STALL:
    default: {
      layoutLimbs(parts, sev, 1);
      for (const p of body.points) {
        impulse(p, (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.4);
      }
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

/** Kick leve ao tocar o chão */
export function floorKick(body, sideSpin = 1) {
  const { severed, parts } = body;
  const s = sideSpin || 1;
  for (const p of body.points) {
    if (p.pinned) p.pinned = false;
  }
  if (!severed.legLeft && parts.lFoot) {
    impulse(parts.lFoot, 2.2 * s, 1.4);
  }
  if (!severed.legRight && parts.rFoot) {
    impulse(parts.rFoot, -2.4 * s, 1.5);
  }
  impulse(parts.hip, 0.35 * s, 0.9);
  impulse(parts.chest, 0.2 * s, 0.5);
}
