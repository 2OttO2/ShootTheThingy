/**
 * Sangue: pool + canvas + LOD.
 * LOD 0 = full, 1 = simples, 2 = skip frame / dormindo.
 */

const GRAVITY = 0.48;
const DAMPING = 0.989;
const MAX_PARTICLES = 180;
const POOL_MAX = 160;

// LOD thresholds (distância do foco em px)
const LOD1_DIST = 280;
const LOD2_DIST = 420;

let nextId = 1;
let frameCounter = 0;

function createParticle(x, y, vx, vy, opts = {}) {
  const size = opts.size ?? 2.2 + Math.random() * 4;
  const life = opts.life ?? 0.55 + Math.random() * 0.85;
  return {
    id: nextId++,
    x,
    y,
    vx,
    vy,
    size,
    width: opts.streak ? size * (0.32 + Math.random() * 0.45) : size,
    height: opts.streak ? size * (2.2 + Math.random() * 4) : size,
    life,
    maxLife: life,
    rot: opts.rot ?? (Math.atan2(vy, vx) * 180) / Math.PI + 90,
    streak: !!opts.streak,
    active: true,
    lod: 0,
  };
}

export function createBloodSystem() {
  return {
    particles: [],
    floorY: typeof window !== "undefined" ? window.innerHeight - 8 : 600,
    pool: [],
    focusX: 324,
    focusY: 300,
  };
}

export function setBloodFocus(system, x, y) {
  if (!system) return;
  system.focusX = x;
  system.focusY = y;
}

function acquireParticle(system, x, y, vx, vy, opts) {
  let p = system.pool.pop();
  if (!p) {
    p = createParticle(x, y, vx, vy, opts);
  } else {
    const size = opts.size ?? 2.2 + Math.random() * 4;
    const life = opts.life ?? 0.55 + Math.random() * 0.85;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.width = opts.streak ? size * (0.32 + Math.random() * 0.45) : size;
    p.height = opts.streak ? size * (2.2 + Math.random() * 4) : size;
    p.life = life;
    p.maxLife = life;
    p.rot = opts.rot ?? (Math.atan2(vy, vx) * 180) / Math.PI + 90;
    p.streak = !!opts.streak;
    p.active = true;
    p.lod = 0;
  }
  return p;
}

function releaseParticle(system, p) {
  p.active = false;
  if (system.pool.length < POOL_MAX) system.pool.push(p);
}

export function bloodBudget(system) {
  if (!system) return 0;
  const r = system.particles.length / MAX_PARTICLES;
  if (r < 0.7) return 1;
  return Math.max(0, 1 - (r - 0.7) / 0.3);
}

function ensureRoom(system, need) {
  const room = MAX_PARTICLES - system.particles.length;
  if (room >= need) return need;
  const kill = need - room;
  const victims = system.particles.splice(0, kill);
  for (const p of victims) releaseParticle(system, p);
  return need;
}

function particleLod(system, p) {
  const fx = system.focusX ?? 324;
  const fy = system.focusY ?? 300;
  const d = Math.hypot(p.x - fx, p.y - fy);
  // longe + quase morto → LOD alto
  const lifeRatio = p.life / (p.maxLife || 1);
  if (d > LOD2_DIST || (d > LOD1_DIST && lifeRatio < 0.25)) return 2;
  if (d > LOD1_DIST || lifeRatio < 0.35) return 1;
  return 0;
}

export function bloodBurst(system, x, y, opts = {}) {
  if (!system) return;

  const budget = bloodBudget(system);
  if (budget < 0.08) return;

  const {
    count = 14,
    velocityY = 0,
    moveSpeed = 0,
    mode = "shot",
    power = 1,
  } = opts;

  const vyBias = Math.max(-1, Math.min(1, velocityY / 14));
  const vxBias = -Math.min(1.2, Math.max(0, moveSpeed) / 9);

  let n = Math.ceil(count * (0.75 + budget * 0.35));

  if (mode === "death") n = Math.min(28, Math.floor(n * 1.55));
  else if (mode === "drip" || mode === "venous") n = Math.max(2, Math.min(n, 6));
  else if (mode === "arterial") n = Math.max(4, Math.min(n, 12));
  else if (mode === "stump") n = Math.max(3, Math.min(n, 12));
  else n = Math.max(3, Math.min(n, 18));

  n = ensureRoom(system, n);

  for (let i = 0; i < n; i++) {
    let angle, speedBase, streak, size, life;

    switch (mode) {
      case "death":
        angle = Math.random() * Math.PI * 2;
        speedBase = 4.5 + Math.random() * 7;
        streak = Math.random() > 0.25;
        size = 2.4 + Math.random() * 5;
        life = 0.7 + Math.random() * 0.9;
        break;
      case "arterial":
        angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
        speedBase = 4 + Math.random() * 5.5;
        streak = Math.random() > 0.2;
        size = 2 + Math.random() * 4;
        life = 0.6 + Math.random() * 0.7;
        break;
      case "stump":
        angle = Math.random() * Math.PI * 2;
        speedBase = 3.5 + Math.random() * 5;
        streak = Math.random() > 0.3;
        size = 2 + Math.random() * 3.8;
        life = 0.55 + Math.random() * 0.65;
        break;
      case "drip":
      case "venous":
        angle = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
        speedBase = 1.8 + Math.random() * 2.8;
        streak = Math.random() > 0.55;
        size = 1.5 + Math.random() * 2.8;
        life = 0.45 + Math.random() * 0.5;
        break;
      default:
        angle = Math.random() * Math.PI * 2;
        speedBase = 3 + Math.random() * 5;
        streak = Math.random() > 0.3;
        size = 1.8 + Math.random() * 3.5;
        life = 0.5 + Math.random() * 0.6;
        break;
    }

    const speed =
      speedBase *
      power *
      (1 +
        Math.min(0.45, Math.abs(velocityY) / 28) +
        Math.min(0.3, moveSpeed / 18));

    let vx = Math.cos(angle) * speed + vxBias * 4.5;
    let vy = Math.sin(angle) * speed + vyBias * 2.5;
    if (mode === "arterial") vy -= 1.2 + Math.random() * 1.8;
    if (vx > 5) vx *= 0.45;

    system.particles.push(
      acquireParticle(system, x, y, vx, vy, { streak, size, life })
    );
  }
}

export function bloodDrip(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 3 + Math.floor(Math.random() * 3),
    mode: "venous",
    power: 0.85,
    ...opts,
  });
}

export function bloodArterial(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 6 + Math.floor(Math.random() * 4),
    mode: "arterial",
    power: 0.9,
    ...opts,
  });
}

export function bloodStump(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 5 + Math.floor(Math.random() * 3),
    mode: "stump",
    power: 0.95,
    ...opts,
  });
}

/**
 * Step com LOD:
 * 0 = física full + rot de streak
 * 1 = física simplificada, sem rot
 * 2 = atualiza a cada 2 frames, gravidade dobrada no passo
 */
export function stepBlood(system, dtNorm = 1) {
  if (!system) return;
  frameCounter++;

  const floorY = system.floorY;
  const g = GRAVITY * dtNorm;
  const damp = Math.pow(DAMPING, dtNorm);
  const alive = [];
  const oddFrame = frameCounter & 1;

  for (const p of system.particles) {
    const lod = particleLod(system, p);
    p.lod = lod;

    // LOD2: skip em frames pares
    if (lod >= 2 && oddFrame) {
      alive.push(p);
      continue;
    }

    const stepScale = lod >= 2 ? 2 : 1; // compensar frame skip
    const dt = dtNorm * stepScale;

    p.life -= dt * 0.019;
    if (p.life <= 0) {
      releaseParticle(system, p);
      continue;
    }

    if (lod === 0) {
      p.vy += g * stepScale;
      p.vx *= Math.pow(DAMPING, dt);
      p.vy *= Math.pow(DAMPING, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.streak && Math.abs(p.vx) + Math.abs(p.vy) > 0.35) {
        p.rot = (Math.atan2(p.vy, p.vx) * 180) / Math.PI + 90;
      }
    } else {
      // LOD1/2: sem damp fino, sem rot
      p.vy += g * stepScale * 1.05;
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (p.y + p.height * 0.5 > floorY) {
      releaseParticle(system, p);
      continue;
    }
    if (p.y < 4) {
      p.y = 4;
      p.vy *= -0.25;
    }

    alive.push(p);
  }

  system.particles = alive;
}

/** Snapshot pra draw — LOD2 pode ser menor visualmente */
export function bloodSnapshot(system) {
  if (!system) return [];
  return system.particles;
}

export function clearBlood(system) {
  if (!system) return;
  for (const p of system.particles) releaseParticle(system, p);
  system.particles = [];
}

export function setBloodFloor(system, floorY) {
  if (system) system.floorY = floorY;
}

export function getBloodStats(system) {
  if (!system) return { particles: 0, budget: 1, lod0: 0, lod1: 0, lod2: 0 };
  let lod0 = 0,
    lod1 = 0,
    lod2 = 0;
  for (const p of system.particles) {
    if (p.lod === 0) lod0++;
    else if (p.lod === 1) lod1++;
    else lod2++;
  }
  return {
    particles: system.particles.length,
    budget: bloodBudget(system),
    lod0,
    lod1,
    lod2,
  };
}

