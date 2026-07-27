export const BASE_GAME_SPEED = 1;
export const MAX_GAME_SPEED = 10;

export const MOMENTUM_GAIN = 1.35;
export const MOMENTUM_DECAY = 0.005;

export const SPIKE_SIZE = 64;
export const SPIKE_SPEED = 4;

export const PLAYER_SIZE = 40;

export const GRAVITY = 0.3;
export const JUMP_FORCE = -15; // fallback
export const BOUNCE = 0.8;

export const TETO_HEIGHT = 5;
export const GROUND_HEIGHT = 5;

// =====================
// ARMAS
// impact  = força do recoil (empurra o player)
// firerate = delay mínimo entre tiros (ms)
// reload   = tempo de recarga (ms)
// magazine = tiros antes de recarregar
// =====================

export const WEAPONS = {
  pistol: {
    id: "pistol",
    name: "Pistola",
    description: "Baixo impacto. Cadência alta.",
    impact: -12,
    firerate: 280,
    reload: 2000,
    magazine: 12,
    color: "#f1c40f",
  },
  sub: {
    id: "sub",
    name: "Sub",
    description: "Pouco impacto, Cadência muito alta.",
    impact: -7,
    firerate: 90,
    reload: 3000,
    magazine: 24,
    color: "#2ecc71",
  },
  shotgun: {
    id: "shotgun",
    name: "Escopeta",
    description: "Impacto médio, Cadência média.",
    impact: -22,
    firerate: 700,
    reload: 3000,
    magazine: 6,
    color: "#e67e22",
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    description: "Impacto absurdo, Cadência baixa.",
    impact: -32,
    firerate: 1100,
    reload: 2000,
    magazine: 5,
    color: "#e74c3c",
  },
};
