import { isNative, NativeAccess } from './native.ts';
import { useEffect, useId, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
export function todayInMexico(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)!.value; return `${get('year')}-${get('month')}-${get('day')}`;
}
export const money = (value: number): string => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value / 100);
export const amount = (value: number): string => (value / 100).toFixed(2);
export const shortDate = (value: string): string => new Intl.DateTimeFormat('es-MX', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
export function parseMoney(value: FormDataEntryValue | null, allowNegative = false): number {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!(allowNegative ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(text)) throw Error('Usa importes con hasta dos decimales, sin separadores de miles.');
  const negative = text.startsWith('-'), [whole, decimal = ''] = text.replace('-', '').split('.');
  const result = Number((BigInt(whole!) * 100n + BigInt(decimal.padEnd(2, '0'))) * (negative ? -1n : 1n));
  if (!Number.isSafeInteger(result)) throw Error('El importe excede el rango admitido.'); return result;
}
export const str = (data: FormData, name: string): string => String(data.get(name) ?? '');
export const optionalMoney = (data: FormData, name: string, signed = false): number | null => str(data, name).trim() ? parseMoney(data.get(name), signed) : null;
export function download(name: string, content: string, type = 'application/json'): void {
  if (isNative) { void NativeAccess.saveDocument({ name, content, mime: type }).catch(error => window.dispatchEvent(new CustomEvent('paymentplan-native-error', { detail: error instanceof Error ? error.message : 'No se pudo guardar el archivo.' }))); return; }
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function csvCell(value: string | number): string {
  let text = String(value); if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"';
}
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    home: 'm3 10 9-7 9 7v10H14v-7h-4v7H3Z', card: 'M3 5h18v14H3ZM3 9h18M7 15h4', activity: 'M3 12h4l3-8 4 16 3-8h4',
    calendar: 'M3 5h18v16H3ZM7 3v4m10-4v4M3 11h18M7 15h2m6 0h2', settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a7 7 0 0 1 14 0v3m1-17a4 4 0 0 1 0 8m1 3a5 5 0 0 1 4 5v1',
    report: 'M5 3h11l3 3v15H5ZM9 8h5m-5 4h6m-6 4h6', arrow: 'M5 12h14m-5-5 5 5-5 5', shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',
    'panel-collapse': 'M3 4h18v16H3ZM8 4v16m8-12-4 4 4 4', 'panel-expand': 'M3 4h18v16H3ZM8 4v16m4-12 4 4-4 4',
    plus: 'M12 5v14M5 12h14', lock: 'M6 10h12v11H6ZM8 10V6a4 4 0 1 1 8 0v4', sync: 'M20 8a8 8 0 0 0-14-4L3 7m0-5v5h5M4 16a8 8 0 0 0 14 4l3-3m0 5v-5h-5',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.card} /></svg>;
}
export function Field({ label, name, value, type = 'text', required = true, hint, min, max, readOnly = false }: {
  label: string; name: string; value?: string | number | undefined; type?: string; required?: boolean; hint?: string; min?: string | number; max?: string | number; readOnly?: boolean;
}) {
  return <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={value} required={required} min={min} max={max} step={type === 'number' ? 'any' : undefined}
    inputMode={type === 'number' ? 'decimal' : undefined} readOnly={readOnly} maxLength={type === 'text' ? 300 : undefined} />{hint && <small>{hint}</small>}</label>;
}
export function MoneyField({ label, name, value = 0, required = true, hint }: { label: string; name: string; value?: number | null; required?: boolean; hint?: string }) {
  return <label className="field"><span>{label} <small>MXN</small></span><input name={name} inputMode="decimal" defaultValue={value === null ? '' : amount(value)} required={required} maxLength={18} />{hint && <small>{hint}</small>}</label>;
}
export function SelectField({ label, name, value, children }: { label: string; name: string; value?: string | undefined; children: ReactNode }) {
  return <label className="field"><span>{label}</span><select name={name} defaultValue={value}>{children}</select></label>;
}
export function Check({ name, label, checked = false }: { name: string; label: string; checked?: boolean | undefined }) {
  return <label className="check"><input type="checkbox" name={name} defaultChecked={checked} /><span>{label}</span></label>;
}
export function Dialog({ title, children, close, className = '' }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={close} aria-label="Cerrar ventana">×</button></div>{children}</dialog>;
}
export function FormDialog({ title, children, close, submit, busy = false, error = '', onInput }: {
  title: string; children: ReactNode; close: () => void; submit: (data: FormData) => void; busy?: boolean; error?: string; onInput?: (data: FormData) => void;
}) {
  function handle(event: FormEvent<HTMLFormElement>) { event.preventDefault(); submit(new FormData(event.currentTarget)); }
  return <Dialog title={title} close={close}><form onSubmit={handle} onInput={event => onInput?.(new FormData(event.currentTarget))}><div className="form-grid">{children}</div>{error && <p role="alert" className="alert error">{error}</p>}
    <div className="dialog-actions"><button type="button" className="secondary" onClick={close}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></div></form></Dialog>;
}
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <section className="empty-panel"><span className="empty-icon"><Icon name="card" size={30} /></span><h2>{title}</h2><p>{text}</p>{action}</section>;
}
