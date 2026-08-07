/**
 * World — wrapper em torno do World do planck-js.
 *
 * Responsabilidades:
 *  - criar/destruir RigidBody (dynamic, static, kinematic);
 *  - avançar a simulação (step);
 *  - expor eventos de colisão em formato simples (via CollisionSolver).
 *
 * Não decide REGRAS de jogo (o que acontece quando o player toca um
 * spike) — só entrega os fatos físicos (quem colidiu, normal, impacto).
 * Quem decide é o código de jogo, ouvindo esses eventos.
 */
import { World as PlanckWorld, Vec2, Settings } from "planck";
import RigidBody from "./RigidBody.js";
import { createShape } from "./Shapes.js";
import CollisionSolver from "./CollisionSolver.js";

// O Box2D (e o planck-js, que é um port dele) tem limites internos de
// "quanto um corpo pode se mover/girar por passo" calibrados pra um
// mundo em METROS (maxTranslation padrão = 2 unidades/passo ≈ só
// 120px/s a 60fps antes de começar a truncar o movimento). Como este
// jogo usa 1 unidade = 1 pixel, isso precisa ser recalibrado — senão
// tudo no jogo fica "preso" numa velocidade máxima artificialmente
// baixa, mesmo com gravidade/impulsos corretos. Aplicado uma única vez,
// no carregamento deste módulo, pra valer pra todo o motor.
Settings.maxTranslation = 80;
Settings.maxTranslationSquared = 80 * 80;
Settings.maxRotation = 0.9 * Math.PI;
Settings.maxRotationSquared = (0.9 * Math.PI) ** 2;
// linearSlop (folga de penetração permitida) também é em metros — em
// pixels, o padrão (0.005) é imperceptível e pode deixar a resolução
// de colisão "nervosa"; um valor maior estabiliza sem ficar visível.
Settings.linearSlop = 0.6;

export default class World {
  /**
   * @param {object} [opts]
   * @param {{x:number,y:number}} [opts.gravity] - px/s², padrão (0, 900)
   */
  constructor(opts = {}) {
    const gravity = opts.gravity ?? { x: 0, y: 900 };
    this._world = PlanckWorld(Vec2(gravity.x, gravity.y));
    this._bodies = new Set();
    this.collisions = new CollisionSolver(this._world);
  }

  get native() {
    return this._world;
  }

  get gravity() {
    const g = this._world.getGravity();
    return { x: g.x, y: g.y };
  }

  setGravity(x, y) {
    this._world.setGravity({ x, y });
    return this;
  }

  /**
   * Cria um corpo no mundo.
   * @param {object} spec
   * @param {'dynamic'|'static'|'kinematic'} [spec.type='dynamic']
   * @param {{x:number,y:number}} spec.position
   * @param {number} [spec.rotation]
   * @param {object|object[]} spec.shape - ver Shapes.js (uma ou várias fixtures)
   * @param {number} [spec.density=1]
   * @param {number} [spec.friction=0.3]
   * @param {number} [spec.restitution=0.1]
   * @param {number} [spec.linearDamping=0]
   * @param {number} [spec.angularDamping=0]
   * @param {boolean} [spec.fixedRotation=false]
   * @param {boolean} [spec.bullet=false] - CCD, pra corpos rápidos/finos
   * @param {boolean} [spec.allowSleep=true]
   * @param {object} [spec.meta] - dados livres do jogo
   */
  createBody(spec) {
    const body = this._world.createBody({
      type: spec.type ?? "dynamic",
      position: Vec2(spec.position?.x ?? 0, spec.position?.y ?? 0),
      angle: spec.rotation ?? 0,
      linearDamping: spec.linearDamping ?? 0,
      angularDamping: spec.angularDamping ?? 0,
      fixedRotation: spec.fixedRotation ?? false,
      bullet: spec.bullet ?? false,
      allowSleep: spec.allowSleep ?? true,
    });

    const shapes = Array.isArray(spec.shape) ? spec.shape : [spec.shape];
    for (const s of shapes) {
      body.createFixture({
        shape: createShape(s),
        density: s.density ?? spec.density ?? 1,
        friction: s.friction ?? spec.friction ?? 0.3,
        restitution: s.restitution ?? spec.restitution ?? 0.1,
        isSensor: s.isSensor ?? false,
        filterGroupIndex: spec.groupIndex ?? 0,
      });
    }

    const rb = new RigidBody(body, spec.meta ?? {});
    this._bodies.add(rb);
    return rb;
  }

  /** Atalho pra corpo estático (chão, teto, spikes). */
  createStaticBody(spec) {
    return this.createBody({ ...spec, type: "static" });
  }

  destroyBody(rigidBody) {
    if (!rigidBody || !this._bodies.has(rigidBody)) return;
    this._bodies.delete(rigidBody);
    try {
      this._world.destroyBody(rigidBody.native);
    } catch {
      // já destruído — ok
    }
  }

  get bodies() {
    return this._bodies;
  }

  /**
   * Avança a simulação. dt em segundos.
   * Aplica a aceleração própria de cada corpo (RigidBody#acceleration)
   * como força antes de avançar, e sub-divide o passo se dt for grande
   * (evita túnel/instabilidade em quedas de frame).
   */
  step(dt, velocityIterations = 8, positionIterations = 3) {
    const maxSub = 1 / 90;
    let remaining = dt;
    while (remaining > 0) {
      const h = Math.min(remaining, maxSub);
      for (const rb of this._bodies) {
        const a = rb.acceleration;
        if (a && (a.x !== 0 || a.y !== 0) && rb.isDynamic) {
          rb.applyForce(a.x * rb.mass, a.y * rb.mass);
        }
      }
      this._world.step(h, velocityIterations, positionIterations);
      this.collisions.flush();
      remaining -= h;
    }
  }
}
