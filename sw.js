/* Service worker: guarda o app no aparelho para funcionar sem internet.
 * Estratégia: sempre tenta a versão mais nova na internet; usa a cópia guardada só se estiver offline. */
const VERSAO = 'orcacalha-v1.1.3';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './app.css?v=1.1.3', './calc.js?v=1.1.3', './store.js?v=1.1.3', './pdf.js?v=1.1.3', './app.js?v=1.1.3', './jspdf.umd.min.js?v=1.1.3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSAO).then((c) => c.put(req.mode === 'navigate' ? './index.html' : req, copy)); }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req).then((hit) => hit || caches.match(req, { ignoreSearch: true })))
  );
});
