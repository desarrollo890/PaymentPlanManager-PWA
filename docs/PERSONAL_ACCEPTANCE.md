# Prueba personal de aceptación

La aplicación y sus pruebas automáticas usan una arquitectura operativa, pero la autorización con la cuenta real, el dispositivo móvil físico y el cuadre de la cartera personal requieren intervención del usuario. No compartir contraseñas, claves de recuperación, tokens ni el respaldo financiero.

## Drive en dos navegadores

1. Abre [PaymentPlan](https://desarrollo890.github.io/PaymentPlanManager-PWA/) en un navegador de PC. Crea una cartera de prueba y guarda su clave de recuperación. Registra una tarjeta sintética: límite $20 000, disponible $10 000 y deuda $10 000; origen «Periodo en curso / próximo corte».
2. En Preferencias, pulsa «Preparar Google Drive» y luego «Autorizar Google Drive» con tu cuenta configurada como usuario de prueba. Espera la sincronización y comprueba que no queden bloques por enviar.
3. En un segundo navegador o teléfono, abre la aplicación y usa la misma autorización para buscar la cartera en Drive. **No crees otra cartera**: elige la existente y desbloquéala con la misma contraseña. Comprueba los saldos.
4. Desconecta ambos dispositivos. Registra un gasto distinto en cada uno: $100 y $200. Reconecta y sincroniza ambos, repitiendo en el primero. Ambos deben mostrar deuda $10 300 y los dos movimientos.
5. Sin conexión, edita el mismo gasto en cada dispositivo con importes diferentes. Reconecta y sincroniza ambos. Debe aparecer una revisión de versiones; el reloj del dispositivo no elige un ganador. Elige la versión correcta y sincroniza de nuevo: ambos deben coincidir.
6. Bloquea o recarga. La autorización de Google debe desaparecer de la sesión; la cartera local sigue disponible con su contraseña. Renueva la autorización desde el botón cuando quieras sincronizar.

Si aparece un error, compartir solo su texto, en qué paso ocurrió y qué navegador se utilizó. Para aprobar la prueba basta informar si coinciden los saldos y los movimientos; no hacen falta IDs de Drive.

## Recuperación y teléfono

- Descarga un respaldo cifrado de la cartera de prueba. Impórtalo en otro perfil limpio del navegador y comprueba tarjetas, planes y movimientos.
- Repite la importación: no deben duplicarse. Un respaldo alterado debe rechazarse antes de incorporar sus bloques.
- En un perfil sin cartera, selecciona el respaldo y «Olvidé mi contraseña». Usa la clave de recuperación y una contraseña nueva; deben conservarse los saldos. La clave se usa en el dispositivo, sin enviarla a Google.
- En el teléfono físico, guarda la PWA en la pantalla de inicio. Abre una vez con conexión; después prueba recarga, consulta y registro en modo avión. Comprueba el tiempo de desbloqueo y que los formularios sean utilizables.

La APK y la interoperabilidad con Google Sign-In nativo no pertenecen a esta entrega web. El móvil usa la PWA instalada desde el navegador.

## Importación personal

Antes de cambiar el lugar donde registras tus operaciones, exporta un respaldo actualizado de la aplicación anterior. Crea una cartera nueva para el piloto y selecciona el JSON en Preferencias. Compara en la vista previa cada tarjeta: deuda, disponible, saldo a meses, objetivo al corte, préstamos y presupuesto.

Confirma solo si coinciden. Una versión diferente de un registro existente se rechaza para evitar sobrescribir cambios posteriores; puedes importarla en una cartera nueva y revisar. Los cierres deben reconstruirse exactamente antes de importar. La importación bancaria tiene selección de columnas y filas; utiliza referencias únicas del banco cuando estén disponibles.

Repite la importación sin cambiar el archivo y verifica que se indique «ya existente». Después descarga un respaldo cifrado y restaura en otro perfil. Informar únicamente «cuadre aprobado» o las diferencias de importes pertinentes, sin nombres de personas, números de tarjeta ni archivos financieros.

## Cierre de fases

F6 se cierra con la sincronización real de dos navegadores y la renovación de autorización. F7 requiere el cuadre del piloto y recuperación aprobados por el usuario. F8 requiere el recorrido en HTTPS y la comprobación del teléfono físico. Las pruebas sintéticas automatizadas no sustituyen esas evidencias.
