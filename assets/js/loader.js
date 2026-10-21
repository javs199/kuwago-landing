(() => {
  const root = document.documentElement;
  let finished = false;
  let fallback;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    window.removeEventListener("load", finish);
    const loader = document.getElementById("site-loader");
    loader?.classList.add("is-leaving");
    // Never hold the page for a full animation cycle.
    setTimeout(() => {
      root.classList.remove("loader-pending");
      loader?.remove();
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
  }

  function setLoadingLanguage() {
    let lang = "en";
    try { lang = localStorage.getItem("kuwago-language") || "en"; } catch {}
    const label = document.getElementById("site-loader-label");
    if (label) {
      label.textContent = lang === "es" ? "Cargando Kuwago…" : "Loading Kuwago…";
      label.lang = lang === "es" ? "es" : "en";
    }
    // The fallback may have expired while a remote script blocked HTML parsing.
    if (finished) document.getElementById("site-loader")?.remove();
  }

  root.classList.add("loader-pending");
  // A stalled image or third-party resource must never lock visitors out.
  fallback = setTimeout(finish, 8000);
  window.addEventListener("load", finish, { once: true });
  window.addEventListener("pageshow", event => {
    if (event.persisted) finish();
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setLoadingLanguage, { once: true });
  } else {
    setLoadingLanguage();
  }
  if (document.readyState === "complete") finish();
})();
