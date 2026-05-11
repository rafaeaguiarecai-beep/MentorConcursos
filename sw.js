/* ==== MentorConcursos - Service Worker v5 ==== */
const CACHE_NAME = 'mentorconcursos-v8';
const STATIC_CACHE = `${CACHE_NAME}-static`;
const RUNTIME_CACHE = `${CACHE_NAME}-runtime`;
const CDN_CACHE = `${CACHE_NAME}-cdn`;

const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/timer.js',
  './js/backup.js',
  './js/charts.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![STATIC_CACHE, RUNTIME_CACHE, CDN_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isCDN = CDN_HOSTS.includes(url.hostname);

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(req));
    return;
  }

  if (isCDN) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstComTimeout(req, RUNTIME_CACHE, 3000));
    return;
  }

  event.respondWith(cacheFirstRuntime(req, RUNTIME_CACHE));
});

async function networkFirstNavigate(request) {
  try {
    const resposta = await networkFirstComTimeout(request, RUNTIME_CACHE, 3000);
    return resposta;
  } catch {
    return (await caches.match('./index.html')) || Response.error();
  }
}

async function networkFirstComTimeout(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const resposta = await fetchComTimeout(request, timeoutMs);
    if (resposta && resposta.ok) await cache.put(request, resposta.clone());
    return resposta;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await caches.match('./index.html');
    if (request.mode === 'navigate' && shell) return shell;
    throw new Error('Network timeout/error');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => null);
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => null);
    return cached;
  }

  const network = await networkPromise;
  return network || Response.error();
}

async function cacheFirstRuntime(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const network = await fetch(request);
  if (network && network.ok) await cache.put(request, network.clone());
  return network;
}

function fetchComTimeout(request, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    fetch(request)
      .then((resp) => {
        clearTimeout(timer);
        resolve(resp);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}