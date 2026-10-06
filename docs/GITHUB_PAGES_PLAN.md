# Plan de implementación para GitHub Pages

La implementación financiera, la cartera cifrada en IndexedDB y la sincronización con Drive están conectadas a la PWA. El código se comprueba automáticamente con datos sintéticos; las pruebas de cuenta real, teléfono físico y cuadre personal se mantienen abiertas en el seguimiento. Las condiciones de aceptación de este plan siguen vigentes.

## Funcionalidad prevista

- Tarjetas con límite, disponible, deuda inicial, origen de deuda, color, orden por mayor deuda y alertas de cuadre. La deuda a meses forma parte de la deuda total.
- Gastos, pagos, intereses y comisiones reales o programados; corrección, anulación y conciliación sin duplicar importes.
- Compras MSI/MCI y división de deuda existente, proponiendo el saldo libre vigente; amortización y edición que proteja pagos ya atribuidos.
- Cortes estimados automáticamente, con confirmación o edición bancaria. La deuda del periodo actual corresponde al próximo corte; se preservan los objetivos confirmados.
- Plazo explícito entre corte y vencimiento, incluyendo corte el 2 de noviembre y vencimiento el 2 de diciembre.
- Quincena del 15 para vencimientos desde el 15 hasta el penúltimo día; quincena del último día para vencimientos desde ese día hasta el 14 siguiente, incluidos bisiestos.
- Proyecciones, presupuestos y cálculos por tarjeta y globales hasta el último compromiso; recalcular después de cada movimiento.
- Ingresos del 15 y último día, gastos esenciales, reserva, préstamos personales sin intereses, pago único y abonos.
- Importación/exportación, resúmenes al corte y por periodo, avisos, cierres históricos y recuperación.

## Arquitectura

React usa casos de uso en `packages/application`; las reglas residen en `packages/domain` sin React, DOM ni Node. Almacenamiento, cifrado y sincronización son adaptadores separados. Los datos usan centavos enteros y fechas civiles en America/Mexico_City. Solo se sincronizan hechos y decisiones; saldos y proyecciones se recalculan.

Cada revisión tiene identidad inmutable, padres, dependencias y contador por dispositivo. Los comandos que cambian varias entidades forman grupos atómicos, guardados junto con su outbox. Los lotes de Drive son inmutables y cifrados; no se sobrescribe un JSON global. Reintentos no duplican pagos. El reloj no determina qué importe gana: conservar conflictos financieros y resolverlos explícitamente.

La clave de datos aleatoria se protege con derivación de contraseña y una clave de recuperación independiente. AES-256-GCM autentica también los metadatos. Las pruebas de viabilidad no sustituyen un almacenamiento seguro ni una auditoría del producto.

## Fases y aceptación

| Fase | Entrega | Condición de cierre |
| --- | --- | --- |
| F0 | Contratos, referencia y viabilidad | Validar esquemas, OAuth real, recursos y recuperación en navegadores objetivo. |
| F1 | Workspace y CI | Instalación reproducible, separación de paquetes y CI aprobado. |
| F2 | Motor financiero | Paridad con la referencia sintética para saldos, MSI/MCI, cortes, quincenas, préstamos y horizonte completo. |
| F3 | IndexedDB y cifrado | Atomicidad de cambios/outbox, bloqueo, migraciones, respaldo y recuperación. |
| F4 | Experiencia PWA completa | Funciones financieras operativas offline, importación/exportación y actualización sin pérdida de datos. |
| F5 | Fusión y conflictos | Convergencia, idempotencia y coherencia financiera bajo desconexión, duplicados y mensajes fuera de orden. |
| F6 | Drive web | Dos navegadores sincronizan sin pérdida; vinculación de cuenta, expiración y revocación controladas. |
| F7 | Importación y piloto | Previsualización, cuadre, importación idempotente y recuperación con cartera de prueba. |
| F8 | Publicación funcional | Validación HTTPS en PC/móvil, recuperación y recorrido completo de usuario. |

La publicación inicial es una vista previa de F1, solicitada antes de terminar la migración. No significa que F8 funcional ni las fases financieras están completas. Los proyectos de escritorio, backend y código nativo quedan fuera de este repositorio.
