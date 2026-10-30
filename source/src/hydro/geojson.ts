import type { CatchmentPoly, PourPoint, StreamLine } from './types';

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

export function exportStreams(lines: StreamLine[]) {
  download(
    'aquatrace-streams.geojson',
    JSON.stringify({
      type: 'FeatureCollection',
      features: lines.map(line => ({
        type: 'Feature',
        properties: { order: line.order, accumulation: Math.round(line.accum) },
        geometry: { type: 'LineString', coordinates: line.coords },
      })),
    }),
  );
}

export function exportCatchments(polys: CatchmentPoly[]) {
  download(
    'aquatrace-catchments.geojson',
    JSON.stringify({
      type: 'FeatureCollection',
      features: polys.map(poly => ({
        type: 'Feature',
        properties: {
          id: poly.id,
          area_km2: Number(poly.areaKm2.toFixed(3)),
          combined: Boolean(poly.combined),
        },
        geometry:
          poly.rings.length === 1
            ? { type: 'Polygon', coordinates: poly.rings }
            : { type: 'MultiPolygon', coordinates: poly.rings.map(r => [r]) },
      })),
    }),
  );
}

export function exportPourPoints(points: PourPoint[]) {
  download(
    'aquatrace-pour-points.geojson',
    JSON.stringify({
      type: 'FeatureCollection',
      features: points.map(p => ({
        type: 'Feature',
        properties: { id: p.id },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    }),
  );
}
