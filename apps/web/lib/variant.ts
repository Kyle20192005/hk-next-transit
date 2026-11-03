import type { Dir, RouteData, Variant } from '@hknt/core';

/** 走法簡稱：「置富花園 - 北角碼頭(不經華富)」→「不經華富」 */
export function shortName(v: Variant): string {
  const m = v.name.match(/[（(]([^）)]+)[）)]\s*$/);
  return m?.[1] ?? v.name;
}

export function variantsForDir(route: RouteData, dir: Dir): Variant[] {
  return route.variants.filter((v) => v.stopDirs.includes(dir));
}
