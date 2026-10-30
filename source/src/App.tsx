import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Activity, CircleHelp, Download, LocateFixed, MapPin, Search, X } from 'lucide-react';
import MapView, { type MapViewHandle } from './components/MapView';
import { Gallery } from './components/Gallery';
import { Viewer } from './components/Viewer';
import { HydroPanel } from './components/HydroPanel';
import { HelpTour } from './components/HelpTour';
import { sampleProvider, type Scene, type SceneMode } from './data/scenes';
import { loadAndProcessDem } from './hydro/dem';
import { analyzeCatchments } from './hydro/catchments';
import { cellAreaKm2, cellToLonLat, lonLatToCell, snapToChannel, strahlerNetwork } from './hydro/flow';
import { extractStreams } from './hydro/vectorize';
import { accumulationImage, canvasToUrl, demImage } from './hydro/render';
import { CATCHMENT_COLORS, MAX_POUR_POINTS, type CatchmentPoly, type HydroGrid, type HydroLayers, type PolygonClip, type PourPoint, type StreamLine } from './hydro/types';

const initialRaw   = { start: '2024-01-01', end: '2024-12-31', sensors: ['Sentinel-2', 'Landsat 8', 'Landsat 9'], cloud: 20, valid: 70, sort: 'date' };
const initialMndwi = { start: '2024-01-01', end: '2024-12-31', sensors: ['Sentinel-2', 'Landsat 8', 'Landsat 9'] };

// density 0–100 → accumulation threshold in cells
// density=100 → tiny streams (low threshold), density=0 → only major rivers (high threshold)
function thresholdFromDensity(accum: Float32Array, density: number) {
  let max = 1;
  for (let i = 0; i < accum.length; i++) if (accum[i] > max) max = accum[i];
  const minT = Math.max(12, max * 0.00045);
  const maxT = Math.max(minT * 6, max * 0.1);
  const t = 1 - density / 100;
  return Math.exp(Math.log(minT) + t * (Math.log(maxT) - Math.log(minT)));
}

function App() {
  const [workspace, setWorkspace] = useState<'imagery' | 'hydrology'>('imagery');
  const [mode, setMode] = useState<SceneMode>('raw');
  const [all, setAll] = useState<Scene[]>([]);
  const [rawForm, setRawForm]     = useState(initialRaw);
  const [rawApplied, setRawApplied] = useState(initialRaw);
  const [mndwiForm, setMndwiForm]   = useState(initialMndwi);
  const [mndwiApplied, setMndwiApplied] = useState(initialMndwi);
  const [selected, setSelected] = useState('');
  const [viewer, setViewer]     = useState<Scene | null>(null);
  const [full, setFull]         = useState(false);
  const [search, setSearch]     = useState('');
  const [lookup, setLookup]     = useState('');
  const [error, setError]       = useState('');
  const [drawing, setDrawing]   = useState(false);
  const [polygon, setPolygon]   = useState<[number, number][]>([]);
  const [coordInput, setCoordInput] = useState('');
  const [focus, setFocus]       = useState<[number, number] | null>(null);
  const [tour, setTour]         = useState(false);

  // Hydro state
  const [layers, setLayers] = useState<HydroLayers>({ network: true, catchments: true, accumulation: false, dem: false });
  const [opacity, setOpacity]   = useState(78);
  const [density, setDensity]   = useState(64);
  const [pourMode, setPourMode] = useState(false);
  const [pourPoints, setPourPoints] = useState<PourPoint[]>([]);
  const [usePolygon, setUsePolygon] = useState(false);
  const [polygonClip, setPolygonClip] = useState<PolygonClip>('full');
  const [grid, setGrid]       = useState<HydroGrid | null>(null);
  const [streams, setStreams] = useState<StreamLine[]>([]);
  const [catchments, setCatchments] = useState<CatchmentPoly[]>([]);
  const [areas, setAreas]     = useState<{ id: string; areaKm2: number }[]>([]);
  const [hydroBusy, setHydroBusy]     = useState(false);
  const [hydroStatus, setHydroStatus] = useState('');
  const [hydroWarning, setHydroWarning] = useState('');
  const [demUrl, setDemUrl]     = useState<string | null>(null);
  const [accumUrl, setAccumUrl] = useState<string | null>(null);
  const mapRef = useRef<MapViewHandle>(null);
  const runId  = useRef(0);

  useEffect(() => {
    sampleProvider.list('raw').then(raw =>
      sampleProvider.list('mndwi').then(mndwi => setAll([...raw, ...mndwi]))
    );
  }, []);

  const rawScenes = useMemo(() =>
    all.filter(s =>
      s.mode === 'raw' &&
      s.date >= rawApplied.start && s.date <= rawApplied.end &&
      rawApplied.sensors.includes(s.sensor) &&
      (s.cloudCover ?? 100) <= rawApplied.cloud &&
      (s.validPixelPercent ?? 0) >= rawApplied.valid
    ).sort((a, b) =>
      rawApplied.sort === 'cloud'   ? (a.cloudCover ?? 100) - (b.cloudCover ?? 100) :
      rawApplied.sort === 'quality' ? (b.quality ?? 0) - (a.quality ?? 0) :
      b.date.localeCompare(a.date)
    ), [all, rawApplied]);

  const mndwiScenes = useMemo(() =>
    all.filter(s =>
      s.mode === 'mndwi' &&
      s.date >= mndwiApplied.start && s.date <= mndwiApplied.end &&
      mndwiApplied.sensors.includes(s.sensor)
    ).sort((a, b) => b.date.localeCompare(a.date)), [all, mndwiApplied]);

  const scenes = mode === 'raw' ? rawScenes : mndwiScenes;
  const chosen = scenes.find(s => s.id === selected) || scenes[0] || null;
  const area   = useMemo(() =>
    polygon.length < 3 ? 0 :
    Math.abs(polygon.reduce((sum, p, i) => {
      const n = polygon[(i + 1) % polygon.length];
      return sum + p[0] * n[1] - n[0] * p[1];
    }, 0) / 2) * 111.32 * 111.32 * Math.cos((polygon[0][1] * Math.PI) / 180),
  [polygon]);

  const setSensor = (sensor: string, current: string[], setter: (f: any) => void, form: any) => {
    const sensors = current.includes(sensor)
      ? current.filter((s: string) => s !== sensor)
      : [...current, sensor];
    setter({ ...form, sensors });
  };

  const downloadOne = async (scene: Scene) => {
    try {
      const res = await fetch(sampleProvider.assetUrl(scene));
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${scene.id}.svg`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
    } catch { setError('The bundled sample asset could not be downloaded.'); }
  };

  const downloadCollection = async () => {
    try {
      const zip = new JSZip();
      zip.file('README.txt', 'AquaTrace illustrative sample imagery collection.\n');
      await Promise.all(scenes.map(async s => {
        const res = await fetch(sampleProvider.assetUrl(s));
        if (!res.ok) throw new Error();
        zip.file(`${s.id}.svg`, await res.blob());
      }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `aquatrace-${mode}-collection.zip`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
    } catch { setError('The sample collection could not be packaged.'); }
  };

  const lookupPlace = async () => {
    const query = search.trim();
    if (!query) return;
    if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(query)) {
      const [lat, lng] = query.split(',').map(Number);
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { setError('Invalid coordinates.'); return; }
      setFocus([lng, lat]); setLookup(`${lat.toFixed(4)}, ${lng.toFixed(4)}`); setError(''); return;
    }
    setLookup('Looking up…'); setError('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error('Place lookup unavailable');
      const results = await res.json();
      if (!results.length) throw new Error('No matching place found.');
      const r = results[0];
      setFocus([Number(r.lon), Number(r.lat)]);
      setLookup(r.display_name.split(',').slice(0, 2).join(','));
      setError('');
    } catch (e) { setLookup(''); setError(e instanceof Error ? e.message : 'Lookup failed.'); }
  };

  const applyCoord = () => {
    const parts = coordInput.split(',').map(v => Number(v.trim()));
    if (parts.length !== 2 || parts.some(v => !Number.isFinite(v)) || parts[0] < -90 || parts[0] > 90 || parts[1] < -180 || parts[1] > 180) {
      setError('Enter valid latitude, longitude.'); return;
    }
    setFocus([parts[1], parts[0]]); setSearch(`${parts[0]}, ${parts[1]}`); setLookup('Coordinate location'); setError('');
  };

  const snapLngLat = useCallback((lng: number, lat: number, g: HydroGrid) => {
    const loc = lonLatToCell(lng, lat, g.west, g.north, g.dLon, g.dLat, g.width, g.height);
    if (loc.i < 0) return { lng, lat };
    const i = snapToChannel(g.accum, g.width, g.height, loc.x, loc.y, Math.max(4, Math.round(280 / g.cellSizeM)));
    if (i < 0) return { lng, lat };
    const [slng, slat] = cellToLonLat(i, g.width, g.west, g.north, g.dLon, g.dLat);
    return { lng: slng, lat: slat };
  }, []);

  const addPour = (lng: number, lat: number) => {
    if (pourPoints.length >= MAX_POUR_POINTS) return;
    const color = CATCHMENT_COLORS[pourPoints.length % CATCHMENT_COLORS.length];
    const snapped = grid ? snapLngLat(lng, lat, grid) : { lng, lat };
    setPourPoints(list => [...list, { id: `p${Date.now()}`, color, ...snapped }]);
  };

  const movePour = (id: string, lng: number, lat: number) => {
    const snapped = grid ? snapLngLat(lng, lat, grid) : { lng, lat };
    setPourPoints(list => list.map(p => p.id === id ? { ...p, ...snapped } : p));
  };

  const runHydro = async () => {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) return;
    const id = ++runId.current;
    setHydroBusy(true); setHydroWarning(''); setError(''); setPourMode(false);
    try {
      const next = await loadAndProcessDem(bounds, label => {
        if (runId.current === id) setHydroStatus(label);
      });
      if (runId.current !== id) return;
      setGrid(next);
      setPourPoints(list => list.map(p => ({ ...p, ...snapLngLat(p.lng, p.lat, next) })));
      const src = next.source === 'copernicus' ? 'Copernicus GLO-30' : next.source === 'srtm' ? 'SRTM 30 m' : 'GLO-30 + SRTM';
      const warn: string[] = [];
      if (next.resampled) warn.push(`Resampled to ${Math.round(next.cellSizeM)} m for this view.`);
      if (next.source === 'srtm') warn.push('Copernicus unavailable here; using SRTM.');
      setHydroWarning(warn.join(' '));
      setHydroStatus(`${src} · ${Math.round(next.cellSizeM)} m · ${next.width}×${next.height}`);
    } catch (e) {
      if (runId.current !== id) return;
      setHydroStatus(''); setHydroWarning(e instanceof Error ? e.message : 'Run failed.');
    } finally {
      if (runId.current === id) setHydroBusy(false);
    }
  };

  // Recompute streams + catchments whenever grid, pour points, polygon settings, or density changes.
  // Streams are ALWAYS masked to the polygon/pour-point union when either is active —
  // so only channels that contribute to your selected area are shown.
  useEffect(() => {
    if (!grid) { setCatchments([]); setAreas([]); setStreams([]); return; }

    // combine is always true: all pour-point catchments are unioned
    const result = analyzeCatchments(grid, pourPoints, polygon, usePolygon, polygonClip, true);
    setCatchments(result.polygons);
    setAreas(result.areas);

    if (result.edgeTouched && (pourPoints.length || usePolygon)) {
      setHydroWarning(w =>
        w.includes('elevation window') ? w :
        `${w ? `${w} ` : ''}Catchment reaches the DEM edge — pan to include more upstream terrain and run again.`
      );
    }

    const threshold = thresholdFromDensity(grid.accum, density);
    // Always mask streams to the contributing area when pour points or polygon are set
    const mask = (pourPoints.length > 0 || usePolygon) ? result.streamMask : undefined;
    const order = strahlerNetwork(grid.fdir, grid.accum, grid.width, grid.height, threshold, mask);
    setStreams(extractStreams(
      grid.fdir, grid.accum, order,
      grid.width, grid.height,
      grid.west, grid.north, grid.dLon, grid.dLat,
      threshold, mask
    ));
  }, [grid, pourPoints, polygon, usePolygon, polygonClip, density]);

  // Render raster overlays (DEM + accumulation) whenever grid changes
  useEffect(() => {
    if (!grid) return;
    let cancel = false;
    Promise.all([
      canvasToUrl(demImage(grid.dem, grid.width, grid.height)),
      canvasToUrl(accumulationImage(grid.accum, grid.width, grid.height)),
    ]).then(([dem, accum]) => {
      if (cancel) { URL.revokeObjectURL(dem); URL.revokeObjectURL(accum); return; }
      setDemUrl(prev => { if (prev) URL.revokeObjectURL(prev); return dem; });
      setAccumUrl(prev => { if (prev) URL.revokeObjectURL(prev); return accum; });
    }).catch(() => undefined);
    return () => { cancel = true; };
  }, [grid]);

  // When polygon is cleared, disable polygon mode
  useEffect(() => { if (!polygon.length) setUsePolygon(false); }, [polygon.length]);

  const thresholdKm2 = grid
    ? thresholdFromDensity(grid.accum, density) * cellAreaKm2((grid.north + grid.south) / 2, grid.dLon, grid.dLat)
    : null;

  const onWorkspace = useCallback((tab: 'imagery' | 'hydrology') => setWorkspace(tab), []);
  const commonSensors = ['Sentinel-2', 'Landsat 8', 'Landsat 9'];
  const hydroBounds = grid ? { west: grid.west, south: grid.south, east: grid.east, north: grid.north } : null;

  // Combined catchment area
  const totalCatchmentKm2 = areas.length
    ? areas.reduce((s, a) => s + a.areaKm2, 0)
    : null;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Activity size={13} /></span>AquaTrace</div>
      <span className="top-meta">SCENE INSPECTION / HYDROLOGY</span>
      <div className="top-right">
        <span><i className="online-dot" />Ready</span>
        <button className="button" data-tour="help" onClick={() => setTour(true)} aria-label="Open feature guide">
          <CircleHelp size={13} /> Help
        </button>
        <span className="mono">v1.1</span>
      </div>
    </header>

    <div className={`workspace ${workspace === 'hydrology' ? 'workspace-hydro' : ''}`}>
      <aside className="side-panel">
        <div className="side-scroll">

          {/* Workspace tabs */}
          <div className="mode-tabs" role="tablist" aria-label="Workspace" data-tour="workspace" style={{ marginBottom: 14 }}>
            <button className={`mode-tab ${workspace === 'imagery' ? 'active' : ''}`} role="tab"
              aria-selected={workspace === 'imagery'}
              onClick={() => { setWorkspace('imagery'); setPourMode(false); }}>
              Imagery
            </button>
            <button className={`mode-tab ${workspace === 'hydrology' ? 'active' : ''}`} role="tab"
              aria-selected={workspace === 'hydrology'}
              onClick={() => setWorkspace('hydrology')}>
              Hydrology
            </button>
          </div>

          {/* AOI — shared across both workspaces */}
          <section className="panel-block" data-tour="aoi">
            <div className="section-label">Area <span>{polygon.length > 2 ? 'DEFINED' : 'OPTIONAL'}</span></div>
            <div className="aoi-tools">
              {!drawing
                ? <button className="button" onClick={() => { setPolygon([]); setDrawing(true); setPourMode(false); setError(''); }}>
                    <MapPin size={12} /> Draw
                  </button>
                : <button className="button primary" onClick={() => setDrawing(false)}>Finish</button>
              }
              {drawing && <button className="button" onClick={() => { setDrawing(false); setPolygon([]); }}><X size={12} /> Cancel</button>}
              {polygon.length > 0 && !drawing && <button className="button" onClick={() => { setPolygon([]); setDrawing(true); setPourMode(false); }}>Redraw</button>}
              {polygon.length > 0 && <button className="button text" onClick={() => { setPolygon([]); setDrawing(false); }}>Clear</button>}
            </div>
            <div className="coord-entry">
              <input className="coord-input mono" aria-label="Latitude and longitude" placeholder="lat, lon"
                value={coordInput} onChange={e => setCoordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCoord()} />
              <button className="button" onClick={applyCoord} aria-label="Go to coordinates"><LocateFixed size={13} /></button>
            </div>
            {polygon.length > 0 &&
              <div className="small-note mono" style={{ marginTop: 6 }}>
                {polygon.length} pts{area ? ` · ${area.toFixed(1)} km²` : ''}
              </div>
            }
          </section>

          {/* ── IMAGERY workspace ── */}
          {workspace === 'imagery' && (<>
            <div className="section-label" style={{ marginTop: 16 }}>Collection <span className="mono">01 / 02</span></div>
            <div className="mode-tabs" role="tablist" aria-label="Scene collection">
              <button className={`mode-tab ${mode === 'raw' ? 'active' : ''}`} role="tab" aria-selected={mode === 'raw'} onClick={() => { setMode('raw'); setFull(false); }}>Raw</button>
              <button className={`mode-tab ${mode === 'mndwi' ? 'active' : ''}`} role="tab" aria-selected={mode === 'mndwi'} onClick={() => { setMode('mndwi'); setFull(false); }}>MNDWI</button>
            </div>

            {mode === 'raw'
              ? <section className="panel-block">
                  <div className="section-label">Filters <span>RAW</span></div>
                  <div className="field-row">
                    <div className="field"><label htmlFor="raw-start">From</label><input id="raw-start" type="date" value={rawForm.start} onChange={e => setRawForm({ ...rawForm, start: e.target.value })} /></div>
                    <div className="field"><label htmlFor="raw-end">To</label><input id="raw-end" type="date" value={rawForm.end} onChange={e => setRawForm({ ...rawForm, end: e.target.value })} /></div>
                  </div>
                  <div className="field"><label>Sensor</label>
                    <div className="sensor-row">{commonSensors.map(s => <button key={s} className={`sensor-chip ${rawForm.sensors.includes(s) ? 'selected' : ''}`} onClick={() => setSensor(s, rawForm.sensors, setRawForm, rawForm)}>{s}</button>)}</div>
                  </div>
                  <div className="field"><label className="range-label"><span>Cloud</span><span>{rawForm.cloud}%</span></label><input aria-label="Max cloud" type="range" min="0" max="100" value={rawForm.cloud} onChange={e => setRawForm({ ...rawForm, cloud: Number(e.target.value) })} /></div>
                  <div className="field"><label className="range-label"><span>Valid pixels</span><span>{rawForm.valid}%</span></label><input aria-label="Min valid" type="range" min="0" max="100" value={rawForm.valid} onChange={e => setRawForm({ ...rawForm, valid: Number(e.target.value) })} /></div>
                  <div className="field"><label htmlFor="raw-sort">Sort</label><select id="raw-sort" value={rawForm.sort} onChange={e => setRawForm({ ...rawForm, sort: e.target.value })}><option value="date">Date</option><option value="cloud">Cloud</option><option value="quality">Quality</option></select></div>
                  <button className="button primary full" onClick={() => { setRawApplied({ ...rawForm }); setFull(false); }}>Apply</button>
                </section>
              : <section className="panel-block">
                  <div className="section-label">Filters <span>MNDWI</span></div>
                  <div className="field-row">
                    <div className="field"><label htmlFor="mndwi-start">From</label><input id="mndwi-start" type="date" value={mndwiForm.start} onChange={e => setMndwiForm({ ...mndwiForm, start: e.target.value })} /></div>
                    <div className="field"><label htmlFor="mndwi-end">To</label><input id="mndwi-end" type="date" value={mndwiForm.end} onChange={e => setMndwiForm({ ...mndwiForm, end: e.target.value })} /></div>
                  </div>
                  <div className="field"><label>Sensor</label>
                    <div className="sensor-row">{commonSensors.map(s => <button key={s} className={`sensor-chip ${mndwiForm.sensors.includes(s) ? 'selected' : ''}`} onClick={() => setSensor(s, mndwiForm.sensors, setMndwiForm, mndwiForm)}>{s}</button>)}</div>
                  </div>
                  <button className="button primary full" onClick={() => { setMndwiApplied({ ...mndwiForm }); setFull(false); }}>Apply</button>
                </section>
            }

            {mode === 'mndwi' && <section className="panel-block">
              <div className="section-label">Index</div>
              <div className="redblue-legend" aria-label="MNDWI colour scale" />
              <div className="range-label"><span>−1</span><span>+1</span></div>
            </section>}
          </>)}

          {/* ── HYDROLOGY workspace ── */}
          {workspace === 'hydrology' && (
            <HydroPanel
              layers={layers}          onLayers={setLayers}
              opacity={opacity}        onOpacity={setOpacity}
              density={density}        onDensity={setDensity}
              thresholdKm2={thresholdKm2}
              pourMode={pourMode}      onPourMode={v => { setPourMode(v); if (v) setDrawing(false); }}
              pourPoints={pourPoints}
              onClearPours={() => setPourPoints([])}
              onRemovePour={id => setPourPoints(list => list.filter(p => p.id !== id))}
              usePolygon={usePolygon}  onUsePolygon={setUsePolygon}
              polygonClip={polygonClip} onPolygonClip={setPolygonClip}
              hasPolygon={polygon.length > 2}
              areas={areas}
              totalCatchmentKm2={totalCatchmentKm2}
              busy={hydroBusy}
              status={hydroStatus}
              warning={hydroWarning}
              onRun={runHydro}
              grid={grid}
              streams={streams}
              catchments={catchments}
            />
          )}

        </div>
      </aside>

      <section className="map-area">
        <div className="map-toolbar">
          <div className="searchbar" data-tour="search">
            <Search size={14} className="search-icon" />
            <input aria-label="Search place or coordinates" placeholder="Place or lat, lon"
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupPlace()} />
            <button className="search-go" onClick={lookupPlace}>Go</button>
          </div>
          <span className="result-sub">{lookup}</span>
          <span className="toolbar-spacer" />
          <span className="small-note">{workspace === 'hydrology' ? 'Copernicus GLO-30 / SRTM' : 'Satellite · Esri'}</span>
        </div>

        <div className="map-stage">
          <MapView
            ref={mapRef}
            drawMode={drawing}
            polygon={polygon}
            onPolygon={setPolygon}
            scenes={scenes}
            focus={focus}
            pourMode={pourMode}
            pourPoints={pourPoints}
            onAddPour={addPour}
            onMovePour={movePour}
            layers={layers}
            opacity={opacity}
            streams={streams}
            catchments={catchments}
            demUrl={demUrl}
            accumUrl={accumUrl}
            hydroBounds={hydroBounds}
            showScenes={workspace === 'imagery'}
          />

          {drawing && <div className="aoi-status">Click to add vertices · Finish when done</div>}
          {pourMode && <div className="aoi-status">Click map to place pour point · snaps to channel</div>}
          {polygon.length > 2 && !drawing && workspace === 'imagery' && <div className="aoi-status">AOI · {area.toFixed(1)} km²</div>}
          {hydroBusy && <div className="aoi-status">{hydroStatus || 'Working…'}</div>}

          {mode === 'mndwi' && workspace === 'imagery' && (
            <div className="map-legend">
              <div>MNDWI</div>
              <div className="redblue-legend" />
              <div className="range-label"><span>−1</span><span>+1</span></div>
            </div>
          )}
          {workspace === 'hydrology' && layers.accumulation && grid && (
            <div className="map-legend">
              <div>Accumulation</div>
              <div className="accum-legend" />
              <div className="range-label"><span>low</span><span>high</span></div>
            </div>
          )}
        </div>

        {workspace === 'imagery' && (<>
          <div className="result-bar">
            <span className="result-count">{scenes.length} {mode === 'raw' ? 'scenes' : 'renders'}</span>
            <span className="result-sub">sample collection</span>
            <div className="collection-actions">
              <button className="button" disabled={!scenes.length} onClick={downloadCollection}>
                <Download size={12} /> Collection
              </button>
            </div>
          </div>
          <Gallery
            scenes={scenes}
            selected={chosen?.id || selected}
            onSelect={s => setSelected(s.id)}
            onOpen={s => { setSelected(s.id); setViewer(s); }}
            onDownload={downloadOne}
            full={full}
            onToggleFull={() => setFull(v => !v)}
            mode={mode}
          />
        </>)}

        {error && <div className="notice" role="status" style={{ padding: '0 14px 12px' }}>{error}</div>}
      </section>
    </div>

    {viewer && <Viewer scene={viewer} collection={scenes} onClose={() => setViewer(null)} onChange={s => { setViewer(s); setSelected(s.id); }} />}
    <HelpTour open={tour} onClose={() => setTour(false)} workspace={workspace} onWorkspace={onWorkspace} />
  </main>;
}

export default App;
