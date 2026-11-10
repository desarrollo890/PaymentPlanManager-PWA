import { addDays } from '@paymentplan/domain';

export type QuickKind = 'cardExpense' | 'cardPayment' | 'accountExpense' | 'accountIncome' | 'loanPayment' | 'loanAdvance' | 'loanNew';
export type QuickTarget = { id: string; name: string; kind: 'card' | 'account' | 'loan' };
export type QuickProposal = { kind: QuickKind | ''; targetId: string; amount: string; date: string; description: string };

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function interpretQuickCapture(text: string, today: string, targets: QuickTarget[]): QuickProposal {
  let phrase = '';
  const positions: { start: number; end: number }[] = [];
  for (let i = 0; i < text.length;) {
    const character = String.fromCodePoint(text.codePointAt(i)!);
    const start = i; i += character.length;
    const part = normalized(character);
    if (!part && positions.length) positions[positions.length - 1]!.end = i;
    phrase += part;
    for (let n = 0; n < part.length; n++) positions.push({ start, end: i });
  }
  const matches = targets.flatMap(t => {
    const name = normalized(t.name).trim();
    if (!name) return [];
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...phrase.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'))]
      .map(m => ({ target: t, start: m.index, end: m.index + m[0].length }));
  });
  const longest = matches.filter(m => !matches.some(other => other.start <= m.start && other.end >= m.end &&
    (other.start < m.start || other.end > m.end)));
  const matchedTargets = [...new Map(longest.map(m => [m.target.id, m.target])).values()];
  const target = matchedTargets.length === 1 ? matchedTargets[0] : undefined;
  const verb = /\b(?:gaste|compre|pague|abone|recibi|ingrese|deposit[e]|me presto|presto)\b/.exec(phrase);
  const amountMatch = verb ? /^\s*(?:\$|de\s+)?\s*(\d+(?:[.,]\d{1,2})?)(?![\d.,])/.exec(phrase.slice(verb.index + verb[0].length)) : null;
  let kind: QuickKind | '' = '';
  if (target && verb) {
    if (target.kind === 'card' && /^(gaste|compre)$/.test(verb[0])) kind = 'cardExpense';
    else if (target.kind === 'card' && /^(pague|abone)$/.test(verb[0])) kind = 'cardPayment';
    else if (target.kind === 'account' && /^(gaste|compre|pague)$/.test(verb[0])) kind = 'accountExpense';
    else if (target.kind === 'account' && /^(recibi|ingrese|deposite)$/.test(verb[0])) kind = 'accountIncome';
    else if (target.kind === 'loan' && /^(pague|abone)$/.test(verb[0])) kind = 'loanPayment';
    else if (target.kind === 'loan' && /^(me presto|presto)$/.test(verb[0])) kind = 'loanAdvance';
  }
  const iso = phrase.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  const otherDate = /\b(anteayer|manana|pasado|pasada|lunes|martes|miercoles|jueves|viernes|sabado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\d{1,2}[/-]\d{1,2})\b/.test(phrase.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ''));
  const date = otherDate || iso.length > 1 || (iso.length && /\b(?:hoy|ayer)\b/.test(phrase)) || (/\bhoy\b/.test(phrase) && /\bayer\b/.test(phrase)) ? '' :
    iso[0] ?? (/\bayer\b/.test(phrase) ? addDays(today, -1) : today);
  const spans = longest.map(m => ({ start: m.start, end: m.end }));
  if (verb) {
    spans.push({ start: verb.index, end: verb.index + verb[0].length + (amountMatch?.[0].length ?? 0) });
    if (!target && verb[0] === 'me presto') spans.push({ start: 0, end: verb.index });
  }
  const dateWords = /\b(?:hoy|ayer|\d{4}-\d{2}-\d{2})\b/g;
  for (const match of phrase.matchAll(dateWords)) spans.push({ start: match.index, end: match.index + match[0].length });
  const removed = Array<boolean>(text.length).fill(false);
  for (const span of spans) {
    const start = positions[span.start]?.start, end = positions[span.end - 1]?.end;
    if (start !== undefined && end !== undefined) for (let i = start; i < end; i++) removed[i] = true;
  }
  const description = [...text].reduce((result, character) => {
    const position = result.offset; result.offset += character.length;
    result.text += removed[position] ? ' ' : character;
    return result;
  }, { text: '', offset: 0 }).text.replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:en|de|del|a|al|con|por|para|el|la)(?:\s+|$))+/iu, '')
    .replace(/(?:(?:^|\s+)(?:en|de|del|a|al|con|por|para|el|la))+$/iu, '')
    .replace(/^[\s,.:;]+|[\s,.:;]+$/g, '').trim();
  return { kind, targetId: kind ? target!.id : '', amount: amountMatch?.[1]?.replace(',', '.') ?? '', date, description };
}
