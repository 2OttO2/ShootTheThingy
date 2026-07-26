import { useState, useEffect } from "react";

export default function usePlayerPhysics(gameOver) {
  const GROUND_Y = 780;
  const GRAVITY = 0.8;
  const JUMP_FORCE = -15;

  const [playerY, setPlayerY] = useState(GROUND_Y);
  const [velocityY, setVelocityY] = useState(0);

  useEffect(() => {
    if (gameOver) return;

    const interval = setInterval(() => {
      setVelocityY((prevVelocity) => {
        const newVelocity = prevVelocity + GRAVITY;

        setPlayerY((prevY) => {
          let newY = prevY + newVelocity;

          if (newY > GROUND_Y) {
            newY = GROUND_Y;
            setVelocityY(0);
          }

          return newY;
        });

        return newVelocity;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [gameOver]);

  const jump = () => {
    setPlayerY((currentY) => {
      if (currentY >= GROUND_Y) {
        setVelocityY(JUMP_FORCE);
      }

      return currentY;
    });
  };

  const resetPhysics = () => {
    setPlayerY(GROUND_Y);
    setVelocityY(0);
  };

  return {
    playerY,
    velocityY,
    jump,
    resetPhysics,
  };
}
