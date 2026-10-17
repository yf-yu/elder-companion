const CACHE = 'banlaoyou-v5';
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

// 3. 攔截網路請求：有快取先用快取，沒快取才連網
self.addEventListener('fetch', evt => {
  // 只處理 GET 請求
  if(evt.request.method !== 'GET') return;

  // 如果請求的是氣象 API 或 YouTube，就直接放行連網（不要快取動態資料）
  if(evt.request.url.includes('api.open-meteo.com') || evt.request.url.includes('youtube.com')) {
    return;
  }

  evt.respondWith(
    caches.match(evt.request).then(cached => {
      // 如果有快取，直接回傳快取（這讓長輩在沒網路時也能瞬間開啟）
      if (cached) return cached;

      // 如果沒快取，就發送網路請求
      return fetch(evt.request).then(resp => {
        // 確保請求成功，且是本地端檔案才存入快取
        if(resp && resp.status === 200 && resp.type === 'basic'){
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(evt.request, clone));
        }
        return resp;
      }).catch(() => {
        // 如果連網失敗（例如完全沒網路），且沒有快取，就回傳 undefined 或首頁
        // 這樣可以避免瀏覽器報錯中斷
      });
    })
  );
});
