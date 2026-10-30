import { fromUrl } from 'geotiff';
import type { HydroGrid, MapBounds } from './types';
import { isNoData, processTerrain } from './flow';

const CACHE_NAME = 'aquatrace-dem-v1';
const MAX_CELLS = 360000;
const ARCSEC = 1 / 3600;

function padBounds(b: MapBounds, frac: number): MapBounds {
  const lon = (b.east - b.west) * frac;
  const lat = (b.north - b.south) * frac;
  return {
    west: Math.max(-180, b.west - lon),
    south: Math.max(-80, b.south - lat),
    east: Math.min(180, b.east + lon),
    north: Math.min(84, b.north + lat),
  };
}

function copernicusKey(lat0: number, lon0: number) {
  const ns = lat0 >= 0 ? 'N' : 'S';
  const ew = lon0 >= 0 ? 'E' : 'W';
  const latStr = `${ns}${String(Math.abs(lat0)).padStart(2, '0')}_00`;
  const lonStr = `${ew}${String(Math.abs(lon0)).padStart(3, '0')}_00`;
  return `Copernicus_DSM_COG_10_${latStr}_${lonStr}_DEM`;
}

function copernicusUrl(lat0: number, lon0: number) {
  const key = copernicusKey(lat0, lon0);
  return `/dem/copernicus/${key}/${key}.tif`;
}

async function cachedBlob(url: string) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return hit.blob();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await cache.put(url, res.clone());
    return res.blob();
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  }
}

async function paintCopernicus(
  grid: Float32Array,
  width: number,
  height: number,
  west: number,
  south: number,
  east: number,
  north: number,
) {
  let ok = 0;
  const tiles: { lat: number; lon: number }[] = [];
  for (let lat = Math.floor(south); lat <= Math.floor(north - 1e-10); lat++) {
    for (let lon = Math.floor(west); lon <= Math.floor(east - 1e-10); lon++) {
      tiles.push({ lat, lon });
    }
  }
  await Promise.all(
    tiles.map(async ({ lat, lon }) => {
      try {
        const tiff = await fromUrl(copernicusUrl(lat, lon), { allowFullFile: false });
        const image = await tiff.getImage();
        const bbox = image.getBoundingBox();
        const tw = image.getWidth();
        const th = image.getHeight();
        const tileWest = bbox[0];
        const tileSouth = bbox[1];
        const tileEast = bbox[2];
        const tileNorth = bbox[3];
        const oWest = Math.max(west, tileWest);
        const oSouth = Math.max(south, tileSouth);
        const oEast = Math.min(east, tileEast);
        const oNorth = Math.min(north, tileNorth);
        if (oEast <= oWest || oNorth <= oSouth) return;
        const px0 = Math.floor(((oWest - tileWest) / (tileEast - tileWest)) * tw);
        const px1 = Math.ceil(((oEast - tileWest) / (tileEast - tileWest)) * tw);
        const py0 = Math.floor(((tileNorth - oNorth) / (tileNorth - tileSouth)) * th);
        const py1 = Math.ceil(((tileNorth - oSouth) / (tileNorth - tileSouth)) * th);
        const winW = Math.max(1, px1 - px0);
        const winH = Math.max(1, py1 - py0);
        const rasters = await image.readRasters({
          window: [px0, py0, px1, py1],
          width: winW,
          height: winH,
          resampleMethod: 'bilinear',
        });
        const band = rasters[0] as TypedArray;
        const dLon = (east - west) / width;
        const dLat = (north - south) / height;
        for (let yy = 0; yy < winH; yy++) {
          for (let xx = 0; xx < winW; xx++) {
            const v = Number(band[yy * winW + xx]);
            if (!Number.isFinite(v) || isNoData(v)) continue;
            const lonC = tileWest + ((px0 + xx + 0.5) / tw) * (tileEast - tileWest);
            const latC = tileNorth - ((py0 + yy + 0.5) / th) * (tileNorth - tileSouth);
            const gx = Math.floor((lonC - west) / dLon);
            const gy = Math.floor((north - latC) / dLat);
            if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
            grid[gy * width + gx] = v;
            ok++;
          }
        }
      } catch {
        /* tile missing — SRTM fills later */
      }
    }),
  );
  return ok;
}

function lngLatToTile(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

async function paintSrtm(
  grid: Float32Array,
  width: number,
  height: number,
  west: number,
  south: number,
  east: number,
  north: number,
  cellSizeM: number,
) {
  const midLat = (south + north) / 2;
  const z = Math.max(
    8,
    Math.min(14, Math.round(Math.log2((40075016 * Math.cos((midLat * Math.PI) / 180)) / (cellSizeM * 256)))),
  );
  const nw = lngLatToTile(west, north, z);
  const se = lngLatToTile(east, south, z);
  const x0 = Math.max(0, Math.floor(nw.x));
  const y0 = Math.max(0, Math.floor(nw.y));
  const x1 = Math.min(2 ** z - 1, Math.floor(se.x));
  const y1 = Math.min(2 ** z - 1, Math.floor(se.y));
  const tiles = new Map<string, Float32Array>();
  const jobs: Promise<void>[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const key = `${z}/${tx}/${ty}`;
      jobs.push(
        (async () => {
          try {
            const blob = await cachedBlob(`/dem/srtm/terrarium/${z}/${tx}/${ty}.png`);
            const bmp = await createImageBitmap(blob);
            const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(bmp, 0, 0);
            const { data } = ctx.getImageData(0, 0, 256, 256);
            const elev = new Float32Array(256 * 256);
            for (let i = 0; i < 256 * 256; i++) {
              const r = data[i * 4];
              const g = data[i * 4 + 1];
              const b = data[i * 4 + 2];
              elev[i] = r * 256 + g + b / 256 - 32768;
            }
            tiles.set(key, elev);
          } catch {
            /* skip */
          }
        })(),
      );
    }
  }
  await Promise.all(jobs);
  const dLon = (east - west) / width;
  const dLat = (north - south) / height;
  let filled = 0;
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const i = gy * width + gx;
      if (!isNoData(grid[i])) continue;
      const lon = west + (gx + 0.5) * dLon;
      const lat = north - (gy + 0.5) * dLat;
      const t = lngLatToTile(lon, lat, z);
      const tx = Math.floor(t.x);
      const ty = Math.floor(t.y);
      const elev = tiles.get(`${z}/${tx}/${ty}`);
      if (!elev) continue;
      const px = Math.min(255, Math.max(0, Math.floor((t.x - tx) * 256)));
      const py = Math.min(255, Math.max(0, Math.floor((t.y - ty) * 256)));
      const v = elev[py * 256 + px];
      if (isNoData(v)) continue;
      grid[i] = v;
      filled++;
    }
  }
  return filled;
}

export type DemProgress = (label: string) => void;

export async function loadAndProcessDem(bounds: MapBounds, onProgress?: DemProgress) {
  const padded = padBounds(bounds, 0.16);
  let { west, south, east, north } = padded;
  const spanLon = east - west;
  const spanLat = north - south;
  let dLon = ARCSEC;
  let dLat = ARCSEC;
  let width = Math.max(32, Math.round(spanLon / dLon));
  let height = Math.max(32, Math.round(spanLat / dLat));
  let resampled = false;
  if (width * height > MAX_CELLS) {
    const scale = Math.sqrt((width * height) / MAX_CELLS);
    dLon *= scale;
    dLat *= scale;
    width = Math.max(32, Math.round(spanLon / dLon));
    height = Math.max(32, Math.round(spanLat / dLat));
    resampled = true;
  }
  dLon = spanLon / width;
  dLat = spanLat / height;
  east = west + width * dLon;
  north = south + height * dLat;
  const midLat = (south + north) / 2;
  const cellSizeM = 111320 * Math.cos((midLat * Math.PI) / 180) * dLon;
  const dem = new Float32Array(width * height);
  dem.fill(Number.NaN);

  onProgress?.('Reading Copernicus GLO-30');
  const copernicusCells = await paintCopernicus(dem, width, height, west, south, east, north);
  onProgress?.('Filling gaps with SRTM');
  const srtmCells = await paintSrtm(dem, width, height, west, south, east, north, cellSizeM);
  const valid = copernicusCells + srtmCells;
  if (valid < 64) {
    throw new Error('Elevation tiles are unavailable. Check the internet connection and try a land area.');
  }

  onProgress?.('Computing flow');
  const { filled, fdir, accum } = processTerrain(dem, width, height);
  const copernicusShare = valid ? copernicusCells / (copernicusCells + srtmCells) : 0;
  const source: HydroGrid['source'] =
    srtmCells === 0 ? 'copernicus' : copernicusCells === 0 ? 'srtm' : 'mixed';

  return {
    dem,
    filled,
    fdir,
    accum,
    width,
    height,
    west,
    south,
    east,
    north,
    dLon,
    dLat,
    cellSizeM,
    source,
    resampled,
    copernicusShare,
  } satisfies HydroGrid;
}

type TypedArray = Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;
