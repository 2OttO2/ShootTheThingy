import { useState, useEffect, useRef } from "react";
import Player from "./components/Player/Player.jsx";
import Spikes from "./components/Spikes/Spikes.jsx";

import "./App.css";

function App() {
  const [drawY, setDrawY] = useState(250);
  const [spike, setSpike] = useState({
  x: window.innerWidth + 100,
  side: "bottom",
  amount: 2,
  });

 
  const spikeSpeed = 4;

  const playerY = useRef(250);
  const speed = useRef(0);

  const animationRef = useRef(null);
  const lastTime = useRef(0);

  const gravity = 0.3;
  const jumpForce = -15;

  // Cooldown do pulo (em ms)
  const jumpCooldown = useRef(0);

  // Impede vários keydown enquanto segura espaço
  const spaceHeld = useRef(false);

  const gameLoop = (time) => {


    //LOGICA DO Spikes
  
setSpike((prev) => {
    const nextX = prev.x - spikeSpeed * dt;

    if (nextX < -250) {
      return {
        x: window.innerWidth + 100,
        side: Math.random() < 0.5 ? "top" : "bottom",
        amount: Math.floor(Math.random() * 3) + 2,
       };
     }

      return {
      ...prev,
       x: nextX,
       };
    });
     // Primeiro frame
    if (lastTime.current === 0) {
      lastTime.current = time;
    }

    // DeltaTime em milissegundos
    const deltaTime = Math.min(time - lastTime.current, 50);
    lastTime.current = time;

    // Escala para manter a física igual em qualquer FPS
    const dt = deltaTime / 16.67;

    // Gravidade
    speed.current += gravity * dt;

    // Movimento
    playerY.current += speed.current * dt;

    // Atualiza cooldown
    if (jumpCooldown.current > 0) {
      jumpCooldown.current -= deltaTime;

      if (jumpCooldown.current < 0) {
        jumpCooldown.current = 0;
      }
    }

    // Limites do player
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

      // Se já está segurando a tecla, ignora
      if (spaceHeld.current) return;

      spaceHeld.current = true;

      // Ainda está em cooldown
      if (jumpCooldown.current > 0) return;

      speed.current = jumpForce;
      jumpCooldown.current = 1050; // 250 ms
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
      <Player drawY={drawY} />

      <Spikes 
        x={spike.x}
        side={spike.side}
        amount={spike.amount}

      />
    </div>

  );
}

export default App;
