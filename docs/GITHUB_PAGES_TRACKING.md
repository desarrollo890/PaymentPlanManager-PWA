# Seguimiento de implementación web

Actualizado el 6 de octubre de 2026. La implementación financiera, el almacenamiento cifrado y la PWA están conectados. La aceptación personal sigue abierta en los puntos que necesitan la cuenta o los dispositivos del usuario.

| Fase | Estado | Evidencia / siguiente paso |
| --- | --- | --- |
| F0 · Contratos y viabilidad | Implementado; validación física pendiente | Esquemas estrictos, AES-GCM/PBKDF2, recuperación independiente y pruebas en Chromium. OAuth real del probe previamente reportado por el usuario. Falta rendimiento/recuperación en su teléfono. |
| F1 · Workspace y CI | Implementado | Seis paquetes; tipos estrictos, dominio sin DOM/Node y pipeline de publicación. |
| F2 · Motor financiero | Completado y verificado | Todas las instantáneas de ocho escenarios .NET, 240 quincenas, 120 cuotas y tres amortizaciones; saldos, cortes, préstamos y horizonte completo. |
| F3 · IndexedDB y cifrado | Implementado y verificado automáticamente | Persistencia real en navegador; CAS, cambios/outbox atómicos, grupos de 1001 operaciones en lotes acotados, bloqueo, respaldo y recuperación. Versiones desconocidas se rechazan; existe migración del JSON anterior a v1. |
| F4 · PWA funcional | Implementado y verificado automáticamente | Tarjetas, movimientos, MSI/MCI, cortes, préstamos, presupuesto, avisos y periodos. CSV/XLSX, exportaciones, recarga/registro offline y actualización protegida. |
| F5 · Fusión y conflictos | Implementado y verificado automáticamente | Revisiones causales, reintentos, grupos incompletos, ramas conservadas, fusión de presentación y decisiones visibles. Validación de capacidad, atribuciones y cambios de historia entre entidades. |
| F6 · Drive web | Adaptador completo; prueba real pendiente | Dos dispositivos aislados pasan con REST simulado y bloques cifrados. Tokens solo en memoria, autorización explícita, caducidad, desconexión y revocación. Falta autorización real de la aplicación en dos navegadores. |
| F7 · Importación y piloto | Implementado; aceptación personal pendiente | Importación sintética conserva IDs, saldos, préstamos y horizonte; previsualización, cierres e idempotencia. Falta comparar y recuperar la cartera personal del usuario. |
| F8 · Publicación funcional | Publicado y verificado en HTTPS; aceptación física pendiente | CI aprobado y aplicación publicada. Recorridos de PC y móvil emulado pasan en el sitio real, con registro offline y recuperación. Falta el teléfono físico. |

## Comprobaciones de esta entrega

- `npm run check`: 54 pruebas unitarias, cuatro pruebas del probe Google, contratos, dependencias, tipos y build.
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
- El repositorio privado original conserva su código e historial sin cambios de esta entrega. Los archivos de evidencia local y los datos sintéticos no se publican.

## Evidencia previa de Google

El usuario reportó `integrityVerified: true`, `synthetic: true` y `listedInAppDataFolder: true` desde la herramienta local. No se publican IDs de archivo/bloque, tokens o claves. Eso acredita la prueba del probe, no todavía una cartera sincronizada por esta aplicación. La interoperabilidad Android nativa permanece fuera de la entrega web.

[Repositorio](https://github.com/desarrollo890/PaymentPlanManager-PWA) · [Aplicación HTTPS](https://desarrollo890.github.io/PaymentPlanManager-PWA/) · [Ejecuciones de CI](https://github.com/desarrollo890/PaymentPlanManager-PWA/actions/workflows/pages.yml)
