# Categorías, recurrencias, cuentas, metas y Android

Entrega del 7 de octubre de 2026. Criterios elegidos por el usuario: cuentas de efectivo/débito, transferencias y metas vinculadas; APK personal para instalar directamente. No se utiliza conexión bancaria ni se realizan pagos bancarios desde la app.

## Uso de categorías

En **Categorías**, crea nombres y colores. En **Registrar movimiento** puedes elegir categoría; también puedes clasificar movimientos anteriores desde Categorías. Clasificar no cambia la deuda, las conciliaciones ni la huella de los cierres. Los pagos de tarjeta no son nuevos gastos. Una compra a meses se cuenta una vez por su capital; los intereses calculados sin movimiento explícito se consultan en Análisis.

Las reglas comparan un fragmento de descripción, ignorando mayúsculas y acentos, con tipo de cargo y tarjeta opcional. Proponen categorías para cargos nuevos o importados; no reemplazan tu clasificación. Varias coincidencias requieren tu elección. Archivar una categoría conserva su historial. Los límites del 15 o fin de mes advierten cuando los cargos reales del intervalo exceden el límite. Son alertas de consumo, independientes de los gastos esenciales ya presupuestados.

## Recurrencias

En **Recurrencias**, registra importe, tarjeta, primera fecha, frecuencia semanal/mensual/15 y fin de mes, última fecha opcional y categoría opcional. Al abrir la cartera se preparan doce meses de propuestas. También puedes indicar manualmente una fecha hasta diez años; los periodos cerrados no se modifican.

Las propuestas se ven en Movimientos y en Recurrencias. **Registrar como realizado** confirma un cargo ocurrido y toma la fecha de hoy; para otra fecha o importe usa Editar en Movimientos. **Omitir** anula una propuesta y conserva su identidad para que no reaparezca. Pausar detiene nuevas propuestas; no elimina las que ya existen. Editar la definición modifica únicamente propuestas futuras que todavía no se han creado. Los meses con menos días recortan la fecha sin perder el día original del mes.

Dos dispositivos generan los mismos IDs por recurrencia y fecha, incluyendo movimiento y clasificación. Propuestas exactamente iguales se fusionan; versiones financieras diferentes se revisan. No se usa la hora del dispositivo para elegir ganadores. Nunca se confirma un gasto solo porque pasó su fecha.

## Cuentas y transferencias

En **Cuentas**, registra efectivo o débito, saldo inicial real y fecha. Agrega ingresos recibidos, gastos y transferencias. Una transferencia es un único registro que resta en origen y suma en destino, conservando el total. Las fechas deben ser reales y posteriores a los saldos iniciales.

**Pagar tarjeta desde esta cuenta** registra el pago de tarjeta y el cargo de cuenta en el mismo grupo atómico. No registres ese pago otra vez en Movimientos. Anular o restaurar desde Cuentas actualiza ambos lados, salvo si la conciliación o cierre ya protege el pago. Cambiar unilateralmente el importe, fecha o vigencia del pago vinculado se rechaza. Los pagos ya registrados en la cartera anterior no se descuentan automáticamente de una cuenta nueva: el saldo inicial de la cuenta debe reflejar lo que tienes a su fecha. Corregir el saldo inicial mientras otro dispositivo registra movimientos genera una revisión conjunta, aunque el cuadre numérico todavía sea válido.

Los ingresos estimados de Preferencias no se convierten en depósitos reales. El saldo de Cuentas se basa en sus registros; el presupuesto estima ingresos y obligaciones. No se suman otra vez transferencias, saldos iniciales o pagos a los gastos esenciales presupuestados. Exportar CSV de cuentas produce información legible; el respaldo cifrado conserva todas las nuevas entidades.

## Metas con dinero respaldado

En **Metas**, elige cuenta, importe objetivo y fecha opcional. **Reservar** aparta dinero que ya existe: no cambia el saldo total ni crea otro depósito. **Liberar** vuelve a dejar ese dinero disponible. Para mover ahorro a otra cuenta: libera la reserva, transfiere el dinero y reserva en una meta de destino. Solo puedes cambiar la cuenta de una meta sin reserva.

El saldo libre es saldo de cuenta menos reservas de todas sus metas. El sistema comprueba el cuadre en cada fecha del historial, rechaza saldos negativos o reservas sin respaldo y evita liberar más de lo apartado. Tras sincronización, movimientos independientes que en conjunto exceden el saldo generan una revisión de coherencia, sin borrar ninguno. Una cuenta solo se archiva vacía; una meta, sin reserva.

La sugerencia por quincena distribuye lo que falta entre el 15 y fin de mes hasta la fecha objetivo; se redondea hacia arriba al centavo. Es una propuesta, no una transferencia automática. Si la reserva del presupuesto ya cubre ese ahorro, no lo sumes otra vez. Presupuesto y la tabla de ahorro muestran todas las quincenas hasta la última meta u obligación vigente.

## Contratos y actualización

`contracts/v1` permanece congelado. Las diez nuevas entidades viven en `contracts/v2`; los lotes v2 admiten operaciones v1 y v2. Los bloques AES-256-GCM, claves de cartera, recuperación e identidad siguen usando el contenedor cifrado v1. No se convierten ni se reescriben registros anteriores.

Antes de usar estas funciones, actualiza la PWA en **todos** tus dispositivos. Un cliente antiguo rechaza lotes v2 antes de incorporarlos y pide una versión compatible; no los descarta ni los convierte. La app actual abre carteras y respaldos anteriores, cifra las extensiones y permite importarlas repetidamente sin duplicarlas.

## APK nativa

El proyecto `android/` usa Capacitor 8, Android 7/API 24 o superior, target API 36 y Java 21 para compilar. Reutiliza interfaz y motor financiero con recursos locales empaquetados, no carga el sitio remoto para abrir. No registra service worker en Android.

La autorización usa Google Play Services AuthorizationClient y únicamente `drive.appdata`, siguiendo la [guía oficial de Android](https://developer.android.com/identity/authorization). No utiliza el consentimiento web dentro de WebView, client secret ni refresh token. El acceso queda en memoria de la interfaz durante la sesión; su copia temporal nativa se protege con AES-GCM y una clave de [Android Keystore](https://developer.android.com/privacy-and-security/cryptography), se borra al bloquear/desconectar y no se reutiliza tras iniciar un proceso nuevo.

Los respaldos, CSV y clave de recuperación se guardan mediante el selector de documentos Android, sin permiso de acceso general a archivos. La cartera mantiene el cifrado local y la contraseña de apertura. Se deshabilitan copias automáticas Android y capturas/vista de tareas con datos visibles. Al volver al primer plano se comprueba el bloqueo por quince minutos de inactividad. Estas protecciones no sustituyen una auditoría independiente.

La firma privada y sus contraseñas permanecen en almacenamiento local ignorado; no se publican ni se envían a GitHub. El workflow Android compila, prueba y ejecuta lint, y entrega un APK **sin firma** para firmarlo localmente. Usa la misma clave para actualizaciones; guárdala por separado de tus respaldos financieros. Cambiar la clave impide actualizar sobre una instalación anterior.

Para generar recursos: `npm ci --ignore-scripts` y `npm run android:sync`. Para compilar: JDK 21 y SDK Android 36, después `android/gradlew assembleRelease testReleaseUnitTest lintRelease`. [Capacitor documenta el entorno](https://capacitorjs.com/docs/getting-started/environment-setup). La firma se puede hacer con `apksigner` del SDK Android usando un almacén privado; no pongas contraseñas en archivos versionados ni en instrucciones copiadas al chat.

La APK requiere Google Play Services para Drive. Sin ellos, puedes trabajar localmente con tu cartera. Las notificaciones del navegador no son notificaciones nativas de segundo plano; los avisos financieros dentro de Inicio siguen disponibles.

## Aceptación personal pendiente

1. Instalar la APK firmada y abrirla sin conexión desde la primera vez. Crear una cartera de prueba o importar un respaldo cifrado de la PWA actualizada.
2. Registrar una cuenta con $1 000, reservar $600 en una meta e intentar transferir $500. Debe rechazarse; $200 debe permitirse y conservar el total entre cuentas.
3. Pagar $100 de tarjeta desde la cuenta: deben bajar cuenta y deuda una sola vez. Anular el pago desde Cuentas debe restituir ambos, si no estaba conciliado/cerrado.
4. Crear una recurrencia vencida de $10: no debe aumentar la deuda hasta confirmarla. Preparar otra vez debe dejar una única propuesta. Omitirla debe impedir su regeneración.
5. Autorizar Google con el paquete y SHA-1 de **la APK firmada** en el cliente Android del mismo proyecto Google Cloud. Sincronizar, repetir en la PWA y confirmar cuentas, metas, categorías, recurrencias y saldos iguales.
6. Exportar/importar un respaldo desde el selector Android. Probar bloquear, reabrir, rotar pantalla y volver después de quince minutos; confirmar formularios utilizables y que no quedan tokens accesibles tras bloqueo.

El código y pruebas sintéticas no acreditan estas pruebas físicas de OAuth, selector Android y ciclo de vida: requieren tu teléfono y configuración Google Cloud.

## Certificado y evidencia de entrega

El usuario confirmó que configuró el cliente Android y la siguiente huella SHA-1: `A7:30:70:40:99:C6:26:69:76:C8:C5:73:20:2A:56:29:31:0D:6B:B8`, paquete `com.sardeip.PaymentPlanManager`. Es un certificado con identidad genérica PaymentPlan. Se verificaron alineación y firmas APK v2/v3 con las herramientas oficiales de Android; la clave privada se conserva únicamente en archivos locales ignorados.

Pruebas sintéticas: paridad financiera anterior, 70 pruebas unitarias de la PWA, cuatro del probe Google y 17 de arquitectura, recorridos de PC/móvil y sincronización/respaldos cifrados. La URL HTTPS fue comprobada con carteras sintéticas en perfiles aislados. La compilación Java/Android y lint aprobaron. Estas evidencias no implican autorización Google real desde la APK ni aceptación física.

## Verificación final de la entrega

Código `ed0e089`: [publicación Pages aprobada](https://github.com/desarrollo890/PaymentPlanManager-PWA/actions/runs/37582130432) y [compilación Android aprobada](https://github.com/desarrollo890/PaymentPlanManager-PWA/actions/runs/37582130473). La URL pública pasó también los recorridos de PC/móvil con restauración del pago vinculado. La APK personal se firmó localmente y verificó con `apksigner` y `zipalign`; SHA-256 del archivo firmado: `72ac880162f7900a5fee8cd28d30fe5251ca56d1fc3b0d45dad36797cdcc9621`. El historial y archivos públicos se revisaron con Gitleaks, sin hallazgos, y mantienen identidad genérica. La prueba física de Drive, documentos y ciclo de vida Android continúa pendiente.
