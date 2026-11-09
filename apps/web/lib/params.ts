import type { NextRequest } from 'next/server';
import { isCo, type Co } from '@hknt/core';

/** 路線、站 ID 格式（core 共用，同 tracker 一樣；專線小巴路線 = 「地區-號碼」例如 NT-2、站 = 8 位數字） */
export { SAFE_ROUTE, SAFE_STOP } from '@hknt/core';

/** ?co=ctb|kmb|nlb|mtrb|gmb（core CO_LIST；舊 App 用 company=ctb） */
export function coParam(req: NextRequest): Co | null {
  const q = req.nextUrl.searchParams;
  const co = (q.get('co') ?? q.get('company') ?? 'ctb').toLowerCase();
  return isCo(co) ? co : null;
}
