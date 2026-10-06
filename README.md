# PaymentPlanManager PWA

Aplicación web personal para organizar deudas y pagos por quincena, preparada para GitHub Pages con React y TypeScript. Esta entrega es una **vista previa en desarrollo**: navegación e interfaz inicial, contratos y pruebas. El registro financiero, los cálculos, IndexedDB, uso offline y sincronización de la cartera todavía están pendientes.

Vista previa publicada: https://desarrollo890.github.io/PaymentPlanManager-PWA/

## Ejecutar y verificar

Requiere Node 24.13.0 y npm. Clonar y abrir este repositorio en una carpeta independiente. Si también se conserva la versión .NET, usar carpetas hermanas `PaymentPlanManager` y `PaymentPlanManager-PWA`. Puedes agregar ambas a un mismo espacio de trabajo de VS Code; cada carpeta conserva su repositorio y remoto. Para continuar la versión web, ejecuta los comandos desde `PaymentPlanManager-PWA`.

```sh
git clone https://github.com/desarrollo890/PaymentPlanManager-PWA.git
cd PaymentPlanManager-PWA
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

El servidor React usa http://localhost:5173. La prueba Google usa el mismo puerto; detener uno antes de iniciar el otro con `npm run dev:google-probe`. Esa herramienta trabaja con datos sintéticos y no se publica en el sitio.

## Contenido

- `apps/pwa`: interfaz React y compilación estática Vite.
- `packages`: contratos y estructura de dominio, aplicación, almacenamiento, cifrado y sincronización.
- `contracts/v1`: esquemas versionados; `tests`: pruebas y referencia financiera sintética.
- `tools/architecture` y `tools/google-probe`: pruebas de viabilidad para la versión web.
- `.github/workflows/pages.yml`: comprobaciones y publicación de `apps/pwa/dist` en Pages.

Este repositorio tiene un historial nuevo con identidad genérica. Contiene exclusivamente la implementación web y sus herramientas; no requiere un servidor .NET.

## Desarrollo y publicación

El workflow comprueba contratos, dependencias entre paquetes, tipos, pruebas de arquitectura y navegación PC/móvil. Las pull requests se validan; los cambios de `main` se publican después de pasar las comprobaciones. GitHub Pages debe usar GitHub Actions como origen. La ruta estática es `/PaymentPlanManager-PWA/`.

Los Client IDs OAuth son configuración pública. Tokens, contraseñas, datos personales y claves deben permanecer fuera de Git. Esta versión de interfaz no registra ni almacena una cartera.

[Plan](docs/GITHUB_PAGES_PLAN.md) · [Seguimiento](docs/GITHUB_PAGES_TRACKING.md) · [Workspace](docs/GITHUB_PAGES_WORKSPACE.md) · [Contratos](docs/GITHUB_PAGES_CONTRACTS.md) · [Viabilidad](docs/GITHUB_PAGES_FEASIBILITY.md) · [Prueba Google](docs/GITHUB_PAGES_GOOGLE_PROBE.md)
