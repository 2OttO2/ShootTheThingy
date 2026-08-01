/**
 * Ragdoll Planck (Box2D) — mortes claras:
 * hang: corpo montado sob a ponta → balança → solta → cai
 * impale: peito soldado na ponta, membros flailam
 * impale_leg / bounce / spin / flop
 */
import {
  World,
  Vec2,
  Box,
  Circle,
  Edge,
  Polygon,
  RevoluteJoint,
  WeldJoint,
  Settings,
} from "planck-js";
import { DeathType } from "../death/types.js";

// Planck/Box2D limita deslocamento por step (~2px default) → queda em "slow-mo"
// em coordenadas de pixel. Aumenta o teto.
Settings.maxTranslation = 25;
Settings.maxTranslationSquared = 25 * 25;
Settings.maxRotation = 0.8 * Math.PI;
Settings.maxRotationSquared = (0.8 * Math.PI) ** 2;

const GRAVITY = 980;
const VEL_ITERS = 10;
const POS_ITERS = 4;

/** groupIndex -1: membros não se empurram */
const NO_SELF = { groupIndex: -1 };

function rev(world, a, b, localA, localB, limits) {
  const def = {
    bodyA: a,
    bodyB: b,
    localAnchorA: localA,
    localAnchorB: localB,
    collideConnected: false,
  };
  if (limits) {
    def.enableLimit = true;
    def.lowerAngle = limits[0];
    def.upperAngle = limits[1];
  }
  return world.createJoint(RevoluteJoint(def));
}

function box(world, x, y, hx, hy, density, extra = {}) {
  const body = world.createBody({
    type: "dynamic",
    position: Vec2(x, y),
    linearDamping: 0.05,
    angularDamping: 0.25,
    ...extra,
  });
  body.createFixture({
    shape: Box(hx, hy),
    density,
    friction: 0.5,
    restitution: 0.12,
    filter: NO_SELF,
  });
  return body;
}

function circle(world, x, y, r, density) {
  const body = world.createBody({
    type: "dynamic",
    position: Vec2(x, y),
    linearDamping: 0.05,
    angularDamping: 0.3,
  });
  body.createFixture({
    shape: Circle(r),
    density,
    friction: 0.4,
    restitution: 0.1,
    filter: NO_SELF,
  });
  return body;
}

function impulse(body, ix, iy) {
  if (!body) return;
  body.applyLinearImpulse(Vec2(ix, iy), body.getWorldCenter(), true);
}

/**
 * Spikes congelados na morte → polígonos estáticos no mundo Planck.
 * Sem isso o corpo atravessa os spikes depois de morto.
 */
function addSpikeObstacles(world, obstacles) {
  if (!obstacles?.length) return 0;
  let n = 0;
  for (const hb of obstacles) {
    if (!hb?.points || hb.points.length < 3) continue;
    const verts = hb.points.map((p) => Vec2(p.x, p.y));
    try {
      const body = world.createBody({ type: "static" });
      body.createFixture({
        shape: Polygon(verts),
        friction: 0.35,
        restitution: 0.05,
        // category padrão — colide com ragdoll (groupIndex -1)
      });
      n++;
    } catch (e) {
      // polígono inválido (vértices colineares etc.) — ignora
    }
  }
  return n;
}

/**
 * Monta o esqueleto já na pose da morte (não na pose "em pé longe do spike").
 */
export function createRagdoll(x, y, opts = {}) {
  const floorY =
    opts.floorY ??
    (typeof window !== "undefined" ? window.innerHeight - 10 : 600);
  const ceilingY = opts.ceilingY ?? 5;

  const deathType = opts.deathType ?? opts.event?.type ?? DeathType.STALL;
  const tipX = opts.spikeTipX ?? opts.event?.tip?.x ?? x + 24;
  const tipY = opts.spikeTipY ?? opts.event?.tip?.y ?? y + 40;
  const spikeSide = opts.spikeSide ?? opts.event?.side ?? "bottom";
  const offsetX = opts.offsetX ?? opts.event?.offsetX ?? 0;
  const impact = Math.max(0.9, Math.min(1.8, opts.impact ?? opts.event?.impact ?? 1));
  const velocityY = opts.velocityY ?? opts.event?.velocityY ?? 0;
  const side = offsetX >= 0 ? 1 : -1;

  const sev = {
    legLeft: !!opts.severed?.legLeft,
    legRight: !!opts.severed?.legRight,
    armLeft: !!opts.severed?.armLeft,
    armRight: !!opts.severed?.armRight,
  };

  const world = World(Vec2(0, GRAVITY));

  // mundo estático
  const ground = world.createBody();
  ground.createFixture(Edge(Vec2(-4000, floorY), Vec2(4000, floorY)));
  const ceil = world.createBody();
  ceil.createFixture(Edge(Vec2(-4000, ceilingY), Vec2(4000, ceilingY)));
  const maxX = typeof window !== "undefined" ? window.innerWidth - 16 : 900;
  world.createBody().createFixture(Edge(Vec2(16, -200), Vec2(16, floorY + 50)));
  world.createBody().createFixture(Edge(Vec2(maxX, -200), Vec2(maxX, floorY + 50)));

  // spikes ainda "existem" na morte
  addSpikeObstacles(world, opts.obstacles ?? []);

  // --- pose inicial por tipo de morte ---
  // âncora visual: hang/impale usam o tip; demais usam posição do player
  let hx = x + 24;
  let hy = y + 12; // head center default

  if (deathType === DeathType.HANG) {
    // cabeça na ponta, corpo pendurado pra baixo
    hx = tipX;
    hy = tipY;
  } else if (deathType === DeathType.IMPALE) {
    hx = tipX;
    hy =
      spikeSide === "bottom"
        ? tipY + 14 - 18 // head above chest
        : Math.max(30, tipY - 14) - 18;
  } else if (deathType === DeathType.IMPALE_LEG) {
    hx = tipX;
    hy = tipY - 50;
  }

  const headR = 13;
  const chestHX = 11;
  const chestHY = 11;
  const hipHX = 10;
  const hipHY = 8;

  const head = circle(world, hx, hy, headR, 1.0);
  const chest = box(world, hx + side * 1, hy + headR + chestHY, chestHX, chestHY, 2.0);
  const hip = box(
    world,
    hx + side * 2,
    hy + headR + chestHY * 2 + hipHY + 2,
    hipHX,
    hipHY,
    1.8
  );

  const lShoulder = box(world, hx - 14, hy + headR + 4, 5, 5, 0.55);
  const rShoulder = box(world, hx + 14, hy + headR + 4, 5, 5, 0.55);

  let lHand = null;
  let rHand = null;
  let lKnee = null;
  let rKnee = null;
  let lFoot = null;
  let rFoot = null;

  if (!sev.armLeft) {
    lHand = box(world, hx - 22, hy + headR + 22, 4, 10, 0.4);
  }
  if (!sev.armRight) {
    rHand = box(world, hx + 22, hy + headR + 22, 4, 10, 0.4);
  }
  if (!sev.legLeft) {
    lKnee = box(world, hx - 10, hip.getPosition().y + 16, 5, 9, 0.55);
    lFoot = box(world, hx - 11, hip.getPosition().y + 34, 5, 8, 0.45);
  }
  if (!sev.legRight) {
    rKnee = box(world, hx + 10, hip.getPosition().y + 16, 5, 9, 0.55);
    rFoot = box(world, hx + 11, hip.getPosition().y + 34, 5, 8, 0.45);
  }

  // joints com âncoras LOCAIS (estáveis)
  rev(world, head, chest, Vec2(0, headR - 1), Vec2(0, -chestHY), [-0.8, 0.8]);
  rev(world, chest, hip, Vec2(0, chestHY - 1), Vec2(0, -hipHY), [-0.5, 0.5]);
  rev(world, chest, lShoulder, Vec2(-chestHX + 2, -2), Vec2(4, 0), [-1.4, 1.4]);
  rev(world, chest, rShoulder, Vec2(chestHX - 2, -2), Vec2(-4, 0), [-1.4, 1.4]);

  if (lHand) {
    rev(world, lShoulder, lHand, Vec2(0, 4), Vec2(0, -9), [-2.4, 0.6]);
  }
  if (rHand) {
    rev(world, rShoulder, rHand, Vec2(0, 4), Vec2(0, -9), [-0.6, 2.4]);
  }
  if (lKnee) {
    rev(world, hip, lKnee, Vec2(-6, hipHY - 1), Vec2(0, -8), [-0.15, 2.1]);
    rev(world, lKnee, lFoot, Vec2(0, 8), Vec2(0, -7), [-0.1, 2.3]);
  }
  if (rKnee) {
    rev(world, hip, rKnee, Vec2(6, hipHY - 1), Vec2(0, -8), [-2.1, 0.15]);
    rev(world, rKnee, rFoot, Vec2(0, 8), Vec2(0, -7), [-2.3, 0.1]);
  }

  let pinJoint = null;
  let pinBody = null;
  let hangTimer = 0;
  let hangReleased = true;

  // --- comportamentos de morte ---
  if (deathType === DeathType.HANG) {
    // pin na cabeça (revolute na ponta do spike de cima)
    pinBody = world.createBody({
      type: "static",
      position: Vec2(tipX, tipY),
    });
    pinJoint = world.createJoint(
      RevoluteJoint({
        bodyA: pinBody,
        bodyB: head,
        localAnchorA: Vec2(0, 0),
        localAnchorB: Vec2(0, -headR + 2),
        collideConnected: false,
      })
    );
    hangTimer = 1.2;
    hangReleased = false;
    // balanço inicial (pêndulo)
    impulse(hip, side * 180 * impact, 20);
    impulse(chest, side * 80 * impact, 10);
    if (lFoot) impulse(lFoot, -side * 60, 40);
    if (rFoot) impulse(rFoot, side * 60, 40);
    if (lHand) impulse(lHand, -side * 40, 30);
    if (rHand) impulse(rHand, side * 40, 30);
  } else if (deathType === DeathType.IMPALE) {
    const cy =
      spikeSide === "bottom" ? tipY + 16 : Math.max(30, tipY - 14);
    // reposiciona peito no tip e solda
    chest.setTransform(Vec2(tipX, cy), 0);
    head.setTransform(Vec2(tipX, cy - headR - chestHY), 0);
    hip.setTransform(Vec2(tipX + side * 3, cy + chestHY + hipHY), 0);
    pinBody = world.createBody({
      type: "static",
      position: Vec2(tipX, cy),
    });
    pinJoint = world.createJoint(
      WeldJoint({
        bodyA: pinBody,
        bodyB: chest,
        localAnchorA: Vec2(0, 0),
        localAnchorB: Vec2(0, 0),
        collideConnected: false,
        frequencyHz: 0,
        dampingRatio: 0,
      })
    );
    impulse(head, -side * 50 * impact, -10);
    if (lFoot) impulse(lFoot, -100 * impact, 60);
    if (rFoot) impulse(rFoot, 100 * impact, 60);
    if (lHand) impulse(lHand, -90 * impact, 40);
    if (rHand) impulse(rHand, 90 * impact, 40);
  } else if (deathType === DeathType.IMPALE_LEG) {
    const foot = lFoot || rFoot || hip;
    const fy = tipY + (spikeSide === "bottom" ? 4 : 0);
    foot.setTransform(Vec2(tipX, fy), 0);
    pinBody = world.createBody({
      type: "static",
      position: Vec2(tipX, fy),
    });
    pinJoint = world.createJoint(
      RevoluteJoint({
        bodyA: pinBody,
        bodyB: foot,
        localAnchorA: Vec2(0, 0),
        localAnchorB: Vec2(0, 0),
        collideConnected: false,
      })
    );
    impulse(head, side * 150 * impact, 50);
    impulse(chest, side * 120 * impact, 70);
    impulse(hip, side * 40 * impact, 20);
  } else if (deathType === DeathType.BOUNCE) {
    const away = spikeSide === "top" ? 1 : -1;
    impulse(chest, side * 100 * impact, away * 160 * impact);
    impulse(head, side * 80 * impact, away * 120 * impact);
    impulse(hip, side * 60 * impact, away * 100 * impact);
  } else if (deathType === DeathType.SPIN) {
    impulse(head, side * 160 * impact, 40);
    impulse(hip, -side * 140 * impact, 50);
    if (lFoot) impulse(lFoot, -side * 80, 30);
    if (rFoot) impulse(rFoot, side * 80, 30);
  } else {
    // flop / stall — cai mole no lugar
    const fall = Math.max(4, Math.min(18, Math.abs(velocityY) * 0.5 + 6));
    impulse(chest, side * 25, fall * 14);
    impulse(hip, -side * 20, fall * 18);
    if (lFoot) impulse(lFoot, 55, -15);
    if (rFoot) impulse(rFoot, -60, -15);
    if (lHand) impulse(lHand, -40, 25);
    if (rHand) impulse(rHand, 40, 25);
  }

  return {
    engine: "planck",
    world,
    alive: true,
    deathType,
    spikeSide,
    sideSpin: side,
    hangTimer,
    hangReleased,
    floorY,
    pinJoint,
    pinBody,
    spikeTipX: tipX,
    spikeTipY: tipY,
    severed: sev,
    bodies: {
      head,
      chest,
      hip,
      lShoulder,
      rShoulder,
      lHand,
      rHand,
      lKnee,
      rKnee,
      lFoot,
      rFoot,
    },
  };
}

function pos(body) {
  if (!body) return { x: 0, y: 0 };
  const p = body.getPosition();
  return { x: p.x, y: p.y };
}

export function stepRagdoll(ragdoll, dtNorm = 1) {
  if (!ragdoll?.alive || !ragdoll.world) return;

  const dtSec = Math.min(0.032, (dtNorm * 16.67) / 1000);
  const steps = dtSec > 0.02 ? 2 : 1;
  const h = dtSec / steps;
  for (let i = 0; i < steps; i++) {
    ragdoll.world.step(h, VEL_ITERS, POS_ITERS);
  }

  // HANG: pendura → solta → cai (sem virar impale)
  if (ragdoll.deathType === DeathType.HANG && !ragdoll.hangReleased) {
    ragdoll.hangTimer -= dtSec;
    if (ragdoll.hangTimer <= 0) {
      ragdoll.hangReleased = true;
      if (ragdoll.pinJoint) {
        ragdoll.world.destroyJoint(ragdoll.pinJoint);
        ragdoll.pinJoint = null;
      }
      const s = ragdoll.sideSpin || 1;
      const { head, chest, hip, lHand, rHand, lFoot, rFoot } = ragdoll.bodies;
      // queda rápida ao soltar (não "slow-mo")
      impulse(head, s * 20, 120);
      impulse(chest, s * 35, 220);
      impulse(hip, s * 45, 280);
      impulse(lHand, -50, 80);
      impulse(rHand, 50, 80);
      impulse(lFoot, -30, 100);
      impulse(rFoot, 30, 100);
    }
  }
}

export function ragdollSnapshot(ragdoll) {
  if (!ragdoll?.bodies) return null;
  const b = ragdoll.bodies;
  const sev = ragdoll.severed;
  const head = pos(b.head);
  const chest = pos(b.chest);
  const hip = pos(b.hip);
  const lShoulder = pos(b.lShoulder);
  const rShoulder = pos(b.rShoulder);
  return {
    head,
    chest,
    hip,
    lShoulder,
    rShoulder,
    lHand: b.lHand ? pos(b.lHand) : { x: lShoulder.x, y: lShoulder.y + 16 },
    rHand: b.rHand ? pos(b.rHand) : { x: rShoulder.x, y: rShoulder.y + 16 },
    lKnee: b.lKnee ? pos(b.lKnee) : { x: hip.x - 8, y: hip.y + 14 },
    rKnee: b.rKnee ? pos(b.rKnee) : { x: hip.x + 8, y: hip.y + 14 },
    lFoot: b.lFoot ? pos(b.lFoot) : { x: hip.x - 10, y: hip.y + 28 },
    rFoot: b.rFoot ? pos(b.rFoot) : { x: hip.x + 10, y: hip.y + 28 },
    severed: { ...sev },
    deathType: ragdoll.deathType,
  };
}

export function angleBetween(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

