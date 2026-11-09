import { router } from 'expo-router';

/**
 * 打開港鐵路綫圖嗰個站（首頁大字、大卡、收藏）：去「路線」分頁揀港鐵，飛去個站並打開到站時間。
 * n 每次唔同：撳返同一個站都會再飛一次。
 */
export function openMtr(sta: string) {
  router.navigate({ pathname: '/routes', params: { mode: 'rail', sta, n: String(Date.now()) } });
}
