# Contratos y almacenamiento web v1

Los contratos normativos son JSON Schema 2020-12. El producto implementa su validación, revisiones causales, persistencia cifrada y transporte. Los prototipos de `tools/architecture` siguen separados. Cambiar un contrato persistido exige una versión nueva y migración explícita.

- [operation.schema.json](../contracts/v1/operation.schema.json): trece entidades y revisiones.
- [batch.schema.json](../contracts/v1/batch.schema.json): hasta 1000 operaciones por lote físico.
- [encrypted-block.schema.json](../contracts/v1/encrypted-block.schema.json): envoltura cifrada y metadatos autenticados.

El [generador normativo](../tools/architecture/generate-contracts.mjs) produce los esquemas. Los scripts de workspace generan tipos y datos de validación; CI verifica que coincidan. El validador de navegador interpreta solo los criterios usados por estos contratos, sin generar o ejecutar código. Las pruebas comparan decisiones con Ajv para acciones, cargas financieras y mutaciones inválidas.

## Datos

| Entidad | Hechos persistidos |
| --- | --- |
| card | Banco, nombre, límite, corte/vencimiento, color y origen de deuda. |
| balance | Ancla inicial/conciliada, deuda neta, disponible e IDs de movimientos incorporados. |
| movement | Gasto/pago/interés/comisión, programación, conciliación, corte y atribuciones. |
| installment | Capital, interés, meses, fechas, compra, amortización e interés incorporado. |
| statement | Objetivo, mínimo, pagado inicial, apartado, origen estimado/confirmado y pagos incluidos. |
| loan / loanPayment | Persona, capital, saldo, vencimiento y abonos sin interés. |
| income / budget | Ingresos habituales y excepciones por quincena, gastos y reserva. |
| reminderPreferences / reminderState | Preferencias y avisos atendidos/pospuestos. |
| closure | Importes históricos, comparación bancaria y huella del historial. |
| device | Contrato de identidad/etiqueta/retiro; la sesión usa una identidad local, sin interfaz de retiro remoto. |

Importes en centavos enteros seguros de JavaScript; las sumas rechazan desbordamientos. Las tasas son porcentajes como cadenas decimales, con hasta ocho decimales, sin exponente. El motor usa BigInt/racionales para intereses y redondeo. Los saldos negativos representan saldo a favor. La deuda a meses no se suma dos veces a la deuda total.

Fechas económicas `YYYY-MM-DD` e instantes UTC terminados en `Z`. Se conserva la precisión de los instantes .NET y se normaliza solo su comparación; no se convierten a `Date` para ordenar ticks. Registros antiguos sin instante tienen ordinal estable. Los cálculos no dependen de la zona horaria del dispositivo.

## Revisiones y atomicidad

`entityId` identifica el registro y `operationId` una revisión inmutable. Incluye padres de la misma entidad, dependencias de otras entidades, autor, secuencia del dispositivo y acción. El reloj informa; no elige un ganador financiero.

Acciones `create`, `replace`, `void`, `restore` y `resolve`. Una resolución enumera las ramas observadas; las ramas desconocidas no se descartan. Una importación de un registro anulado crea primero su carga histórica y después un tombstone. Los IDs iguales con contenido diferente son errores; los reintentos exactos se deduplican.

Un comando puede contener hasta 10 000 revisiones en un grupo atómico y cruzar lotes de 1000 operaciones. Los lotes se dividen además por tamaño para mantener el bloque claro bajo 1 MiB. IndexedDB guarda todos los bloques, el contador y el outbox en la misma transacción CAS. Ninguna parte de un grupo recibido se materializa antes de completar el grupo y sus dependencias.

La cartera admite hasta 100 000 operaciones en esta versión. No hay compactación/snapshots de producto. Se rechazan versiones no comprendidas y ciclos; padres ausentes quedan pendientes para la siguiente sincronización.

## Fusión y coherencia

Cambios financieros concurrentes del mismo registro conservan propuestas y ancestro aceptado. Descripción/color pueden fusionarse por campos si existe una base común y no hay contradicción. No se combina el importe de una propuesta con la cuota de otra. Dos movimientos nuevos con IDs diferentes se conservan ambos.

El dominio comprueba capacidad de deuda, propiedad de compras, sumas/atribuciones, capital de préstamos, cortes repetidos y cierres. La aplicación detecta edición de planes/préstamos concurrente con pagos y cambios del historial cerrado. La revisión permite elegir versiones, conservar/revertir una corrección revisada o anular un registro preservando el historial. Una decisión no omite la validación financiera: si sigue habiendo incoherencia, la edición continúa bloqueada.

## Cifrado y descubrimiento

`paymentplan-vault-v1` identifica la cabecera pública: cartera, clave, fecha y dos envolturas de la misma clave de datos aleatoria. Una usa contraseña y otra una clave de recuperación independiente de 32 bytes. AES-256-GCM utiliza IV nuevo de 12 bytes y tag de 16 bytes. La clave de datos se importa como CryptoKey no extraíble y permanece en memoria.

La envoltura de contraseña usa PBKDF2-SHA256: 600 000 iteraciones y sal aleatoria de 16 bytes. Se rechazan valores fuera de 600 000–2 000 000 antes de derivar. Argon2id está definido y probado en el prototipo, pero la PWA no acepta esa derivación en sus cabeceras de producto.

AAD exacto, serializado con JSON.stringify y UTF-8:

```text
["paymentplan-encrypted-block-v1", schemaVersion, vaultId, keyId,
 blockId, purpose, algorithm, parameters]
```

`parameters` es null para lotes/recuperación o `["PBKDF2-SHA256", iterations, saltBase64]` para la contraseña. El contexto de cartera, clave, bloque y propósito se verifica antes de aceptar datos. La lectura clara se limita a 1 MiB por bloque.

Drive guarda lotes y cabeceras como archivos inmutables en appDataFolder, con metadatos de identificación sin nombres financieros. No se sobrescribe un JSON global. Un upload se reconoce solo después de éxito; una respuesta perdida conserva el outbox y el siguiente listado evita duplicación. La sincronización nunca publica cargas claras o tokens.

Cambiar contraseña vuelve a envolver la clave; los datos conservan su cifrado. Las copias antiguas de la cabecera o claves siguen pudiendo desbloquear sus datos. El formato de respaldo `paymentplan-encrypted-backup-v1` incluye cabecera y bloques autenticados; se verifica antes de fusionar.

## Referencia y aceptación

La referencia .NET sintética cubre ocho escenarios completos, 240 quincenas, 120 cuotas y tres amortizaciones. Los scripts prueban dos dispositivos aislados con IndexedDB y REST de Drive simulado. La [aceptación personal](PERSONAL_ACCEPTANCE.md) requiere la cuenta real, el teléfono y el cuadre de datos del usuario.
