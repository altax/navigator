export interface TileBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function tileUrls(
  bounds: TileBounds,
  zMin: number,
  zMax: number,
): string[] {
  const { west, south, east, north } = bounds;
  const urls: string[] = [];
  for (let z = zMin; z <= zMax; z++) {
    const n = 1 << z;
    const x1 = Math.max(0, Math.floor(((west + 180) / 360) * n));
    const x2 = Math.min(n - 1, Math.floor(((east + 180) / 360) * n));
    const toY = (lat: number) => {
      const lr = (lat * Math.PI) / 180;
      return Math.floor(
        ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n,
      );
    };
    const y1 = Math.max(0, toY(north));
    const y2 = Math.min(n - 1, toY(south));
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        urls.push(`/api/tiles/spb-lo/${z}/${x}/${y}`);
      }
    }
  }
  return urls;
}
