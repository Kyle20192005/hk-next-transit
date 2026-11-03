import type { NextRequest } from 'next/server';
import { isCo, type Co } from './data';

/** 站 ID：城巴 6 位數字，九巴 16 位十六進制 */
export const SAFE_STOP = /^(\d{6}|[0-9A-F]{16})$/;
export const SAFE_ROUTE = /^[A-Za-z0-9]{1,6}$/;

/** ?co=ctb|kmb（舊 App 用 company=ctb） */
export function coParam(req: NextRequest): Co | null {
  const q = req.nextUrl.searchParams;
  const co = (q.get('co') ?? q.get('company') ?? 'ctb').toLowerCase();
  return isCo(co) ? co : null;
}
