import { DeathType, createDeathEvent } from "./types.js";

/**
 * Ponta do spike → impale / hang (prioridade).
 * Flanco só quando NÃO está na ponta.
 */
export function classifyDeath(hitTop, hitBottom, ctx = {}) {
  const velocityY = ctx.velocityY ?? 0;
  const playerX = ctx.playerX ?? 300;
  const playerY = ctx.playerY ?? 0;
  const angle = ctx.angle ?? 0;
  const hSpeed = ctx.hSpeed ?? 0;

  if (!hitTop && !hitBottom) {
    return createDeathEvent({
      type: DeathType.STALL,
      playerX,
      playerY,
      velocityY,
      angle,
      hSpeed,
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
    distTip < 44;

  let type = DeathType.FLOP;

  // Prioridade por parte do corpo: cabeça pegando um spike de TETO
  // pendura; peito/torso empala (chão OU teto); perna empala pela perna.
  // Isso vale tanto no contato "bem na ponta" quanto no ambíguo — só a
  // base larga (region === "base") e o flanco (face left/right) fogem
  // dessa regra.
  const byBodyPart = () => {
    if (part === "legs") return DeathType.IMPALE_LEG;
    if (part === "head" && hit.side === "top") return DeathType.HANG;
    return DeathType.IMPALE;
  };

  if (onTip) {
    type = byBodyPart();
  } else if (face === "left" || face === "right") {
    type = DeathType.SPIN;
  } else if (region === "base") {
    type = hit.side === "top" ? DeathType.BOUNCE : DeathType.FLOP;
  } else {
    // contato ambíguo (nem claramente ponta, nem claramente base) —
    // ainda decide pela parte do corpo, senão peito/perna em espeto de
    // teto viravam HANG por engano toda vez que a detecção de ponta
    // não era 100% precisa.
    type = byBodyPart();
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
    angle,
    hSpeed,
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

