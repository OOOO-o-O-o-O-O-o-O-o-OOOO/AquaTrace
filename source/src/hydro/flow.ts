import { D8 } from './types';

const SQRT2 = Math.SQRT2;

class MinHeap {
  e: number[] = [];
  i: number[] = [];
  get size() {
    return this.e.length;
  }
  push(elev: number, idx: number) {
    const e = this.e;
    const i = this.i;
    e.push(elev);
    i.push(idx);
    let n = e.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (e[p] <= e[n]) break;
      const te = e[p];
      e[p] = e[n];
      e[n] = te;
      const ti = i[p];
      i[p] = i[n];
      i[n] = ti;
      n = p;
    }
  }
  pop(): [number, number] {
    const e = this.e;
    const i = this.i;
    const outE = e[0];
    const outI = i[0];
    const last = e.length - 1;
    e[0] = e[last];
    i[0] = i[last];
    e.pop();
    i.pop();
    let n = 0;
    const len = e.length;
    while (true) {
      const l = n * 2 + 1;
      const r = l + 1;
      let s = n;
      if (l < len && e[l] < e[s]) s = l;
      if (r < len && e[r] < e[s]) s = r;
      if (s === n) break;
      const te = e[n];
      e[n] = e[s];
      e[s] = te;
      const ti = i[n];
      i[n] = i[s];
      i[s] = ti;
      n = s;
    }
    return [outE, outI];
  }
}

export function isNoData(v: number) {
  return !Number.isFinite(v) || v < -1000 || v > 9000;
}

export function fillDepressions(dem: Float32Array, width: number, height: number) {
  const n = width * height;
  const filled = new Float32Array(n);
  filled.set(dem);
  const visited = new Uint8Array(n);
  const heap = new MinHeap();

  const seed = (idx: number) => {
    if (visited[idx] || isNoData(filled[idx])) return;
    visited[idx] = 1;
    heap.push(filled[idx], idx);
  };

  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  for (let i = 0; i < n; i++) {
    if (isNoData(dem[i])) {
      visited[i] = 1;
      const x = i % width;
      const y = (i / width) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + D8[d][0];
        const ny = y + D8[d][1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        seed(ny * width + nx);
      }
    }
  }

  while (heap.size) {
    const [, i] = heap.pop();
    const x = i % width;
    const y = (i / width) | 0;
    const level = filled[i];
    for (let d = 0; d < 8; d++) {
      const nx = x + D8[d][0];
      const ny = y + D8[d][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (visited[ni] || isNoData(dem[ni])) continue;
      visited[ni] = 1;
      if (filled[ni] < level) filled[ni] = level;
      heap.push(filled[ni], ni);
    }
  }
  return filled;
}

export function computeD8(filled: Float32Array, width: number, height: number) {
  const n = width * height;
  const fdir = new Int8Array(n);
  fdir.fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (isNoData(filled[i])) continue;
      let best = 0;
      let dir = -1;
      for (let d = 0; d < 8; d++) {
        const nx = x + D8[d][0];
        const ny = y + D8[d][1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (isNoData(filled[ni])) continue;
        const drop = filled[i] - filled[ni];
        const slope = drop / (d % 2 === 0 ? 1 : SQRT2);
        if (slope > best) {
          best = slope;
          dir = d;
        }
      }
      fdir[i] = dir;
    }
  }
  resolveFlats(filled, fdir, width, height);
  return fdir;
}

function resolveFlats(filled: Float32Array, fdir: Int8Array, width: number, height: number) {
  const n = width * height;
  const queue: number[] = [];
  let qh = 0;
  for (let i = 0; i < n; i++) {
    if (fdir[i] >= 0) queue.push(i);
  }
  while (qh < queue.length) {
    const i = queue[qh++];
    const x = i % width;
    const y = (i / width) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + D8[d][0];
      const ny = y + D8[d][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (fdir[ni] >= 0 || isNoData(filled[ni])) continue;
      fdir[ni] = (d + 4) % 8;
      queue.push(ni);
    }
  }
}

export function flowAccumulation(fdir: Int8Array, width: number, height: number) {
  const n = width * height;
  const accum = new Float32Array(n);
  const indeg = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    if (fdir[i] < 0) continue;
    const x = i % width + D8[fdir[i]][0];
    const y = ((i / width) | 0) + D8[fdir[i]][1];
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    indeg[y * width + x]++;
  }
  const queue = new Int32Array(n);
  let qs = 0;
  let qe = 0;
  for (let i = 0; i < n; i++) {
    if (fdir[i] < 0) {
      accum[i] = 0;
      continue;
    }
    accum[i] = 1;
    if (indeg[i] === 0) queue[qe++] = i;
  }

  while (qs < qe) {
    const i = queue[qs++];
    const d = fdir[i];
    if (d < 0) continue;
    const x = i % width + D8[d][0];
    const y = ((i / width) | 0) + D8[d][1];
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const j = y * width + x;
    accum[j] += accum[i];
    indeg[j]--;
    if (indeg[j] === 0) queue[qe++] = j;
  }
  return accum;
}

export function downstreamIndex(fdir: Int8Array, i: number, width: number, height: number) {
  const d = fdir[i];
  if (d < 0) return -1;
  const x = i % width + D8[d][0];
  const y = ((i / width) | 0) + D8[d][1];
  if (x < 0 || y < 0 || x >= width || y >= height) return -1;
  return y * width + x;
}

export function strahlerNetwork(
  fdir: Int8Array,
  accum: Float32Array,
  width: number,
  height: number,
  threshold: number,
  mask?: Uint8Array,
) {
  const n = width * height;
  const order = new Uint8Array(n);
  const indeg = new Int8Array(n);
  const on = (i: number) => accum[i] >= threshold && (!mask || mask[i] === 1);
  for (let i = 0; i < n; i++) {
    if (!on(i)) continue;
    const j = downstreamIndex(fdir, i, width, height);
    if (j >= 0 && on(j)) indeg[j]++;
  }
  const queue = new Int32Array(n);
  let qs = 0;
  let qe = 0;
  for (let i = 0; i < n; i++) if (on(i) && indeg[i] === 0) queue[qe++] = i;
  const incomingMax = new Uint8Array(n);
  const incomingCount = new Uint8Array(n);
  while (qs < qe) {
    const i = queue[qs++];
    if (order[i] === 0) order[i] = 1;
    const j = downstreamIndex(fdir, i, width, height);
    if (j < 0 || !on(j)) continue;
    const o = order[i];
    if (o > incomingMax[j]) {
      incomingMax[j] = o;
      incomingCount[j] = 1;
    } else if (o === incomingMax[j]) incomingCount[j]++;
    indeg[j]--;
    if (indeg[j] === 0) {
      order[j] = incomingCount[j] >= 2 ? incomingMax[j] + 1 : Math.max(1, incomingMax[j]);
      queue[qe++] = j;
    }
  }
  return order;
}

export function snapToChannel(
  accum: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
) {
  let best = -1;
  let bestA = -1;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(x - radius));
  const x1 = Math.min(width - 1, Math.ceil(x + radius));
  const y0 = Math.max(0, Math.floor(y - radius));
  const y1 = Math.min(height - 1, Math.ceil(y + radius));
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - x;
      const dy = yy - y;
      if (dx * dx + dy * dy > r2) continue;
      const a = accum[yy * width + xx];
      if (a > bestA) {
        bestA = a;
        best = yy * width + xx;
      }
    }
  }
  return best;
}

export function walkCatchment(
  fdir: Int8Array,
  width: number,
  height: number,
  start: number,
  out: Uint8Array,
) {
  const n = width * height;
  if (start < 0 || start >= n || out[start]) return;
  const stack = [start];
  out[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + D8[d][0];
      const ny = y + D8[d][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (out[ni]) continue;
      if (downstreamIndex(fdir, ni, width, height) !== i) continue;
      out[ni] = 1;
      stack.push(ni);
    }
  }
}

export function rasterizePolygon(
  polygon: [number, number][],
  width: number,
  height: number,
  west: number,
  north: number,
  dLon: number,
  dLat: number,
) {
  const mask = new Uint8Array(width * height);
  if (polygon.length < 3) return mask;
  for (let y = 0; y < height; y++) {
    const lat = north - (y + 0.5) * dLat;
    for (let x = 0; x < width; x++) {
      const lon = west + (x + 0.5) * dLon;
      if (pointInPoly(lon, lat, polygon)) mask[y * width + x] = 1;
    }
  }
  return mask;
}

function pointInPoly(x: number, y: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi === yj) continue;
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function polygonOutlets(
  polyMask: Uint8Array,
  fdir: Int8Array,
  width: number,
  height: number,
) {
  const outlets: number[] = [];
  const n = width * height;
  for (let i = 0; i < n; i++) {
    if (!polyMask[i]) continue;
    const j = downstreamIndex(fdir, i, width, height);
    if (j < 0 || !polyMask[j]) outlets.push(i);
  }
  return outlets;
}

export function maskTouchesEdge(mask: Uint8Array, width: number, height: number) {
  for (let x = 0; x < width; x++) {
    if (mask[x] || mask[(height - 1) * width + x]) return true;
  }
  for (let y = 0; y < height; y++) {
    if (mask[y * width] || mask[y * width + width - 1]) return true;
  }
  return false;
}

export function cellAreaKm2(lat: number, dLon: number, dLat: number) {
  const mLat = 110574 * dLat;
  const mLon = 111320 * Math.cos((lat * Math.PI) / 180) * dLon;
  return (mLat * mLon) / 1e6;
}

export function lonLatToCell(
  lng: number,
  lat: number,
  west: number,
  north: number,
  dLon: number,
  dLat: number,
  width: number,
  height: number,
) {
  const x = (lng - west) / dLon;
  const y = (north - lat) / dLat;
  if (x < 0 || y < 0 || x >= width || y >= height) return { x, y, i: -1 };
  return { x, y, i: (y | 0) * width + (x | 0) };
}

export function cellToLonLat(
  i: number,
  width: number,
  west: number,
  north: number,
  dLon: number,
  dLat: number,
): [number, number] {
  const x = i % width;
  const y = (i / width) | 0;
  return [west + (x + 0.5) * dLon, north - (y + 0.5) * dLat];
}

export function processTerrain(dem: Float32Array, width: number, height: number) {
  const filled = fillDepressions(dem, width, height);
  const fdir = computeD8(filled, width, height);
  const accum = flowAccumulation(fdir, width, height);
  return { filled, fdir, accum };
}
