/**
 * 收藏分組（例如「返工」「返屋企」）：網頁同 App 共用。
 * 每組可以設一個時段；而家喺邊組嘅時段，首頁大卡「收藏」就將嗰組排最前，收藏頁預設揀嗰組。
 * 收藏本身多一個 `group`（組 ID）；分組定義另外存（localStorage／AsyncStorage `hknt.favGroups.v1`）。
 */

export interface FavGroupDef {
  id: string;
  name: string;
  /** 時段：由午夜起計分鐘；to < from 即係跨午夜（例如 22:00–02:00）。冇 = 唔設時段 */
  from?: number;
  to?: number;
}

export const FAV_GROUPS_KEY = 'hknt.favGroups.v1';
export const MAX_FAV_GROUPS = 8;

/** 揀時段用嘅預設（網頁同 App 一樣，唔使自己打時間） */
export const FAV_GROUP_WINDOWS: { label: string; from?: number; to?: number }[] = [
  { label: '唔設時段' },
  { label: '朝早 06:00–11:00', from: 360, to: 660 },
  { label: '中午 11:00–14:00', from: 660, to: 840 },
  { label: '下晝 14:00–17:00', from: 840, to: 1020 },
  { label: '夜晚 17:00–22:00', from: 1020, to: 1320 },
  { label: '深夜 22:00–02:00', from: 1320, to: 120 },
];

/** 新增分組時建議嘅名（未用過嘅先） */
export const FAV_GROUP_PRESETS: { name: string; from?: number; to?: number }[] = [
  { name: '返工', from: 360, to: 660 },
  { name: '返屋企', from: 1020, to: 1320 },
  { name: '返學', from: 360, to: 660 },
  { name: '週末' },
];

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const favGroupWindowLabel = (g: Pick<FavGroupDef, 'from' | 'to'>) => (g.from === undefined || g.to === undefined ? '' : `${hhmm(g.from)}–${hhmm(g.to)}`);

/** 讀返嚟嘅分組：剔走格式唔啱嘅 */
export function cleanFavGroups(raw: unknown): FavGroupDef[] {
  if (!Array.isArray(raw)) return [];
  const out: FavGroupDef[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const { id, name, from, to } = g as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) continue;
    const ok = (x: unknown): x is number => typeof x === 'number' && x >= 0 && x < 1440;
    out.push({ id, name: name.trim().slice(0, 12), ...(ok(from) && ok(to) ? { from, to } : {}) });
  }
  return out.slice(0, MAX_FAV_GROUPS);
}

/** 香港時間由午夜起計分鐘 */
const hkMinutes = (now: number) => {
  const d = new Date(now + 8 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** 而家喺邊組嘅時段（第一個吻合嘅）；冇就 null */
export function activeFavGroup(groups: FavGroupDef[], now: number): FavGroupDef | null {
  const m = hkMinutes(now);
  for (const g of groups) {
    if (g.from === undefined || g.to === undefined) continue;
    const inside = g.from <= g.to ? m >= g.from && m < g.to : m >= g.from || m < g.to;
    if (inside) return g;
  }
  return null;
}

/** 揀一組：'all' = 全部；'none' = 未分組；其他 = 組 ID（搵唔到嘅組當未分組） */
export function favsInGroup<F extends { group?: string }>(favs: F[], groupId: string, groups: FavGroupDef[]): F[] {
  if (groupId === 'all') return favs;
  const known = new Set(groups.map((g) => g.id));
  if (groupId === 'none') return favs.filter((f) => !f.group || !known.has(f.group));
  return favs.filter((f) => f.group === groupId);
}

/** 首頁大卡用：而家時段嘅組排最前，其餘照原本次序 */
export function favsForNow<F extends { group?: string }>(favs: F[], groups: FavGroupDef[], now: number): { favs: F[]; active: FavGroupDef | null } {
  const active = activeFavGroup(groups, now);
  if (!active) return { favs, active: null };
  return { favs: [...favs.filter((f) => f.group === active.id), ...favs.filter((f) => f.group !== active.id)], active };
}

/** 新分組 ID */
export const newFavGroupId = () => `g${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
