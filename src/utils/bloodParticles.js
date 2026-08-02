/**
 * Sangue otimizado: pool de partículas + canvas (sem manchas no chão).
 * Cap alto o bastante pro jorro agressivo; budget só freia perto do limite.
 */

const GRAVITY = 0.48;
const DAMPING = 0.989;
const MAX_PARTICLES = 180; // teto duro — FPS seguro
const POOL_MAX = 160;

let nextId = 1;

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
  };
}

export function createBloodSystem() {
  return {
    particles: [],
    floorY: typeof window !== "undefined" ? window.innerHeight - 8 : 600,
    pool: [],
  };
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
  }
  return p;
}

function releaseParticle(system, p) {
  p.active = false;
  if (system.pool.length < POOL_MAX) system.pool.push(p);
}

/** 1 = vazio, 0 = cheio. Só aperta quando passa de ~70% do teto. */
export function bloodBudget(system) {
  if (!system) return 0;
  const r = system.particles.length / MAX_PARTICLES;
  if (r < 0.7) return 1;
  return Math.max(0, 1 - (r - 0.7) / 0.3);
}

/** Se está no teto, mata as mais velhas pra abrir espaço pro jorro novo. */
function ensureRoom(system, need) {
  const room = MAX_PARTICLES - system.particles.length;
  if (room >= need) return need;
  const kill = need - room;
  // remove do início (mais antigas no array)
  const victims = system.particles.splice(0, kill);
  for (const p of victims) releaseParticle(system, p);
  return need;
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

  // caps por modo — mais generosos, ainda limitados
  if (mode === "death") n = Math.min(28, Math.floor(n * 1.55));
  else if (mode === "drip" || mode === "venous") n = Math.max(2, Math.min(n, 6));
  else if (mode === "arterial") n = Math.max(4, Math.min(n, 12));
  else if (mode === "stump") n = Math.max(3, Math.min(n, 12));
  else n = Math.max(3, Math.min(n, 18)); // shot

  n = ensureRoom(system, n);

  for (let i = 0; i < n; i++) {
    let angle;
    let speedBase;
    let streak;
    let size;
    let life;

    switch (mode) {
      case "death":
        angle = Math.random() * Math.PI * 2;
        speedBase = 9 + Math.random() * 16;
        streak = Math.random() > 0.25;
        size = 2.4 + Math.random() * 5;
        life = 0.7 + Math.random() * 0.9;
        break;
      case "arterial":
        // jorro direcionado pra cima/lados — mais forte
        angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
        speedBase = 10 + Math.random() * 12;
        streak = Math.random() > 0.2;
        size = 2 + Math.random() * 4;
        life = 0.6 + Math.random() * 0.7;
        break;
      case "stump":
        angle = Math.random() * Math.PI * 2;
        speedBase = 7 + Math.random() * 11;
        streak = Math.random() > 0.3;
        size = 2 + Math.random() * 3.8;
        life = 0.55 + Math.random() * 0.65;
        break;
      case "drip":
      case "venous":
        angle = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
        speedBase = 2.5 + Math.random() * 4;
        streak = Math.random() > 0.55;
        size = 1.5 + Math.random() * 2.8;
        life = 0.45 + Math.random() * 0.5;
        break;
      default: // shot
        angle = Math.random() * Math.PI * 2;
        speedBase = 6 + Math.random() * 10;
        streak = Math.random() > 0.3;
        size = 1.8 + Math.random() * 3.5;
        life = 0.5 + Math.random() * 0.6;
        break;
    }

    const speed =
      speedBase *
      power *
      (1 +
        Math.min(0.85, Math.abs(velocityY) / 20) +
        Math.min(0.55, moveSpeed / 14));

    let vx = Math.cos(angle) * speed + vxBias * 4.5;
    let vy = Math.sin(angle) * speed + vyBias * 2.5;
    if (mode === "arterial") vy -= 3 + Math.random() * 4;
    // menos freio em +X pra não "sumir" o spray
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
    count: 7 + Math.floor(Math.random() * 5),
    mode: "arterial",
    power: 1.2,
    ...opts,
  });
}

export function bloodStump(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 7 + Math.floor(Math.random() * 4),
    mode: "stump",
    power: 1.2,
    ...opts,
  });
}

export function stepBlood(system, dtNorm = 1) {
  if (!system) return;

  const floorY = system.floorY;
  const g = GRAVITY * dtNorm;
  const damp = Math.pow(DAMPING, dtNorm);
  const alive = [];

  for (const p of system.particles) {
    p.life -= dtNorm * 0.019;
    if (p.life <= 0) {
      releaseParticle(system, p);
      continue;
    }

    p.vy += g;
    p.vx *= damp;
    p.vy *= damp;
    p.x += p.vx * dtNorm;
    p.y += p.vy * dtNorm;

    if (p.streak && Math.abs(p.vx) + Math.abs(p.vy) > 0.35) {
      p.rot = (Math.atan2(p.vy, p.vx) * 180) / Math.PI + 90;
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
  if (!system) return { particles: 0, budget: 1 };
  return {
    particles: system.particles.length,
    budget: bloodBudget(system),
  };
}

