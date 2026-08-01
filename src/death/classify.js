import { DeathType, createDeathEvent } from "./types.js";

/**
 * Classificação estável e previsível.
 *
 * top  + tip  → hang
 * top  + base → bounce
 * bottom + tip → impale (torso) / impale_leg (pernas)
 * bottom + base → flop
 * stall → stall
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

  // prioriza spike de baixo se os dois no mesmo frame
  const hit = hitBottom || hitTop;
  const region = hit.region || "tip";
  const part = hit.bodyPart || "torso";
  const absVy = Math.abs(velocityY);
  const impact = Math.max(0.8, Math.min(1.8, 0.8 + absVy / 16));
  const tip = hit.tip || {
    x: playerX + (ctx.playerW ?? 36) / 2,
    y: playerY,
  };

  let type = DeathType.FLOP;

  if (hit.side === "top") {
    type = region === "base" ? DeathType.BOUNCE : DeathType.HANG;
  } else {
    // bottom
    if (region === "base") {
      type = DeathType.FLOP;
    } else if (part === "legs") {
      type = DeathType.IMPALE_LEG;
    } else {
      type = DeathType.IMPALE;
    }
  }

  return createDeathEvent({
    type,
    side: hit.side,
    tip,
    bodyPart: part,
    region,
    offsetX: hit.offsetX || 0,
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

