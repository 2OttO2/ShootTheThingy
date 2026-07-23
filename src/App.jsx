import { useState, useEffect, useRef } from "react";
import Player from "./components/Player/Player.jsx";
import Spikes from "./components/Spikes/Spikes.jsx";
import Teto from "./components/Teto/Teto.jsx";
import Ground from "./components/Ground/Ground.jsx";
import DebugHitboxes  from "./utils/DebugHitboxes.jsx";
import { isPlayerCollidingWithSpike } from "./utils/collision.js";
import { createSpikeHitboxes } from "./utils/spikeHitboxes.js";

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

  const [drawY, setDrawY] = useState(350);
  const [spikes, setSpikes] = useState(createSpikes);
  const spikesRef = useRef(spikes);

 //debugin 

  const [debugHitboxes,setDebugHitboxes] = useState([]);

  //gameSpeed 

  const BASE_GAME_SPEED = 1;
  const MAX_GAME_SPEED = 10;

  const gameSpeed = useRef(BASE_GAME_SPEED);
  const momentum = useRef(0);

  const MOMENTUM_GAIN = 1.35;
  const MOMENTUM_DECAY = 0.005;

  //spikes 
  
  const spikeSize = 64;
  const speedBaseSpike = 4;

  //player 
  const playerY = useRef(350);
  const speed = useRef(0);
  const playerSize = 40;

  const gravity = 0.3;
  const jumpForce = -15;
  const bounce = 0.8;

  const jumpCooldown = useRef(0);
  const spaceHeld = useRef(false);

  const animationRef = useRef(null);
  const lastTime = useRef(0);


  //LIMITE DO GROUND E TETO 
  const TETO_HEIGHT = 5;
  const GROUND_HEIGHT = 5;

  const teto = TETO_HEIGHT;
  const floor = window.innerHeight - GROUND_HEIGHT - playerSize;

  // ONDE TUDO ACONTECE

  const gameLoop = (time) => {

    if (lastTime.current === 0) {
      lastTime.current = time;
    }

    const deltaTime = Math.min(time - lastTime.current, 50);
    lastTime.current = time;

    const dt = deltaTime / 16.67;

    momentum.current -= MOMENTUM_DECAY * dt;
      if(momentum.current < 0 ){
        momentum.current = 0;
    }
      gameSpeed.current = Math.min(
      BASE_GAME_SPEED + momentum.current,
      MAX_GAME_SPEED
    );

    // ===========================
    // SPIKES
    // ===========================
   setSpikes((prev) => {

   const nextX = prev.top.x - speedBaseSpike * gameSpeed.current * dt;

      if(nextX < -250){
        const next = createSpikes();
        spikesRef.current = next;
        return next;
      }

    const next = {
      top: {
       ...prev.top,
        x: nextX,
      },
      bottom: {
          ...prev.bottom,
          x: nextX,
        },
      };

     spikesRef.current = next;

     return next;
    });
   
    const hitboxes = [
    ...createSpikeHitboxes(spikesRef.current.top, "top" ),
    ...createSpikeHitboxes(spikesRef.current.bottom, "bottom" ),
    ];

    setDebugHitboxes(hitboxes);

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
    const player = {
       x: 200,
       y: playerY.current + 8,
       width: 25,
       height: 25,
    };
    //COLISAO SNU SNU 

    const collided = hitboxes.some(hitbox =>
      isPlayerCollidingWithSpike(player,hitbox)
    );

    if(collided){
      BASE_GAME_SPEED = 0;
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

      e.preventDefault();

      if (spaceHeld.current) return;

      spaceHeld.current = true;

      if (jumpCooldown.current > 0) return;

      speed.current = jumpForce;
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
      
      <DebugHitboxes hitboxes={debugHitboxes}/>

      <Ground />
    </div>
  );
}

export default App;
