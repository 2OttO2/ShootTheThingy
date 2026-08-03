/**
 * Controlador de ragdoll + colisão com spikes.
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
import { collidePointsWithSpikes } from "./worldCollision.js";

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
    // hitboxes congeladas no momento da morte
    obstacles: opts.obstacles ?? [],
  };
}

export function stepRagdoll(ragdoll, dtNorm = 1) {
  if (!ragdoll || !ragdoll.alive) return;

  const dtSec = dtNorm * (16.67 / 1000);

  if (ragdoll.deathType === DeathType.HANG) {
    if (!ragdoll.hangReleased) {
      ragdoll.hangTimer -= dtSec;
      setPinned(ragdoll.parts.head, ragdoll.spikeTipX, ragdoll.spikeTipY);
      if (ragdoll.hangTimer <= 0) {
        ragdoll.hangReleased = true;
        unpin(ragdoll.parts.head);
        const s = ragdoll.sideSpin || 1;
        impulse(ragdoll.parts.head, s * 0.5, 1.6);
        impulse(ragdoll.parts.chest, s * 0.8, 2.2);
        impulse(ragdoll.parts.hip, s * 1.2, 2.8);
        if (!ragdoll.severed.armLeft) impulse(ragdoll.parts.lHand, -2, 1.5);
        if (!ragdoll.severed.armRight) impulse(ragdoll.parts.rHand, 2, 1.5);
      }
    }
  }

  if (ragdoll.deathType === DeathType.IMPALE) {
    const c = ragdoll.parts.chest;
    const hip = ragdoll.parts.hip;
    let targetY = c.y;
    if (ragdoll.spikeSide === "bottom") {
      targetY = Math.min(c.y + 0.1 * dtNorm, ragdoll.spikeTipY + 34);
    } else {
      targetY = Math.min(
        c.y + 0.06 * dtNorm,
        Math.max(24, ragdoll.spikeTipY - 4)
      );
    }
    setPinned(c, ragdoll.spikeTipX, targetY);
    hip.x = ragdoll.spikeTipX;
    hip.y = c.y + 18;
    hip.ox = hip.x;
    hip.oy = hip.y;
  }

  if (ragdoll.deathType === DeathType.IMPALE_LEG) {
    for (const p of ragdoll.points) {
      if (p.pinned) {
        p.x = ragdoll.spikeTipX;
        p.ox = p.x;
      }
    }
  }

  // bounce um pouco mais elástico que o padrão do verlet (0.55), pra ficar
  // mais parecido com o BOUNCE=0.8 usado na física de quando o Player
  // está vivo (constants/game.js) — só nesta chamada, não mexe no DEFAULTS
  // global usado por outras coisas.
  stepBody(ragdoll, dtNorm, { scroll: 0, bounce: 0.7 });

  // colisão real com spikes (corpo quica / é empurrado pra fora)
  if (ragdoll.obstacles?.length) {
    collidePointsWithSpikes(ragdoll.points, ragdoll.obstacles);
  }

  if (
    !ragdoll.floorKicked &&
    ragdoll.deathType !== DeathType.IMPALE &&
    ragdoll.deathType !== DeathType.IMPALE_LEG &&
    ragdoll.parts.hip.y >= ragdoll.floorY - 10
  ) {
    ragdoll.floorKicked = true;
    floorKick(ragdoll, ragdoll.sideSpin);
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

