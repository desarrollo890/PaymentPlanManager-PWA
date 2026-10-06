# PaymentPlanManager PWA

Aplicación personal para organizar tarjetas, préstamos y pagos con los ingresos del 15 y del último día del mes. React y TypeScript ejecutan los cálculos en el navegador; GitHub Pages sirve los archivos estáticos. No requiere un servidor .NET.

[Abrir PaymentPlan](https://desarrollo890.github.io/PaymentPlanManager-PWA/). Esta entrega permite usar una cartera local cifrada y trabajar sin conexión después de la primera carga. La aceptación con dos navegadores autorizados por el usuario y la importación de su cartera real siguen pendientes; las comprobaciones automáticas usan datos sintéticos.

## Funciones

- Tarjetas con color, deuda, disponible, deuda a meses, orden por deuda y alertas de cuadre.
- Gastos, pagos, intereses y comisiones; programación, corrección, anulación, atribución a cuotas y conciliación bancaria.
- MSI/MCI, compras nuevas y división de deuda registrada; saldo libre vigente, amortización y edición con protección del historial.
- Cortes estimados para confirmar o editar, vencimientos como Plata y pagos asignados a la quincena correcta.
- Calendario y presupuesto hasta el último compromiso; ingresos, gastos esenciales, reserva y préstamos de personas sin intereses.
- Resúmenes al corte y por periodo, cierres, avisos atendidos o pospuestos y exportación CSV.
- Importación bancaria CSV/XLSX y transferencia del JSON anterior con previsualización, cuadre e identificadores estables.
- Respaldo cifrado, recuperación independiente, bloqueo automático y actualizaciones de la PWA que conservan el almacenamiento.
- Drive appDataFolder opcional: bloques cifrados inmutables, sincronización manual/automática, reintentos y revisión visible de conflictos financieros.

## Empezar

1. Crea una cartera con una contraseña de al menos 12 caracteres y guarda su clave de recuperación por separado del respaldo.
2. Registra las tarjetas con sus saldos iniciales o importa un respaldo anterior desde Preferencias. Revisa los importes antes de confirmar.
3. Registra movimientos y planes. El sistema estima qué pagar; compara los cortes con el banco y realiza tú los pagos.
4. Configura ingresos y reserva. Si quieres sincronizar, prepara y autoriza Google Drive desde Preferencias.

La contraseña y los tokens permanecen en memoria. IndexedDB guarda envolturas de claves y bloques AES-256-GCM. La derivación final usa PBKDF2-SHA256 con 600 000 iteraciones y sal aleatoria de 16 bytes; Argon2id permanece solo como experimento de arquitectura. La recuperación cambia la envoltura de contraseña, conservando la clave de datos. No invalida claves o respaldos antiguos que alguien ya hubiera copiado.

Los tokens de Google no se guardan ni se renuevan sin intervención. Al caducar la autorización, vuelve a pulsar el botón. El uso local no depende de Google. Los avisos aparecen con la aplicación abierta; no se hacen transferencias bancarias ni notificaciones con la aplicación cerrada.

## Desarrollo y comprobaciones

Requiere Node 24.13.0 y npm. Conserva `PaymentPlanManager` y `PaymentPlanManager-PWA` como carpetas hermanas; puedes agregar ambas al mismo workspace de VS Code. Ejecuta los comandos web desde la segunda carpeta.

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

En PowerShell puedes usar `npm.cmd`. React escucha en `http://localhost:5173/PaymentPlanManager-PWA/`. La herramienta Google de viabilidad usa ese mismo puerto; detén un servidor antes de iniciar el otro.

Las pruebas verifican la referencia financiera independiente de .NET, contratos, tipos y dependencias; IndexedDB real, dos dispositivos aislados con Drive simulado, conflictos, recuperación y atomicidad de grupos; recorridos PC/móvil, importación, funcionamiento offline y actualización. `tools/architecture` y `tools/google-probe` no forman parte del artefacto publicado.

## Publicación

El workflow valida las pull requests y publica `apps/pwa/dist` cuando `main` supera las comprobaciones. La base es `/PaymentPlanManager-PWA/`; la navegación por hash permite recargar cualquier sección. El service worker solo almacena el código y los assets propios, sin guardar respuestas de Drive o Google.

Este repositorio mantiene un historial independiente con identidad genérica. Los Client IDs son configuración pública. Datos personales, tokens, contraseñas, claves, respaldos y exportaciones deben permanecer fuera de Git.

[Plan](docs/GITHUB_PAGES_PLAN.md) · [Seguimiento](docs/GITHUB_PAGES_TRACKING.md) · [Prueba personal pendiente](docs/PERSONAL_ACCEPTANCE.md) · [Motor financiero](docs/FINANCIAL_ENGINE.md) · [Contratos](docs/GITHUB_PAGES_CONTRACTS.md)
