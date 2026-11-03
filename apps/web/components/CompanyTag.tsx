import type { Company } from '@hknt/core';
import { COMPANIES } from '@/lib/company';
import BusIcon from './BusIcon';

/**
 * 公司標籤：巴士圖示 + 公司名，用公司代表色。
 * 聯營線傳多間公司：合併做一個分色標籤（例如左黃「城巴」右紅「九巴」），唔使疊兩行。
 * compact：到站時間列用，唔要巴士圖示。
 */
export default function CompanyTag({ company, companies, compact = false }: { company?: Company; companies?: Company[]; compact?: boolean }) {
  const list = companies ?? (company ? [company] : []);
  return (
    <span className={`co${compact ? ' co-compact' : ''}`}>
      {list.map((c, i) => {
        const info = COMPANIES[c];
        return (
          <span key={c} className="co-part" style={{ background: info.bg, color: info.ink }}>
            {i === 0 && !compact && <BusIcon size={11} />}
            {info.name}
          </span>
        );
      })}
    </span>
  );
}
