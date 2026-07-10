import { useState, useEffect, useRef } from "react";
import styles from "./Player.module.css";

function Player() {
  const [drawY, setDrawY] = useState(250);

  const playerY = useRef(250);
  const speed = useRef(0);
  const animationRef = useRef();
  const podePular = useRef(0);

  const gravity = 0.3;
  const jumpForce = -8;

    //MAGICA ABAIXO SHAZAN

  const gameLoop = () => {
    // Gravidade
    speed.current += gravity;

    // Atualiza posição
    playerY.current += speed.current;

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
      if (e.code === "Space") {
        e.preventDefault();
        speed.current = jumpForce;
      }
    };

    window.addEventListener("keydown", pular);

    return () => window.removeEventListener("keydown", pular);
  }, []);

  return (
    <div
      className={styles.player}
      style={{ top: `${drawY}px` }}
    />
  );
}

export default Player;
