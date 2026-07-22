
const SPIKE_SIZE = 64;

export function createSpikeHitboxes(spike,side){
  const hitboxes = [];

    const startY = 
    side === "top"
    ? 0 
    : window.innerHeight - spike.amount * SPIKE_SIZE;

      for(let i = 0; i < spike.amount; i++){
    hitboxes.push({
      x: spike.x + 12,
      y:
        side === "top"
        ? startY + i * SPIKE_SIZE
        : startY + i * SPIKE_SIZE +16,

      width:40,
      height:40,
    });
  }
  return hitboxes;
}
