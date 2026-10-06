# Prueba local web de Google Drive

La prueba F0 verifica autorizaci?n y lectura/escritura cifrada con datos sint?ticos. Es una herramienta local independiente de la cartera y no forma parte del sitio publicado. La prueba real sigue pendiente.

1. Instalar dependencias desde la ra?z y detener el servidor React si ocupa 5173.
2. Ejecutar `npm run dev:google-probe` y abrir http://localhost:5173/.
3. Pulsar **Preparar autorizaci?n Google** y despu?s **Autorizar Drive**; elegir la cuenta de prueba y conceder drive.appdata.
4. Listar archivos y crear/verificar el bloque sint?tico. La herramienta confirma listado, descarga, integridad y descifrado. El token solo permanece en memoria.
5. Los archivos de prueba permanecen en Drive. El paquete descargado contiene una clave aleatoria de prueba: trasladarlo de manera privada y no subirlo a Git. Sirve para verificar el bloque desde otro dispositivo compatible; no es un respaldo de la cartera.

`config/google-oauth.json` contiene el Client ID web p?blico, scope y or?genes reportados: https://desarrollo890.github.io, http://localhost y http://localhost:5173. El origen Pages no cambia al usar otra ruta de repositorio. La configuraci?n no contiene Client Secret. Opcionalmente copiar `.env.example` a `.env.local` para cambiar Client ID o puerto.

`npm run test:google-probe` comprueba el transporte sint?tico y el servidor. `npm run test:browser` valida la interfaz y el probe con Google simulado. Ninguna de estas pruebas equivale a autorizaci?n real ni sincronizaci?n financiera.

[Client ID y or?genes](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [modelo de tokens](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata).
