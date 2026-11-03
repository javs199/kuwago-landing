// Presentation only. The Worker independently disables mutations.
export const cloudflareDevelopment = import.meta.env.VITE_DEPLOYMENT_TARGET === 'cloudflare-development';
export const publicSiteUrl = 'https://grupokuwago.com/';
const accessTeamLogout = 'https://blue-bread-0e64.cloudflareaccess.com/cdn-cgi/access/logout';
/** Ends the Cloudflare Access session (app + team, best effort) and returns to the public site. */
export async function signOutToPublicSite(): Promise<void> {
  const timeout = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  await Promise.race([Promise.allSettled([
    fetch('/cdn-cgi/access/logout', { credentials: 'same-origin', cache: 'no-store', redirect: 'manual' }),
    fetch(accessTeamLogout, { mode: 'no-cors', credentials: 'include', cache: 'no-store' }),
  ]), timeout(4000)]);
  window.location.replace(publicSiteUrl);
}
export const developmentNotice = {
  es: 'Cloudflare DEV · Solo pruebas. Cambios reales en D1 DEV; sin conexión al sitio público. Autoaprobación explícita y auditada solo para Super Admin. Images limitado a una PNG sintética autorizada.',
  en: 'Cloudflare DEV · Tests only. Real changes in DEV D1; disconnected from the public site. Explicit audited self-approval for Super Admin only. Images limited to one authorized synthetic PNG.',
};
