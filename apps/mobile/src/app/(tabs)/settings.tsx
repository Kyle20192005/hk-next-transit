import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { APP_VERSION, DEFAULT_TOOLS, NEARBY_RADII, radiusLabel, type Prefs } from '@hknt/core';
import { AppBar, SoonBadge } from '@/components/ui';
import { clearFavorites, useFavorites } from '@/lib/favorites';
import { saveTools } from '@/lib/news';
import { setPref, usePrefs } from '@/lib/prefs';
import { clearRecent, useRecent } from '@/lib/recent';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';

/**
 * 設定（每項都真係有作用；同網頁 components/home/Settings.tsx 一樣）：外觀、交通、首頁、資料、關於。
 * 設定存 AsyncStorage `hknt.prefs`（core `Prefs`）。
 */
export default function SettingsTab() {
  const t = useTheme();
  const p = usePrefs();
  const favs = useFavorites();
  const recent = useRecent();
  const [done, setDone] = useState<string | null>(null);
  const flash = (msg: string) => {
    setDone(msg);
    setTimeout(() => setDone((d) => (d === msg ? null : d)), 2000);
  };

  return (
    <View style={{ flex: 1 }}>
      <AppBar>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>設定</Text>
      </AppBar>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 32 }}>
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
            last
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
            hint={p.etaFormat === 'clock' ? '例如「18:32」，旁邊細字先寫幾多分鐘。' : '例如「5 分」，旁邊細字先寫鐘數。'}
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
          <Row label="自動定位" hint="開首頁同路線頁時自動搵你附近嘅站。關咗就要自己撳「定位」。" last>
            <Switch value={p.autoLocate} onValueChange={(v) => setPref('autoLocate', v)} trackColor={{ true: '#1E9E5A', false: t.line }} />
          </Row>
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
          <Row label="重設常用工具" hint="變返巴士、附近車站、收藏、交通消息" last>
            <SmallButton label="重設" onPress={() => (saveTools(DEFAULT_TOOLS), flash('常用工具已經重設'))} />
          </Row>
        </Group>

        <Group title="資料">
          <Row label="清除最近睇過" hint={recent.length ? `${recent.length} 條路線` : '冇記錄'}>
            <SmallButton label="清除" disabled={!recent.length} onPress={() => (clearRecent(), flash('已經清除最近睇過'))} />
          </Row>
          <Row label="清除所有收藏" hint={favs.length ? `${favs.length} 個收藏（只存喺呢部機）` : '冇收藏'}>
            <SmallButton
              label="清除"
              danger
              disabled={!favs.length}
              onPress={() =>
                Alert.alert('清除所有收藏？', `${favs.length} 個收藏會清除，冇得復原。`, [
                  { text: '取消', style: 'cancel' },
                  { text: '清除', style: 'destructive', onPress: () => (clearFavorites(), flash('已經清除所有收藏')) },
                ])
              }
            />
          </Row>
          <Row label="帳戶同收藏同步" last>
            <SoonBadge label="即將推出" />
          </Row>
        </Group>

        <Group title="關於">
          <Row label="版本" last>
            <Text style={{ fontSize: 15, color: t.muted, ...tabular }}>{APP_VERSION}</Text>
          </Row>
          <Text style={{ marginTop: 8, marginBottom: 4, fontSize: 13, lineHeight: 20, color: t.muted }}>
            資料來源：運輸署、城巴、九巴、新大嶼山巴士、港鐵（DATA.GOV.HK）；站與站之間行車時間參考 hk-bus-time-between-stops。巴士位置係推算，僅供參考。
          </Text>
        </Group>
      </ScrollView>
      {done && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 16, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: t.text }}>
          <Text style={{ color: t.bg, fontSize: 14, fontWeight: '700' }}>{done}</Text>
        </View>
      )}
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, ...shadow }}>
      <Text style={{ marginTop: 8, marginBottom: 2, fontSize: 13, fontWeight: '700', color: t.muted }}>{title}</Text>
      {children}
    </View>
  );
}

function Label({ label, hint }: { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 16, color: t.text }}>{label}</Text>
      {hint && <Text style={{ fontSize: 13, lineHeight: 19, color: t.muted }}>{hint}</Text>}
    </View>
  );
}

function Row({ label, hint, last, children }: { label: string; hint?: string; last?: boolean; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }}>
      <Label label={label} hint={hint} />
      {children}
    </View>
  );
}

/** 一行設定 + 分段掣（揀一個），掣放喺標題下面成行闊 */
function Choice<T extends string>({ label, hint, value, options, onChange, last }: { label: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void; last?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }}>
      <Label label={label} hint={hint} />
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 3, gap: 2, borderRadius: 12, backgroundColor: t.surface2 }}>
        {options.map(([v, text]) => {
          const on = value === v;
          return (
            <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, backgroundColor: on ? t.card : 'transparent', ...(on ? shadow : {}) }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: on ? t.text : t.muted }}>{text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SmallButton({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.card, opacity: disabled ? 0.45 : 1 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: danger ? '#D7282F' : t.text }}>{label}</Text>
    </Pressable>
  );
}
