export const revalidate = 3600;

import { getCtbIndex } from '@/lib/data';
import RouteSearch from '@/components/RouteSearch';

export default async function Home() {
  const index = await getCtbIndex();
  return (
    <main>
      <h1>城巴路線</h1>
      <p className="muted">共 {index.routes.length} 條路線</p>
      <RouteSearch routes={index.routes} />
    </main>
  );
}
