/**
 * CollisionSolver — camada de EVENTOS de colisão por cima do planck-js.
 *
 * O cálculo de normal, penetração, impulso, atrito e restituição em si
 * é feito pelo solver interno do Box2D dentro de `world.step()` — não
 * faz sentido (nem é seguro) reimplementar isso à mão. Este arquivo só
 * observa o resultado desse solver e entrega em eventos simples pro
 * resto do jogo reagir.
 *
 * IMPORTANTE sobre "impulso": testei o evento nativo `post-solve` do
 * planck-js 1.3.0 (que deveria trazer o impulso normal resolvido) e ele
 * não vem populado de forma confiável nesta versão (array sempre
 * vazio). Em vez de depender disso, o "impact" de cada colisão é
 * calculado aqui a partir da VELOCIDADE RELATIVA das duas partes no
 * instante do contato, projetada na normal — que é, na prática, o dado
 * que o jogo precisa mesmo ("bateu forte o bastante pra isso
 * importar?"), e não depende de nenhum detalhe interno do solver.
 *
 * Os callbacks nativos (`begin-contact`, `end-contact`) disparam
 * DURANTE o step, num momento em que não é seguro destruir
 * corpos/joints. Por isso este solver só ENFILEIRA os eventos, e
 * `World.step()` chama `flush()` logo depois de cada sub-step — só aí
 * é seguro o código de jogo reagir livremente.
 */
export default class CollisionSolver {
  constructor(nativeWorld) {
    this._queue = [];
    this._onStart = [];
    this._onEnd = [];
    // contacts já enfileirados neste sub-step, pra não duplicar caso o
    // motor dispare begin-contact mais de uma vez pro mesmo par antes
    // do flush (acontece em contatos de repouso/jitter)
    this._seenThisFlush = new Set();

    nativeWorld.on("begin-contact", (contact) => {
      if (this._seenThisFlush.has(contact)) return;
      const ev = this._describe(contact);
      if (!ev) return;
      this._seenThisFlush.add(contact);
      this._queue.push({ type: "start", ...ev });
    });

    nativeWorld.on("end-contact", (contact) => {
      this._seenThisFlush.delete(contact);
      const ev = this._describe(contact);
      if (ev) this._queue.push({ type: "end", ...ev });
    });
  }

  _describe(contact) {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const nativeA = fa.getBody();
    const nativeB = fb.getBody();
    const bodyA = nativeA.getUserData()?.rigidBody ?? null;
    const bodyB = nativeB.getUserData()?.rigidBody ?? null;
    if (!bodyA || !bodyB) return null;

    let normal = { x: 0, y: -1 };
    let point = null;
    try {
      const wm = contact.getWorldManifold();
      if (wm?.normal) normal = { x: wm.normal.x, y: wm.normal.y };
      if (wm?.points?.length) point = { x: wm.points[0].x, y: wm.points[0].y };
    } catch {
      // sem manifold ainda (ex: sensor) — normal padrão serve
    }

    // velocidade relativa no instante do contato, projetada na normal
    // — usada como proxy de "força do impacto" (ver nota no topo)
    const va = nativeA.getLinearVelocity();
    const vb = nativeB.getLinearVelocity();
    const relVx = va.x - vb.x;
    const relVy = va.y - vb.y;
    const impactSpeed = Math.abs(relVx * normal.x + relVy * normal.y);

    return { bodyA, bodyB, normal, point, impactSpeed };
  }

  /** Chamado por World.step() logo após cada sub-step físico. */
  flush() {
    this._seenThisFlush.clear();
    if (!this._queue.length) return;
    const events = this._queue;
    this._queue = [];
    for (const ev of events) {
      const list = ev.type === "start" ? this._onStart : this._onEnd;
      for (const cb of list) cb(ev);
    }
  }

  /** cb({ bodyA, bodyB, normal, point, impactSpeed }) */
  onCollisionStart(cb) {
    this._onStart.push(cb);
    return () => {
      this._onStart = this._onStart.filter((c) => c !== cb);
    };
  }

  onCollisionEnd(cb) {
    this._onEnd.push(cb);
    return () => {
      this._onEnd = this._onEnd.filter((c) => c !== cb);
    };
  }
}
