import { useState, useEffect, useRef } from 'react'
import Player from "./components/Player/Player.jsx";
import Spikes from "./components/Spikes/Spikes.jsx";

import './App.css'

function App() {
  
  const [drawY, setDrawY] = useState(250);
  const playerY = useRef(250);
  const speed = useRef(0);
  const animationRef = useRef();
  const podePular = useRef(0);
  const lastTime = useRef(0);

  const gravity = 0.3;
  const jumpForce = -8;
  const jumpCooldown = useRef(0);


  
    //MAGICA ABAIXO SHAZAN
  const gameLoop = (time) => {

    const deltaTime = (time - lastTime.current) / 16.67;
    lastTime.current = time;
    // Gravidade
    speed.current += gravity * deltaTime;

    // Atualiza posição
    playerY.current += speed.current * deltaTime;

    //poder pular
    if(jumpCooldown.current > 0){
      jumpCooldown.current -= deltaTime;
    }

    // Limites da tela (exemplo: altura de 600px e player de 40px)
    if (playerY.current < 0) {
      playerY.current = 0;
      speed.current = 0;
    }

    if (playerY.current > 860) {
      playerY.current = 860;
      speed.current = 0;
    }

    // Atualiza o React
    setDrawY(playerY.current);

    // Próximo frame
    animationRef.current = requestAnimationFrame(gameLoop);
  };
    useEffect(() => {
    animationRef.current = requestAnimationFrame(gameLoop);

    return () => cancelAnimationFrame(animationRef.current);
  }, []);
  
  useEffect(() => {
    const pular = (e) => {
      if (e.code === "Space" && jumpCooldown.current <= 0) {
        e.preventDefault();
        speed.current = jumpForce;
        jumpCooldown.current = 50;
      }
    };

    window.addEventListener("keydown", pular);

    return () => window.removeEventListener("keydown", pular);
  }, []);

  return (
    <>
      <div className="game">

      <Player
        drawY={drawY}


        />
      <Spikes/>

      </div>
    </>
  )
}

export default App
