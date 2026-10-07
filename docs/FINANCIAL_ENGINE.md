# Motor financiero web

El motor de `packages/domain` opera con centavos enteros y fechas civiles, sin React, DOM, Node, red ni persistencia. Recibe la fecha de cálculo; los casos de uso aplican cambios validados y las pantallas recalculan después de guardarlos o recibir sincronización.

## Reglas conservadas

- Quincena del 15 para vencimientos entre el 15 y el penúltimo día; último día para vencimientos desde ese día hasta el 14 siguiente. Calendario gregoriano, bisiestos y días 29–31 ajustados al mes sin arrastrar el ajuste a los meses posteriores.
- Saldo inicial y conciliaciones históricas, deuda neta/saldo a favor, disponible y movimientos reales. Los programados requieren confirmación y no reducen deuda al avanzar el reloj.
- MSI y distribución del interés total con ajuste final de centavos. MCI por cuota fija, capital fijo o tabla bancaria; tasa mensual e impuesto explícitos, aritmética racional BigInt y redondeo como .NET.
- Deuda libre para financiar, compras nuevas o reclasificadas una sola vez, saldo restante por plan/cuota y protección de pagos, conciliaciones y cierres al editar.
- Pagos ordinarios primero; después cuotas por corte y reparto proporcional entre planes. Las atribuciones explícitas conservan anticipos y detalles bancarios. Sin atribución bancaria, el desglose es un estimado.
- Cortes estimados automáticamente según origen de deuda. El 3 de octubre, una deuda del periodo actual con día 11 corresponde al 11 de octubre. Confirmar guarda el objetivo bancario; los nuevos movimientos no sobrescriben ese importe.
- Vencimiento automático o mes explícito, como Plata: corte 2 de noviembre, pago 2 de diciembre e ingreso del 30 de noviembre.
- Préstamos sin intereses, abonos realizados/programados, ingresos recibidos opcionales y presupuesto del 15/fin de mes con gastos esenciales y reserva.
- Proyecciones hasta el último compromiso. Suponen pagos completos por periodo sin nuevos cargos y nunca generan movimientos reales.
- Resúmenes, comparación bancaria, cierres protegidos y avisos dentro de la aplicación.

Las fracciones de los instantes .NET se conservan como texto para ordenar registros del mismo día sin perder ticks. Los datos antiguos sin instante mantienen un ordinal estable y el criterio de compatibilidad entre colecciones.

## Verificación

Las pruebas comparan todas las instantáneas de ocho escenarios financieros contra `tests/fixtures/financial-reference.v1.json`, obtenida independientemente de .NET. Incluyen 240 fechas de ingreso, 120 cuotas y tres amortizaciones. Se comprueban importaciones idempotentes, propiedad de compras, sobreasignación de cuotas, anulación, pagos programados, conciliación sin doble conteo y cierres.

La coincidencia con la referencia sintética no reemplaza la revisión bancaria de cargos no registrados ni el piloto con la cartera personal. El importe estimado puede diferir del banco por compras, intereses, comisiones o ajustes aún no capturados; se confirma o edita en el corte.

## Reportes y escenarios educativos

`activityReport` resume actividad de todas las tarjetas sin inventar saldo histórico. `periodReport` reconstruye cierres protegidos desde un saldo conocido. `simulatePayoff` compara prioridades mensuales con tasas y mínimos proporcionados explícitamente; usa BigInt y centavos para interés, pagos y saldos. No escribe movimientos, no interpreta el CAT como tasa y no representa el calendario real de un banco. Sus límites y supuestos se muestran en el formulario.
