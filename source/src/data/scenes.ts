export type SceneMode = 'raw' | 'mndwi';
export type Scene = {
  id: string;
  mode: SceneMode;
  date: string;
  sensor: 'Sentinel-2' | 'Landsat 8' | 'Landsat 9';
  cloudCover?: number;
  validPixelPercent?: number;
  quality?: number;
  location: string;
  resolution: string;
  assetPath: string;
  kind: string;
  center: [number, number];
};

const scenes: Scene[] = [
  { id:'s2-lake-20240718', mode:'raw', date:'2024-07-18', sensor:'Sentinel-2', cloudCover:3.8, validPixelPercent:96.2, quality:93, location:'Lake Tahoe, California', resolution:'10 m', assetPath:'/samples/raw-tahoe.svg', kind:'True color', center:[-120.03,39.08] },
  { id:'s2-delta-20240629', mode:'raw', date:'2024-06-29', sensor:'Sentinel-2', cloudCover:12.4, validPixelPercent:87.6, quality:84, location:'Sacramento–San Joaquin Delta', resolution:'10 m', assetPath:'/samples/raw-delta.svg', kind:'True color', center:[-121.55,38.08] },
  { id:'l9-bay-20240521', mode:'raw', date:'2024-05-21', sensor:'Landsat 9', cloudCover:6.1, validPixelPercent:93.9, quality:89, location:'San Francisco Bay', resolution:'30 m', assetPath:'/samples/raw-bay.svg', kind:'Natural color', center:[-122.32,37.72] },
  { id:'s2-greatsalt-20240310', mode:'raw', date:'2024-03-10', sensor:'Sentinel-2', cloudCover:0.7, validPixelPercent:99.1, quality:98, location:'Great Salt Lake, Utah', resolution:'10 m', assetPath:'/samples/raw-salt.svg', kind:'True color', center:[-112.55,41.15] },
  { id:'l8-everglades-20240212', mode:'raw', date:'2024-02-12', sensor:'Landsat 8', cloudCover:18.6, validPixelPercent:80.3, quality:77, location:'Everglades, Florida', resolution:'30 m', assetPath:'/samples/raw-everglades.svg', kind:'Natural color', center:[-80.75,25.45] },
  { id:'s2-lake-20240718-mndwi', mode:'mndwi', date:'2024-07-18', sensor:'Sentinel-2', validPixelPercent:96.2, quality:93, location:'Lake Tahoe, California', resolution:'10 m', assetPath:'/samples/mndwi-tahoe.svg', kind:'MNDWI render', center:[-120.03,39.08] },
  { id:'s2-delta-20240629-mndwi', mode:'mndwi', date:'2024-06-29', sensor:'Sentinel-2', validPixelPercent:87.6, quality:84, location:'Sacramento–San Joaquin Delta', resolution:'10 m', assetPath:'/samples/mndwi-delta.svg', kind:'MNDWI render', center:[-121.55,38.08] },
  { id:'l9-bay-20240521-mndwi', mode:'mndwi', date:'2024-05-21', sensor:'Landsat 9', validPixelPercent:93.9, quality:89, location:'San Francisco Bay', resolution:'30 m', assetPath:'/samples/mndwi-bay.svg', kind:'MNDWI render', center:[-122.32,37.72] },
  { id:'s2-salt-20240310-mndwi', mode:'mndwi', date:'2024-03-10', sensor:'Sentinel-2', validPixelPercent:99.1, quality:98, location:'Great Salt Lake, Utah', resolution:'10 m', assetPath:'/samples/mndwi-salt.svg', kind:'MNDWI render', center:[-112.55,41.15] },
  { id:'l8-everglades-20240212-mndwi', mode:'mndwi', date:'2024-02-12', sensor:'Landsat 8', validPixelPercent:80.3, quality:77, location:'Everglades, Florida', resolution:'30 m', assetPath:'/samples/mndwi-everglades.svg', kind:'MNDWI render', center:[-80.75,25.45] },
];

export interface SceneProvider {
  list(mode: SceneMode): Promise<Scene[]>;
  assetUrl(scene: Scene): string;
}

export const sampleProvider: SceneProvider = {
  async list(mode) { return scenes.filter(scene => scene.mode === mode); },
  assetUrl(scene) { return scene.assetPath; },
};
