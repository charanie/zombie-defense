/* 尸潮防线 Service Worker — Cache First */
const CACHE = 'zd-v1.5.0';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './menu.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/og.png',
  './src/core/constants.js',
  './src/core/rng.js',
  './src/core/eventbus.js',
  './src/core/geom.js',
  './src/core/state.js',
  './src/core/platform.js',
  './src/data/balance.js',
  './src/data/humans.js',
  './src/data/zombies.js',
  './src/data/heroes.js',
  './src/data/buildings.js',
  './src/data/maps.js',
  './src/data/menu.js',
  './src/data/waves.js',
  './src/data/tech.js',
  './src/sim/spatial.js',
  './src/sim/tech.js',
  './src/sim/stats.js',
  './src/sim/mapzone.js',
  './src/sim/pathing.js',
  './src/sim/squads.js',
  './src/sim/infection.js',
  './src/sim/combat.js',
  './src/sim/projectiles.js',
  './src/sim/economy.js',
  './src/sim/skills.js',
  './src/sim/spawner.js',
  './src/sim/ai.js',
  './src/sim/captains.js',
  './src/sim/heroes.js',
  './src/sim/sim.js',
  './src/view/model.js',
  './src/view/maplayer.js',
  './src/view/fx.js',
  './src/view/techLayout.js',
  './src/view/techPanel.js',
  './src/view/renderer.js',
  './src/view/particles.js',
  './src/view/audio.js',
  './src/view/menuScene.js',
  './src/view/menu.js',
  './src/view/hud.js',
  './src/view/input.js',
  './src/main.js',
  './src/test-hooks.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return undefined;
      });
    })
  );
});
