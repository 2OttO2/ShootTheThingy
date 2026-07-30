export const BASE_GAME_SPEED = 0; // pode parar por completo
export const INITIAL_GAME_SPEED = 3.5; // velocidade ao começar/reiniciar
export const MAX_GAME_SPEED = 10;

export const MOMENTUM_GAIN = 1.35; // ganho por tiro
export const MOMENTUM_DECAY = 0.012; // decaimento contínuo

export const SPIKE_SIZE = 64;
export const SPIKE_SPEED = 4;

export const PLAYER_SIZE = 40;

export const GRAVITY = 0.3;
export const JUMP_FORCE = -15; // fallback
export const BOUNCE = 0.8; // retenção da velocidade vertical no bounce
export const BOUNCE_SPEED_LOSS = 0.02; // % da speed horizontal perdida no bounce
export const FALL_SPEED_GAIN = 0.004;  // quanto da queda vira speed
export const FALL_SPEED_CAP = 0.8;    // limite por frame

export const TETO_HEIGHT = 5;
export const GROUND_HEIGHT = 5;

// morte por ficar parado
export const STALL_DEATH_MS = 3000; // speed 0 por este tempo = morte
export const DEATH_DELAY_MS = 5000; // espera antes da tela de score (futura animação)

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
    scoreMultiplier:1.0,
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
    scoreMultiplier:0.5,
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
    scoreMultiplier: 2.0,
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
    scoreMultiplier: 5.0,
  },
};
