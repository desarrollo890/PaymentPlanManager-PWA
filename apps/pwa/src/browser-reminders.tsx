import { useEffect, useRef, useState } from 'react';
import { remindersFor } from '@paymentplan/domain';
import type { Portfolio, FinanceView } from '@paymentplan/domain';

const key = 'paymentplan-browser-alerts'; // A preference only; no financial data.
export function BrowserReminders({ p, view, controls }: { p: Portfolio; view: FinanceView; controls: boolean }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(key) === 'enabled'), [notice, setNotice] = useState('');
  const sent = useRef(new Set<string>()), current = useRef({ p, view }); current.current = { p, view };
  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    let disposed = false;
    async function notify() {
      const { p, view } = current.current; const reminders = remindersFor(p, view);
      const unseen = reminders.filter(r => !sent.current.has(view.today + ':' + r.key));
      if (!unseen.length || disposed) return;
      try { const registration = await navigator.serviceWorker.getRegistration(); if (disposed || !registration) return;
        await registration.showNotification('PaymentPlanManager', { body: 'Tienes avisos por revisar. Abre Inicio para consultar tus compromisos.', tag: 'paymentplan-reminder' });
        unseen.forEach(r => sent.current.add(view.today + ':' + r.key));
      } catch { if (!disposed) setNotice('Este navegador no permite mostrar la notificación. Tus avisos siguen en Inicio.'); }
    }
    void notify(); const timer = setInterval(() => void notify(), 60_000);
    return () => { disposed = true; clearInterval(timer); void navigator.serviceWorker.getRegistration().then(r => r?.getNotifications({ tag: 'paymentplan-reminder' })).then(rows => rows?.forEach(n => n.close())); };
  }, [enabled]);
  async function activate() { try { if (!('Notification' in window)) throw Error('Este navegador no admite notificaciones.');
    const permission = await Notification.requestPermission(); if (permission !== 'granted') throw Error('Permiso no concedido. Puedes cambiarlo en la configuración del navegador.');
    localStorage.setItem(key, 'enabled'); setEnabled(true); setNotice('Avisos activados para este navegador mientras la cartera esté abierta y desbloqueada.');
  } catch (e) { setNotice(e instanceof Error ? e.message : 'No se pudo activar.'); } }
  if (!controls) return null;
  return <section className="panel"><h2>Notificaciones en este dispositivo</h2><p className="caption">Opcionales, mientras la cartera esté abierta y desbloqueada. El aviso no muestra personas, tarjetas ni importes. No hay notificaciones con la app cerrada.</p><button className="secondary" onClick={() => { if (enabled) { localStorage.removeItem(key); setEnabled(false); } else void activate(); }}>{enabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}</button>{notice && <p role="status">{notice}</p>}</section>;
}
