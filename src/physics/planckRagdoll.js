/**
 * Ragdoll Planck — gravidade pixel-ok, spikes estáticos,
 * sangue em contato, kick no chão, impale secundário.
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

Settings.maxTranslation = 25;
Settings.maxTranslationSquared = 25 * 25;
Settings.maxRotation = 0.85 * Math.PI;
Settings.maxRotationSquared = (0.85 * Math.PI) ** 2;

const GRAVITY = 980;
const VEL_ITERS = 10;
const POS_ITERS = 4;
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

function box(world, x, y, hx, hy, density, userData = null) {
  const body = world.createBody({
    type: "dynamic",
    position: Vec2(x, y),
    linearDamping: 0.04,
    angularDamping: 0.22,
  });
  body.createFixture({
    shape: Box(hx, hy),
    density,
    friction: 0.55,
    restitution: 0.2,
    filter: NO_SELF,
  });
  if (userData) body.setUserData(userData);
  return body;
}

function circle(world, x, y, r, density, userData = null) {
  const body = world.createBody({
    type: "dynamic",
    position: Vec2(x, y),
    linearDamping: 0.04,
    angularDamping: 0.28,
  });
  body.createFixture({
    shape: Circle(r),
    density,
    friction: 0.4,
    restitution: 0.15,
    filter: NO_SELF,
  });
  if (userData) body.setUserData(userData);
  return body;
}

function impulse(body, ix, iy) {
  if (!body) return;
  body.applyLinearImpulse(Vec2(ix, iy), body.getWorldCenter(), true);
}

function addSpikeObstacles(world, obstacles) {
  if (!obstacles?.length) return [];
  const spikeBodies = [];
  for (const hb of obstacles) {
    if (!hb?.points || hb.points.length < 3) continue;
    try {
      const body = world.createBody({ type: "static" });
      body.createFixture({
        shape: Polygon(hb.points.map((p) => Vec2(p.x, p.y))),
        friction: 0.4,
        restitution: 0.05,
      });
      body.setUserData({
        kind: "spike",
        tip: hb.tip || null,
        side: hb.side || "bottom",
        region: hb.region || "tip",
      });
      spikeBodies.push(body);
    } catch (_) {}
  }
  return spikeBodies;
}

function setupContacts(ragdoll) {
  const world = ragdoll.world;
  world.on("begin-contact", (contact) => {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const ba = fa.getBody();
    const bb = fb.getBody();
    const ua = ba.getUserData && ba.getUserData();
    const ub = bb.getUserData && bb.getUserData();

    const spikeBody = ua?.kind === "spike" ? ba : ub?.kind === "spike" ? bb : null;
    const partBody = ua?.kind === "part" ? ba : ub?.kind === "part" ? bb : null;
    if (!spikeBody || !partBody) return;

    const spike = spikeBody.getUserData();
    const part = partBody.getUserData();
    const p = partBody.getPosition();
    const v = partBody.getLinearVelocity();
    const speed = Math.hypot(v.x, v.y);

    // sangue na batida
    if (typeof ragdoll.onBlood === "function" && speed > 40) {
      const count = Math.min(18, 4 + Math.floor(speed / 40));
      ragdoll.onBlood({
        x: p.x,
        y: p.y,
        count,
        power: Math.min(1.8, 0.6 + speed / 200),
      });
    }

    // impacto forte na ponta → impale secundário (solda peito/hip/head)
    if (
      !ragdoll.secondaryImpale &&
      ragdoll.hangReleased !== false &&
      speed > 120 &&
      (part.name === "chest" || part.name === "hip" || part.name === "head")
    ) {
      const tip = spike.tip || p;
      try {
        if (ragdoll.pinJoint) {
          world.destroyJoint(ragdoll.pinJoint);
          ragdoll.pinJoint = null;
        }
        partBody.setTransform(Vec2(tip.x, tip.y + (spike.side === "bottom" ? 12 : -8)), partBody.getAngle());
        const pin = world.createBody({
          type: "static",
          position: Vec2(tip.x, tip.y + (spike.side === "bottom" ? 12 : -8)),
        });
        ragdoll.pinJoint = world.createJoint(
          WeldJoint({
            bodyA: pin,
            bodyB: partBody,
            localAnchorA: Vec2(0, 0),
            localAnchorB: Vec2(0, 0),
            collideConnected: false,
            frequencyHz: 0,
            dampingRatio: 0,
          })
        );
        ragdoll.secondaryImpale = true;
        ragdoll.deathType = DeathType.IMPALE;
        if (typeof ragdoll.onBlood === "function") {
          ragdoll.onBlood({ x: tip.x, y: tip.y, count: 16, power: 1.6 });
        }
      } catch (_) {}
    }
  });
}

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

  const ground = world.createBody();
  ground.createFixture({
    shape: Edge(Vec2(-4000, floorY), Vec2(4000, floorY)),
    friction: 0.7,
    restitution: 0.25,
  });
  ground.setUserData({ kind: "floor" });
  world.createBody().createFixture(Edge(Vec2(-4000, ceilingY), Vec2(4000, ceilingY)));
  const maxX = typeof window !== "undefined" ? window.innerWidth - 16 : 900;
  world.createBody().createFixture(Edge(Vec2(16, -200), Vec2(16, floorY + 50)));
  world.createBody().createFixture(Edge(Vec2(maxX, -200), Vec2(maxX, floorY + 50)));

  addSpikeObstacles(world, opts.obstacles ?? []);

  let hx = x + 24;
  let hy = y + 12;
  if (deathType === DeathType.HANG) {
    hx = tipX;
    hy = tipY;
  } else if (deathType === DeathType.IMPALE) {
    hx = tipX;
    hy = spikeSide === "bottom" ? tipY + 14 - 18 : Math.max(30, tipY - 14) - 18;
  } else if (deathType === DeathType.IMPALE_LEG) {
    hx = tipX;
    hy = tipY - 50;
  }

  const headR = 13;
  const chestHX = 11;
  const chestHY = 11;
  const hipHX = 10;
  const hipHY = 8;

  const head = circle(world, hx, hy, headR, 1.0, { kind: "part", name: "head" });
  const chest = box(world, hx + side * 1, hy + headR + chestHY, chestHX, chestHY, 2.0, {
    kind: "part",
    name: "chest",
  });
  const hip = box(
    world,
    hx + side * 2,
    hy + headR + chestHY * 2 + hipHY + 2,
    hipHX,
    hipHY,
    1.8,
    { kind: "part", name: "hip" }
  );

  const lShoulder = box(world, hx - 14, hy + headR + 4, 5, 5, 0.55, {
    kind: "part",
    name: "lShoulder",
  });
  const rShoulder = box(world, hx + 14, hy + headR + 4, 5, 5, 0.55, {
    kind: "part",
    name: "rShoulder",
  });

  let lHand = null;
  let rHand = null;
  let lKnee = null;
  let rKnee = null;
  let lFoot = null;
  let rFoot = null;

  if (!sev.armLeft) {
    lHand = box(world, hx - 22, hy + headR + 22, 4, 10, 0.4, { kind: "part", name: "lHand" });
  }
  if (!sev.armRight) {
    rHand = box(world, hx + 22, hy + headR + 22, 4, 10, 0.4, { kind: "part", name: "rHand" });
  }
  if (!sev.legLeft) {
    lKnee = box(world, hx - 10, hip.getPosition().y + 16, 5, 9, 0.55, {
      kind: "part",
      name: "lKnee",
    });
    lFoot = box(world, hx - 11, hip.getPosition().y + 34, 5, 8, 0.45, {
      kind: "part",
      name: "lFoot",
    });
  }
  if (!sev.legRight) {
    rKnee = box(world, hx + 10, hip.getPosition().y + 16, 5, 9, 0.55, {
      kind: "part",
      name: "rKnee",
    });
    rFoot = box(world, hx + 11, hip.getPosition().y + 34, 5, 8, 0.45, {
      kind: "part",
      name: "rFoot",
    });
  }

  rev(world, head, chest, Vec2(0, headR - 1), Vec2(0, -chestHY), [-0.8, 0.8]);
  rev(world, chest, hip, Vec2(0, chestHY - 1), Vec2(0, -hipHY), [-0.5, 0.5]);
  rev(world, chest, lShoulder, Vec2(-chestHX + 2, -2), Vec2(4, 0), [-1.4, 1.4]);
  rev(world, chest, rShoulder, Vec2(chestHX - 2, -2), Vec2(-4, 0), [-1.4, 1.4]);
  if (lHand) rev(world, lShoulder, lHand, Vec2(0, 4), Vec2(0, -9), [-2.4, 0.6]);
  if (rHand) rev(world, rShoulder, rHand, Vec2(0, 4), Vec2(0, -9), [-0.6, 2.4]);
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

  if (deathType === DeathType.HANG) {
    pinBody = world.createBody({ type: "static", position: Vec2(tipX, tipY) });
    pinJoint = world.createJoint(
      RevoluteJoint({
        bodyA: pinBody,
        bodyB: head,
        localAnchorA: Vec2(0, 0),
        localAnchorB: Vec2(0, -headR + 2),
        collideConnected: false,
      })
    );
    hangTimer = 1.15;
    hangReleased = false;
    impulse(hip, side * 180 * impact, 20);
    impulse(chest, side * 80 * impact, 10);
    if (lFoot) impulse(lFoot, -side * 60, 40);
    if (rFoot) impulse(rFoot, side * 60, 40);
  } else if (deathType === DeathType.IMPALE) {
    const cy = spikeSide === "bottom" ? tipY + 16 : Math.max(30, tipY - 14);
    chest.setTransform(Vec2(tipX, cy), 0);
    head.setTransform(Vec2(tipX, cy - headR - chestHY), 0);
    hip.setTransform(Vec2(tipX + side * 3, cy + chestHY + hipHY), 0);
    pinBody = world.createBody({ type: "static", position: Vec2(tipX, cy) });
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
    if (lFoot) impulse(lFoot, -100 * impact, 60);
    if (rFoot) impulse(rFoot, 100 * impact, 60);
    if (lHand) impulse(lHand, -90 * impact, 40);
    if (rHand) impulse(rHand, 90 * impact, 40);
  } else if (deathType === DeathType.IMPALE_LEG) {
    const foot = lFoot || rFoot || hip;
    const fy = tipY + (spikeSide === "bottom" ? 4 : 0);
    foot.setTransform(Vec2(tipX, fy), 0);
    pinBody = world.createBody({ type: "static", position: Vec2(tipX, fy) });
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
  } else if (deathType === DeathType.BOUNCE) {
    const away = spikeSide === "top" ? 1 : -1;
    impulse(chest, side * 100 * impact, away * 160 * impact);
    impulse(head, side * 80 * impact, away * 120 * impact);
    impulse(hip, side * 60 * impact, away * 100 * impact);
  } else if (deathType === DeathType.SPIN) {
    impulse(head, side * 160 * impact, 40);
    impulse(hip, -side * 140 * impact, 50);
  } else {
    const fall = Math.max(4, Math.min(18, Math.abs(velocityY) * 0.5 + 6));
    impulse(chest, side * 25, fall * 14);
    impulse(hip, -side * 20, fall * 18);
    if (lFoot) impulse(lFoot, 55, -15);
    if (rFoot) impulse(rFoot, -60, -15);
  }

  const ragdoll = {
    engine: "planck",
    world,
    alive: true,
    deathType,
    spikeSide,
    sideSpin: side,
    hangTimer,
    hangReleased,
    floorKicked: false,
    secondaryImpale: deathType === DeathType.IMPALE || deathType === DeathType.IMPALE_LEG,
    floorY,
    pinJoint,
    pinBody,
    spikeTipX: tipX,
    spikeTipY: tipY,
    severed: sev,
    onBlood: opts.onBlood || null,
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

  setupContacts(ragdoll);
  return ragdoll;
}

function pos(body) {
  if (!body) return { x: 0, y: 0 };
  const p = body.getPosition();
  return { x: p.x, y: p.y };
}

function applyFloorKick(ragdoll) {
  if (ragdoll.floorKicked || ragdoll.secondaryImpale) return;
  const { hip, chest, head, lFoot, rFoot, lHand, rHand } = ragdoll.bodies;
  const hv = hip.getLinearVelocity();
  // só kick se estava caindo com força (impacto de queda)
  if (hv.y < 80) return;

  ragdoll.floorKicked = true;
  const s = ragdoll.sideSpin || 1;
  // kick leve tipo objeto caindo de alto
  impulse(hip, s * 25, -90);
  impulse(chest, s * 15, -50);
  impulse(head, s * 10, -30);
  if (lFoot) impulse(lFoot, 70 * s, -40);
  if (rFoot) impulse(rFoot, -75 * s, -45);
  if (lHand) impulse(lHand, -30 * s, -20);
  if (rHand) impulse(rHand, 30 * s, -20);

  if (typeof ragdoll.onBlood === "function") {
    const p = hip.getPosition();
    ragdoll.onBlood({ x: p.x, y: ragdoll.floorY - 4, count: 6, power: 0.7 });
  }
}

export function stepRagdoll(ragdoll, dtNorm = 1) {
  if (!ragdoll?.alive || !ragdoll.world) return;

  const dtSec = Math.min(0.032, (dtNorm * 16.67) / 1000);
  const steps = dtSec > 0.02 ? 2 : 1;
  const h = dtSec / steps;
  for (let i = 0; i < steps; i++) {
    ragdoll.world.step(h, VEL_ITERS, POS_ITERS);
  }

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
      impulse(head, s * 20, 120);
      impulse(chest, s * 35, 220);
      impulse(hip, s * 45, 280);
      impulse(lHand, -50, 80);
      impulse(rHand, 50, 80);
      impulse(lFoot, -30, 100);
      impulse(rFoot, 30, 100);
    }
  }

  // kick no chão
  if (!ragdoll.floorKicked && !ragdoll.secondaryImpale) {
    const hip = ragdoll.bodies.hip;
    const py = hip.getPosition().y;
    if (py >= ragdoll.floorY - 18) {
      applyFloorKick(ragdoll);
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

