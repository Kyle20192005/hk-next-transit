import type { Company } from '@hknt/core';
import { COMPANIES } from '@/lib/company';
import BusIcon from './BusIcon';

/** 公司標籤：巴士圖示 + 公司名，用公司代表色 */
export default function CompanyTag({ company }: { company: Company }) {
  const c = COMPANIES[company];
  return (
    <span className="co" style={{ background: c.bg, color: c.ink }}>
      <BusIcon size={11} />
      {c.name}
    </span>
  );
}
