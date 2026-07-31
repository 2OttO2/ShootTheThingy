/**
 * Sangue otimizado: pool de partículas + canvas (sem manchas no chão).
 */

const GRAVITY = 0.42;
const DAMPING = 0.991;
const MAX_PARTICLES = 100;

let nextId = 1;

function createParticle(x, y, vx, vy, opts = {}) {
  const size = opts.size ?? 2 + Math.random() * 3.5;
  const life = opts.life ?? 0.5 + Math.random() * 0.7;
  return {
    id: nextId++,
    x,
    y,
    vx,
    vy,
    size,
    width: opts.streak ? size * (0.35 + Math.random() * 0.4) : size,
    height: opts.streak ? size * (2 + Math.random() * 3.5) : size,
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
    const size = opts.size ?? 2 + Math.random() * 3.5;
    const life = opts.life ?? 0.5 + Math.random() * 0.7;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.width = opts.streak ? size * (0.35 + Math.random() * 0.4) : size;
    p.height = opts.streak ? size * (2 + Math.random() * 3.5) : size;
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
  if (system.pool.length < 80) system.pool.push(p);
}

export function bloodBudget(system) {
  if (!system) return 0;
  return Math.max(0, 1 - system.particles.length / MAX_PARTICLES);
}

export function bloodBurst(system, x, y, opts = {}) {
  if (!system) return;

  const budget = bloodBudget(system);
  if (budget < 0.05) return;

  const {
    count = 12,
    velocityY = 0,
    moveSpeed = 0,
    mode = "shot",
    power = 1,
  } = opts;

  const vyBias = Math.max(-1, Math.min(1, velocityY / 14));
  const vxBias = -Math.min(1.2, Math.max(0, moveSpeed) / 9);

  let n = Math.ceil(count * budget * (0.55 + budget * 0.45));
  n = Math.max(1, Math.min(n, 14));

  if (mode === "death") n = Math.min(18, Math.floor(n * 1.4));
  if (mode === "drip" || mode === "venous") n = Math.max(1, Math.min(n, 4));
  if (mode === "arterial") n = Math.max(2, Math.min(n, 7));
  if (mode === "stump") n = Math.max(2, Math.min(n, 8));

  for (let i = 0; i < n; i++) {
    if (system.particles.length >= MAX_PARTICLES) break;

    let angle;
    let speedBase;
    let streak = false;
    let size;
    let life;

    switch (mode) {
      case "death":
        angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
        speedBase = 6 + Math.random() * 12;
        streak = Math.random() > 0.3;
        size = 2 + Math.random() * 4;
        life = 0.9 + Math.random() * 0.9;
        break;
      case "drip":
      case "venous":
        angle = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
        speedBase = 1 + Math.random() * 2.5;
        streak = Math.random() > 0.75;
        size = 1.2 + Math.random() * 2.2;
        life = 0.45 + Math.random() * 0.5;
        break;
      case "arterial":
        angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
        angle += vxBias * 0.3;
        speedBase = 7 + Math.random() * 10;
        streak = Math.random() > 0.25;
        size = 1.8 + Math.random() * 3.2;
        life = 0.55 + Math.random() * 0.6;
        break;
      case "stump":
        angle = Math.PI / 2 + (Math.random() - 0.5) * 1.5;
        speedBase = 2.5 + Math.random() * 6;
        streak = Math.random() > 0.45;
        size = 2 + Math.random() * 3.5;
        life = 0.65 + Math.random() * 0.7;
        break;
      default:
        angle = Math.random() * Math.PI * 2;
        speedBase = 3.5 + Math.random() * 8;
        streak = Math.random() > 0.35;
        size = 1.6 + Math.random() * 3;
        life = 0.45 + Math.random() * 0.55;
        break;
    }

    const speed =
      speedBase *
      power *
      (1 + Math.min(0.7, Math.abs(velocityY) / 22) + Math.min(0.45, moveSpeed / 16));

    let vx = Math.cos(angle) * speed + vxBias * 4;
    let vy = Math.sin(angle) * speed + vyBias * 2;
    if (mode === "arterial") vy -= 2 + Math.random() * 3;
    if (vx > 3.5) vx *= 0.3;

    system.particles.push(
      acquireParticle(system, x, y, vx, vy, { streak, size, life })
    );
  }
}

export function bloodDrip(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 2 + Math.floor(Math.random() * 2),
    mode: "venous",
    power: 0.75,
    ...opts,
  });
}

export function bloodArterial(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 4 + Math.floor(Math.random() * 3),
    mode: "arterial",
    power: 1.05,
    ...opts,
  });
}

export function bloodStump(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 5 + Math.floor(Math.random() * 3),
    mode: "stump",
    power: 1.1,
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
    p.life -= dtNorm * 0.018;
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

    // chão → some (sem mancha)
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

