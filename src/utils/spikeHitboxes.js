const SPIKE_SIZE = 64;

export function createSpikeHitboxes(spike, side) {

  const hitboxes = [];

  const startY =
    side === "top"
      ? 5
      : window.innerHeight - SPIKE_SIZE - 5;


  for(let i = 0; i < spike.amount; i++){

    hitboxes.push({
    
      side:side,

      x: spike.x + i * SPIKE_SIZE ,

      y: startY ,

      width: 64,
      height: 64,

    });

  }

  return hitboxes;
}
