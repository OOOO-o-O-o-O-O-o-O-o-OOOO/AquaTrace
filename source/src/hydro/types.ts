export type LonLat = [number, number];

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type PourPoint = {
  id: string;
  lng: number;
  lat: number;
  color: string;
};

export type HydroGrid = {
  dem: Float32Array;
  filled: Float32Array;
  fdir: Int8Array;
  accum: Float32Array;
  width: number;
  height: number;
  west: number;
  south: number;
  east: number;
  north: number;
  dLon: number;
  dLat: number;
  cellSizeM: number;
  source: 'copernicus' | 'srtm' | 'mixed';
  resampled: boolean;
  copernicusShare: number;
};

export type StreamLine = {
  coords: LonLat[];
  order: number;
  accum: number;
};

export type CatchmentPoly = {
  id: string;
  color: string;
  areaKm2: number;
  rings: LonLat[][];
  combined?: boolean;
};

export type HydroLayers = {
  network: boolean;
  catchments: boolean;
  accumulation: boolean;
  dem: boolean;
};

export type PolygonClip = 'inside' | 'full';

// Up to 20 pour points — enough for any realistic watershed study
export const MAX_POUR_POINTS = 20;

export const CATCHMENT_COLORS = [
  '#1d7a74', '#c47a2c', '#3d6ea5', '#8b4e8b',
  '#4d8a3e', '#b5534a', '#2c6f99', '#9a6b2f',
  '#5c7a3e', '#7a4e6b', '#3a6e8b', '#8b6e2c',
  '#2c7a5c', '#6b3a4e', '#4e6b8b', '#7a6e3a',
  '#3e5c7a', '#8b4a3e', '#4e8b6e', '#6b5c2c',
];

export const D8 = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;
