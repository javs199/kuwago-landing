# Kuwago — Revisión final de seguridad antes de D1 Edit

24/10/2026 · America/Costa_Rica · Auditoría local de código, documentación y evidencias.

**Dictamen: NO-GO para solicitar la creación de D1 Edit y NO-GO para migrar.** Existen controles sólidos para desarrollo local y diagnóstico remoto de lectura. No existe todavía el ejecutor remoto de migraciones que imponga las restricciones del plan. Un procedimiento escrito, una configuración de ejemplo y un ensayo local no son un control de escritura implementado.

El usuario informa que eliminó el token D1 Read desde Cloudflare; se registra como evidencia manual, sin reconsultar la cuenta. El GET/SELECT HTTP 200 de 2C.4 sigue siendo evidencia histórica de acceso y esquema, no una sesión disponible ni un preflight actualizado. No se intentó reutilizar la credencial.

## 1. Clasificación de los ocho controles

La clasificación corresponde a su preparación para una futura operación remota con D1 Edit. Se diferencia expresamente lo que ya funciona en local o lectura.

| # | Control | Clasificación | Evidencia y límite |
|---|---|---|---|
| 1 | Bloqueo estricto a cuenta, UUID y nombre DEV | **Bloqueante** | El diagnóstico Read fija cuenta/UUID y comprueba nombre/UUID antes del SELECT (E1); pruebas positivas y negativas aprobadas. El wrapper de migraciones solo permite local y rechaza IDs reales (E3). No existe control equivalente en un ejecutor remoto Write |
| 2 | Lista cerrada de seis SQL y hashes | **Pendiente** | Implementado y comprobado en `d1-readiness-local` (E2): lista literal, archivos exactos y seis SHA-256. No está integrado en `migrate:local` genérico ni en un ejecutor remoto. El futuro Write debe validar la lista y los hashes aprobados antes de cualquier escritura |
| 3 | Preflight remoto separado de escritura | **Pendiente** | Separación real del diagnóstico 2C.4: GET y SELECT fijos, sin mutación, sin reintentos. Falta un preflight de migración que compare el esquema exacto esperado y una barrera que impida escribir sin aceptarlo. `status: passed` del diagnóstico solo certifica sus lecturas, no que la base sea apta para migrar |
| 4 | Respaldo y recuperación antes de migrar | **Bloqueante** | Plan detallado y restore local probado (E5/E6). No hay bookmark/export remoto previo ni verificación del export real. Tampoco existe bloqueo del futuro escritor si falta respaldo. El backup lógico requiere esquema ya migrado; no respalda la base inicial vacía |
| 5 | Prohibición de SQL en otras D1 | **Bloqueante** | Se cumple en la herramienta Read de destino fijo y los wrappers solo locales. Falta imponerlo en el flujo Write. Un token de alcance cuenta no proporciona, por sí solo, aislamiento por UUID; la prohibición del plan no restringe al CLI Cloudflare genérico |
| 6 | No persistir/exponer tokens | **Implementado, con alcance limitado a lo auditado** | Formulario enmascarado, token por entorno del hijo, cero secretos en argumentos, limpieza y errores depurados en el flujo Read (E1/E4). Escaneo nuevo sin candidatos en el alcance indicado abajo; variable de token ausente. Esto no certifica una ausencia universal ni cubre un lanzador Write aún inexistente |
| 7 | Lotes y parada automática ante fallo | **Bloqueante** | Ensayo local por etapa con assert de exit status, ledger e integridad; resultados de seis etapas conservados (E7). El wrapper genérico propaga el exit code, pero no es un orquestador remoto con checkpoints. No hay pruebas del ejecutor Write que demuestren parada ante fallo, timeout ambiguo o verificación posterior fallida |
| 8 | Revocar futura credencial al terminar | **Pendiente** | El plan exige revocación humana por Dashboard, incluso tras fallo/cancelación, y evidencia de cierre (E6). Es adecuado no conceder administración de tokens al credential de migración. No existe token nuevo que revocar ni responsable/ventana de la operación futura aprobados. Limpieza de entorno no equivale a revocación |

**Conclusión:** no puede afirmarse que los ocho controles estén implementados para escritura remota. Los controles 1, 4, 5 y 7 impiden aceptar hoy ese flujo. Los pendientes 2 y 3 deben integrarse en el mismo ejecutor antes de usar Write; el 8 requiere un cierre operativo con responsable y evidencia, no una capacidad de autorrevocación del token.

## 2. Evidencias verificables de código

Raíz auditada: `C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source`.

- **E1 — [Diagnóstico de lectura](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/d1-read-diagnostic.mjs:5>):** constantes de cuenta y UUID; línea 22 rechaza entorno distinto; línea 25 construye URL exacta; línea 38 coteja nombre/UUID. Línea 7 fija SELECT; línea 29 rechaza redirecciones y limita tiempo; líneas 53–54 limpian token/Authorization. El marcador de intento evita repetir la ejecución accidentalmente. No hay fallback OAuth.
- **E2 — [Verificador local de migraciones](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/d1-readiness-local.mjs:17>):** seis nombres literales; compara manifiesto, directorio y hashes. Línea 29 fuerza `--local`; línea 31 aborta ante exit status no cero. Las comprobaciones/restauración usan destinos aislados, sin IDs reales.
- **E3 — [Wrapper local](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/local.mjs:7>):** valida configuración local; `migrate`/`migrate-verify` usan `--local`; rechaza argumentos extra y acciones desconocidas; retira variables Cloudflare/Wrangler del entorno de hijos. No calcula hashes de SQL antes de llamar al CLI. Su salida heredada está diseñada para local; no debe reutilizarse sin revisión de redacción para un proceso con credenciales reales.
- **E4 — [Formulario existente](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/d1-read-credential.ps1:49>):** campo oculto, argumentos sin token, `UseShellExecute=false`, entrega por entorno, no imprime stdout/stderr, limpia campo/variables. Solo invoca el diagnóstico Read, no las migraciones. No se abrió el formulario en esta revisión.
- **E5 — [Recuperación lógica](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/src/catalog/recovery.ts:27>):** requiere `publication_control`; comprueba hash/esquema/destino aislado y restaura con `db.batch`; nueva época y publicación pausada. No es un respaldo del estado pre-0001 ni una herramienta remota autorizada.
- **E6 — [Plan 2C.5](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/docs/PHASE-2C5-D1-MIGRATION-PLAN.md>):** declara que config/lanzador están pendientes, detalla respaldos, etapas, condiciones de parada, límites de cuenta y revocación. No se encontró el archivo candidato `wrangler.d1-development.operation.json`: permanece únicamente como bloque de documentación, tal como el plan indica.
- **E7 — [Ensayo escalonado local](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/.wrangler/phase2c5/staged.mjs>):** fuerza `--local`, retira variables, genera patrón exacto por etapa, verifica hashes y aborta por assert; resultados previos en [result.json](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/.wrangler/phase2c5/788ec64c/result.json>). Es artefacto ignorado de ensayo, no un ejecutor remoto ni una lista cerrada independiente del manifiesto. No se promovió ni ejecutó con Write.

El [candidato remoto existente](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/wrangler.remote-development.example.json>) sigue con placeholders y entrypoint bloqueado. Eso no reemplaza validar una configuración D1 específica de operación. `remote:false`, `workers_dev:false` o ausencia de entrypoint no impiden por sí solos que alguien invoque otros comandos de Wrangler con un token amplio.

## 3. Comprobaciones nuevas, sin red remota

Ejecutado desde `infra/cloudflare/dev`:

```powershell
node --test test/config-storage.test.mjs test/d1-read-diagnostic.test.mjs
npm run lint
```

Resultado: **14/14 tests aprobados**, cero fallos/omitidos/cancelados; lint correcto. No hubo build/deploy ni migraciones en esta revisión.

Además, un chequeo local independiente confirmó:

- Directorio y manifiesto contienen exactamente 0001–0006; seis hashes coinciden.
- Nombre incorrecto con UUID correcto: una sola llamada al fetch simulado de metadatos, rechazo antes de SELECT.
- UUID incorrecto con nombre correcto: mismo rechazo, sin SELECT.
- Ambos casos eliminan la credencial **sintética** del entorno de prueba. Ninguna llamada usa `fetch` real.

Las pruebas existentes también comprueban cuenta/ID de entrada incorrectos, credencial ausente, 10000, redirecciones/fallo de red, ausencia de reintentos y redacción de errores. No ejecuté el CLI real del diagnóstico: conserva su evidencia y marcador anteriores.

Se revisaron, sin repetir, las evidencias de 2C.5: 85 regresiones aprobadas, seis etapas locales con repetición no-op, integridad limpia y restauración aislada. Esos resultados no se presentan como pruebas nuevas del ejecutor remoto ni de permisos D1 Edit.

## 4. Revisión de secretos y límites de la evidencia

Escaneo local, sin imprimir líneas coincidentes, valores, argumentos de procesos ni historial completo. Se buscaron asignaciones literales de token Cloudflare, Bearer literal, JWT compacto y bloques de clave privada. Se excluyeron marcadores sintéticos reconocibles. Solo se guardaron métricas/resultados depurados.

| Alcance | Resultado |
|---|---|
| Archivos de texto de trabajo, incluidos código/config/docs y logs bajo `.wrangler` | 468 archivos, 7.284.746 bytes; 0 candidatos por esos patrones |
| Historial Git alcanzable por `git rev-list --objects --all` | 424 blobs inventariados, 206.395.011 bytes; inspección de blobs sin indicador binario inicial; 0 candidatos |
| Historial PSReadLine disponible en ubicaciones estándar | 1 archivo; 0 candidatos; contenido no mostrado |
| `CLOUDFLARE_API_TOKEN` en el proceso auditor | Ausente; no se mostró ningún valor |
| Archivos grandes omitidos del árbol de trabajo | 0 dentro del alcance textual seleccionado |

Resultado depurado: [secret-scan.json](<C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/.wrangler/security-review/secret-scan.json>), excluido por Git. Se comprobó `.gitignore`: excluye `.wrangler`, logs y archivos de entorno privados. Ignorar un archivo no demuestra que no contenga secretos ni retira uno previamente versionado; por eso se revisaron tanto texto de trabajo como objetos Git alcanzables.

**Límites:** no se certifica ausencia absoluta de secretos codificados, formatos no reconocidos, archivos binarios, dependencias/generados excluidos, otros perfiles/historiales, portapapeles, memoria, registros del sistema, configuraciones OAuth fuera del proyecto, chats o logs externos. No se inspeccionaron almacenes privados de autenticación ni objetos Git inalcanzables/reflogs. No se conoce el valor del token revocado para buscar su cadena exacta. La revocación remota se basa en el reporte del usuario, no en una consulta a Cloudflare.

Los árboles nuevos de infraestructura/contratos siguen sin versionar en Git. El escaneo del árbol de trabajo los incluye; revisar solo `git diff` o historial Git habría omitido ese código. No se hizo commit para cambiar esta situación. Para una futura operación se necesita fijar un paquete revisado de archivos/configuración/hashes, aunque su aprobación no requiera un commit nuevo en esta fase.

## 5. Hallazgos que deben cerrarse antes de solicitar D1 Edit

1. **Ejecutor remoto de alcance fijo inexistente.** Prepararlo y probarlo localmente sin token real: cuenta/UUID/nombre exactos, comandos permitidos, cero argumentos de SQL/base/config arbitrarios, sin fallback OAuth ni selección automática de otra cuenta. No convertir el formulario Read en un ejecutor genérico.
2. **Lista y hashes no obligatorios en el camino Write.** Fijar los seis archivos/hashes aprobados, rechazar SQL extra/renombrado/modificado y alteraciones de config. No confiar solo en un manifiesto editable junto con el SQL. Evitar cambios entre verificación y uso mediante un lote revisado estable; revalidar por etapa.
3. **Faltan barreras de preflight/respaldo.** Un GET/SELECT exitoso no autoriza escribir. Comprobar esquema real, ausencia de ledger/app esperada, identidad del respaldo, integridad y vigencia. Ante discrepancia, no tocar ledger ni adaptar el esquema automáticamente. El artefacto de aceptación no debe ser un booleano libre ni una evidencia de otra base/fecha.
4. **Parada por etapa no demostrada en el camino remoto.** Pruebas locales con transportes simulados deben asegurar que un error, respuesta inválida, 10000, timeout, FK/quick_check/ledger incorrectos o respaldo ausente impiden la siguiente etapa. Resultado desconocido exige reconciliación de lectura y revisión humana, nunca retry automático. La cadena no es una única transacción.
5. **Preparar operación de credencial y cierre.** El futuro lanzador debe conservar el tratamiento en memoria, depurar salidas antes de persistirlas y retirar secretos en éxito/fallo/cancelación. Asignar responsable humano, TTL corto y revocación con evidencia. No otorgarle permiso de administrar tokens para automatizar su propia revocación.

Estas son recomendaciones de cierre de la auditoría, **no modificaciones implementadas en este turno**. No hace falta crear una credencial Write para desarrollar y probar los controles locales.

## 6. GO / NO-GO final

| Decisión | Dictamen |
|---|---|
| Continuar preparación y pruebas locales del ejecutor seguro | **GO técnico**, sin credenciales reales y dentro de una tarea posterior autorizada |
| Pedir ahora autorización para crear D1 Edit para usar el flujo actual | **NO-GO**: falta el mecanismo que limitaría su uso |
| Crear token o ampliar permisos | **NO-GO / no realizado** |
| Obtener nuevo preflight o respaldo remoto | Requiere autorización separada; **no realizado** |
| Migrar/bootstrap/restaurar remotamente | **NO-GO** hasta cerrar controles, aceptar respaldo y autorizar cada operación |

Una vez cerrado el ejecutor local, se revisará nuevamente la conveniencia de crear la credencial temporal. La aprobación para crearla no autorizará SQL; respaldo y ejecución seguirán separados, como exige el plan 2C.5. La imposibilidad de limitar el token a un solo UUID deberá aceptarse explícitamente como riesgo residual o resolverse con otra separación aprobada.

Único entregable nuevo de esta revisión: este informe; además se generó evidencia depurada ignorada del escaneo. No se modificaron scripts, migraciones, hashes, configuración o frontend. No se creó token, no se consultó Cloudflare, no se ejecutó SQL remoto ni se hicieron deploy, commit o push. Se detiene para revisión y **no se solicita todavía autorización de D1 Edit**.
