const CACHE = 'gcg-hangar-v5';
const ASSETS = [
  './index.html',
  './app.js',
  './manifest.json',
  './icon.svg',
];

// インストール時：全アセットをキャッシュ
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 有効化時：古いキャッシュを削除
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// リクエスト時：ネットワーク優先（最新版を常に取得、オフライン時のみキャッシュ）
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
