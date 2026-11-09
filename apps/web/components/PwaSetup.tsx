'use client';
import { useEffect } from 'react';
import { startPwa } from '@/lib/pwa';

/** 放喺 layout：註冊 service worker、捉安裝提示（lib/pwa.ts） */
export default function PwaSetup() {
  useEffect(() => startPwa(), []);
  return null;
}
