// Margins service worker: works offline, and receives PDFs shared from other apps.
const VERSION = 'margins-v8';
const SHARE = 'margins-share';
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable.png', './apple-touch-icon.png',
  './pdf.min.js', './pdf.worker.min.js', './pdf-lib.min.js'];

self.addEventListener('install', e => {
  // Cache each file on its own, so one missing file never breaks offline mode.
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== SHARE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // A PDF shared to Margins: keep it, then open the app, which imports it.
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const files = form.getAll('pdf').filter(f => f && typeof f !== 'string');
        const c = await caches.open(SHARE);
        let i = 0;
        for (const f of files) {
          await c.put('./shared/' + Date.now() + '-' + (i++), new Response(f, {
            headers: { 'content-type': f.type || 'application/pdf', 'x-name': encodeURIComponent(f.name || 'Shared.pdf') }
          }));
        }
      } catch (err) {}
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  })));
});
