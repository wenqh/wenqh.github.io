// 只缓存页面外壳，让它能装成 PWA、离线能打开。
// 播放列表由页面用 Cache API 自己管；台标图片不经过这里、走网络、不缓存。
const SHELL = 'tv-shell-v1';

self.addEventListener('install', e => {
    e.waitUntil(caches.open(SHELL).then(c => c.add('tv.html')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    // 只接管页面导航：在线走网络（永远最新），离线回退缓存的外壳。其它请求一律放行。
    if (e.request.mode === 'navigate') {
        e.respondWith(fetch(e.request).catch(() => caches.match('tv.html')));
    }
});
