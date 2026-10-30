import {
  cellToLonLat,
  lonLatToCell,
  maskTouchesEdge,
  polygonOutlets,
  rasterizePolygon,
  snapToChannel,
  walkCatchment,
} from './flow';
import { andMask, maskAreaKm2, maskToPolygons, unionMask } from './vectorize';
import type { CatchmentPoly, HydroGrid, PolygonClip, PourPoint } from './types';

export type CatchmentResult = {
  polygons: CatchmentPoly[];
  streamMask?: Uint8Array;
  areas: { id: string; areaKm2: number }[];
  edgeTouched: boolean;
  snapped: PourPoint[];
};

export function analyzeCatchments(
  grid: HydroGrid,
  pourPoints: PourPoint[],
  polygon: [number, number][],
  usePolygon: boolean,
  clip: PolygonClip,
  combine: boolean,
): CatchmentResult {
  const { fdir, accum, width, height, west, north, dLon, dLat } = grid;
  const snapped: PourPoint[] = pourPoints.map(p => {
    const loc = lonLatToCell(p.lng, p.lat, west, north, dLon, dLat, width, height);
    if (loc.i < 0) return p;
    const radius = Math.max(4, Math.round(280 / grid.cellSizeM));
    const snappedI = snapToChannel(accum, width, height, loc.x, loc.y, radius);
    if (snappedI < 0) return p;
    const [lng, lat] = cellToLonLat(snappedI, width, west, north, dLon, dLat);
    return { ...p, lng, lat };
  });

  const masks: { id: string; color: string; mask: Uint8Array }[] = [];
  for (const p of snapped) {
    const loc = lonLatToCell(p.lng, p.lat, west, north, dLon, dLat, width, height);
    if (loc.i < 0) continue;
    const mask = new Uint8Array(width * height);
    walkCatchment(fdir, width, height, loc.i, mask);
    masks.push({ id: p.id, color: p.color, mask });
  }

  if (usePolygon && polygon.length > 2) {
    const polyMask = rasterizePolygon(polygon, width, height, west, north, dLon, dLat);
    const outlets = polygonOutlets(polyMask, fdir, width, height);
    const full = new Uint8Array(width * height);
    for (const o of outlets) walkCatchment(fdir, width, height, o, full);
    const used = clip === 'inside' ? andMask(full, polyMask) : full;
    masks.push({ id: 'polygon', color: '#1d4e52', mask: used });
  }

  const areas = masks.map(m => ({
    id: m.id,
    areaKm2: maskAreaKm2(m.mask, width, height, north, dLon, dLat),
  }));

  const union = unionMask(masks.map(m => m.mask));
  const edgeTouched = union ? maskTouchesEdge(union, width, height) : false;
  const streamMask = union ?? undefined;

  let polygons: CatchmentPoly[] = [];
  if (combine && union) {
    const area = maskAreaKm2(union, width, height, north, dLon, dLat);
    const poly = maskToPolygons(union, width, height, west, north, dLon, dLat, 'combined', '#1d4e52', area, true);
    if (poly) polygons = [poly];
  } else {
    for (const m of masks) {
      const area = areas.find(a => a.id === m.id)?.areaKm2 ?? 0;
      const poly = maskToPolygons(m.mask, width, height, west, north, dLon, dLat, m.id, m.color, area);
      if (poly) polygons.push(poly);
    }
  }

  return { polygons, streamMask, areas, edgeTouched, snapped };
}
