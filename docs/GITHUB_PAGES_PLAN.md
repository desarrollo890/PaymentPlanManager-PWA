# Plan de implementaci?n para GitHub Pages

La aplicaci?n ejecutar? sus reglas financieras en el navegador y guardar? localmente una cartera cifrada en IndexedDB. Google Drive appDataFolder servir? para sincronizar operaciones cifradas entre dispositivos. La vista previa actual permite validar la estructura y el despliegue; a?n no implementa el registro financiero ni el almacenamiento de una cartera.

## Funcionalidad prevista

- Tarjetas con l?mite, disponible, deuda inicial, origen de deuda, color, orden por mayor deuda y alertas de cuadre. La deuda a meses forma parte de la deuda total.
- Gastos, pagos, intereses y comisiones reales o programados; correcci?n, anulaci?n y conciliaci?n sin duplicar importes.
- Compras MSI/MCI y divisi?n de deuda existente, proponiendo el saldo libre vigente; amortizaci?n y edici?n que proteja pagos ya atribuidos.
- Cortes estimados autom?ticamente, con confirmaci?n o edici?n bancaria. La deuda del periodo actual corresponde al pr?ximo corte; se preservan los objetivos confirmados.
- Plazo expl?cito entre corte y vencimiento, incluyendo corte el 2 de noviembre y vencimiento el 2 de diciembre.
- Quincena del 15 para vencimientos desde el 15 hasta el pen?ltimo d?a; quincena del ?ltimo d?a para vencimientos desde ese d?a hasta el 14 siguiente, incluidos bisiestos.
- Proyecciones, presupuestos y c?lculos por tarjeta y globales hasta el ?ltimo compromiso; recalcular despu?s de cada movimiento.
- Ingresos del 15 y ?ltimo d?a, gastos esenciales, reserva, pr?stamos personales sin intereses, pago ?nico y abonos.
- Importaci?n/exportaci?n, res?menes al corte y por periodo, avisos, cierres hist?ricos y recuperaci?n.

## Arquitectura

React usa casos de uso en `packages/application`; las reglas residen en `packages/domain` sin React, DOM ni Node. Almacenamiento, cifrado y sincronizaci?n son adaptadores separados. Los datos usan centavos enteros y fechas civiles en America/Mexico_City. Solo se sincronizan hechos y decisiones; saldos y proyecciones se recalculan.

Cada revisi?n tiene identidad inmutable, padres, dependencias y contador por dispositivo. Los comandos que cambian varias entidades forman grupos at?micos, guardados junto con su outbox. Los lotes de Drive son inmutables y cifrados; no se sobrescribe un JSON global. Reintentos no duplican pagos. El reloj no determina qu? importe gana: conservar conflictos financieros y resolverlos expl?citamente.

La clave de datos aleatoria se protege con derivaci?n de contrase?a y una clave de recuperaci?n independiente. AES-256-GCM autentica tambi?n los metadatos. Las pruebas de viabilidad no sustituyen un almacenamiento seguro ni una auditor?a del producto.

## Fases y aceptaci?n

| Fase | Entrega | Condici?n de cierre |
| --- | --- | --- |
| F0 | Contratos, referencia y viabilidad | Validar esquemas, OAuth real, recursos y recuperaci?n en navegadores objetivo. |
| F1 | Workspace y CI | Instalaci?n reproducible, separaci?n de paquetes y CI aprobado. |
| F2 | Motor financiero | Paridad con la referencia sint?tica para saldos, MSI/MCI, cortes, quincenas, pr?stamos y horizonte completo. |
| F3 | IndexedDB y cifrado | Atomicidad de cambios/outbox, bloqueo, migraciones, respaldo y recuperaci?n. |
| F4 | Experiencia PWA completa | Funciones financieras operativas offline, importaci?n/exportaci?n y actualizaci?n sin p?rdida de datos. |
| F5 | Fusi?n y conflictos | Convergencia, idempotencia y coherencia financiera bajo desconexi?n, duplicados y mensajes fuera de orden. |
| F6 | Drive web | Dos navegadores sincronizan sin p?rdida; vinculaci?n de cuenta, expiraci?n y revocaci?n controladas. |
| F7 | Importaci?n y piloto | Previsualizaci?n, cuadre, importaci?n idempotente y recuperaci?n con cartera de prueba. |
| F8 | Publicaci?n funcional | Validaci?n HTTPS en PC/m?vil, recuperaci?n y recorrido completo de usuario. |

La publicaci?n inicial es una vista previa de F1, solicitada antes de terminar la migraci?n. No significa que F8 funcional ni las fases financieras est?n completas. Los proyectos de escritorio, backend y c?digo nativo quedan fuera de este repositorio.
