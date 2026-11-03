// 唔喺 build 時預先生成：build 時讀唔到數據會將「0 條路線」固定落頁面。
// 數據 fetch 本身已經 cache 一個鐘（lib/data.ts），所以唔會每次都 call GitHub。
export const dynamic = 'force-dynamic';

import { getCtbIndex } from '@/lib/data';
import RouteSearch from '@/components/RouteSearch';

export default async function Home() {
  const index = await getCtbIndex();
  return (
    <main>
      <h1>城巴路線</h1>
      <p className="muted">
        共 {index.routes.length} 條路線
        {index.generatedAt
          ? `・數據更新：${new Date(index.generatedAt).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', dateStyle: 'medium', timeStyle: 'short' })}`
          : '・未讀到數據'}
      </p>
      <RouteSearch routes={index.routes} />
    </main>
  );
}
