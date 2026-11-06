'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { cleanPrefs, DEFAULT_PREFS, PREFS_KEY, type Prefs } from '@hknt/core';

/**
 * 用戶設定（設定頁）：localStorage `hknt.prefs`（同 App AsyncStorage 一樣格式），改咗即時通知所有用緊嘅 component。
 * 深色模式寫落 <html data-theme>（layout 有段細 script 喺載入前先寫，唔會閃）。
 */
const EVENT = 'hknt:prefs';
let memory: Prefs | null = null;

function read(): Prefs {
  if (memory) return memory;
  try {
    memory = cleanPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null'));
  } catch {
    memory = DEFAULT_PREFS;
  }
  return memory;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function applyTheme(theme: Prefs['theme']) {
  const el = document.documentElement;
  if (theme === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', theme);
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  memory = { ...read(), [key]: value };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(memory));
  } catch {
    /* 今次瀏覽仍然有效 */
  }
  if (key === 'theme') applyTheme(value as Prefs['theme']);
  window.dispatchEvent(new Event(EVENT));
}

/** 喺 effect／callback 入面讀最新設定（hydration 時 usePrefs 會先俾預設值） */
export const getPrefs = read;

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_PREFS);
}

/** 而家係咪深色（設定 + 系統），地圖底圖用 */
export function useDark(): boolean {
  const { theme } = usePrefs();
  const [system, setSystem] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystem(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return theme === 'dark' || (theme === 'system' && system);
}

/** 喺 <head> 最早執行：按設定寫 data-theme，避免先閃淺色 */
export const THEME_SCRIPT = `try{var p=JSON.parse(localStorage.getItem('${PREFS_KEY}')||'null');if(p&&(p.theme==='dark'||p.theme==='light'))document.documentElement.setAttribute('data-theme',p.theme)}catch(e){}`;
