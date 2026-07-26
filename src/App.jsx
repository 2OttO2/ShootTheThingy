import { useState, useEffect, useRef } from "react";

import Player from "./components/Player/Player.jsx";
import Spikes from "./components/Spikes/Spikes.jsx";
import Teto from "./components/Teto/Teto.jsx";
import Ground from "./components/Ground/Ground.jsx";
import DebugHitboxes from "./utils/DebugHitboxes.jsx";
import GameOver from "./components/GameOver/GameOver.jsx";
import Distance from "./components/Distance/Distance.jsx";

import useSpikes from "./hooks/useSpikes.js";
import usePlayerPhysics from "./hooks/usePlayerPhysics.js";
import { isPlayerCollidingWithSpike } from "./utils/collision.js";
import { createSpikeHitboxes } from "./utils/spikeHitboxes.js";

import {
  BASE_GAME_SPEED,
  MAX_GAME_SPEED,
  MOMENTUM_GAIN,
  MOMENTUM_DECAY,
  PLAYER_SIZE,
  GRAVITY,
  JUMP_FORCE,
  BOUNCE,
  TETO_HEIGHT,
  GROUND_HEIGHT,
} from "./constants/game.js";

import "./App.css";

function App() {
  // debug
  const [debugHitboxes, setDebugHitboxes] = useState([]);

  // distance
  const [distance, setDistance] = useState(0);
  const distanceRef = useRef(0);

  // game state
  const GAME_STATE = { PLAYING: "playing", DEAD: "dead" };
  const [gameState, setGameState] = useState(GAME_STATE.PLAYING);
  const isDeadRef = useRef(false);

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

  function resetGame() {
    isDeadRef.current = false;
    setGameState(GAME_STATE.PLAYING);

    resetPlayer();

    momentum.current = 0;
    gameSpeed.current = BASE_GAME_SPEED;
    distanceRef.current = 0;
    setDistance(0);

    resetSpikes();

    lastTime.current = 0;
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

    // momentum / speed
    momentum.current -= MOMENTUM_DECAY * dt;
    if (momentum.current < 0) {
      momentum.current = 0;
    }
    gameSpeed.current = Math.min(
      BASE_GAME_SPEED + momentum.current,
      MAX_GAME_SPEED
    );

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

    // bounce teto
    if (playerY.current <= teto) {
      playerY.current = teto;
      speed.current *= -BOUNCE;
    }

    // bounce chão
    if (playerY.current >= floor) {
      playerY.current = floor;
      speed.current *= -BOUNCE;
    }

    // jump cooldown
    if (jumpCooldown.current > 0) {
      jumpCooldown.current -= deltaTime;
      if (jumpCooldown.current < 0) {
        jumpCooldown.current = 0;
      }
    }

    // colisão
    const player = {
      x: 200,
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
      console.log("colidi papi");
    }

    setDrawY(playerY.current);

    animationRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    animationRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  useEffect(() => {
    const keyDown = (e) => {
      if (e.code !== "Space") return;

      if (gameState === GAME_STATE.DEAD) {
        resetGame();
        return;
      }

      e.preventDefault();

      if (spaceHeld.current) return;
      spaceHeld.current = true;

      if (jumpCooldown.current > 0) return;

      speed.current = JUMP_FORCE;
      jumpCooldown.current = 2000;

      momentum.current = Math.min(
        momentum.current + MOMENTUM_GAIN,
        MAX_GAME_SPEED - BASE_GAME_SPEED
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
  }, [gameState]);

  return (
    <div className="game">
      <Teto />

      {gameState === GAME_STATE.DEAD && <GameOver />}

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
    </div>
  );
}

export default App;
