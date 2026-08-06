import { DeathType } from "./types.js";
import { setPinned, impulse, zeroVel } from "../physics/verlet.js";
import { layoutLimbs } from "../physics/bodyFactory.js";

export function applyDeathBehavior(body, event) {
  const parts = body.parts;
  const sev = body.severed;
  const tipX = event.tip?.x ?? event.playerX + 24;
  const tipY = event.tip?.y ?? event.playerY + 40;
  const sideSpin = (event.offsetX ?? 0) >= 0 ? 1 : -1;
  // intensidade do impacto: combina a força já calculada (velocidade
  // vertical na hora da colisão) com a velocidade do jogo (hSpeed) —
  // quanto mais rápido o jogo tá indo, mais violenta a reação.
  const hFactor = 1 + Math.min(0.6, (event.hSpeed ?? 0) / 12);
  const imp = Math.max(0.85, Math.min(2.4, (event.impact ?? 1) * hFactor));
  // fator vertical — antes só o X escalava com o impacto, agora o Y
  // também, pra reação inteira (não só horizontal) responder à força
  const fall = Math.max(
    0.7,
    Math.min(2.8, Math.abs(event.velocityY ?? 0) * 0.1 + 0.9) * hFactor
  );
  // sinal da queda: caindo rápido (vy>0) vs quase parado/subindo — usado
  // pra decidir se o corpo "alavanca" com força ou só tomba devagar
  const fallSign = (event.velocityY ?? 0) >= 0 ? 1 : -1;
  const spikeSide = event.side || "bottom";
  let pinnedPartKey = null; // qual parte ficou presa no espeto (se alguma)

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
      impulse(chest, sideSpin * 0.9 * imp, 0.2 * fall);
      impulse(hip, sideSpin * 1.4 * imp, 0.8 * fall);
      if (!sev.legLeft) {
        impulse(lKnee, -sideSpin * 1.0 * fall, 1.0 * fall);
        impulse(lFoot, -sideSpin * 1.6 * imp, 1.5 * fall);
      }
      if (!sev.legRight) {
        impulse(rKnee, sideSpin * 1.0 * fall, 1.0 * fall);
        impulse(rFoot, sideSpin * 1.6 * imp, 1.5 * fall);
      }
      if (!sev.armLeft) impulse(lHand, -1.4 * imp, 0.8 * fall);
      if (!sev.armRight) impulse(rHand, 1.4 * imp, 0.8 * fall);
      pinnedPartKey = "head";
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
        impulse(lKnee, -1.6 * imp, 1.0 * fall);
        impulse(lFoot, -2.2 * imp, 1.4 * fall);
      }
      if (!sev.legRight) {
        impulse(rKnee, 1.6 * imp, 1.0 * fall);
        impulse(rFoot, 2.2 * imp, 1.4 * fall);
      }
      if (!sev.armLeft) impulse(lHand, -1.8 * imp, 0.7 * fall);
      if (!sev.armRight) impulse(rHand, 1.8 * imp, 0.7 * fall);
      impulse(head, -sideSpin * 1.0 * imp, -0.3 * fall);
      pinnedPartKey = "chest";
      break;
    }
    case DeathType.IMPALE_LEG: {
      layoutLimbs(parts, sev, sideSpin);
      const pinLeft = !sev.legLeft;
      const pinKey = pinLeft ? "lFoot" : !sev.legRight ? "rFoot" : "hip";
      const pin = pinLeft ? lFoot : !sev.legRight ? rFoot : hip;
      setPinned(pin, tipX, tipY + (spikeSide === "bottom" ? 4 : 0));
      // ALAVANCAGEM: o corpo pivota em torno do pé preso. Quanto mais
      // rápido caindo (fallSign/fall), mais forte o giro; a direção do
      // giro depende de que lado do espeto o pé bateu (sideSpin).
      const lever = sideSpin * fallSign * fall;
      impulse(head, lever * 1.8 * imp, 1.2 * fall);
      impulse(chest, lever * 1.4 * imp, 1.4 * fall);
      impulse(hip, lever * 0.6 * imp, 0.5 * fall);
      if (!sev.armLeft) impulse(lHand, -lever * 1.2 * imp, 1.4 * fall);
      if (!sev.armRight) impulse(rHand, lever * 1.2 * imp, 1.4 * fall);
      pinnedPartKey = pinKey;
      break;
    }
    case DeathType.BOUNCE: {
      layoutLimbs(parts, sev, sideSpin);
      const away = spikeSide === "top" ? 1 : -1;
      impulse(head, sideSpin * 1.2 * imp, away * 2.0 * imp + fall * 0.25);
      impulse(chest, sideSpin * 0.9 * imp, away * 2.3 * imp);
      impulse(hip, sideSpin * 0.7 * imp, away * 1.7 * imp);
      if (!sev.legLeft) impulse(lFoot, -sideSpin * 1.5 * imp, away * 1.2 * fall);
      if (!sev.legRight) impulse(rFoot, sideSpin * 1.5 * imp, away * 1.2 * fall);
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
      impulse(head, sideSpin * 0.6 * imp, fall);
      impulse(chest, sideSpin * 0.15 * imp, fall * 0.9);
      impulse(hip, -sideSpin * 0.45 * imp, fall);
      if (!sev.legLeft) {
        impulse(lKnee, 1.1 * imp, -0.3 * fall);
        impulse(lFoot, 1.6 * imp, -0.8 * fall);
      }
      if (!sev.legRight) {
        impulse(rKnee, -1.2 * imp, -0.4 * fall);
        impulse(rFoot, -1.7 * imp, -0.9 * fall);
      }
      if (!sev.armLeft) impulse(lHand, -1.5 * imp, 1.1 * fall);
      if (!sev.armRight) impulse(rHand, 1.6 * imp, 1.0 * fall);
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
    pinnedPartKey,
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

