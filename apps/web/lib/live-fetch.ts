/**
 * 攞營辦商實時到站時間用嘅 fetch：唔用 Next.js 嘅 fetch cache。
 *
 * Next.js 嘅 fetch cache（next.revalidate）過期之後，下一個請求會先拎到舊數據、再喺背景更新
 * （stale-while-revalidate）。一條線隔咗好耐冇人睇，第一個人就會見到半個鐘前嘅到站時間。
 * 實時數據唔可以咁，所以每次都直接問營辦商；多人睇同一條線就靠 API 回應嘅 CDN cache（s-maxage）。
 */
export const liveFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });
