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

## Contato com spike (2026-08-07)

Detecção em `utils/collision.js`:
- `bodyPart` fino: head | chest | hip | lFoot | rFoot | lKnee | rKnee | lHand | rHand | lShoulder | rShoulder
- `contactPoint`, `distToTip`, `surfaceNormal` no hit packeado

Fluxo:
```
findAllSpikeCollisionsQuad → packHit (membro + ponto)
  → classifyDeath (DeathEvent rico)
  → createRagdoll (planck): pickAttach(membro) + DistanceJoint quebrável
  → step: reactionForce → break quando > breakForce
```

Pin:
- Membro distal → amputação física + preso no tip (break alto)
- Tronco/cabeça → pin quebrável ∝ velocidade + resistência do membro
- Teto: breakForce um pouco menor (gravidade ajuda a soltar)
- Torque/rotação vêm da física (inércia + gravidade + joint), não de angle fixo

## Próximos passos (ainda não feitos)

1. `combat/damage.js` — extrair sistema de membros do Player
2. `PlayerAlive.jsx` / `PlayerDead.jsx` — split do render
3. Loop DYING no App sem matar o RAF dos spikes
4. Multi-contato / vários pins simultâneos
5. Resistência configurável por membro / tipo de spike
