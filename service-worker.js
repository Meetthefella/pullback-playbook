const BUILD_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `pullback-playbook-cache-v${BUILD_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './scanner-presets.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

function isHtmlRequest(request){
  return request.mode === 'navigate' || request.destination === 'document' || (request.headers.get('accept') || '').includes('text/html');
}

function isStaticAssetRequest(request){
  return ['style', 'script', 'image', 'font'].includes(request.destination);
}

async function putInCache(request, response){
  if(!response || !response.ok) return response;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE).map(key => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;
  if(url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) return;
  if(url.pathname.endsWith('/service-worker.js') || url.pathname.endsWith('service-worker.js')) return;

  if(isHtmlRequest(event.request) || event.request.destination === 'manifest' || url.pathname.endsWith('.webmanifest')){
    event.respondWith(
      fetch(event.request)
        .then(response => putInCache(event.request, response))
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  if(isStaticAssetRequest(event.request)){
    event.respondWith(
      caches.match(event.request).then(cached => {
        if(cached) return cached;
        return fetch(event.request).then(response => putInCache(event.request, response));
      })
    );
    return;
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try{
    payload = event.data ? event.data.json() : {};
  }catch(error){
    payload = { title:'Pullback Playbook', body:event.data ? event.data.text() : '' };
  }
  const title = String(payload.title || 'Pullback Playbook');
  const body = String(payload.body || '');
  const url = String(payload.url || './');
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:'./icon-192.png',
      badge:'./icon-192.png',
      data:{ url }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification && event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : './';
  event.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(windowClients => {
      for(const client of windowClients){
        if('focus' in client){
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if(clients.openWindow) return clients.openWindow(targetUrl);
      return null;
    })
  );
});
