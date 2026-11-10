import { useEffect, useRef, useState } from 'react';

type SpeechResultEvent = Event & { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechErrorEvent = Event & { error: string };
type SpeechRecognizer = {
  lang: string; onresult: ((event: SpeechResultEvent) => void) | null; onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null; start(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer };

export function CaptureText({ text, change, disabled, onListening }: { text: string; change: (text: string) => void; disabled: boolean; onListening: (listening: boolean) => void }) {
  const [consent, setConsent] = useState(false), [listening, setListening] = useState(false), [error, setError] = useState('');
  const recognition = useRef<SpeechRecognizer | null>(null);
  useEffect(() => () => { const current = recognition.current; if (current) { current.onresult = null; current.onerror = null; current.onend = null; current.abort(); } }, []);
  const Speech = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
  function listen() {
    if (!Speech || !consent || listening) return;
    setError(''); const current = new Speech(); recognition.current = current; current.lang = 'es-MX';
    current.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (!transcript) { setError('No se reconoció ninguna frase. Inténtalo otra vez o escribe el texto.'); return; }
      change(transcript);
    };
    current.onerror = event => setError(`No se pudo usar el reconocimiento de voz (${event.error}). Revisa el permiso del micrófono o escribe el texto.`);
    current.onend = () => { recognition.current = null; setListening(false); onListening(false); };
    try { setListening(true); onListening(true); current.start(); } catch (e) { recognition.current = null; setListening(false); onListening(false); setError(e instanceof Error ? e.message : 'No se pudo iniciar el micrófono.'); }
  }
  return <><label className="field"><span>Describe el movimiento</span><textarea rows={3} maxLength={300} value={text} disabled={disabled || listening} onChange={e => change(e.target.value)} /></label>
    {Speech ? <><label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Acepto usar el reconocimiento de voz del dispositivo o navegador. Puede enviar audio a un proveedor y requerir internet.</span></label>
      <button type="button" className="secondary" disabled={!consent || listening || disabled} onClick={listen}>{listening ? 'Escuchando…' : 'Dictar con micrófono'}</button></> :
      <p className="caption">El reconocimiento de voz no está disponible en esta aplicación o navegador. Puedes usar el dictado del teclado de tu dispositivo; revisa su configuración de privacidad.</p>}
    {error && <p className="alert error" role="alert">{error}</p>}</>;
}
