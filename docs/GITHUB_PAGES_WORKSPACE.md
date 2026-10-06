# Workspace de la aplicaci?n web

El workspace usa React, Vite, TypeScript y npm. El dominio se compila sin DOM/Node; los adaptadores conectar?n posteriormente almacenamiento y sincronizaci?n. La interfaz actual es una vista previa sin cartera persistida.

| Carpeta | Funci?n |
| --- | --- |
| apps/pwa | Interfaz y compilaci?n est?tica para Pages. |
| packages/contracts | Tipos generados desde JSON Schema. |
| packages/domain | Estructura del motor financiero independiente. |
| packages/application | Casos de uso; actualmente expone la configuraci?n de base. |
| packages/storage | Contrato inicial del almacenamiento local. |
| packages/crypto | Contrato inicial del cifrado. |
| packages/sync | Contrato inicial del transporte y simulador exclusivo de pruebas. |
| tools/architecture | Prototipos sint?ticos de esquemas, revisiones y cifrado. |
| tools/google-probe | Prueba local web de Drive, separada del artefacto publicado. |

`npm run contracts:generate` genera tipos; `npm run contracts:check` detecta diferencias. `npm run check:boundaries` comprueba imports permitidos; `npm run typecheck` verifica la UI y el dominio. `npm run check` re?ne comprobaciones, pruebas y build; `npm run test:architecture` y `npm run test:browser` cubren prototipos y recorridos web.

Pages recibe exclusivamente `apps/pwa/dist`. La base `/PaymentPlanManager-PWA/` aparece en Vite y en las comprobaciones est?ticas/de navegador. La navegaci?n por hash permite recargar secciones sin backend ni rutas de servidor. El build no importa transportes de prueba ni herramientas de arquitectura.
