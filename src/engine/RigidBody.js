/**
 * RigidBody — wrapper em torno de um Body do planck-js (Box2D).
 *
 * Não reimplementa física: só expõe uma API limpa e estável (a que o
 * resto do jogo usa) por cima do motor de verdade. Se um dia trocarmos
 * o motor por baixo, só este arquivo (e Shapes.js/World.js) precisam
 * mudar — o resto do jogo nunca importa planck-js diretamente.
 *
 * Convenção de unidades: 1 unidade do mundo físico = 1 pixel de tela.
 * (O planck internamente prefere metros, mas pixel-a-pixel funciona
 * bem em jogos 2D pequenos como este, contanto que os valores de
 * massa/força sejam calibrados nessa escala — é a mesma convenção que
 * já era usada no ragdoll de morte deste projeto.)
 */

export default class RigidBody {
  /**
   * @param {import('planck-js').Body} body - body nativo do planck
   * @param {object} [meta] - dados livres do jogo (ex: { kind: 'player' })
   */
  constructor(body, meta = {}) {
    this._body = body;
    this._body.setUserData({ rigidBody: this, ...meta });
    // aceleração constante própria do corpo (força/massa aplicada todo
    // step, ALÉM da gravidade do mundo) — não existe nativamente em
    // motores de impulso, então o World a aplica manualmente a cada
    // step via applyForceToCenter. Serve pra "empuxo constante", etc.
    this.acceleration = { x: 0, y: 0 };
  }

  /** Body nativo do planck-js, pra casos avançados (ex: joints). */
  get native() {
    return this._body;
  }

  // ---------- posição / transform ----------

  get position() {
    const p = this._body.getPosition();
    return { x: p.x, y: p.y };
  }

  setPosition(x, y) {
    this._body.setTransform({ x, y }, this._body.getAngle());
    return this;
  }

  get rotation() {
    return this._body.getAngle();
  }

  setRotation(radians) {
    this._body.setTransform(this._body.getPosition(), radians);
    return this;
  }

  // ---------- velocidade ----------

  get velocity() {
    const v = this._body.getLinearVelocity();
    return { x: v.x, y: v.y };
  }

  setVelocity(x, y) {
    this._body.setLinearVelocity({ x, y });
    return this;
  }

  get angularVelocity() {
    return this._body.getAngularVelocity();
  }

  setAngularVelocity(radiansPerSec) {
    this._body.setAngularVelocity(radiansPerSec);
    return this;
  }

  get speed() {
    const v = this.velocity;
    return Math.hypot(v.x, v.y);
  }

  // ---------- massa / inércia ----------

  get mass() {
    return this._body.getMass();
  }

  get centerOfMass() {
    const c = this._body.getWorldCenter();
    return { x: c.x, y: c.y };
  }

  /** Momento de inércia (em torno do centro de massa). */
  get momentOfInertia() {
    return this._body.getInertia();
  }

  // ---------- damping ----------

  get linearDamping() {
    return this._body.getLinearDamping();
  }

  setLinearDamping(v) {
    this._body.setLinearDamping(v);
    return this;
  }

  get angularDamping() {
    return this._body.getAngularDamping();
  }

  setAngularDamping(v) {
    this._body.setAngularDamping(v);
    return this;
  }

  // ---------- atrito / restituição (por fixture; aplica em todas) ----------

  get friction() {
    const f = this._body.getFixtureList();
    return f ? f.getFriction() : 0;
  }

  setFriction(v) {
    for (let f = this._body.getFixtureList(); f; f = f.getNext()) {
      f.setFriction(v);
    }
    return this;
  }

  get restitution() {
    const f = this._body.getFixtureList();
    return f ? f.getRestitution() : 0;
  }

  setRestitution(v) {
    for (let f = this._body.getFixtureList(); f; f = f.getNext()) {
      f.setRestitution(v);
    }
    return this;
  }

  // ---------- forças / impulsos ----------

  /** Força contínua (N), aplicada no centro de massa, só neste step. */
  applyForce(fx, fy) {
    this._body.applyForceToCenter({ x: fx, y: fy }, true);
    return this;
  }

  /** Força aplicada num ponto do mundo — gera torque se fora do centro. */
  applyForceAt(fx, fy, worldX, worldY) {
    this._body.applyForce({ x: fx, y: fy }, { x: worldX, y: worldY }, true);
    return this;
  }

  /** Impulso instantâneo (muda velocidade na hora) no centro de massa. */
  applyImpulse(ix, iy) {
    this._body.applyLinearImpulse({ x: ix, y: iy }, this._body.getWorldCenter(), true);
    return this;
  }

  /** Impulso instantâneo num ponto do mundo — gera torque se fora do centro. */
  applyImpulseAt(ix, iy, worldX, worldY) {
    this._body.applyLinearImpulse({ x: ix, y: iy }, { x: worldX, y: worldY }, true);
    return this;
  }

  applyTorque(t) {
    this._body.applyTorque(t, true);
    return this;
  }

  applyAngularImpulse(ai) {
    this._body.applyAngularImpulse(ai, true);
    return this;
  }

  // ---------- estado / tipo ----------

  get isAwake() {
    return this._body.isAwake();
  }

  setAwake(v) {
    this._body.setAwake(v);
    return this;
  }

  get isStatic() {
    return this._body.isStatic();
  }

  get isDynamic() {
    return this._body.isDynamic();
  }

  setBullet(v) {
    this._body.setBullet(v);
    return this;
  }

  /** Dados livres do jogo (ex: { kind: 'spike', side: 'top' }). */
  get userData() {
    const d = this._body.getUserData();
    return d ? d.gameData ?? null : null;
  }

  setUserData(data) {
    const existing = this._body.getUserData() || {};
    this._body.setUserData({ ...existing, gameData: data });
    return this;
  }
}
