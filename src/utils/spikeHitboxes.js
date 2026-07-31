import { SPIKE_SIZE } from "../constants/game.js";

/**
 * Hitboxes triangulares alinhadas ao sprite 64×64.
 * bottom: ponta pra cima (tip no topo)
 * top:    ponta pra baixo (tip embaixo)
 */
export function createSpikeHitboxes(spike, side) {
  const hitboxes = [];
  if (!spike || !spike.amount || spike.amount <= 0) return hitboxes;

  const size = SPIKE_SIZE;
  const startY =
    side === "top" ? 0 : window.innerHeight - size;

  // inset pra não “morder” pixels transparentes da borda da arte
  const insetX = 10;
  const tipInset = 4;

  for (let i = 0; i < spike.amount; i++) {
    const x = spike.x + i * size;
    const y = startY;

    let points;
    let tip;

    if (side === "bottom") {
      // ponta no topo-centro
      tip = { x: x + size / 2, y: y + tipInset };
      points = [
        tip,
        { x: x + insetX, y: y + size - 2 },
        { x: x + size - insetX, y: y + size - 2 },
      ];
    } else {
      // ponta embaixo-centro
      tip = { x: x + size / 2, y: y + size - tipInset };
      points = [
        { x: x + insetX, y: y + 2 },
        { x: x + size - insetX, y: y + 2 },
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

