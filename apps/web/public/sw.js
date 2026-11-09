/*
 * 下一程 PWA service worker（components/Pwa.tsx 喺正式版註冊；改咗呢個檔記得改 SW_VERSION，瀏覽器先會換新版）。
 *
 * 原則：實時資料（/api/*、tracker、地圖底圖）一律唔 cache，照直上網；只係令 App 離線都開到：
 * - /_next/static/*（檔名有 hash，唔會變）：cache 優先，最多留 STATIC_MAX 個
 * - 撳入嘅頁（navigate）：網絡優先，成功就記低（最多 PAGE_MAX 頁）；冇網絡就用記低嗰版（首頁安裝時已經記低），未開過嘅頁出簡單離線頁
 * - 圖示、manifest：用 cache 即刻俾，背景更新
 * Next.js 嘅 RSC 請求（?_rsc=、RSC header）唔理：冇網絡時 Next 自己會改用整頁載入，就會行返上面 navigate 嗰條路。
 */
const SW_VERSION = 1;
const STATIC = 'nextleg-static-v1';
const PAGES = 'nextleg-pages-v1';
const ASSETS = 'nextleg-assets-v1';
const KEEP = [STATIC, PAGES, ASSETS];
const STATIC_MAX = 400;
const PAGE_MAX = 30;
const ASSET_PATHS = ['/manifest.webmanifest', '/icon.svg', '/apple-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-192.png', '/icons/maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // 預先記低首頁（冇網絡又未開過嗰頁時用），失敗唔緊要
      try {
        const res = await fetch('/', { cache: 'no-store' });
        if (res.ok) await (await caches.open(PAGES)).put('/', res);
      } catch {}
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('nextleg-') && !KEEP.includes(k)) await caches.delete(k);
      // navigation preload：唔使等 service worker 啟動先開始下載頁面
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

/** cache 太多就刪最舊（cache.keys() 係加入次序） */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

const OFFLINE_HTML = `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffc72c"><title>冇網絡｜下一程</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang HK","Noto Sans TC",sans-serif;background:#ffc72c;color:#1a1a1a;text-align:center}
h1{margin:0;font-size:1.4rem}p{margin:0;opacity:.75}button,a{display:inline-block;margin-top:8px;font:inherit;font-weight:700;padding:10px 22px;border:0;border-radius:999px;background:#1a1a1a;color:#ffc72c;text-decoration:none}a{background:transparent;color:#1a1a1a;box-shadow:inset 0 0 0 2px #1a1a1a}</style></head>
<body><h1>冇網絡</h1><p>呢頁未開過，要上網先睇到。連返網絡之後再試。</p><div><button onclick="location.reload()">再試</button> <a href="/">返首頁</a></div></body></html>`;

async function page(event) {
  const cache = await caches.open(PAGES);
  try {
    const res = (await event.preloadResponse) || (await fetch(event.request));
    // 只記低正常嘅頁（唔記錯誤頁、轉址）
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(cache.put(event.request, copy).then(() => trim(PAGES, PAGE_MAX)));
    }
    return res;
  } catch {
    return (
      // Next.js 嘅頁有 Vary: RSC…，離線配對唔理
      (await cache.match(event.request, { ignoreVary: true })) ||
      (await cache.match(event.request, { ignoreSearch: true, ignoreVary: true })) ||
      // 未開過嘅頁唔好用首頁頂替（網址同內容唔夾）；開 App（/）就用記低嗰版
      (new URL(event.request.url).pathname === '/' && (await cache.match('/', { ignoreVary: true }))) ||
      new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    );
  }
}

async function staticFile(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok) {
    const copy = res.clone();
    event.waitUntil(cache.put(event.request, copy).then(() => trim(STATIC, STATIC_MAX)));
  }
  return res;
}

async function asset(event) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(event.request);
  const update = fetch(event.request)
    .then((res) => (res.ok ? cache.put(event.request, res.clone()).then(() => res) : res))
    .catch(() => hit);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return update.then((res) => res || Response.error());
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 其他網站（tracker、地圖、營辦商）同實時 API：照直上網
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Next.js 頁面資料（RSC）：唔好 cache
  if (url.searchParams.has('_rsc') || req.headers.get('RSC')) return;
  if (req.mode === 'navigate') return event.respondWith(page(event));
  if (url.pathname.startsWith('/_next/static/')) return event.respondWith(staticFile(event));
  if (ASSET_PATHS.includes(url.pathname)) return event.respondWith(asset(event));
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ swVersion: SW_VERSION });
});
