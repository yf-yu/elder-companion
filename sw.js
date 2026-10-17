const CACHE = 'banlaoyou-V6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',

  // 樣式
  './css/base.css',
  './css/modules.css',
  './css/home.css',
  './css/games.css',
  './css/page-fix.css',

  // 腳本
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

  // 圖示與 PWA 必備圖片
  './icon/web-app-manifest-192x192.png',
  './icon/web-app-manifest-512x512.png',
  './icon/apple-touch-icon.png',
  './icon/favicon-96x96.png',

  // 健康操分解動作圖（離線可看）
  './icon/ex-neck.png',
  './icon/ex-leg.png',
  './icon/ex-chest.png',
  './icon/ex-hand.png'
];

// 1. 安裝 Service Worker 並快取檔案
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// 2. 啟用時，清除舊版的快取
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// 僅攔截同源資源；HTML 採網路優先，其他靜態資源採快取優先。
self.addEventListener('fetch', evt => {
  const req = evt.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  if(req.mode === 'navigate') {
    evt.respondWith(fetch(req).then(response => {
      if(response.ok) { const copy = response.clone(); evt.waitUntil(caches.open(CACHE).then(c => c.put('./index.html', copy))); }
      return response;
    }).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  evt.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
    if(response.ok && response.type === 'basic') {
      const copy = response.clone(); evt.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
    }
    return response;
  })));
});
