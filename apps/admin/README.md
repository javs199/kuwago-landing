# Kuwago Admin — integración API local 2B.5

Gateway local 2C.1: [informe](../../docs/PHASE-2C1-ADMIN-GATEWAY.md).
El build es compatible con la CSP del gateway: las preferencias iniciales se
restauran desde `public/preferences-bootstrap.js`, sin scripts inline.
No cambia el diseño ni habilita un login de producción. La configuración remota
Access y la autorización de despliegue continúan pendientes.

Estado actual: Services usa la API por defecto, con JWT/RBAC, versiones y estados
de entrega comprobados en local. Ver [informe y ejecución 2B.5](../../docs/PHASE-2B5-ADMIN-INTEGRATION.md).
La prueba de identidad requiere harness operador explícito; no hay login real de
Cloudflare todavía ni claves/JWT en React. Carga/biblioteca multimedia deshabilitadas.
Las secciones de base visual siguientes son el contexto histórico 1A/1B.

Aplicación React + TypeScript estricto + Vite + Tailwind compilado localmente.
No implementa credenciales Cloudflare, reservas ni transacciones comerciales.

## Ejecución

Desde la raíz del repositorio:

```powershell
npm --prefix apps/admin ci
npm --prefix apps/admin run dev
```

Abrir http://127.0.0.1:5175/. Vite exige ese puerto y escucha solo en loopback.
No usar túneles, `--host 0.0.0.0` ni publicar esta base visual. El mensaje «Vista local»
describe el alcance; no es una protección de acceso. No hay credenciales ni sesión.

Node compatible con las herramientas: ^22.22.2, ^24.15.0 o >=26.0.0.
Implementación comprobada con Node 26.1.0. Versiones directas fijadas y lockfile propio.

```powershell
npm --prefix apps/admin run typecheck
npm --prefix apps/admin run lint
npm --prefix apps/admin test
npm --prefix apps/admin run build
npm --prefix apps/admin run preview
```

Build: `apps/admin/dist/`. Preview: http://127.0.0.1:5176/.
La landing mantiene su package.json, lockfile, configuración Tailwind 3 y salida `dist/`.
El admin usa Tailwind 4 y dependencias propias; no hay workspaces ni infraestructura vacía.

Para comprobar ambos paquetes:

```powershell
npm run build
npm --prefix apps/admin run build
npm --prefix apps/admin run verify:isolation
```

## Referencias y diferencias deliberadas

Fuente aprobada: `Admin Portal/stitch_kuwago`, fuera de este repositorio.
Se reconstruyen sus cuatro dashboards (móvil/escritorio y claro/oscuro) en una sola interfaz.
No se trasladan las cuatro pantallas de login porque no hay autenticación en esta fase.

- Se conservan sidebar, header, acciones, seis tarjetas de métricas y paneles del dashboard.
- Sidebar a partir de 1024px; barra inferior y diálogo «Más» por debajo de ese ancho.
- Las métricas son guiones con «Sin conectar»; no se reutilizan números, personas,
  facturas, estancias ni transacciones demostrativas de Stitch.
- Acciones futuras deshabilitadas y rotuladas «Próximamente».
- Isotipos oficiales morado/dorado, copias exactas de assets/images/brand del repositorio.
- Foto de Carabao: copia de assets/images/carabao-portada.webp, imagen pública previamente
  identificada por el usuario. Se muestra como referencia visual sin registro administrativo.
- Ninguna imagen de Google/Stitch se descargó. Hanken Grotesk se aloja localmente desde
  @fontsource/hanken-grotesk (OFL-1.1); iconos Lucide (ISC). Licencias en public/licenses/.
- Tokens semánticos locales, idioma ES/EN y preferencias independientes
  `kuwago-admin-language` / `kuwago-admin-theme`. No contienen identidad ni sesión.

## Verificación

Cinco pruebas de componentes: métricas y acciones honestas, traducción persistente,
tema persistente, almacenamiento bloqueado y apertura/cierre/foco del menú móvil.
jsdom simula únicamente las primitivas dialog/matchMedia; no simula autenticación.
La interacción nativa de teclado y los breakpoints se revisan adicionalmente en navegador.
No es una certificación exhaustiva de accesibilidad ni una prueba en dispositivos físicos.

Revisión del 22 de octubre de 2026:
- TypeScript estricto, lint, build y cinco pruebas del admin correctos.
- Build, checks y 30 pruebas existentes de la landing correctos; aislamiento confirmado.
- Navegador: escritorio 1600x1280, móvil 390x1636/1646, 350px, 320px y tablet 820px;
  límite 1023/1024px verificado, incluido cierre del menú al pasar a escritorio.
- ES/EN y temas persistentes tras recarga; Tab/Shift+Tab dentro del diálogo, Escape y
  devolución del foco comprobados. Sin errores de consola en el recorrido revisado.
- Capturas de comparación en release/admin-review/ (fuera de los paquetes públicos y Git).
- npm audit del admin: cero vulnerabilidades conocidas. La raíz conserva siete avisos
  preexistentes (cinco altos y dos moderados) en herramientas Tailwind 3 de build;
  no se migraron dependencias de la landing fuera del alcance autorizado.
- Originales Stitch comparados nuevamente con ZIP: 17/17 idénticos. Ningún archivo
  legítimo ya versionado queda oculto por las nuevas reglas .gitignore.

## Siguiente fase

Aprobar las pantallas faltantes del catálogo: listado, editor ES/EN, categorías,
imágenes, borradores y publicación. Después introducir contratos y el adaptador
estático sin cambiar todavía el comportamiento público. Cloudflare Access y los
permisos de servidor serán requisitos antes de una exposición administrativa real.

## Fase 1B — Servicios (demostración visual)

Las pantallas de esta fase son una extensión del sistema visual 1A. No existían en
las exportaciones originales de Stitch y requieren revisión visual y funcional.

Rutas locales:
- `/#services`: listado con búsqueda bilingüe, filtros por categoría y estado.
- `/#services/new`: nuevo borrador de demostración.
- `/#services/:id/edit`: editor general/comercial/multimedia/publicación.
- `/#services/:id/preview`: vista previa administrativa.

El selector «Estado de vista» permite revisar carga, vacío y error de forma
explícita; no solicita datos ni pretende reproducir una conexión real.
La tabla se convierte en tarjetas por debajo de 1280px. El formulario usa una
columna en móvil, dos campos por fila desde 768px y panel lateral desde 1440px.
La navegación sigue mostrando todos los módulos previos en «Más»; el calendario
permanece allí para dejar espacio al nuevo acceso directo a Servicios en móvil.

### Archivos creados

```text
src/
├── routing.ts
├── components/ConfirmDialog.tsx
├── features/services/
│   ├── model.ts                    # Modelos de presentación, no contrato de API
│   ├── demo-data.ts                # Tres ejemplos ficticios, importes de prueba
│   ├── copy.ts                     # ES/EN
│   ├── validation.ts               # Validación de interfaz y orden de imágenes
│   ├── DemoServicesProvider.tsx    # Registros y ediciones en memoria React
│   ├── ServicesModule.tsx          # Resolución de vistas del módulo
│   ├── services.css                # Extensión de tokens y responsive 1A
│   └── components/
│       ├── Fields.tsx
│       ├── ServicesList.tsx
│       ├── ServiceEditor.tsx
│       ├── ImageSelector.tsx
│       └── ServicePreview.tsx
└── test/Services.test.tsx
```

Archivos existentes modificados: `src/App.tsx`, `src/components/AdminShell.tsx`,
`src/navigation.ts`, `src/i18n.ts`, `src/test/setup.ts` y este README.
No se añaden dependencias, scripts, servicios, base de datos ni configuración cloud.

### Comportamiento y límites

- Los nombres, categorías e importes son ejemplos, no una oferta comercial.
- La foto pública de Carabao se rotula como referencia sin asignación a un servicio.
- Los cambios en curso se conservan entre rutas durante el montaje de la aplicación.
  «Aplicar a la demo local» actualiza únicamente el listado en memoria de esta pestaña.
- No existe almacenamiento persistente de servicios. Recargar restaura los tres ejemplos.
  Se conservan solamente las preferencias previas de idioma y tema.
- Los borradores pueden estar incompletos; los valores mal formados se señalan.
  El ensayo de estado publicado requiere nombres/descripciones ES/EN, slug único,
  duración, precio/moneda cuando corresponde, imagen y textos alternativos completos.
- Publicado, borrador y archivado son etiquetas de demo. Los cambios de estado y el
  descarte explícito piden confirmación. No se publica ni archiva contenido real.
- JPEG/PNG/WebP locales de hasta 2 MB y máximo 8 imágenes. Se verifica decodificación,
  se previsualizan mediante object URLs y se liberan al desmontar el proveedor.
  No hay carga al servidor. La primera imagen es principal; hay controles de orden,
  selección de principal, eliminación y textos alternativos ES/EN.
- No hay creación/edición de categorías, variantes múltiples, reglas fiscales,
  permisos de servidor, transacciones, sincronización ni gestión de proveedores.
- Las categorías y monedas de ejemplo no constituyen un contrato comercial aprobado.

### Verificación de esta fase

- TypeScript estricto, lint, build y 15 pruebas del Admin.
- Las 30 regresiones existentes de la landing, check y build.
- Aislamiento de las salidas y escucha exclusiva en loopback.
- Navegador: listado, editor y vista previa; 320/390px, tablet 820px y escritorio
  1440px; idiomas ES/EN y temas claro/oscuro. Sin desbordamiento horizontal en
  los recorridos comprobados. Selección real de archivo local, textos alternativos,
  cambio de principal por orden, Escape y recuperación de foco revisados.
- Contraste de textos y acciones sobre sus superficies: ratios AA revisados con
  los tokens existentes; controles nativos y foco visible. No es una certificación
  completa de accesibilidad ni una prueba en hardware móvil físico.
- Capturas locales: `release/services-review/`, fuera de los builds y de Git.

### Siguiente fase recomendada

Primero aprobar estas vistas y definir categorías, opciones, precios, monedas,
campos obligatorios y permisos reales. Después crear contratos versionados con IDs
estables, traducciones ES/EN, importes monetarios en unidades menores y publicación
explícita. Sustituir el proveedor de demo por un adaptador tipado, con estados de
carga/error reales y errores por campo. Workers debe validar las entradas y verificar
Cloudflare Access/roles en servidor; D1 guardará registros/revisiones y R2 referencias
a imágenes con sus textos y orden. Publicación debe ser una operación autorizada
separada del guardado de borradores, con concurrencia y auditoría. Antes de exponer
el Admin, añadir pruebas de integración y autorización y su despliegue independiente.


## Fase 1C — Contratos compartidos

El paquete local `@kuwago/contracts` aporta PublicationStatus, PriceKind y monedas.
`src/features/services/contract-adapter.ts` transforma el formulario en un snapshot
administrativo demo validado antes de aplicarlo a memoria. No crea historial real,
no obtiene aprobación comercial y no publica servicios. Se conservan las pantallas,
las categorías de ejemplo y las preferencias visuales de 1B.

Antes de instalar/ejecutar el Admin por primera vez, instalar también las herramientas
del paquete compartido desde la raíz: `npm --prefix packages/contracts ci`.
Dev/typecheck/test reconstruyen el paquete; el build ejecuta typecheck.

Tres pruebas nuevas cubren decimales, cotizaciones, procedencia demo, aprobación
pendiente, campos incompletos y rechazo de monedas desconocidas. Total Admin: 18.
El verificador de aislamiento también impide copiar contratos administrativos al sitio.
Informe completo: docs/PHASE-1C-CONTRACTS.md en la raíz del repositorio.
