/**
 * Spatial hash 2D — broadphase O(1) por célula.
 * Ideal pra spikes, partículas e corpos próximos.
 */
export class SpatialHash {
  /**
   * @param {number} cellSize tamanho da célula em px
   */
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    /** @type {Map<string, any[]>} */
    this.cells = new Map();
  }

  _key(cx, cy) {
    return cx + "," + cy;
  }

  _cell(x, y) {
    return [
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
    ];
  }

  clear() {
    this.cells.clear();
  }

  /**
   * Insere item com ponto (x,y) ou AABB.
   * @param {object} item deve ter x,y ou minX/minY/maxX/maxY
   */
  insert(item) {
    let minX, minY, maxX, maxY;
    if (item.minX != null) {
      minX = item.minX;
      minY = item.minY;
      maxX = item.maxX;
      maxY = item.maxY;
    } else {
      const r = item.r || item.radius || 0;
      minX = item.x - r;
      minY = item.y - r;
      maxX = item.x + r;
      maxY = item.y + r;
    }
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs);
    const y0 = Math.floor(minY / cs);
    const x1 = Math.floor(maxX / cs);
    const y1 = Math.floor(maxY / cs);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this._key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(item);
      }
    }
  }

  /**
   * Query por ponto + raio.
   * @returns {any[]} itens únicos
   */
  queryRadius(x, y, radius) {
    return this.queryAabb(x - radius, y - radius, x + radius, y + radius);
  }

  /**
   * Query por AABB.
   */
  queryAabb(minX, minY, maxX, maxY) {
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs);
    const y0 = Math.floor(minY / cs);
    const x1 = Math.floor(maxX / cs);
    const y1 = Math.floor(maxY / cs);
    const seen = new Set();
    const out = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) {
          if (seen.has(item)) continue;
          seen.add(item);
          out.push(item);
        }
      }
    }
    return out;
  }

  get size() {
    let n = 0;
    const seen = new Set();
    for (const bucket of this.cells.values()) {
      for (const item of bucket) {
        if (!seen.has(item)) {
          seen.add(item);
          n++;
        }
      }
    }
    return n;
  }
}

/**
 * Filtra hitboxes de spike visíveis / próximos do player.
 * Culling barato antes de quadtree / física.
 */
export function cullSpikeHitboxes(hitboxes, opts = {}) {
  if (!hitboxes?.length) return [];
  const margin = opts.margin ?? 80;
  const viewW =
    opts.viewW ??
    (typeof window !== "undefined" ? window.innerWidth : 1200);
  const viewH =
    opts.viewH ??
    (typeof window !== "undefined" ? window.innerHeight : 800);
  const focusX = opts.focusX;
  const focusY = opts.focusY;
  const focusR = opts.focusRadius ?? 220;

  const out = [];
  for (const hb of hitboxes) {
    // AABB simples do spike
    let minX = hb.x ?? Infinity;
    let maxX = (hb.x ?? 0) + (hb.size ?? 64);
    let minY = hb.y ?? Infinity;
    let maxY = (hb.y ?? 0) + (hb.size ?? 64);
    if (hb.points?.length) {
      minX = maxX = hb.points[0].x;
      minY = maxY = hb.points[0].y;
      for (const p of hb.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    // fora da tela (com margem)
    if (maxX < -margin || minX > viewW + margin) continue;
    if (maxY < -margin || minY > viewH + margin) continue;

    // se tem foco (player), ainda mais restrito
    if (focusX != null && focusY != null) {
      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5;
      if (Math.hypot(cx - focusX, cy - focusY) > focusR) continue;
    }
    out.push(hb);
  }
  return out;
}

