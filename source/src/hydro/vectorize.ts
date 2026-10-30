import { D8, type CatchmentPoly, type LonLat, type StreamLine } from './types';
import { cellToLonLat, downstreamIndex } from './flow';

function chaikin(coords: LonLat[], rounds = 2): LonLat[] {
  let pts = coords;
  for (let r = 0; r < rounds; r++) {
    if (pts.length < 3) break;
    const next: LonLat[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

export function extractStreams(
  fdir: Int8Array,
  accum: Float32Array,
  order: Uint8Array,
  width: number,
  height: number,
  west: number,
  north: number,
  dLon: number,
  dLat: number,
  threshold: number,
  mask?: Uint8Array,
): StreamLine[] {
  const n = width * height;
  const on = (i: number) => accum[i] >= threshold && (!mask || mask[i] === 1);
  const hasUp = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!on(i)) continue;
    const j = downstreamIndex(fdir, i, width, height);
    if (j >= 0 && on(j)) hasUp[j] = 1;
  }
  const visited = new Uint8Array(n);
  const lines: StreamLine[] = [];
  for (let i = 0; i < n; i++) {
    if (!on(i) || hasUp[i] || visited[i]) continue;
    const cells: number[] = [];
    let cur = i;
    while (cur >= 0 && on(cur)) {
      cells.push(cur);
      if (visited[cur] && cells.length > 1) break;
      visited[cur] = 1;
      const next = downstreamIndex(fdir, cur, width, height);
      if (next < 0 || !on(next)) break;
      cur = next;
    }
    if (cells.length < 2) continue;
    const coords = chaikin(cells.map(c => cellToLonLat(c, width, west, north, dLon, dLat)));
    let maxOrder = 1;
    let maxAccum = 0;
    for (const c of cells) {
      if (order[c] > maxOrder) maxOrder = order[c];
      if (accum[c] > maxAccum) maxAccum = accum[c];
    }
    lines.push({ coords, order: maxOrder, accum: maxAccum });
  }
  lines.sort((a, b) => a.order - b.order);
  return lines;
}

export function maskToPolygons(
  mask: Uint8Array,
  width: number,
  height: number,
  west: number,
  north: number,
  dLon: number,
  dLat: number,
  id: string,
  color: string,
  areaKm2: number,
  combined = false,
): CatchmentPoly | null {
  const rings = traceRings(mask, width, height, west, north, dLon, dLat);
  if (!rings.length) return null;
  return { id, color, areaKm2, rings, combined };
}

function traceRings(
  mask: Uint8Array,
  width: number,
  height: number,
  west: number,
  north: number,
  dLon: number,
  dLat: number,
): LonLat[][] {
  const used = new Uint8Array((width + 1) * (height + 1) * 4);
  const rings: LonLat[][] = [];
  const key = (x: number, y: number, e: number) => ((y * (width + 1) + x) * 4 + e);

  const startEdge = (): [number, number, number] | null => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!mask[y * width + x]) continue;
        if (x === 0 || !mask[y * width + x - 1]) {
          if (!used[key(x, y, 3)]) return [x, y, 3];
        }
      }
    }
    return null;
  };

  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  while (true) {
    const start = startEdge();
    if (!start) break;
    let [x, y, e] = start;
    const ring: LonLat[] = [];
    const skey = `${x},${y},${e}`;
    let guard = 0;
    do {
      used[key(x, y, e)] = 1;
      const [gx, gy] = corner(x, y, e);
      ring.push([west + gx * dLon, north - gy * dLat]);
      const step = walk(inside, x, y, e);
      x = step[0];
      y = step[1];
      e = step[2];
      guard++;
    } while (`${x},${y},${e}` !== skey && guard < width * height * 4);
    if (ring.length > 3) {
      ring.push(ring[0]);
      rings.push(simplifyRing(ring));
    }
  }
  return rings;
}

function corner(x: number, y: number, e: number): [number, number] {
  if (e === 0) return [x, y];
  if (e === 1) return [x + 1, y];
  if (e === 2) return [x + 1, y + 1];
  return [x, y + 1];
}

function walk(
  inside: (x: number, y: number) => boolean,
  x: number,
  y: number,
  e: number,
): [number, number, number] {
  if (e === 0) {
    if (inside(x - 1, y - 1)) return [x - 1, y - 1, 1];
    if (inside(x, y - 1)) return [x, y - 1, 0];
    return [x, y, 1];
  }
  if (e === 1) {
    if (inside(x + 1, y - 1)) return [x + 1, y - 1, 2];
    if (inside(x + 1, y)) return [x + 1, y, 1];
    return [x, y, 2];
  }
  if (e === 2) {
    if (inside(x + 1, y + 1)) return [x + 1, y + 1, 3];
    if (inside(x, y + 1)) return [x, y + 1, 2];
    return [x, y, 3];
  }
  if (inside(x - 1, y + 1)) return [x - 1, y + 1, 0];
  if (inside(x - 1, y)) return [x - 1, y, 3];
  return [x, y, 0];
}

function simplifyRing(ring: LonLat[]) {
  if (ring.length < 8) return ring;
  const out: LonLat[] = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const a = out[out.length - 1];
    const b = ring[i];
    const c = ring[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 1e-14) out.push(b);
  }
  out.push(ring[ring.length - 1]);
  return chaikin(out, 1);
}

export function unionMask(masks: Uint8Array[]) {
  if (!masks.length) return null;
  const out = new Uint8Array(masks[0].length);
  for (const m of masks) {
    for (let i = 0; i < out.length; i++) if (m[i]) out[i] = 1;
  }
  return out;
}

export function andMask(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] && b[i] ? 1 : 0;
  return out;
}

export function maskAreaKm2(
  mask: Uint8Array,
  width: number,
  height: number,
  north: number,
  dLon: number,
  dLat: number,
) {
  let area = 0;
  for (let y = 0; y < height; y++) {
    const lat = north - (y + 0.5) * dLat;
    const mLat = 110574 * dLat;
    const mLon = 111320 * Math.cos((lat * Math.PI) / 180) * dLon;
    const cell = (mLat * mLon) / 1e6;
    let count = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) if (mask[row + x]) count++;
    area += count * cell;
  }
  return area;
}

void D8;
