/**
 * Mundo Planck — player vivo + chão/teto + spikes.
 * Gravidade "arcade" (não 980 tipo metro real em px).
 */
import {
  World,
  Vec2,
  Box,
  Edge,
  Polygon,
  Settings,
} from "planck-js";

Settings.maxTranslation = 20;
Settings.maxTranslationSquared = 20 * 20;

// ~arcade: queda legível, ainda dá tempo de reagir
const GRAVITY = 280;
// sprite em left:300 width:48 → centro 324
const PLAYER_X = 324;
const PLAYER_HX = 14;
const PLAYER_HY = 26;

export function createGameWorld(opts = {}) {
  // ground CSS: height 5px, bottom 1px → topo do chão ≈ innerHeight - 6
  const floorY =
    opts.floorY ??
    (typeof window !== "undefined" ? window.innerHeight - 6 : 600);
  const ceilingY = opts.ceilingY ?? 6;
  const startY = opts.startY ?? 350;

  const world = World(Vec2(0, GRAVITY));

  const ground = world.createBody({ type: "static" });
  ground.createFixture({
    shape: Edge(Vec2(-2000, floorY), Vec2(4000, floorY)),
    friction: 0.45,
    restitution: 0.55, // kick no chão
  });
  ground.setUserData({ kind: "floor" });

  const ceiling = world.createBody({ type: "static" });
  ceiling.createFixture({
    shape: Edge(Vec2(-2000, ceilingY), Vec2(4000, ceilingY)),
    friction: 0.2,
    restitution: 0.35,
  });
  ceiling.setUserData({ kind: "ceiling" });

  const maxX =
    opts.maxX ??
    (typeof window !== "undefined" ? window.innerWidth - 20 : 900);
  world.createBody({ type: "static" }).createFixture({
    shape: Edge(Vec2(40, -100), Vec2(40, floorY + 40)),
  });
  world.createBody({ type: "static" }).createFixture({
    shape: Edge(Vec2(maxX, -100), Vec2(maxX, floorY + 40)),
  });

  const player = world.createBody({
    type: "dynamic",
    position: Vec2(PLAYER_X, startY + PLAYER_HY),
    fixedRotation: true,
    linearDamping: 0.05,
    allowSleep: false,
  });
  player.createFixture({
    shape: Box(PLAYER_HX, PLAYER_HY),
    density: 0.7,
    friction: 0.35,
    restitution: 0.4, // quique do corpo
    filter: { categoryBits: 0x0002, maskBits: 0xffff },
  });
  player.setUserData({ kind: "player" });

  const state = {
    world,
    player,
    floorY,
    ceilingY,
    spikeBodies: [],
    deathHit: null,
    grounded: false,
  };

  world.on("begin-contact", (contact) => {
    const a = contact.getFixtureA().getBody().getUserData();
    const b = contact.getFixtureB().getBody().getUserData();
    const kinds = [a?.kind, b?.kind];
    if (kinds.includes("player") && kinds.includes("floor")) {
      state.grounded = true;
    }
    if (kinds.includes("player") && kinds.includes("spike")) {
      const spike = a?.kind === "spike" ? a : b;
      if (spike && !state.deathHit) {
        const p = player.getPosition();
        const tip = spike.tip || { x: p.x, y: p.y };
        state.deathHit = {
          side: spike.side || "bottom",
          tip,
          region: spike.region || "tip",
          bodyPart: spike.bodyPart || "torso",
          offsetX: p.x - tip.x,
        };
      }
    }
  });

  world.on("end-contact", (contact) => {
    const a = contact.getFixtureA().getBody().getUserData();
    const b = contact.getFixtureB().getBody().getUserData();
    if ([a?.kind, b?.kind].includes("player") && [a?.kind, b?.kind].includes("floor")) {
      state.grounded = false;
    }
  });

  function clearSpikes() {
    for (const b of state.spikeBodies) {
      try {
        world.destroyBody(b);
      } catch (_) {}
    }
    state.spikeBodies = [];
  }

  function syncSpikes(hitboxes) {
    clearSpikes();
    if (!hitboxes?.length) return;
    for (const hb of hitboxes) {
      if (!hb?.points || hb.points.length < 3) continue;
      try {
        const body = world.createBody({ type: "static" });
        body.createFixture({
          shape: Polygon(hb.points.map((p) => Vec2(p.x, p.y))),
          friction: 0.3,
          restitution: 0.05,
          filter: { categoryBits: 0x0004, maskBits: 0x0002 },
        });
        body.setUserData({
          kind: "spike",
          tip: hb.tip,
          side: hb.side,
          region: hb.region || "tip",
          bodyPart: "torso",
        });
        state.spikeBodies.push(body);
      } catch (_) {}
    }
  }

  function step(dtSec) {
    state.deathHit = null;
    const p = player.getPosition();
    const v = player.getLinearVelocity();
    player.setTransform(Vec2(PLAYER_X, p.y), 0);
    player.setLinearVelocity(Vec2(0, v.y));

    const h = Math.min(dtSec, 0.033);
    const sub = h > 0.02 ? 2 : 1;
    for (let i = 0; i < sub; i++) {
      world.step(h / sub, 8, 3);
    }

    const p2 = player.getPosition();
    const v2 = player.getLinearVelocity();
    player.setTransform(Vec2(PLAYER_X, p2.y), 0);
    player.setLinearVelocity(Vec2(0, v2.y));
  }

  function applyShot(impact) {
    // com g=280, boost menor que antes (g=980)
    const boost = Math.abs(impact) * 18;
    const v = player.getLinearVelocity();
    player.setLinearVelocity(Vec2(0, v.y - boost));
  }

  function getPlayerTop() {
    return player.getPosition().y - PLAYER_HY;
  }

  function getPlayerCenter() {
    const p = player.getPosition();
    return { x: p.x, y: p.y };
  }

  function getVelocityY() {
    return player.getLinearVelocity().y;
  }

  function reset(y = startY) {
    clearSpikes();
    state.deathHit = null;
    state.grounded = false;
    player.setTransform(Vec2(PLAYER_X, y + PLAYER_HY), 0);
    player.setLinearVelocity(Vec2(0, 0));
    player.setAwake(true);
  }

  function consumeDeathHit() {
    const h = state.deathHit;
    state.deathHit = null;
    return h;
  }

  return {
    world,
    player,
    step,
    syncSpikes,
    applyShot,
    getPlayerTop,
    getPlayerCenter,
    getVelocityY,
    reset,
    consumeDeathHit,
    isGrounded: () => state.grounded,
    floorY,
    PLAYER_HX,
    PLAYER_HY,
  };
}

