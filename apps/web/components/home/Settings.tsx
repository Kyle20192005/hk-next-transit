'use client';
import { useState, type ReactNode } from 'react';
import { APP_VERSION, DEFAULT_TOOLS, NEARBY_RADII, radiusLabel, type Prefs } from '@hknt/core';
import { clearFavorites, useFavorites } from '@/lib/favorites';
import { saveTools } from '@/lib/news';
import { setPref, usePrefs } from '@/lib/prefs';
import { clearRecent, useRecent } from '@/lib/recent';
import { useInstall } from '@/lib/pwa';
import Icon from '@/components/Icon';

/**
 * 設定（每項都真係有作用）：外觀、交通、首頁、資料、關於。設定存 localStorage `hknt.prefs`（core `Prefs`），
 * App 版 apps/mobile/src/app/(tabs)/settings.tsx。
 */
export default function Settings({ updated }: { updated: string | null }) {
  const p = usePrefs();
  const favs = useFavorites();
  const recent = useRecent();
  const [done, setDone] = useState<string | null>(null);
  const flash = (msg: string) => {
    setDone(msg);
    setTimeout(() => setDone((d) => (d === msg ? null : d)), 2000);
  };

  return (
    <>
      <header className="app-bar">
        <div className="app-title">
          <h1>設定</h1>
        </div>
      </header>
      <div className="settings">
        <Group title="外觀">
          <Choice
            label="深色模式"
            value={p.theme}
            onChange={(v) => setPref('theme', v)}
            options={[
              ['system', '跟系統'],
              ['light', '淺色'],
              ['dark', '深色'],
            ]}
          />
        </Group>

        <Group title="交通">
          <Choice
            label="交通工具優先"
            hint={p.priority === 'rail' ? '「路線」分頁預設開港鐵，分類排第一；首頁大字同下班車先顯示港鐵站。' : '「路線」分頁預設開巴士，分類排第一；首頁大字同下班車先顯示巴士站，港鐵站排後面。'}
            value={p.priority}
            onChange={(v) => setPref('priority', v)}
            options={[
              ['bus', '巴士'],
              ['rail', '港鐵'],
            ]}
          />
          <Choice
            label="到站時間顯示"
            hint={p.etaFormat === 'clock' ? '例如「18:32」，下面細字先寫幾多分鐘。' : '例如「5 分」，下面細字先寫鐘數。'}
            value={p.etaFormat}
            onChange={(v) => setPref('etaFormat', v)}
            options={[
              ['minutes', '剩幾多分鐘'],
              ['clock', '到站鐘數'],
            ]}
          />
          <Choice
            label="輕鐵到站顯示"
            hint={p.lrtGroup === 'route' ? '輕鐵站面板每條路線、每個方向一組，寫埋幾號月台。' : '輕鐵站面板按月台分組，同車站顯示屏一樣。'}
            value={p.lrtGroup}
            onChange={(v) => setPref('lrtGroup', v)}
            options={[
              ['platform', '按月台'],
              ['route', '按路線'],
            ]}
          />
          <Choice
            label="附近車站範圍"
            hint="首頁下班車同附近車站搵幾遠嘅站；範圍大啲站多啲，但載入慢啲。"
            value={String(p.nearbyRadius)}
            onChange={(v) => setPref('nearbyRadius', Number(v) as Prefs['nearbyRadius'])}
            options={NEARBY_RADII.map((r) => [String(r), radiusLabel(r)] as [string, string])}
          />
          <Toggle label="自動定位" hint="開首頁同路線頁時自動搵你附近嘅站。關咗就要自己撳「定位」。" checked={p.autoLocate} onChange={(v) => setPref('autoLocate', v)} />
        </Group>

        <Group title="首頁">
          <Choice
            label="大卡打開時顯示"
            value={p.homeCard}
            onChange={(v) => setPref('homeCard', v)}
            options={[
              ['last', '上次睇開'],
              ['next', '下班車'],
              ['favs', '收藏'],
            ]}
          />
          <Action label="重設常用工具" hint="變返巴士、附近車站、收藏、交通消息" button="重設" onClick={() => (saveTools(DEFAULT_TOOLS), flash('常用工具已經重設'))} />
        </Group>

        <Group title="資料">
          <Action label="清除最近睇過" hint={recent.length ? `${recent.length} 條路線` : '冇記錄'} button="清除" disabled={!recent.length} onClick={() => (clearRecent(), flash('已經清除最近睇過'))} />
          <Action
            label="清除所有收藏"
            hint={favs.length ? `${favs.length} 個收藏（只存喺呢部機）` : '冇收藏'}
            button="清除"
            danger
            disabled={!favs.length}
            onClick={() => {
              if (window.confirm(`清除全部 ${favs.length} 個收藏？清除咗冇得復原。`)) {
                clearFavorites();
                flash('已經清除所有收藏');
              }
            }}
          />
          <div className="settings-row">
            <span>帳戶同收藏同步</span>
            <span className="soon-badge">即將推出</span>
          </div>
        </Group>

        <InstallGroup onDone={flash} />

        <Group title="關於">
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
        </Group>
        {done && (
          <div className="settings-toast" role="status">
            {done}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * 加至主畫面（PWA，lib/pwa.ts）：Chrome／Edge／Android 一撳安裝；iPhone／iPad 教用 Safari 分享選單；
 * 已經喺主畫面開緊就話已安裝；其他瀏覽器唔支援就成組收埋（唔好擺個用唔到嘅掣）。
 */
function InstallGroup({ onDone }: { onDone: (msg: string) => void }) {
  const { state, install } = useInstall();
  if (state === 'unsupported') return null;
  return (
    <Group title="App">
      {state === 'prompt' ? (
        <Action label="安裝到主畫面" hint="好似 App 咁由主畫面全螢幕開，冇網絡都開到（到站時間要上網）。" button="安裝" onClick={() => void install().then((ok) => ok && onDone('已經安裝到主畫面'))} />
      ) : state === 'ios' ? (
        <div className="settings-row">
          <div className="settings-text">
            <span>加至主畫面</span>
            <small className="muted install-steps">
              用 Safari 撳底部
              <Icon name="share" size={15} />
              「分享」，再揀「加至主畫面」，之後由主畫面圖示全螢幕開。
            </small>
          </div>
        </div>
      ) : (
        <div className="settings-row">
          <div className="settings-text">
            <span>主畫面 App</span>
            <small className="muted">已經由主畫面打開緊。</small>
          </div>
          <Icon name="check" size={20} />
        </div>
      )}
    </Group>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card settings-group">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** 一行設定 + 分段掣（揀一個） */
function Choice<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="settings-row settings-choice">
      <div className="settings-text">
        <span>{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </div>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} role="radio" aria-checked={value === v} className="seg-btn" onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="settings-row">
      <div className="settings-text">
        <span>{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </div>
      <button role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
        <span />
      </button>
    </label>
  );
}

function Action({ label, hint, button, onClick, disabled, danger }: { label: string; hint?: string; button: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <div className="settings-row">
      <div className="settings-text">
        <span>{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </div>
      <button className={`settings-btn${danger ? ' danger' : ''}`} onClick={onClick} disabled={disabled}>
        {button}
      </button>
    </div>
  );
}
