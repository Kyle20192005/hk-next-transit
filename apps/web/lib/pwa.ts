'use client';
import { useSyncExternalStore } from 'react';

/**
 * PWA：註冊 service worker（public/sw.js，只限正式版；開發版會 cache 住舊 code）同埋記低安裝提示。
 * Chrome／Edge／Android 有 `beforeinstallprompt`（一開頁就出，要即刻捉住），iPhone／iPad Safari 冇，
 * 要教用戶「分享 → 加至主畫面」。設定頁「安裝 App」用 `useInstall()`。
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  /** 已經用緊安裝咗嘅版本（主畫面打開） */
  | 'installed'
  /** 瀏覽器可以一撳安裝（Chrome、Edge、Android） */
  | 'prompt'
  /** iPhone／iPad Safari：要用分享選單「加至主畫面」 */
  | 'ios'
  /** 其他瀏覽器（例如 Firefox 電腦版）：唔支援，唔顯示 */
  | 'unsupported';

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let started = false;

function standalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13 起扮 Mac：有觸控嘅「Mac」當 iPad
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** 一開頁就叫（components/PwaSetup.tsx）：註冊 service worker、捉安裝提示 */
export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;
  // <head> 嘅 PWA_SCRIPT 可能已經捉咗
  const early = (window as Window & { __nlInstall?: InstallPromptEvent }).__nlInstall;
  if (early) deferred = early;
  window.addEventListener('beforeinstallprompt', (e) => {
    // 唔要瀏覽器自己彈，留俾設定頁「安裝」掣
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    emit();
  });
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    // 等頁面載入完先註冊，唔好搶首次載入
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

function state(): InstallState {
  if (installedNow || standalone()) return 'installed';
  if (deferred) return 'prompt';
  // iOS 只有 Safari 可以加至主畫面（iOS 16.4 起其他瀏覽器分享選單都有，但係用 Safari 最穩陣）
  if (isIos()) return 'ios';
  return 'unsupported';
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useInstall(): { state: InstallState; install: () => Promise<boolean> } {
  const s = useSyncExternalStore(subscribe, state, () => 'unsupported' as InstallState);
  return {
    state: s,
    install: async () => {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === 'accepted') installedNow = true;
      emit();
      return outcome === 'accepted';
    },
  };
}
