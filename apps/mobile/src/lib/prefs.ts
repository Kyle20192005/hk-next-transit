import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';
import { cleanPrefs, DEFAULT_PREFS, PREFS_KEY, type Prefs } from '@hknt/core';

/**
 * 用戶設定（設定頁，同網頁 lib/prefs.ts 一樣格式）：AsyncStorage `hknt.prefs`，改咗即時通知所有用緊嘅 component。
 * 深色模式用 Appearance.setColorScheme 蓋過系統，useColorScheme（useTheme）同地圖會跟住變。
 */
let prefs: Prefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function applyTheme(theme: Prefs['theme']) {
  // Expo web 預覽（react-native-web）冇呢個 function，只有 iOS／Android 有
  if (typeof Appearance.setColorScheme === 'function') Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
}

/** 開 App 時讀一次（根 layout 叫） */
export function loadPrefs() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(PREFS_KEY)
    .then((raw) => {
      if (!raw) return;
      prefs = cleanPrefs(JSON.parse(raw));
      applyTheme(prefs.theme);
      emit();
    })
    .catch(() => {});
}

function subscribe(cb: () => void) {
  loadPrefs();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs = { ...prefs, [key]: value };
  if (key === 'theme') applyTheme(value as Prefs['theme']);
  emit();
  AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
}

export const getPrefs = () => prefs;

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}
