/**
 * Sistema de colisão player × spikes.
 *
 * Fluxo:
 *   querySpikeHits(player, spikes)  → hitboxes em overlap
 *   resolveSpikeContacts(...)       → ContactResult (utils/collision)
 *   planSpikeResponse(contact, state) → ResponsePlan (comandos puros)
 *
 * O App só aplica o ResponsePlan (sem lógica de classificação).
 */

import { createSpikeHitboxes } from "../utils/spikeHitboxes.js";
import { cullSpikeHitboxes } from "../utils/spatialHash.js";
import { buildSpikeQuadTree } from "../utils/quadtree.js";
import {
  findAllSpikeCollisionsQuad,
  resolveSpikeContacts,
} from "../utils/collision.js";
import { MAX_GAME_SPEED } from "../constants/game.js";

/** Cooldowns por tipo de hit (ms) */
export const COOLDOWN = {
  impale_core: 500,
  impale_limb: 280,
  bounce: 160,
};

/** Multiplicadores de momentum */
const MOMENTUM = {
  impale_core_top: 0.8,
  impale_core_bottom: 0.62,
  impale_limb: 0.84,
  bounce: 0.92,
};

/**
 * Monta o OBB do player a partir da posição arcade + ângulo do ragdoll.
 * Coordenadas alinhadas com livingRagdoll (peito = playerY+32, cx = 324).
 */
export function buildPlayerObb({
  playerX = 300,
  playerY,
  angle = 0,
  width = 32,
  height = 56,
}) {
  const cx = playerX + 24;
  const cy = playerY + 32;
  return {
    x: cx - width * 0.5,
    y: cy - height * 0.5,
    width,
    height,
    cx,
    cy,
    angle: angle || 0,
  };
}

/**
 * Broadphase + overlap fino. Retorna lista de hitboxes em contacto.
 */
export function querySpikeHits(player, spikesRef) {
  const top = createSpikeHitboxes(spikesRef.top, "top");
  const bottom = createSpikeHitboxes(spikesRef.bottom, "bottom");
  const raw = top.length || bottom.length ? [...top, ...bottom] : [];
  if (!raw.length) return { hits: [], boxes: [] };

  const boxes = cullSpikeHitboxes(raw, {
    focusX: player.cx,
    focusY: player.cy,
    focusRadius: 260,
    margin: 64,
  });
  const tree = buildSpikeQuadTree(boxes);
  const hits = findAllSpikeCollisionsQuad(player, tree);
  return { hits, boxes };
}

/**
 * @typedef {Object} ResponsePlan
 * @property {boolean} handled
 * @property {number} cooldownMs
 * @property {boolean} noShoot
 * @property {boolean|null} corePinned   null = não muda
 * @property {number|null} velocityY     valor absoluto novo (não delta)
 * @property {number|null} playerY
 * @property {number} momentumMul
 * @property {number} separateY          delta em playerY (só bounce)
 * @property {object|null} pin
 * @property {object|null} impact
 * @property {string|null} severLimb
 * @property {object|null} stuckLimb
 */

function emptyPlan() {
  return {
    handled: false,
    cooldownMs: 0,
    noShoot: false,
    corePinned: null,
    velocityY: null,
    playerY: null,
    momentumMul: 1,
    separateY: 0,
    pin: null,
    impact: null,
    severLimb: null,
    stuckLimb: null,
  };
}

/**
 * Converte ContactResult + estado arcade → ResponsePlan.
 * Função pura: sem side-effects.
 */
export function planSpikeResponse(contact, state) {
  const plan = emptyPlan();
  if (!contact || contact.kind === "none") return plan;

  const {
    velocityY = 0,
    playerCx = 324,
  } = state;

  const tip = contact.tip || { x: playerCx, y: 0 };
  const absVy = Math.abs(velocityY);
  const isTop = contact.side === "top";
  const isBottom = contact.side === "bottom";

  plan.handled = true;
  plan.noShoot = true;
  plan.cooldownMs = COOLDOWN[contact.kind] || COOLDOWN.bounce;

  if (contact.kind === "impale_core") {
    return planImpaleCore(plan, contact, {
      tip,
      absVy,
      isTop,
      isBottom,
      playerCx,
      velocityY,
    });
  }

  if (contact.kind === "impale_limb") {
    return planImpaleLimb(plan, contact, {
      tip,
      absVy,
      isTop,
      isBottom,
      velocityY,
    });
  }

  return planBounce(plan, contact, {
    absVy,
    isTop,
    isBottom,
    velocityY,
  });
}

function planImpaleCore(plan, contact, ctx) {
  const { tip, absVy, isTop, playerCx, velocityY } = ctx;
  const pinPart = contact.bodyPart === "head" ? "head" : "chest";

  if (isTop) {
    // Teto: pin curto → cai
    plan.corePinned = false;
    plan.velocityY = Math.max(5, absVy * 0.5 + 4);
    plan.momentumMul = MOMENTUM.impale_core_top;
    plan.pin = {
      part: pinPart,
      x: playerCx,
      y: tip.y,
      side: "top",
      isCore: true,
      releaseAfterMs: 200,
    };
    plan.impact = {
      strength: 2.6 + Math.min(1.5, absVy * 0.08),
      fx: (contact.offsetX || 0) * 0.2,
      fy: 20,
      part: pinPart,
    };
  } else {
    // Chão: pin permanente, Y alinhado à ponta
    plan.corePinned = true;
    plan.velocityY = 0;
    plan.momentumMul = MOMENTUM.impale_core_bottom;
    // livingRagdoll: cabeça ~ playerY+12, peito ~ playerY+32
    plan.playerY = pinPart === "head" ? tip.y - 12 : tip.y - 30;
    plan.pin = {
      part: pinPart,
      x: playerCx + Math.max(-8, Math.min(8, contact.offsetX || 0)),
      y: tip.y + (pinPart === "head" ? 2 : 8),
      side: "bottom",
      isCore: true,
      releaseAfterMs: null,
    };
    plan.impact = {
      strength: 3.5 + Math.min(1.2, absVy * 0.06),
      fx: (contact.offsetX || 0) * 0.3,
      fy: -4,
      part: pinPart,
    };
  }
  return plan;
}

function planImpaleLimb(plan, contact, ctx) {
  const { tip, absVy, isTop, isBottom, velocityY } = ctx;
  const limbKey = contact.limbKey || "legLeft";

  plan.momentumMul = MOMENTUM.impale_limb;
  plan.severLimb = limbKey;
  plan.stuckLimb = {
    id: `${limbKey}-${Date.now()}`,
    limb: limbKey,
    x: tip.x,
    y: tip.y,
  };

  // bounce pela normal
  let vy = velocityY + (contact.impulseY || 0);
  if (isBottom && vy > -2) vy = -Math.max(4, absVy * 0.7);
  if (isTop && vy < 2) vy = Math.max(4, absVy * 0.7);
  plan.velocityY = vy;

  plan.impact = {
    strength: 2.8,
    fx: (contact.offsetX || 0) >= 0 ? 12 : -12,
    fy: isBottom ? -16 : 14,
    part: limbKey,
  };
  return plan;
}

function planBounce(plan, contact, ctx) {
  const { absVy, isTop, isBottom, velocityY } = ctx;

  plan.momentumMul = MOMENTUM.bounce;

  // separação posicional
  if (contact.penetration > 0) {
    plan.separateY = contact.ny * Math.min(contact.penetration, 14);
  }

  let vy = velocityY + (contact.impulseY || 0);
  if (isBottom) vy = Math.min(vy, -2.5);
  if (isTop) vy = Math.max(vy, 2.5);
  plan.velocityY = vy;

  plan.impact = {
    strength: 1.6 + Math.min(1.2, absVy * 0.06),
    fx: contact.nx * 10 + (contact.offsetX || 0) * 0.15,
    fy: contact.ny * 12,
    part:
      contact.bodyPart === "head"
        ? "head"
        : contact.bodyPart === "legs"
          ? "legLeft"
          : "chest",
  };
  return plan;
}

/**
 * Pipeline completo de um frame:
 * query → resolve → plan.
 *
 * @returns {{ plan: ResponsePlan, boxes: object[], contact: object }}
 */
export function processSpikeFrame({
  playerX = 300,
  playerY,
  angle = 0,
  velocityY = 0,
  spikesRef,
  corePinned = false,
  cooldownRemaining = 0,
}) {
  const player = buildPlayerObb({ playerX, playerY, angle });
  const { hits, boxes } = querySpikeHits(player, spikesRef);

  if (corePinned) {
    return {
      plan: {
        ...emptyPlan(),
        handled: true,
        velocityY: 0, // mantém travado
        corePinned: true,
      },
      boxes,
      contact: null,
    };
  }

  if (!hits.length || cooldownRemaining > 0) {
    return { plan: emptyPlan(), boxes, contact: null };
  }

  const contact = resolveSpikeContacts(player, hits, velocityY);
  const plan = planSpikeResponse(contact, {
    velocityY,
    playerCx: player.cx,
    playerY,
  });

  return { plan, boxes, contact };
}

/** Aplica momentumMul e devolve gameSpeed limitado. */
export function applyMomentumMul(momentum, mul) {
  const next = momentum * mul;
  return {
    momentum: next,
    gameSpeed: Math.min(next, MAX_GAME_SPEED),
  };
}
