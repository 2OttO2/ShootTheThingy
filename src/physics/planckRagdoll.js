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
  DistanceJoint,
  Settings,
} from "planck-js";
import { DeathType } from "../death/types.js";
import { SpatialHash } from "../utils/spatialHash.js";

Settings.maxTranslation = 25;
Settings.maxTranslationSquared = 25 * 25;
Settings.maxRotation = 0.85 * Math.PI;
Settings.maxRotationSquared = (0.85 * Math.PI) ** 2;

const GRAVITY = 520;
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
    linearDamping: 0.02,
    angularDamping: 0.18,
    allowSleep: false,
  });
  body.createFixture({
    shape: Box(hx, hy),
    density,
    friction: 0.25,
    restitution: 0.55,
    filter: NO_SELF,
  });
  if (userData) body.setUserData(userData);
  return body;
}

function circle(world, x, y, r, density, userData = null) {
  const body = world.createBody({
    type: "dynamic",
    position: Vec2(x, y),
    linearDamping: 0.02,
    angularDamping: 0.22,
    allowSleep: false,
  });
  body.createFixture({
    shape: Circle(r),
    density,
    friction: 0.2,
    restitution: 0.5,
    filter: NO_SELF,
  });
  if (userData) body.setUserData(userData);
  return body;
}

function impulse(body, ix, iy) {
  if (!body) return;
  body.applyLinearImpulse(Vec2(ix, iy), body.getWorldCenter(), true);
}

/**
 * Spikes no world Planck via spatial hash.
 * Inclui faixa vertical INTEIRA perto do X do player (teto + chão),
 * senão morte no topo não colide com spike de baixo.
 */
function addSpikeObstacles(world, obstacles, focusX = 320, focusY = 300) {
  if (!obstacles?.length) return [];

  const hash = new SpatialHash(96);
  for (const hb of obstacles) {
    if (!hb?.points || hb.points.length < 3) continue;
    let minX = hb.points[0].x,
      minY = hb.points[0].y,
      maxX = hb.points[0].x,
      maxY = hb.points[0].y;
    for (const p of hb.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    hash.insert({ minX, minY, maxX, maxY, ref: hb });
  }

  const viewH =
    typeof window !== "undefined" ? window.innerHeight : 800;
  // coluna larga em X, altura de tela inteira (+ margem)
  const halfW = 220;
  const near = hash.queryAabb(
    focusX - halfW,
    -80,
    focusX + halfW,
    viewH + 80
  );

  const spikeBodies = [];
  const seen = new Set();
  for (const item of near) {
    const hb = item.ref || item;
    if (!hb?.points || seen.has(hb)) continue;
    seen.add(hb);
    try {
      const body = world.createBody({ type: "static" });
      body.createFixture({
        shape: Polygon(hb.points.map((p) => Vec2(p.x, p.y))),
        friction: 0.55,
        restitution: 0.12,
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

/**
 * Recria os corpos estáticos dos spikes com as posições ATUAIS (os
 * spikes continuam andando depois da morte, então as posições
 * congeladas no momento da criação do ragdoll ficam erradas rapidinho).
 * Chamado periodicamente pelo stepRagdoll.
 */
function resyncSpikeObstacles(ragdoll) {
  const world = ragdoll.world;
  for (const b of ragdoll.spikeBodies || []) {
    try {
      world.destroyBody(b);
    } catch (_) {}
  }
  const focus = ragdoll.bodies?.hip?.getPosition?.() ?? { x: ragdoll.spikeTipX, y: ragdoll.spikeTipY };
  ragdoll.spikeBodies = addSpikeObstacles(world, ragdoll.obstacles ?? [], focus.x, focus.y);
}


/** Destroi joints ligados a um body (planck joint list). */
function destroyBodyJoints(world, body) {
  if (!world || !body) return;
  const toDestroy = [];
  let edge = body.getJointList && body.getJointList();
  while (edge) {
    if (edge.joint) toDestroy.push(edge.joint);
    edge = edge.next;
  }
  for (const j of toDestroy) {
    try {
      world.destroyJoint(j);
    } catch (_) {}
  }
}

/**
 * Impale em membro → separa do tronco (tronco/head ficam).
 * Retorna o body que fica preso no spike.
 */
function severLimbOnImpale(ragdoll, partName) {
  const b = ragdoll.bodies;
  const world = ragdoll.world;
  if (!b || !world) return null;

  const mark = (side) => {
    if (ragdoll.severed) ragdoll.severed[side] = true;
  };

  // perna esquerda: solta hip↔knee (cadeia knee+foot livre, presa no spike)
  if (partName === "lFoot" || partName === "lKnee") {
    if (b.lKnee) destroyBodyJoints(world, b.lKnee);
    // recria só knee↔foot se ambos existem
    if (b.lKnee && b.lFoot) {
      try {
        world.createJoint(
          RevoluteJoint({
            bodyA: b.lKnee,
            bodyB: b.lFoot,
            localAnchorA: Vec2(0, 8),
            localAnchorB: Vec2(0, -7),
            collideConnected: false,
          })
        );
      } catch (_) {}
    }
    mark("legLeft");
    return partName === "lFoot" && b.lFoot ? b.lFoot : b.lKnee;
  }
  if (partName === "rFoot" || partName === "rKnee") {
    if (b.rKnee) destroyBodyJoints(world, b.rKnee);
    if (b.rKnee && b.rFoot) {
      try {
        world.createJoint(
          RevoluteJoint({
            bodyA: b.rKnee,
            bodyB: b.rFoot,
            localAnchorA: Vec2(0, 8),
            localAnchorB: Vec2(0, -7),
            collideConnected: false,
          })
        );
      } catch (_) {}
    }
    mark("legRight");
    return partName === "rFoot" && b.rFoot ? b.rFoot : b.rKnee;
  }
  // braços
  if (partName === "lHand" || partName === "lShoulder") {
    if (b.lHand) destroyBodyJoints(world, b.lHand);
    if (b.lShoulder) {
      // só remove joint shoulder–chest / shoulder–hand
      destroyBodyJoints(world, b.lShoulder);
      // re-liga shoulder ao chest? não — membro solto
    }
    mark("armLeft");
    return b.lHand || b.lShoulder;
  }
  if (partName === "rHand" || partName === "rShoulder") {
    if (b.rHand) destroyBodyJoints(world, b.rHand);
    if (b.rShoulder) destroyBodyJoints(world, b.rShoulder);
    mark("armRight");
    return b.rHand || b.rShoulder;
  }
  return null;
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

    // contato com spike APÓS a morte (ex: caiu do teto no de baixo)
    // — reage mesmo sem ser "impale primário"
    const canSecondary =
      !ragdoll.secondaryImpale &&
      ragdoll.hangReleased !== false &&
      speed > 55;

    if (canSecondary) {
      const tip = spike.tip || p;
      const isTorso =
        part.name === "chest" ||
        part.name === "hip" ||
        part.name === "head";
      const isLeg =
        part.name === "lFoot" ||
        part.name === "rFoot" ||
        part.name === "lKnee" ||
        part.name === "rKnee";

      // impulso de reação sempre (bateu no spike)
      const nx = p.x - (tip.x || p.x);
      const push = nx >= 0 ? 1 : -1;
      partBody.applyLinearImpulse(
        Vec2(push * 40 + 30, spike.side === "bottom" ? -80 : 60),
        partBody.getWorldCenter(),
        true
      );

      // engate secundário: tronco gruda; MEMBRO é amputado e fica no spike
      const isArm =
        part.name === "lHand" ||
        part.name === "rHand" ||
        part.name === "lShoulder" ||
        part.name === "rShoulder";

      if (speed > 70 && (isTorso || isLeg || isArm)) {
        try {
          if (ragdoll.pinJoint) {
            world.destroyJoint(ragdoll.pinJoint);
            ragdoll.pinJoint = null;
          }

          let pinTarget = partBody;

          // membro → separa do corpo; tronco/head NÃO amputam
          if (isLeg || isArm) {
            const detached = severLimbOnImpale(ragdoll, part.name);
            if (detached) pinTarget = detached;
          }

          const pinY =
            tip.y + (spike.side === "bottom" ? 10 : -8);
          const pin = world.createBody({
            type: "static",
            position: Vec2(tip.x, pinY),
          });
          const ap = pinTarget.getPosition();
          const len = Math.max(
            6,
            Math.min(22, Math.hypot(ap.x - tip.x, ap.y - pinY))
          );
          // membro amputado fica preso; corpo segue a física livre
          ragdoll.pinJoint = world.createJoint(
            DistanceJoint({
              bodyA: pin,
              bodyB: pinTarget,
              localAnchorA: Vec2(0, 0),
              localAnchorB: Vec2(0, 0),
              length: len,
              frequencyHz: isTorso ? 5 : 8,
              dampingRatio: 0.75,
              collideConnected: false,
            })
          );
          ragdoll.pinBody = pin;
          ragdoll.attachBody = pinTarget;
          ragdoll.breakForce = isTorso ? 260 + speed : 9999; // membro fica no spike
          ragdoll.hangReleased = isTorso ? false : true; // membro: não "hang" do corpo
          ragdoll.hangTimer = 0;
          ragdoll.secondaryImpale = true;
          ragdoll.deathType = isLeg || isArm
            ? DeathType.IMPALE_LEG
            : DeathType.IMPALE;
          if (typeof ragdoll.onBlood === "function") {
            ragdoll.onBlood({
              x: tip.x,
              y: tip.y,
              count: 12,
              power: 1.1,
            });
          }
        } catch (_) {}
      }
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
    friction: 0.45,
    restitution: 0.7,
  });
  ground.setUserData({ kind: "floor" });
  const ceiling = world.createBody();
  ceiling.createFixture({
    shape: Edge(Vec2(-4000, ceilingY), Vec2(4000, ceilingY)),
    friction: 0.25,
    restitution: 0.65,
  });
  ceiling.setUserData({ kind: "ceiling" });
  const maxX = typeof window !== "undefined" ? window.innerWidth - 16 : 900;
  world.createBody().createFixture(Edge(Vec2(16, -200), Vec2(16, floorY + 50)));
  world.createBody().createFixture(Edge(Vec2(maxX, -200), Vec2(maxX, floorY + 50)));

  const initialSpikeBodies = addSpikeObstacles(world, opts.obstacles ?? [], x + 24, y + 32);

  // SEMPRE spawna onde o player morreu — zero teleporte pra ponta
  let hx = x + 24;
  let hy = y + 12;

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
  let attachBody = null;
  let breakForce = 0;

  /**
   * Contato emergente: prende a PARTE atingida na ponta com mola quebrável.
   * Momentum real → torque → solta quando a força estoura.
   * Sem teleporte, sem animação fixa por DeathType.
   */
  const bodyPart = opts.bodyPart || opts.event?.bodyPart || "torso";
  const region = opts.region || "tip";
  const absVy = Math.abs(velocityY || 0);
  const spd = Math.abs(opts.moveSpeed || 0);

  function pickAttach(part) {
    if (part === "head") return head;
    if (part === "legs") {
      if (offsetX < 0 && lFoot) return lFoot;
      if (offsetX >= 0 && rFoot) return rFoot;
      return lFoot || rFoot || hip;
    }
    if (part === "arms") {
      if (offsetX < 0) return lHand || lShoulder;
      return rHand || rShoulder;
    }
    // torso / default
    return chest;
  }

  // Só engata se houve ponta de spike (contato localizado)
  const hasTip =
    Number.isFinite(tipX) &&
    Number.isFinite(tipY) &&
    (deathType === DeathType.HANG ||
      deathType === DeathType.IMPALE ||
      deathType === DeathType.IMPALE_LEG ||
      deathType === DeathType.SPIN ||
      region === "tip");

  if (hasTip && deathType !== DeathType.STALL && deathType !== DeathType.FLOP) {
    attachBody = pickAttach(bodyPart);
    // FLOP base = contato largo: sem pin, só física livre
  }

  // Base larga / stall: sem pin
  if (deathType === DeathType.FLOP || deathType === DeathType.STALL) {
    attachBody = null;
  }

  if (attachBody) {
    // se o contato foi em membro, separa do tronco ANTES de prender no spike
    const attachName = attachBody.getUserData && attachBody.getUserData()?.name;
    if (
      attachName &&
      attachName !== "chest" &&
      attachName !== "hip" &&
      attachName !== "head"
    ) {
      // precisa do objeto ragdoll parcial — marca severed no opts
      const fakeRd = { bodies: { head, chest, hip, lShoulder, rShoulder, lHand, rHand, lKnee, rKnee, lFoot, rFoot }, world, severed: sev };
      const det = severLimbOnImpale(fakeRd, attachName);
      if (det) attachBody = det;
      // membro fica no spike; não solta fácil
      breakForce = 9999;
    }
    pinBody = world.createBody({ type: "static", position: Vec2(tipX, tipY) });
    const ap = attachBody.getPosition();
    // comprimento = distância atual (zero snap)
    let ropeLen = Math.hypot(ap.x - tipX, ap.y - tipY);
    // contato na ponta: engate curto o bastante pra "prender", sem TP
    if (region === "tip") {
      ropeLen = Math.min(ropeLen, 18);
      ropeLen = Math.max(6, ropeLen);
    } else {
      ropeLen = Math.max(10, Math.min(ropeLen, 36));
    }

    // quanto mais rápido, mais firme o engate — mas ainda quebrável
    const firm = 2.5 + Math.min(5, absVy / 6 + spd / 4);
    pinJoint = world.createJoint(
      DistanceJoint({
        bodyA: pinBody,
        bodyB: attachBody,
        localAnchorA: Vec2(0, 0),
        localAnchorB: Vec2(0, 0),
        length: ropeLen,
        frequencyHz: firm,
        dampingRatio: 0.45,
        collideConnected: false,
      })
    );
    hangReleased = false;
    // força de ruptura ∝ velocidade: full speed estoura mais fácil após o torque
    breakForce = 180 + absVy * 25 + spd * 18;
    // leve impulso residual só no sentido do movimento (não script de animação)
    // a rotação vem do torque do engate + vel herdada
  }

  // Velocidade herdada do arcade — a reação sai DAQUI, não de impulse por tipo
  {
    const carryVy = (velocityY || 0) * 30;
    // mundo rola pra esquerda ⇒ personagem "voa" pra direita relativo
    const carryVx = 35 + Math.abs(opts.moveSpeed || 0) * 16;
    const spin = (opts.spin || 0) * 0.9;
    const allBodies = [
      head, chest, hip, lShoulder, rShoulder,
      lHand, rHand, lKnee, rKnee, lFoot, rFoot,
    ].filter(Boolean);
    for (const b of allBodies) {
      const cur = b.getLinearVelocity();
      const vx = Math.max(cur.x, 0) + carryVx;
      b.setLinearVelocity(Vec2(vx, cur.y + carryVy));
      if (spin) b.setAngularVelocity(b.getAngularVelocity() + spin);
    }
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
    breakForce,
    attachBody,
    floorKicked: false,
    secondaryImpale: deathType === DeathType.IMPALE || deathType === DeathType.IMPALE_LEG,
    floorY,
    pinJoint,
    pinBody,
    spikeTipX: tipX,
    spikeTipY: tipY,
    severed: sev,
    onBlood: opts.onBlood || null,
    spikeBodies: initialSpikeBodies,
    obstacles: opts.obstacles ?? [],
    resyncTimer: 0,
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
  // aceita vy positivo (caindo) ou já refletido (bounce acabou de inverter)
  if (Math.abs(hv.y) < 80) return;

  ragdoll.floorKicked = true;
  // kick pro alto e pra DIREITA (direção oposta à queda)
  impulse(hip, 55, -160);
  impulse(chest, 40, -95);
  impulse(head, 25, -55);
  if (lFoot) impulse(lFoot, 45, -70);
  if (rFoot) impulse(rFoot, 60, -75);
  if (lHand) impulse(lHand, 30, -25);
  if (rHand) impulse(rHand, 45, -25);

  if (typeof ragdoll.onBlood === "function") {
    const p = hip.getPosition();
    ragdoll.onBlood({ x: p.x, y: ragdoll.floorY - 4, count: 6, power: 0.7 });
  }
}

export function stepRagdoll(ragdoll, dtNorm = 1, moveSpeed = 0) {
  if (!ragdoll?.alive || !ragdoll.world) return;

  const dtSec = Math.min(0.032, (dtNorm * 16.67) / 1000);

  // Os spikes-obstáculo do mundo físico (Planck) são criados uma vez, na
  // hora da morte, mas os espetos de verdade continuam andando na tela
  // depois disso (App.jsx). Sem isso, o corpo fica flutuando num mundo
  // com espetos "fantasmas" parados no lugar antigo — colisão nunca
  // mais acontece com nenhum espeto novo que passe por ele.
  ragdoll.resyncTimer = (ragdoll.resyncTimer || 0) + dtSec;
  if (ragdoll.resyncTimer > 0.12) {
    ragdoll.resyncTimer = 0;
    resyncSpikeObstacles(ragdoll);
  }

  // NÃO arrasta pin/corpos do ragdoll pelo eixo X com o scroll do mapa —
  // isso sugava o corpo pro canto esquerdo. Os espetos de verdade (e os
  // corpos físicos deles no Planck, via resyncSpikeObstacles acima)
  // continuam andando; é a colisão que reencontra o corpo, não o
  // contrário.

  const steps = dtSec > 0.02 ? 2 : 1;
  const h = dtSec / steps;
  for (let i = 0; i < steps; i++) {
    ragdoll.world.step(h, VEL_ITERS, POS_ITERS);
  }

  // ruptura emergente do engate (força da joint × velocidade)
  if (ragdoll.pinJoint && !ragdoll.hangReleased) {
    let mag = 0;
    try {
      const invDt = 1 / Math.max(dtSec, 1 / 120);
      const rf = ragdoll.pinJoint.getReactionForce(invDt);
      mag = Math.hypot(rf.x, rf.y);
    } catch (_) {
      // fallback: tensão pela distância
      if (ragdoll.pinBody && ragdoll.attachBody) {
        const a = ragdoll.pinBody.getPosition();
        const b = ragdoll.attachBody.getPosition();
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const v = ragdoll.attachBody.getLinearVelocity();
        mag = d * 40 + Math.hypot(v.x, v.y) * 8;
      }
    }
    // tempo mínimo minúsculo pra não soltar no mesmo frame do engate
    ragdoll.hangTimer = (ragdoll.hangTimer || 0) + dtSec;
    const minHold = 0.08;
    const limit = ragdoll.breakForce || 400;
    if (ragdoll.hangTimer > minHold && mag > limit) {
      ragdoll.hangReleased = true;
      // solta de vez: permite reagir/empalar de novo em outro spike
      ragdoll.secondaryImpale = false;
      try {
        ragdoll.world.destroyJoint(ragdoll.pinJoint);
      } catch (_) {}
      ragdoll.pinJoint = null;
      // sem impulso scriptado — o corpo já carrega vel/torque do engate
    }
    // segurança: se ficou preso demais, solta
    if (ragdoll.hangTimer > 2.8 && ragdoll.pinJoint) {
      ragdoll.hangReleased = true;
      ragdoll.secondaryImpale = false;
      try {
        ragdoll.world.destroyJoint(ragdoll.pinJoint);
      } catch (_) {}
      ragdoll.pinJoint = null;
    }
  }

  // Bounce explícito no chão/teto — restitution sozinha não basta
  // (fricção + vários contatos matam a energia). Reflete vy com retenção.
  {
    const floorY = ragdoll.floorY;
    const ceilingY = 8;
    const BOUNCE_KEEP = 0.72;
    const MIN_IMPACT = 40;
    const parts = Object.values(ragdoll.bodies).filter(Boolean);

    for (const b of parts) {
      const p = b.getPosition();
      const v = b.getLinearVelocity();
      // chão
      if (p.y >= floorY - 14 && v.y > MIN_IMPACT) {
        b.setLinearVelocity(Vec2(v.x * 0.92, -v.y * BOUNCE_KEEP));
        b.setAwake(true);
        if (p.y > floorY - 6) {
          b.setTransform(Vec2(p.x, floorY - 8), b.getAngle());
        }
      }
      // teto
      if (p.y <= ceilingY + 14 && v.y < -MIN_IMPACT) {
        b.setLinearVelocity(Vec2(v.x * 0.92, -v.y * BOUNCE_KEEP));
        b.setAwake(true);
        if (p.y < ceilingY + 6) {
          b.setTransform(Vec2(p.x, ceilingY + 8), b.getAngle());
        }
      }
    }

    // kick extra no primeiro impacto forte no chão
    if (!ragdoll.floorKicked) {
      const hip = ragdoll.bodies.hip;
      const py = hip.getPosition().y;
      const vy = hip.getLinearVelocity().y;
      if (py >= floorY - 18 && Math.abs(vy) > 100) {
        applyFloorKick(ragdoll);
      }
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
