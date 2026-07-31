/**
 * Sistema de partículas de sangue — sangramento realista.
 * Modos: shot | death | drip | arterial | venous | stump
 */

const GRAVITY = 0.42;
const DAMPING = 0.991;
const FLOOR_FRICTION = 0.68;
const MAX_PARTICLES = 320;

let nextId = 1;

function createParticle(x, y, vx, vy, opts = {}) {
  const size = opts.size ?? 2 + Math.random() * 4;
  const life = opts.life ?? 0.7 + Math.random() * 0.9;
  return {
    id: nextId++,
    x,
    y,
    vx,
    vy,
    size,
    width: opts.streak ? size * (0.35 + Math.random() * 0.45) : size,
    height: opts.streak ? size * (2.2 + Math.random() * 4) : size * (0.7 + Math.random() * 0.5),
    life,
    maxLife: life,
    rot: opts.rot ?? (Math.atan2(vy, vx) * 180) / Math.PI + 90,
    streak: !!opts.streak,
    settled: false,
    pool: !!opts.pool, // mancha no chão mais durável
  };
}

export function createBloodSystem() {
  return {
    particles: [],
    floorY: typeof window !== "undefined" ? window.innerHeight - 8 : 600,
  };
}

/**
 * Emissão genérica de sangue
 * mode:
 *  - shot: impacto de tiro
 *  - death: explosão grande
 *  - drip: gota leve
 *  - venous: sangramento contínuo lento
 *  - arterial: jato pulsátil (pra cima / fora)
 *  - stump: coto seccionado (volume alto)
 */
export function bloodBurst(system, x, y, opts = {}) {
  if (!system) return;

  const {
    count = 20,
    velocityY = 0,
    moveSpeed = 0,
    mode = "shot",
    power = 1,
  } = opts;

  const vyBias = Math.max(-1, Math.min(1, velocityY / 14));
  const vxBias = -Math.min(1.2, Math.max(0, moveSpeed) / 9);

  let n = count;
  if (mode === "death") n = Math.floor(count * 1.7);
  if (mode === "drip") n = Math.max(1, Math.floor(count * 0.3));
  if (mode === "venous") n = Math.max(2, Math.floor(count * 0.4));
  if (mode === "arterial") n = Math.max(4, Math.floor(count * 0.7));
  if (mode === "stump") n = Math.max(5, Math.floor(count * 0.85));

  for (let i = 0; i < n; i++) {
    let angle;
    let speedBase;
    let streak = false;
    let size;
    let life;

    switch (mode) {
      case "death":
        angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.55;
        speedBase = 7 + Math.random() * 15;
        streak = Math.random() > 0.25;
        size = 2.5 + Math.random() * 5.5;
        life = 1.2 + Math.random() * 1.3;
        break;

      case "drip":
      case "venous":
        // cai pra baixo, leve espalhamento
        angle = Math.PI / 2 + (Math.random() - 0.5) * (mode === "venous" ? 0.85 : 0.5);
        speedBase = mode === "venous" ? 1.2 + Math.random() * 2.8 : 0.8 + Math.random() * 2.2;
        streak = Math.random() > 0.7;
        size = 1.4 + Math.random() * 2.8;
        life = 0.6 + Math.random() * 0.7;
        break;

      case "arterial":
        // jato pra fora/cima — pulso
        angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
        // um pouco pro lado do movimento (trás)
        angle += vxBias * 0.35;
        speedBase = 8 + Math.random() * 12;
        streak = Math.random() > 0.2;
        size = 2 + Math.random() * 4;
        life = 0.75 + Math.random() * 0.85;
        break;

      case "stump":
        // volume do coto — leque largo pra baixo/lados
        angle = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        speedBase = 3 + Math.random() * 7;
        streak = Math.random() > 0.4;
        size = 2.2 + Math.random() * 4.5;
        life = 0.9 + Math.random() * 1.0;
        break;

      default: // shot
        angle = Math.random() * Math.PI * 2;
        speedBase = 4 + Math.random() * 10;
        streak = Math.random() > 0.3;
        size = 1.8 + Math.random() * 3.5;
        life = 0.55 + Math.random() * 0.75;
        break;
    }

    const speed =
      speedBase *
      power *
      (1 + Math.min(0.9, Math.abs(velocityY) / 20) + Math.min(0.55, moveSpeed / 14));

    let vx = Math.cos(angle) * speed + vxBias * (mode === "arterial" ? 3 : 5);
    let vy = Math.sin(angle) * speed + vyBias * 2.5;

    // arterial: empurra um pouco mais pra cima
    if (mode === "arterial") {
      vy -= 2 + Math.random() * 4;
    }

    if (vx > 3.5) vx *= 0.3;

    system.particles.push(
      createParticle(x, y, vx, vy, {
        streak,
        size,
        life,
      })
    );
  }

  if (system.particles.length > MAX_PARTICLES) {
    // remove as mais antigas que já settled primeiro
    system.particles.sort((a, b) => {
      if (a.settled !== b.settled) return a.settled ? -1 : 1;
      return a.life - b.life;
    });
    system.particles.splice(0, system.particles.length - MAX_PARTICLES);
  }
}

export function bloodDrip(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 2 + Math.floor(Math.random() * 3),
    mode: "venous",
    power: 0.75,
    ...opts,
  });
}

/** Jato arterial (chamar em pulsos ~400-700ms) */
export function bloodArterial(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 6 + Math.floor(Math.random() * 6),
    mode: "arterial",
    power: 1.1,
    ...opts,
  });
}

/** Sangue de coto seccionado */
export function bloodStump(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 8 + Math.floor(Math.random() * 8),
    mode: "stump",
    power: 1.2,
    ...opts,
  });
}

export function stepBlood(system, dtNorm = 1) {
  if (!system || !system.particles.length) return;

  const floorY = system.floorY;
  const g = GRAVITY * dtNorm;
  const damp = Math.pow(DAMPING, dtNorm);

  const alive = [];

  for (const p of system.particles) {
    p.life -= dtNorm * 0.016;

    if (p.life <= 0) continue;

    if (!p.settled) {
      p.vy += g;
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dtNorm;
      p.y += p.vy * dtNorm;

      if (p.streak && Math.abs(p.vx) + Math.abs(p.vy) > 0.35) {
        p.rot = (Math.atan2(p.vy, p.vx) * 180) / Math.PI + 90;
      }

      if (p.y + p.height * 0.5 > floorY) {
        p.y = floorY - p.height * 0.5;
        p.vy *= -0.22;
        p.vx *= FLOOR_FRICTION;
        if (Math.abs(p.vy) < 0.7 && Math.abs(p.vx) < 0.55) {
          p.settled = true;
          p.vx = 0;
          p.vy = 0;
          p.height = Math.max(1.5, p.height * 0.3);
          p.width = p.width * (1.4 + Math.random() * 0.8);
          p.streak = false;
          p.pool = true;
          // manchas duram bem mais
          p.life = Math.max(p.life, 2.5 + Math.random() * 3);
          p.maxLife = p.life;
        }
      }

      if (p.y < 4) {
        p.y = 4;
        p.vy *= -0.28;
      }
    } else {
      // poça some bem devagar
      p.life -= dtNorm * (p.pool ? 0.004 : 0.01);
    }

    if (p.life > 0) alive.push(p);
  }

  system.particles = alive;
}

export function bloodSnapshot(system) {
  if (!system) return [];
  return system.particles.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    rot: p.rot,
    opacity: Math.max(0, Math.min(1, p.life / Math.max(0.01, p.maxLife))),
    settled: p.settled,
    pool: p.pool,
  }));
}

export function clearBlood(system) {
  if (system) system.particles = [];
}

export function setBloodFloor(system, floorY) {
  if (system) system.floorY = floorY;
}

