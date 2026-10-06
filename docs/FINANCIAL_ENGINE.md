# Migración del motor financiero

La primera entrega de F2 incorpora reglas puras en `packages/domain`, sin React, navegador, Node, red ni persistencia. Los cálculos reciben fechas civiles y centavos enteros; no dependen del reloj del dispositivo. La interfaz publicada todavía es la vista previa de F1.

## Reglas incorporadas

- Quincena del 15 para vencimientos entre el 15 y el penúltimo día; quincena del último día para vencimientos desde ese día hasta el 14 siguiente.
- Calendario gregoriano y fechas civiles `YYYY-MM-DD`, incluidos bisiestos y días de corte 29, 30 o 31 en meses cortos. Generación de todas las quincenas hasta el horizonte solicitado.
- Corte anterior y próximo como funciones explícitas. Una deuda del periodo actual registrada el 3 de octubre puede seleccionar el 11 de octubre; la selección definitiva por origen de deuda se integrará al estimador de cortes.
- Vencimiento automático o mes de pago explícito: corte de Plata el 2 de noviembre, vencimiento el 2 de diciembre e ingreso del 30 de noviembre. La anticipación para pagar conserva la quincena correcta.
- MSI e interés total distribuido en cuotas, con el ajuste de centavos en la última cuota.
- MCI por cuota fija, capital fijo o tabla bancaria. Las tasas y el IVA del interés son explícitos; se redondea primero el interés y luego su impuesto como en .NET. Se usa aritmética racional con BigInt para evitar redondeos binarios.
- Validación de fechas, importes, tasas, plazos de 2 a 120 meses y tablas que sumen exactamente el capital. Los resultados usan centavos enteros y los desbordamientos se rechazan.

## Verificación y pendientes

`npm run test` compara las 240 fechas de ingreso, las 120 cuotas del caso de redondeo y las tres tablas de amortización contra `tests/fixtures/financial-reference.v1.json`, exportada independientemente por .NET. También verifica límites del calendario, rechazo de datos inválidos, impuestos, cambio de zona horaria y ausencia de mutaciones a la tabla bancaria.

Estos vectores validan las reglas base. **F2 sigue en curso**: faltan saldos completos, reparto y protección de pagos a planes, edición/división de deuda, cortes estimados/confirmados, préstamos, presupuestos y paridad de los ocho escenarios completos. Después se conectarán los casos de uso, el almacenamiento cifrado y las pantallas; la prueba de Google todavía no sincroniza movimientos financieros.

Entrega verificada con `npm run check`: 19 pruebas unitarias (14 financieras), cuatro pruebas de la herramienta Google, contratos, dependencias, tipos estrictos y build aprobados.
