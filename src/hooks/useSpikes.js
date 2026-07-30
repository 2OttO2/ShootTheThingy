import { useRef, useState } from "react";
import { SPIKE_SPEED } from "../constants/game";

function createSpikes() {
  return {

    // 4 + 2 deixei 0 0 para testes
    top: {
      x: window.innerWidth,
      amount: Math.floor(Math.random() * 4) + 2,
    },
    bottom: {
      x: window.innerWidth,
      amount: Math.floor(Math.random() * 4) + 2,
    },
  };
}

export default function useSpikes() {
  const [spikes, setSpikes] = useState(createSpikes);
  const spikesRef = useRef(spikes);

  const updateSpikes = (dt, gameSpeed) => {
    setSpikes((prev) => {
      let next = {
        top: {
          ...prev.top,
          x: prev.top.x - (SPIKE_SPEED + gameSpeed) * dt,
        },
        bottom: {
          ...prev.bottom,
          x: prev.bottom.x - (SPIKE_SPEED + gameSpeed) * dt,
        },
      };

      if (next.top.x <= -64 * next.top.amount) {
        next = createSpikes();
      }

      spikesRef.current = next;
      return next;
    });
  };

  const resetSpikes = () => {
    const next = createSpikes();
    spikesRef.current = next;
    setSpikes(next);
  };

  return {
    spikes,
    spikesRef,
    updateSpikes,
    resetSpikes,
  };
}
