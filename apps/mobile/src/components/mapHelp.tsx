import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { COMPANIES, type Company } from '@hknt/core';
import { radius, shadow, shadowLg, useTheme } from '@/lib/theme';
import { Icon } from './Icon';

/** 地圖「?」：巴士位置點樣嚟（同網頁版 RouteMap 嘅 MapHelpText 一樣，按公司講） */
function helpText(company: string, multiCompany: boolean): { title: string; intro: string; bullets: string[]; foot: string } {
  const src = multiCompany ? '城巴同九巴' : (COMPANIES[company as Company]?.name ?? '巴士公司');
  if (company === 'MTRB') {
    return { title: '巴士位置點樣嚟？', intro: '港鐵巴士行緊嘅車有 GPS 位置，地圖直接顯示，每 20 秒更新。', bullets: ['未開出、或者冇 GPS 嘅車，位置按到站時間推算。'], foot: '僅供參考，以港鐵巴士到站時間為準。' };
  }
  if (company === 'NLB') {
    return {
      title: '巴士位置點樣計？',
      intro: '地圖上嘅巴士位置係推算出嚟：',
      bullets: ['有 GPS 嘅車：每 20 秒讀取每個站嘅到站時間，推算佢喺邊兩個站之間。', '新大嶼山巴士好多車冇 GPS，到站時間只係時間表：呢啲車按政府時間表估計，半透明顯示，實際可能提早、延誤或者取消。', '到站時間推遲時，巴士會停喺原位，唔會倒退。'],
      foot: '僅供參考，以新大嶼山巴士到站時間為準。',
    };
  }
  return {
    title: '巴士位置點樣計？',
    intro: '地圖上嘅巴士位置係推算出嚟，唔係 GPS 實時定位：',
    bullets: [`每 20 秒讀取${src}每個站嘅到站時間，睇邊架車已經過咗邊個站，推算佢喺邊兩個站之間。`, '兩站之間嘅位置按嗰段路嘅行車時間估算（到站時間同實測平均）。', '到站時間推遲（例如塞車）時，巴士會停喺原位，唔會倒退，等時間追上先再郁。'],
    foot: `僅供參考，以${src}到站時間為準。`,
  };
}

/** 「?」掣 + 全屏說明 */
export function MapHelpButton({ company, multiCompany }: { company: string; multiCompany: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const h = helpText(company, multiCompany);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={h.title}
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', ...shadow }}
      >
        <Icon name="info" size={20} color={t.text} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, padding: 20, borderRadius: radius.l, backgroundColor: t.card, gap: 8, ...shadowLg }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>{h.title}</Text>
            <Text style={{ color: t.text, lineHeight: 22 }}>{h.intro}</Text>
            {h.bullets.map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={{ color: t.text, lineHeight: 22 }}>•</Text>
                <Text style={{ flex: 1, color: t.text, lineHeight: 22 }}>{b}</Text>
              </View>
            ))}
            <Text style={{ color: t.muted, fontSize: 13 }}>{h.foot}</Text>
            <Pressable onPress={() => setOpen(false)} style={{ alignSelf: 'flex-end', marginTop: 4, paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.s, backgroundColor: t.brand }}>
              <Text style={{ fontWeight: '700', color: t.onBrand }}>知道</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
