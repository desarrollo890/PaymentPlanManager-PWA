# Viabilidad de la implementaci?n web

Los prototipos prueban contratos, revisiones, cifrado e interoperabilidad para la aplicaci?n web. Trabajan con datos sint?ticos y no constituyen el motor financiero ni un sincronizador completo.

La referencia contiene ocho escenarios, 240 fechas de quincena, 120 cuotas y tres amortizaciones. Las pruebas de arquitectura cubren esquemas, revisiones causales, dependencias, grupos incompletos, deduplicaci?n, AES-GCM, derivaci?n y recuperaci?n b?sica. Faltan fusi?n de campos y validaci?n financiera entre entidades.

Argon2id es un candidato para la contrase?a maestra. El prototipo compara implementaci?n nativa Node, hash-wasm y el navegador; usa el vector de RFC 9106. PBKDF2 es otra alternativa probada. `npm --prefix tools/architecture run benchmark` produce mediciones locales en `artifacts/architecture`; el perfil final requiere medici?n y validaci?n en dispositivos objetivo. No se publican claves ni resultados privados de benchmark.

La herramienta local Google crea y verifica bloques cifrados sint?ticos en appDataFolder. Las pruebas automatizadas interceptan endpoints y usan tokens ficticios. La autorizaci?n y el acceso real a Drive todav?a deben verificarse por el usuario. El sitio inicial no carga Google Identity Services.

Referencias: [Web Crypto](https://www.w3.org/TR/webcrypto/), [Argon2](https://www.rfc-editor.org/rfc/rfc9106.html), [Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata).
