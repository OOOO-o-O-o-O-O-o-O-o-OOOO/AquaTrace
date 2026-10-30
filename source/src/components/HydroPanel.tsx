import { Download, MapPin, Trash2, X } from 'lucide-react';
import type { CatchmentPoly, HydroGrid, HydroLayers, PolygonClip, PourPoint, StreamLine } from '../hydro/types';
import { exportCatchments, exportPourPoints, exportStreams } from '../hydro/geojson';
import { MAX_POUR_POINTS } from '../hydro/types';

type Props = {
  layers: HydroLayers;
  onLayers: (l: HydroLayers) => void;
  opacity: number;
  onOpacity: (v: number) => void;
  density: number;
  onDensity: (v: number) => void;
  thresholdKm2: number | null;
  pourMode: boolean;
  onPourMode: (v: boolean) => void;
  pourPoints: PourPoint[];
  onClearPours: () => void;
  onRemovePour: (id: string) => void;
  usePolygon: boolean;
  onUsePolygon: (v: boolean) => void;
  polygonClip: PolygonClip;
  onPolygonClip: (v: PolygonClip) => void;
  hasPolygon: boolean;
  areas: { id: string; areaKm2: number }[];
  totalCatchmentKm2: number | null;
  busy: boolean;
  status: string;
  warning: string;
  onRun: () => void;
  grid: HydroGrid | null;
  streams: StreamLine[];
  catchments: CatchmentPoly[];
};

export function HydroPanel({
  layers, onLayers, opacity, onOpacity, density, onDensity, thresholdKm2,
  pourMode, onPourMode, pourPoints, onClearPours, onRemovePour,
  usePolygon, onUsePolygon, polygonClip, onPolygonClip,
  hasPolygon, areas, totalCatchmentKm2, busy, status, warning, onRun,
  grid, streams, catchments,
}: Props) {
  const tog = (k: keyof HydroLayers) => onLayers({ ...layers, [k]: !layers[k] });
  const areaFor = (id: string) => areas.find(a => a.id === id)?.areaKm2;

  const srcLabel = grid
    ? grid.source === 'copernicus' ? 'Copernicus GLO-30'
    : grid.source === 'srtm'      ? 'SRTM 30 m'
    : 'GLO-30 + SRTM'
    : null;

  const hasResults = streams.length > 0 || catchments.length > 0;

  return (
    <>
      {/* ── Run terrain ──────────────────────────────────────────────────── */}
      <section className="panel-block" data-tour="hydro-run">
        <div className="run-row">
          <div className="run-meta">
            {srcLabel
              ? <><span className="src-badge">{srcLabel}</span>
                  <span className="cell-note">{Math.round(grid!.cellSizeM)} m · {grid!.width}×{grid!.height}</span></>
              : <span className="src-badge muted">No terrain loaded</span>
            }
          </div>
          <button className="button primary" style={{ minWidth: 80 }} disabled={busy} onClick={onRun}>
            {busy ? 'Running…' : 'Run'}
          </button>
        </div>
        {warning && <div className="notice" style={{ marginTop: 6 }}>{warning}</div>}
      </section>

      {/* ── Layers ───────────────────────────────────────────────────────── */}
      <section className="panel-block" data-tour="hydro-layers">
        <div className="section-label">Layers</div>
        <div className="chip-row">
          {([
            ['network',     'Streams'],
            ['catchments',  'Basins'],
            ['accumulation','Accumulation'],
            ['dem',         'DEM'],
          ] as const).map(([k, label]) => (
            <button key={k} className={`chip${layers[k] ? ' on' : ''}`} aria-pressed={layers[k]} onClick={() => tog(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
          <label className="range-label"><span>Opacity</span><span>{opacity}%</span></label>
          <input type="range" aria-label="Layer opacity" min={15} max={100} value={opacity}
            onChange={e => onOpacity(Number(e.target.value))} />
        </div>
      </section>

      {/* ── Stream density ───────────────────────────────────────────────── */}
      <section className="panel-block" data-tour="hydro-density">
        <div className="section-label">
          <span>Streams</span>
          {thresholdKm2 != null &&
            <span className="mono" style={{ color: '#8a9693', fontWeight: 400 }}>
              ≥ {thresholdKm2 >= 10 ? thresholdKm2.toFixed(0) : thresholdKm2.toFixed(1)} km²
            </span>
          }
        </div>
        <input type="range" aria-label="Stream density" min={0} max={100} value={density}
          onChange={e => onDensity(Number(e.target.value))} />
        {/* tick labels: left=small, centre=medium, right=large — slider goes left=minor, right=major */}
        <div className="density-ticks">
          <span>Minor</span>
          <span>Medium</span>
          <span>Major</span>
        </div>
      </section>

      {/* ── Pour points ──────────────────────────────────────────────────── */}
      <section className="panel-block" data-tour="hydro-pours">
        <div className="section-label">
          Pour points
          {pourPoints.length > 0 && <span className="mono">{pourPoints.length}/{MAX_POUR_POINTS}</span>}
        </div>
        <div className="row-tools">
          <button className={`button${pourMode ? ' primary' : ''}`} onClick={() => onPourMode(!pourMode)} aria-pressed={pourMode}>
            <MapPin size={12} />{pourMode ? 'Placing…' : 'Place'}
          </button>
          {pourPoints.length > 0 &&
            <button className="button text" onClick={onClearPours}><Trash2 size={12} />Clear all</button>
          }
        </div>
        {pourMode && <div className="hint">Click anywhere — snaps to nearest channel</div>}

        {pourPoints.length > 0 && (
          <div className="pour-list">
            {pourPoints.map((p, i) => {
              const km2 = areaFor(p.id);
              return (
                <div className="pour-row" key={p.id}>
                  <span className="pour-swatch" style={{ background: p.color }} />
                  <span className="mono pour-idx">{i + 1}</span>
                  <span className="pour-coords mono">{p.lat.toFixed(3)}°, {p.lng.toFixed(3)}°</span>
                  <span className="pour-area mono">{km2 != null ? `${km2 >= 100 ? km2.toFixed(0) : km2.toFixed(1)} km²` : '—'}</span>
                  <button className="button text icon-btn" aria-label={`Remove point ${i + 1}`} onClick={() => onRemovePour(p.id)}>
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Catchment / polygon basin ────────────────────────────────────── */}
      <section className="panel-block" data-tour="hydro-polygon">
        <div className="section-label">
          Catchment
          {totalCatchmentKm2 != null && totalCatchmentKm2 > 0 &&
            <span className="mono">{totalCatchmentKm2 >= 100 ? totalCatchmentKm2.toFixed(0) : totalCatchmentKm2.toFixed(1)} km²</span>
          }
        </div>

        {!hasPolygon
          ? <div className="hint">Draw an AOI polygon above to delineate a basin.</div>
          : <>
              <label className="switch-row">
                <input type="checkbox" checked={usePolygon} onChange={e => onUsePolygon(e.target.checked)} />
                Delineate basin from polygon
              </label>
              <div className="seg-tabs" style={{ marginTop: 8 }} role="tablist" aria-label="Extent">
                <button className={`seg-tab${polygonClip === 'inside' ? ' active' : ''}`}
                  disabled={!usePolygon} onClick={() => onPolygonClip('inside')}
                  title="Only cells inside the drawn polygon">
                  Inside only
                </button>
                <button className={`seg-tab${polygonClip === 'full' ? ' active' : ''}`}
                  disabled={!usePolygon} onClick={() => onPolygonClip('full')}
                  title="Full upstream contributing area — may extend beyond polygon">
                  Full upstream
                </button>
              </div>
            </>
        }
      </section>

      {/* ── Export ───────────────────────────────────────────────────────── */}
      <section className="panel-block" data-tour="hydro-export">
        <div className="section-label">Export GeoJSON</div>
        <div className="export-row">
          <button className="button full" disabled={!streams.length}   onClick={() => exportStreams(streams)}>
            <Download size={11} />Streams
          </button>
          <button className="button full" disabled={!catchments.length} onClick={() => exportCatchments(catchments)}>
            <Download size={11} />Basins
          </button>
          <button className="button full" disabled={!pourPoints.length} onClick={() => exportPourPoints(pourPoints)}>
            <Download size={11} />Points
          </button>
        </div>
      </section>

      {/* Status at bottom — only when there's something useful */}
      {status && !busy && (
        <div className="panel-status">{status}</div>
      )}
    </>
  );
}
