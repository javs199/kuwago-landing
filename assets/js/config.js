window.KUWAGO_CONTACT = {
  phone: "",
  email: "",
};

// Leave a URL empty to display a non-interactive Coming soon state.
window.KUWAGO_SOCIALS = {
  instagram: "https://www.instagram.com/grupokuwago/",
  facebook: "https://www.facebook.com/grupokuwago/",
  tiktok: "https://www.tiktok.com/@grupokuwago?is_from_webapp=1&sender_device=pc",
};

// Public read-only catalog Worker (services published from the Admin). Empty string = Stitch reference data.
window.KUWAGO_CATALOG_API = {
  baseUrl: "https://kuwago-catalog-public-development.ch-jesus-99.workers.dev",
};

// Reserved static route. Keep disabled until the approved Stitch page is present.
window.KUWAGO_PAGES = {
  conciergeMarketplace: { path: "/concierge-marketplace.html", enabled: true },
};

// Account panel destination; Cloudflare Access protects the DEV portal.
window.KUWAGO_ACCESS = {
  admin: "https://kuwago-admin-api-development.ch-jesus-99.workers.dev/",
};
