import { DeathType, createDeathEvent } from "./types.js";

/**
 * ÚNICA tabela: colisão + velocidade → DeathEvent.
 * Não anima, não mexe em React — só classifica.
 *
 * @param {object|null} hitTop - resultado de findSpikeCollision
 * @param {object|null} hitBottom
 * @param {{ velocityY: number, playerX: number, playerY: number, playerW?: number, playerH?: number }} ctx
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
  const part = hit.bodyPart || "torso";
  const absVy = Math.abs(velocityY);
  const impact = Math.max(0.7, Math.min(2.1, 0.7 + absVy / 14));
  const absOff = Math.abs(hit.offsetX || 0);
  const tip = hit.tip || {
    x: playerX + (ctx.playerW ?? 36) / 2,
    y: playerY,
  };

  let type = DeathType.FLOP;

  if (hit.side === "top") {
    if (region === "tip" && part === "head") type = DeathType.HANG;
    else if (region === "tip" && part === "torso") type = DeathType.IMPALE;
    else if (region === "tip" && part === "legs") type = DeathType.SPIN;
    else if (region === "base" && absOff > 12) type = DeathType.SPIN;
    else if (region === "base") type = DeathType.BOUNCE;
    else type = DeathType.HANG;
  } else {
    // bottom
    if (region === "tip" && part === "legs") type = DeathType.IMPALE_LEG;
    else if (region === "tip" && part === "head") type = DeathType.SPIN;
    else if (region === "tip") type = DeathType.IMPALE;
    else if (region === "base" && absVy > 10) type = DeathType.BOUNCE;
    else if (region === "base" && absOff > 14) type = DeathType.SPIN;
    else type = DeathType.FLOP;
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

/** Morte por ficar parado */
export function classifyStall(ctx = {}) {
  return createDeathEvent({
    type: DeathType.STALL,
    playerX: ctx.playerX ?? 300,
    playerY: ctx.playerY ?? 0,
    velocityY: ctx.velocityY ?? 0,
  });
}
