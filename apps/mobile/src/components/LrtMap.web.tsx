import { ActivityIndicator, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { ComponentProps } from 'react';
import type { LrtMap as SkiaMap } from './LrtMapSkia';

/** CanvasKit（Skia 嘅 WebAssembly 版）同中文字型：只係 Expo 網頁預覽用（開發測試），手機 App 唔使 */
const CANVASKIT = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/';
const FONT = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf';

/**
 * 輕鐵路綫圖（Expo 網頁預覽）：同手機一樣嘅 Skia 版（LrtMapSkia.tsx），先載入 CanvasKit 同字型
 * （CanvasKit 冇系統字）。Skia 要喺 CanvasKit 載入之後先可以 import，所以用 WithSkiaWeb 延遲載入。
 */
export function LrtMap(props: ComponentProps<typeof SkiaMap>) {
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file: string) => `${CANVASKIT}${file}` }}
      getComponent={async () => {
        const m = await import('./LrtMapSkia');
        const { Skia } = await import('@shopify/react-native-skia');
        const bytes = new Uint8Array(await (await fetch(FONT)).arrayBuffer());
        const face = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes));
        const provider = Skia.TypefaceFontProvider.Make();
        if (face) provider.registerFont(face, 'Noto Sans TC');
        m.setMapFontProvider(provider);
        return { default: m.LrtMap };
      }}
      componentProps={props}
      fallback={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      }
    />
  );
}
