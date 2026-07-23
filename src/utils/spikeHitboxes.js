const SPIKE_SIZE = 64;

export function createSpikeHitboxes(spike, side) {
  const hitboxes = [];

  const startY =
    side === "top"
      ? 0
      : window.innerHeight - SPIKE_SIZE;


  for (let i = 0; i < spike.amount; i++) {

    const x = spike.x + i * SPIKE_SIZE -2;
    const y = startY;


    hitboxes.push({
      points:
        side === "bottom"
          ? [
              { x: x + 30, y: y },
              { x: x + 13, y: y + 64 },
              { x: x + 51, y: y + 64 },
            ]
          : [
              { x: x + 13, y: y },
              { x: x + 51, y: y },
              { x: x + 30, y: y + 64 },
            ],
    });

  }

  return hitboxes;
}
