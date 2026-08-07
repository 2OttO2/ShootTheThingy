/**
 * SpikeSync — mantém um pool de corpos estáticos (spikes) no mundo
 * físico sincronizados com as hitboxes visuais calculadas pelo jogo
 * (utils/spikeHitboxes.js). Reposicionar um corpo estático existente é
 * muito mais barato que criar/destruir corpos a cada frame, então o
 * pool é criado uma vez (tamanho fixo, generoso) e cada spike visível
 * é "encaixado" num slot; slots sobrando são jogados bem longe (não
 * colidem com nada).
 */
import { Polygon, Vec2 } from "planck";

const FAR_AWAY = -100000;

export default class SpikeSync {
  /**
   * @param {import('./PhysicsEngine.js').default} engine
   * @param {number} [poolSize] - quantos spikes simultâneos suporta (top+bottom somados)
   */
  constructor(engine, poolSize = 40) {
    this.engine = engine;
    this.pool = [];
    for (let i = 0; i < poolSize; i++) {
      const body = engine.createStaticBody({
        position: { x: FAR_AWAY, y: FAR_AWAY },
        // placeholder — a fixture real é criada no primeiro sync()
        shape: { type: "circle", radius: 0.01 },
        friction: 0.6,
        restitution: 0.15,
        meta: { kind: "spike", side: "top", tip: { x: 0, y: 0 } },
      });
      this.pool.push({ body, active: false });
    }
  }

  /**
   * @param {Array<{points:[{x,y},{x,y},{x,y}], side:'top'|'bottom', tip:{x,y}}>} hitboxes
   *   triângulos no MESMO formato que utils/spikeHitboxes.js já produz.
   */
  sync(hitboxes) {
    const n = Math.min(hitboxes.length, this.pool.length);

    for (let i = 0; i < n; i++) {
      this._fitTriangle(this.pool[i].body, hitboxes[i]);
      this.pool[i].active = true;
    }

    for (let i = n; i < this.pool.length; i++) {
      const slot = this.pool[i];
      if (slot.active) {
        slot.body.setPosition(FAR_AWAY, FAR_AWAY);
        slot.active = false;
      }
    }

    if (hitboxes.length > this.pool.length && !this._warned) {
      this._warned = true;
      console.warn(
        `[SpikeSync] mais spikes visíveis (${hitboxes.length}) do que o pool suporta (${this.pool.length}) — aumente poolSize.`
      );
    }
  }

  /** Reposiciona (e, se preciso, refaz a fixture de) um corpo do pool pro triângulo `hb`. */
  _fitTriangle(rigidBody, hb) {
    const native = rigidBody.native;
    const [p0, p1, p2] = hb.points;
    const cx = (p0.x + p1.x + p2.x) / 3;
    const cy = (p0.y + p1.y + p2.y) / 3;

    const key = `${cx.toFixed(1)},${cy.toFixed(1)}`;
    if (native.__spikeKey !== key) {
      for (let f = native.getFixtureList(); f; ) {
        const next = f.getNext();
        native.destroyFixture(f);
        f = next;
      }
      rigidBody.setPosition(cx, cy);
      native.createFixture({
        shape: Polygon([
          Vec2(p0.x - cx, p0.y - cy),
          Vec2(p1.x - cx, p1.y - cy),
          Vec2(p2.x - cx, p2.y - cy),
        ]),
        friction: 0.6,
        restitution: 0.15,
      });
      native.__spikeKey = key;
    }

    rigidBody.setUserData({ kind: "spike", side: hb.side, tip: hb.tip });
  }
}
