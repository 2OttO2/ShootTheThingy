import { useRef, useState } from "react";

export default function usePlayerPhysics(initialY = 350) {
  const [drawY, setDrawY] = useState(initialY);

  const playerY = useRef(initialY);
  const speed = useRef(0);

  const jumpCooldown = useRef(0);
  const spaceHeld = useRef(false);

  const resetPlayer = () => {
    playerY.current = initialY;
    speed.current = 0;
    setDrawY(initialY);

    jumpCooldown.current = 0;
    spaceHeld.current = false;
  };

  return {
    drawY,
    setDrawY,
    playerY,
    speed,
    jumpCooldown,
    spaceHeld,
    resetPlayer,
  };
}
