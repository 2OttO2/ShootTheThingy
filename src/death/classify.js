import { DeathType, createDeathEvent } from "./types.js";

/**
 * Classificação com colisão lateral:
 *
 * face left/right → SPIN (corpo rimba no flanco)
 * top  + tip  → hang
 * top  + base → bounce
 * bottom + tip → impale / impale_leg
 * bottom + base → flop
 */
export function classifyDeath(hitTop, hitBottom, ctx = {}) {
  const velocityY = ctx.velocityY ?? 0;
  const playerX = ctx.playerX ?? 300;
  const playerY = ctx.playerY ?? 0;

  if (!hitTop && !hitBottom) {
    return createDeathEvent({
      type: DeathType.STALL,
      playerX,
      playerY,
      velocityY,
    });
  }

  const hit = hitBottom || hitTop;
  const region = hit.region || "tip";
  const face = hit.face || region;
  const part = hit.bodyPart || "torso";
  const absVy = Math.abs(velocityY);
  const lateral = hit.lateral ?? 0;
  const impact = Math.max(
    0.85,
    Math.min(2.0, 0.85 + absVy / 16 + lateral * 0.45)
  );
  const tip = hit.tip || {
    x: playerX + (ctx.playerW ?? 36) / 2,
    y: playerY,
  };

  let type = DeathType.FLOP;

  // colisão lateral tem prioridade — não empala de frente se bateu no flanco
  if (face === "left" || face === "right") {
    type = DeathType.SPIN;
  } else if (hit.side === "top") {
    type = region === "base" ? DeathType.BOUNCE : DeathType.HANG;
  } else {
    if (region === "base") {
      type = DeathType.FLOP;
    } else if (part === "legs") {
      type = DeathType.IMPALE_LEG;
    } else {
      type = DeathType.IMPALE;
    }
  }

  // offsetX: lateral forçado pro sentido do flanco
  let offsetX = hit.offsetX || 0;
  if (face === "left") offsetX = Math.min(offsetX, -12);
  if (face === "right") offsetX = Math.max(offsetX, 12);

  return createDeathEvent({
    type,
    side: hit.side,
    tip,
    bodyPart: part,
    region: face === "left" || face === "right" ? "tip" : region,
    offsetX,
    impact,
    playerX,
    playerY,
    velocityY,
  });
}

export function classifyStall(ctx = {}) {
  return createDeathEvent({
    type: DeathType.STALL,
    playerX: ctx.playerX ?? 300,
    playerY: ctx.playerY ?? 0,
    velocityY: ctx.velocityY ?? 0,
  });
}

