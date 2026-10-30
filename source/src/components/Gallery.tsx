import { Download, Eye } from 'lucide-react';
import type { Scene } from '../data/scenes';

export function Gallery({scenes, selected, onSelect, onOpen, onDownload, full, onToggleFull, mode}: {
  scenes: Scene[]; selected: string; onSelect:(scene:Scene)=>void; onOpen:(scene:Scene)=>void;
  onDownload:(scene:Scene)=>void; full:boolean; onToggleFull:()=>void; mode:string;
}) {
  const shown=full?scenes:scenes.slice(0,4);
  return <div className="gallery">
    <div className="gallery-head"><div><div className="gallery-title">{mode==='raw'?'Raw scenes':'MNDWI renders'} <span className="result-sub">· illustrative sample imagery</span></div></div>
      {scenes.length>4&&<button className="button" onClick={onToggleFull}>{full?'Show fewer':'Full gallery'}</button>}
    </div>
    {scenes.length===0?<div className="empty-state">No scenes match these filters. Adjust the search conditions and apply again.</div>:
      <div className="gallery-grid">{shown.map(scene=><article key={scene.id} className={`scene-card ${selected===scene.id?'selected':''}`} onClick={()=>onSelect(scene)} onDoubleClick={()=>onOpen(scene)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onOpen(scene)}} data-testid={`card-scene-${scene.id}`}>
        <img className="scene-thumb" src={scene.assetPath} alt={`${scene.location} ${scene.kind} sample imagery`} />
        <div className="scene-info"><div className="scene-date">{scene.date}</div><div className="scene-detail"><span>{scene.sensor}</span><span>{scene.cloudCover!==undefined?`${scene.cloudCover}% cloud`: `${scene.validPixelPercent}% valid`}</span></div>
          <div className="scene-actions"><button className="button" onClick={e=>{e.stopPropagation();onOpen(scene)}}><Eye size={12}/> View</button><button className="button" onClick={e=>{e.stopPropagation();onDownload(scene)}}><Download size={12}/> Save</button></div>
        </div>
      </article>)}</div>}
  </div>;
}
