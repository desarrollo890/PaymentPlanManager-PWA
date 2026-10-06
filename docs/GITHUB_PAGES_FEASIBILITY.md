# Viabilidad de la implementación web

> Este documento conserva la prueba de viabilidad inicial. La implementación operativa y su aceptación pendiente se describen en [Seguimiento](GITHUB_PAGES_TRACKING.md).

Los prototipos prueban contratos, revisiones, cifrado e interoperabilidad para la aplicación web. Trabajan con datos sintéticos y no constituyen el motor financiero ni un sincronizador completo.

La referencia contiene ocho escenarios, 240 fechas de quincena, 120 cuotas y tres amortizaciones. Las pruebas de arquitectura cubren esquemas, revisiones causales, dependencias, grupos incompletos, deduplicación, AES-GCM, derivación y recuperación básica. Faltan fusión de campos y validación financiera entre entidades.

Argon2id es un candidato para la contraseña maestra. El prototipo compara implementación nativa Node, hash-wasm y el navegador; usa el vector de RFC 9106. PBKDF2 es otra alternativa probada. `npm --prefix tools/architecture run benchmark` produce mediciones locales en `artifacts/architecture`; el perfil final requiere medición y validación en dispositivos objetivo. No se publican claves ni resultados privados de benchmark.

La herramienta local Google crea y verifica bloques cifrados sintéticos en appDataFolder. Las pruebas automatizadas interceptan endpoints y usan tokens ficticios. La autorización y el acceso real a Drive todavía deben verificarse por el usuario. El sitio inicial no carga Google Identity Services.

Referencias: [Web Crypto](https://www.w3.org/TR/webcrypto/), [Argon2](https://www.rfc-editor.org/rfc/rfc9106.html), [Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata).
