const SPIKE_SIZE = 64;

const HITBOX = {
  x: 12,
  width: 40,

  topY: 2,
  bottomY: 22,

  height: 42,
};
hitboxes.push({
    x: spike.x + HITBOX.x,

    y:
        side === "top"
            ? startY + i * SPIKE_SIZE + HITBOX.topY
            : startY + i * SPIKE_SIZE + HITBOX.bottomY,

    width: HITBOX.width,
    height: HITBOX.height,
});

