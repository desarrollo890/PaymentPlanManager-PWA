import { readCsv } from '@paymentplan/application';
export interface Sheet { readonly name: string; readonly rows: string[][]; readonly dateSystem?: '1900' | '1904' }
function xml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('El Excel contiene declaraciones XML no admitidas.');
  const result = new DOMParser().parseFromString(text, 'application/xml'); if (result.querySelector('parsererror')) throw Error('El Excel contiene XML inválido.'); return result;
}
export async function readBankFile(file: File): Promise<Sheet[]> {
  if (file.size > 20_000_000) throw Error('Selecciona un archivo de hasta 20 MB.');
  if (file.name.toLowerCase().endsWith('.csv')) return [{ name: 'CSV', rows: readCsv(await file.text()) }];
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw Error('Selecciona CSV o Excel .xlsx; convierte .xls a CSV.');
  const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer), entries = new Map<string, { offset: number; size: number; expanded: number; method: number }>();
  let end = -1, expanded = 0;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw Error('Archivo Excel ZIP inválido.');
  const count = view.getUint16(end + 10, true); let at = view.getUint32(end + 16, true);
  if (count > 3000) throw Error('El Excel tiene demasiados componentes.');
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw Error('Índice ZIP inválido.');
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), length = view.getUint32(at + 24, true), nameSize = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    if (size === 0xffffffff || length === 0xffffffff || (view.getUint16(at + 8, true) & 1) || at + 46 + nameSize + extra + comment > end) throw Error('Excel cifrado o ZIP64 no admitido.');
    const name = new TextDecoder().decode(bytes.slice(at + 46, at + 46 + nameSize)); expanded += length;
    if (expanded > 30_000_000 || length > 10_000_000 || entries.has(name)) throw Error('El contenido expandido del Excel excede el límite o tiene entradas repetidas.');
    entries.set(name, { offset: view.getUint32(at + 42, true), size, expanded: length, method }); at += 46 + nameSize + extra + comment;
  }
  async function read(name: string): Promise<string> {
    const entry = entries.get(name); if (!entry) throw Error('Falta un componente del Excel.'); const at = entry.offset;
    if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) throw Error('Entrada ZIP inválida.');
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true); if (start + entry.size > bytes.length) throw Error('Entrada ZIP truncada.');
    let content = bytes.slice(start, start + entry.size);
    if (entry.method === 8) {
      let stream: DecompressionStream; try { stream = new DecompressionStream('deflate-raw'); } catch { throw Error('Este navegador no puede leer XLSX. Exporta el archivo a CSV.'); }
      const reader = new Blob([content]).stream().pipeThrough(stream).getReader(), chunks: Uint8Array[] = []; let total = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > entry.expanded || total > 10_000_000) throw Error('Excel con expansión inválida.'); chunks.push(part.value); } } finally { await reader.cancel().catch(() => {}); }
      content = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
    } else if (entry.method !== 0) throw Error('Compresión Excel no admitida.');
    if (content.length !== entry.expanded) throw Error('El tamaño de un componente Excel no coincide.'); return new TextDecoder().decode(content);
  }
  const shared = entries.has('xl/sharedStrings.xml') ? [...xml(await read('xl/sharedStrings.xml')).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sheets: Sheet[] = [];
  const dateSystem = entries.has('xl/workbook.xml') && ['1', 'true'].includes(xml(await read('xl/workbook.xml')).getElementsByTagName('workbookPr')[0]?.getAttribute('date1904') ?? '') ? '1904' : '1900';
  for (const name of [...entries.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()) {
    const rows: string[][] = [];
    for (const row of [...xml(await read(name)).getElementsByTagName('row')]) {
      const cells: string[] = [];
      for (const cell of [...row.getElementsByTagName('c')]) {
        const address = cell.getAttribute('r')?.match(/^([A-Z]+)\d+$/)?.[1]; if (!address) throw Error('Celda Excel sin dirección.');
        let column = 0; for (const letter of address) column = column * 26 + letter.charCodeAt(0) - 64;
        if (column > 100) throw Error('Se admiten hasta 100 columnas.');
        const value = cell.getElementsByTagName('v')[0]?.textContent ?? '', type = cell.getAttribute('t');
        const text = type === 's' ? shared[Number(value)] : type === 'inlineStr' ? [...cell.getElementsByTagName('t')].map(t => t.textContent).join('') : value;
        if (text === undefined || text.length > 10000) throw Error('Texto Excel inválido o demasiado largo.'); cells[column - 1] = text;
      }
      if (cells.some(c => c.trim())) rows.push(Array.from({ length: cells.length }, (_, i) => cells[i] ?? '')); if (rows.length > 10001) throw Error('Se admiten hasta 10 000 filas.');
    }
    sheets.push({ name: name.split('/').at(-1)!, rows, dateSystem });
  }
  if (!sheets.length) throw Error('No se encontraron hojas en el Excel.'); return sheets;
}
