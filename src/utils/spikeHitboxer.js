
const SPIKE_SIZE = 64;

const HITBOX = {
  x: 14,
  width: 36,

  topY: 8,
  bottomY: 22,

  height: 34,
};

export function createSpikeHitboxes(spike,side){
  const hitboxes = [];

    const startY = 
    side === "top"
    ? 0 
    : window.innerHeight - spike.amount * SPIKE_SIZE;

      for(let i = 0; i < spike.amount; i++){
    hitboxes.push({
      x: spike.x + HITBOX.x,
      y:
        side === "top"
        ? startY + i * SPIKE_SIZE + HITBOX.topY
        : startY + i * SPIKE_SIZE + HITBOX.bottomY,

      width:HITBOX.width,
      height:HITBOX.height,
    });
  }
  return hitboxes;
}
