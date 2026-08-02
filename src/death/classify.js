import { DeathType, createDeathEvent } from "./types.js";

/**
 * Ponta do spike → impale / hang (prioridade).
 * Flanco só quando NÃO está na ponta.
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
    0.9,
    Math.min(2.1, 0.9 + absVy / 14 + (region === "tip" ? 0.25 : 0))
  );
  const tip = hit.tip || {
    x: playerX + (ctx.playerW ?? 36) / 2,
    y: playerY,
  };

  // distância do centro do player à ponta
  const cx = playerX + (ctx.playerW ?? 36) / 2;
  const cy = playerY + (ctx.playerH ?? 56) * 0.5;
  const distTip = tip ? Math.hypot(cx - tip.x, cy - tip.y) : 999;
  const onTip =
    region === "tip" ||
    face === "tip" ||
    distTip < 36;

  let type = DeathType.FLOP;

  if (onTip) {
    // PRIORIDADE: ponta empala / pendura
    if (hit.side === "top") {
      type = DeathType.HANG;
    } else if (part === "legs") {
      type = DeathType.IMPALE_LEG;
    } else if (part === "head") {
      // cabeça na ponta de baixo ainda empala pelo peito/pescoço
      type = DeathType.IMPALE;
    } else {
      type = DeathType.IMPALE;
    }
  } else if (face === "left" || face === "right") {
    type = DeathType.SPIN;
  } else if (hit.side === "top") {
    type = region === "base" ? DeathType.BOUNCE : DeathType.HANG;
  } else {
    type = region === "base" ? DeathType.FLOP : DeathType.IMPALE;
  }

  let offsetX = hit.offsetX || 0;
  if (!onTip && face === "left") offsetX = Math.min(offsetX, -12);
  if (!onTip && face === "right") offsetX = Math.max(offsetX, 12);

  return createDeathEvent({
    type,
    side: hit.side,
    tip,
    bodyPart: part,
    region: onTip ? "tip" : region,
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

