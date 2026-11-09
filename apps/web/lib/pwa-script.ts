/**
 * 喺 <head> 即刻捉住 beforeinstallprompt：Chrome 可能喺 React 載入完之前就出，遲咗加 listener 會冇咗。
 * lib/pwa.ts 嘅 startPwa 會接手 window.__nlInstall。（呢個檔唔好加 'use client'：layout 要用個字串）
 */
export const PWA_SCRIPT = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__nlInstall=e;});`;
