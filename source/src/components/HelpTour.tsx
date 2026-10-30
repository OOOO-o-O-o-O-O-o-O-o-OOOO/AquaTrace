import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

type Step = {
  title: string;
  body: string;
  target?: string;
  tab?: 'imagery' | 'hydrology';
};

const STEPS: Step[] = [
  {
    title: 'Two workspaces',
    body: 'Imagery shows the sample satellite collection. Hydrology computes live drainage from elevation for whatever the map is showing.',
    target: '[data-tour="workspace"]',
  },
  {
    title: 'Area of interest',
    body: 'Draw a polygon on the map to define an area, or jump to any location by typing a place name or lat, lon coordinates.',
    target: '[data-tour="aoi"]',
    tab: 'imagery',
  },
  {
    title: 'Find a place',
    body: 'Type a place name or paste coordinates (latitude, longitude). An internet connection is needed for name lookup; coordinates always work.',
    target: '[data-tour="search"]',
  },
  {
    title: 'Run terrain analysis',
    body: 'Fetches Copernicus GLO-30 elevation (30 m) for the current view, falling back to SRTM where tiles are missing. Fills depressions, computes D8 flow direction and accumulation. Very large views are resampled.',
    target: '[data-tour="hydro-run"]',
    tab: 'hydrology',
  },
  {
    title: 'Layer toggles',
    body: 'Streams: the drainage network. Basins: upstream catchments per pour point. Accumulation: log-scaled flow raster. Hillshade: terrain shading for orientation. Opacity applies to all raster overlays.',
    target: '[data-tour="hydro-layers"]',
    tab: 'hydrology',
  },
  {
    title: 'Network density',
    body: 'Controls the accumulation threshold. Drag right for major rivers only, left for fine channels. The label shows the minimum contributing area in km². Line width follows Strahler stream order automatically.',
    target: '[data-tour="hydro-density"]',
    tab: 'hydrology',
  },
  {
    title: 'Pour points',
    body: 'Click "Place" then click the map to drop up to 8 pour points. Each snaps to the nearest stream channel automatically. Each gets its own colored upstream basin. "Combine" merges all basins into one without double-counting overlapping upstream areas.',
    target: '[data-tour="hydro-pours"]',
    tab: 'hydrology',
  },
  {
    title: 'Polygon basin',
    body: 'After drawing an AOI polygon, enable this to treat every cell that drains out of it as a pour point. "Inside" clips the result to the polygon. "Upstream" shows the full contributing area, which can extend well beyond your polygon.',
    target: '[data-tour="hydro-polygon"]',
    tab: 'hydrology',
  },
  {
    title: 'Export',
    body: 'Download GeoJSON for the stream network (with Strahler order), basin polygons (with area in km²), and snapped pour point locations. All three export at any time once a hydrology run is complete.',
    target: '[data-tour="hydro-export"]',
    tab: 'hydrology',
  },
];

export function HelpTour({
  open,
  onClose,
  workspace,
  onWorkspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: 'imagery' | 'hydrology';
  onWorkspace: (tab: 'imagery' | 'hydrology') => void;
}) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const current = STEPS[step];

  useEffect(() => {
    if (!open) return;
    if (current.tab && current.tab !== workspace) onWorkspace(current.tab);
  }, [open, step, current.tab, workspace, onWorkspace]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = current.target ? document.querySelector(current.target) : null;
      setBox(el ? el.getBoundingClientRect() : null);
    };
    const id = window.setTimeout(place, 60);
    window.addEventListener('resize', place);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', place);
    };
  }, [open, step, current.target, workspace]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && step < STEPS.length - 1) setStep(s => s + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep(s => s - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step, onClose]);

  if (!open) return null;

  const PAD = 14;
  const cardW = 300;
  const cardH = 170; // approximate
  let cardTop: number;
  let cardLeft: number;

  if (box) {
    // prefer below the target, fallback above
    cardTop = box.bottom + 10;
    if (cardTop + cardH > window.innerHeight - PAD) cardTop = box.top - cardH - 10;
    cardTop = Math.max(PAD, Math.min(window.innerHeight - cardH - PAD, cardTop));
    cardLeft = Math.max(PAD, Math.min(window.innerWidth - cardW - PAD, box.left));
  } else {
    cardTop = 72;
    cardLeft = 24;
  }

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Feature guide">
      <div className="tour-dim" onClick={onClose} />
      {box && (
        <div
          className="tour-spot"
          style={{ top: box.top - 5, left: box.left - 5, width: box.width + 10, height: box.height + 10 }}
        />
      )}
      <div className="tour-card" style={{ top: cardTop, left: cardLeft, width: cardW }}>
        <div className="tour-kicker">
          {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
        </div>
        <h2>{current.title}</h2>
        <p>{current.body}</p>
        <div className="tour-actions">
          <button
            className="button"
            disabled={step === 0}
            onClick={() => setStep(s => s - 1)}
            aria-label="Previous tip"
          >
            <ChevronLeft size={13} />
          </button>
          <div className="tour-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <button
                key={i}
                className={`tour-dot${i === step ? ' active' : ''}`}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          {step < STEPS.length - 1 ? (
            <button className="button primary" onClick={() => setStep(s => s + 1)}>
              Next <ChevronRight size={13} />
            </button>
          ) : (
            <button className="button primary" onClick={onClose}>Done</button>
          )}
          <button className="button text" onClick={onClose} aria-label="Close guide" style={{ marginLeft: 'auto' }}>
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
