/**
 * Tipos de morte + formato do DeathEvent.
 * App/Player só passam DeathEvent; física não interpreta strings soltas.
 */

export const DeathType = {
  NONE: "none",
  HANG: "spike_hang",
  IMPALE: "spike_impale",
  IMPALE_LEG: "spike_impale_leg",
  SPIN: "spike_spin",
  BOUNCE: "spike_bounce",
  FLOP: "spike_flop",
  STALL: "stall",
};

/**
 * @typedef {Object} DeathEvent
 * @property {string} type - DeathType.*
 * @property {'top'|'bottom'|null} side
 * @property {{x:number,y:number}|null} tip
 * @property {'head'|'torso'|'legs'|null} bodyPart
 * @property {'tip'|'base'|null} region
 * @property {number} offsetX
 * @property {number} impact
 * @property {number} playerX
 * @property {number} playerY
 * @property {number} velocityY
 * @property {number} angle - ângulo do corpo (radianos) no momento do impacto
 * @property {object} [severed]
 */

/** @returns {DeathEvent} */
export function createDeathEvent(partial = {}) {
  return {
    type: DeathType.NONE,
    side: null,
    tip: null,
    bodyPart: null,
    region: null,
    offsetX: 0,
    impact: 1,
    playerX: 300,
    playerY: 0,
    velocityY: 0,
    angle: 0,
    hSpeed: 0,
    severed: null,
    ...partial,
  };
}
