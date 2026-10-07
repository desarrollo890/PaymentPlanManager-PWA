# Mejoras para planificación y educación financiera

Investigación del 6 de octubre de 2026. La prioridad sigue siendo conocer cuánto pagar por quincena sin perder el detalle de cada tarjeta. La propuesta es explicar los números, comparar escenarios y reducir captura repetitiva, manteniendo datos locales cifrados y sincronización privada.

## Referencias y aplicación al producto

| Referencia | Función documentada | Propuesta propia |
| --- | --- | --- |
| [Actual Budget, programaciones](https://actualbudget.org/docs/schedules/) | Operaciones recurrentes o únicas, anticipación y aprobación manual o automática | En una fase posterior, proponer gastos recurrentes que el usuario confirme; no simular cobros realizados |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) | Presupuestos, categorías, etiquetas, importación y reportes de finanzas personales | Incorporar categorías y límites de gasto conservando el foco en deuda; reglas revisables para clasificación bancaria |
| [Banco de México, glosario](https://contigo.banxico.org.mx/glosario.html) | CAT incorpora componentes del costo de crédito y excluye IVA; amortización negativa describe crecimiento del adeudo | Explicar CAT frente a tasa mensual y detectar presupuestos de simulación que no reducen deuda |
| [CFPB, estrategias de deuda](https://www.consumerfinance.gov/archive/blog/how-reduce-your-debt/) | Priorizar tasas altas o saldos pequeños, mantener mínimos y reasignar pagos liberados | Comparar avalancha y bola de nieve con iguales datos y presupuesto |
| [CONDUSEF, uso del crédito](https://www.condusef.gob.mx/documentos/275553_Cr_dito.pdf) | Fechas de corte/pago y objetivo de evitar intereses | Educación contextual ligada al corte, vencimiento y objetivo confirmado |
| [CONDUSEF, fondo de emergencia](https://revista.condusef.gob.mx/ahorro-general/2024/09/fondo-de-emergencia/) | Incorporar ahorro para imprevistos al presupuesto | Fase posterior: meta separada de la reserva quincenal, saldo realmente ahorrado y aportaciones |

Las propuestas son decisiones de producto a partir de esas referencias, no funciones tomadas de su código. No se incorporan sus servidores, licencias de implementación ni servicios de conexión bancaria. Los contenidos educativos integrados se redactan para esta app, con enlaces a fuentes primarias; los enlaces externos necesitan conexión.

## Primera entrega

Educación breve con preguntas y explicación inmediata; análisis de gastos, comisiones, interés devengado y uso de línea; simulación de reducción de deuda separada de la cartera. El contenido sobre reserva, conciliación, reclasificación de deuda y asignación de quincenas explica las reglas propias del aplicativo.

El simulador trabaja con saldos y mínimos fijos, tasa mensual nominal constante y presupuesto mensual compartido. No usa el CAT como tasa, no mezcla MSI con saldo revolvente, no supone intereses bancarios que no se conocen, ni registra pagos. Sus resultados son escenarios, no un nuevo pago para no generar intereses.

## Orden recomendado de crecimiento

1. Categorías y reglas revisables de importación: saber en qué se gasta y corregir clasificación sin cambiar el movimiento.
2. Operaciones recurrentes propuestas y detección de suscripciones: anticipar gastos sin convertir una programación en pago real.
3. Metas de fondo de emergencia y otras metas de ahorro: distinguir reservar, transferir y acumular; necesita definir origen del efectivo antes de un balance patrimonial.
4. Comparador de financiación a meses: costo total de opciones bancarias, cargos e impuestos explícitos; no recomendar productos por promociones no verificadas.
5. Patrimonio y flujo efectivo: cuentas de efectivo/débito y transferencias propias; exige modelo de cuentas y reglas para evitar contar un pago de tarjeta como gasto otra vez.
6. APK Android: OAuth nativo, almacén seguro y aceptación física; requiere certificado de firma y decisión de distribución del usuario.

No se propone puntaje crediticio, recomendación automática de inversión ni integración de banca abierta en esta fase personal. Cada ampliación persistente requiere contrato versionado, migración, sincronización y respaldo compatibles antes de su publicación.
