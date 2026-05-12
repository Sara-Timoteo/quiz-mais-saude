/* Service Worker — Quiz Mais Saúde
   Estratégia: cache-first para assets estáticos, network para Supabase.
*/

const CACHE_NAME = 'quiz-mais-saude-v10';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/abem-logo.png',
  './assets/dignitude-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Adiciona um a um — se algum falhar, não estoura o install todo
      Promise.all(ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('SW: falhou cache de', url, err))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cacheia chamadas Supabase nem fontes — vão sempre à rede
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('jsdelivr.net')) {
    return; // deixa o browser tratar
  }

  // Cache-first para o resto
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(resp => {
        // Cacheia ao vivo o que vai sendo pedido (mesma origem apenas)
        if (resp.ok && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => caches.match('./index.html'))
    )
  );
});

// ============================================
// Notificações: clique abre/foca a app
// ============================================

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetURL = new URL('./', self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Tentar focar uma janela existente da app
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          return c.focus();
        }
      }
      // Senão, abrir nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetURL);
      }
    })
  );
});
