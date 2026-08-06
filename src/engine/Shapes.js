/**
 * Fábrica de shapes do planck-js a partir de specs simples em pixels.
 * Usado só internamente por World.js — o resto do jogo nunca importa
 * planck-js diretamente, só descreve a forma que quer.
 */
import { Box, Circle, Polygon, Edge, Vec2 } from "planck-js";

/**
 * @param {object} spec
 *  - { type: 'box', width, height }               (largura/altura totais, em px)
 *  - { type: 'circle', radius }
 *  - { type: 'polygon', points: [{x,y}, ...] }     (locais ao corpo)
 *  - { type: 'edge', from: {x,y}, to: {x,y} }      (só corpos estáticos)
 */
export function createShape(spec) {
  switch (spec.type) {
    case "box":
      return Box(spec.width / 2, spec.height / 2, spec.center ? Vec2(spec.center.x, spec.center.y) : undefined);
    case "circle":
      return Circle(spec.center ? Vec2(spec.center.x, spec.center.y) : undefined, spec.radius);
    case "polygon":
      return Polygon(spec.points.map((p) => Vec2(p.x, p.y)));
    case "edge":
      return Edge(Vec2(spec.from.x, spec.from.y), Vec2(spec.to.x, spec.to.y));
    default:
      throw new Error(`[engine/Shapes] tipo de shape desconhecido: "${spec.type}"`);
  }
}
