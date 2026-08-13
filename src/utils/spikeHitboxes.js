import { SPIKE_SIZE } from "../constants/game.js";

/**
 * Dimensões nativas de assets/spike.png (triângulo com margem transparente).
 * CSS: 64×64 + object-fit: contain → arte escalada e centrada na caixa.
 */
const IMG_W = 784;
const IMG_H = 1168;
/** bounds opacos do triângulo na imagem */
const CONTENT = { x0: 79, y0: 83, x1: 708, y1: 1091 };

/**
 * Hitboxes alinhadas ao sprite:
 *   .spike  → left = spike.x + index * 64  (mesmo do Spikes.jsx)
 *   .top    → top: 1px + rotate(180deg)
 *   .bottom → bottom: 1px
 */
export function createSpikeHitboxes(spike, side) {
  const hitboxes = [];
  if (!spike || !spike.amount || spike.amount <= 0) return hitboxes;

  const size = SPIKE_SIZE;
  const startY =
    side === "top" ? 1 : Math.max(0, window.innerHeight - size - 1);

  // object-fit: contain
  const scale = Math.min(size / IMG_W, size / IMG_H);
  const dispW = IMG_W * scale;
  const dispH = IMG_H * scale;
  const padX = (size - dispW) / 2;
  const padY = (size - dispH) / 2;

  const cx0 = padX + CONTENT.x0 * scale;
  const cx1 = padX + CONTENT.x1 * scale;
  const cy0 = padY + CONTENT.y0 * scale;
  const cy1 = padY + CONTENT.y1 * scale;
  const midX = (cx0 + cx1) / 2;
  const inset = 1.5;

  // rotate 180° em torno do centro da caixa 64×64 (coordenadas locais)
  const rot180 = (lx, ly) => {
    const c = size / 2;
    return { lx: c * 2 - lx, ly: c * 2 - ly };
  };

  for (let i = 0; i < spike.amount; i++) {
    // idêntico ao style.left do <img> em Spikes.jsx
    const x = spike.x + i * size;
    const y = startY;

    let points;
    let tip;

    if (side === "bottom") {
      // ponta pra cima
      tip = { x: x + midX, y: y + cy0 + inset };
      points = [
        tip,
        { x: x + cx0 + inset, y: y + cy1 - inset },
        { x: x + cx1 - inset, y: y + cy1 - inset },
      ];
    } else {
      // sprite rotate(180deg): ponta pra baixo
      const t = rot180(midX, cy0 + inset);
      const b1 = rot180(cx0 + inset, cy1 - inset);
      const b2 = rot180(cx1 - inset, cy1 - inset);
      tip = { x: x + t.lx, y: y + t.ly };
      points = [
        { x: x + b1.lx, y: y + b1.ly },
        { x: x + b2.lx, y: y + b2.ly },
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
