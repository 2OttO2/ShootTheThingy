# Arquitetura — colisão e física

## Pipeline de colisão

```
processSpikeFrame()                    systems/spikeCollision.js
  ├─ buildPlayerObb()
  ├─ querySpikeHits()                  hitboxes + cull + quadtree + overlap
  ├─ resolveSpikeContacts()            utils/collision.js
  │    ├─ analyzeContact()             feature, normal, penetração, bodyPart
  │    ├─ classifyKind()               impale_core | impale_limb | bounce
  │    └─ computeImpulseY()            reflexão vy (e=0.78)
  └─ planSpikeResponse()               ResponsePlan (comandos puros)
       └─ App só aplica o plan
```

## Responsabilidades

| Módulo | Faz |
|--------|-----|
| `utils/collision.js` | Geometria OBB×triângulo, feature, normal, kind |
| `systems/spikeCollision.js` | Query + plano de resposta (impale/bounce/pin) |
| `App.jsx` | Aplica plan (vy, pin, sever, momentum) |
| `physics/livingRagdoll.js` | Física única do personagem + pins |

## ResponsePlan

Campos principais: `velocityY`, `playerY`, `corePinned`, `pin`, `impact`,
`severLimb`, `stuckLimb`, `momentumMul`, `separateY`, `cooldownMs`, `noShoot`.
