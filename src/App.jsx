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
      amount: Math.floor(Math.random() * 3) + 2, // 2 a 4
    },
    bottom: {
      x: window.innerWidth + 100,
      amount: Math.floor(Math.random() * 3) + 2, // 2 a 4
    },
  });

  const [drawY, setDrawY] = useState(250);
  const [spikes, setSpikes] = useState(createSpikes);

  const spikeSpeed = 4;

  const playerY = useRef(250);
  const speed = useRef(0);

  const animationRef = useRef(null);
  const lastTime = useRef(0);

  const gravity = 0.3;
  const jumpForce = -15;

  const jumpCooldown = useRef(0);
  const spaceHeld = useRef(false);

  const gameLoop = (time) => {
    // Primeiro frame
    if (lastTime.current === 0) {
      lastTime.current = time;
    }

    // Delta Time
    const deltaTime = Math.min(time - lastTime.current, 50);
    lastTime.current = time;

    // Escala para manter a física em qualquer FPS
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

    if (jumpCooldown.current > 0) {
      jumpCooldown.current -= deltaTime;

      if (jumpCooldown.current < 0) {
        jumpCooldown.current = 0;
      }
    }

    if (playerY.current < 0) {
      playerY.current = 0;
      speed.current = 0;
    }

    if (playerY.current > 1165) {
      playerY.current = 1165;
      speed.current = 0;
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

      <Teto/>

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

      <Ground/>

    </div>
  );
}

export default App;
