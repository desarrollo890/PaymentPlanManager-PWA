# Seguimiento de implementaci?n web

Actualizado el 6 de octubre de 2026. La interfaz publicada corresponde a una vista previa inicial. Los estados de este tablero se refieren a la implementaci?n React y TypeScript.

| ?rea | Estado | Evidencia o siguiente paso |
| --- | --- | --- |
| Contratos y referencia | Completado | Tres esquemas, trece entidades y referencia financiera sint?tica incluidos. |
| Viabilidad criptogr?fica | En curso | Prototipos y vectores disponibles; falta selecci?n y validaci?n del almacenamiento final. |
| OAuth de Google | En curso | Configuraci?n p?blica y prueba local; autorizaci?n real pendiente. |
| Workspace React | Completado | Seis paquetes separados y comprobaciones de contratos, tipos y dependencias. |
| CI y vista previa Pages | Completado | [Ejecuci?n aprobada](https://github.com/desarrollo890/PaymentPlanManager-PWA/actions/runs/37530623689): instalaci?n limpia, 26 pruebas, tipos/build, navegador PC/m?vil y probe sint?tico; despliegue exitoso. |
| Motor financiero | Pendiente | Implementar paridad con las ocho referencias y calendario completo. |
| IndexedDB, cifrado y recuperaci?n | Pendiente | Persistencia, migraciones, grupos/outbox at?micos y respaldo. |
| Pantallas financieras y PWA offline | Pendiente | Tarjetas, movimientos, MSI/MCI, cortes, pr?stamos y presupuesto. |
| Fusi?n y conflictos | Pendiente | Revisiones, dependencias, validaci?n entre entidades y resoluci?n visible. |
| Drive y sincronizaci?n real | Pendiente | Vincular cuenta, lotes cifrados, auto-sync y dos navegadores. |
| Importaci?n y piloto | Pendiente | Cuadre, importaci?n repetida sin duplicados y recuperaci?n. |
| Publicaci?n funcional | Pendiente | Recorrido financiero completo; la vista previa inicial no satisface este hito. |

Siguiente paso funcional: ejecutar la prueba Google local y continuar con el motor financiero. El producto no debe presentar como implementados los prototipos de arquitectura ni las pruebas con tokens sint?ticos.

Cada entrega registra sus pruebas y enlaza la ejecuci?n de CI. El workflow usa una identidad de commit gen?rica; los cambios hechos desde otros clones deben conservar esa configuraci?n.

## Publicaci?n inicial

[Repositorio p?blico](https://github.com/desarrollo890/PaymentPlanManager-PWA) y [vista previa HTTPS](https://desarrollo890.github.io/PaymentPlanManager-PWA/), publicados el 6 de octubre de 2026. El historial comienza con una entrega web independiente y autores gen?ricos. La publicaci?n inicial incluye 62 archivos web; no incorpora proyectos de escritorio/backend, datos personales ni historial anterior. La cartera funcional y la publicaci?n final F8 siguen pendientes.

La URL HTTPS se verific? en Chromium con vistas de 1440?1000 y 390?844: assets, navegaci?n, recarga directa, enfoque del teclado y ausencia de desbordamiento horizontal aprobados. El sitio realiza ?nicamente peticiones a sus assets, sin cargar Google ni invocar APIs financieras.
