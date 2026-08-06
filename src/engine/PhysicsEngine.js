/**
 * PhysicsEngine — ponto de entrada único do motor de física.
 *
 * É a única coisa que o resto do jogo (Player, spikes, App) deveria
 * importar deste pacote. Por baixo, orquestra World (que por sua vez
 * usa planck-js) e CollisionSolver (eventos de colisão).
 *
 * Uso típico:
 *   const engine = new PhysicsEngine({ gravity: { x: 0, y: 900 } });
 *   const player = engine.createBody({ ... });
 *   engine.onCollisionStart(({ bodyA, bodyB, normal, impactSpeed }) => { ... });
 *   // no game loop:
 *   engine.step(deltaSeconds);
 */
import World from "./World.js";

export default class PhysicsEngine {
  constructor(opts = {}) {
    this.world = new World(opts);
  }

  get gravity() {
    return this.world.gravity;
  }

  setGravity(x, y) {
    this.world.setGravity(x, y);
    return this;
  }

  createBody(spec) {
    return this.world.createBody(spec);
  }

  createStaticBody(spec) {
    return this.world.createStaticBody(spec);
  }

  destroyBody(rigidBody) {
    this.world.destroyBody(rigidBody);
  }

  /**
   * Avança a simulação em `dt` segundos. Chame uma vez por frame do
   * game loop, com o deltaTime real (em segundos, não ms).
   */
  step(dt) {
    this.world.step(dt);
  }

  onCollisionStart(cb) {
    return this.world.collisions.onCollisionStart(cb);
  }

  onCollisionEnd(cb) {
    return this.world.collisions.onCollisionEnd(cb);
  }
}
