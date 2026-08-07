/**
 * PlayerController — o Player como UM ÚNICO corpo físico.
 *
 * Não existe mais "física de vivo" e "física de morto": o mesmo
 * RigidBody é usado o tempo todo. O que muda depois de tocar um spike
 * é só:
 *   1. o jogo bloqueia novos tiros (`canShoot` vira false);
 *   2. o corpo fica "empalado" — preso por um RevoluteJoint no ponto
 *      exato onde tocou o spike. Isso não é uma animação: é um pino de
 *      física de verdade, então o corpo balança/pendura sob gravidade
 *      normalmente (ver src/engine/PhysicsEngine.js).
 *   3. se o spike era de TETO, o pino se solta sozinho depois de
 *      `ceilingReleaseSec` segundos — o corpo cai por gravidade daí em
 *      diante, podendo bater (e empalar de novo) em outro spike.
 *      Se o spike era de CHÃO, o pino não se solta sozinho (o corpo já
 *      ia cair sobre ele de qualquer jeito — soltar não muda o
 *      resultado visual, e evitar isso poupa física desnecessária).
 */
import { RevoluteJoint } from "planck";

const DEFAULTS = {
  ceilingReleaseSec: 2.2,
  recoilImpulse: 14,
};

export default class PlayerController {
  /**
   * @param {import('./PhysicsEngine.js').default} engine
   * @param {object} spec - passado direto pro engine.createBody (posição, shape, etc.)
   * @param {object} [opts]
   */
  constructor(engine, spec, opts = {}) {
    this.engine = engine;
    this.opts = { ...DEFAULTS, ...opts };
    this.body = engine.createBody({
      ...spec,
      meta: { kind: "player", ...(spec.meta ?? {}) },
    });

    this.impaled = false;
    this.canShoot = true;
    this._pinAnchorBody = null;
    this._pinJoint = null;
    this._pinSide = null;
    this._pinTimer = 0;

    this._unsubscribe = engine.onCollisionStart((ev) => this._handleCollision(ev));
  }

  _handleCollision({ bodyA, bodyB, point }) {
    if (this.impaled) return; // já empalado — ignora novos toques até soltar

    const spike = bodyA.userData?.kind === "spike" ? bodyA : bodyB.userData?.kind === "spike" ? bodyB : null;
    const isPlayerInvolved = bodyA === this.body || bodyB === this.body;
    if (!spike || !isPlayerInvolved) return;

    const anchorPoint = point ?? spike.userData?.tip ?? this.body.position;
    this._impale(anchorPoint, spike.userData?.side ?? "bottom");
  }

  _impale(point, side) {
    this.impaled = true;
    this.canShoot = false;
    this._pinSide = side;
    this._pinTimer = 0;

    this._pinAnchorBody = this.engine.createStaticBody({
      position: { x: point.x, y: point.y },
      shape: { type: "circle", radius: 0.01 },
      isSensor: true,
    });

    const joint = RevoluteJoint({}, this._pinAnchorBody.native, this.body.native, {
      x: point.x,
      y: point.y,
    });
    this._pinJoint = this.engine.world.native.createJoint(joint);
  }

  /** Solta o pino manualmente (também chamado sozinho pelo teto, ver update()). */
  release() {
    if (!this.impaled) return;
    if (this._pinJoint) {
      try {
        this.engine.world.native.destroyJoint(this._pinJoint);
      } catch {
        // já destruído — ok
      }
      this._pinJoint = null;
    }
    if (this._pinAnchorBody) {
      this.engine.destroyBody(this._pinAnchorBody);
      this._pinAnchorBody = null;
    }
    this.impaled = false;
    // OBS: canShoot continua false depois do 1º empalar — uma vez
    // atingido, o jogo já considera o Player fora de combate, mesmo
    // depois de cair livre. Ver comentário no fim do arquivo.
  }

  /** Chame uma vez por frame, com dt em segundos. */
  update(dtSec) {
    if (this.impaled && this._pinSide === "top") {
      this._pinTimer += dtSec;
      if (this._pinTimer >= this.opts.ceilingReleaseSec) {
        this.release();
      }
    }
  }

  /** Recuo do tiro — só funciona se ainda não foi atingido. */
  shoot(dirX, dirY) {
    if (!this.canShoot) return false;
    const len = Math.hypot(dirX, dirY) || 1;
    const j = this.opts.recoilImpulse;
    this.body.applyImpulse((dirX / len) * j, (dirY / len) * j);
    return true;
  }

  destroy() {
    this._unsubscribe?.();
    this.release();
    this.engine.destroyBody(this.body);
  }
}
