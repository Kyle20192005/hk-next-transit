import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { APP_VERSION } from '@hknt/core';
import { AppBar, SoonBadge } from '@/components/ui';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';

/** 設定：版本、資料來源；未做嘅設定標「即將推出」（同網頁 components/home/Settings.tsx 一樣） */
export default function SettingsTab() {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <AppBar>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>設定</Text>
      </AppBar>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Group title="偏好">
          <Row label="深色模式" value="跟系統" />
          <Row label="語言" value="繁體中文" />
          <Row label="帳戶同收藏同步" last>
            <SoonBadge label="即將推出" />
          </Row>
        </Group>
        <Group title="關於">
          <Row label="版本" value={APP_VERSION} last />
          <Text style={{ marginTop: 8, marginBottom: 4, fontSize: 13, lineHeight: 20, color: t.muted }}>
            資料來源：運輸署、城巴、九巴、新大嶼山巴士、港鐵（DATA.GOV.HK）；站與站之間行車時間參考 hk-bus-time-between-stops。巴士位置係推算，僅供參考。
          </Text>
        </Group>
      </ScrollView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, ...shadow }}>
      <Text style={{ marginTop: 8, marginBottom: 4, fontSize: 13, fontWeight: '700', color: t.muted }}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, last, children }: { label: string; value?: string; last?: boolean; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }}>
      <Text style={{ fontSize: 16, color: t.text }}>{label}</Text>
      {value !== undefined && <Text style={{ fontSize: 15, color: t.muted, ...tabular }}>{value}</Text>}
      {children}
    </View>
  );
}
