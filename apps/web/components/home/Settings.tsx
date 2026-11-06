import { APP_VERSION } from '@hknt/core';

/** 設定：版本、數據更新時間、資料來源；未做嘅設定標「即將推出」 */
export default function Settings({ updated }: { updated: string | null }) {
  return (
    <>
      <header className="app-bar">
        <div className="app-title">
          <h1>設定</h1>
        </div>
      </header>
      <div className="settings">
        <section className="card settings-group">
          <h2>偏好</h2>
          <div className="settings-row">
            <span>深色模式</span>
            <span className="muted">跟系統</span>
          </div>
          <div className="settings-row">
            <span>語言</span>
            <span className="muted">繁體中文</span>
          </div>
          <div className="settings-row">
            <span>帳戶同收藏同步</span>
            <span className="soon-badge">即將推出</span>
          </div>
        </section>
        <section className="card settings-group">
          <h2>關於</h2>
          <div className="settings-row">
            <span>版本</span>
            <span className="muted tabular">{APP_VERSION}</span>
          </div>
          {updated && (
            <div className="settings-row">
              <span>路線數據更新</span>
              <span className="muted">{updated}</span>
            </div>
          )}
          <p className="settings-note muted">
            資料來源：運輸署、城巴、九巴、新大嶼山巴士、港鐵（DATA.GOV.HK）；地圖 © OpenStreetMap 貢獻者、OpenFreeMap；
            站與站之間行車時間參考 hk-bus-time-between-stops。巴士位置係推算，僅供參考。
          </p>
        </section>
      </div>
    </>
  );
}
