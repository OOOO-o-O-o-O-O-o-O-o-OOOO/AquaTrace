import { isNoData } from './flow';

function rampAccum(t: number): [number, number, number] {
  // light cyan → steel blue → dark navy
  const stops: [number, number, number, number][] = [
    [0,    236, 246, 250],
    [0.25, 158, 202, 225],
    [0.55,  49, 130, 189],
    [0.8,    8,  81, 156],
    [1,      8,  29,  88],
  ];
  let i = 1;
  while (i < stops.length && t > stops[i][0]) i++;
  const a = stops[i - 1];
  const b = stops[Math.min(i, stops.length - 1)];
  const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
}

function rampDem(t: number): [number, number, number] {
  // Natural terrain palette: deep water → lowland green → highland brown → peak white
  const stops: [number, number, number, number][] = [
    [0,    70, 130, 100],   // low – green valley
    [0.2, 130, 175,  90],   // gentle slope
    [0.45, 190, 175, 110],  // mid elevation – tan
    [0.7,  160, 120,  80],  // upper slope – brown
    [0.88, 200, 185, 165],  // sub-alpine grey-brown
    [1,    240, 240, 240],  // peak – near white
  ];
  let i = 1;
  while (i < stops.length && t > stops[i][0]) i++;
  const a = stops[i - 1];
  const b = stops[Math.min(i, stops.length - 1)];
  const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
}

export function demImage(dem: Float32Array, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(width, height);
  const data = img.data;

  // Find min/max of valid cells
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < dem.length; i++) {
    if (!isNoData(dem[i])) { if (dem[i] < min) min = dem[i]; if (dem[i] > max) max = dem[i]; }
  }
  const range = Math.max(1, max - min);

  for (let i = 0; i < dem.length; i++) {
    const o = i * 4;
    if (isNoData(dem[i])) { data[o + 3] = 0; continue; }
    const t = (dem[i] - min) / range;
    const [r, g, b] = rampDem(t);
    data[o]     = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 200;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function accumulationImage(accum: Float32Array, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(width, height);
  const data = img.data;
  let max = 1;
  for (let i = 0; i < accum.length; i++) if (accum[i] > max) max = accum[i];
  const den = Math.log(1 + max);
  for (let i = 0; i < accum.length; i++) {
    const t = Math.log(1 + accum[i]) / den;
    const [r, g, b] = rampAccum(t);
    const o = i * 4;
    data[o]     = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = accum[i] > 1 ? Math.min(220, 40 + t * 190) : 0;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function canvasToUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Could not encode overlay')); return; }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}
