import type { FavGroup, FavLike } from '@hknt/core';

/** 收藏組嘅內容 key：收藏改咗先重新載入 */
export const groupKey = (g: FavGroup<FavLike>) => g.favs.map((f) => `${f.co}/${f.route}/${f.dir}/${f.stopId ?? ''}`).join('|');
