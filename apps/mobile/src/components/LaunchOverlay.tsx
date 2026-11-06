import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

const LOGO = { light: require('../../assets/splash-icon.png'), dark: require('../../assets/splash-icon-dark.png') };
/** 同 app.json expo-splash-screen 一樣（imageWidth 120、背景色），原生載入畫面先可以無縫接過嚟 */
const SIZE = 120;
const HOLD_MS = 450;
const FADE_MS = 350;

// 原生載入畫面由我哋自己收（收嗰刻呢個 overlay 已經畫咗，睇落係同一個畫面）
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * 開 App 動畫：黃底 N logo，停一陣再淡出 + 輕微放大。
 * Expo Go 唔顯示自訂原生載入畫面，所以用 JS 畫多一層；正式版由原生載入畫面無縫接過嚟。唔好拖慢開 App（合共不足 1 秒）。
 */
export function LaunchOverlay() {
  const dark = useColorScheme() === 'dark';
  const [progress] = useState(() => new Animated.Value(0));
  const [done, setDone] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const anim = Animated.timing(progress, { toValue: 1, duration: FADE_MS, delay: HOLD_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start(() => setDone(true));
    return () => anim.stop();
  }, [progress]);

  if (done) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#1A1A1A' : '#FFC72C', opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
    >
      <Animated.Image
        source={dark ? LOGO.dark : LOGO.light}
        style={{ width: SIZE, height: SIZE, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }] }}
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );
}
