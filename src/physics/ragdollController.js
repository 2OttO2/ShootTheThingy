/**
 * Controlador de ragdoll na morte.
 * Mantém a API createRagdoll / stepRagdoll / ragdollSnapshot que o Player já usa.
 */
import { DeathType } from "../death/types.js";
import { applyDeathBehavior, floorKick } from "../death/behaviors.js";
import { createStandingBody } from "./bodyFactory.js";
import {
  setPinned,
  unpin,
  impulse,
  clampV,
  stepBody,
  angleBetween,
  dist,
} from "./verlet.js";

const DEATH_SCROLL = 1.6;

/**
 * Compatível com a API antiga do Player.
 * opts.deathType ou opts.event (DeathEvent completo)
 */
export function createRagdoll(x, y, opts = {}) {
  const floorY =
    opts.floorY ??
    (typeof window !== "undefined" ? window.innerHeight - 10 : 600);
  const ceilingY = opts.ceilingY ?? 5;

  const event = opts.event ?? {
    type: opts.deathType ?? DeathType.STALL,
    side: opts.spikeSide ?? "bottom",
    tip: {
      x: opts.spikeTipX ?? x + 24,
      y: opts.spikeTipY ?? y + 40,
    },
    offsetX: opts.offsetX ?? 0,
    impact: opts.impact ?? 1,
    velocityY: opts.velocityY ?? 0,
    playerX: x,
    playerY: y,
    severed: opts.severed ?? {},
  };

  const body = createStandingBody(x, y, event.severed || opts.severed || {});
  body.floorY = floorY;
  body.ceilingY = ceilingY;

  const meta = applyDeathBehavior(body, event);
  for (const p of body.points) clampV(p);

  return {
    ...body,
    alive: true,
    deathType: event.type,
    spikeSide: meta.spikeSide,
    hangTimer: meta.hangTimer,
    hangReleased: false,
    floorKicked: false,
    spikeTipX: meta.spikeTipX,
    spikeTipY: meta.spikeTipY,
    sideSpin: meta.sideSpin,
  };
}

export function stepRagdoll(ragdoll, dtNorm = 1) {
  if (!ragdoll || !ragdoll.alive) return;

  const scroll = DEATH_SCROLL * dtNorm;
  const dtSec = dtNorm * (16.67 / 1000);

  // hang: mantém pin, depois solta (sem auto-impale)
  if (ragdoll.deathType === DeathType.HANG) {
    if (!ragdoll.hangReleased) {
      ragdoll.hangTimer -= dtSec;
      ragdoll.spikeTipX -= scroll;
      setPinned(ragdoll.parts.head, ragdoll.spikeTipX, ragdoll.spikeTipY);
      if (ragdoll.hangTimer <= 0) {
        ragdoll.hangReleased = true;
        unpin(ragdoll.parts.head);
        impulse(ragdoll.parts.head, 0, 1.6);
        impulse(ragdoll.parts.chest, 0, 2);
        impulse(ragdoll.parts.hip, 0, 2.3);
      }
    }
  }

  if (ragdoll.deathType === DeathType.IMPALE) {
    ragdoll.spikeTipX -= scroll;
    const c = ragdoll.parts.chest;
    const hip = ragdoll.parts.hip;
    let targetY = c.y;
    if (ragdoll.spikeSide === "bottom") {
      targetY = Math.min(c.y + 0.12 * dtNorm, ragdoll.spikeTipY + 36);
    } else {
      targetY = Math.min(
        c.y + 0.07 * dtNorm,
        Math.max(22, ragdoll.spikeTipY - 4)
      );
    }
    setPinned(c, ragdoll.spikeTipX, targetY);
    hip.x = ragdoll.spikeTipX;
    hip.y = c.y + 18;
    hip.ox = hip.x;
    hip.oy = hip.y;
  }

  if (ragdoll.deathType === DeathType.IMPALE_LEG) {
    ragdoll.spikeTipX -= scroll;
    for (const p of ragdoll.points) {
      if (p.pinned) {
        p.x = ragdoll.spikeTipX;
        p.ox = p.x;
      }
    }
  }

  stepBody(ragdoll, dtNorm, { scroll });

  if (
    !ragdoll.floorKicked &&
    ragdoll.deathType !== DeathType.IMPALE &&
    ragdoll.deathType !== DeathType.IMPALE_LEG &&
    ragdoll.parts.hip.y >= ragdoll.floorY - 10
  ) {
    ragdoll.floorKicked = true;
    floorKick(ragdoll, ragdoll.sideSpin);
  }

  if (ragdoll.parts.chest.x < -100) {
    ragdoll.alive = false;
  }
}

export function ragdollSnapshot(ragdoll) {
  if (!ragdoll) return null;
  const { parts, severed } = ragdoll;
  return {
    head: { x: parts.head.x, y: parts.head.y },
    chest: { x: parts.chest.x, y: parts.chest.y },
    hip: { x: parts.hip.x, y: parts.hip.y },
    lShoulder: { x: parts.lShoulder.x, y: parts.lShoulder.y },
    rShoulder: { x: parts.rShoulder.x, y: parts.rShoulder.y },
    lHand: { x: parts.lHand.x, y: parts.lHand.y },
    rHand: { x: parts.rHand.x, y: parts.rHand.y },
    lKnee: { x: parts.lKnee.x, y: parts.lKnee.y },
    rKnee: { x: parts.rKnee.x, y: parts.rKnee.y },
    lFoot: { x: parts.lFoot.x, y: parts.lFoot.y },
    rFoot: { x: parts.rFoot.x, y: parts.rFoot.y },
    severed: { ...severed },
    deathType: ragdoll.deathType,
  };
}

export { angleBetween, dist };
