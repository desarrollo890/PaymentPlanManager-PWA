# Workspace de la aplicación web

React, Vite y TypeScript usan un workspace npm con seis paquetes. El dominio compila sin DOM/Node; almacenamiento, cifrado y Drive son adaptadores de navegador conectados mediante casos de uso.

| Carpeta | Función |
| --- | --- |
| apps/pwa | Pantallas, formularios, importación de archivos, autorización GIS y artefacto estático/offline. |
| packages/contracts | Tipos y esquemas normativos generados; validación acotada en runtime. |
| packages/domain | Saldos, atribuciones, MSI/MCI, cortes, calendario, préstamos, presupuestos, periodos y avisos. |
| packages/application | Comandos, sesión cifrada, transferencia/importación, validación histórica y orquestación de sincronización. |
| packages/storage | IndexedDB con bloques inmutables, CAS y escritura atómica con outbox. |
| packages/crypto | AES-256-GCM, PBKDF2, clave independiente de recuperación y bloqueo. |
| packages/sync | Revisiones causales, fusión/conflictos, transporte Drive y simulador de pruebas. |
| tools/architecture | Prototipos y vectores criptográficos, separados del producto. |
| tools/google-probe | Prueba Google local de viabilidad; no se publica. |

`npm run contracts:generate` genera tipos y esquemas para runtime; `contracts:check` detecta diferencias. `check:boundaries` verifica imports permitidos y `typecheck` comprueba tipos estrictos. `check` reúne esas comprobaciones, pruebas y build. `test:architecture` cubre prototipos y `test:browser` incluye UI PC/móvil, IndexedDB/sincronización y probe sintético.

Pages recibe exclusivamente `apps/pwa/dist`. La base `/PaymentPlanManager-PWA/` se usa en Vite, manifiesto y service worker. La navegación por hash permite recargar secciones sin backend. El build no importa herramientas de arquitectura ni el simulador de transporte.

El service worker cachea únicamente el código y los assets de esta PWA. Las respuestas de Google/Drive no pasan a la caché. Las operaciones cifradas y su outbox se guardan en IndexedDB; las claves y la autorización permanecen en memoria. Una actualización requiere acción explícita, espera el cierre de formularios y bloquea la sesión antes de recargar.

## Junto a la versión .NET

Agrega las carpetas hermanas `PaymentPlanManager` y `PaymentPlanManager-PWA` al workspace de VS Code. Control de código fuente muestra cada repositorio por separado. Ejecuta .NET desde la primera y npm desde la segunda. Cada clon debe conservar una identidad de commit genérica.
