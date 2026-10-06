import { useEffect, useState } from 'react';
import { foundation } from '@paymentplan/application';

const sections = [
  { id: 'inicio', label: 'Inicio', icon: 'home', title: 'Tu espacio financiero', subtitle: 'Todo lo que debes. Un plan para pagarlo.' },
  { id: 'tarjetas', label: 'Tarjetas', icon: 'card', title: 'Tus tarjetas', subtitle: 'Límites, saldos y planes, en un solo lugar.' },
  { id: 'movimientos', label: 'Movimientos', icon: 'activity', title: 'Tus movimientos', subtitle: 'Un historial claro de gastos, pagos e intereses.' },
  { id: 'presupuesto', label: 'Presupuesto', icon: 'calendar', title: 'Tu presupuesto', subtitle: 'Organiza tus pagos con los ingresos de cada quincena.' },
  { id: 'preferencias', label: 'Preferencias', icon: 'settings', title: 'A tu manera', subtitle: 'Tu información y tus dispositivos, bajo tu control.' },
] as const;
type SectionId = (typeof sections)[number]['id'];
function readSection(): SectionId {
  const value = window.location.hash.slice(2);
  return sections.find(section => section.id === value)?.id ?? 'inicio';
}
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
    card: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM3 9h18M7 15h4',
    activity: 'M3 12h4l3-8 4 16 3-8h4',
    calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM7 3v4m10-4v4M3 11h18M7 15h2m6 0h2',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.card} /></svg>;
}
function CardIllustration() {
  return <div className="card-illustration" aria-hidden="true">
    <div className="illustration-back" />
    <div className="illustration-front"><span className="chip" /><span className="card-lines">•••• &nbsp; ••••</span><span className="card-brand">TU PRÓXIMO PASO</span><span className="card-circle one" /><span className="card-circle two" /></div>
  </div>;
}

export function App() {
  const [selected, setSelected] = useState<SectionId>(readSection);
  useEffect(() => {
    const update = () => setSelected(readSection());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const section = sections.find(item => item.id === selected) ?? sections[0];
  return <div className="app-layout">
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Ir al contenido</a>
    <aside className="sidebar">
      <a className="brand" href="#/inicio" aria-label="PaymentPlan, inicio"><span className="brand-symbol">P</span><span>Payment<span className="brand-light">Plan</span></span></a>
      <p className="nav-label">MI ESPACIO</p>
      <nav aria-label="Navegación principal">{sections.map(item => <a key={item.id} href={`#/${item.id}`} className={`nav-item ${item.id === selected ? 'active' : ''}`} aria-current={item.id === selected ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span></a>)}</nav>
      <div className="sidebar-note"><Icon name="shield" /><p>Un espacio personal.<br /><strong>Tu información, tu control.</strong></p></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span>Finanzas personales <span className="separator">/</span> <strong>{section.label}</strong></span><span className="status-pill"><span className="status-dot" />En preparación</span></header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading"><div><p className="eyebrow">HAZ ESPACIO PARA TUS PLANES</p><h1>{section.title}</h1><p className="subtitle">{section.subtitle}</p></div><span className="currency-tag">{foundation.currency}</span></div>
        <div className="preparation-note" role="note"><span className="note-marker">i</span><p>Esta nueva versión está en preparación. Por ahora, sigue registrando tus operaciones en la aplicación actual.</p></div>
        {selected === 'inicio' ? <>
          <section className="welcome-panel" aria-labelledby="welcome-title"><div className="welcome-copy"><span className="small-tag">UN COMIENZO MÁS CLARO</span><h2 id="welcome-title">Tu cartera<br />empieza aquí.</h2><p>Reúne tus tarjetas, entiende tu deuda y organiza cuánto pagar en cada quincena.</p><a className="primary-link" href="#/tarjetas">Explorar mi espacio <Icon name="arrow" size={18} /></a><span className="welcome-footnote">Sin saldos de ejemplo. Un espacio para tus propios números.</span></div><CardIllustration /></section>
          <section className="next-section" aria-labelledby="next-title"><div className="section-heading"><h2 id="next-title">Todo conectado con tu quincena</h2><span>Así se organizará tu información</span></div><div className="feature-grid"><article><span className="feature-icon"><Icon name="card" /></span><h3>Tu deuda, completa</h3><p>Disponible, deuda total y saldo a meses por cada tarjeta.</p></article><article><span className="feature-icon"><Icon name="calendar" /></span><h3>Un plan a tiempo</h3><p>Pagos alineados al 15 y al último día del mes.</p></article><article><span className="feature-icon"><Icon name="activity" /></span><h3>Cada movimiento cuenta</h3><p>Gastos y abonos que actualizarán tu panorama financiero.</p></article></div></section>
        </> : selected === 'preferencias' ? <section className="empty-panel settings-panel"><span className="empty-icon"><Icon name="shield" size={30} /></span><h2>Tu espacio, en cada dispositivo</h2><p>La sincronización con Google Drive se incorporará más adelante. Google no será necesario para registrar y consultar tus finanzas en el dispositivo.</p><div className="settings-row"><span>Google Drive</span><span className="neutral-tag">Sin conectar</span></div><div className="settings-row"><span>Zona de tus fechas financieras</span><strong>{foundation.timeZone}</strong></div><p className="small-print">El almacenamiento local y el registro financiero aún están en preparación.</p></section> : <section className="empty-panel"><span className="empty-icon"><Icon name={section.icon} size={30} /></span><h2>{selected === 'tarjetas' ? 'Un lugar para todas tus tarjetas' : selected === 'movimientos' ? 'Cada registro tendrá su lugar' : 'Tu próxima quincena, más clara'}</h2><p>{selected === 'tarjetas' ? 'El registro de tarjetas y sus saldos estará disponible en una próxima etapa.' : selected === 'movimientos' ? 'Aquí podrás consultar gastos, pagos, intereses y abonos cuando el registro esté disponible.' : 'Aquí podrás organizar tus ingresos, reservas y compromisos cuando el cálculo financiero esté disponible.'}</p><a className="text-link" href="#/inicio">Volver al inicio <Icon name="arrow" size={16} /></a></section>}
        <footer>PaymentPlan <span>Hecho para planear con calma.</span></footer>
      </main>
    </div>
  </div>;
}
