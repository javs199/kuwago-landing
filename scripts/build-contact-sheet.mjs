import { readFileSync, writeFileSync } from "node:fs";

const inventory = JSON.parse(readFileSync("inventory.json", "utf8"));

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hoja de Contacto — Fotografías Grupo Kuwago</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #160B1D;
      color: #F8F6FA;
      padding-bottom: 5rem;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(36, 23, 44, 0.96);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #302039;
      padding: 1rem 1.5rem;
    }
    .header-content {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #D1AD66;
      letter-spacing: 0.05em;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .tab-btn {
      background: #302039;
      color: #F8F6FA;
      border: 1px solid #4a3455;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      transition: all 0.2s;
    }
    .tab-btn:hover { background: #4a3455; color: #D1AD66; }
    .tab-btn.active { background: #D1AD66; color: #160B1D; border-color: #D1AD66; }
    .selection-panel {
      max-width: 1400px;
      margin: 1.5rem auto;
      padding: 1.25rem 1.5rem;
      background: #24172C;
      border: 1px solid #3b2747;
      border-radius: 1rem;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .selection-panel h2 {
      font-size: 1rem;
      color: #D1AD66;
      margin-bottom: 0.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .selection-counts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .prop-status {
      background: #1a0f23;
      padding: 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid #302039;
      font-size: 0.85rem;
    }
    .prop-status strong { display: block; color: #F8F6FA; margin-bottom: 0.25rem; }
    .copy-btn {
      background: #D1AD66;
      color: #160B1D;
      border: none;
      padding: 0.45rem 0.8rem;
      border-radius: 0.375rem;
      font-weight: 700;
      cursor: pointer;
      font-size: 0.8rem;
      margin-top: 0.5rem;
      transition: opacity 0.2s;
      width: 100%;
    }
    .copy-btn:hover { opacity: 0.9; }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }
    .property-section { margin-top: 2.5rem; }
    .property-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #F8F6FA;
      border-left: 4px solid #D1AD66;
      padding-left: 0.75rem;
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .property-title span.count-info {
      font-size: 0.9rem;
      color: #CFC4D2;
      font-weight: 400;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1.25rem;
    }
    .card {
      background: #24172C;
      border: 1px solid #302039;
      border-radius: 0.75rem;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      transform: translateY(-3px);
      border-color: #D1AD66;
    }
    .card.selected {
      border: 2px solid #D1AD66;
      background: #2e1e38;
    }
    .thumb-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 4/3;
      background: #0F0A15;
      cursor: pointer;
      overflow: hidden;
    }
    .thumb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s;
    }
    .thumb-wrap:hover img { transform: scale(1.05); }
    .photo-num {
      position: absolute;
      top: 0.5rem;
      left: 0.5rem;
      background: rgba(0,0,0,0.8);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      backdrop-filter: blur(4px);
    }
    .meta {
      padding: 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      flex: 1;
      justify-content: space-between;
    }
    .filename {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      color: #CFC4D2;
      word-break: break-all;
      line-height: 1.3;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid #302039;
    }
    .select-label {
      font-size: 0.8rem;
      color: #F8F6FA;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      cursor: pointer;
      user-select: none;
      font-weight: 600;
    }
    .select-label input {
      accent-color: #D1AD66;
      width: 17px;
      height: 17px;
      cursor: pointer;
    }
    .copy-name-btn {
      background: #302039;
      color: #CFC4D2;
      border: 1px solid #4a3455;
      padding: 0.25rem 0.6rem;
      border-radius: 0.25rem;
      font-size: 0.72rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .copy-name-btn:hover {
      color: #D1AD66;
      border-color: #D1AD66;
    }
    /* Modal */
    #lightbox {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(0,0,0,0.92);
      backdrop-filter: blur(8px);
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    #lightbox.open { display: flex; }
    #lightbox img {
      max-width: 90vw;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 0.5rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
    }
    #lightbox-caption {
      margin-top: 1rem;
      color: #F8F6FA;
      font-family: ui-monospace, monospace;
      font-size: 0.9rem;
      text-align: center;
    }
    #lightbox-close {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      background: #302039;
      color: #fff;
      border: none;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <div>
        <h1>GRUPO KUWAGO — HOJA DE CONTACTO Y MINIATURAS</h1>
        <p style="font-size:0.85rem; color:#CFC4D2; margin-top:0.25rem;">
          270 fotografías locales organizadas. Selecciona 8 por propiedad y copia la lista para los carruseles.
        </p>
      </div>
      <div class="tabs">
        <button class="tab-btn active" data-tab="all">Todas (270)</button>
        <button class="tab-btn" data-tab="carabao-villa">Carabao Villa (29)</button>
        <button class="tab-btn" data-tab="casa-bella-mia">Casa Bella Mia (88)</button>
        <button class="tab-btn" data-tab="casa-heliconia">Casa Heliconia (40)</button>
        <button class="tab-btn" data-tab="villa-maya">Villa Maya (113)</button>
      </div>
    </div>
  </header>

  <div class="container">
    <div class="selection-panel">
      <h2>
        <span>Selección de 8 fotos para cada carrusel</span>
        <button class="copy-btn" id="btn-copy-all" style="width:auto; padding:0.4rem 1rem;">Copiar Selección Completa (las 4)</button>
      </h2>
      <div class="selection-counts">
        <div class="prop-status" id="status-carabao-villa">
          <strong>Carabao Villa</strong>
          <span class="count-label">0 / 8 seleccionadas</span>
          <button class="copy-btn" data-copy-prop="carabao-villa">Copiar Lista Carabao Villa</button>
        </div>
        <div class="prop-status" id="status-casa-bella-mia">
          <strong>Casa Bella Mia</strong>
          <span class="count-label">0 / 8 seleccionadas</span>
          <button class="copy-btn" data-copy-prop="casa-bella-mia">Copiar Lista Casa Bella Mia</button>
        </div>
        <div class="prop-status" id="status-casa-heliconia">
          <strong>Casa Heliconia</strong>
          <span class="count-label">0 / 8 seleccionadas</span>
          <button class="copy-btn" data-copy-prop="casa-heliconia">Copiar Lista Casa Heliconia</button>
        </div>
        <div class="prop-status" id="status-villa-maya">
          <strong>Villa Maya</strong>
          <span class="count-label">0 / 8 seleccionadas</span>
          <button class="copy-btn" data-copy-prop="villa-maya">Copiar Lista Villa Maya</button>
        </div>
      </div>
    </div>

${Object.entries(inventory).map(([propId, prop]) => `
    <section class="property-section" id="sec-${propId}">
      <div class="property-title">
        <span>${prop.name}</span>
        <span class="count-info">${prop.count} fotos disponibles</span>
      </div>
      <div class="grid">
${prop.files.map((file, idx) => {
  const src = `assets/images/properties/${propId}/${encodeURIComponent(file)}`;
  return `        <div class="card" id="card-${propId}-${idx}">
          <div class="thumb-wrap" data-full-src="${src}" data-caption="${prop.name}: ${file}">
            <span class="photo-num">#${idx + 1}</span>
            <img src="${src}" alt="${file}" loading="lazy">
          </div>
          <div class="meta">
            <span class="filename" title="${file}">${file}</span>
            <div class="actions">
              <label class="select-label">
                <input type="checkbox" data-prop="${propId}" data-file="${file}">
                <span>Elegir</span>
              </label>
              <button type="button" class="copy-name-btn" data-copy-name="${file}">Copiar</button>
            </div>
          </div>
        </div>`;
}).join("\n")}
      </div>
    </section>
`).join("\n")}

  </div>

  <div id="lightbox">
    <button id="lightbox-close" type="button" aria-label="Cerrar">&times;</button>
    <img id="lightbox-img" src="" alt="Enlarged view">
    <div id="lightbox-caption"></div>
  </div>

  <script>
    const selections = {
      "carabao-villa": [],
      "casa-bella-mia": [],
      "casa-heliconia": [],
      "villa-maya": []
    };

    // Tab filtering
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.tab;
        document.querySelectorAll(".property-section").forEach(sec => {
          if (target === "all" || sec.id === "sec-" + target) {
            sec.style.display = "block";
          } else {
            sec.style.display = "none";
          }
        });
      });
    });

    // Checkbox toggling
    document.querySelectorAll("input[type='checkbox'][data-prop]").forEach(input => {
      input.addEventListener("change", () => {
        const prop = input.dataset.prop;
        const file = input.dataset.file;
        const card = input.closest(".card");

        if (input.checked) {
          if (selections[prop].length >= 8) {
            alert("Ya seleccionaste 8 fotos para " + prop + ". Desmarca una para elegir otra.");
            input.checked = false;
            return;
          }
          selections[prop].push(file);
          card.classList.add("selected");
        } else {
          selections[prop] = selections[prop].filter(f => f !== file);
          card.classList.remove("selected");
        }
        updateCounts();
      });
    });

    function updateCounts() {
      for (const prop of Object.keys(selections)) {
        const count = selections[prop].length;
        const label = document.querySelector("#status-" + prop + " .count-label");
        if (label) label.textContent = count + " / 8 seleccionadas";
      }
    }

    // Copy single filename
    document.querySelectorAll("[data-copy-name]").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.copyName;
        navigator.clipboard.writeText(name).then(() => {
          btn.textContent = "¡Copiado!";
          setTimeout(() => btn.textContent = "Copiar", 1500);
        });
      });
    });

    // Copy property selection
    document.querySelectorAll("[data-copy-prop]").forEach(btn => {
      btn.addEventListener("click", () => {
        const prop = btn.dataset.copyProp;
        const list = selections[prop];
        if (list.length === 0) {
          alert("Aún no has seleccionado fotos para " + prop);
          return;
        }
        navigator.clipboard.writeText(list.join("\\n")).then(() => {
          alert("Se copiaron " + list.length + " fotos de " + prop + " al portapapeles.");
        });
      });
    });

    // Copy all selections
    document.getElementById("btn-copy-all")?.addEventListener("click", () => {
      let text = "";
      for (const [prop, list] of Object.entries(selections)) {
        text += "### " + prop + " (" + list.length + " fotos)\\n" + list.join("\\n") + "\\n\\n";
      }
      navigator.clipboard.writeText(text).then(() => {
        alert("Selección completa de las 4 propiedades copiada al portapapeles.");
      });
    });

    // Lightbox modal
    const lightbox = document.getElementById("lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    const lightboxCaption = document.getElementById("lightbox-caption");
    const lightboxClose = document.getElementById("lightbox-close");

    document.querySelectorAll(".thumb-wrap[data-full-src]").forEach(thumb => {
      thumb.addEventListener("click", () => {
        lightboxImg.src = thumb.dataset.fullSrc;
        lightboxCaption.textContent = thumb.dataset.caption;
        lightbox.classList.add("open");
      });
    });

    const closeBox = () => lightbox.classList.remove("open");
    lightboxClose.addEventListener("click", closeBox);
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeBox();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeBox();
    });
  </script>
</body>
</html>
`;

writeFileSync("contact-sheet.html", html, "utf8");
console.log("contact-sheet.html created successfully!");
