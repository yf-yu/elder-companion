const CACHE = 'banlaoyou-V7.3';
const CACHE_PREFIX = 'banlaoyou-';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',

  './css/base.css',
  './css/modules.css',
  './css/home.css',
  './css/games.css',
  './css/page-fix.css',

  './js/config.js',
  './js/router.js',
  './js/home.js',
  './js/health.js',
  './js/brain.js',
  './js/meds.js',
  './js/phones.js',
  './js/dress.js',
  './js/setup.js',
  './js/main.js',
  './js/notices.js'
];

const OPTIONAL_ASSETS = [
  './favicon.ico',

  './icon/web-app-manifest-192x192.png',
  './icon/web-app-manifest-512x512.png',
  './icon/apple-touch-icon.png',
  './icon/favicon-96x96.png',

  './icon/ex-neck.png',
  './icon/ex-leg.png',
  './icon/ex-chest.png',
  './icon/ex-hand.png'
];

/* 安裝：核心檔案必須成功 */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    await cache.addAll(CORE_ASSETS);

    // 非核心圖片失敗不阻止安裝
    await Promise.allSettled(
      OPTIONAL_ASSETS.map(path => cache.add(path))
    );

    await self.skipWaiting();
  })());
});

/* 啟用：只清理本專案的舊快取 */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith(CACHE_PREFIX) &&
          key !== CACHE
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

/* 判斷是否為最新公告資料 */
function isAnnouncementData(url) {
  return url.pathname.endsWith(
    '/data/announcements.json'
  );
}

/* 判斷是否為程式資源 */
function isCodeAsset(url) {
  return /\.(js|css)$/i.test(url.pathname);
}

/* 網路優先，失敗時使用快取 */
async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request);

    if (response.ok && response.type === 'basic') {
      await cache.put(
        request,
        response.clone()
      );
    }

    return response;

  } catch (error) {
    const cached = await cache.match(request);

    if (cached) return cached;

    if (fallback) {
      const offline = await cache.match(fallback);
      if (offline) return offline;
    }

    return Response.error();
  }
}

/* 靜態圖片：快取優先 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);

  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response.ok && response.type === 'basic') {
      await cache.put(
        request,
        response.clone()
      );
    }

    return response;

  } catch (error) {
    return Response.error();
  }
}

/* 攔截網站請求 */
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 不處理外部網站
  if (url.origin !== self.location.origin) return;

  // 不處理 Service Worker 自身
  if (url.pathname.endsWith('/sw.js')) return;

  // 最新公告：只從網路取得
  if (isAnnouncementData(url)) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => Response.error())
    );
    return;
  }

  // HTML：網路優先
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, './index.html')
    );
    return;
  }

  // JS / CSS：網路優先
  if (isCodeAsset(url)) {
    event.respondWith(
      networkFirst(request)
    );
    return;
  }

  // 圖片及其他靜態檔案：快取優先
  event.respondWith(
    cacheFirst(request)
  );
});
