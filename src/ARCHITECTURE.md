# Arquitetura (morte / física)

## Pastas

| Pasta | Responsabilidade |
|-------|------------------|
| `core/` | Estados do jogo (`GAME_STATE`) |
| `death/` | Tipos, classificação, behaviors (pose/impulsos) |
| `physics/` | Verlet puro, body factory, ragdoll controller |
| `utils/ragdoll.js` | **Facade** — Player importa daqui (não quebra) |
| `utils/collision.js` | Hitboxes → contact info (sem tipo de morte) |

## Fluxo

```
PLAYING: colisão → classifyDeath() → DeathEvent
DYING:   createRagdoll(opts) → applyDeathBehavior + verlet step
DEAD:    GameOver
```

## Onde mudar o quê

- **Regra hang vs impale** → `death/classify.js`
- **Timer do hang, impulsos** → `death/behaviors.js`
- **Gravidade / damping** → `physics/verlet.js`
- **Formato do bonequinho** → `physics/bodyFactory.js`
- **Loop de morte (scroll, pin contínuo)** → `physics/ragdollController.js`

## Próximos passos (ainda não feitos)

1. `combat/damage.js` — extrair sistema de membros do Player
2. `PlayerAlive.jsx` / `PlayerDead.jsx` — split do render
3. Loop DYING no App sem matar o RAF dos spikes
