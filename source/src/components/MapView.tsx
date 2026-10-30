import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import type { Scene } from '../data/scenes';
import type { CatchmentPoly, HydroLayers, PourPoint, StreamLine } from '../hydro/types';

export type MapViewHandle = {
  getBounds: () => { west: number; south: number; east: number; north: number } | null;
};

type Props = {
  drawMode: boolean;
  polygon: [number, number][];
  onPolygon: (points: [number, number][]) => void;
  scenes: Scene[];
  focus?: [number, number] | null;
  pourMode?: boolean;
  pourPoints?: PourPoint[];
  onAddPour?: (lng: number, lat: number) => void;
  onMovePour?: (id: string, lng: number, lat: number) => void;
  layers?: HydroLayers;
  opacity?: number;
  streams?: StreamLine[];
  catchments?: CatchmentPoly[];
  demUrl?: string | null;
  accumUrl?: string | null;
  hydroBounds?: { west: number; south: number; east: number; north: number } | null;
  showScenes?: boolean;
};

const MapView = forwardRef<MapViewHandle, Props>(function MapView({
  drawMode, polygon, onPolygon, scenes, focus,
  pourMode, pourPoints = [], onAddPour, onMovePour,
  layers, opacity = 80, streams = [], catchments = [],
  demUrl, accumUrl, hydroBounds, showScenes = true,
}, ref) {
  const host        = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<L.Map | null>(null);
  const aoiLayerRef = useRef<L.FeatureGroup | null>(null);
  const sceneLayerRef = useRef<L.LayerGroup | null>(null);
  const catchLayerRef = useRef<L.GeoJSON | null>(null);
  const pourLayerRef  = useRef<L.LayerGroup | null>(null);
  const streamCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const demOverlayRef   = useRef<L.ImageOverlay | null>(null);
  const accumOverlayRef = useRef<L.ImageOverlay | null>(null);

  // Mutable refs so event callbacks always see latest values
  const polygonRef    = useRef(polygon);
  const onPolygonRef  = useRef(onPolygon);
  const pourModeRef   = useRef(pourMode);
  const onAddPourRef  = useRef(onAddPour);
  const streamsRef    = useRef(streams);
  const layersRef     = useRef(layers);
  const opacityRef    = useRef(opacity);
  const previousDrawMode = useRef(drawMode);

  const [coord, setCoord]     = useState<[number, number]>([39.08, -120.03]);
  const [tileError, setTileError] = useState(false);

  polygonRef.current   = polygon;
  onPolygonRef.current = onPolygon;
  pourModeRef.current  = pourMode;
  onAddPourRef.current = onAddPour;
  streamsRef.current   = streams;
  layersRef.current    = layers;
  opacityRef.current   = opacity;

  useImperativeHandle(ref, () => ({
    getBounds: () => {
      const b = mapRef.current?.getBounds();
      if (!b) return null;
      return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
    },
  }));

  // ── Stream canvas drawing ──────────────────────────────────────────────────
  // Thin plain blue lines, width scales with Strahler order and zoom.
  // No glow, no neon — just clean cartographic lines.
  const drawStreams = () => {
    const map    = mapRef.current;
    const canvas = streamCanvasRef.current;
    if (!map || !canvas) return;

    const size = map.getSize();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width  = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width  = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    if (!layersRef.current?.network) return;

    const alpha = (opacityRef.current / 100);
    const zoom  = map.getZoom();
    // Scale from zoom 6 (thin) to zoom 13 (thicker) — capped range
    const scale = Math.max(0.5, Math.min(2.0, (zoom - 5) / 6));

    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    for (const line of streamsRef.current) {
      if (line.coords.length < 2) continue;

      // Width: order 1 → ~0.6px, order 5 → ~2.6px at scale=1, grows with zoom
      const w = (0.5 + line.order * 0.42) * scale;

      ctx.beginPath();
      line.coords.forEach(([lng, lat], i) => {
        const p = map.latLngToContainerPoint([lat, lng]);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      });

      // Single pass — plain blue, semi-transparent, thin
      ctx.strokeStyle = `rgba(50, 120, 200, ${alpha * 0.78})`;
      ctx.lineWidth   = w;
      ctx.stroke();
    }
  };

  // ── Leaflet init ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!host.current || mapRef.current) return;

    const map = L.map(host.current, { zoomControl: false, minZoom: 2 })
      .setView([39.08, -120.03], 7);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics' }
    ).on('tileerror', () => setTileError(true))
     .on('tileload',  () => setTileError(false))
     .addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Custom panes (no hillshade pane)
    map.createPane('hydroDem');
    map.getPane('hydroDem')!.style.zIndex = '349';
    map.getPane('hydroDem')!.style.pointerEvents = 'none';

    map.createPane('hydroAccum');
    map.getPane('hydroAccum')!.style.zIndex = '351';
    map.getPane('hydroAccum')!.style.pointerEvents = 'none';

    map.createPane('hydroCatch');
    map.getPane('hydroCatch')!.style.zIndex = '390';

    const aoiLayer   = L.featureGroup().addTo(map);
    const sceneLayer = L.layerGroup().addTo(map);
    const catchLayer = L.geoJSON(undefined, { pane: 'hydroCatch' }).addTo(map);
    const pourLayer  = L.layerGroup().addTo(map);

    // Stream canvas on top of everything
    const canvas = L.DomUtil.create('canvas', 'hydro-stream-canvas') as HTMLCanvasElement;
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:410;';
    map.getContainer().appendChild(canvas);
    streamCanvasRef.current = canvas;

    map.on('mousemove', (e: L.LeafletMouseEvent) => setCoord([e.latlng.lat, e.latlng.lng]));
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (host.current?.dataset.draw === 'true') {
        const pts = [...polygonRef.current, [e.latlng.lng, e.latlng.lat] as [number, number]];
        polygonRef.current = pts;
        onPolygonRef.current(pts);
        return;
      }
      if (pourModeRef.current) onAddPourRef.current?.(e.latlng.lng, e.latlng.lat);
    });

    map.on('move zoom viewreset resize', () => drawStreams());
    new ResizeObserver(() => { map.invalidateSize({ pan: false }); drawStreams(); }).observe(host.current);

    mapRef.current    = map;
    aoiLayerRef.current   = aoiLayer;
    sceneLayerRef.current = sceneLayer;
    catchLayerRef.current = catchLayer;
    pourLayerRef.current  = pourLayer;

    return () => {
      map.remove();
      mapRef.current = aoiLayerRef.current = sceneLayerRef.current =
        catchLayerRef.current = pourLayerRef.current = streamCanvasRef.current = null;
    };
  }, []);

  // ── AOI polygon ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (host.current) host.current.dataset.draw = drawMode ? 'true' : 'false';
    const map = mapRef.current; const aoiLayer = aoiLayerRef.current;
    if (!map || !aoiLayer) return;

    map.getContainer().style.cursor = drawMode || pourMode ? 'crosshair' : '';
    drawMode || pourMode ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable();

    aoiLayer.clearLayers();
    polygon.forEach(([lng, lat]) => {
      L.circleMarker([lat, lng], { radius: 4, color: '#286e69', weight: 1.5, fillColor: '#f6fbf8', fillOpacity: 1 })
        .addTo(aoiLayer);
    });
    if (polygon.length > 2) {
      L.polygon(polygon.map(([lng, lat]) => [lat, lng] as [number, number]), {
        color: '#286e69', weight: 2, opacity: 0.95,
        fillColor: '#48b7aa', fillOpacity: 0.12, dashArray: '5 4',
      }).addTo(aoiLayer);
    }
    if (!drawMode && previousDrawMode.current && polygon.length > 2) {
      map.fitBounds(L.latLngBounds(polygon.map(([lng, lat]) => [lat, lng] as [number, number])),
        { padding: [60, 60], animate: true, duration: 0.5 });
    }
    previousDrawMode.current = drawMode;
  }, [polygon, drawMode, pourMode]);

  // ── Scene markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; const sl = sceneLayerRef.current;
    if (!map || !sl) return;
    sl.clearLayers();
    if (!showScenes) return;
    scenes.forEach(scene => {
      const m = L.marker([scene.center[1], scene.center[0]], {
        title: `${scene.location} · ${scene.date}`,
        icon: L.divIcon({ className: 'scene-marker-icon', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      });
      m.on('click', () => map.flyTo([scene.center[1], scene.center[0]], Math.max(map.getZoom(), 9), { duration: 0.6 }));
      m.addTo(sl);
    });
  }, [scenes, showScenes]);

  // ── Focus fly-to ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo([focus[1], focus[0]], 9, { duration: 0.65 });
  }, [focus]);

  // ── Raster overlays (DEM + accumulation) ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hydroBounds) return;
    const ll: L.LatLngBoundsExpression = [[hydroBounds.south, hydroBounds.west], [hydroBounds.north, hydroBounds.east]];
    const a = opacity / 100;

    if (demOverlayRef.current) { map.removeLayer(demOverlayRef.current); demOverlayRef.current = null; }
    if (accumOverlayRef.current) { map.removeLayer(accumOverlayRef.current); accumOverlayRef.current = null; }

    if (layers?.dem && demUrl) {
      demOverlayRef.current = L.imageOverlay(demUrl, ll, { pane: 'hydroDem', opacity: a * 0.82, interactive: false }).addTo(map);
    }
    if (layers?.accumulation && accumUrl) {
      accumOverlayRef.current = L.imageOverlay(accumUrl, ll, { pane: 'hydroAccum', opacity: a * 0.65, interactive: false }).addTo(map);
    }
  }, [demUrl, accumUrl, hydroBounds, layers, opacity]);

  // ── Catchment polygons ─────────────────────────────────────────────────────
  useEffect(() => {
    const layer = catchLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!layers?.catchments) return;
    const a = opacity / 100;
    catchments.forEach(poly => {
      const geo: GeoJSON.Feature = {
        type: 'Feature', properties: {},
        geometry: poly.rings.length === 1
          ? { type: 'Polygon',      coordinates: poly.rings }
          : { type: 'MultiPolygon', coordinates: poly.rings.map(r => [r]) },
      };
      L.geoJSON(geo, {
        pane: 'hydroCatch',
        style: {
          color:       poly.combined ? '#1d4e52' : poly.color,
          weight:      poly.combined ? 2.0 : 1.4,
          opacity:     0.9 * a,
          fillColor:   poly.combined ? '#1d4e52' : poly.color,
          fillOpacity: (poly.combined ? 0.12 : 0.20) * a,
        },
      }).eachLayer(l => layer.addLayer(l));
    });
  }, [catchments, layers, opacity]);

  // ── Pour point markers ─────────────────────────────────────────────────────
  useEffect(() => {
    const group = pourLayerRef.current;
    if (!group) return;
    group.clearLayers();
    pourPoints.forEach(p => {
      const marker = L.marker([p.lat, p.lng], {
        draggable: true,
        icon: L.divIcon({
          className: 'pour-marker',
          html: `<span style="background:${p.color}"></span>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        }),
      });
      marker.on('dragend', () => { const ll = marker.getLatLng(); onMovePour?.(p.id, ll.lng, ll.lat); });
      marker.addTo(group);
    });
  }, [pourPoints, onMovePour]);

  // ── Redraw streams on data / layer / opacity changes ───────────────────────
  useEffect(() => { drawStreams(); }, [streams, layers, opacity]);

  return <>
    <div ref={host} className="map-container" aria-label="Interactive map" data-testid="map-satellite" />
    {tileError && (
      <div className="map-connectivity" role="status">
        Basemap tiles unavailable — check connection.
      </div>
    )}
    <div className="map-coord mono">
      {Math.abs(coord[0]).toFixed(4)}°&nbsp;{coord[0] >= 0 ? 'N' : 'S'}&nbsp;&nbsp;
      {Math.abs(coord[1]).toFixed(4)}°&nbsp;{coord[1] >= 0 ? 'E' : 'W'}
    </div>
  </>;
});

export default MapView;
