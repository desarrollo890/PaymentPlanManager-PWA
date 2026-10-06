# Workspace de la aplicación web

El workspace usa React, Vite, TypeScript y npm. El dominio se compila sin DOM/Node; los adaptadores conectarán posteriormente almacenamiento y sincronización. La interfaz actual es una vista previa sin cartera persistida.

| Carpeta | Función |
| --- | --- |
| apps/pwa | Interfaz y compilación estática para Pages. |
| packages/contracts | Tipos generados desde JSON Schema. |
| packages/domain | Reglas base de calendario civil, quincenas y cuotas MSI/MCI; motor en migración. |
| packages/application | Casos de uso; actualmente expone la configuración de base. |
| packages/storage | Contrato inicial del almacenamiento local. |
| packages/crypto | Contrato inicial del cifrado. |
| packages/sync | Contrato inicial del transporte y simulador exclusivo de pruebas. |
| tools/architecture | Prototipos sintéticos de esquemas, revisiones y cifrado. |
| tools/google-probe | Prueba local web de Drive, separada del artefacto publicado. |

`npm run contracts:generate` genera tipos; `npm run contracts:check` detecta diferencias. `npm run check:boundaries` comprueba imports permitidos; `npm run typecheck` verifica la UI y el dominio. `npm run check` reúne comprobaciones, pruebas y build; `npm run test:architecture` y `npm run test:browser` cubren prototipos y recorridos web.

Pages recibe exclusivamente `apps/pwa/dist`. La base `/PaymentPlanManager-PWA/` aparece en Vite y en las comprobaciones estáticas/de navegador. La navegación por hash permite recargar secciones sin backend ni rutas de servidor. El build no importa transportes de prueba ni herramientas de arquitectura.

## Abrir junto a la versión .NET

Las carpetas hermanas `PaymentPlanManager` y `PaymentPlanManager-PWA` pueden agregarse a un mismo espacio de trabajo de VS Code mediante **Archivo → Agregar carpeta al área de trabajo**. La sección Control de código fuente muestra cada repositorio por separado. Ejecutar los comandos .NET desde la primera carpeta y los comandos npm de la versión web desde la segunda.
