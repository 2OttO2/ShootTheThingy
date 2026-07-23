const SPIKE_SIZE = 64;

export function createSpikeHitboxes(spike, side) {
  const hitboxes = [];

  const startY =
    side === "top"
      ? 0
      : window.innerHeight - SPIKE_SIZE;


  for (let i = 0; i < spike.amount; i++) {

    const x = spike.x + i * SPIKE_SIZE;
    const y = startY;


    hitboxes.push({
      points:
        side === "bottom"
          ? [
              { x: x + 32, y: y },
              { x: x, y: y + 64 },
              { x: x + 64, y: y + 64 },
            ]
          : [
              { x: x, y: y },
              { x: x + 64, y: y },
              { x: x + 32, y: y + 64 },
            ],
    });

  }

  return hitboxes;
}
