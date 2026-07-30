/**
 * Sistema de partículas de sangue (estilo Happy Wheels).
 * Física simples: gravidade, damping, colisão com chão.
 */

const GRAVITY = 0.38;
const DAMPING = 0.992;
const FLOOR_FRICTION = 0.72;
const MAX_PARTICLES = 220;

let nextId = 1;

function createParticle(x, y, vx, vy, opts = {}) {
  const size = opts.size ?? 2 + Math.random() * 4;
  return {
    id: nextId++,
    x,
    y,
    vx,
    vy,
    size,
    width: opts.streak ? size * (0.4 + Math.random() * 0.4) : size,
    height: opts.streak ? size * (2.5 + Math.random() * 3.5) : size,
    life: opts.life ?? 0.7 + Math.random() * 0.9,
    maxLife: opts.life ?? 0.7 + Math.random() * 0.9,
    rot: opts.rot ?? (Math.atan2(vy, vx) * 180) / Math.PI + 90,
    streak: !!opts.streak,
    settled: false,
  };
}

export function createBloodSystem() {
  return {
    particles: [],
    floorY: typeof window !== "undefined" ? window.innerHeight - 8 : 600,
  };
}

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
  if (mode === "death") n = Math.floor(count * 1.6);
  if (mode === "drip") n = Math.max(2, Math.floor(count * 0.25));

  for (let i = 0; i < n; i++) {
    let angle = Math.random() * Math.PI * 2;

    if (mode === "death") {
      angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
    } else if (mode === "drip") {
      angle = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    }

    const speedBase =
      mode === "death"
        ? 6 + Math.random() * 14
        : mode === "drip"
          ? 1 + Math.random() * 3
          : 4 + Math.random() * 10;

    const speed =
      speedBase *
      power *
      (1 + Math.min(0.9, Math.abs(velocityY) / 20) + Math.min(0.6, moveSpeed / 14));

    let vx = Math.cos(angle) * speed + vxBias * 5;
    let vy = Math.sin(angle) * speed + vyBias * 3;

    if (vx > 3) vx *= 0.3;

    const streak = mode !== "drip" && Math.random() > 0.3;

    system.particles.push(
      createParticle(x, y, vx, vy, {
        streak,
        size: mode === "death" ? 2.5 + Math.random() * 5 : 1.8 + Math.random() * 3.5,
        life: mode === "death" ? 1.1 + Math.random() * 1.2 : 0.55 + Math.random() * 0.7,
      })
    );
  }

  if (system.particles.length > MAX_PARTICLES) {
    system.particles.splice(0, system.particles.length - MAX_PARTICLES);
  }
}

export function bloodDrip(system, x, y, opts = {}) {
  bloodBurst(system, x, y, {
    count: 3 + Math.floor(Math.random() * 3),
    mode: "drip",
    power: 0.7,
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

      if (p.streak && Math.abs(p.vx) + Math.abs(p.vy) > 0.4) {
        p.rot = (Math.atan2(p.vy, p.vx) * 180) / Math.PI + 90;
      }

      if (p.y + p.height * 0.5 > floorY) {
        p.y = floorY - p.height * 0.5;
        p.vy *= -0.25;
        p.vx *= FLOOR_FRICTION;
        if (Math.abs(p.vy) < 0.8 && Math.abs(p.vx) < 0.6) {
          p.settled = true;
          p.vx = 0;
          p.vy = 0;
          p.height = Math.max(2, p.height * 0.35);
          p.width = p.width * 1.6;
          p.streak = false;
        }
      }

      if (p.y < 4) {
        p.y = 4;
        p.vy *= -0.3;
      }
    } else {
      p.life -= dtNorm * 0.01;
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
  }));
}

export function clearBlood(system) {
  if (system) system.particles = [];
}

export function setBloodFloor(system, floorY) {
  if (system) system.floorY = floorY;
}
