import { useState, useEffect, useRef } from "react";
import Player from "./components/Player/Player.jsx";
import Spikes from "./components/Spikes/Spikes.jsx";
import Teto from "./components/Teto/Teto.jsx";
import Ground from "./components/Ground/Ground.jsx";

import "./App.css";

function App() {

  const createSpikes = () => ({
    top: {
      x: window.innerWidth + 100,
      amount: Math.floor(Math.random() * 3) + 2,
    },
    bottom: {
      x: window.innerWidth + 100,
      amount: Math.floor(Math.random() * 3) + 2,
    },
  });

  const [drawY, setDrawY] = useState(250);
  const [spikes, setSpikes] = useState(createSpikes);

  const spikeSpeed = 4;

  const playerY = useRef(250);
  const speed = useRef(0);

  const gravity = 0.3;
  const jumpForce = -15;
  const bounce = 0.8;

  const jumpCooldown = useRef(0);
  const spaceHeld = useRef(false);

  const animationRef = useRef(null);
  const lastTime = useRef(0);

  // ===========================
  // TAMANHOS
  // ===========================

  const playerSize = 40;

  //LIMITE DO GROUND E TETO 
  const TETO_HEIGHT = 305;
  const GROUND_HEIGHT = -295;

  const teto = TETO_HEIGHT;
  const floor = window.innerHeight - GROUND_HEIGHT - playerSize;

  const gameLoop = (time) => {

    if (lastTime.current === 0) {
      lastTime.current = time;
    }

    const deltaTime = Math.min(time - lastTime.current, 50);
    lastTime.current = time;

    const dt = deltaTime / 16.67;

    // ===========================
    // SPIKES
    // ===========================

    setSpikes((prev) => {
      const nextX = prev.top.x - spikeSpeed * dt;

      if (nextX < -250) {
        return createSpikes();
      }

      return {
        top: {
          ...prev.top,
          x: nextX,
        },
        bottom: {
          ...prev.bottom,
          x: nextX,
        },
      };
    });

    // ===========================
    // PLAYER
    // ===========================

    speed.current += gravity * dt;
    playerY.current += speed.current * dt;

    // Bounce no teto
    if (playerY.current <= teto) {
      playerY.current = teto;
      speed.current *= -bounce;
    }

    // Bounce no chão
    if (playerY.current >= floor) {
      playerY.current = floor;
      speed.current *= -bounce;
    }

    if (jumpCooldown.current > 0) {
      jumpCooldown.current -= deltaTime;

      if (jumpCooldown.current < 0) {
        jumpCooldown.current = 0;
      }
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

      e.preventDefault();

      if (spaceHeld.current) return;

      spaceHeld.current = true;

      if (jumpCooldown.current > 0) return;

      speed.current = jumpForce;
      jumpCooldown.current = 1050;
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
  }, []);

  return (
    <div className="game">
      <Teto />

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

      <Ground />
    </div>
  );
}

export default App;
