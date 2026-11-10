# Guía de nuevas funciones

## Registrar con texto o voz

Con la cartera desbloqueada, pulsa **Texto o voz** en la cabecera. Escribe una frase como «Gasté 250 en supermercado con Santander», «Recibí 500 en Nómina» o «Juan me prestó 300» y pulsa **Interpretar**. El reconocimiento de la operación es local: usa nombres exactos registrados y cifras numéricas, entiende hoy, ayer y fechas ISO (`2026-11-05`), pero no todas las formas de hablar. Si no reconoce algún dato o encuentra nombres repetidos, selecciónalo o corrígelo. Revisa operación, destino, importe y fecha antes de confirmar; nunca se guarda automáticamente.

Admite gastos y pagos de tarjeta, ingresos y gastos de cuentas, abonos a préstamos personales y dinero adicional de una persona. Para una persona sin ficha selecciona «Nuevo préstamo de una persona sin ficha». Un pago de tarjeta puede descontarse también de una cuenta si seleccionas su origen; deja el origen vacío para una bonificación. Los movimientos de préstamos no modifican cuentas y la opción de sumar el dinero recibido al presupuesto es independiente.

El botón de micrófono solo aparece si el navegador o entorno Android proporciona reconocimiento de voz. Antes de usarlo, confirma el aviso: el proveedor del dispositivo puede enviar el audio a sus servidores y requerir internet; la aplicación no controla ese procesamiento. Si no hay reconocimiento integrado, se puede usar el dictado del teclado del dispositivo, sujeto a sus propios ajustes de privacidad. El texto y el formulario siguen funcionando sin conexión una vez cargada la aplicación. La cartera debe desbloquearse normalmente; la función no mantiene una sesión abierta ni omite el bloqueo.

### Capturas sin desbloquear

Abre y desbloquea primero la cartera en cada dispositivo y espera el mensaje «Captura sin desbloquear preparada en este dispositivo». Al bloquearla, elige la cartera local y pulsa **Capturar sin desbloquear**. Escribe o dicta y guarda el pendiente. No cambia ningún saldo: al desbloquear, aparece en **Capturas pendientes** para revisar, corregir, registrar o descartar. «Hoy» y «ayer» se calculan respecto a la fecha de captura; revisa siempre la fecha propuesta.

La frase y la fecha se cifran localmente con una clave pública; la clave privada se guarda cifrada con la clave de la cartera. La confirmación del movimiento y el retiro del pendiente se guardan en la misma transacción local. La bandeja no se sincroniza ni forma parte del respaldo de la cartera: si borras los datos locales o pierdes el dispositivo antes de confirmar, perderás las capturas pendientes. La PWA y la APK mantienen bandejas independientes. Una persona con acceso al dispositivo puede intentar agregar o borrar pendientes, por eso no se registran automáticamente. El texto visible en pantalla y los proveedores de voz o teclado no quedan protegidos por este cifrado.

## Consultar y pagar planes

En Tarjetas pulsa Planes. Cada plan permite desplegar cuotas, corte, fecha de pago y saldo restante. Los cancelados se conservan para consulta sin generar obligaciones. Pagar cuota prepara un movimiento; revisa fecha e importe antes de guardarlo.

Al dividir una deuda después del corte, indica si el banco ya aplicó el diferimiento al corte recién emitido o si las cuotas empiezan en el próximo. La primera opción solo está disponible mientras ese corte sea estimado; úsala únicamente cuando el estado de cuenta del banco ya muestre su primera mensualidad. Después revisa y confirma el importe final del corte reportado por el banco.

En Movimientos, un pago permite Distribuir entre cuotas. Captura capital e interés por cuota, incluso de varios planes. La suma no puede superar el pago. Lo que no atribuyas mantiene una distribución estimada. Esta operación no vuelve a registrar el pago ni modifica su importe; funciona con conciliados, pero un periodo cerrado debe reabrirse primero.

Al registrar MCI puedes indicar interés total, mensualidad bancaria, tasa para cuota/capital fijo o tabla del banco. Previsualizar amortización permite revisar todas las cuotas sin guardar. Vuelve a calcular si cambias campos.

## Revisar importaciones y periodos

La importación muestra errores por fila. Solo las filas válidas pueden seleccionarse. Las referencias ya importadas están bloqueadas. Coincidencias con movimientos manuales o interés de planes quedan sin seleccionar: revisa si realmente es otro cargo antes de elegirlas.

En Periodos, Actividad muestra todas las tarjetas por rango sin exigir saldo inicial. Exportar actividad CSV incluye importes y conteos. Reconstruir y cerrar usa un saldo conocido; permite capturar deuda y disponible bancarios opcionales. Despliega un cierre para ver diferencias y descargarlo. Cerrar no concilia saldos automáticamente.

## Planear y aprender

Presupuesto → Desglose muestra ingresos, préstamos recibidos, reserva, gastos, pagos y compromisos por tarjeta/persona. Aprender ofrece lecciones y preguntas con explicación; el contenido se consulta offline y los enlaces a fuentes necesitan conexión.

Préstamos permite registrar deudas personales sin intereses o préstamos bancarios de tasa fija. Para los bancarios captura capital/saldo pendiente, tasa anual, plazo, frecuencia mensual o quincenal y fecha de primera cuota; las quincenas vencen el 15 y el último día del mes. Se estiman las cuotas, intereses en cada vencimiento y saldo restante. Registra el importe real que pagaste y programa pagos futuros por separado. Las estimaciones no incluyen tasa variable, CAT, seguros, comisiones ni ajustes del estado de cuenta; verifica el saldo y la cuota con tu banco.

Calendario permite elegir de cero a diez días de anticipación. La fecha sugerida se limita al día de ingreso y no mueve la quincena con la que pagarás. La preferencia se guarda por navegador, sin información financiera.

Análisis permite comparar gastos, comisiones e intereses por periodo y tarjeta. El uso de línea compara deuda/límite registrados; no es un puntaje crediticio.

Simulador requiere saldo, mínimo fijo y tasa mensual nominal de cada deuda revolvente, más presupuesto mensual total. Compara avalancha y bola de nieve y permite descargar tablas. No uses CAT dividido entre doce ni mezcles capital MSI con deuda revolvente. No incorpora compras nuevas, comisiones o impuestos; no cambia tu cartera. La simulación y las respuestas educativas se descartan al salir de sus vistas.

## Notificaciones y eliminación

Preferencias permite activar notificaciones en este navegador. Necesitan permiso del sistema y cartera abierta/desbloqueada. Los mensajes no muestran importes ni nombres. Inicio conserva los avisos aunque el navegador no permita notificaciones.

Eliminar tarjeta e historial necesita confirmación y retira todos sus registros activos de cálculos; las versiones cifradas anuladas se conservan para sincronización. Para conservar consulta, usa Archivar tarjeta liquidada. Un préstamo solo se elimina si nunca tuvo abonos registrados, aunque estén anulados.

## Categorías, recurrencias y ahorro real

Se añadieron cuatro secciones: Categorías, Recurrencias, Cuentas y Metas. [Instrucciones de uso y Android](PLANNING_AND_ANDROID.md). Cuentas lleva movimientos reales; Metas reserva dinero existente; Recurrencias propone cargos para confirmar. Los límites de categorías avisan y no duplican el presupuesto.

## Navegación

El menú y la barra superior permanecen visibles al desplazarte. La lista de opciones tiene su propio desplazamiento cuando no cabe en pantalla. En escritorio y tablet, el botón junto al logo permite «Reducir menú» a una columna de iconos y «Expandir menú» para mostrar los nombres; la elección se conserva en este navegador. En teléfono, las opciones se recorren horizontalmente.

Cuando aparezca «Actualizar aplicación», púlsalo para activar la versión descargada. La cartera se bloqueará y podrás volver a abrirla con tu contraseña. El aviso de actualización permanece visible encima del contenido.

## Apariencia

La interfaz usa azul intenso, azul marino y superficies blancas. Los colores personalizados de tus registros se conservan. [Paleta y criterios de uso](COLOR_PALETTE.md).

En Tarjetas, cada tarjeta resume límite, deuda actual, disponible y deuda a meses. Pulsa el último renglón para abrir los planes. Allí se agrupan en «En curso», «Liquidados» y «Cancelados»; cada grupo se despliega por separado. El menú de tres puntos reúne las acciones por tipo.
