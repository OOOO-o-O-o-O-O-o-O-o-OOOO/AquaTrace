import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, X } from 'lucide-react';
import type { Scene } from '../data/scenes';

export function Viewer({scene,collection,onClose,onChange}:{scene:Scene;collection:Scene[];onClose:()=>void;onChange:(scene:Scene)=>void}) {
  const [zoom,setZoom]=useState(1);
  const [offset,setOffset]=useState({x:0,y:0});
  const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
  const index=collection.findIndex(s=>s.id===scene.id);
  useEffect(()=>{setZoom(1);setOffset({x:0,y:0})},[scene.id]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='ArrowRight'&&index<collection.length-1)onChange(collection[index+1]);if(e.key==='ArrowLeft'&&index>0)onChange(collection[index-1]);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[collection,index,onChange,onClose]);
  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className="viewer" role="dialog" aria-modal="true" aria-label="Scene viewer" onClick={e=>e.stopPropagation()}>
      <header className="viewer-top"><span className="viewer-title">{scene.id}</span><span className="result-sub">· {index+1} / {collection.length}</span>
        <button className="button" aria-label="Close viewer" onClick={onClose}><X size={15}/></button></header>
      <div className="viewer-image-wrap" onPointerDown={e=>{if((e.target as HTMLElement).closest('.viewer-controls'))return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y}}} onPointerMove={e=>{if(drag.current)setOffset({x:drag.current.ox+e.clientX-drag.current.x,y:drag.current.oy+e.clientY-drag.current.y})}} onPointerUp={()=>{drag.current=null}}>
        <img className="viewer-image" src={scene.assetPath} alt={`${scene.location}, ${scene.date}, ${scene.kind}`} style={{transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`}} />
        <div className="viewer-controls">
          <button className="button" onClick={()=>setZoom(z=>Math.max(.5,z-.25))} aria-label="Zoom out"><Minus size={13}/></button>
          <button className="button mono" onClick={()=>{setZoom(1);setOffset({x:0,y:0})}} title="Fit to view"><Maximize2 size={12}/>&nbsp;{Math.round(zoom*100)}%</button>
          <button className="button" onClick={()=>setZoom(z=>Math.min(4,z+.25))} aria-label="Zoom in"><Plus size={13}/></button>
          <button className="button" disabled={index<=0} onClick={()=>onChange(collection[index-1])} aria-label="Previous scene"><ChevronLeft size={14}/></button>
          <button className="button" disabled={index>=collection.length-1} onClick={()=>onChange(collection[index+1])} aria-label="Next scene"><ChevronRight size={14}/></button>
        </div>
      </div>
      <footer className="viewer-meta">{[['Acquired',scene.date],['Sensor',scene.sensor],['Location',scene.location],['Resolution',scene.resolution],['Cloud cover',scene.cloudCover!==undefined?`${scene.cloudCover}%`:'—'],['Valid pixels',scene.validPixelPercent!==undefined?`${scene.validPixelPercent}%`:'—'],['Quality',scene.quality!==undefined?`${scene.quality}/100`:'—']].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</footer>
    </section>
  </div>;
}
