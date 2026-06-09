const SHELL = 'tv-shell-v1';     // 页面外壳（改版本号可强制刷新离线副本）
const DATA = 'tv-data-v1';       // 播放列表等数据，按 TTL 自动过期，无需手动维护
const TTL = 24 * 60 * 60 * 1000; // 1天

self.addEventListener('install', e =>
    e.waitUntil(caches.open(SHELL).then(c => c.add('tv.html')).then(() => self.skipWaiting())));

self.addEventListener('activate', e =>
    e.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))))
        .then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
    const req = e.request;

    // 页面导航：网络优先（永远最新代码），离线回退缓存的外壳
    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).catch(() => caches.match('tv.html')));
        return;
    }

    // 只排除图片(台标)；其余 GET 一律走 TTL 缓存（含跨域播放列表）
    if (req.method !== 'GET' || req.destination === 'image') return;

    e.respondWith((async () => {
        const cache = await caches.open(DATA);
        const hit = await cache.match(req);

        const refresh = async () => {
            const r = await fetch(req);
            if (r.ok) {
                const headers = new Headers(r.headers);
                headers.set('x-cached-at', Date.now());
                await cache.put(req, new Response(r.clone().body, { headers }));
            }
            return r;                              // r 未被读，原样返回给页面
        };

        if (!hit) return refresh();                // 冷启动：等网络
        if (Date.now() - hit.headers.get('x-cached-at') >= TTL) e.waitUntil(refresh().catch(() => {}));  // 过期：后台刷，下次生效
        return hit;                                // 有缓存：秒开
    })());
});
