# Revisión de equivalencia con la aplicación anterior

Revisión del 6 de octubre de 2026. La referencia es la versión privada WPF y ASP.NET, incluyendo sus servicios financieros y flujos web. El objetivo es conservar los procesos útiles y los importes, adaptando acceso, persistencia y sincronización a una PWA estática.

## Matriz de funciones

| Proceso anterior | Equivalencia en la PWA | Evidencia |
| --- | --- | --- |
| Alta y edición de tarjeta, color, límite, corte y vencimiento | Tarjetas y formularios; deuda inicial en periodo actual/anterior; offset de meses para Plata | Contratos, comandos y escenarios .NET; navegador PC/móvil |
| Disponible, deuda, saldo a favor y alertas de cuadre | Saldos en centavos; conciliación mantiene historial y evita repetir movimientos incorporados | Escenario available-debt y comandos |
| Ordenar por deuda; cuatro tarjetas por fila y menú | Tarjetas ordenadas por mayor deuda, modal por tarjeta y menú de acciones | Navegador y cálculo de vista |
| Archivar y eliminar tarjeta | Archivo solo al liquidar. Eliminación confirmada anula tarjeta y registros relacionados en una operación causal | Prueba de eliminación atómica; navegador |
| Gasto, pago, comisión e interés; programar, realizar, anular/restaurar | Movimientos y acción global del encabezado; filtros por tarjeta, descripción, tipo y fechas | Comandos y navegador |
| Dividir deuda/compras; MSI/MCI; editar y deshacer | Planes con deuda libre vigente; protecciones de pagos/conciliaciones; interés devengado conservado al cancelar | Escenarios edit-and-pay-installment y purchase-reclassification |
| Cuota fija, capital fijo, tabla bancaria y mensualidad informada | Formulario con las cuatro alternativas y vista previa antes de guardar | Tres amortizaciones .NET y navegador |
| Planes cancelados, desglose y registro de pago por cuota | Historial en modal; cancelados sin obligaciones ni edición; Pagar cuota prepara movimiento real | Comandos y navegador |
| Atribuir un pago a varias cuotas, incluido un pago conciliado | Distribuir entre cuotas modifica únicamente atribuciones; conserva importe, fecha, conciliación y saldo bancario | Prueba de varias cuotas y periodo cerrado; navegador |
| Cortes estimados, confirmar/editar/registrar otro, apartados | Revisión de corte, registro independiente y reservas; confirmados no se sustituyen con nuevas compras | Escenario bank-confirmed-target y comandos |
| Calendario, reglas de ingreso 15/fin de mes, anticipación y todo el horizonte | Calendario y presupuesto hasta último compromiso; anticipación 0–10 días sin adelantar la quincena; préstamos integrados sin duplicar | 240 vectores de quincenas; 120 cuotas; escenarios .NET y navegador |
| Ingresos, gastos, reserva y presupuesto por quincena | Preferencias y detalle por tarjeta/persona, dinero prestado recibido, pagos reales y nota | Escenario personal-loans-budget; navegador |
| Préstamos, abonos, programación, archivo y eliminación sin historial | Préstamos; eliminación conserva restricción aun con abonos anulados | Pruebas de comandos y .NET |
| Resumen de todas las tarjetas por rango, CSV | Periodos → Actividad; no requiere saldo histórico, separa realizados y programados | Prueba de resumen sin base anterior; navegador |
| Cierres, saldos inicial/final, comparación bancaria, CSV, reapertura | Reconstrucción separada del resumen; detalles guardados, diferencias y protección de historial | Comandos, coherencia y navegador |
| CSV/XLSX, mapeo, duplicados y errores por fila | Importación con revisión, filas inválidas separadas, advertencia de coincidencia manual/interés de plan | Pruebas de importación y lectura XLSX en navegador |
| Avisos de cortes/pagos; atendido y posponer; navegador abierto | Inicio y Preferencias; notificación opcional por dispositivo, sin nombres ni importes, solo desbloqueado | Pruebas de avisos y navegador |
| Exportar/importar respaldo y datos .NET | Respaldo cifrado, recuperación y migración previa revisión; identidades e historial conservados | Pruebas de importación, navegador y aceptación personal |
| Actualización de cálculos al guardar | Vistas derivadas del estado actualizado; sincronización vuelve a validar relaciones e historia | Comandos, coherencia, CAS y recorridos de dos contextos |

## Diferencias deliberadas

- Incluir/excluir se representa con anular/restaurar; una fecha programada necesita confirmación real. No se inventan pagos ni tarjetas de prueba.
- La eliminación conserva versiones cifradas anuladas para que otro dispositivo no resucite registros. No equivale a borrar físicamente datos de Drive ni tiene restauración masiva en la interfaz.
- La cartera sustituye el inicio de sesión del servidor por desbloqueo local. Google autoriza únicamente sincronización. No hay backend .NET, cron ni notificaciones con la app cerrada.
- Los cierres solo cubren hasta 366 días transcurridos con saldo base conocido; el resumen de actividad admite hasta 3660 días y operaciones futuras contadas por separado.
- Se usa el pago para no generar intereses del banco como objetivo. La aproximación antigua del mínimo como porcentaje genérico de deuda no se presenta como mínimo bancario.
- Una importación de datos anterior diferente a registros ya existentes se rechaza para revisión; no sobrescribe silenciosamente. La vista previa muestra filas bancarias inválidas y deja elegir las válidas.
- Las referencias bancarias ya importadas no se vuelven a incorporar. Una coincidencia manual o interés calculado requiere selección expresa. Filas independientes idénticas sin referencia siguen siendo operaciones distintas.
- La recuperación cambia la contraseña en el dispositivo; propagación de cabeceras y elección de versiones siguen el flujo cifrado, sin enviar claves a Google.
- APK nativa, Google Sign-In Android y almacenamiento nativo seguro continúan como fase distinta. La PWA Android instalada y el uso offline ya fueron probados por el usuario.

## Método de verificación

Se contrastaron tres niveles: rutas y formularios de la aplicación anterior; reglas de sus servicios frente al dominio y comandos TypeScript; acceso real a los flujos nuevos desde la interfaz de PC y móvil. Las comprobaciones anteriores `.NET WebChecks` se ejecutan con datos sintéticos aislados. La PWA conserva los ocho escenarios de referencia, incluyendo quincenas, amortización, Plata, conciliación y préstamos; las nuevas pruebas cubren omisiones de interfaz y operaciones adicionales.

Esta equivalencia funcional no garantiza ausencia absoluta de errores. La cartera personal no se abre en las pruebas automáticas. El usuario considera correcta su revisión de la migración; resta la confirmación explícita de coincidencia final del conflicto entre ambos dispositivos y el seguimiento de uso cotidiano.
