// Financial values are integer cents. BigInt keeps intermediate products exact.
export function cents(value: number, signed = false): number {
  if (!Number.isSafeInteger(value) || (!signed && value < 0))
    throw new RangeError('Importe inválido: usa centavos enteros dentro del rango seguro.');
  return value;
}

export function safeInteger(value: bigint): number {
  const result = Number(value);
  return cents(result, true);
}

export function sumCents(values: Iterable<number>): number {
  let total = 0n;
  for (const value of values) total += BigInt(cents(value, true));
  return safeInteger(total);
}

// Matches decimal.Round(..., 2, MidpointRounding.AwayFromZero) in the .NET reference.
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('El divisor debe ser positivo.');
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator * sign;
  return sign * ((absolute / denominator) + (absolute % denominator * 2n >= denominator ? 1n : 0n));
}

export function percentage(value: string): { numerator: bigint; denominator: bigint } {
  if (!/^(?:0|[1-9][0-9]?|100)(?:\.[0-9]{1,8})?$/.test(value))
    throw new RangeError('La tasa debe ser un porcentaje decimal entre 0 y 100, con hasta ocho decimales.');
  const [whole, fraction = ''] = value.split('.');
  const denominator = 100n * 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole! + fraction);
  if (numerator > denominator) throw new RangeError('La tasa no puede superar 100%.');
  return { numerator, denominator };
}
