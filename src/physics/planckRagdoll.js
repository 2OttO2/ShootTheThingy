/**
 * Ragdoll com Planck.js (Box2D).
 * API compatível: createRagdoll / stepRagdoll / ragdollSnapshot / angleBetween / dist
 *
 * Unidades = pixels (Y pra baixo). Gravity positiva em Y.
 */
import {
  World,
  Vec2,
  Box,
  Circle,
  Edge,
  RevoluteJoint,
  WeldJoint,
} from "planck-js";
import { DeathType } from "../death/types.js";

const GRAVITY = 55;
const TIME_STEP = 1 / 60;
const VEL_ITERS = 8;
const POS_ITERS = 3;

function jointAt(world, a, b, ax, ay, limits = null) {
  const def = {
    bodyA: a,
    bodyB: b,
    localAnchorA: a.getLocalPoint(Vec2(ax, ay)),
    localAnchorB: b.getLocalPoint(Vec2(ax, ay)),
    collideConnected: false,
  };
  if (limits) {
    def.enableLimit = true;
    def.lowerAngle = limits[0];
    def.upperAngle = limits[1];
  }
  return world.createJoint(RevoluteJoint(def));
}

function makeBox(world, x, y, hx, hy, density, opts = {}) {
  const body = world.createBody({
    type: "dynamic",
    position: Vec2(x, y),
    angle: 0,
    linearDamping: opts.linearDamping ?? 0.15,
    angularDamping: opts.angularDamping ?? 0.4,
    fixedRotation: !!opts.fixedRotation,
  });
  body.createFixture({
    shape: Box(hx, hy),
    density,
    friction: opts.friction ?? 0.45,
    restitution: opts.restitution ?? 0.15,
    filter: opts.filter ?? { groupIndex: -1 }, // membros não colidem entre si
  });
  return body;
}

function makeCircle(world, x, y, r, density, opts = {}) {
  const body = world.createBody({
    type: "dynamic",
    position: Vec2(x, y),
    linearDamping: opts.linearDamping ?? 0.15,
    angularDamping: opts.angularDamping ?? 0.5,
  });
  body.createFixture({
    shape: Circle(r),
    density,
    friction: opts.friction ?? 0.4,
    restitution: opts.restitution ?? 0.1,
    filter: opts.filter ?? { groupIndex: -1 },
  });
  return body;
}

/**
 * Cria mundo + esqueleto + aplica morte.
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
  const impact = Math.max(0.85, Math.min(1.8, opts.impact ?? opts.event?.impact ?? 1));
  const velocityY = opts.velocityY ?? opts.event?.velocityY ?? 0;
  const sideSpin = offsetX >= 0 ? 1 : -1;

  const sev = {
    legLeft: !!opts.severed?.legLeft,
    legRight: !!opts.severed?.legRight,
    armLeft: !!opts.severed?.armLeft,
    armRight: !!opts.severed?.armRight,
  };

  const world = World(Vec2(0, GRAVITY));

  // chão + teto estáticos
  const ground = world.createBody();
  ground.createFixture(Edge(Vec2(-2000, floorY), Vec2(4000, floorY)));
  const ceiling = world.createBody();
  ceiling.createFixture(Edge(Vec2(-2000, ceilingY), Vec2(4000, ceilingY)));

  // paredes leves
  const wallL = world.createBody();
  wallL.createFixture(Edge(Vec2(20, -500), Vec2(20, floorY + 100)));
  const wallR = world.createBody();
  const maxX = typeof window !== "undefined" ? window.innerWidth - 20 : 800;
  wallR.createFixture(Edge(Vec2(maxX, -500), Vec2(maxX, floorY + 100)));

  const cx = x + 24;
  const top = y;

  // --- corpos (centros) ---
  const head = makeCircle(world, cx, top + 12, 13, 0.9);
  const chest = makeBox(world, cx, top + 30, 11, 10, 1.6);
  const hip = makeBox(world, cx, top + 50, 10, 8, 1.4);

  const lShoulder = makeBox(world, cx - 14, top + 28, 5, 5, 0.5);
  const rShoulder = makeBox(world, cx + 14, top + 28, 5, 5, 0.5);

  let lHand = null;
  let rHand = null;
  let lKnee = null;
  let rKnee = null;
  let lFoot = null;
  let rFoot = null;

  if (!sev.armLeft) {
    lHand = makeBox(world, cx - 20, top + 48, 4, 9, 0.35);
  }
  if (!sev.armRight) {
    rHand = makeBox(world, cx + 20, top + 48, 4, 9, 0.35);
  }
  if (!sev.legLeft) {
    lKnee = makeBox(world, cx - 9, top + 64, 5, 8, 0.5);
    lFoot = makeBox(world, cx - 10, top + 80, 5, 7, 0.4);
  }
  if (!sev.legRight) {
    rKnee = makeBox(world, cx + 9, top + 64, 5, 8, 0.5);
    rFoot = makeBox(world, cx + 10, top + 80, 5, 7, 0.4);
  }

  // --- joints (limites de ângulo = feeling HW) ---
  jointAt(world, head, chest, cx, top + 20, [-0.7, 0.7]);
  jointAt(world, chest, hip, cx, top + 40, [-0.4, 0.4]);
  jointAt(world, chest, lShoulder, cx - 10, top + 28, [-1.2, 1.2]);
  jointAt(world, chest, rShoulder, cx + 10, top + 28, [-1.2, 1.2]);

  if (lHand) jointAt(world, lShoulder, lHand, cx - 16, top + 38, [-2.2, 0.5]);
  if (rHand) jointAt(world, rShoulder, rHand, cx + 16, top + 38, [-0.5, 2.2]);
  if (lKnee) {
    jointAt(world, hip, lKnee, cx - 8, top + 56, [-0.2, 2.0]);
    jointAt(world, lKnee, lFoot, cx - 9, top + 72, [-0.1, 2.2]);
  }
  if (rKnee) {
    jointAt(world, hip, rKnee, cx + 8, top + 56, [-2.0, 0.2]);
    jointAt(world, rKnee, rFoot, cx + 9, top + 72, [-2.2, 0.1]);
  }

  // impulso base da queda
  const fall = Math.max(0.5, Math.min(8, Math.abs(velocityY) * 0.35 + 2));
  const bodies = [head, chest, hip, lShoulder, rShoulder];
  if (lHand) bodies.push(lHand);
  if (rHand) bodies.push(rHand);
  if (lKnee) bodies.push(lKnee, lFoot);
  if (rKnee) bodies.push(rKnee, rFoot);

  for (const b of bodies) {
    b.setLinearVelocity(Vec2(sideSpin * 0.5 * impact, fall * 0.4));
  }

  // âncora estática pro pin (hang / impale)
  let pinJoint = null;
  let pinBody = null;
  let hangTimer = 0;
  let hangReleased = true;

  if (deathType === DeathType.HANG) {
    pinBody = world.createBody({ type: "static", position: Vec2(tipX, tipY) });
    pinJoint = world.createJoint(
      RevoluteJoint(
        {
          collideConnected: false,
          enableLimit: false,
        },
        pinBody,
        head,
        Vec2(tipX, tipY)
      )
    );
    hangTimer = 1.1;
    hangReleased = false;
    hip.applyLinearImpulse(Vec2(sideSpin * 120 * impact, 40), hip.getWorldCenter(), true);
    if (lFoot) lFoot.applyLinearImpulse(Vec2(-sideSpin * 40, 30), lFoot.getWorldCenter(), true);
    if (rFoot) rFoot.applyLinearImpulse(Vec2(sideSpin * 40, 30), rFoot.getWorldCenter(), true);
  } else if (deathType === DeathType.IMPALE) {
    const cy = spikeSide === "bottom" ? tipY + 14 : Math.max(28, tipY - 14);
    pinBody = world.createBody({ type: "static", position: Vec2(tipX, cy) });
    pinJoint = world.createJoint(
      WeldJoint(
        {
          collideConnected: false,
          frequencyHz: 0,
          dampingRatio: 0,
        },
        pinBody,
        chest,
        Vec2(tipX, cy)
      )
    );
    if (lFoot) lFoot.applyLinearImpulse(Vec2(-80 * impact, 50), lFoot.getWorldCenter(), true);
    if (rFoot) rFoot.applyLinearImpulse(Vec2(80 * impact, 50), rFoot.getWorldCenter(), true);
    if (lHand) lHand.applyLinearImpulse(Vec2(-60 * impact, 20), lHand.getWorldCenter(), true);
    if (rHand) rHand.applyLinearImpulse(Vec2(60 * impact, 20), rHand.getWorldCenter(), true);
  } else if (deathType === DeathType.IMPALE_LEG) {
    const foot = lFoot || rFoot || hip;
    pinBody = world.createBody({ type: "static", position: Vec2(tipX, tipY) });
    pinJoint = world.createJoint(
      RevoluteJoint({ collideConnected: false }, pinBody, foot, Vec2(tipX, tipY))
    );
    head.applyLinearImpulse(Vec2(sideSpin * 100 * impact, 40), head.getWorldCenter(), true);
    chest.applyLinearImpulse(Vec2(sideSpin * 80 * impact, 50), chest.getWorldCenter(), true);
  } else if (deathType === DeathType.BOUNCE) {
    const away = spikeSide === "top" ? 1 : -1;
    chest.applyLinearImpulse(
      Vec2(sideSpin * 90 * impact, away * 140 * impact),
      chest.getWorldCenter(),
      true
    );
  } else if (deathType === DeathType.SPIN) {
    head.applyLinearImpulse(Vec2(sideSpin * 140 * impact, fall * 5), head.getWorldCenter(), true);
    hip.applyLinearImpulse(Vec2(-sideSpin * 100 * impact, fall * 5), hip.getWorldCenter(), true);
  } else {
    // flop / stall
    hip.applyLinearImpulse(Vec2(sideSpin * 30, fall * 8), hip.getWorldCenter(), true);
    if (lFoot) lFoot.applyLinearImpulse(Vec2(50, -20), lFoot.getWorldCenter(), true);
    if (rFoot) rFoot.applyLinearImpulse(Vec2(-55, -20), rFoot.getWorldCenter(), true);
  }

  return {
    engine: "planck",
    world,
    alive: true,
    deathType,
    spikeSide,
    sideSpin,
    hangTimer,
    hangReleased,
    floorKicked: false,
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
    // compat: stepBody antigo olhava points — snapshot monta a partir dos bodies
    parts: null,
  };
}

function bodyPos(body) {
  if (!body) return { x: 0, y: 0 };
  const p = body.getPosition();
  return { x: p.x, y: p.y };
}

export function stepRagdoll(ragdoll, dtNorm = 1) {
  if (!ragdoll || !ragdoll.alive || !ragdoll.world) return;

  const dtSec = Math.min(0.033, (dtNorm * 16.67) / 1000);
  // substeps se frame longo
  const steps = dtSec > 0.02 ? 2 : 1;
  const h = dtSec / steps;
  for (let i = 0; i < steps; i++) {
    ragdoll.world.step(h, VEL_ITERS, POS_ITERS);
  }

  // hang: solta depois do timer
  if (ragdoll.deathType === DeathType.HANG && !ragdoll.hangReleased) {
    ragdoll.hangTimer -= dtSec;
    if (ragdoll.hangTimer <= 0) {
      ragdoll.hangReleased = true;
      if (ragdoll.pinJoint) {
        ragdoll.world.destroyJoint(ragdoll.pinJoint);
        ragdoll.pinJoint = null;
      }
      const { head, chest, hip } = ragdoll.bodies;
      head.applyLinearImpulse(Vec2(ragdoll.sideSpin * 20, 80), head.getWorldCenter(), true);
      chest.applyLinearImpulse(Vec2(ragdoll.sideSpin * 30, 100), chest.getWorldCenter(), true);
      hip.applyLinearImpulse(Vec2(ragdoll.sideSpin * 40, 120), hip.getWorldCenter(), true);
    }
  }
}

export function ragdollSnapshot(ragdoll) {
  if (!ragdoll?.bodies) return null;
  const b = ragdoll.bodies;
  const sev = ragdoll.severed;

  const head = bodyPos(b.head);
  const chest = bodyPos(b.chest);
  const hip = bodyPos(b.hip);
  const lShoulder = bodyPos(b.lShoulder);
  const rShoulder = bodyPos(b.rShoulder);
  const lHand = b.lHand ? bodyPos(b.lHand) : { x: lShoulder.x, y: lShoulder.y + 16 };
  const rHand = b.rHand ? bodyPos(b.rHand) : { x: rShoulder.x, y: rShoulder.y + 16 };
  const lKnee = b.lKnee ? bodyPos(b.lKnee) : { x: hip.x - 8, y: hip.y + 14 };
  const rKnee = b.rKnee ? bodyPos(b.rKnee) : { x: hip.x + 8, y: hip.y + 14 };
  const lFoot = b.lFoot ? bodyPos(b.lFoot) : { x: lKnee.x, y: lKnee.y + 14 };
  const rFoot = b.rFoot ? bodyPos(b.rFoot) : { x: rKnee.x, y: rKnee.y + 14 };

  return {
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

