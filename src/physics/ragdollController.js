/**
 * Controlador de ragdoll + colisão com spikes.
 */
import { DeathType } from "../death/types.js";
import { applyDeathBehavior, floorKick } from "../death/behaviors.js";
import { createStandingBody } from "./bodyFactory.js";
import { SPIKE_SPEED } from "../constants/game.js";
import {
  setPinned,
  unpin,
  impulse,
  clampV,
  stepBody,
  angleBetween,
  dist,
} from "./verlet.js";
import { collidePointsWithSpikes, findReimpaleCandidate } from "./worldCollision.js";

// quanto tempo (segundos) uma parte fica presa num espeto antes de
// escorregar/soltar por conta da gravidade — depois disso o corpo cai
// livre de novo e pode ser empalado em OUTRO espeto.
const PIN_RELEASE_SEC = {
  head: 1.1, // pendurado pela cabeça (HANG)
  chest: 1.7, // empalado pelo peito (IMPALE)
  lFoot: 1.3, // empalado pela perna (IMPALE_LEG)
  rFoot: 1.3,
  hip: 1.3,
};

export function createRagdoll(x, y, opts = {}) {
  const floorY =
    opts.floorY ??
    (typeof window !== "undefined" ? window.innerHeight - 10 : 600);
  const ceilingY = opts.ceilingY ?? 5;

  const event = opts.event ?? {
    type: opts.deathType ?? DeathType.STALL,
    side: opts.spikeSide ?? "bottom",
    tip: {
      x: opts.spikeTipX ?? x + 24,
      y: opts.spikeTipY ?? y + 40,
    },
    offsetX: opts.offsetX ?? 0,
    impact: opts.impact ?? 1,
    velocityY: opts.velocityY ?? 0,
    hSpeed: opts.hSpeed ?? 0,
    playerX: x,
    playerY: y,
    severed: opts.severed ?? {},
  };

  const body = createStandingBody(x, y, event.severed || opts.severed || {});
  body.floorY = floorY;
  body.ceilingY = ceilingY;

  const meta = applyDeathBehavior(body, event);
  for (const p of body.points) clampV(p);

  const pin = meta.pinnedPartKey
    ? {
        partKey: meta.pinnedPartKey,
        tipX: meta.spikeTipX,
        tipY: meta.spikeTipY,
        side: meta.spikeSide,
        timer: PIN_RELEASE_SEC[meta.pinnedPartKey] ?? 1.3,
      }
    : null;

  return {
    ...body,
    alive: true,
    deathType: event.type,
    spikeSide: meta.spikeSide,
    floorKicked: false,
    spikeTipX: meta.spikeTipX,
    spikeTipY: meta.spikeTipY,
    sideSpin: meta.sideSpin,
    pin,
    // hitboxes dos spikes — atualizadas a cada frame pelo App.jsx (não
    // ficam congeladas no momento da morte, senão desalinham do mapa
    // que continua andando)
    obstacles: opts.obstacles ?? [],
  };
}

function releasePin(ragdoll) {
  const { parts, sideSpin } = ragdoll;
  const s = sideSpin || 1;
  const p = parts[ragdoll.pin.partKey];
  if (p) unpin(p);
  ragdoll.pin = null;
  // escorregão: um empurrão leve na direção do giro, deixando a
  // gravidade terminar o resto (cair e, quem sabe, empalar de novo)
  impulse(parts.head, s * 0.5, 1.6);
  impulse(parts.chest, s * 0.8, 2.2);
  impulse(parts.hip, s * 1.2, 2.8);
  if (!ragdoll.severed.armLeft) impulse(parts.lHand, -2, 1.5);
  if (!ragdoll.severed.armRight) impulse(parts.rHand, 2, 1.5);
  ragdoll.floorKicked = false; // pode quicar/reagir de novo depois de soltar
}

export function stepRagdoll(ragdoll, dtNorm = 1, moveSpeed = 0) {
  if (!ragdoll || !ragdoll.alive) return;

  const dtSec = dtNorm * (16.67 / 1000);

  // Os spikes continuam andando depois da morte enquanto houver speed
  // (hooks/useSpikes.js: delta = (SPIKE_SPEED + gameSpeed) * dt). O
  // ponto onde o corpo está preso (empalado/pendurado) tem que "andar"
  // junto com o espeto que o segura, na MESMA taxa — senão ele desgruda
  // visualmente do espeto conforme o mapa rola.
  if (moveSpeed > 0) {
    ragdoll.spikeTipX -= (SPIKE_SPEED + moveSpeed) * dtNorm;
    if (ragdoll.pin) ragdoll.pin.tipX -= (SPIKE_SPEED + moveSpeed) * dtNorm;
  }

  if (ragdoll.pin) {
    ragdoll.pin.timer -= dtSec;
    const p = ragdoll.parts[ragdoll.pin.partKey];

    if (ragdoll.pin.partKey === "chest") {
      // peito empalado escorrega bem devagar ao longo do espeto antes
      // de soltar de vez (efeito "escorregando pela gravidade")
      const hip = ragdoll.parts.hip;
      let targetY = p.y;
      if (ragdoll.pin.side === "bottom") {
        targetY = Math.min(p.y + 0.1 * dtNorm, ragdoll.pin.tipY + 34);
      } else {
        targetY = Math.min(
          p.y + 0.06 * dtNorm,
          Math.max(24, ragdoll.pin.tipY - 4)
        );
      }
      setPinned(p, ragdoll.pin.tipX, targetY);
      hip.x = ragdoll.pin.tipX;
      hip.y = p.y + 18;
      hip.ox = hip.x;
      hip.oy = hip.y;
    } else if (p) {
      setPinned(p, ragdoll.pin.tipX, p.y);
    }

    if (ragdoll.pin.timer <= 0) {
      releasePin(ragdoll);
    }
  }

  // bounce um pouco mais elástico que o padrão do verlet (0.55), pra ficar
  // mais parecido com o BOUNCE=0.8 usado na física de quando o Player
  // está vivo (constants/game.js) — só nesta chamada, não mexe no DEFAULTS
  // global usado por outras coisas.
  stepBody(ragdoll, dtNorm, { scroll: 0, bounce: 0.7 });

  // Livre (sem pin) → pode ser empalado de novo se alguma parte-âncora
  // (peito/cabeça/pé) tocar bem na ponta de um espeto.
  if (!ragdoll.pin && ragdoll.obstacles?.length) {
    const candidate = findReimpaleCandidate(ragdoll.parts, ragdoll.obstacles, 22);
    if (candidate) {
      setPinned(candidate.part, candidate.hb.tip.x, candidate.hb.tip.y);
      ragdoll.pin = {
        partKey: candidate.partKey,
        tipX: candidate.hb.tip.x,
        tipY: candidate.hb.tip.y,
        side: candidate.hb.side,
        timer: PIN_RELEASE_SEC[candidate.partKey] ?? 1.3,
      };
      ragdoll.deathType =
        candidate.partKey === "head"
          ? candidate.hb.side === "top"
            ? DeathType.HANG
            : DeathType.IMPALE
          : candidate.partKey === "chest"
          ? DeathType.IMPALE
          : DeathType.IMPALE_LEG;
      ragdoll.floorKicked = false;
    }
  }

  // colisão normal com o CORPO dos spikes (não a ponta): corpo quica /
  // é empurrado pra fora. Pontos já presos (pin, seja o original ou um
  // reempalamento que acabou de acontecer) são ignorados automaticamente.
  if (ragdoll.obstacles?.length) {
    collidePointsWithSpikes(ragdoll.points, ragdoll.obstacles);
  }

  if (!ragdoll.floorKicked && !ragdoll.pin && ragdoll.parts.hip.y >= ragdoll.floorY - 10) {
    ragdoll.floorKicked = true;
    floorKick(ragdoll, ragdoll.sideSpin);
  }
}

export function ragdollSnapshot(ragdoll) {
  if (!ragdoll) return null;
  const { parts, severed } = ragdoll;
  return {
    head: { x: parts.head.x, y: parts.head.y },
    chest: { x: parts.chest.x, y: parts.chest.y },
    hip: { x: parts.hip.x, y: parts.hip.y },
    lShoulder: { x: parts.lShoulder.x, y: parts.lShoulder.y },
    rShoulder: { x: parts.rShoulder.x, y: parts.rShoulder.y },
    lHand: { x: parts.lHand.x, y: parts.lHand.y },
    rHand: { x: parts.rHand.x, y: parts.rHand.y },
    lKnee: { x: parts.lKnee.x, y: parts.lKnee.y },
    rKnee: { x: parts.rKnee.x, y: parts.rKnee.y },
    lFoot: { x: parts.lFoot.x, y: parts.lFoot.y },
    rFoot: { x: parts.rFoot.x, y: parts.rFoot.y },
    severed: { ...severed },
    deathType: ragdoll.deathType,
  };
}

export { angleBetween, dist };

