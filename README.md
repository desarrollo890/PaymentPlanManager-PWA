# PaymentPlanManager PWA

Aplicaci?n web personal para organizar deudas y pagos por quincena, preparada para GitHub Pages con React y TypeScript. Esta entrega es una **vista previa en desarrollo**: navegaci?n e interfaz inicial, contratos y pruebas. El registro financiero, los c?lculos, IndexedDB, uso offline y sincronizaci?n de la cartera todav?a est?n pendientes.

Vista previa prevista: https://desarrollo890.github.io/PaymentPlanManager-PWA/

## Ejecutar y verificar

Requiere Node 24.13.0 y npm. Desde la ra?z:

```sh
npm ci --ignore-scripts
npm ci --prefix tools/architecture --ignore-scripts
npm run dev
```

```sh
npm run check
npm run test:architecture
npx playwright install chromium
npm run test:browser
```

El servidor React usa http://localhost:5173. La prueba Google usa el mismo puerto; detener uno antes de iniciar el otro con `npm run dev:google-probe`. Esa herramienta trabaja con datos sint?ticos y no se publica en el sitio.

## Contenido

- `apps/pwa`: interfaz React y compilaci?n est?tica Vite.
- `packages`: contratos y estructura de dominio, aplicaci?n, almacenamiento, cifrado y sincronizaci?n.
- `contracts/v1`: esquemas versionados; `tests`: pruebas y referencia financiera sint?tica.
- `tools/architecture` y `tools/google-probe`: pruebas de viabilidad para la versi?n web.
- `.github/workflows/pages.yml`: comprobaciones y publicaci?n de `apps/pwa/dist` en Pages.

Este repositorio tiene un historial nuevo con identidad gen?rica. Contiene exclusivamente la implementaci?n web y sus herramientas; no requiere un servidor .NET.

## Desarrollo y publicaci?n

El workflow comprueba contratos, dependencias entre paquetes, tipos, pruebas de arquitectura y navegaci?n PC/m?vil. Las pull requests se validan; los cambios de `main` se publican despu?s de pasar las comprobaciones. GitHub Pages debe usar GitHub Actions como origen. La ruta est?tica es `/PaymentPlanManager-PWA/`.

Los Client IDs OAuth son configuraci?n p?blica. Tokens, contrase?as, datos personales y claves deben permanecer fuera de Git. Esta versi?n de interfaz no registra ni almacena una cartera.

[Plan](docs/GITHUB_PAGES_PLAN.md) ? [Seguimiento](docs/GITHUB_PAGES_TRACKING.md) ? [Workspace](docs/GITHUB_PAGES_WORKSPACE.md) ? [Contratos](docs/GITHUB_PAGES_CONTRACTS.md) ? [Viabilidad](docs/GITHUB_PAGES_FEASIBILITY.md) ? [Prueba Google](docs/GITHUB_PAGES_GOOGLE_PROBE.md)
