import ComingSoon from './ComingSoon';

/** 導航（點到點路線規劃）：未做 */
export default function Navigation() {
  return (
    <>
      <header className="app-bar">
        <div className="app-title">
          <h1>導航</h1>
        </div>
      </header>
      <ComingSoon icon="navigate" title="點到點導航" text="輸入起點同目的地，揀最快嘅巴士、港鐵、小巴組合，連轉車等候時間。" />
    </>
  );
}
