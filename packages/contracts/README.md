# @kuwago/contracts

Paquete ESM privado del repositorio. TypeScript estricto, esquemas sin dependencias
runtime y declaraciones generadas en dist. No contiene endpoints ni infraestructura.

- Entrada completa: `@kuwago/contracts` para Admin/futuro backend.
- Entrada pública: `@kuwago/contracts/public` para validación de respuestas públicas.
- `Schema.parse` lanza ContractError; `Schema.safeParse` devuelve success/data o issues.
- La revisión de trabajo y la publicada son independientes. No existe operación de
  publicación, persistencia, autorización ni aprobación real en este paquete.
- PublicCatalog schemaVersion=1 separa source=static_reference de source=api. El segundo
  solo admite servicios publicados, nunca referencias ni demos como fallback.

```powershell
npm ci
npm run typecheck
npm run build
npm test
```

`npm run lint` reutiliza ESLint de apps/admin; instalar ese paquete para ejecutarlo.
Para emitir el runtime que usa la landing, ejecutar desde la raíz
`npm run contracts:build`. No copiar index.js/admin.js al sitio público.

El formulario Admin es un modelo de presentación, no el cuerpo de una API. No enviar
su estado directamente: usar un adaptador y validar en servidor. Los precios reales
requieren moneda explícita y unidades menores enteras; ReferencePrice no es dinero.

Informe, auditoría, árbol completo, decisiones y pruebas: docs/PHASE-1C-CONTRACTS.md
en la raíz del repositorio. Revisar las decisiones antes de adoptar este contrato como
estable. Los cambios incompatibles requieren una nueva versión de schemaVersion.
