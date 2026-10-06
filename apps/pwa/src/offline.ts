let waiting: ServiceWorker | null = null;
let requested = false;
export function applyUpdate(): void { if (!waiting) return; requested = true; waiting.postMessage('ACTIVATE_UPDATE'); }
export async function prepareOffline(): Promise<void> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const registration = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'service-worker.js', { scope: import.meta.env.BASE_URL });
  const announce = () => { if (registration.waiting && navigator.serviceWorker.controller) { waiting = registration.waiting; window.dispatchEvent(new Event('paymentplan-update')); } };
  announce(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', announce));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (requested) window.location.reload(); });
  setInterval(() => { if (navigator.onLine) void registration.update().catch(() => {}); }, 60 * 60_000);
}
