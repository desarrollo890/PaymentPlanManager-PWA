# Prueba local web de Google Drive

> Este documento conserva la prueba de viabilidad inicial. La implementación operativa y su aceptación pendiente se describen en [Seguimiento](GITHUB_PAGES_TRACKING.md).

La prueba F0 verifica autorización y lectura/escritura cifrada con datos sintéticos. Es una herramienta local independiente de la cartera y no forma parte del sitio publicado. El usuario completó la prueba real web el 6 de octubre de 2026 y reportó listado e integridad correctos del archivo sintético. La interoperabilidad Android y la sincronización de la cartera siguen pendientes.

1. Instalar dependencias desde la raíz y detener el servidor React si ocupa 5173.
2. Ejecutar `npm run dev:google-probe` y abrir http://localhost:5173/.
3. Pulsar **Preparar autorización Google** y después **Autorizar Drive**; elegir la cuenta de prueba y conceder drive.appdata.
4. Listar archivos y crear/verificar el bloque sintético. La herramienta confirma listado, descarga, integridad y descifrado. El token solo permanece en memoria.
5. Los archivos de prueba permanecen en Drive. El paquete descargado contiene una clave aleatoria de prueba: trasladarlo de manera privada y no subirlo a Git. Sirve para verificar el bloque desde otro dispositivo compatible; no es un respaldo de la cartera.

`config/google-oauth.json` contiene el Client ID web público, scope y orígenes reportados: https://desarrollo890.github.io, http://localhost y http://localhost:5173. El origen Pages no cambia al usar otra ruta de repositorio. La configuración no contiene Client Secret. Opcionalmente copiar `.env.example` a `.env.local` para cambiar Client ID o puerto.

`npm run test:google-probe` comprueba el transporte sintético y el servidor. `npm run test:browser` valida la interfaz y el probe con Google simulado. Ninguna de estas pruebas equivale a autorización real ni sincronización financiera.

[Client ID y orígenes](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [modelo de tokens](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata).
