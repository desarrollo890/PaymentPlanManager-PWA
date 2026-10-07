# Plan de evolución y seguimiento

Fecha: 6 de octubre de 2026. El usuario autorizó revisión, documentación e inicio autónomo. La entrega actual completa las diferencias identificadas con la versión anterior y una primera fase de educación y análisis. Las extensiones posteriores se ordenan aquí sin presentarlas como entregadas.

| Etapa | Entregable | Criterio de terminación |
| --- | --- | --- |
| E0 Equivalencia | Matriz de funciones; omisiones corregidas; restricciones documentadas | Pruebas .NET, referencia financiera, comandos e interfaz PC/móvil aprobados |
| E1 Aprender | Lecciones offline, preguntas, fuentes y contexto de faltante | Respuestas correctas verificadas; sin envío de respuestas ni persistencia en claro |
| E2 Análisis | Rango y tarjeta; gastos, costo y uso de línea | Centavos conciliados con actividad; sin duplicar compras a meses; sin desbordamiento móvil |
| E3 Simulador | Avalancha/bola de nieve, tabla, gráfico y CSV | Conservación de centavos, mínimos, liberación de pagos, límites e insuficiencia probados; no modifica cartera |
| E4 Publicación | Documentación, revisión de secretos, commit/push y GitHub Pages | CI aprobada y recorrido sintético de la URL publicada |
| E5 Categorías | Contrato versionado, clasificación manual y reglas revisables | Requiere diseño de migración de dispositivos y versión compatible antes de desarrollar |
| E6 Recurrencias y metas | Generación idempotente de propuestas y seguimiento de ahorro real | Depende de E5 y de definir dónde se registra el efectivo/ahorro |
| E7 Android nativo | APK, firma, OAuth y almacenamiento seguro | Requiere certificado y decisión de distribución; la PWA sigue disponible |

## Arquitectura de la entrega

Los reportes y la simulación son funciones puras del dominio. La interfaz transforma cadenas a centavos y muestra resultados. Las escrituras continúan en comandos validados y sesiones cifradas. No se agregan entidades ni campos al contrato v1: no hay migración obligatoria ni incompatibilidad de datos por estas nuevas vistas.

Las atribuciones cambian únicamente el desglose de un pago; eliminación usa anulaciones causales en grupo; cierres conservan huella del historial; la importación advierte coincidencias sin decidir automáticamente que dos cargos distintos son uno. Las notificaciones solo almacenan en claro una preferencia booleana por dispositivo, sin información financiera; se desactivan al bloquear la cartera.

## Comprobaciones y aceptación

La suite conserva los ocho escenarios .NET y agrega eliminación atómica, restricciones de préstamo, atribución múltiple conciliada, resumen sin saldo inicial, importación con filas inválidas y coincidencias, y conservación exacta en simulación. El recorrido de navegador prueba formularios y consulta offline en PC y móvil, incluyendo las nuevas secciones.

El cuadre personal de importación fue aprobado por el usuario. La confirmación final del conflicto en dos dispositivos sigue pendiente de una respuesta específica; no bloquea estas mejoras. Las pruebas automáticas emplean únicamente carteras sintéticas y Drive simulado. Ninguna verificación automática equivale a auditoría independiente de seguridad.

## Estado de la primera entrega

E0–E3 implementadas. Comprobaciones: suite anterior .NET aprobada, 62 pruebas unitarias PWA, cuatro pruebas Google, 17 de arquitectura y recorridos sintéticos de PC/móvil. Se comprobó la equivalencia de fechas Excel 1900/1904 y se revisaron capturas de educación y simulación. E4 se completa con CI y verificación del sitio publicado. E5–E7 son mejoras posteriores, no funciones entregadas.
