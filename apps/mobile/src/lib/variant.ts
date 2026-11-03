import type { Dir, RouteData, Variant } from '@hknt/core';

// 同 apps/web/lib/variant.ts 一樣；之後可以搬入 @hknt/core 共用
export function shortName(v: Pick<Variant, 'name'>): string {
  const m = v.name.match(/[（(]([^）)]+)[）)]\s*$/);
  return m?.[1] ?? v.name;
}

export function variantsForDir(route: RouteData, dir: Dir): Variant[] {
  return route.variants.filter((v) => v.stopDirs.includes(dir));
}

export function passesThrough(v: Variant, dir: Dir, list: string[], i: number): boolean {
  const idx = v.stops
    .map((s, k) => (s && v.stopDirs[k] === dir ? list.indexOf(s) : -1))
    .filter((x) => x >= 0);
  return idx.length > 0 && Math.min(...idx) < i && i < Math.max(...idx);
}
