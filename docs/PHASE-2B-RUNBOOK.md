# KUWAGO — procedimiento propuesto de Fase 2B

Estado: RUNBOOK PARA REVISIÓN, no ejecutado. Basado en Fase 2A del 23/10/2026.
Una aprobación de planificación no autoriza automáticamente cambios remotos, DNS,
facturación, migraciones o publicación de contenido. Nombrar el bloque y el entorno
al autorizarlo; conservar los puntos de control siguientes.

## A. Puerta de entrada: decisiones del propietario

1. Revisar PHASE-2A-CLOUDFLARE.md y aceptar arquitectura con tres Workers, D1 privado
   y materialización R2, incluida ventana eventual de publicación/retiro.
2. Elegir cuenta(s) y alcance de 2B: desarrollo local primero, luego staging. No crear
   automáticamente todo development/staging/production. Presupuesto mensual y alertas
   por aprobar; confirmar plan Workers, R2 habilitable, Access y plan DNS de zona.
3. Designar responsables de operación/backup, roles y usuarios individuales con MFA;
   resolver autoaprobación/separación de funciones, retención y RPO/RTO.
4. Elegir camino DNS: delegación a Cloudflare conservando Hostinger, o investigar
   parcial si hay presupuesto/plan compatible. Export completo de zona, DKIM, CAA,
   DNSSEC/DS y rollback antes de aprobar cambios.
5. Registrar qué acciones REMOTAS concretas y entorno se autorizan. Sin eso continuar
   solo con implementación y pruebas locales; detenerse en la siguiente puerta.

## B. Implementación local, sin infraestructura remota

6. Revisar Git y preservar cambios. El repositorio contiene trabajo anterior sin
   commit; no usar reset/clean, commit o push sin autorización separada.
7. Elegir/fijar Wrangler estable, tipos Workers y verificador JWT; evaluar decoder
   de imágenes para CPU/memoria/EXIF. Instalar solo tras aprobar este bloque local.
   Crear paquetes reales solo al implementar apps/admin-web, apps/admin-api y
   apps/catalog-api; compartir contratos existentes, no duplicarlos.
8. Convertir plantillas a configs locales de desarrollo verificadas por schema de
   esa versión. Escucha loopback, simulaciones locales, persist-to por ambiente;
   nunca --remote, remote:true o conexión a producción por conveniencia.
   Los marcadores actuales NO son IDs válidos: sustituir por la configuración local
   que admita la versión elegida, no inventar UUID remotos. No activar dominios.
9. Implementar guardias fail-closed, permisos y Origin/header/método/cuerpo. JWT de
   prueba firmados por claves exclusivas de test en fixtures, imposibles de aceptar
   en producción; no login simulado habilitable por una variable pública.
10. Diseñar/revisar migraciones SQL y aplicar SOLO en base efímera/local autorizada
    para test. Mapear contratos: dinero menor entero, revisiones selladas, aprobación
    servidor por hash, FK, CAS con error SQL, auditoría y outbox.
11. Implementar upload privado y derivados aprobables. Elegir/medir decoder antes
    de dejar entrar archivos reales. Sin publicación por existir en R2 o por JSON
    que contenga approved=true.
12. Implementar exportador idempotente, manifiesto/ETag y generación monotónica.
    Validar PublicCatalogSchema y origen de URLs; público sin D1/private bindings.
    Sobre operativo pending/visible/failed separado de draft/published/archived.
13. Probar JWT ausente/falso/expirado/AUD de otro entorno/JWKS no disponible; roles
    revocados, autoelevación, Origin malicioso/ausente y form CSRF. Acceso a assets
    sin sesión, paths codificados, main alternativo, API directa y previews.
14. Probar SQL/rollback/carreras/idempotencia, falla de outbox, reintentos, corrupción
    de catálogo, medios privados/retirados, archivos falsos/enormes, cuotas y redacción
    de logs. Probar D1+R2 restore en entorno efímero. No usar datos reales privados.
15. Ejecutar los 67 tests previos, nuevos tests workerd/D1/auth/imagen, typecheck,
    lint y builds separados. Comparar landing/catálogo estático con 1C; no conectar API.
    Revisar artefactos: cero secretos, SQL, pruebas o Admin dentro del build Hostinger.

Salida de este bloque: código/configs/migraciones revisables y resultados locales.
Todavía SIN recursos remotos, login, DNS, Access o deploy.

## C. Verificación de cuenta, requiere autorización de acceso

16. El usuario inicia sesión en la cuenta elegida de Cloudflare. No ejecutar login
    CLI automáticamente. Leer cuenta/plan/facturación y anotar IDs no sensibles en
    inventario privado operativo; no imprimir ni compartir tokens/JWT/keys.
17. Verificar scopes disponibles, separar credenciales por ambiente/responsabilidad
    y confirmar si hace falta otra cuenta para producción. Verificar zona activa,
    acceso a R2, límites D1, Access/IdP/MFA, alertas de presupuesto y destinatarios.
18. Presentar inventario FINAL de staging, costos potenciales, cambios y rollback.
    Pedir autorización explícita de provisión antes de crear o habilitar recursos.

Salida: cuenta y capacidades comprobadas; NINGUNA provisión por solo haber ingresado.

## D. Provisión remota de staging, requiere aprobación específica

19. Crear únicamente D1 y buckets staging aprobados. Copiar sus IDs reales a las
    configs del entorno; verificar que no coincidan con producción/desarrollo.
    R2 privado, r2.dev/custom-domain apagados, backups sin binding a aplicación.
    No importar demos como oferta comercial ni copiar datos privados productivos.
20. Crear aplicaciones/políticas Access staging para Admin y para catálogo si se
    expondrá; audiencias únicas, identidad individual/MFA y denegación por defecto.
    Sin bypass de assets/API. No publicar endpoints antes de tener las guardias.
21. Registrar IDs/AUD/issuer correctos en config/secret store según corresponda.
    Un token CI staging no es un secreto de React ni debe ser aceptado para prod.
22. Revisar plan exacto de migraciones y autorizar ejecución staging por separado.
    Antes de una DB con datos, export/bookmark y rollback. Aplicar solo con config,
    cuenta y ambiente explícitos. Verificar tabla de migraciones, conteos y FK.

No incluir aquí comandos listos para crear recursos: se redactarán con los nombres
reales y CLI fijada después de la aprobación. No ejecutar placeholders o auto-provision.

## E. DNS/HTTPS y deploy de staging, puertas separadas

23. Si la zona aún no está activa, preparar copia exacta/export de DNS y plan DS/NS;
    autorización específica antes de delegar. Conservar apex/www a Hostinger y correo
    intacto. Resolver DKIM/CAA/DS antes del cambio. Probar entrega y HTTPS tras migrar.
    Si se decide DNS parcial, validar soporte/costo de rutas/certificados antes de pagar.
24. Aprobar custom domains y certificados SOLO staging. Ninguna ruta del apex o www.
    Escribir el plan de Access antes de que pueda servirse el build; no crear CNAME
    directo a workers.dev. Auditar todas las vías alternativas del dashboard.
25. Autorizar deploy staging. Desplegar primero admin-api sin ingress; después
    admin-web con guardias y binding staging; catálogo con solo publication y Access
    no productivo. workers.dev/previews off, mutaciones inicialmente deshabilitadas.
26. Desde navegador/incógnito y clientes: sin identidad no assets privados; con rol
    viewer no writes; token de otro entorno denegado; admin-api inaccesible por Internet;
    media privada sin URL pública. Verificar CORS/CSRF, JWT y 401/403/404/405/413/429.
27. Solo tras aprobar estas pruebas, autorizar habilitar escrituras staging. Ensayar
    publicación/archivo con contenido comercial autorizado o catálogo vacío aprobado.
    Fixtures sintéticos se quedan en test local; nunca aparentarán oferta real.
28. Configurar alertas y comprobar envío según las funciones reales de la cuenta.
    Medir CPU/requests/D1 rows/R2 ops/logs y pruebas de restauración, no estimación sola.

## F. Producción y conexión del marketplace: NO implícitas en 2B

29. Entregar staging, costos medidos, riesgos y rollback para revisión. Aprobación
    independiente antes de crear prod, tocar DNS productivo, migrar o desplegar.
30. Repetir controles con IDs, buckets, AUD, credenciales y cuentas de producción;
    no copiar bindings de staging. Verificar Access y backups antes de abrir Admin.
31. Conectar la landing a HttpCatalogAdapter exige aprobación de contenido/precios/
    monedas/imágenes, API real validada, experiencia vacía/error y copy de referencia
    actualizado según source. No volver a Stitch/demo como fallback de una API fallida.
32. La landing/PWA sigue en Hostinger. Cambiar solo el adaptador en una fase de
    integración aprobada y desplegar esa salida independientemente; probar rutas,
    instalación PWA y correo. Tener artefacto previo para rollback, sin borrar datos.
33. Cerrar con inventario, revisión de permisos, alertas y operación/recuperación.
    Commit/push son acciones separadas: no se deducen de un deploy autorizado.

Criterio final: no falsa confirmación de publicación/reserva, no material privado en
el catálogo, ningún recurso cruzado entre ambientes y evidencia de recuperación.

## Operación de emergencia que debe ensayarse antes de abrir tráfico

Ante gasto/fallas anómalas: avisar al operador, conservar métricas y request IDs sin
secretos, impedir nuevas escrituras con el mecanismo servidor aprobado, pausar el
exportador/reintentos y uploads y examinar la fuente del abuso. Si hace falta bloquear
tráfico, usar el control edge disponible y aprobado antes de Workers; o modo de
mantenimiento 503 que evite D1/R2. Esto último NO elimina el cargo de requests/CPU
mínimo de las peticiones que aún alcancen el Worker. Alertas no son un hard cap.
No usar cambios improvisados de DNS, desactivar correo o borrar bases/buckets como
control de presupuesto. Las acciones remotas de respuesta requieren permisos y una
política de operación previamente autorizada; no están ejecutadas por este runbook.
