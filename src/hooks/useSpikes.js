import { useRef, useState } from "react";
import { SPIKE_SPEED } from "../constants/game";

function createSpikes() {
  return {
    top: {
      x: window.innerWidth + 40,
      amount: 2 + Math.floor(Math.random() * 3), // 2–4
    },
    bottom: {
      x: window.innerWidth + 80 + Math.random() * 120,
      amount: 2 + Math.floor(Math.random() * 3), // 2–4
    },
  };
}

export default function useSpikes() {
  const [spikes, setSpikes] = useState(createSpikes);
  const spikesRef = useRef(spikes);

  const updateSpikes = (dt, gameSpeed) => {
    setSpikes((prev) => {
      const next = {
        top: {
          ...prev.top,
          x: prev.top.x - (SPIKE_SPEED + gameSpeed) * dt,
        },
        bottom: {
          ...prev.bottom,
          x: prev.bottom.x - (SPIKE_SPEED + gameSpeed) * dt,
        },
      };

      // Cada leva (topo/chão) só reseta a SI MESMA quando sai da tela —
      // resetar as duas juntas teleportava a leva ainda visível pra uma
      // posição nova do nada (e se o personagem tivesse acabado de
      // empalar nela, o espeto sumia de baixo dele no meio da animação
      // de morte).
      if (next.top.x <= -64 * next.top.amount) {
        const fresh = createSpikes();
        next.top = fresh.top;
      }
      if (next.bottom.x <= -64 * next.bottom.amount) {
        const fresh = createSpikes();
        next.bottom = fresh.bottom;
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

