import { SPIKE_SIZE } from "../constants/game.js";

/**
 * Hitboxes alinhadas ao CSS do sprite:
 *   .top    → top: 1px  + rotate(180deg)
 *   .bottom → bottom: 1px
 * Sprite 64×64; triângulo inset pra casar com a arte (não a bbox cheia).
 */
export function createSpikeHitboxes(spike, side) {
  const hitboxes = [];
  if (!spike || !spike.amount || spike.amount <= 0) return hitboxes;

  const size = SPIKE_SIZE;
  // CSS: top:1px / bottom:1px
  const startY =
    side === "top" ? 1 : Math.max(0, window.innerHeight - size - 1);

  // arte tem margem transparente — inset maior = hitbox mais justa na ponta
  const insetX = 14;
  const tipInset = 6;
  const baseInset = 4;

  for (let i = 0; i < spike.amount; i++) {
    const x = spike.x + i * size - 9;
    const y = startY;

    let points;
    let tip;

    if (side === "bottom") {
      // ponta pra CIMA (igual sprite no chão)
      tip = { x: x + size / 2, y: y + tipInset };
      points = [
        tip,
        { x: x + insetX, y: y + size - baseInset },
        { x: x + size - insetX, y: y + size - baseInset },
      ];
    } else {
      // ponta pra BAIXO (sprite rotacionado 180°)
      tip = { x: x + size / 2, y: y + size - tipInset };
      points = [
        { x: x + insetX, y: y + baseInset },
        { x: x + size - insetX, y: y + baseInset },
        tip,
      ];
    }

    hitboxes.push({
      points,
      tip,
      side,
      index: i,
      x,
      y,
      size,
    });
  }

  return hitboxes;
}

