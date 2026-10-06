# Contratos y referencia financiera web

Los contratos v1 definen trece entidades y revisiones financieras. El motor TypeScript y la sincronizaci?n del producto siguen pendientes. La [referencia financiera](../tests/fixtures/financial-reference.v1.json) es una exportaci?n sint?tica independiente de datos personales; se usa para preservar reglas durante la implementaci?n.

Incluye ocho escenarios: deuda inicial del periodo actual, deuda libre para dividir, edici?n/pagos de MSI/MCI, compra y reclasificaci?n, plazo de Plata, objetivo bancario confirmado, saldo a favor e intereses futuros y pr?stamos/presupuesto. Incluye adem?s 240 fechas de quincena, 120 cuotas y tres amortizaciones. La aplicaci?n no necesita proyectos .NET para compilar ni ejecutar las pruebas de este repositorio.

## Formato de datos v1

Los archivos normativos son JSON Schema 2020-12:

- [operation.schema.json](../contracts/v1/operation.schema.json): operaciones y trece tipos de entidad.
- [batch.schema.json](../contracts/v1/batch.schema.json): lote descifrado de hasta 1000 operaciones.
- [encrypted-block.schema.json](../contracts/v1/encrypted-block.schema.json): envoltura autenticada de un bloque.

El generador [generate-contracts.mjs](../tools/architecture/generate-contracts.mjs) produce los tres archivos. Cambiar un contrato persistido exige una nueva versión y migración explícita. Se rechazan propiedades desconocidas y versiones que el cliente no comprende antes de aplicar cambios.

Los importes son enteros de centavos MXN, dentro del rango seguro de JavaScript. Saldos y cierres admiten valores negativos para representar saldo a favor. Los límites de negocio actuales, relaciones y sumas se validarán además en el dominio: un esquema no comprueba capacidad de deuda, sobrepagos, tabla de amortización ni solapamientos de cierres. Se usarán operaciones decimales exactas para tasas y se comprobará desbordamiento de sumas; no se calcularán intereses con flotantes binarios. Las tasas son porcentajes en cadenas decimales, por ejemplo `"2"` y `"16"`, sin exponente y con hasta ocho decimales.

Las fechas financieras son `YYYY-MM-DD`; no se convertirán a medianoche UTC para determinar el día. Los instantes terminan en `Z`. Se conservará como texto la precisión original de `RegistradoEnUtc`, incluidos siete decimales de .NET: convertirla únicamente a `Date` perdería precisión relevante para ordenar hechos del mismo día. En registros antiguos sin ese instante, `recordedAt` será null y `legacyOrdinal` será obligatorio, conservando posición dentro de la colección original. No se inventará una cronología común entre colecciones; F2 conservará los criterios de compatibilidad del motor actual.

| Entidad | Datos persistidos y criterio |
| --- | --- |
| `card` | Identidad, banco, límite, corte, plazo, color y origen de deuda; saldo separado. |
| `balance` | Ancla inicial o conciliada: disponible, deuda neta, fecha, movimientos incorporados e intereses incorporados. |
| `movement` | Gasto/pago/interés/comisión, fecha, programación, conciliación, corte, atribuciones a cuotas y referencia de importación. |
| `installment` | Capital, plazo, interés, primera cuota, compra original, amortización e intereses ya incorporados. |
| `statement` | Objetivo, mínimo, ya pagado, apartado, estimado/confirmado y pagos incluidos en el importe. |
| `loan`, `loanPayment` | Persona, saldo base, vencimiento, ingreso recibido y abonos reales/programados, sin interés. |
| `income`, `budget` | Ingresos habituales y excepciones por quincena, gastos esenciales y reserva. |
| `reminderPreferences`, `reminderState` | Preferencias y aviso atendido; fecha de posposición null significa atendido sin posponer. |
| `closure` | Importes históricos, comparación bancaria opcional y huella del historial normalizada a hexadecimal minúsculo. |
| `device` | Identidad del dispositivo, etiqueta y retiro lógico; retirarlo no revoca por sí solo una clave copiada. |

Los estados anulado/cancelado se representan mediante revisiones `void`, conservando la última propuesta y su historial. `restore` referencia la revisión anulada y aporta el contenido completo validado. La migración creará una revisión inicial y una anulación posterior cuando corresponda. El saldo base neto incorporará `SaldoAFavorInicial`; totales derivados de movimientos no se volverán a sumar como parte de esa base.

Solo se sincronizan hechos y decisiones persistidas. Cuotas calculadas, deuda actual, cortes puramente proyectados, quincenas y resúmenes se recalculan. Una confirmación bancaria se conserva como `statement` explícito; recalcular no altera su objetivo. IDs nuevos para registros antiguos sin ID se asignarán mediante una estrategia de importación estable en F7. Ingresos/preferencias y presupuestos tendrán identidad lógica única por almacén o fecha, respectivamente; la importación no generará duplicados cada vez.

## Operaciones, dependencias y grupos

`entityId` identifica el registro; `operationId` identifica una revisión inmutable. Una revisión lleva `vaultId`, `deviceId`, `deviceSequence`, padres, dependencias, acción, `updatedAt` y contenido completo. Padres son revisiones de la misma entidad; dependencias pueden pertenecer a otras entidades. Una creación no tiene padres. Una resolución enumera al menos las dos ramas conocidas que resuelve. El contador se asignará transaccionalmente en F3; el reloj sirve para información, no para decidir qué importe gana.

Un comando que cambia varias entidades comparte `groupId`, autor, `groupSize` e índices únicos desde cero. Ejemplos: compra con plan, pago con atribuciones, conciliación con movimientos incorporados. El grupo admite hasta 10000 operaciones y puede cruzar lotes de 1000 y bloques físicos. Ninguna parte se aplica antes de recibir el grupo completo y sus dependencias. La transacción local guardará grupo y outbox juntos; esto aún corresponde a F3.

Se deduplican reintentos por `operationId`. El mismo ID con contenido diferente es un error; almacenes distintos no se mezclan. Orden de llegada o `updatedAt` no sustituyen relaciones causales. Operaciones con padres ausentes quedan pendientes; ciclos, versiones desconocidas y contenido inválido deben diagnosticarse antes de afectar saldos.

## Política de conflictos

| Situación | Política de implementación |
| --- | --- |
| Dos pagos distintos, cada uno con su ID | Conservar ambos; validar juntos sus atribuciones y reglas. |
| Reintento de la misma operación | Aplicar una sola vez. |
| Edición que referencia la revisión vigente | Aplicar si es válida, aunque el reloj sea anterior. |
| Cambios independientes de presentación | Fusión de tres vías contra ancestro común, solo si los campos no se contradicen. |
| Dos cambios financieros del mismo registro | Mantener ambas propuestas; pedir resolución explícita. |
| Anulación frente a edición | Conflicto explícito; no resucitar ni eliminar por fecha. |
| Plan editado mientras otro dispositivo paga cuotas anteriores | Validar dependencias y proteger historial; resolución entre entidades. |
| Dos planes consumen la misma deuda disponible, o dos pagos sobreasignan una cuota | Conflicto financiero conjunto, aunque los IDs sean distintos. |
| Resolución concurrente con una rama todavía desconocida | Conservar el nuevo conflicto; no descartar la rama tardía. |

Importe, fecha, tipo, tarjeta, corte, programación y atribuciones se tratarán como un conjunto financiero coherente. No se compondrá un pago con importe de una propuesta y cuota de otra. Descripción o color pueden fusionarse por separado cuando existe una base común y no hay contradicción. La resolución produce una nueva operación que referencia las ramas; no sobrescribe el historial.

[revisions.mjs](../tools/architecture/revisions.mjs) demuestra deduplicación, causalidad, grupos incompletos y conservación de conflictos. Es un prototipo conservador: dos cabezas conservan el ancestro común cuando es único, o ninguna propuesta aceptada cuando no hay base única. No implementa todavía fusión de campos, validación financiera entre entidades, almacenamiento/outbox, protección de ciclos entre grupos ni el flujo visual de resolución. Esas funciones son F3/F5. El receptor debe validar esquemas antes de invocarlo.

## Bloques cifrados y claves

Cada envoltura identifica versión, almacén, clave, bloque, propósito, algoritmo, IV, texto cifrado y parámetros de derivación. El límite de lectura del prototipo es 1 MiB de texto claro por bloque. AES-256-GCM usa IV aleatorio nuevo de 12 bytes y etiqueta de 16 bytes. La autenticación incluye exactamente esta matriz serializada con `JSON.stringify` y codificada UTF-8:

```text
["paymentplan-encrypted-block-v1", schemaVersion, vaultId, keyId,
 blockId, purpose, algorithm, parameters]
```

`parameters` es null para datos/recuperación, `["PBKDF2-SHA256", iterations, saltBase64]` o `["Argon2id", version, memoryKiB, passes, parallelism, saltBase64]` para envolver la clave de datos con contraseña. Se verifica el contexto esperado antes de descifrar y se rechazan parámetros fuera de límites antes de derivar. El cuerpo de snapshots y el manifiesto de descubrimiento del almacén se especificarán en F3/F5; admitir su propósito no implica que esos formatos estén implementados.

La clave de datos aleatoria se envuelve con una clave derivada de contraseña; una clave de recuperación aleatoria independiente puede envolver la misma clave de datos. Cambiar contraseña no requiere volver a cifrar todos los movimientos. Las pruebas verifican ambos caminos, integridad y límites de recursos. No existe aún interfaz de recuperación. [Web Crypto](https://www.w3.org/TR/webcrypto/), [Argon2 y vector de referencia](https://www.rfc-editor.org/rfc/rfc9106.html).


## Reproducir comprobaciones

```sh
npm ci --ignore-scripts
npm ci --prefix tools/architecture --ignore-scripts
npm run check
npm run test:architecture
```

La referencia financiera es una entrada sint?tica versionada, no una cartera de usuario. Node se usa para desarrollo y CI; Pages sirve solamente JavaScript, CSS, HTML y assets est?ticos.
