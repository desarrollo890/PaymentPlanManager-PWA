import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
const base = '/PaymentPlanManager-PWA/';
export default defineConfig({
  plugins: [react(), {
    name: 'paymentplan-offline-shell',
    generateBundle(_, bundle) {
      const names = Object.keys(bundle), hash = createHash('sha256').update(names.join('|')).digest('hex').slice(0, 16);
      const files = ['index.html', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', ...names.filter(n => /\.(js|css)$/.test(n))].map(n => base + n);
      const source = `const CACHE='paymentplan-shell-${hash}',FILES=${JSON.stringify(files)},BASE=${JSON.stringify(base)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('paymentplan-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
if(event.request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(cache=>cache.match(BASE+'index.html')).then(hit=>hit||fetch(event.request)));return;}
if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(hit=>hit||fetch(event.request)));});`;
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source });
    },
  }],
  base, build: { sourcemap: false },
});
