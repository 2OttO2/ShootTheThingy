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
  PLAYER_SIZE,
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

function App() {
  
  //munição / reload 
  const ammoRef = useRef(0);
  const isReloadingRef = useRef(false);
  const reloadTimerRef = useRef(0);
  const [ammo, setAmmo] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [shotTick, setShotTick] = useState(0);
  const [deathType, setDeathType] = useState("none");
  const [impactEvent, setImpactEvent] = useState(null);
  const impactIdRef = useRef(0);
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
  const isDeadRef = useRef(false);
  const playerAngleRef = useRef(0); // radianos — hitbox acompanha rotação
  const zeroSpeedTimer = useRef(0); // ms acumulados com speed 0
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
  const teto = TETO_HEIGHT;
  const floor = window.innerHeight - GROUND_HEIGHT - PLAYER_SIZE;



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

  function onBodySettled() {
    if (settledRef.current) return;
    settledRef.current = true;
    setGameState(GAME_STATE.DEAD);
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
    zeroSpeedTimer.current = 0;
    if (deathDelayTimeout.current) {
      clearTimeout(deathDelayTimeout.current);
      deathDelayTimeout.current = null;
    }
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
    zeroSpeedTimer.current = 0;
    if (deathDelayTimeout.current) {
      clearTimeout(deathDelayTimeout.current);
      deathDelayTimeout.current = null;
    }
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
    // na morte decai um pouco mais rápido, mas NÃO zera de imediato
    const decayMul = isDeadRef.current ? 1.8 : 1;
    momentum.current -= MOMENTUM_DECAY * decayMul * dt;
    if (momentum.current < 0) {
      momentum.current = 0;
    }
    gameSpeed.current = Math.min(momentum.current, MAX_GAME_SPEED);

    distanceRef.current += gameSpeed.current * dt;
    setDistance(Math.floor(distanceRef.current));
    setDisplaySpeed(gameSpeed.current);

    // VIVO: spikes rolam. MORTO: spikes CONGELAM (senão o pin/corpo vai pro canto esquerdo)
    if (!isDeadRef.current) {
      updateSpikes(dt, gameSpeed.current);
    }

    // durante DYING: HUD/speed decai, mas cenário não arrasta o cadáver
    if (isDeadRef.current) {
      animationRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const hitboxes = [
      ...createSpikeHitboxes(spikesRef.current.top, "top"),
      ...createSpikeHitboxes(spikesRef.current.bottom, "bottom"),
    ];
    setDebugHitboxes(hitboxes);

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

    if (playerY.current <= teto) {
      const impactStr = Math.min(8, 1.2 + Math.abs(speed.current) * 0.35);
      playerY.current = teto;
      speed.current *= -BOUNCE;
      momentum.current *= 1 - BOUNCE_SPEED_LOSS;
      emitImpact({
        strength: impactStr,
        fx: 8 + impactStr * 4,
        fy: 12 + impactStr * 6,
        part: "head",
      });
    }

    if (playerY.current >= floor) {
      const impactStr = Math.min(8, 1.2 + Math.abs(speed.current) * 0.35);
      playerY.current = floor;
      speed.current *= -BOUNCE;
      momentum.current *= 1 - BOUNCE_SPEED_LOSS;
      emitImpact({
        strength: impactStr,
        fx: 6 + impactStr * 3,
        fy: -(10 + impactStr * 5),
        part: "legLeft",
      });
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
        setDeathType(stallEvent.type);
        setDeathSpike(null);
    setDeathObstacles([]);
        setGameState(GAME_STATE.DYING);
      // score só quando onBodySettled (corpo parou)
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

    if (hitTop || hitBottom) {
      isDeadRef.current = true;
      // NÃO zera momentum — mapa desacelera junto com a speed residual
      setDisplaySpeed(gameSpeed.current);

      // Classificação única em death/classify.js
      const event = classifyDeath(hitTop, hitBottom, {
        velocityY: speed.current,
        playerX: player.x,
        playerY: player.y,
        playerW: player.width,
        playerH: player.height,
      });

      setDeathSpike({
        tipX: event.tip?.x,
        tipY: event.tip?.y,
        side: event.side,
        region: event.region,
        bodyPart: event.bodyPart,
        offsetX: event.offsetX,
        impact: event.impact,
        face: hitTop?.face || hitBottom?.face || null,
        lateral: hitTop?.lateral || hitBottom?.lateral || 0,
      });
      setDeathObstacles([...topBoxes, ...bottomBoxes]);
      setDeathType(event.type);
      setGameState(GAME_STATE.DYING);
      // score só quando onBodySettled (corpo parou)

      return;
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
        gameState === GAME_STATE.SCORES ||
        gameState === GAME_STATE.DYING
      ) {
        return;
      }

      if (gameState === GAME_STATE.DEAD) {
        resetGame();
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
            deathType={deathType}
            deathSpike={deathSpike}
            deathObstacles={deathObstacles}
            velocityY={velocityY}
            moveSpeed={displaySpeed}
            bloodRef={bloodRef}
            playerX={300}
            hitboxAngleRef={playerAngleRef}
            impactEvent={impactEvent}
            onBodySettled={onBodySettled}
          />
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


