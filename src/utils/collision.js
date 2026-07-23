function pointInTriangle(point, triangle) {

  const [a, b, c] = triangle;

  const area =
    Math.abs(
      (a.x * (b.y - c.y) +
      b.x * (c.y - a.y) +
      c.x * (a.y - b.y)) / 2
    );

  const area1 =
    Math.abs(
      (point.x * (b.y - c.y) +
      b.x * (c.y - point.y) +
      c.x * (point.y - b.y)) / 2
    );

  const area2 =
    Math.abs(
      (a.x * (point.y - c.y) +
      point.x * (c.y - a.y) +
      c.x * (a.y - point.y)) / 2
    );

  const area3 =
    Math.abs(
      (a.x * (b.y - point.y) +
      b.x * (point.y - a.y) +
      point.x * (a.y - b.y)) / 2
    );

  return area === area1 + area2 + area3;
}


export function isPlayerCollidingWithSpike(player, spike) {

  const corners = [
    {x: player.x, y: player.y},
    {x: player.x + player.width, y: player.y},
    {x: player.x, y: player.y + player.height},
    {x: player.x + player.width, y: player.y + player.height},
  ];


  return corners.some(corner =>
    pointInTriangle(corner, spike.points)
  );
}
