/**
 * 港鐵 ↔ 輕鐵轉乘站（都係屯馬綫；要出港鐵閘，輕鐵冇閘）。兩幅路綫圖由站拉一條出閘虛綫，駁一個圓形站再伸出一小段
 * 對方嘅色綫（mtr-map.ts mtrXferLink、lrt-map.ts xl）；站面板有「轉乘」掣撳去另一幅圖嘅同一個站。
 * 洪水橋港鐵站未通車（預計 2030 年），通車先加（兩個排版工具都要揀方向再 --write）。
 */
export const MTR_LRT_XFER: Readonly<Record<string, string>> = { TUM: '295', SIH: '100', TIS: '430', YUL: '600' };

/** 港鐵站可以轉乘嘅輕鐵站 ID（冇就 null） */
export const lrtXferOf = (mtrSta: string): string | null => MTR_LRT_XFER[mtrSta] ?? null;
/** 輕鐵站可以轉乘嘅港鐵站代號（冇就 null） */
export const mtrXferOf = (lrtSta: string): string | null => Object.keys(MTR_LRT_XFER).find((k) => MTR_LRT_XFER[k] === lrtSta) ?? null;

/** 輕鐵代表色（金色）：港鐵圖轉乘色綫、面板「轉乘 [輕鐵]」（深色字） */
export const LRT_BRAND = { zh: '輕鐵', color: '#D3A809', ink: '#1d1d1f' } as const;
