import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeFavGroup, FAV_GROUP_PRESETS, FAV_GROUP_WINDOWS, favGroupWindowLabel, favsInGroup, groupFavsByRoute, newFavGroupId, type FavGroupDef } from '@hknt/core';
import { setFavoriteGroup, useFavorites, type Favorite } from '@/lib/favorites';
import { deleteFavGroup, saveFavGroup, useFavGroups } from '@/lib/fav-groups';
import { FavRouteCard } from '@/components/FavItem';
import { Icon } from '@/components/Icon';
import { radius, shadowLg, useTheme } from '@/lib/theme';
import { AppBar, EmptyState, PrimaryButton } from '@/components/ui';

const BLUE = '#2F6FD6';
const GREEN = '#1E8E3E';

/**
 * 收藏：按路線分組（巴士路線、港鐵綫一張卡），卡入面列收藏咗嘅站：巴士站直接顯示下一班；成條路線一撳就入；港鐵站顯示嗰條綫兩個方向下一班。
 * 分組（例如「返工」「返屋企」，core fav-groups.ts）：頂部一行揀組，預設揀而家時段嘅組；每個收藏下面揀放入邊組。
 * 同網頁 components/home/Favorites.tsx 一樣。
 */
export default function FavoritesTab() {
  const t = useTheme();
  const list = useFavorites();
  const groups = useFavGroups();
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<FavGroupDef | 'new' | null>(null);
  const [moving, setMoving] = useState<Favorite | null>(null);
  // 預設：而家時段嘅組（有收藏先揀），否則全部
  const [now] = useState(() => Date.now());
  const active = activeFavGroup(groups, now);
  const current = picked ?? (active && list.some((f) => f.group === active.id) ? active.id : 'all');
  const shown = favsInGroup(list, current, groups);
  const currentGroup = groups.find((g) => g.id === current) ?? null;
  const windowLabel = currentGroup ? favGroupWindowLabel(currentGroup) : '';

  return (
    <View style={{ flex: 1 }}>
      <AppBar>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>收藏</Text>
      </AppBar>
      {list.length === 0 ? (
        <EmptyState icon="star" action={{ label: '去路線列表', onPress: () => router.navigate('/routes') }}>
          <Text style={{ color: t.muted, textAlign: 'center', lineHeight: 22 }}>喺路線頁撳標題列嘅星號收藏路線，{'\n'}或者打開一個站撳「收藏呢個站」；{'\n'}港鐵站喺路綫圖撳站再撳星號。</Text>
          <Text style={{ color: t.muted, textAlign: 'center', fontSize: 13 }}>收藏咗嘅站會喺度直接顯示下一班車（只儲存喺呢部機）</Text>
        </EmptyState>
      ) : (
        <FlatList
          data={groupFavsByRoute(shown)}
          keyExtractor={(g) => g.key}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          ListHeaderComponent={
            <View style={{ gap: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist" accessibilityLabel="收藏分組">
                <GroupChip label="全部" count={list.length} on={current === 'all'} onPress={() => setPicked('all')} />
                {groups.map((g) => (
                  <GroupChip key={g.id} label={g.name} count={list.filter((f) => f.group === g.id).length} on={current === g.id} dot={active?.id === g.id} onPress={() => setPicked(g.id)} />
                ))}
                <Pressable onPress={() => setEditing('new')} accessibilityRole="button" accessibilityLabel="新增分組" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.line }}>
                  <Icon name="plus" size={16} color={t.muted} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.muted }}>分組</Text>
                </Pressable>
              </ScrollView>
              {currentGroup && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                  <Text style={{ color: t.muted, fontSize: 13, flexShrink: 1 }}>{windowLabel ? `${windowLabel} 首頁大卡會排先` : '冇設時段'}</Text>
                  <Pressable onPress={() => setEditing(currentGroup)} hitSlop={8} accessibilityRole="button">
                    <Text style={{ color: BLUE, fontWeight: '700', fontSize: 14 }}>改名／時段</Text>
                  </Pressable>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={{ backgroundColor: t.card, borderRadius: radius.m, padding: 16 }}>
              <Text style={{ color: t.muted, lineHeight: 20 }}>呢組未有收藏：喺「全部」入面，撳收藏下面嘅「未分組」，揀「{currentGroup?.name ?? '分組'}」。</Text>
            </View>
          }
          renderItem={({ item }) => <FavRouteCard g={item} groups={groups} onPickGroup={setMoving} />}
        />
      )}
      {editing && (
        <FavGroupEditor
          group={editing === 'new' ? null : editing}
          used={groups.map((g) => g.name)}
          onClose={(id) => {
            setEditing(null);
            if (id === null) setPicked('all');
            else if (id) setPicked(id);
          }}
        />
      )}
      {moving && <GroupPicker f={moving} groups={groups} onClose={() => setMoving(null)} />}
    </View>
  );
}

function GroupChip({ label, count, on, dot, onPress }: { label: string; count: number; on: boolean; dot?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${label} ${count} 個${dot ? '（而家時段）' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: on ? BLUE : t.line, backgroundColor: on ? 'rgba(47,111,214,0.1)' : t.card }}>
      {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />}
      <Text style={{ fontSize: 15, fontWeight: '700', color: on ? BLUE : t.text }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: on ? BLUE : t.muted }}>{count}</Text>
    </Pressable>
  );
}

/** 下面彈上嘅面板（分組編輯、揀分組共用） */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} accessibilityLabel="關閉" />
        <View style={{ maxHeight: '85%', backgroundColor: t.card, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, paddingBottom: insets.bottom + 16, ...shadowLg }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: t.line, marginTop: 8 }} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 10, gap: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>{title}</Text>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: on ? BLUE : t.line, backgroundColor: on ? 'rgba(47,111,214,0.1)' : t.card }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: on ? BLUE : t.text }}>{label}</Text>
    </Pressable>
  );
}

/** 新增／修改分組：名（有建議）、時段（預設幾款）；可以刪 */
function FavGroupEditor({ group, used, onClose }: { group: FavGroupDef | null; used: string[]; onClose: (id?: string | null) => void }) {
  const t = useTheme();
  const presets = FAV_GROUP_PRESETS.filter((p) => !used.includes(p.name));
  const suggestion = presets[0];
  const [name, setName] = useState(group?.name ?? suggestion?.name ?? '');
  const [win, setWin] = useState(() => {
    const src = group ?? suggestion;
    const i = FAV_GROUP_WINDOWS.findIndex((w) => w.from === src?.from && w.to === src?.to);
    return i >= 0 ? i : 0;
  });
  const save = () => {
    const w = FAV_GROUP_WINDOWS[win]!;
    const id = group?.id ?? newFavGroupId();
    saveFavGroup({ id, name: name.trim().slice(0, 12), ...(w.from !== undefined && w.to !== undefined ? { from: w.from, to: w.to } : {}) });
    onClose(id);
  };
  const remove = () => {
    if (!group) return;
    const go = () => {
      deleteFavGroup(group.id);
      onClose(null);
    };
    const msg = `入面嘅收藏唔會刪，會變返未分組。`;
    // RN Web 嘅 Alert 冇按鈕
    if (Platform.OS === 'web') {
      if (window.confirm(`刪除「${group.name}」？${msg}`)) go();
    } else Alert.alert(`刪除「${group.name}」？`, msg, [{ text: '取消', style: 'cancel' }, { text: '刪除', style: 'destructive', onPress: go }]);
  };
  return (
    <Sheet title={group ? '修改分組' : '新增分組'} onClose={() => onClose()}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>名</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={12}
          placeholder="例如：返工"
          placeholderTextColor={t.muted}
          accessibilityLabel="分組名"
          style={{ fontSize: 16, color: t.text, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.s, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.surface2 }}
        />
      </View>
      {!group && presets.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {presets.map((p) => (
            <SheetChip
              key={p.name}
              label={p.name}
              on={name === p.name}
              onPress={() => {
                setName(p.name);
                const i = FAV_GROUP_WINDOWS.findIndex((w) => w.from === p.from && w.to === p.to);
                setWin(i >= 0 ? i : 0);
              }}
            />
          ))}
        </View>
      )}
      <View style={{ gap: 6 }}>
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>時段（呢段時間首頁大卡會將呢組排先）</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FAV_GROUP_WINDOWS.map((w, i) => (
            <SheetChip key={w.label} label={w.label} on={win === i} onPress={() => setWin(i)} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {group && (
          <Pressable onPress={remove} accessibilityRole="button" hitSlop={6} style={{ marginTop: 6 }}>
            <Text style={{ color: t.special, fontWeight: '700', fontSize: 15 }}>刪除分組</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => onClose()} accessibilityRole="button" hitSlop={6} style={{ marginTop: 6, paddingHorizontal: 12, paddingVertical: 12 }}>
          <Text style={{ color: t.text, fontWeight: '600', fontSize: 16 }}>取消</Text>
        </Pressable>
        <PrimaryButton label="儲存" onPress={save} disabled={!name.trim()} />
      </View>
    </Sheet>
  );
}

/** 揀一個收藏放入邊組（網頁用 select） */
function GroupPicker({ f, groups, onClose }: { f: Favorite; groups: FavGroupDef[]; onClose: () => void }) {
  const t = useTheme();
  const cur = f.group && groups.some((g) => g.id === f.group) ? f.group : '';
  const opts = [{ id: '', name: '未分組' }, ...groups];
  return (
    <Sheet title={`${f.route}${f.stopName ? ` · ${f.stopName}` : ''} 放入分組`} onClose={onClose}>
      <View>
        {opts.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => {
              setFavoriteGroup(f, g.id || null);
              onClose();
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: g.id === cur }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.line }}
          >
            <Icon name="folder" size={20} color={g.id ? t.text : t.muted} />
            <Text style={{ flex: 1, fontSize: 16, color: t.text, fontWeight: g.id === cur ? '700' : '500' }}>{g.name}</Text>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: g.id === cur ? BLUE : t.line, alignItems: 'center', justifyContent: 'center' }}>
              {g.id === cur && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE }} />}
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
