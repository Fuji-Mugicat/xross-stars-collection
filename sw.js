// クロスタ所持カード管理 サービスワーカー（手書き・最小構成）
// 方針:
//  - HTML（ナビゲーション）は network-first（デプロイが古いキャッシュに埋もれない）
//  - _next/static のハッシュ付きアセットとアイコン/マニフェストは cache-first
//  - それ以外の同一オリジンは network 優先＋キャッシュ退避
//  - 他オリジン（supabase.co / assets.xross-stars.com 等）には一切介入しない
const CACHE = "xross-cache-v13-1";
const SCOPE = self.registration.scope;
const CORE = [
  SCOPE,
  SCOPE + "manifest.webmanifest",
  SCOPE + "icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 他オリジンは素通し（Supabase 同期・公式画像には触らない）
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req);
          if (hit) return hit;
          const shell = await caches.match(SCOPE);
          return shell || Response.error();
        }),
    );
    return;
  }

  const cacheFirst =
    url.pathname.includes("/_next/static/") ||
    url.pathname.endsWith("/manifest.webmanifest") ||
    url.pathname.includes("/icons/");
  if (cacheFirst) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // それ以外（同梱CSVなど）は network 優先、失敗時はキャッシュ
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
