# Seguimiento de implementación web

Actualizado el 6 de octubre de 2026. La interfaz publicada corresponde a una vista previa inicial. Los estados de este tablero se refieren a la implementación React y TypeScript.

| Área | Estado | Evidencia o siguiente paso |
| --- | --- | --- |
| Contratos y referencia | Completado | Tres esquemas, trece entidades y referencia financiera sintética incluidos. |
| Viabilidad criptográfica | En curso | Prototipos y vectores disponibles; falta selección y validación del almacenamiento final. |
| OAuth de Google web | Validado en prueba local | El usuario completó la autorización real y reportó creación, listado e integridad del bloque sintético en appDataFolder. Android sigue pendiente. |
| Workspace React | Completado | Seis paquetes separados y comprobaciones de contratos, tipos y dependencias. |
| CI y vista previa Pages | Completado | [Ejecución aprobada](https://github.com/desarrollo890/PaymentPlanManager-PWA/actions/runs/37530623689): instalación limpia, 26 pruebas, tipos/build, navegador PC/móvil y probe sintético; despliegue exitoso. |
| Motor financiero | En curso | Primera entrega: calendario civil, quincenas, vencimientos y cuotas MSI/MCI. Paridad completa de los ocho escenarios de cartera pendiente. |
| IndexedDB, cifrado y recuperación | Pendiente | Persistencia, migraciones, grupos/outbox atómicos y respaldo. |
| Pantallas financieras y PWA offline | Pendiente | Tarjetas, movimientos, MSI/MCI, cortes, préstamos y presupuesto. |
| Fusión y conflictos | Pendiente | Revisiones, dependencias, validación entre entidades y resolución visible. |
| Drive y sincronización real | Pendiente | Vincular cuenta, lotes cifrados, auto-sync y dos navegadores. |
| Importación y piloto | Pendiente | Cuadre, importación repetida sin duplicados y recuperación. |
| Publicación funcional | Pendiente | Recorrido financiero completo; la vista previa inicial no satisface este hito. |

Siguiente paso funcional: completar el motor financiero, empezando por saldos, atribución de pagos a planes y estimación de cortes. El producto no debe presentar como implementados los prototipos de arquitectura ni las pruebas con tokens sintéticos.

Cada entrega registra sus pruebas y enlaza la ejecución de CI. El workflow usa una identidad de commit genérica; los cambios hechos desde otros clones deben conservar esa configuración.

## Publicación inicial

[Repositorio público](https://github.com/desarrollo890/PaymentPlanManager-PWA) y [vista previa HTTPS](https://desarrollo890.github.io/PaymentPlanManager-PWA/), publicados el 6 de octubre de 2026. El historial comienza con una entrega web independiente y autores genéricos. La publicación inicial incluye 62 archivos web; no incorpora proyectos de escritorio/backend, datos personales ni historial anterior. La cartera funcional y la publicación final F8 siguen pendientes.

La URL HTTPS se verificó en Chromium con vistas de 1440×1000 y 390×844: assets, navegación, recarga directa, enfoque del teclado y ausencia de desbordamiento horizontal aprobados. El sitio realiza únicamente peticiones a sus assets, sin cargar Google ni invocar APIs financieras.

## Prueba real de Google web

El 6 de octubre de 2026 el usuario compartió el resultado de la herramienta local: `integrityVerified: true`, `synthetic: true` y `listedInAppDataFolder: true`. Según ese resultado, el archivo cifrado de prueba fue creado, encontrado, descargado y verificado. No se publican identificadores del archivo/bloque, tokens ni claves. La interoperabilidad Android permanece pendiente. Esta validación no equivale a sincronización de una cartera ni cierra la selección y recuperación del almacenamiento cifrado de F0.

La primera entrega de F2 se documenta en [Motor financiero](FINANCIAL_ENGINE.md). No está conectada aún a formularios o almacenamiento.
