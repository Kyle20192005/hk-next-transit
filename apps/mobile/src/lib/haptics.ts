import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * 震動回饋（iPhone／Android；網頁預覽冇）：失敗就算，唔影響功能。
 * - tap：一般撳掣（收藏、轉方向、揀落車站）
 * - pick：拖拉開始／放手、揀咗嘢
 */
const ok = Platform.OS === 'ios' || Platform.OS === 'android';
export const haptic = {
  tap: () => void (ok && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})),
  pick: () => void (ok && Haptics.selectionAsync().catch(() => {})),
  done: () => void (ok && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})),
};
