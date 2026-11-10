import { addDays } from '@paymentplan/domain';

export type QuickKind = 'cardExpense' | 'cardPayment' | 'accountExpense' | 'accountIncome' | 'loanPayment' | 'loanAdvance' | 'loanNew';
export type QuickTarget = { id: string; name: string; kind: 'card' | 'account' | 'loan' };
export type QuickProposal = { kind: QuickKind | ''; targetId: string; amount: string; date: string };

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function interpretQuickCapture(text: string, today: string, targets: QuickTarget[]): QuickProposal {
  const phrase = normalized(text);
  const matches = targets.filter(t => {
    const name = normalized(t.name).trim();
    if (!name) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(phrase);
  });
  const target = matches.length === 1 ? matches[0] : undefined;
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
  return { kind, targetId: kind ? target!.id : '', amount: amountMatch?.[1]?.replace(',', '.') ?? '', date };
}
