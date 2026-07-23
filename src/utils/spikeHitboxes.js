const SPIKE_SIZE = 64;

export function createSpikeHitboxes(spike, side) {

  const hitboxes = [];

  const startY =
    side === "top"
      ? 5
      : window.innerHeight - SPIKE_SIZE - 5;


  for(let i = 0; i < spike.amount; i++){

    hitboxes.push({

      x: spike.x + i * SPIKE_SIZE + 12,

      y: startY + 10,

      width: 40,
      height: 40,

    });

  }

  return hitboxes;
}
