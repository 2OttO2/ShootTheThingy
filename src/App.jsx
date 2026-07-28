import { useState, useEffect, useRef } from "react";

import Player from "./components/Player/Player.jsx";
import Spikes from "./components/Spikes/Spikes.jsx";
import Teto from "./components/Teto/Teto.jsx";
import Ground from "./components/Ground/Ground.jsx";
import DebugHitboxes from "./utils/DebugHitboxes.jsx";
import GameOver from "./components/GameOver/GameOver.jsx";
import Distance from "./components/Distance/Distance.jsx";
import Menu from "./components/Menu/Menu.jsx";
import WeaponSelect from "./components/WeaponSelect/WeaponSelect.jsx";
import Scores, { saveScore } from "./components/Scores/Scores.jsx";
import Hud from "./components/Hud/Hud.jsx";

import useSpikes from "./hooks/useSpikes.js";
import usePlayerPhysics from "./hooks/usePlayerPhysics.js";
import { isPlayerCollidingWithSpike } from "./utils/collision.js";
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

  // debug
  const [debugHitboxes, setDebugHitboxes] = useState([]);

  // distance
  const [distance, setDistance] = useState(0);
  const distanceRef = useRef(0);

  // game state — começa no MENU
  const [gameState, setGameState] = useState(GAME_STATE.MENU);
  const isDeadRef = useRef(false);
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
    setGameState(GAME_STATE.PLAYING);

    resetPlayer();
    momentum.current = INITIAL_GAME_SPEED;
    gameSpeed.current = INITIAL_GAME_SPEED;
    distanceRef.current = 0;
    setDistance(0);
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
    setGameState(GAME_STATE.PLAYING);

    resetPlayer();
    momentum.current = INITIAL_GAME_SPEED;
    gameSpeed.current = INITIAL_GAME_SPEED;
    distanceRef.current = 0;
    setDistance(0);
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
    if (isDeadRef.current) return;

    if (lastTime.current === 0) {
      lastTime.current = time;
    }

    const deltaTime = Math.min(time - lastTime.current, 50);
    lastTime.current = time;
    const dt = deltaTime / 16.67;

    // momentum / speed — decai até zero; sem piso mínimo
    momentum.current -= MOMENTUM_DECAY * dt;
    if (momentum.current < 0) {
      momentum.current = 0;
    }
    gameSpeed.current = Math.min(momentum.current, MAX_GAME_SPEED);

    distanceRef.current += gameSpeed.current * dt;
    setDistance(Math.floor(distanceRef.current));

    // spikes
    updateSpikes(dt, gameSpeed.current);

    const hitboxes = [
      ...createSpikeHitboxes(spikesRef.current.top, "top"),
      ...createSpikeHitboxes(spikesRef.current.bottom, "bottom"),
    ];
    setDebugHitboxes(hitboxes);

    // player physics
    speed.current += GRAVITY * dt;
    playerY.current += speed.current * dt;

    // bounce teto — perde velocidade vertical e horizontal
    if (playerY.current <= teto) {
      playerY.current = teto;
      speed.current *= -BOUNCE;
      momentum.current *= 1 - BOUNCE_SPEED_LOSS;
    }

    // bounce chão — perde velocidade vertical e horizontal
    if (playerY.current >= floor) {
      playerY.current = floor;
      speed.current *= -BOUNCE;
      momentum.current *= 1 - BOUNCE_SPEED_LOSS;
    }

    // morte por ficar parado (speed 0 por STALL_DEATH_MS)
    if (gameSpeed.current <= 0) {
      zeroSpeedTimer.current += deltaTime;
      if (zeroSpeedTimer.current >= STALL_DEATH_MS) {
        isDeadRef.current = true;
        setGameState(GAME_STATE.DYING);
        // espera DEATH_DELAY_MS (futura animação) antes da tela de score
        if (deathDelayTimeout.current) {
          clearTimeout(deathDelayTimeout.current);
        }
        deathDelayTimeout.current = setTimeout(() => {
          setGameState(GAME_STATE.DEAD);
          deathDelayTimeout.current = null;
        }, DEATH_DELAY_MS);
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

    // colisão
    const player = {
      x: 300,
      y: playerY.current + 8,
      width: 25,
      height: 25,
    };

    const collided = hitboxes.some((hitbox) =>
      isPlayerCollidingWithSpike(player, hitbox)
    );

    if (collided) {
      isDeadRef.current = true;
      setGameState(GAME_STATE.DEAD);

      return;
    }

    setDrawY(playerY.current);

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

      // atira
      const recoil = selectedWeapon ? selectedWeapon.impact : JUMP_FORCE;
      const cooldown = selectedWeapon ? selectedWeapon.firerate : 2000;

      speed.current = recoil;
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

      {gameState === GAME_STATE.PLAYING && (
        <Hud
            weapon={selectedWeapon}
            ammo={ammo}
            isReloading={isReloading}
            shotTick={shotTick}
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
          weaponName={selectedWeapon ? selectedWeapon.name : "—"}
          onRestart={resetGame}
          onMenu={goToMenu}
          onPostScore={(name, dist, weapon) => saveScore(dist, weapon, name)}
        />
      )}

      {/* elementos do jogo (sempre montados, mas só atualizam quando PLAYING) */}
      {(gameState === GAME_STATE.PLAYING ||
        gameState === GAME_STATE.DYING ||
        gameState === GAME_STATE.DEAD) && (
        <>
          <Teto />
          <Distance distance={distance} />
          <Player drawY={drawY} />
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
