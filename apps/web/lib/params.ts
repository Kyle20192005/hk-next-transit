import type { NextRequest } from 'next/server';
import { isCo, type Co } from './data';

/** 站 ID：城巴 6 位數字，九巴 16 位十六進制 */
/** 站 ID：城巴 6 位數字、九巴 16 位十六進制、新大嶼山巴士數字、港鐵巴士（例如 K76-U010） */
export const SAFE_STOP = /^(\d{1,6}|[0-9A-F]{16}|[A-Z0-9]{1,6}(-[A-Z0-9]{1,3})?-[UD]\d{3}[A-Z]?)$/;
export const SAFE_ROUTE = /^[A-Za-z0-9]{1,6}$/;

/** ?co=ctb|kmb（舊 App 用 company=ctb） */
export function coParam(req: NextRequest): Co | null {
  const q = req.nextUrl.searchParams;
  const co = (q.get('co') ?? q.get('company') ?? 'ctb').toLowerCase();
  return isCo(co) ? co : null;
}
