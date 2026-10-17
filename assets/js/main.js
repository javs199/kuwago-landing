(() => {
  const header = document.querySelector("header");
  const modal = document.getElementById("lightbox-modal");
  const modalImage = document.getElementById("lightbox-img");
  const modalTitle = document.getElementById("lightbox-title");
  const modalBadge = document.getElementById("lightbox-badge");

  const propModal = document.getElementById("property-gallery-modal");
  const propModalTitle = document.getElementById("property-gallery-title");
  const propModalBadge = document.getElementById("property-gallery-badge");
  const propModalCounter = document.getElementById("property-gallery-counter");
  const propModalImg = document.getElementById("property-gallery-img");
  const propModalFilename = document.getElementById("property-gallery-filename");
  const propModalPrev = document.getElementById("property-gallery-prev");
  const propModalNext = document.getElementById("property-gallery-next");
  const propModalClose = document.getElementById("property-gallery-close");
  const propModalStage = document.getElementById("property-gallery-stage");

  let previousFocus = null;
  let currentActivePropKey = null;
  let currentGalleryIdx = 0;

  // Property Data Manifest
  const PROPERTY_DATA = {
  "carabao-villa": {
    "titleKey": "gallery.prop.carabao",
    "carousel": [
      "Screenshot-2026-06-29-at-11.59.07-1782756643637.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.19-1782756533896.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.31-1782756542078.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.37-1782756516213.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.49-1782756614352.jpg",
      "Screenshot-2026-06-29-at-11.59.57-1782756573704.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.59-1782756618436.jpg.webp",
      "Screenshot-2026-06-29-at-12.00.09-1782756632052.jpg.webp"
    ],
    "all": [
      "Screenshot-2026-06-29-at-11.59.07-1782756643637.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.11-1782756635797.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.19-1782756533896.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.21-1782756529699.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.24-1782756551698.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.25-1782756538105.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.27-1782756560541.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.29-1782756624078.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.31-1782756542078.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.33-1782756565132.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.35-1782756525444.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.37-1782756516213.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.39-1782756639533.jpg",
      "Screenshot-2026-06-29-at-11.59.42-1782756581767.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.44-1782756600798.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.46-1782756585994.jpg",
      "Screenshot-2026-06-29-at-11.59.47-1782756595664.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.49-1782756614352.jpg",
      "Screenshot-2026-06-29-at-11.59.50-1782756608291.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.52-1782756590860.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.54-1782756569313.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.56-1782756577622.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.57-1782756573704.jpg.webp",
      "Screenshot-2026-06-29-at-11.59.59-1782756618436.jpg.webp",
      "Screenshot-2026-06-29-at-12.00.02-1782756521017.jpg.webp",
      "Screenshot-2026-06-29-at-12.00.04-1782756546152.jpg.webp",
      "Screenshot-2026-06-29-at-12.00.06-1782756555874.jpg.webp",
      "Screenshot-2026-06-29-at-12.00.08-1782756628030.jpg.webp",
      "Screenshot-2026-06-29-at-12.00.09-1782756632052.jpg.webp"
    ]
  },
  "villa-maya": {
    "titleKey": "gallery.prop.maya",
    "carousel": [
      "ALE_7647.jpg",
      "ALE_7633.jpg",
      "ALE_7592.jpg",
      "ALE_7593.jpg",
      "ALE_7587.jpg",
      "IMG_4119.jpg",
      "IMG_4135_jpg.jpg",
      "IMG_4109.jpg"
    ],
    "all": [
      "ALE_7508.jpg",
      "ALE_7509.jpg",
      "ALE_7511.jpg",
      "ALE_7513.jpg",
      "ALE_7516.jpg",
      "ALE_7517.jpg",
      "ALE_7518.jpg",
      "ALE_7522.jpg",
      "ALE_7523.jpg",
      "ALE_7524.jpg",
      "ALE_7525.jpg",
      "ALE_7527.jpg",
      "ALE_7529.jpg",
      "ALE_7531.jpg",
      "ALE_7532.jpg",
      "ALE_7536.jpg",
      "ALE_7537.jpg",
      "ALE_7540.jpg",
      "ALE_7545.jpg",
      "ALE_7548.jpg",
      "ALE_7550.jpg",
      "ALE_7551.jpg",
      "ALE_7552.jpg",
      "ALE_7554.jpg",
      "ALE_7557.jpg",
      "ALE_7562.jpg",
      "ALE_7571.jpg",
      "ALE_7574.jpg",
      "ALE_7581.jpg",
      "ALE_7587.jpg",
      "ALE_7592.jpg",
      "ALE_7593.jpg",
      "ALE_7602.jpg",
      "ALE_7606.jpg",
      "ALE_7607.jpg",
      "ALE_7608.jpg",
      "ALE_7612.jpg",
      "ALE_7617.jpg",
      "ALE_7619.jpg",
      "ALE_7620.jpg",
      "ALE_7621.jpg",
      "ALE_7622.jpg",
      "ALE_7623.jpg",
      "ALE_7624.jpg",
      "ALE_7625.jpg",
      "ALE_7626.jpg",
      "ALE_7628.jpg",
      "ALE_7633.jpg",
      "ALE_7634.jpg",
      "ALE_7645.jpg",
      "ALE_7646.jpg",
      "ALE_7647.jpg",
      "ALE_7649.jpg",
      "ALE_7652.jpg",
      "ALE_7656.jpg",
      "ALE_7659.jpg",
      "ALE_7661.jpg",
      "ALE_7663.jpg",
      "ALE_7664.jpg",
      "ALE_7666.jpg",
      "ALE_7667.jpg",
      "ALE_7669.jpg",
      "ALE_7670.jpg",
      "ALE_7671.jpg",
      "ALE_7675.jpg",
      "IMG_4086_jpg.jpg",
      "IMG_4087.jpg",
      "IMG_4088.jpg",
      "IMG_4089.jpg",
      "IMG_4090.jpg",
      "IMG_4091.jpg",
      "IMG_4092.jpg",
      "IMG_4093.jpg",
      "IMG_4094.jpg",
      "IMG_4095.jpg",
      "IMG_4096.jpg",
      "IMG_4097.jpg",
      "IMG_4098.jpg",
      "IMG_4100.jpg",
      "IMG_4103.jpg",
      "IMG_4104.jpg",
      "IMG_4106.jpg",
      "IMG_4107.jpg",
      "IMG_4108.jpg",
      "IMG_4109.jpg",
      "IMG_4112_jpg.jpg",
      "IMG_4113_jpg.jpg",
      "IMG_4115.jpg",
      "IMG_4116.jpg",
      "IMG_4117.jpg",
      "IMG_4119.jpg",
      "IMG_4120.jpg",
      "IMG_4121_jpg.jpg",
      "IMG_4123.jpg",
      "IMG_4124.jpg",
      "IMG_4125.jpg",
      "IMG_4126.jpg",
      "IMG_4127.jpg",
      "IMG_4128.jpg",
      "IMG_4129.jpg",
      "IMG_4130.jpg",
      "IMG_4131_jpg.jpg",
      "IMG_4132_jpg.jpg",
      "IMG_4133_jpg.jpg",
      "IMG_4134_jpg.jpg",
      "IMG_4135_jpg.jpg",
      "IMG_4136_jpg.jpg",
      "IMG_4137_jpg.jpg",
      "IMG_4139_jpg.jpg",
      "IMG_4140_jpg.jpg",
      "IMG_4141.jpg",
      "IMG_4142.jpg",
      "IMG_4144_jpg.jpg"
    ]
  },
  "casa-bella-mia": {
    "titleKey": "gallery.prop.bella_mia",
    "carousel": [
      "msmz6olpjslreotv2msg.webp",
      "o5m7j7ahtntqvimnxsc8.webp",
      "ofoldd9w6mgdkel72o6x.webp",
      "rgys0fznalayavyhv6dt.webp",
      "vu9rigesntka2pw3lqyw.webp",
      "ykx4pvobkp4ri0byrnaz.webp",
      "yf4wsbkpbssl5gydtqum.webp",
      "c5wwruo0a9ta0cfgzdrx.webp"
    ],
    "all": [
      "a60oqyalmros0gdfwe7f.webp",
      "am7ein9tiaaxn8fxg8pj.webp",
      "amhpg2bzwhpsuttjd8vh.webp",
      "bnlmnwybbgot2thepteb.webp",
      "c5wwruo0a9ta0cfgzdrx.webp",
      "c23igpwl0jbicaabexex.webp",
      "celbtz5qn1k2huxfoitn.webp",
      "cjiqrncav9ojraqylyjy.webp",
      "ck6pdxztvgwenghfitfs.webp",
      "d6jahbphzcz37ov1mnim.webp",
      "dju2nvmok8m9ujh5p7gt.webp",
      "dqeuddrm7w9tzvtjdheg.webp",
      "drttfli7wribmbvpxv7u.webp",
      "e6fvpot7dzsnh7ze8psc.webp",
      "edexturzfxpiwksx1vq6.webp",
      "egbd3qvyvharvdlbzoyq.webp",
      "em9vnmahysxnbjkhvugh.webp",
      "fcgpuojddvbw73ctd4bz.webp",
      "fqcu8ymmk3qoou9t6q6g.webp",
      "gbfhk2dm1grvsshcvynl.webp",
      "gcjh7ovwpicdoxyg5n6p.webp",
      "ge3sx3ifv40scqvostbt.webp",
      "h2uaoso0cy1hnqdvi09i.webp",
      "hlibcffst6kood4qirxu.webp",
      "ho4yvya7agvrmtfa5jlr.webp",
      "hocsldfwg87gmi37fni7.webp",
      "huewipi4f2ejubzy9kvg.webp",
      "huud0brrm7zdgzpfmsen.webp",
      "i1kvzekr3bl6g2yowbfm.webp",
      "irxudjzgziujsjlx2ry1.webp",
      "jbja225gwvvdkk6q3ym3.webp",
      "jjnldc1hxadzs0k5mpm0.webp",
      "jsblwgxyqfxoayf12fji.webp",
      "kptc2lovgju30bmxyefs.webp",
      "l2buo88sdtfakbxmi0r8.webp",
      "ltgizrr9gz9pax189tix.webp",
      "lxahbjcomtsesaaynlsx.webp",
      "lzah4wmamyfwwjyinwnm.webp",
      "mc1tmnwdxy7ny1ehvbyq.webp",
      "mmft4jefsyvjb1zjby0q.webp",
      "mqywiunjhtilqzrzyxk0.webp",
      "msmz6olpjslreotv2msg.webp",
      "myzm9eiy4jwtw8im2mj9.webp",
      "nc9clnzutxwyswiwzbzc.webp",
      "nswzsaunhbtquvllup56.webp",
      "o5m7j7ahtntqvimnxsc8.webp",
      "oadh0v01o52xzkre3uwe.webp",
      "oayiceknyqxweeoima5i.webp",
      "ofoldd9w6mgdkel72o6x.webp",
      "ov3pjviojutpdkc4xkcx.webp",
      "pzrifd92itxhmx0jhieb.webp",
      "qrlsmb6hzjzciio3f3ub.webp",
      "quiqs1cxunb2k0uhczyc.webp",
      "qx8dq8v91fz8y0bub4bp.webp",
      "red2csajdhrmjdwgpqxm.webp",
      "rgys0fznalayavyhv6dt.webp",
      "rilg7ccaer4ta2oxed1a.webp",
      "s0ieyrv0ifxespcxusxk.webp",
      "slejh5fcwal30dkpemjt.webp",
      "sypkazu1b4rh0xfxbnsv.webp",
      "ti40a8pyuxbajfa7s6yt.webp",
      "tn06uaibrljyfireqsbc.webp",
      "tpmqdw31sogsy4uavije.webp",
      "tvisyapozydmlyxq1nrn.webp",
      "v89nub3rnmxk3ys8sbkr.webp",
      "vsogoffljdz0jzz58lyo.webp",
      "vu9rigesntka2pw3lqyw.webp",
      "w9dug5eqtp3wsobdwodd.webp",
      "w9z7cwxme2o2ydk0d3uv.webp",
      "wbjbloyka6isggl8ixhm.webp",
      "wkgfu6r5lhjououbbmbg.webp",
      "wo9zheyubjl2uxko710q.webp",
      "xhtd5bjdwepglge9osaz.webp",
      "xnq5de1znhnvwbscfd5j.webp",
      "y9fklsr03g7clowkz3bl.webp",
      "ydbl76auwmjp045uxohu.webp",
      "ydsrniuc48jnmmvwuvjn.webp",
      "yf4wsbkpbssl5gydtqum.webp",
      "ykx4pvobkp4ri0byrnaz.webp",
      "yn3zrbmkzd2cupbdeyxa.webp",
      "ynxbv7jrdmh5htxxmty1.webp",
      "yohsjueimzis8r92klai.webp",
      "yvojvf4vy1pctyvphgfq.webp",
      "z2n6y3ocxr3rgiq2yvkr.webp",
      "z7wqttd2h39xadmghgrv.webp",
      "zlqmsvrqwnazjq26w9y4.webp",
      "zr5gpcusqqsz7q14mqgq.webp",
      "zt0nmq2heravpm3ijjf1.webp"
    ]
  },
  "casa-heliconia": {
    "titleKey": "gallery.prop.heliconia",
    "carousel": [
      "costa-rica-casa-heliconia-2024-009.jpg",
      "costa-rica-casa-heliconia-2024-091.jpg",
      "costa-rica-casa-heliconia-2024-084.jpg",
      "costa-rica-casa-heliconia-2024-105.jpg",
      "costa-rica-casa-heliconia-2024-106.jpg",
      "costa-rica-casa-heliconia-2024-060.jpg",
      "costa-rica-casa-heliconia-2024-079.jpg",
      "costa-rica-casa-heliconia-2024-016.jpg"
    ],
    "all": [
      "costa-rica-casa-heliconia-2024-009.jpg",
      "costa-rica-casa-heliconia-2024-013.jpg",
      "costa-rica-casa-heliconia-2024-016.jpg",
      "costa-rica-casa-heliconia-2024-018.jpg",
      "costa-rica-casa-heliconia-2024-030.jpg",
      "costa-rica-casa-heliconia-2024-056.jpg",
      "costa-rica-casa-heliconia-2024-057.jpg",
      "costa-rica-casa-heliconia-2024-059.jpg",
      "costa-rica-casa-heliconia-2024-060.jpg",
      "costa-rica-casa-heliconia-2024-076.jpg",
      "costa-rica-casa-heliconia-2024-079.jpg",
      "costa-rica-casa-heliconia-2024-080.jpg",
      "costa-rica-casa-heliconia-2024-082.jpg",
      "costa-rica-casa-heliconia-2024-084.jpg",
      "costa-rica-casa-heliconia-2024-087.jpg",
      "costa-rica-casa-heliconia-2024-089.jpg",
      "costa-rica-casa-heliconia-2024-090.jpg",
      "costa-rica-casa-heliconia-2024-091.jpg",
      "costa-rica-casa-heliconia-2024-097.jpg",
      "costa-rica-casa-heliconia-2024-099.jpg",
      "costa-rica-casa-heliconia-2024-100.jpg",
      "costa-rica-casa-heliconia-2024-103.jpg",
      "costa-rica-casa-heliconia-2024-104.jpg",
      "costa-rica-casa-heliconia-2024-105.jpg",
      "costa-rica-casa-heliconia-2024-106.jpg",
      "costa-rica-casa-heliconia-2024-108.jpg",
      "costa-rica-casa-heliconia-2024-109.jpg",
      "costa-rica-casa-heliconia-2024-110.jpg",
      "costa-rica-casa-heliconia-2024-111.jpg",
      "costa-rica-casa-heliconia-2024-113.jpg",
      "costa-rica-casa-heliconia-2024-115.jpg",
      "costa-rica-casa-heliconia-2024-116.jpg",
      "costa-rica-casa-heliconia-2024-117.jpg",
      "costa-rica-casa-heliconia-2024-118.jpg",
      "costa-rica-casa-heliconia-2024-140.jpg",
      "costa-rica-casa-heliconia-2024-145.jpg",
      "costa-rica-casa-heliconia-2024-147.jpg",
      "costa-rica-casa-heliconia-2024-148.jpg",
      "costa-rica-casa-heliconia-2024-149.jpg",
      "costa-rica-casa-heliconia-2024-150.jpg"
    ]
  }
};

  // State with try/catch for localStorage
  let currentLang = "en";
  let currentTheme = "light";
  
  try {
    currentLang = localStorage.getItem("kuwago-language") || "en";
    currentTheme = localStorage.getItem("kuwago-theme") || "light";
  } catch (e) {
    console.warn("localStorage is not available.");
  }

  function getDictionary(lang) {
    if (typeof i18n !== "undefined" && i18n && i18n[lang]) {
      return i18n[lang];
    }
    if (typeof window !== "undefined" && window.i18n && window.i18n[lang]) {
      return window.i18n[lang];
    }
    return null;
  }

  function applyTranslations(lang) {
    const dict = getDictionary(lang);
    if (!dict) return;

    document.documentElement.lang = lang;
    document.title = dict["site.title"];
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = dict["site.desc"];

    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (dict[key]) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = dict[key];
        } else {
          el.textContent = dict[key];
        }
      }
    });

    document.querySelectorAll("[data-i18n-aria]").forEach(el => {
      const key = el.getAttribute("data-i18n-aria");
      if (dict[key]) el.setAttribute("aria-label", dict[key]);
    });

    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.getAttribute("data-i18n-title");
      if (dict[key]) el.setAttribute("title", dict[key]);
    });

    // Handle pending contact links title
    const contactLinks = document.querySelectorAll('.contact-pending');
    contactLinks.forEach(link => {
      const label = link.getAttribute('data-pending-label');
      if (label && dict["contact.pending"]) {
        link.setAttribute("title", dict["contact.pending"].replace("{label}", label));
      }
    });

    // Update gallery cards dynamic aria-label
    const openCardPattern = dict["gallery.card_open"] || (lang === "es" ? "Abrir {title}" : "Open {title}");
    document.querySelectorAll("[data-gallery-card]").forEach(card => {
      const textCandidates = [...card.querySelectorAll("p")];
      const titleKey = textCandidates[0]?.getAttribute("data-i18n");
      const titleText = (titleKey && dict[titleKey]) ? dict[titleKey] : (textCandidates[0]?.textContent.trim() || "gallery image");
      card.setAttribute("aria-label", openCardPattern.replace("{title}", titleText));
    });

    // Update property cards dynamic aria-label
    document.querySelectorAll("[data-property-card]").forEach(card => {
      const propKey = card.getAttribute("data-property-card");
      const prop = PROPERTY_DATA[propKey];
      const titleText = (prop && dict[prop.titleKey]) ? dict[prop.titleKey] : (card.querySelector("h3, p")?.textContent.trim() || "property");
      card.setAttribute("aria-label", openCardPattern.replace("{title}", titleText));
    });

    document.querySelectorAll('[data-i18n-alt]').forEach(img => {
      const key = img.getAttribute('data-i18n-alt');
      if (dict[key]) img.alt = dict[key];
    });

    // Update project cards dynamic aria-label
    document.querySelectorAll("[data-project-id]").forEach(card => {
      const pid = card.getAttribute("data-project-id");
      const proj = PROJECTS_DATA[pid];
      const titleText = (proj && dict[proj.titleKey]) ? dict[proj.titleKey] : (card.querySelector("h3, p")?.textContent.trim() || "project");
      card.setAttribute("aria-label", openCardPattern.replace("{title}", titleText));
    });

    // Update mobile menu button dynamic aria-label
    const menuBtn = document.getElementById("mobile-menu-button");
    if (menuBtn) {
      const isOpen = menuBtn.getAttribute("aria-expanded") === "true";
      const openLabel = dict["nav.mobile_open"] || (lang === "es" ? "Abrir menú de navegación" : "Open navigation menu");
      const closeLabel = dict["nav.mobile_close"] || (lang === "es" ? "Cerrar menú de navegación" : "Close navigation menu");
      menuBtn.setAttribute("aria-label", isOpen ? closeLabel : openLabel);
    }

    // Update lightbox if open
    if (modal && !modal.classList.contains("hidden")) {
      const activeCard = document.querySelector('[data-gallery-card][aria-expanded="true"]');
      if (activeCard) {
        const textCandidates = [...activeCard.querySelectorAll("p")];
        const titleKey = textCandidates[0]?.getAttribute("data-i18n");
        const badge = activeCard.querySelector("span[data-i18n]");
        const badgeKey = badge?.getAttribute("data-i18n");
        if (titleKey && dict[titleKey]) {
          modalTitle.textContent = dict[titleKey];
          modalImage.alt = dict[titleKey];
        }
        if (badgeKey && dict[badgeKey]) {
          modalBadge.textContent = dict[badgeKey];
        }
      }
    }

    // Update property modal if open
    if (propModal && !propModal.classList.contains("hidden") && currentActivePropKey) {
      const prop = PROPERTY_DATA[currentActivePropKey];
      if (prop && dict[prop.titleKey]) {
        propModalTitle.textContent = dict[prop.titleKey];
        if (propModalImg) {
          propModalImg.alt = `${dict[prop.titleKey]} - ${prop.all[currentGalleryIdx] || ""}`;
        }
      }
    }
  }

  function updateLanguageButtons(lang) {
    document.querySelectorAll('[data-lang]').forEach(btn => {
      const isSelected = btn.getAttribute('data-lang') === lang;
      btn.setAttribute("aria-pressed", isSelected);
      if (isSelected) {
        btn.classList.add('bg-primary-container', 'text-pure-white', 'dark:bg-bright-gold', 'dark:text-[#241B29]');
        btn.classList.remove('text-on-surface', 'text-on-surface-variant', 'dark:text-dark-text-secondary', 'dark:text-warm-off-white', 'hover:bg-surface-variant', 'dark:hover:bg-white/5', 'dark:hover:bg-white/10');
      } else {
        btn.classList.remove('bg-primary-container', 'text-pure-white', 'dark:bg-bright-gold', 'dark:text-[#241B29]');
        btn.classList.add('text-on-surface', 'dark:text-warm-off-white', 'hover:bg-surface-variant', 'dark:hover:bg-white/10');
      }
    });
    
    document.querySelectorAll('[data-lang-mobile]').forEach(btn => {
      const isSelected = btn.getAttribute('data-lang-mobile') === lang;
      btn.setAttribute("aria-pressed", isSelected);
      if (isSelected) {
        btn.classList.add('bg-primary-container', 'text-pure-white', 'dark:bg-bright-gold', 'dark:text-[#241B29]');
        btn.classList.remove('text-on-surface', 'text-on-surface-variant', 'dark:text-dark-text-secondary', 'dark:text-warm-off-white', 'hover:bg-surface-variant', 'dark:hover:bg-white/5', 'dark:hover:bg-white/10');
      } else {
        btn.classList.remove('bg-primary-container', 'text-pure-white', 'dark:bg-bright-gold', 'dark:text-[#241B29]');
        btn.classList.add('text-on-surface', 'dark:text-warm-off-white', 'hover:bg-surface-variant', 'dark:hover:bg-white/10');
      }
    });
  }

  function setupLanguage() {
    applyTranslations(currentLang);
    updateLanguageButtons(currentLang);

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lang], [data-lang-mobile]');
      if (btn) {
        const lang = btn.getAttribute('data-lang') || btn.getAttribute('data-lang-mobile');
        if (lang && lang !== currentLang) {
          currentLang = lang;
          try {
            localStorage.setItem('kuwago-language', lang);
          } catch (err) {}
          applyTranslations(lang);
          updateLanguageButtons(lang);
        }
      }
    });
  }

  function setupTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const updateIcon = () => {
      if (currentTheme === 'dark') {
        toggleBtn?.setAttribute('data-i18n-aria', 'theme.light');
        toggleBtn?.setAttribute('data-i18n-title', 'theme.light');
      } else {
        toggleBtn?.setAttribute('data-i18n-aria', 'theme.dark');
        toggleBtn?.setAttribute('data-i18n-title', 'theme.dark');
      }
      const dict = getDictionary(currentLang);
      if (dict && toggleBtn) {
        const key = currentTheme === 'dark' ? 'theme.light' : 'theme.dark';
        if (dict[key]) {
          toggleBtn.setAttribute('aria-label', dict[key]);
          toggleBtn.setAttribute('title', dict[key]);
        }
      }
    };

    updateIcon();

    toggleBtn?.addEventListener('click', () => {
      currentTheme = currentTheme === 'light' ? 'dark' : 'light';
      if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        localStorage.setItem('kuwago-theme', currentTheme);
      } catch (err) {}
      updateIcon();
    });
  }

  function setupMobileNavigation() {
    const nav = document.querySelector("header nav");
    const headerContainer = document.querySelector("header > div");
    if (!nav || !headerContainer) return;

    const menuButton = document.createElement("button");
    menuButton.id = "mobile-menu-button";
    menuButton.type = "button";
    menuButton.className = "md:hidden p-2 rounded-full text-on-surface dark:text-warm-off-white hover:bg-surface-variant dark:hover:bg-dark-elevated transition-colors flex items-center justify-center";
    menuButton.setAttribute("aria-label", "Open navigation menu");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-controls", "mobile-menu");
    menuButton.innerHTML = `<span class="material-symbols-outlined text-[24px]">menu</span>`;

    const rightActions = headerContainer.querySelector("div:last-child");
    if (rightActions) {
      rightActions.insertBefore(menuButton, rightActions.firstChild);
    } else {
      headerContainer.appendChild(menuButton);
    }

    const mobileMenu = document.createElement("div");
    mobileMenu.id = "mobile-menu";
    mobileMenu.hidden = true;
    mobileMenu.setAttribute("aria-label", "Mobile navigation");
    mobileMenu.setAttribute("data-i18n-aria", "nav.mobile_label");
    mobileMenu.innerHTML = `
      <a href="#home" data-i18n="nav.home">Home</a>
      <a href="#about" data-i18n="nav.about">About</a>
      <a href="#gallery" data-i18n="nav.gallery">Gallery</a>
      <a href="#contact" data-i18n="nav.contact">Contact</a>
      <div class="flex items-center gap-2 p-[0.9rem_1.5rem] border-t border-outline-variant dark:border-dark-elevated transition-colors">
        <div class="flex items-center bg-surface-container dark:bg-dark-elevated rounded-full p-0.5" role="group" aria-label="Language selection" data-i18n-aria="nav.lang_select">
          <button type="button" data-lang-mobile="en" class="px-4 py-1.5 rounded-full text-label-md font-bold transition-all">EN</button>
          <button type="button" data-lang-mobile="es" class="px-4 py-1.5 rounded-full text-label-md font-bold transition-all">ES</button>
        </div>
      </div>
    `;
    header.appendChild(mobileMenu);

    const setOpen = (open) => {
      mobileMenu.hidden = !open;
      menuButton.setAttribute("aria-expanded", String(open));
      const dict = getDictionary(currentLang);
      const openLabel = (dict && dict["nav.mobile_open"]) || (currentLang === "es" ? "Abrir menú de navegación" : "Open navigation menu");
      const closeLabel = (dict && dict["nav.mobile_close"]) || (currentLang === "es" ? "Cerrar menú de navegación" : "Close navigation menu");
      menuButton.setAttribute("aria-label", open ? closeLabel : openLabel);
      menuButton.querySelector("span").textContent = open ? "close" : "menu";
    };

    menuButton.addEventListener("click", () => {
      const willOpen = mobileMenu.hidden;
      setOpen(willOpen);
    });

    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  }

  function openLightbox(card) {
    if (!modal || !modalImage || !modalTitle || !modalBadge) return;

    const image = card.querySelector("img");
    const badge = card.querySelector("span[data-i18n]");
    const textCandidates = [...card.querySelectorAll("p")];
    const titleKey = textCandidates[0]?.getAttribute("data-i18n");
    const badgeKey = badge?.getAttribute("data-i18n");
    
    const dict = getDictionary(currentLang);

    modalImage.src = image?.src || "";
    modalImage.alt = (titleKey && dict && dict[titleKey]) ? dict[titleKey] : (textCandidates[0]?.textContent.trim() || "Gallery image");
    modalTitle.textContent = (titleKey && dict && dict[titleKey]) ? dict[titleKey] : (textCandidates[0]?.textContent.trim() || "Gallery image");
    modalBadge.textContent = (badgeKey && dict && dict[badgeKey]) ? dict[badgeKey] : (badge?.textContent.trim() || "Gallery");
    
    document.querySelectorAll('[data-gallery-card]').forEach(c => c.removeAttribute('aria-expanded'));
    card.setAttribute('aria-expanded', 'true');

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
    previousFocus = document.activeElement;
    modal.querySelector("button")?.focus();
  }

  function closeLightbox() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = "";
    modalImage.removeAttribute("src");
    const activeCard = document.querySelector('[data-gallery-card][aria-expanded="true"]');
    if (activeCard) {
      activeCard.removeAttribute('aria-expanded');
    }
    previousFocus?.focus();
  }

  function setupGallery() {
    const cards = [...document.querySelectorAll('#glimpses-grid [data-gallery-card]')];
    const glimpsesCards = [...(document.getElementById('glimpses-grid')?.querySelectorAll('[data-gallery-card]') || document.querySelectorAll('#gallery [data-category]'))];
    const filterButtons = [...document.querySelectorAll('#gallery button[data-filter]')];

    cards.forEach((card) => {
      card.addEventListener("click", () => openLightbox(card));
    });

    const closeButton = document.getElementById("lightbox-close");
    closeButton?.addEventListener("click", closeLightbox);

    modal?.setAttribute("role", "dialog");
    modal?.setAttribute("aria-modal", "true");
    modal?.setAttribute("aria-labelledby", "lightbox-title");
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) closeLightbox();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal?.classList.contains("hidden")) closeLightbox();
    });

    const applyFilter = (selectedButton) => {
      const selectedCategory = (selectedButton.getAttribute("data-filter") || "all").toLowerCase();

      filterButtons.forEach((btn) => {
        const active = btn === selectedButton;
        btn.setAttribute("aria-pressed", String(active));
        if (active) {
          btn.classList.add("bg-primary-container", "text-pure-white", "dark:bg-bright-gold", "dark:text-[#241B29]", "shadow-sm");
          btn.classList.remove("bg-surface-container", "text-on-surface-variant", "dark:bg-dark-elevated", "dark:text-dark-text-secondary");
        } else {
          btn.classList.remove("bg-primary-container", "text-pure-white", "dark:bg-bright-gold", "dark:text-[#241B29]", "shadow-sm");
          btn.classList.add("bg-surface-container", "text-on-surface-variant", "dark:bg-dark-elevated", "dark:text-dark-text-secondary");
        }
      });

      glimpsesCards.forEach((card) => {
        const cardCategory = (card.getAttribute("data-category") || "").toLowerCase();
        const show = selectedCategory === "all" || cardCategory === selectedCategory;

        if (show) {
          card.classList.remove("hidden");
          card.style.display = "";
        } else {
          card.classList.add("hidden");
          card.style.display = "none";
        }
      });
    };

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => applyFilter(btn));
    });
  }

  function renderPropertyPhoto(index) {
    const prop = PROPERTY_DATA[currentActivePropKey];
    if (!prop || !prop.all || prop.all.length === 0 || !propModalImg) return;

    const total = prop.all.length;
    currentGalleryIdx = (index + total) % total;
    const filename = prop.all[currentGalleryIdx];
    const photoSrc = `assets/images/properties/${currentActivePropKey}/${filename}`;

    propModalImg.src = photoSrc;
    const dict = getDictionary(currentLang);
    const title = (dict && dict[prop.titleKey]) ? dict[prop.titleKey] : (currentActivePropKey || "Property");
    propModalImg.alt = `${title} - ${filename}`;
    if (propModalCounter) propModalCounter.textContent = `${currentGalleryIdx + 1} / ${total}`;
    if (propModalFilename) propModalFilename.textContent = filename;

    // Preload adjacent images
    const nextIdx = (currentGalleryIdx + 1) % total;
    const prevIdx = (currentGalleryIdx - 1 + total) % total;
    const preloadNext = new Image();
    preloadNext.src = `assets/images/properties/${currentActivePropKey}/${prop.all[nextIdx]}`;
    const preloadPrev = new Image();
    preloadPrev.src = `assets/images/properties/${currentActivePropKey}/${prop.all[prevIdx]}`;
  }

  function openPropertyGallery(propKey, currentCarouselIdx) {
    const prop = PROPERTY_DATA[propKey];
    if (!prop || !propModal) return;

    currentActivePropKey = propKey;
    const dict = getDictionary(currentLang);
    if (propModalTitle) {
      propModalTitle.textContent = (dict && dict[prop.titleKey]) ? dict[prop.titleKey] : propKey;
    }

    // Match active carousel image index in the full list
    const currentFile = prop.carousel[currentCarouselIdx];
    const initialIdx = prop.all.indexOf(currentFile);
    currentGalleryIdx = initialIdx >= 0 ? initialIdx : 0;

    renderPropertyPhoto(currentGalleryIdx);

    propModal.classList.remove("hidden");
    propModal.classList.add("flex");
    document.body.style.overflow = "hidden";
    previousFocus = document.activeElement;
    propModalClose?.focus();
  }

  function closePropertyGallery() {
    if (!propModal) return;
    propModal.classList.add("hidden");
    propModal.classList.remove("flex");
    document.body.style.overflow = "";
    if (propModalImg) propModalImg.removeAttribute("src");
    currentActivePropKey = null;
    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }
  }

  function setupPropertyCards() {
    const cards = [...document.querySelectorAll("[data-property-card]")];
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let sharedCarouselIndex = 0;
    let sharedCarouselIntervalId = null;
    let isHoveredAnyPropertyCard = false;
    const SHARED_CAROUSEL_INTERVAL_MS = 4500;
    const cardStates = [];

    function advanceCardTo(state, targetIndex) {
      const file = state.data.carousel[targetIndex];
      const nextSrc = `assets/images/properties/${state.propKey}/${file}`;

      const onImageReady = (incomingImg, outgoingImg, nextLayer) => {
        incomingImg.classList.remove("opacity-0");
        incomingImg.classList.add("opacity-100");
        outgoingImg?.classList.remove("opacity-100");
        outgoingImg?.classList.add("opacity-0");
        state.activeLayer = nextLayer;
        state.currentIndex = targetIndex;
      };

      if (state.activeLayer === "A") {
        if (state.imgB) {
          state.imgB.onload = () => onImageReady(state.imgB, state.imgA, "B");
          state.imgB.src = nextSrc;
          if (state.imgB.complete && state.imgB.naturalWidth > 0) {
            onImageReady(state.imgB, state.imgA, "B");
          }
        }
      } else {
        if (state.imgA) {
          state.imgA.onload = () => onImageReady(state.imgA, state.imgB, "A");
          state.imgA.src = nextSrc;
          if (state.imgA.complete && state.imgA.naturalWidth > 0) {
            onImageReady(state.imgA, state.imgB, "A");
          }
        }
      }
    }

    function tickSharedCarousel() {
      if (prefersReducedMotion) return;
      if (isHoveredAnyPropertyCard) return;
      if (document.hidden) return;
      if (propModal && !propModal.classList.contains("hidden")) return;
      if (modal && !modal.classList.contains("hidden")) return;
      const projModal = document.getElementById("project-details-modal");
      if (projModal && !projModal.classList.contains("hidden")) return;

      const nextIndex = (sharedCarouselIndex + 1) % 8;
      cardStates.forEach((state) => {
        advanceCardTo(state, nextIndex);
      });
      sharedCarouselIndex = nextIndex;

      // Preload next cycle's images for all 4 cards
      const preloadIndex = (nextIndex + 1) % 8;
      cardStates.forEach((state) => {
        const nextFile = state.data.carousel[preloadIndex];
        const img = new Image();
        img.src = `assets/images/properties/${state.propKey}/${nextFile}`;
      });
    }

    cards.forEach((card) => {
      const propKey = card.getAttribute("data-property-card");
      const data = PROPERTY_DATA[propKey];
      if (!data) return;

      const imgA = card.querySelector(".property-img-a");
      const imgB = card.querySelector(".property-img-b");

      const state = {
        propKey,
        data,
        card,
        imgA,
        imgB,
        activeLayer: "A",
        currentIndex: 0
      };
      cardStates.push(state);

      card.addEventListener("mouseenter", () => { isHoveredAnyPropertyCard = true; });
      card.addEventListener("mouseleave", () => { isHoveredAnyPropertyCard = false; });
      card.addEventListener("focusin", () => { isHoveredAnyPropertyCard = true; });
      card.addEventListener("focusout", () => { isHoveredAnyPropertyCard = false; });

      card.addEventListener("click", () => {
        openPropertyGallery(propKey, sharedCarouselIndex);
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPropertyGallery(propKey, sharedCarouselIndex);
        }
      });
    });

    if (!prefersReducedMotion && cardStates.length > 0) {
      sharedCarouselIntervalId = setInterval(tickSharedCarousel, SHARED_CAROUSEL_INTERVAL_MS);

      // Preload index 1 for all cards
      cardStates.forEach((state) => {
        const nextFile = state.data.carousel[1];
        const img = new Image();
        img.src = `assets/images/properties/${state.propKey}/${nextFile}`;
      });
    }

    propModalPrev?.addEventListener("click", () => renderPropertyPhoto(currentGalleryIdx - 1));
    propModalNext?.addEventListener("click", () => renderPropertyPhoto(currentGalleryIdx + 1));
    propModalClose?.addEventListener("click", closePropertyGallery);

    propModal?.addEventListener("click", (event) => {
      if (event.target === propModal) closePropertyGallery();
    });

    document.addEventListener("keydown", (event) => {
      if (!propModal || propModal.classList.contains("hidden")) return;
      if (event.key === "ArrowLeft") renderPropertyPhoto(currentGalleryIdx - 1);
      else if (event.key === "ArrowRight") renderPropertyPhoto(currentGalleryIdx + 1);
      else if (event.key === "Escape") closePropertyGallery();
    });

    let touchStartX = 0;
    let touchStartY = 0;
    propModalStage?.addEventListener("touchstart", (e) => {
      if (e.changedTouches && e.changedTouches[0]) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }
    }, { passive: true });

    propModalStage?.addEventListener("touchend", (e) => {
      if (e.changedTouches && e.changedTouches[0]) {
        const diffX = e.changedTouches[0].screenX - touchStartX;
        const diffY = e.changedTouches[0].screenY - touchStartY;
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
          if (diffX > 0) renderPropertyPhoto(currentGalleryIdx - 1);
          else renderPropertyPhoto(currentGalleryIdx + 1);
        }
      }
    }, { passive: true });
  }

  function setupContactLinks() {
    const contact = window.KUWAGO_CONTACT || {};
    const phoneLink = document.querySelector('a[href^="tel:["]');
    const emailLink = document.querySelector('a[href^="mailto:["]');

    const configure = (link, value, prefix, label) => {
      if (!link) return;
      if (value) {
        link.href = `${prefix}${value}`;
        return;
      }

      link.href = "#contact";
      link.classList.add("contact-pending");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("data-pending-label", label);
      link.addEventListener("click", (event) => event.preventDefault());
    };

    configure(phoneLink, contact.phone, "tel:", "Phone number");
    configure(emailLink, contact.email, "mailto:", "Email address");
  }

  function setupNavigationState() {
    const sections = [...document.querySelectorAll("main section[id]")];
    const links = [...document.querySelectorAll('a[href^="#"]')]
      .filter((link) => link.getAttribute("href").length > 1);

    links.forEach((link) => link.removeAttribute("aria-current"));

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;

      links.forEach((link) => {
        const active = link.getAttribute("href") === `#${visible.target.id}`;
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-35% 0px -55%", threshold: [0, 0.25, 0.5] });

    sections.forEach((section) => observer.observe(section));
  }

  // Projects Data Structure (awaiting confirmed photo assignments)
  const PROJECTS_DATA = {
    "project-01": {
      titleKey: "projects.card1_title",
      status: "in_progress",
      before: [],
      after: []
    },
    "project-02": {
      titleKey: "projects.card2_title",
      status: "completed",
      before: [],
      after: []
    },
    "project-03": {
      titleKey: "projects.card3_title",
      status: "completed",
      before: ["assets/images/projects/living-room-tv-area/before.png"],
      after: ["assets/images/projects/living-room-tv-area/after.png"]
    },
    "project-04": {
      titleKey: "projects.card4_title",
      status: "pending",
      before: [],
      after: []
    }
  };

  function setupProjectSliders() {
    document.querySelectorAll(".before-after-slider-input").forEach((slider) => {
      const box = slider.closest(".before-after-box");
      if (!box) return;
      const afterLayer = box.querySelector(".after-layer");
      const divider = box.querySelector(".before-after-divider");

      const updateSlider = () => {
        const val = slider.value;
        if (afterLayer) afterLayer.style.clipPath = `inset(0 0 0 ${val}%)`;
        if (divider) divider.style.left = `${val}%`;
      };

      slider.addEventListener("input", updateSlider);
      slider.addEventListener("change", updateSlider);
      // Pointer capture keeps mouse and touch drags bound to this comparison.
      // Native range keyboard controls remain available (arrows, Home and End).
      if (box.classList.contains("tv-comparison")) {
        const updateFromPointer = event => {
          const bounds = box.getBoundingClientRect();
          slider.value = String(Math.round(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))));
          updateSlider();
        };
        slider.addEventListener("pointerdown", event => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          slider.focus({ preventScroll: true });
          slider.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        });
        slider.addEventListener("pointermove", event => {
          if (slider.hasPointerCapture(event.pointerId)) updateFromPointer(event);
        });
        slider.addEventListener("pointerup", event => {
          if (slider.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event);
            slider.releasePointerCapture(event.pointerId);
          }
        });
        slider.addEventListener("pointercancel", event => {
          if (slider.hasPointerCapture(event.pointerId)) slider.releasePointerCapture(event.pointerId);
        });
      }
      updateSlider();
    });
  }

  function setupProjectModal() {
    const projModal = document.getElementById("project-details-modal");
    const projModalTitle = document.getElementById("project-modal-title");
    const projModalStatus = document.getElementById("project-modal-status");
    const projModalClose = document.getElementById("project-modal-close");
    const beforeGallery = document.getElementById("project-modal-before-gallery");
    const afterGallery = document.getElementById("project-modal-after-gallery");
    const beforeCount = document.getElementById("project-modal-before-count");
    const afterCount = document.getElementById("project-modal-after-count");

    const beforePlaceholder = beforeGallery?.innerHTML || '';
    const afterPlaceholder = afterGallery?.innerHTML || '';

    function openProjectDetails(projectId) {
      const project = PROJECTS_DATA[projectId];
      if (!project || !projModal) return;
      projModal.classList.toggle("project-tv-detail", projectId === "project-03");

      const dict = getDictionary(currentLang);
      if (projModalTitle) {
        projModalTitle.textContent = (dict && dict[project.titleKey]) ? dict[project.titleKey] : projectId;
      }

      if (projModalStatus) {
        const isCompleted = project.status === "completed";
        const isPending = project.status === "pending";
        const statusKey = isPending ? "projects.status.pending" : (isCompleted ? "projects.status.completed" : "projects.status.in_progress");
        const statusText = (dict && dict[statusKey]) || (isPending ? "Status pending confirmation" : (isCompleted ? "Completed" : "In progress"));
        projModalStatus.textContent = statusText;
        projModalStatus.className = isPending
          ? "inline-flex items-center px-3 py-0.5 rounded-full text-label-sm font-label-sm font-bold bg-surface-container dark:bg-dark-elevated text-on-surface-variant dark:text-dark-text-secondary border border-outline-variant/30"
          : isCompleted
          ? "inline-flex items-center px-3 py-0.5 rounded-full text-label-sm font-label-sm font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
          : "inline-flex items-center px-3 py-0.5 rounded-full text-label-sm font-label-sm font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30";
      }

      const photoCount = count => `${count} ${currentLang === "es" ? (count === 1 ? "foto" : "fotos") : (count === 1 ? "photo" : "photos")}`;
      if (beforeCount) beforeCount.textContent = photoCount(project.before.length);
      if (afterCount) afterCount.textContent = photoCount(project.after.length);

      if (beforeGallery) beforeGallery.innerHTML = beforePlaceholder;
      if (afterGallery) afterGallery.innerHTML = afterPlaceholder;
      applyTranslations(currentLang);
      if (project.before.length > 0 && beforeGallery) {
        beforeGallery.innerHTML = project.before.map((src, i) => `
          <div class="col-span-full rounded-lg overflow-hidden bg-black/20 shadow-sm">
            <img src="${src}" alt="${dict[project.titleKey]} — ${dict["projects.before"]} ${i + 1}" class="w-full h-auto object-contain">
          </div>
        `).join("");
      }
      if (project.after.length > 0 && afterGallery) {
        afterGallery.innerHTML = project.after.map((src, i) => `
          <div class="col-span-full rounded-lg overflow-hidden bg-black/20 shadow-sm">
            <img src="${src}" alt="${dict[project.titleKey]} — ${dict["projects.after"]} ${i + 1}" class="w-full h-auto object-contain">
          </div>
        `).join("");
      }

      projModal.classList.remove("hidden");
      projModal.classList.add("flex");
      document.body.style.overflow = "hidden";
      previousFocus = document.activeElement;
      projModalClose?.focus();
    }

    function closeProjectDetails() {
      if (!projModal) return;
      projModal.classList.add("hidden");
      projModal.classList.remove("flex");
      document.body.style.overflow = "";
      previousFocus?.focus();
    }

    document.querySelectorAll("[data-open-project]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pid = btn.getAttribute("data-open-project");
        openProjectDetails(pid);
      });
    });

    document.querySelectorAll("[data-project-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".before-after-slider-input") || e.target.closest("[data-open-project]")) return;
        const pid = card.getAttribute("data-project-id");
        openProjectDetails(pid);
      });

      card.addEventListener("keydown", (e) => {
        if (e.target.closest(".before-after-slider-input") || e.target.closest("[data-open-project]")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const pid = card.getAttribute("data-project-id");
          openProjectDetails(pid);
        }
      });
    });

    projModalClose?.addEventListener("click", closeProjectDetails);
    projModal?.addEventListener("click", (e) => {
      if (e.target === projModal) closeProjectDetails();
    });

    document.addEventListener("keydown", (e) => {
      if (!projModal || projModal.classList.contains("hidden")) return;
      if (e.key === "Escape") closeProjectDetails();
    });
  }

  setupMobileNavigation();
  setupGallery();
  setupPropertyCards();
  setupProjectSliders();
  setupProjectModal();
  setupContactLinks();
  setupNavigationState();
  setupTheme();
  
  if (typeof i18n !== "undefined" || (typeof window !== "undefined" && window.i18n)) {
    setupLanguage();
  } else {
    window.addEventListener('DOMContentLoaded', setupLanguage);
    window.addEventListener('load', setupLanguage);
  }
})();
