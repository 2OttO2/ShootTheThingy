import { DeathType, createDeathEvent } from "./types.js";

/**
 * Ponta do spike → impale / hang (prioridade).
 * Flanco só quando NÃO está na ponta.
 */
/** Mapeia membro fino → categoria grosso usada nas regras de tipo. */
function coarsePart(part) {
  if (!part) return "torso";
  if (part === "head") return "head";
  if (
    part === "lFoot" ||
    part === "rFoot" ||
    part === "lKnee" ||
    part === "rKnee" ||
    part === "legs"
  ) {
    return "legs";
  }
  if (
    part === "lHand" ||
    part === "rHand" ||
    part === "lShoulder" ||
    part === "rShoulder"
  ) {
    return "arms";
  }
  return "torso";
}

export function classifyDeath(hitTop, hitBottom, ctx = {}) {
  const velocityY = ctx.velocityY ?? 0;
  const velocityX = ctx.velocityX ?? 0;
  const playerX = ctx.playerX ?? 300;
  const playerY = ctx.playerY ?? 0;
  const angle = ctx.angle ?? 0;
  const angularVelocity = ctx.angularVelocity ?? 0;
  const hSpeed = ctx.hSpeed ?? 0;

  if (!hitTop && !hitBottom) {
    return createDeathEvent({
      type: DeathType.STALL,
      playerX,
      playerY,
      velocityY,
      velocityX,
      angle,
      angularVelocity,
      hSpeed,
    });
  }

  const hit = hitBottom || hitTop;
  const region = hit.region || "tip";
  const face = hit.face || region;
  const part = hit.bodyPart || "torso";
  const coarse = coarsePart(part);
  const absVy = Math.abs(velocityY);
  const impactSpeed = Math.hypot(velocityX || 0, velocityY || 0);
  const impact = Math.max(
    0.9,
    Math.min(
      2.4,
      0.9 + absVy / 14 + impactSpeed / 40 + (region === "tip" ? 0.25 : 0)
    )
  );
  const tip = hit.tip || {
    x: playerX + (ctx.playerW ?? 36) / 2,
    y: playerY,
  };

  const contactPoint = hit.contactPoint || null;
  const distToTip =
    hit.distToTip ??
    (contactPoint && tip
      ? Math.hypot(contactPoint.x - tip.x, contactPoint.y - tip.y)
      : tip
        ? Math.hypot(
            playerX + (ctx.playerW ?? 36) / 2 - tip.x,
            playerY + (ctx.playerH ?? 56) * 0.5 - tip.y
          )
        : 999);

  const onTip =
    region === "tip" ||
    face === "tip" ||
    distToTip < 44;

  let type = DeathType.FLOP;

  // Prioridade por parte do corpo:
  // - cabeça + teto → hang
  // - perna / pé / joelho → impale_leg
  // - resto na ponta → impale
  // Base larga e flanco escapam dessa regra.
  const byBodyPart = () => {
    if (coarse === "legs") return DeathType.IMPALE_LEG;
    if (part === "head" && hit.side === "top") return DeathType.HANG;
    return DeathType.IMPALE;
  };

  // Empala/pendura SÓ com ponta clara. Ambíguo/base = bounce/flop —
  // evita impale forçado no teto (contato superficial virava hang).
  if (onTip && (region === "tip" || face === "tip")) {
    type = byBodyPart();
  } else if (face === "left" || face === "right") {
    type = DeathType.SPIN;
  } else if (region === "base") {
    type = hit.side === "top" ? DeathType.BOUNCE : DeathType.FLOP;
  } else if (onTip) {
    type = byBodyPart();
  } else {
    type = hit.side === "top" ? DeathType.BOUNCE : DeathType.FLOP;
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
    offsetY: hit.offsetY ?? 0,
    impact,
    playerX,
    playerY,
    velocityY,
    velocityX,
    angle,
    angularVelocity,
    hSpeed,
    contactPoint,
    distToTip,
    surfaceNormal: hit.surfaceNormal || null,
  });
}

export function classifyStall(ctx = {}) {
  return createDeathEvent({
    type: DeathType.STALL,
    playerX: ctx.playerX ?? 300,
    playerY: ctx.playerY ?? 0,
    velocityY: ctx.velocityY ?? 0,
    angle: ctx.angle ?? 0,
    hSpeed: ctx.hSpeed ?? 0,
  });
}

