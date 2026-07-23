const SPIKE_SIZE = 34;

//corpo do spike 

const BODY = {
  x:10,
  y:0,
  width:44,
  height:34,
};

const TIP = {
  x:20,
  y:0,
  width:24,
  height:18,
};

function createSigleSpikeHitbox(x,y){
  return [

    {
      x:x + BODY.x,
      y:y + BODY.y,
      width: BODY.width,
      height: BODY.height,
    },

    {
      x:x + TIP.x,
      y:y + TIP.y,
      width: TIP.width,
      height: TIP.height,
    },
  ];
}

export function createSpikeHitBoxes(spike,side){
  const hitboxes = [];

  const startY = 
    side === "top"
    ? 0 
    : window.innerHeight - spike.amount * SPIKE_SIZE;

    for(let i = 0; i < spike.amount; i++){
    const y = 
      side === "top"
        ? startY + i * SPIKE_SIZE
        : startY + i * SPIKE_SIZE;

      hitboxes.push(
      ...createSpikeHitBoxes(spike.x, y)
    );
  }
  return hitboxes;
}
