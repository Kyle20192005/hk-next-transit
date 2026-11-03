// 唔喺 build 時預先生成：build 時讀唔到數據會將「0 條路線」固定落頁面。
// 數據 fetch 本身已經有 cache（lib/data.ts），所以唔會每次都 call GitHub。
export const dynamic = 'force-dynamic';

import { getCtbIndex } from '@/lib/data';
import Home from '@/components/home/Home';

export default async function Page() {
  const index = await getCtbIndex();
  const updated = index.generatedAt
    ? new Date(index.generatedAt).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', dateStyle: 'medium', timeStyle: 'short' })
    : null;
  return <Home routes={index.routes} updated={updated} />;
}
