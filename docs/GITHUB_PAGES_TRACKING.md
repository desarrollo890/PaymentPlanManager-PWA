# Seguimiento de implementación web

Actualizado el 6 de octubre de 2026. La implementación financiera, el almacenamiento cifrado y la PWA están conectados. La aceptación personal sigue abierta en los puntos que necesitan la cuenta o los dispositivos del usuario.

| Fase | Estado | Evidencia / siguiente paso |
| --- | --- | --- |
| F0 · Contratos y viabilidad | Validado con pruebas automáticas y aceptación del usuario | Esquemas estrictos, AES-GCM/PBKDF2 y OAuth del probe. Recuperación con datos iguales y apertura offline en teléfono físico aprobadas; desbloqueo reportado como aproximadamente inmediato. |
| F1 · Workspace y CI | Implementado | Seis paquetes; tipos estrictos, dominio sin DOM/Node y pipeline de publicación. |
| F2 · Motor financiero | Completado y verificado | Todas las instantáneas de ocho escenarios .NET, 240 quincenas, 120 cuotas y tres amortizaciones; saldos, cortes, préstamos y horizonte completo. |
| F3 · IndexedDB y cifrado | Implementado y verificado automáticamente | Persistencia real en navegador; CAS, cambios/outbox atómicos, grupos de 1001 operaciones en lotes acotados, bloqueo, respaldo y recuperación. Versiones desconocidas se rechazan; existe migración del JSON anterior a v1. |
| F4 · PWA funcional | Implementado y verificado automáticamente | Tarjetas, movimientos, MSI/MCI, cortes, préstamos, presupuesto, avisos y periodos. CSV/XLSX, exportaciones, recarga/registro offline y actualización protegida. |
| F5 · Fusión y conflictos | Implementado y verificado automáticamente | Revisiones causales, reintentos, grupos incompletos, ramas conservadas, fusión de presentación y decisiones visibles. Validación de capacidad, atribuciones y cambios de historia entre entidades. |
| F6 · Drive web | Sincronización y elección de versión comprobadas; coincidencia final pendiente | El usuario confirmó un gasto offline conservado y sincronizado y la elección de una versión del gasto en conflicto. Falta confirmar que ambos dispositivos muestran el mismo importe final. |
| F7 · Importación y piloto | Respaldo, recuperación y revisión de migración aprobados | Importación repetida sin duplicados, respaldo alterado rechazado y recuperación con datos iguales, reportados por el usuario. El usuario reportó correcta su revisión de la importación; continúa seguimiento de uso cotidiano. |
| F8 · Publicación funcional | Publicado; recorrido físico aprobado por el usuario | CI y HTTPS verificados. En teléfono físico con Chrome: apertura offline correcta, gasto conservado y sincronizado, desbloqueo aproximadamente inmediato. El cierre global sigue sujeto a F6/F7. |

## Comprobaciones de esta entrega

- `npm run check`: 62 pruebas unitarias, cuatro pruebas del probe Google, contratos, dependencias, tipos y build.
- `npm run test:architecture`: 17 pruebas de prototipos, incluyendo el vector Argon2id. El producto utiliza PBKDF2; ese vector no implica uso de Argon2id en la PWA.
- `npm run test:browser`: recorridos Chromium de 1440×1000 y 390×844 con datos sintéticos; creación, cuatro tarjetas en una fila, MSI/edición/saldo libre, horizonte, CSV sin duplicados, respaldo, contraseña incorrecta, recuperación, offline y actualización.
- Dos contextos de navegador con IndexedDB aislado y Drive REST simulado: movimientos independientes offline, respuesta de upload perdida, conflicto financiero/resolución, bloques alterados, CAS/outbox, tombstones importados, grupo de 1001 operaciones y tokens en memoria/revocación.
- Lectura XLSX con ZIP/deflate y XML limitada y sin ejecutar fórmulas. Importes exactos contrastados en navegador.

Las pruebas automáticas no acceden a la cuenta Google del usuario ni a sus datos financieros. La [prueba personal pendiente](PERSONAL_ACCEPTANCE.md) describe la intervención necesaria para cerrar F6/F7/F8.

## Publicación verificada

- Implementación: commit `b9947d9`, [CI y despliegue aprobados](https://github.com/desarrollo890/PaymentPlanManager-PWA/actions/runs/37548729320).
- Recorridos sintéticos contra la URL HTTPS publicada: PC y móvil emulado; cartera cifrada, cuatro tarjetas, planes, importación sin duplicados, respaldo, recuperación, recarga y registro sin conexión. La actualización protegida del service worker se comprobó en el servidor local controlado.
- El sitio publicado carga el SDK real de Google Identity Services respetando su CSP. Esta comprobación no abre sesión ni concede acceso a Drive.
- Revisión previa a publicación: 106 archivos candidatos y seis commits, sin detecciones de secretos mediante Gitleaks; identidad de autor y committer genérica. Esta revisión automática no equivale a una auditoría de seguridad independiente.
- Los proyectos de escritorio y servidor permanecen en el repositorio privado original; no se trasladaron al público. Los archivos de evidencia local y los datos sintéticos de los recorridos de navegador no se publican.

## Aceptación reportada por el usuario

- La segunda importación del mismo respaldo no duplicó registros.
- La copia alterada del respaldo fue rechazada.
- Recuperación con clave independiente y nueva contraseña: datos iguales.
- Teléfono físico con Chrome: apertura sin conexión correcta; gasto de prueba de $10 conservado y sincronizado; desbloqueo aproximadamente inmediato.
- La revisión de versiones apareció en la laptop y el usuario confirmó que eligió una versión. No se ha recibido aún confirmación de la coincidencia final de ambos dispositivos.
- El usuario reportó correcta su revisión de la importación de datos de la aplicación anterior. Estas evidencias no equivalen a una auditoría de seguridad ni a aceptación para producción.

Durante la revisión de la migración se corrigieron dos omisiones de presentación: las tarjetas muestran el límite de crédito importado y sus planes se consultan en un modal por tarjeta, solicitado por el usuario, con saldos, cuotas, edición y resúmenes al corte. Build y recorridos PC/móvil comprueban el límite, cuatro tarjetas por fila, apertura del modal desde ambos botones, foco, edición y cierre con X/Escape. La prueba de actualización espera la recarga real antes de desbloquear para evitar una carrera del navegador. La revisión de la migración fue considerada correcta por el usuario.

Se corrigió también, por separado en el repositorio privado original, el menú lateral que ocultaba la exportación en pantallas bajas. Una prueba de HTML/CSS sin datos personales verifica el acceso al botón a 1280×600 y 1280×1000. El código de escritorio y servidor continúa fuera del repositorio público PWA.

## Evidencia previa de Google

El usuario reportó `integrityVerified: true`, `synthetic: true` y `listedInAppDataFolder: true` desde la herramienta local. No se publican IDs de archivo/bloque, tokens o claves. Eso acredita la prueba del probe, no todavía una cartera sincronizada por esta aplicación. La interoperabilidad Android nativa permanece fuera de la entrega web.

[Repositorio](https://github.com/desarrollo890/PaymentPlanManager-PWA) · [Aplicación HTTPS](https://desarrollo890.github.io/PaymentPlanManager-PWA/) · [Ejecuciones de CI](https://github.com/desarrollo890/PaymentPlanManager-PWA/actions/workflows/pages.yml)

## Revisión de equivalencia y primera fase de mejoras

Se completaron tres pasadas de revisión: inventario de procesos anteriores, reglas/contratos y recorrido PC/móvil. La [matriz](PARITY_REVIEW.md) incluye omisiones corregidas y diferencias explícitas. Se incorporaron pagos por cuota, distribución entre cuotas, cancelados, mensualidad bancaria/vista previa, eliminación causal, resumen global, detalle de cierres y bancos, filtros, importación con errores por fila y avisos opcionales del navegador. El menú de tarjeta se eleva y desplaza para seguir accesible en móvil.

Aprender, Análisis y Simulador implementan la primera fase del [plan de evolución](ENHANCEMENT_PLAN.md). Los nuevos reportes y cálculos no cambian el contrato de datos v1. Las cuentas y datos reales no se utilizan en las pruebas.
