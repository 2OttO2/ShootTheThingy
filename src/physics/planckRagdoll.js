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
} from "planck";
import { DeathType } from "../death/types.js";
import { SpatialHash } from "../utils/spatialHash.js";

Settings.maxTranslation = 25;
Settings.maxTranslationSquared = 25 * 25;
Settings.maxRotation = 0.85 * Math.PI;
Settings.maxRotationSquared = (0.85 * Math.PI) ** 2;

const GRAVITY = 520;
const VEL_ITERS = 10;
const POS_ITERS = 4;

// Categorias de colisão: usadas pra, no momento do empalamento,
// desligar a colisão SÓ do membro atingido contra os espetos — sem
// isso o joint puxa o membro pra dentro do espeto enquanto a física
// de colisão sólida empurra ele pra fora ao mesmo tempo, e o resultado
// é um tremor/vibração no ponto de encaixe (nada natural).
const CATEGORY_PART = 0x0001;
const CATEGORY_SPIKE = 0x0002;
const PART_FILTER = {
  groupIndex: -1,
  categoryBits: CATEGORY_PART,
  maskBits: 0xffff,
};

function disableSpikeCollision(body) {
  if (!body) return;
  let fx = body.getFixtureList && body.getFixtureList();
  while (fx) {
    try {
      fx.setFilterData({
        groupIndex: -1,
        categoryBits: CATEGORY_PART,
        maskBits: 0xffff & ~CATEGORY_SPIKE,
      });
    } catch (_e) {
      // ignore
    }
    fx = fx.getNext ? fx.getNext() : null;
  }
}

function enableSpikeCollision(body) {
  if (!body) return;
  let fx = body.getFixtureList && body.getFixtureList();
  while (fx) {
    try {
      fx.setFilterData({ ...PART_FILTER });
    } catch (_e) {
      // ignore
    }
    fx = fx.getNext ? fx.getNext() : null;
  }
}

function disableSpikeCollisionMany(bodies) {
  for (const b of bodies) disableSpikeCollision(b);
}

function enableSpikeCollisionMany(bodies) {
  for (const b of bodies) enableSpikeCollision(b);
}

// Só esses tipos representam um empalamento de verdade (corpo preso na
// ponta). FLOP/SPIN/BOUNCE são reações de "bateu e continuou" — não
// devem prender o corpo no espeto, senão toda morte vira impale.
const IMPALE_TYPES = new Set([
  DeathType.HANG,
  DeathType.IMPALE,
  DeathType.IMPALE_LEG,
]);

// Extremidades (mão/pé/joelho/ombro): carne fina, o espeto atravessa e
// prende de vez — não soltam durante a animação de morte.
// Núcleo (cabeça/peito/quadril): mais massa, pode rasgar e soltar do
// espeto se o impacto for forte o suficiente.
const EXTREMITY_PARTS = new Set([
  "lHand",
  "rHand",
  "lFoot",
  "rFoot",
  "lKnee",
  "rKnee",
  "lShoulder",
  "rShoulder",
]);
function isExtremityPart(part) {
  return EXTREMITY_PARTS.has(part);
}

const EMBED_DEPTH = 12;
const NEAR_TIP = 36; // px — abaixo disso considera "já no espeto"

// Meia-altura (local, eixo Y) de cada parte — usada pra ancorar o pino
// numa borda bem definida do corpo (não "onde ele calhou de estar"),
// garantindo que a ponta do espeto sempre encoste, sem gap e sem
// afundar demais dentro do próprio espeto. Compartilhada entre a
// criação do ragdoll e o acompanhamento por frame (spikes que rolam).
const PART_HALF_Y = {
  head: 13,
  chest: 11,
  hip: 8,
  lShoulder: 5,
  rShoulder: 5,
  lHand: 10,
  rHand: 10,
  lKnee: 9,
  rKnee: 9,
  lFoot: 8,
  rFoot: 8,
};

/**
 * Trava attachBody num pino RÍGIDO (RevoluteJoint) numa borda bem
 * definida do corpo, alinhada ao ponto (pinX,pinY). Destrói qualquer
 * joint anterior. Usada tanto na criação do impale quanto depois,
 * quando o acompanhamento por frame detecta que o corpo finalmente
 * chegou perto o bastante da ponta pra travar de vez (evita ficar
 * preso numa mola frouxa pra sempre — a causa do "flutua sem tocar").
 */
function rigidPinAt(world, ragdoll, attachBody, pinX, pinY, spikeSide, bodyPart, embedDepth) {
  if (ragdoll.pinJoint) {
    try {
      ragdoll.world.destroyJoint(ragdoll.pinJoint);
    } catch (_e) {
      // ignore
    }
  }
  if (ragdoll.pinBody) {
    try {
      ragdoll.world.destroyBody(ragdoll.pinBody);
    } catch (_e) {
      // ignore
    }
  }

  const halfY = PART_HALF_Y[bodyPart] ?? 10;
  const embedIn = Math.min(embedDepth, halfY - 2);
  const ceiling = spikeSide === "top";
  const edgeSign = ceiling ? -1 : 1; // teto: borda de cima; chão: borda de baixo
  const idealLocalAnchor = Vec2(0, edgeSign * (halfY - embedIn));

  // NUNCA teleporta o corpo pra alinhar a borda ideal — isso move só
  // essa peça e deixa TODOS os outros joints dela (cotovelo, ombro,
  // joelho...) com um erro de posição enorme de uma hora pra outra; o
  // solver tenta corrigir isso com força e a correção se propaga pela
  // cadeia do esqueleto inteiro, e quem sobra mais é a ponta mais
  // solta da árvore (a cabeça) — que "teleporta"/chacoalha sozinha
  // pra qualquer lugar. Em vez disso, ancora no ponto onde o corpo JÁ
  // está (sem erro inicial nenhum), só preferindo a borda ideal quando
  // ela está perto o bastante de onde o corpo realmente está.
  const currentLocal = attachBody.getLocalPoint(Vec2(pinX, pinY));
  const idealWorldErr = Math.abs(currentLocal.y - idealLocalAnchor.y);
  const localAnchorB =
    idealWorldErr < 10
      ? idealLocalAnchor
      : Vec2(currentLocal.x * 0.4, currentLocal.y);

  const pinBody = world.createBody({ type: "static", position: Vec2(pinX, pinY) });
  const pinJoint = world.createJoint(
    RevoluteJoint({
      bodyA: pinBody,
      bodyB: attachBody,
      localAnchorA: Vec2(0, 0),
      localAnchorB,
      collideConnected: false,
    })
  );

  ragdoll.pinBody = pinBody;
  ragdoll.pinJoint = pinJoint;
  ragdoll.pinKind = "rigid";
  return { pinBody, pinJoint };
}

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
    filter: PART_FILTER,
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
    filter: PART_FILTER,
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
        filter: {
          groupIndex: 0,
          categoryBits: CATEGORY_SPIKE,
          maskBits: 0xffff,
        },
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
  // braços: solta do peito, mantém cadeia shoulder↔hand
  if (partName === "lHand" || partName === "lShoulder") {
    if (b.lShoulder) destroyBodyJoints(world, b.lShoulder);
    if (b.lHand) destroyBodyJoints(world, b.lHand);
    if (b.lShoulder && b.lHand) {
      try {
        world.createJoint(
          RevoluteJoint({
            bodyA: b.lShoulder,
            bodyB: b.lHand,
            localAnchorA: Vec2(0, 5),
            localAnchorB: Vec2(0, -9),
            collideConnected: false,
          })
        );
      } catch (_) {}
    }
    mark("armLeft");
    return partName === "lHand" && b.lHand ? b.lHand : b.lShoulder || b.lHand;
  }
  if (partName === "rHand" || partName === "rShoulder") {
    if (b.rShoulder) destroyBodyJoints(world, b.rShoulder);
    if (b.rHand) destroyBodyJoints(world, b.rHand);
    if (b.rShoulder && b.rHand) {
      try {
        world.createJoint(
          RevoluteJoint({
            bodyA: b.rShoulder,
            bodyB: b.rHand,
            localAnchorA: Vec2(0, 5),
            localAnchorB: Vec2(0, -9),
            collideConnected: false,
          })
        );
      } catch (_) {}
    }
    mark("armRight");
    return partName === "rHand" && b.rHand ? b.rHand : b.rShoulder || b.rHand;
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
          disableSpikeCollision(pinTarget);
          if (isTorso) {
            // tronco/head continuam ligados ao resto do esqueleto —
            // desliga a colisão do corpo inteiro (mesmo motivo do
            // impale primário: evita esbarrar em espetos vizinhos da
            // mesma fileira enquanto balança pendurado).
            disableSpikeCollisionMany(
              Object.values(ragdoll.bodies).filter(Boolean)
            );
          }

          // Ancora rígida na ponta — membro amputado fica VISÍVEL no espeto
          const embed =
            spike.side === "bottom" ? 10 : -10;
          const pinX = tip.x;
          const pinY = tip.y + embed;
          // coloca o membro na ponta (só ele, já separado do tronco)
          const ap = pinTarget.getPosition();
          pinTarget.setTransform(Vec2(pinX, pinY), pinTarget.getAngle());
          pinTarget.setLinearVelocity(Vec2(0, 0));
          pinTarget.setAngularVelocity(0);

          const pin = world.createBody({
            type: "static",
            position: Vec2(pinX, pinY),
          });
          ragdoll.pinJoint = world.createJoint(
            RevoluteJoint({
              bodyA: pin,
              bodyB: pinTarget,
              localAnchorA: Vec2(0, 0),
              localAnchorB: Vec2(0, 0),
              collideConnected: false,
            })
          );
          ragdoll.pinBody = pin;
          ragdoll.attachBody = pinTarget;
          // membro amputado NÃO solta; tronco pode soltar com mais força
          ragdoll.breakForce = isTorso ? 400 + speed : 9999;
          ragdoll.hangReleased = false; // pin ativo — acompanha o tip
          ragdoll.hangTimer = 0;
          ragdoll.secondaryImpale = true;
          ragdoll.deathType = isLeg || isArm
            ? DeathType.IMPALE_LEG
            : DeathType.IMPALE;
          ragdoll.bodyPart = part.name;
          ragdoll.pinFollowSide = spike.side;
          ragdoll.pinFollowTipX = tip.x;
          ragdoll.pinFollowTipY = tip.y;
          ragdoll.spikeTipX = tip.x;
          ragdoll.spikeTipY = tip.y;
          ragdoll.pinKind = "rigid";
          ragdoll.pinEmbedDepth = Math.abs(embed);
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

  // Membros já amputados no vivo NÃO renascem no tronco (evita teleporte).
  // A peça voadora continua em detachedLimbs no Player.
  let lHand = null;
  let rHand = null;
  let lKnee = null;
  let rKnee = null;
  let lFoot = null;
  let rFoot = null;

  if (!sev.armLeft) {
    lHand = box(world, hx - 22, hy + headR + 22, 4, 10, 0.4, {
      kind: "part",
      name: "lHand",
    });
  }
  if (!sev.armRight) {
    rHand = box(world, hx + 22, hy + headR + 22, 4, 10, 0.4, {
      kind: "part",
      name: "rHand",
    });
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
    if (lFoot) rev(world, lKnee, lFoot, Vec2(0, 8), Vec2(0, -7), [-0.1, 2.3]);
  }
  if (rKnee) {
    rev(world, hip, rKnee, Vec2(6, hipHY - 1), Vec2(0, -8), [-2.1, 0.15]);
    if (rFoot) rev(world, rKnee, rFoot, Vec2(0, 8), Vec2(0, -7), [-2.3, 0.1]);
  }

  let pinJoint = null;
  let pinBody = null;
  let hangTimer = 0;
  let hangReleased = true;
  let attachBody = null;
  let breakForce = 0;
  let pinIsRigid = false;

  /**
   * PIN OBRIGATÓRIO em qualquer morte com tip válido (exceto stall).
   * Membro sentado na ponta + WeldJoint = preso de verdade.
   * Corpo permanece conectado → pivô por gravidade/inércia.
   */
  let bodyPart = opts.bodyPart || opts.event?.bodyPart || "torso";
  const region = opts.region || opts.event?.region || "tip";
  const surfaceNormal = opts.surfaceNormal || opts.event?.surfaceNormal || null;
  const absVy = Math.abs(velocityY || 0);
  const spd = Math.abs(opts.moveSpeed || opts.hSpeed || 0);
  const impactSpeed = Math.hypot(opts.velocityX || 0, velocityY || 0) || absVy;
  const contactPoint = opts.contactPoint || opts.event?.contactPoint || null;
  // Ângulo do player vivo na morte (rad) — ragdoll nasce na mesma orientação
  const deathAngle = opts.angle ?? opts.event?.angle ?? 0;

  function pickAttach(part) {
    const map = {
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
    };
    if (map[part]) return map[part];
    if (part === "legs") {
      if (offsetX < 0 && lFoot) return lFoot;
      if (offsetX >= 0 && rFoot) return rFoot;
      return lFoot || rFoot || lKnee || rKnee || hip;
    }
    if (part === "arms") {
      if (offsetX < 0) return lHand || lShoulder;
      return rHand || rShoulder;
    }
    return null;
  }

  // Gira o esqueleto inteiro pro ângulo da morte (pé no teto = pé em cima)
  {
    if (Math.abs(deathAngle) > 0.12) {
      const all = [
        head, chest, hip, lShoulder, rShoulder,
        lHand, rHand, lKnee, rKnee, lFoot, rFoot,
      ].filter(Boolean);
      let cx = 0;
      let cy = 0;
      for (const b of all) {
        const p = b.getPosition();
        cx += p.x;
        cy += p.y;
      }
      cx /= all.length;
      cy /= all.length;
      const c = Math.cos(deathAngle);
      const s = Math.sin(deathAngle);
      for (const b of all) {
        const p = b.getPosition();
        const dx = p.x - cx;
        const dy = p.y - cy;
        const nx = cx + dx * c - dy * s;
        const ny = cy + dx * s + dy * c;
        b.setTransform(Vec2(nx, ny), deathAngle + b.getAngle());
      }
    }
  }

  // Resolve membro: NUNCA força cabeça no teto.
  // 1) bodyPart fino da colisão  2) parte planck mais perto da ponta/contato
  {
    const fine = pickAttach(bodyPart);
    if (!fine) {
      // só aqui usa fallback por lado — e ainda assim escolhe o membro
      // mais perto da ponta, não "sempre cabeça"
      const candidates = [
        head, chest, hip, lShoulder, rShoulder,
        lHand, rHand, lKnee, rKnee, lFoot, rFoot,
      ].filter(Boolean);
      const ref = contactPoint || { x: tipX, y: tipY };
      let best = null;
      let bestD = Infinity;
      for (const b of candidates) {
        const p = b.getPosition();
        const d = Math.hypot(p.x - ref.x, p.y - ref.y);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        bodyPart = best.getUserData()?.name || bodyPart;
      } else if (spikeSide === "bottom") {
        bodyPart = offsetX < 0 ? "lFoot" : "rFoot";
      } else {
        bodyPart = "chest";
      }
    } else {
      // Confirma: se outro membro está bem mais perto da ponta, usa ele
      // (evita head pinado quando o pé que tocou está no tip)
      const ref = contactPoint || { x: tipX, y: tipY };
      const ap = fine.getPosition();
      const dFine = Math.hypot(ap.x - ref.x, ap.y - ref.y);
      const candidates = [
        head, chest, hip, lShoulder, rShoulder,
        lHand, rHand, lKnee, rKnee, lFoot, rFoot,
      ].filter(Boolean);
      let best = fine;
      let bestD = dFine;
      let bestName = bodyPart;
      for (const b of candidates) {
        const p = b.getPosition();
        const d = Math.hypot(p.x - ref.x, p.y - ref.y);
        // só troca se claramente mais perto (≥12px de vantagem)
        if (d + 12 < bestD) {
          bestD = d;
          best = b;
          bestName = b.getUserData()?.name || bestName;
        }
      }
      bodyPart = bestName;
    }
  }

  // PIN só quando o membro JÁ está perto da ponta.
  // Longe = reação livre (impulso) — sem mola puxando o corpo até o
  // teto (isso parecia teleporte em colisões superficiais).
  const canPinType =
    Number.isFinite(tipX) &&
    Number.isFinite(tipY) &&
    IMPALE_TYPES.has(deathType);

  const hitBody = pickAttach(bodyPart);
  const isCeiling = spikeSide === "top";
  // Teto exige contato mais próximo (cabeça/torso na ponta de verdade)
  const nearThreshold = isCeiling ? 28 : NEAR_TIP;

  function embedPoint(tx, ty, side) {
    if (side === "top") return { x: tx, y: ty - EMBED_DEPTH };
    return { x: tx, y: ty + EMBED_DEPTH };
  }

  const pinSpikeIndex =
    opts.spikeIndex ?? opts.event?.spikeIndex ?? opts.index ?? null;

  // Membro candidato = o que a colisão disse (nunca chest "por falta de")
  let candidateBody = canPinType ? hitBody : null;
  if (canPinType && !candidateBody) {
    const ref = contactPoint || { x: tipX, y: tipY };
    const candidates = [
      head, chest, hip, lShoulder, rShoulder,
      lHand, rHand, lKnee, rKnee, lFoot, rFoot,
    ].filter(Boolean);
    let bestD = Infinity;
    for (const b of candidates) {
      const p = b.getPosition();
      const d = Math.hypot(p.x - ref.x, p.y - ref.y);
      if (d < bestD) {
        bestD = d;
        candidateBody = b;
        bodyPart = b.getUserData()?.name || bodyPart;
      }
    }
  }
  let distToTip = 999;
  if (candidateBody) {
    const ap0 = candidateBody.getPosition();
    distToTip = Math.hypot(ap0.x - tipX, ap0.y - tipY);
  }

  // Só prende o membro que tocou — nunca a cabeça "por padrão"
  if (canPinType && candidateBody) {
    // Ajuste leve: se o membro certo está um pouco longe da ponta
    // (orientação/spawn), desloca o esqueleto INTEIRO pra ele chegar
    // no tip — sem trocar de membro. Cap baixo = sem teleporte grande.
    const ap1 = candidateBody.getPosition();
    let dx = tipX - ap1.x;
    let dy = tipY - ap1.y;
    let gap = Math.hypot(dx, dy);
    const MAX_ALIGN = isCeiling ? 48 : 40;
    if (gap > 4 && gap < MAX_ALIGN) {
      const all = [
        head, chest, hip, lShoulder, rShoulder,
        lHand, rHand, lKnee, rKnee, lFoot, rFoot,
      ].filter(Boolean);
      for (const b of all) {
        const p = b.getPosition();
        b.setTransform(Vec2(p.x + dx, p.y + dy), b.getAngle());
      }
      distToTip = 0;
    } else {
      distToTip = gap;
    }
    if (distToTip < nearThreshold || gap < MAX_ALIGN) {
      attachBody = candidateBody;
    }
  }

  if (attachBody) {
    // Desliga colisão com espetos no corpo inteiro (vizinhos no teto
    // geravam correções que pareciam teleporte).
    disableSpikeCollisionMany([
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
    ]);

    const emb = embedPoint(tipX, tipY, spikeSide);
    const pinX = emb.x;
    const pinY = emb.y;

    pinBody = world.createBody({ type: "static", position: Vec2(pinX, pinY) });

    const extremity = isExtremityPart(bodyPart);

    // Contato real: RevoluteJoint no ponto onde o corpo JÁ está
    // (zero snap). Ancora local = projeção atual, não borda forçada.
    const halfY = PART_HALF_Y[bodyPart] ?? 10;
    const embedIn = Math.min(EMBED_DEPTH, halfY - 2);
    const edgeSign = isCeiling ? -1 : 1;
    const idealLocalAnchor = Vec2(0, edgeSign * (halfY - embedIn));
    const currentLocal = attachBody.getLocalPoint(Vec2(pinX, pinY));
    const idealErr = Math.abs(currentLocal.y - idealLocalAnchor.y);
    // No teto: tolera menos a âncora ideal (evita puxar a cabeça)
    const idealTol = isCeiling ? 6 : 10;
    const localAnchorB =
      idealErr < idealTol
        ? idealLocalAnchor
        : Vec2(currentLocal.x * 0.35, currentLocal.y);

    pinJoint = world.createJoint(
      RevoluteJoint({
        bodyA: pinBody,
        bodyB: attachBody,
        localAnchorA: Vec2(0, 0),
        localAnchorB,
        collideConnected: false,
      })
    );
    pinIsRigid = true;
    hangReleased = false;

    attachBody.setAngularDamping(isCeiling ? 0.45 : 0.55);
    attachBody.setLinearDamping(isCeiling ? 0.1 : 0.12);

    if (extremity) {
      breakForce = 9999;
    } else {
      breakForce = (1600 + absVy * 20 + spd * 14) * impact;
      if (isCeiling) breakForce *= 0.8;
    }

    // Cravamento suave: impulso menor no teto (evita chicote)
    const driveJitter = (Math.random() - 0.5) * 0.35;
    const baseDrive = surfaceNormal
      ? { x: -surfaceNormal.x, y: -surfaceNormal.y }
      : { x: 0, y: spikeSide === "bottom" ? -1 : 1 };
    const dcos = Math.cos(driveJitter);
    const dsin = Math.sin(driveJitter);
    const drive = {
      x: baseDrive.x * dcos - baseDrive.y * dsin,
      y: baseDrive.x * dsin + baseDrive.y * dcos,
    };
    const driveScale = isCeiling ? 0.55 : 1;
    const driveMag =
      10 * Math.min(impact, 1.3) * (0.75 + Math.random() * 0.4) * driveScale;
    impulse(attachBody, drive.x * driveMag, drive.y * driveMag);
    {
      const av = attachBody.getLinearVelocity();
      const aspeed = Math.hypot(av.x, av.y);
      const MAX_SPEED_ATTACH = isCeiling ? 220 : 340;
      if (aspeed > MAX_SPEED_ATTACH) {
        const k = MAX_SPEED_ATTACH / aspeed;
        attachBody.setLinearVelocity(Vec2(av.x * k, av.y * k));
      }
    }

    const convulsion =
      (Math.random() < 0.5 ? -1 : 1) *
      (0.25 + Math.random() * (isCeiling ? 0.9 : 1.5)) *
      Math.min(impact, 1.3) *
      attachBody.getMass();
    try {
      attachBody.applyAngularImpulse(convulsion);
      const w = attachBody.getAngularVelocity();
      const MAX_W = isCeiling ? 14 : 22;
      if (Math.abs(w) > MAX_W) {
        attachBody.setAngularVelocity(Math.sign(w) * MAX_W);
      }
    } catch (_e) {
      // ignore
    }

    const flailAngle = Math.random() * Math.PI * 2;
    const flailMag =
      (4 + Math.random() * (isCeiling ? 6 : 10)) * Math.min(impact, 1.3);
    const flailX = Math.cos(flailAngle) * flailMag;
    const flailY =
      Math.sin(flailAngle) * flailMag * 0.55 - 3 * Math.min(impact, 1.3);
    const MAX_SPEED = isCeiling ? 220 : 340;
    for (const part of [chest, hip, lShoulder, rShoulder]) {
      if (part && part !== attachBody) {
        impulse(
          part,
          flailX * (0.45 + Math.random() * 0.55),
          flailY * (0.45 + Math.random() * 0.55)
        );
        const pv = part.getLinearVelocity();
        const pspeed = Math.hypot(pv.x, pv.y);
        if (pspeed > MAX_SPEED) {
          const k = MAX_SPEED / pspeed;
          part.setLinearVelocity(Vec2(pv.x * k, pv.y * k));
        }
      }
    }

    // Sangue extra em impactos fortes — gore escala com a violência
    // do acerto, não é sempre a mesma explosãozinha genérica.
    if (typeof opts.onBlood === "function" && impact > 1.15) {
      opts.onBlood({
        x: pinX,
        y: pinY,
        count: Math.round(6 + (impact - 1) * 14 + Math.random() * 6),
        power: Math.min(1.6, 0.9 + (impact - 1) * 0.8),
      });
    }
  } else if (hitBody) {
    // Reação de "bateu e não empalou" (FLOP/SPIN/BOUNCE): impulso
    // localizado no membro que realmente tocou o espeto, na direção
    // de afastamento da superfície, escalado pelo impacto — cada
    // colisão empurra o corpo de um jeito diferente conforme onde e
    // com que força bateu. Jitter de ângulo/força + chance de giro
    // extra deixam cada bounce/flop/spin visualmente diferente do
    // anterior, mesmo em condições parecidas.
    const awayJitter = (Math.random() - 0.5) * 0.7; // ~±20°
    const baseAway = surfaceNormal
      ? { x: surfaceNormal.x, y: surfaceNormal.y }
      : { x: side, y: spikeSide === "bottom" ? -1 : 1 };
    const acos = Math.cos(awayJitter);
    const asin = Math.sin(awayJitter);
    const away = {
      x: baseAway.x * acos - baseAway.y * asin,
      y: baseAway.x * asin + baseAway.y * acos,
    };
    const kick = 26 * impact * (0.8 + Math.random() * 0.5);
    impulse(hitBody, away.x * kick, away.y * kick - 18 * impact);
    impulse(chest, away.x * kick * 0.4, -10 * impact);
    impulse(hip, away.x * kick * 0.25, -6 * impact);

    // Giro extra imprevisível — de vez em quando o corpo sai
    // rodopiando com muito mais força que o normal.
    if (Math.random() < 0.35) {
      const spinKick =
        (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4) * impact * hitBody.getMass();
      try {
        hitBody.applyAngularImpulse(spinKick);
      } catch (_e) {
        // ignore
      }
    }
  }

  // Herda velocidade do momento da morte — o joint + gravidade fazem o resto
  {
    const carryVy = (velocityY || 0) * 22;
    const carryVx = 6 + Math.abs(opts.moveSpeed || opts.hSpeed || 0) * 3;
    const spin = (opts.spin || 0) * 0.55;
    const allBodies = [
      head, chest, hip, lShoulder, rShoulder,
      lHand, rHand, lKnee, rKnee, lFoot, rFoot,
    ].filter(Boolean);

    for (const b of allBodies) {
      const cur = b.getLinearVelocity();
      // membro pinado também leva um pouco da vel — reação mais natural
      const scale = attachBody && b === attachBody ? 0.35 : 1;
      b.setLinearVelocity(
        Vec2(cur.x + carryVx * scale, cur.y + carryVy * scale)
      );
      if (spin) b.setAngularVelocity(b.getAngularVelocity() + spin * scale);
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
    bodyPart,
    pinKind: pinIsRigid ? "rigid" : "spring",
    floorKicked: false,
    secondaryImpale: deathType === DeathType.IMPALE || deathType === DeathType.IMPALE_LEG,
    floorY,
    pinJoint,
    pinBody,
    spikeTipX: tipX,
    spikeTipY: tipY,
    // acompanhamento do spike em movimento (só move o pinBody estático)
    pinEmbedDepth: EMBED_DEPTH,
    pinFollowSide: spikeSide,
    pinFollowTipX: tipX,
    pinSpikeIndex: pinSpikeIndex,
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

  // Spikes do mundo Planck acompanham as hitboxes atuais (obstacles)
  ragdoll.resyncTimer = (ragdoll.resyncTimer || 0) + dtSec;
  if (ragdoll.resyncTimer > 0.12) {
    ragdoll.resyncTimer = 0;
    resyncSpikeObstacles(ragdoll);
  }

  // Se o mapa ainda rolar, só o pinBody acompanha a ponta.
  // O membro é puxado pelo joint rígido — sem teleporte do esqueleto.
  // IMPORTANTE: o índice do spike original não é uma referência
  // confiável (o array de obstáculos é reciclado/filtrado a cada
  // frame conforme o mundo rola), então a busca é sempre "ponta mais
  // próxima da última posição conhecida" — mas com um raio pequeno
  // (menor que o espaçamento entre espetos) pra nunca pular pra um
  // espeto vizinho, e com movimento suavizado (nunca teleporta),
  // já que o joint agora é rígido e transmitiria qualquer salto
  // direto pro corpo (era a causa do "flutua e cai de novo").
  if (ragdoll.pinBody && ragdoll.pinJoint && !ragdoll.hangReleased) {
    const side = ragdoll.pinFollowSide || ragdoll.spikeSide || "bottom";
    const depth = ragdoll.pinEmbedDepth ?? 12;
    const obstacles = ragdoll.obstacles || [];
    let bestTip = null;
    let bestD = Infinity;

    const refX = ragdoll.pinFollowTipX ?? ragdoll.spikeTipX ?? 0;
    const refY = ragdoll.pinFollowTipY ?? ragdoll.spikeTipY ?? 0;
    for (const hb of obstacles) {
      if (!hb?.tip || hb.side !== side) continue;
      const d = Math.hypot(hb.tip.x - refX, hb.tip.y - refY);
      if (d < bestD) {
        bestD = d;
        bestTip = hb.tip;
      }
    }

    // Raio bem menor que o espaçamento entre espetos — nunca troca
    // pro vizinho errado. Sem candidato bom = mantém a última posição
    // conhecida (não pula, não teleporta).
    const MAX_TRACK_JUMP = 34;
    if (bestTip && bestD < MAX_TRACK_JUMP) {
      let embY = bestTip.y;
      let embX = bestTip.x;
      if (ragdoll.attachBody) {
        const ap = ragdoll.attachBody.getPosition();
        const dTip = Math.hypot(ap.x - bestTip.x, ap.y - bestTip.y);
        if (dTip < 36) {
          embY = side === "top" ? bestTip.y - depth : bestTip.y + depth;
        }
      }
      ragdoll.pinFollowTipY = bestTip.y;
      ragdoll.pinFollowTipX = bestTip.x;
      ragdoll.spikeTipX = bestTip.x;
      ragdoll.spikeTipY = bestTip.y;

      // Pin rígido: só acompanha o tip se o mapa ainda rolar (speed>0).
      // Movimento suavizado — nunca salta o pin (transmitiria teleporte).
      if (ragdoll.pinKind === "rigid" && ragdoll.pinBody) {
        try {
          const cur = ragdoll.pinBody.getPosition();
          const maxStep = 4;
          let dx = embX - cur.x;
          let dy = embY - cur.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.05) {
            if (dist > maxStep) {
              const k = maxStep / dist;
              dx *= k;
              dy *= k;
            }
            ragdoll.pinBody.setTransform(Vec2(cur.x + dx, cur.y + dy), 0);
          }
        } catch (_) {}
      }
    }
  }

  const steps = dtSec > 0.02 ? 2 : 1;
  const h = dtSec / steps;
  for (let i = 0; i < steps; i++) {
    ragdoll.world.step(h, VEL_ITERS, POS_ITERS);
  }

  // Ruptura do pin: só depois de tempo mínimo generoso
  if (ragdoll.pinJoint && !ragdoll.hangReleased) {
    ragdoll.hangTimer = (ragdoll.hangTimer || 0) + dtSec;
    const minHold = 1.4; // empalar visível pelo menos ~1.4s
    const maxHold = 4.0;

    let mag = 0;
    try {
      const invDt = 1 / Math.max(dtSec, 1 / 120);
      const rf = ragdoll.pinJoint.getReactionForce(invDt);
      mag = Math.hypot(rf.x, rf.y);
    } catch (_) {
      mag = 0;
    }

    const limit = ragdoll.breakForce || 2500;
    const shouldBreak =
      (ragdoll.hangTimer > minHold && mag > limit) ||
      ragdoll.hangTimer > maxHold;

    if (shouldBreak) {
      ragdoll.hangReleased = true;
      ragdoll.secondaryImpale = false;
      try {
        ragdoll.world.destroyJoint(ragdoll.pinJoint);
      } catch (_) {}
      ragdoll.pinJoint = null;
      // Volta a colidir com espetos normalmente — senão o corpo
      // atravessa qualquer espeto pelo resto da queda.
      enableSpikeCollisionMany(Object.values(ragdoll.bodies).filter(Boolean));
    }
  }

  // Bounce explícito no chão/teto — restitution sozinha não basta
  // (fricção + vários contatos matam a energia). Reflete vy com retenção.
  // Só faz sentido pra corpo LIVRE (tombando/voando) — enquanto tem um
  // pino ativo (empalado de verdade), a posição já é toda governada
  // pelo joint + gravidade. Aplicar esse clamp/teleporte em cima de um
  // pino RÍGIDO era exatamente a causa do "flutua" no teto: o ponto
  // de encaixe de um espeto de teto fica perto o bastante do limite
  // superior da tela pra, durante um balanço mais forte, entrar nessa
  // zona e levar um teleporte — o que briga com o joint rígido e gera
  // um tranco/instabilidade visual (no chão isso quase nunca acontece,
  // porque o corpo pendura BEM longe do chão de verdade).
  const pinActive = ragdoll.pinJoint && !ragdoll.hangReleased;
  if (!pinActive) {
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
