// Presentation only. The Worker independently disables mutations.
export const cloudflareDevelopment = import.meta.env.VITE_DEPLOYMENT_TARGET === 'cloudflare-development';
export const developmentNotice = {
  es: 'Cloudflare DEV · Solo pruebas. Cambios reales en D1 DEV; sin conexión al sitio público. Autoaprobación explícita y auditada solo para Super Admin. Images limitado a una PNG sintética autorizada.',
  en: 'Cloudflare DEV · Tests only. Real changes in DEV D1; disconnected from the public site. Explicit audited self-approval for Super Admin only. Images limited to one authorized synthetic PNG.',
};
