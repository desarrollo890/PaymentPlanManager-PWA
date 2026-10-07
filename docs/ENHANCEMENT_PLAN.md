# Plan de evolución y seguimiento

Fecha: 7 de octubre de 2026. El usuario autorizó revisión, documentación y desarrollo autónomo. E0–E6 están implementadas. E7 entrega proyecto Android, OAuth nativo y APK firmada para uso personal; falta su aceptación física en el teléfono. Los contratos anteriores y cálculos financieros se conservan.

| Etapa | Entregable | Criterio de terminación |
| --- | --- | --- |
| E0 Equivalencia | Matriz de funciones; omisiones corregidas; restricciones documentadas | Pruebas .NET, referencia financiera, comandos e interfaz PC/móvil aprobados |
| E1 Aprender | Lecciones offline, preguntas, fuentes y contexto de faltante | Respuestas correctas verificadas; sin envío de respuestas ni persistencia en claro |
| E2 Análisis | Rango y tarjeta; gastos, costo y uso de línea | Centavos conciliados con actividad; sin duplicar compras a meses; sin desbordamiento móvil |
| E3 Simulador | Avalancha/bola de nieve, tabla, gráfico y CSV | Conservación de centavos, mínimos, liberación de pagos, límites e insuficiencia probados; no modifica cartera |
| E4 Publicación | Documentación, revisión de secretos, commit/push y GitHub Pages | CI aprobada y recorrido sintético de la URL publicada |
| E5 Categorías | Contratos v2, clasificación manual, reglas revisables y límites por quincena | Implementadas; compatibilidad, respaldos y recorridos PC/móvil verificados |
| E6 Recurrencias y metas | Propuestas idempotentes, efectivo/débito, transferencias y metas respaldadas | Implementadas; conservación de dinero, reservas, conflictos y pagos vinculados verificados |
| E7 Android nativo | APK personal firmada, OAuth nativo, Keystore y selector de documentos | Compilación, lint y firma verificados; cliente Google configurado por el usuario; aceptación física pendiente |

## Arquitectura de la entrega

Los reportes y la simulación son funciones puras del dominio. La interfaz transforma cadenas a centavos y muestra resultados. Las escrituras continúan en comandos validados y sesiones cifradas. El contrato v1 permanece congelado. E5–E7 usan entidades v2 y lotes mixtos, manteniendo el contenedor cifrado y la recuperación; todos los dispositivos deben actualizarse antes de sincronizar las extensiones.

Las atribuciones cambian únicamente el desglose de un pago; eliminación usa anulaciones causales en grupo; cierres conservan huella del historial; la importación advierte coincidencias sin decidir automáticamente que dos cargos distintos son uno. Las notificaciones solo almacenan en claro una preferencia booleana por dispositivo, sin información financiera; se desactivan al bloquear la cartera.

## Comprobaciones y aceptación

La suite conserva los ocho escenarios .NET y agrega eliminación atómica, restricciones de préstamo, atribución múltiple conciliada, resumen sin saldo inicial, importación con filas inválidas y coincidencias, y conservación exacta en simulación. El recorrido de navegador prueba formularios y consulta offline en PC y móvil, incluyendo las nuevas secciones.

El cuadre personal de importación fue aprobado por el usuario. La confirmación final del conflicto en dos dispositivos sigue pendiente de una respuesta específica; no bloquea estas mejoras. Las pruebas automáticas emplean únicamente carteras sintéticas y Drive simulado. Ninguna verificación automática equivale a auditoría independiente de seguridad.

## Estado de la primera entrega

E0–E4 implementadas y verificadas. Comprobaciones: suite anterior .NET aprobada, 62 pruebas unitarias PWA, cuatro pruebas Google, 17 de arquitectura y recorridos sintéticos de PC/móvil. Se comprobó la equivalencia de fechas Excel 1900/1904 y se revisaron capturas de educación y simulación. [CI y publicación aprobadas](https://github.com/desarrollo890/PaymentPlanManager-PWA/actions/runs/37578055635), implementación `59f6ba1`; el recorrido PC/móvil también pasó contra la URL HTTPS publicada. El estado actualizado de E5–E7 se detalla en la segunda entrega.

## Segunda entrega: 7 de octubre de 2026

El usuario autorizó E5–E7 y eligió efectivo/débito con metas vinculadas y APK de instalación personal. E5 implementa categorías, reglas revisables y límites por quincena; E6, propuestas recurrentes idempotentes y cuentas/transferencias/metas respaldadas. Los contratos v2 amplían las entidades conservando v1, cifrado y recuperación. E7 incluye proyecto Android, autorización nativa Google, almacenamiento temporal protegido por Keystore, documentos por selector y compilación CI para firma local. La aceptación final de APK/OAuth físico permanece pendiente hasta confirmar teléfono y certificado. [Guía, arquitectura y pasos](PLANNING_AND_ANDROID.md).
