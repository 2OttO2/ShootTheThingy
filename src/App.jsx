import { useState, useEffect, useRef } from "react";

import Player from "./components/Player/Player.jsx";
import Spikes from "./components/Spikes/Spikes.jsx";
import Teto from "./components/Teto/Teto.jsx";
import Ground from "./components/Ground/Ground.jsx";
import DebugHitboxes from "./utils/DebugHitboxes.jsx";
import GameOver from "./components/GameOver/GameOver.jsx";
import Menu from "./components/Menu/Menu.jsx";
import WeaponSelect from "./components/WeaponSelect/WeaponSelect.jsx";
import Scores, { saveScore } from "./components/Scores/Scores.jsx";
import Hud from "./components/Hud/Hud.jsx";
import BloodLayer from "./components/Blood/BloodLayer.jsx";

import useSpikes from "./hooks/useSpikes.js";
import usePlayerPhysics from "./hooks/usePlayerPhysics.js";
import { findAllSpikeCollisionsQuad } from "./utils/collision.js";
import { buildSpikeQuadTree } from "./utils/quadtree.js";
import { cullSpikeHitboxes } from "./utils/spatialHash.js";
import { classifyDeath, classifyStall, DeathType } from "./death/index.js";
import { createSpikeHitboxes } from "./utils/spikeHitboxes.js";

import {
  BASE_GAME_SPEED,
  INITIAL_GAME_SPEED,
  MAX_GAME_SPEED,
  MOMENTUM_GAIN,
  MOMENTUM_DECAY,
  GRAVITY,
  JUMP_FORCE,
  BOUNCE,
  BOUNCE_SPEED_LOSS,
  FALL_SPEED_GAIN,
  FALL_SPEED_CAP,
  TETO_HEIGHT,
  GROUND_HEIGHT,
  STALL_DEATH_MS,
  DEATH_DELAY_MS,
  DEATH_ZERO_SPEED_MS,
  DEATH_MOMENTUM_DECAY_MULTIPLIER,
  SPIKE_SPEED,
  WEAPONS,
} from "./constants/game.js";

import "./App.css";

const GAME_STATE = {
  MENU: "menu",
  WEAPON_SELECT: "weapon_select",
  PLAYING: "playing",
  DYING: "dying", // speed 0 por 3s — espera animação antes do GameOver
  DEAD: "dead",
  SCORES: "scores",
};

// Offsets locais (relativos ao peito) dos pontos do boneco vivo — devem
// bater com o objeto `local` em physics/livingRagdoll.js. Usados só pra
// calcular o quanto o corpo realmente se estende pra cima/baixo em cada
// ângulo, pra colisão com chão/teto não flutuar nem afundar.
const BODY_LOCAL_POINTS = [
  [0, -20], // head
  [0, 20], // hip
  [-12, -2], [12, -2], // shoulders
  [-16, 18], [16, 18], // hands
  [-8, 36], [8, 36], // knees
  [-10, 52], [10, 52], // feet
];

// Retorna o quanto o corpo se estende acima (top, valor <= 0) e abaixo
// (bottom, valor >= 0) do "peito" (cy), pro ângulo atual.
function getBodyVerticalExtents(angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let top = 0;
  let bottom = 0;
  for (const [lx, ly] of BODY_LOCAL_POINTS) {
    const off = lx * sin + ly * cos;
    if (off < top) top = off;
    if (off > bottom) bottom = off;
  }
  return { top, bottom };
}

function App() {
  
  //munição / reload 
  const ammoRef = useRef(0);
  const isReloadingRef = useRef(false);
  const reloadTimerRef = useRef(0);
  const [ammo, setAmmo] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [shotTick, setShotTick] = useState(0);
  const [deathType, setDeathType] = useState("none");
  const deathTypeRef = useRef("none"); // leitura confiável dentro do gameLoop
  const [impactEvent, setImpactEvent] = useState(null);
  const impactIdRef = useRef(0);
  const [pinEvent, setPinEvent] = useState(null);
  const pinIdRef = useRef(0);
  /** true enquanto núcleo (cabeça/peito) está impalado no spike de baixo */
  const corePinnedRef = useRef(false);
  const settledRef = useRef(false); // none | spike_side | spike_hang | spike_impale | stall
  const [deathSpike, setDeathSpike] = useState(null); // { tipX, tipY, side }
  const [deathObstacles, setDeathObstacles] = useState([]); // hitboxes na morte
  const [velocityY, setVelocityY] = useState(0);

  // debug
  const [debugHitboxes, setDebugHitboxes] = useState([]);

  // distance
  const [distance, setDistance] = useState(0);
  const distanceRef = useRef(0);
  const [displaySpeed,setDisplaySpeed] = useState(0);

  // game state — começa no MENU
  const [gameState, setGameState] = useState(GAME_STATE.MENU);
  const isDeadRef = useRef(false); // true só no fim (score) OU legado
  const noShootRef = useRef(false); // tocou spike: sem tiro, arcade segue
  const spikeHitCooldown = useRef(0);
  const [externalSever, setExternalSever] = useState({
    legLeft: false,
    legRight: false,
    armLeft: false,
    armRight: false,
  });
  const [stuckLimbs, setStuckLimbs] = useState([]); // {id, limb, x, y}
  const stuckLimbsRef = useRef([]);
  const maxDistanceRef = useRef(0);
  const playerAngleRef = useRef(0); // radianos — hitbox acompanha rotação
  const zeroSpeedTimer = useRef(0); // ms acumulados com speed 0 (enquanto vivo — morte por stall)
  const deathZeroSpeedTimer = useRef(0); // ms acumulados com speed 0 depois de isDead (fim de jogo)
  const deathFinalizedRef = useRef(false); // garante que o GAME_STATE.DEAD só é setado 1x
  const deathDelayTimeout = useRef(null);

  // arma selecionada
  const [selectedWeaponId, setSelectedWeaponId] = useState(null);
  const selectedWeapon = selectedWeaponId ? WEAPONS[selectedWeaponId] : null;
  const selectedWeaponRef = useRef(null);
  selectedWeaponRef.current = selectedWeapon;

  const gameSpeed = useRef(BASE_GAME_SPEED);
  const momentum = useRef(0);

  // =====================
  // HOOKS
  // =====================
  const {
    spikes,
    spikesRef,
    updateSpikes,
    resetSpikes,
  } = useSpikes();

  const {
    drawY,
    setDrawY,
    playerY,
    speed,
    jumpCooldown,
    spaceHeld,
    resetPlayer,
  } = usePlayerPhysics(350);

  const animationRef = useRef(null);
  const lastTime = useRef(0);
  const bloodRef = useRef(null);

  // limites
  const teto = TETO_HEIGHT; // Teto.module.css: height 5px, top:0 → borda em y=5
  // linha real do chão — Ground.module.css: height 5px, bottom:1px →
  // a borda de cima da barra fica em innerHeight - 1 - 5
  const groundLineY = window.innerHeight - GROUND_HEIGHT - 1;



  // =====================
  // NAVEGAÇÃO
  // =====================
  function goToMenu() {
    isDeadRef.current = true; // para o loop
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (deathDelayTimeout.current) {
      clearTimeout(deathDelayTimeout.current);
      deathDelayTimeout.current = null;
    }
    zeroSpeedTimer.current = 0;
    setGameState(GAME_STATE.MENU);
  }

  function goToWeaponSelect() {
    setGameState(GAME_STATE.WEAPON_SELECT);
  }

  function goToScores() {
    setGameState(GAME_STATE.SCORES);
  }

  function emitImpact({ strength, fx, fy, part }) {
    impactIdRef.current += 1;
    setImpactEvent({
      id: impactIdRef.current,
      strength,
      fx: fx ?? 0,
      fy: fy ?? 0,
      part: part || "chest",
    });
  }

  function emitPin({ part, x, y, side, isCore, releaseAfterMs }) {
    pinIdRef.current += 1;
    setPinEvent({
      id: pinIdRef.current,
      part: part || "chest",
      x,
      y,
      side: side || "bottom",
      isCore: !!isCore,
      releaseAfterMs: releaseAfterMs ?? null,
    });
  }

  // O ragdoll (Player.jsx) ainda chama isso quando o corpo para de se
  // mexer visualmente, mas quem decide o fim de jogo agora é só o timer
  // de "speed <= 0 por DEATH_ZERO_SPEED_MS" no gameLoop — mantido aqui
  // apenas para não quebrar a prop esperada pelo Player.
  function onBodySettled() {
    settledRef.current = true;
  }

  function startGame(weaponId) {
    
    // reseta munição da arma escolhida
    const weapon = WEAPONS[weaponId];
    const mag = weapon ? weapon.magazine : 12;
    ammoRef.current = mag;
    setAmmo(mag);
    isReloadingRef.current = false;
    setIsReloading(false);
    reloadTimerRef.current = 0;

    setSelectedWeaponId(weaponId);
    isDeadRef.current = false;
    noShootRef.current = false;
    spikeHitCooldown.current = 0;
    setExternalSever({ legLeft: false, legRight: false, armLeft: false, armRight: false });
    setStuckLimbs([]);
    stuckLimbsRef.current = [];
    setPinEvent(null);
    corePinnedRef.current = false;
    maxDistanceRef.current = 0;
    zeroSpeedTimer.current = 0;
    deathZeroSpeedTimer.current = 0;
    deathFinalizedRef.current = false;
    if (deathDelayTimeout.current) {
      clearTimeout(deathDelayTimeout.current);
      deathDelayTimeout.current = null;
    }
    deathTypeRef.current = "none";
    setDeathType("none");
    setDeathSpike(null);
    setDeathObstacles([]);
    setShotTick(0);
    setVelocityY(0);
    bloodRef.current?.clear();
    setGameState(GAME_STATE.PLAYING);

    resetPlayer();
    momentum.current = INITIAL_GAME_SPEED;
    gameSpeed.current = INITIAL_GAME_SPEED;
    distanceRef.current = 0;
    setDistance(0);
    setDisplaySpeed(INITIAL_GAME_SPEED);
    resetSpikes();
    lastTime.current = 0;

    animationRef.current = requestAnimationFrame(gameLoop);
  }

  function resetGame() {
    // reinicia com a mesma arma
    isDeadRef.current = false;
    noShootRef.current = false;
    spikeHitCooldown.current = 0;
    setExternalSever({ legLeft: false, legRight: false, armLeft: false, armRight: false });
    setStuckLimbs([]);
    stuckLimbsRef.current = [];
    setPinEvent(null);
    corePinnedRef.current = false;
    maxDistanceRef.current = 0;
    zeroSpeedTimer.current = 0;
    deathZeroSpeedTimer.current = 0;
    deathFinalizedRef.current = false;
    if (deathDelayTimeout.current) {
      clearTimeout(deathDelayTimeout.current);
      deathDelayTimeout.current = null;
    }
    deathTypeRef.current = "none";
    setDeathType("none");
    setDeathSpike(null);
    setDeathObstacles([]);
    setShotTick(0);
    setVelocityY(0);
    bloodRef.current?.clear();
    setGameState(GAME_STATE.PLAYING);

    resetPlayer();
    momentum.current = INITIAL_GAME_SPEED;
    gameSpeed.current = INITIAL_GAME_SPEED;
    distanceRef.current = 0;
    setDistance(0);
    setDisplaySpeed(INITIAL_GAME_SPEED);
    resetSpikes();
    lastTime.current = 0;

    // reseta munição
    const mag = selectedWeapon ? selectedWeapon.magazine : 12;
    ammoRef.current = mag;
    setAmmo(mag);
    isReloadingRef.current = false;
    setIsReloading(false);
    reloadTimerRef.current = 0;
    ammoRef.current = selectedWeapon ? selectedWeapon.magazine : 12;
    isReloadingRef.current = false;
    reloadTimerRef.current = 0;

    animationRef.current = requestAnimationFrame(gameLoop);
  }

  // =====================
  // GAME LOOP
  // =====================
  const gameLoop = (time) => {
    if (lastTime.current === 0) {
      lastTime.current = time;
    }

    const deltaTime = Math.min(time - lastTime.current, 50);
    lastTime.current = time;
    const dt = deltaTime / 16.67;

    // momentum / speed — decai até zero (também durante DYING)
    // na morte decai bem mais rápido, pra speed cair visivelmente e o
    // jogo poder terminar logo depois
    const decayMul = isDeadRef.current ? DEATH_MOMENTUM_DECAY_MULTIPLIER : 1;
    momentum.current -= MOMENTUM_DECAY * decayMul * dt;
    if (momentum.current < 0) {
      momentum.current = 0;
    }
    gameSpeed.current = Math.min(momentum.current, MAX_GAME_SPEED);

    distanceRef.current += gameSpeed.current * dt;
    if (distanceRef.current > maxDistanceRef.current) {
      maxDistanceRef.current = distanceRef.current;
    }
    setDistance(Math.floor(maxDistanceRef.current));
    setDisplaySpeed(gameSpeed.current);

    // membros presos no spike andam com o mapa
    if (stuckLimbsRef.current.length && gameSpeed.current > 0) {
      const dx = (SPIKE_SPEED + gameSpeed.current) * dt;
      stuckLimbsRef.current = stuckLimbsRef.current.map((s) => ({
        ...s,
        x: s.x - dx,
      }));
      setStuckLimbs(stuckLimbsRef.current);
    }

    // Spikes rolam sempre que houver speed — vivo ou morto. Só param
    // quando gameSpeed.current chega a 0.
    if (gameSpeed.current > 0) {
      updateSpikes(dt, gameSpeed.current);
    }

    // hitboxes de debug sempre acompanham a posição atual dos spikes,
    // vivo ou morto — senão desalinham do desenho quando o mapa
    // continua andando depois da morte.
    setDebugHitboxes([
      ...createSpikeHitboxes(spikesRef.current.top, "top"),
      ...createSpikeHitboxes(spikesRef.current.bottom, "bottom"),
    ]);

    // noShoot: só bloqueia tiro no input.
    // Núcleo impalado no chão: congela Y/vy (corpo fica no pin).
    // Caso contrário: física arcade normal.

    if (corePinnedRef.current) {
      speed.current = 0;
    } else {
      // player physics — arcade estável (não Planck)
      speed.current += GRAVITY * dt;
      playerY.current += speed.current * dt;

      if (speed.current > 0) {
        const fallGain = Math.min(
          speed.current * FALL_SPEED_GAIN * dt,
          FALL_SPEED_CAP * dt
        );
        momentum.current = Math.min(
          momentum.current + fallGain,
          MAX_GAME_SPEED
        );
      }

      // Extremidades reais do corpo (cabeça/ombros/mãos/joelhos/pés),
      // rotacionadas pelo ângulo atual — iguais às usadas no ragdoll vivo
      // (physics/livingRagdoll.js). Corrige o pé afundando no chão quando
      // em pé e a "levitação" quando de cabeça pra baixo.
      {
        const ang = playerAngleRef.current || 0;
        const { top: extTop, bottom: extBottom } = getBodyVerticalExtents(ang);
        const cy = playerY.current + 32; // mesmo "cy" do ragdoll vivo
        const bodyTopY = cy + extTop; // ponto mais alto do corpo agora
        const bodyBottomY = cy + extBottom; // ponto mais baixo do corpo agora

        // teto — o ponto mais alto do corpo não pode passar da linha do teto
        if (bodyTopY <= teto) {
          const impactStr = Math.min(8, 1.2 + Math.abs(speed.current) * 0.35);
          playerY.current += teto - bodyTopY;
          if (speed.current < 0) {
            speed.current *= -BOUNCE;
            momentum.current *= 1 - BOUNCE_SPEED_LOSS;
            emitImpact({
              strength: impactStr,
              fx: 8 + impactStr * 4,
              fy: 12 + impactStr * 6,
              part: "head",
            });
          } else {
            speed.current = Math.max(0, speed.current);
          }
        }

        // chão — o ponto mais baixo do corpo não pode passar da linha do chão
        if (bodyBottomY >= groundLineY) {
          const impactStr = Math.min(8, 1.2 + Math.abs(speed.current) * 0.35);
          playerY.current -= bodyBottomY - groundLineY;
          if (speed.current > 0) {
            speed.current *= -BOUNCE;
            momentum.current *= 1 - BOUNCE_SPEED_LOSS;
            emitImpact({
              strength: impactStr,
              fx: 6 + impactStr * 3,
              fy: -(10 + impactStr * 5),
              part: "legLeft",
            });
          } else {
            speed.current = Math.min(0, speed.current);
          }
        }
      }
    }

    // morte por ficar parado (speed 0 por STALL_DEATH_MS)
    if (gameSpeed.current <= 0) {
      zeroSpeedTimer.current += deltaTime;
      if (zeroSpeedTimer.current >= STALL_DEATH_MS) {
        isDeadRef.current = true;
        const stallEvent = classifyStall({
          velocityY: speed.current,
          playerX: 300,
          playerY: playerY.current,
        });
        deathTypeRef.current = stallEvent.type;
        setDeathType(stallEvent.type);
        setDeathSpike(null);
        setDeathObstacles([]);
        setGameState(GAME_STATE.DYING);
        // score só quando isDead && speed <= 0 por DEATH_ZERO_SPEED_MS

        // ESSENCIAL: continua o loop — mesmo motivo do fix na colisão com spike
        animationRef.current = requestAnimationFrame(gameLoop);
        return;
      }
    } else {
      zeroSpeedTimer.current = 0;
    }

    // firerate cooldown
    if (jumpCooldown.current > 0) {
      jumpCooldown.current -= deltaTime;
      if (jumpCooldown.current < 0) {
        jumpCooldown.current = 0;
      }
    }

    // reload timer
    if (isReloadingRef.current) {
      reloadTimerRef.current -= deltaTime;
      if (reloadTimerRef.current <= 0) {
        isReloadingRef.current = false;
        setIsReloading(false);
        reloadTimerRef.current = 0;
        const weapon = selectedWeaponRef.current;
        const mag = weapon ? weapon.magazine : 12;
        ammoRef.current = mag;
        setAmmo(mag);
      }
    }

    // colisão — OBB centrado no corpo, rotacionado com o ragdoll vivo
    const pCx = 300 + 24;
    const pCy = playerY.current + 32;
    const player = {
      x: pCx - 16,
      y: pCy - 28,
      width: 32,
      height: 56,
      cx: pCx,
      cy: pCy,
      angle: playerAngleRef.current, // radianos
    };

    const topBoxes = createSpikeHitboxes(spikesRef.current.top, "top");
    const bottomBoxes = createSpikeHitboxes(spikesRef.current.bottom, "bottom");
    // 1) culling: fora da tela / longe do player
    // 2) quadtree: broadphase espacial
    // 3) OBB fino só nos candidatos
    const rawBoxes =
      topBoxes.length || bottomBoxes.length
        ? [...topBoxes, ...bottomBoxes]
        : [];
    const allBoxes = cullSpikeHitboxes(rawBoxes, {
      focusX: pCx,
      focusY: pCy,
      focusRadius: 260,
      margin: 64,
    });
    const spikeTree = buildSpikeQuadTree(allBoxes);
    const hits = findAllSpikeCollisionsQuad(player, spikeTree);
    const hitTop = hits.find((h) => h.side === "top") || null;
    const hitBottom = hits.find((h) => h.side === "bottom") || null;

    if (spikeHitCooldown.current > 0) {
      spikeHitCooldown.current -= deltaTime;
    }

    // já impalado no núcleo: não reprocessa colisão (evita spam de pin)
    if (corePinnedRef.current) {
      speed.current = 0;
    } else if ((hitTop || hitBottom) && spikeHitCooldown.current <= 0) {
      const event = classifyDeath(hitTop, hitBottom, {
        velocityY: speed.current,
        playerX: player.x,
        playerY: player.y,
        playerW: player.width,
        playerH: player.height,
      });

      const part = event.bodyPart || "torso";
      const tip = event.tip || { x: player.cx, y: player.cy };
      const onTip = event.region === "tip" || event.face === "tip";
      const isTop = (event.side || (hitTop ? "top" : "bottom")) === "top";
      const isBottom = !isTop;
      const absVy = Math.abs(speed.current);

      // qualquer toque no spike: sem tiro
      noShootRef.current = true;
      setGameState(GAME_STATE.DYING);
      spikeHitCooldown.current = onTip ? 400 : 220;

      // —— PONTA + NÚCLEO (cabeça / torso) ——
      const coreHit =
        onTip &&
        (part === "head" || part === "torso") &&
        (event.type === DeathType.IMPALE ||
          event.type === DeathType.HANG ||
          event.type === "spike_impale" ||
          event.type === "spike_hang" ||
          part === "head" ||
          part === "torso");

      if (coreHit) {
        if (isTop) {
          // TETO: prende um instante e CAI
          corePinnedRef.current = false;
          const pinY = tip.y;
          // peito/cabeça sob o tip, X no centro do player (estável na tela)
          emitPin({
            part: part === "head" ? "head" : "chest",
            x: player.cx,
            y: pinY,
            side: "top",
            isCore: true,
            releaseAfterMs: 220,
          });
          emitImpact({
            strength: 2.4 + Math.min(1.5, absVy * 0.08),
            fx: (event.offsetX || 0) * 0.25,
            fy: 18,
            part: part === "head" ? "head" : "chest",
          });
          // empurra pra baixo e reduz speed
          speed.current = Math.max(4, Math.abs(speed.current) * 0.55 + 3);
          momentum.current *= 0.82;
        } else {
          // CHÃO: fica IMPALADO — pin no centro da tela, Y na ponta
          corePinnedRef.current = true;
          const pinPartName = part === "head" ? "head" : "chest";
          // chest local em livingRagdoll: cy = playerY + 32
          // pin no tip → playerY ≈ tip.y - 32 (peito) ou tip.y - 12 (cabeça)
          const pinY = tip.y + (part === "head" ? 4 : 10);
          playerY.current =
            part === "head" ? tip.y - 14 : tip.y - 32;
          speed.current = 0;
          emitPin({
            part: pinPartName,
            x: player.cx + Math.max(-10, Math.min(10, event.offsetX || 0)),
            y: pinY,
            side: "bottom",
            isCore: true,
            releaseAfterMs: null,
          });
          emitImpact({
            strength: 3.2 + Math.min(1.2, absVy * 0.06),
            fx: (event.offsetX || 0) * 0.35,
            fy: -6,
            part: pinPartName,
          });
          momentum.current *= 0.65;
        }
        gameSpeed.current = Math.min(momentum.current, MAX_GAME_SPEED);
        setDisplaySpeed(gameSpeed.current);
      } else if (
        onTip &&
        (part === "legs" ||
          part === "arms" ||
          event.type === DeathType.IMPALE_LEG ||
          event.type === "spike_impale_leg")
      ) {
        // —— MEMBRO na ponta: corta, perde speed, bounce — SEM pin no esqueleto vivo
        //    (pin em membro controlado esticava o corpo)
        momentum.current *= 0.86;
        gameSpeed.current = Math.min(momentum.current, MAX_GAME_SPEED);
        setDisplaySpeed(gameSpeed.current);

        let limbKey =
          part === "arms"
            ? (event.offsetX || 0) < 0
              ? "armLeft"
              : "armRight"
            : (event.offsetX || 0) < 0
              ? "legLeft"
              : "legRight";

        setExternalSever((prev) => {
          if (prev[limbKey]) return prev;
          return { ...prev, [limbKey]: true };
        });

        // membro visual preso no tip (rola com o mapa) — só sprite solto
        stuckLimbsRef.current = [
          ...stuckLimbsRef.current,
          {
            id: `${limbKey}-${Date.now()}`,
            limb: limbKey,
            x: tip.x,
            y: tip.y,
          },
        ];
        setStuckLimbs(stuckLimbsRef.current);

        // rebote vertical + impulso no membro
        if (isBottom && speed.current > 0) {
          speed.current *= -BOUNCE * 0.9;
        } else if (isTop && speed.current < 0) {
          speed.current *= -BOUNCE * 0.9;
        } else {
          speed.current += isBottom ? -6 : 6;
        }
        emitImpact({
          strength: 2.8,
          fx: (event.offsetX || 0) >= 0 ? 14 : -14,
          fy: isBottom ? -18 : 16,
          part: limbKey,
        });
      } else {
        // —— BASE / FLANCO: empurra pra longe do spike + freia
        momentum.current *= 0.9;
        gameSpeed.current = Math.min(momentum.current, MAX_GAME_SPEED);
        setDisplaySpeed(gameSpeed.current);

        const awayX =
          Math.abs(event.offsetX || 0) > 4
            ? Math.sign(event.offsetX) * 10
            : speed.current > 0
              ? 6
              : -6;
        // bounce vertical como no chão/teto
        if (isBottom && speed.current > 1) {
          speed.current *= -BOUNCE * 0.85;
        } else if (isTop && speed.current < -1) {
          speed.current *= -BOUNCE * 0.85;
        } else {
          speed.current += isBottom ? -5 : 5;
        }
        emitImpact({
          strength: 1.8 + Math.min(1, absVy * 0.05),
          fx: awayX,
          fy: isBottom ? -10 : 12,
          part: part === "head" ? "head" : part === "legs" ? "legLeft" : "chest",
        });
      }
    }

    // fim: ferido (noShoot) e speed ~0 por DEATH_ZERO_SPEED_MS
    if (noShootRef.current && gameSpeed.current <= 0) {
      deathZeroSpeedTimer.current += deltaTime;
      if (
        deathZeroSpeedTimer.current >= DEATH_ZERO_SPEED_MS &&
        !deathFinalizedRef.current
      ) {
        deathFinalizedRef.current = true;
        isDeadRef.current = true;
        setDistance(Math.floor(maxDistanceRef.current));
        setGameState(GAME_STATE.DEAD);
      }
    } else if (noShootRef.current) {
      deathZeroSpeedTimer.current = 0;
    }

    setDrawY(playerY.current);
    setVelocityY(speed.current);

    animationRef.current = requestAnimationFrame(gameLoop);
  };

  // não inicia o loop automaticamente — só quando for PLAYING
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (deathDelayTimeout.current) {
        clearTimeout(deathDelayTimeout.current);
      }
    };
  }, []);

  // input
  useEffect(() => {
    const keyDown = (e) => {
      if (e.code !== "Space") return;

      // no menu / seleção / scores → não faz nada com espaço por enquanto
      if (
        gameState === GAME_STATE.MENU ||
        gameState === GAME_STATE.WEAPON_SELECT ||
        gameState === GAME_STATE.SCORES
      ) {
        return;
      }

      if (gameState === GAME_STATE.DEAD) {
        resetGame();
        return;
      }

      // Player já morreu (isDeadRef é setado de forma síncrona no exato
      // frame da colisão — antes até do gameState==DYING propagar no
      // próximo render). A partir daqui nenhum disparo é processado.
      if (isDeadRef.current || noShootRef.current) {
        return;
      }

      // PLAYING
      e.preventDefault();

      if (spaceHeld.current) return;
      spaceHeld.current = true;

      // não atira se ainda está no firerate cooldown
      if (jumpCooldown.current > 0) return;

      // não atira se está recarregando
      if (isReloadingRef.current) return;

      // sem munição → inicia reload
      if (ammoRef.current <= 0) {
        isReloadingRef.current = true;
        reloadTimerRef.current = selectedWeapon
          ? selectedWeapon.reload
          : 1000;
        return;
      }
      
            // sem munição → inicia reload
      if (ammoRef.current <= 0) {
        isReloadingRef.current = true;
        setIsReloading(true);
        reloadTimerRef.current = selectedWeapon
          ? selectedWeapon.reload
          : 1000;
        return;
      }

      // atira — recoil arcade (impact da arma)
      // impact é negativo (sobe). NÃO sobrescreve bounce: empilha se já estiver subindo.
      const recoil = selectedWeapon ? selectedWeapon.impact : JUMP_FORCE;
      const cooldown = selectedWeapon ? selectedWeapon.firerate : 2000;

      if (speed.current < 0) {
        // já subindo (ex: bounce) → ganha o impulso do tiro em cima
        speed.current = speed.current + recoil;
      } else {
        // caindo / parado → tiro define a subida
        speed.current = recoil;
      }
      // teto de subida pra não explodir o combo
      if (speed.current < -48) speed.current = -48;

      jumpCooldown.current = cooldown;
      ammoRef.current -= 1;
      setAmmo(ammoRef.current);
      setShotTick((t) => t + 1);

      // se esvaziou o pente, já agenda o reload
      if (ammoRef.current <= 0) {
        isReloadingRef.current = true;
        setIsReloading(true);
        reloadTimerRef.current = selectedWeapon
          ? selectedWeapon.reload
          : 1000;
      }

      // única forma de ganhar speed
      momentum.current = Math.min(
        momentum.current + MOMENTUM_GAIN,
        MAX_GAME_SPEED
      );
    };

    const keyUp = (e) => {
      if (e.code === "Space") {
        spaceHeld.current = false;
      }
    };

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [gameState, selectedWeapon]);

  // =====================
  // RENDER
  // =====================
  return (
    <div className="game">
      {/* telas de UI */}
      {gameState === GAME_STATE.MENU && (
        <Menu onStart={goToWeaponSelect} onScores={goToScores} />
      )}

   {(gameState === GAME_STATE.PLAYING || gameState === GAME_STATE.DYING) && (
        <Hud
            weapon={selectedWeapon}
            ammo={ammo}
            isReloading={isReloading}
            shotTick={shotTick}
            distance={distance}
            speed={displaySpeed}
            maxSpeed={MAX_GAME_SPEED}
        />
      )}

      {gameState === GAME_STATE.WEAPON_SELECT && (
        <WeaponSelect
          onSelect={startGame}
          onBack={goToMenu}
        />
      )}

      {gameState === GAME_STATE.SCORES && (
        <Scores onBack={goToMenu} />
      )}

      {gameState === GAME_STATE.DEAD && (
        <GameOver
          distance={distance}
          score={Math.floor(
            distance * (selectedWeapon ? selectedWeapon.scoreMultiplier : 1)
          )}
          multiplier={selectedWeapon ? selectedWeapon.scoreMultiplier : 1}
          weaponName={selectedWeapon ? selectedWeapon.name : "—"}
          onRestart={resetGame}
          onMenu={goToMenu}
          onPostScore={(name, finalScore, weapon) =>
            saveScore(finalScore, weapon, name, distance)
          }
        />
      )}

      {/* elementos do jogo (sempre montados, mas só atualizam quando PLAYING) */}
      {(gameState === GAME_STATE.PLAYING ||
        gameState === GAME_STATE.DYING ||
        gameState === GAME_STATE.DEAD) && (
        <>
          <Teto />
          <Player
            drawY={drawY}
            shotTick={shotTick}
            deathType="none"
            deathSpike={null}
            deathObstacles={[]}
            velocityY={velocityY}
            moveSpeed={displaySpeed}
            bloodRef={bloodRef}
            playerX={300}
            hitboxAngleRef={playerAngleRef}
            impactEvent={impactEvent}
            pinEvent={pinEvent}
            externalSever={externalSever}
          />
          {/* membros presos nos spikes */}
          {stuckLimbs.map((s) => (
            <div
              key={s.id}
              style={{
                position: "absolute",
                left: s.x - 8,
                top: s.y - 12,
                width: 16,
                height: 24,
                borderRadius: s.limb.includes("arm") ? 6 : 8,
                background: s.limb.includes("leg") ? "#5b4cff" : "#3d3d3d",
                border: "2px solid #222",
                zIndex: 6,
                pointerEvents: "none",
              }}
              title={s.limb}
            />
          ))}
          <BloodLayer
            ref={bloodRef}
            focusX={300 + 24}
            focusY={drawY + 32}
            active={
              gameState === GAME_STATE.PLAYING ||
              gameState === GAME_STATE.DYING ||
              gameState === GAME_STATE.DEAD
            }
          />
          <Spikes
            x={spikes.top.x}
            side="top"
            amount={spikes.top.amount}
          />
          <Spikes
            x={spikes.bottom.x}
            side="bottom"
            amount={spikes.bottom.amount}
          />
          <DebugHitboxes hitboxes={debugHitboxes} />
          <Ground />
        </>
      )}
    </div>
  );
}

export default App;
