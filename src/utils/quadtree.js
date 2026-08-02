/**
 * Quadtree 2D leve pra culling de hitboxes de spike.
 * Cada item: { minX, minY, maxX, maxY, ref }
 */

export class QuadTree {
  /**
   * @param {{x:number,y:number,w:number,h:number}} bounds
   * @param {number} capacity
   * @param {number} maxDepth
   * @param {number} depth
   */
  constructor(bounds, capacity = 6, maxDepth = 6, depth = 0) {
    this.bounds = bounds;
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.depth = depth;
    this.items = [];
    this.divided = false;
    this.nw = this.ne = this.sw = this.se = null;
  }

  contains(item) {
    const b = this.bounds;
    return (
      item.minX >= b.x &&
      item.maxX <= b.x + b.w &&
      item.minY >= b.y &&
      item.maxY <= b.y + b.h
    );
  }

  intersects(range) {
    const b = this.bounds;
    return !(
      range.maxX < b.x ||
      range.minX > b.x + b.w ||
      range.maxY < b.y ||
      range.minY > b.y + b.h
    );
  }

  subdivide() {
    const { x, y, w, h } = this.bounds;
    const hw = w / 2;
    const hh = h / 2;
    const cap = this.capacity;
    const md = this.maxDepth;
    const d = this.depth + 1;
    this.nw = new QuadTree({ x, y, w: hw, h: hh }, cap, md, d);
    this.ne = new QuadTree({ x: x + hw, y, w: hw, h: hh }, cap, md, d);
    this.sw = new QuadTree({ x, y: y + hh, w: hw, h: hh }, cap, md, d);
    this.se = new QuadTree(
      { x: x + hw, y: y + hh, w: hw, h: hh },
      cap,
      md,
      d
    );
    this.divided = true;
  }

  insert(item) {
    if (!this.intersects(item)) return false;

    if (this.items.length < this.capacity || this.depth >= this.maxDepth) {
      // se não cabe inteiro em um filho, fica neste nó
      if (!this.divided || this.depth >= this.maxDepth) {
        this.items.push(item);
        return true;
      }
    }

    if (!this.divided) this.subdivide();

    // tenta filhos; se não couber num único filho, fica aqui
    if (this.nw.contains(item)) return this.nw.insert(item);
    if (this.ne.contains(item)) return this.ne.insert(item);
    if (this.sw.contains(item)) return this.sw.insert(item);
    if (this.se.contains(item)) return this.se.insert(item);

    this.items.push(item);
    return true;
  }

  /**
   * @param {{minX:number,minY:number,maxX:number,maxY:number}} range
   * @param {Array} [out]
   */
  query(range, out = []) {
    if (!this.intersects(range)) return out;

    for (const item of this.items) {
      if (
        !(
          item.maxX < range.minX ||
          item.minX > range.maxX ||
          item.maxY < range.minY ||
          item.minY > range.maxY
        )
      ) {
        out.push(item);
      }
    }

    if (this.divided) {
      this.nw.query(range, out);
      this.ne.query(range, out);
      this.sw.query(range, out);
      this.se.query(range, out);
    }
    return out;
  }

  clear() {
    this.items.length = 0;
    this.divided = false;
    this.nw = this.ne = this.sw = this.se = null;
  }
}

/** AABB de um hitbox de spike (triângulo) */
export function spikeAabb(hb) {
  if (hb._aabb) return hb._aabb;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of hb.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  // pad leve
  const aabb = {
    minX: minX - 1,
    minY: minY - 1,
    maxX: maxX + 1,
    maxY: maxY + 1,
  };
  hb._aabb = aabb;
  return aabb;
}

/**
 * Monta quadtree cobrindo a tela (ou bounds dados) com os hitboxes.
 * @param {object[]} hitboxes
 * @param {{w?:number,h?:number}} [screen]
 */
export function buildSpikeQuadTree(hitboxes, screen = {}) {
  const w = screen.w ?? (typeof window !== "undefined" ? window.innerWidth : 1200);
  const h = screen.h ?? (typeof window !== "undefined" ? window.innerHeight : 800);
  // margem pros spikes que ainda estão entrando na tela
  const tree = new QuadTree(
    { x: -200, y: -50, w: w + 400, h: h + 100 },
    8,
    7
  );
  for (const hb of hitboxes) {
    if (!hb?.points?.length) continue;
    const aabb = spikeAabb(hb);
    tree.insert({
      minX: aabb.minX,
      minY: aabb.minY,
      maxX: aabb.maxX,
      maxY: aabb.maxY,
      ref: hb,
    });
  }
  return tree;
}

