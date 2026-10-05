(() => {
  const header = document.querySelector("header");
  const modal = document.getElementById("lightbox-modal");
  const modalImage = document.getElementById("lightbox-img");
  const modalTitle = document.getElementById("lightbox-title");
  const modalBadge = document.getElementById("lightbox-badge");
  let previousFocus = null;

  // State with try/catch for localStorage
  let currentLang = "en";
  let currentTheme = "light";
  
  try {
    currentLang = localStorage.getItem("kuwago-language") || "en";
    currentTheme = localStorage.getItem("kuwago-theme") || "light";
  } catch (e) {
    console.warn("localStorage is not available.");
  }

  function applyTranslations(lang) {
    const dict = window.i18n ? window.i18n[lang] : null;
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

    // Update lightbox if open
    if (modal && !modal.classList.contains("hidden")) {
      const activeCard = document.querySelector('[data-gallery-card][aria-expanded="true"]');
      if (activeCard) {
        const textCandidates = [...activeCard.querySelectorAll("p")];
        const titleKey = textCandidates[0]?.getAttribute("data-i18n");
        const badge = activeCard.querySelector("span[data-i18n]");
        const badgeKey = badge?.getAttribute("data-i18n");
        if (titleKey && dict[titleKey]) modalTitle.textContent = dict[titleKey];
        if (titleKey && dict[titleKey]) modalImage.alt = dict[titleKey];
        if (badgeKey && dict[badgeKey]) modalBadge.textContent = dict[badgeKey];
      }
    }
  }

  function updateLanguageButtons(lang) {
    document.querySelectorAll('[data-lang]').forEach(btn => {
      const isSelected = btn.getAttribute('data-lang') === lang;
      btn.setAttribute("aria-pressed", isSelected);
      if (isSelected) {
        btn.classList.add('bg-primary-container', 'text-pure-white', 'dark:bg-bright-gold', 'dark:text-[#241B29]');
        btn.classList.remove('text-on-surface-variant', 'dark:text-dark-text-secondary', 'hover:bg-surface-variant', 'dark:hover:bg-white/5');
      } else {
        btn.classList.remove('bg-primary-container', 'text-pure-white', 'dark:bg-bright-gold', 'dark:text-[#241B29]');
        btn.classList.add('text-on-surface-variant', 'dark:text-dark-text-secondary', 'hover:bg-surface-variant', 'dark:hover:bg-white/5');
      }
    });
    
    document.querySelectorAll('[data-lang-mobile]').forEach(btn => {
      const isSelected = btn.getAttribute('data-lang-mobile') === lang;
      btn.setAttribute("aria-pressed", isSelected);
      if (isSelected) {
        btn.classList.add('bg-primary-container', 'text-pure-white', 'dark:bg-bright-gold', 'dark:text-[#241B29]');
        btn.classList.remove('text-on-surface-variant', 'dark:text-dark-text-secondary', 'hover:bg-surface-variant', 'dark:hover:bg-surface/10');
      } else {
        btn.classList.remove('bg-primary-container', 'text-pure-white', 'dark:bg-bright-gold', 'dark:text-[#241B29]');
        btn.classList.add('text-on-surface-variant', 'dark:text-dark-text-secondary', 'hover:bg-surface-variant', 'dark:hover:bg-surface/10');
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
        toggleBtn.setAttribute('data-i18n-aria', 'theme.light');
        toggleBtn.setAttribute('data-i18n-title', 'theme.light');
      } else {
        toggleBtn.setAttribute('data-i18n-aria', 'theme.dark');
        toggleBtn.setAttribute('data-i18n-title', 'theme.dark');
      }
      applyTranslations(currentLang);
    };

    if (toggleBtn) {
      updateIcon();
      toggleBtn.addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        try {
          localStorage.setItem('kuwago-theme', currentTheme);
        } catch (err) {}
        if (currentTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        updateIcon();
      });
    }
  }

  function setupMobileNavigation() {
    if (!header) return;

    const personIcon = [...header.querySelectorAll(".material-symbols-outlined")]
      .find((icon) => icon.textContent.trim() === "person");

    if (!personIcon) return;

    const originalControl = personIcon.parentElement;
    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.id = "mobile-menu-button";
    menuButton.className = "md:hidden w-10 h-10 rounded-full bg-primary-container dark:bg-bright-gold text-pure-white dark:text-[#241B29] flex items-center justify-center transition-colors";
    menuButton.setAttribute("aria-label", "Open navigation menu");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-controls", "mobile-menu");
    menuButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">menu</span>';
    originalControl.replaceWith(menuButton);

    const mobileMenu = document.createElement("nav");
    mobileMenu.id = "mobile-menu";
    mobileMenu.hidden = true;
    mobileMenu.setAttribute("aria-label", "Mobile navigation");
    mobileMenu.innerHTML = `
      <a href="#home" data-i18n="nav.home">Home</a>
      <a href="#about" data-i18n="nav.about">About</a>
      <a href="#gallery" data-i18n="nav.gallery">Gallery</a>
      <a href="#contact" data-i18n="nav.contact">Contact</a>
      <div class="flex items-center gap-2 p-[0.9rem_1.5rem] border-t border-outline-variant dark:border-dark-elevated transition-colors">
        <div class="flex items-center bg-surface-container dark:bg-dark-elevated rounded-full p-0.5" role="group" aria-label="Language selection">
          <button type="button" data-lang-mobile="en" class="px-4 py-1.5 rounded-full text-label-md font-bold transition-all">EN</button>
          <button type="button" data-lang-mobile="es" class="px-4 py-1.5 rounded-full text-label-md font-bold transition-all">ES</button>
        </div>
      </div>
    `;
    header.appendChild(mobileMenu);
    
    updateLanguageButtons(currentLang);

    const setOpen = (open) => {
      mobileMenu.hidden = !open;
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      menuButton.querySelector("span").textContent = open ? "close" : "menu";
    };

    menuButton.addEventListener("click", () => {
      setOpen(menuButton.getAttribute("aria-expanded") !== "true");
    });

    mobileMenu.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
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
    
    const dict = window.i18n ? window.i18n[currentLang] : null;

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
    const cards = [...document.querySelectorAll('[data-gallery-card]')];
    
    const keyToCategory = {
      "gal.1.badge": "Property",
      "gal.2.badge": "Hospitality",
      "gal.3.badge": "Experience",
      "gal.4.badge": "Destination",
      "gal.5.badge": "Property",
      "gal.6.badge": "Hospitality",
      "gal.7.badge": "Destination",
      "gal.8.badge": "Experience"
    };

    const filterKeyToCategory = {
      "filter.all": "All",
      "filter.property": "Property",
      "filter.hospitality": "Hospitality",
      "filter.experience": "Experience",
      "filter.destination": "Destination"
    };

    cards.forEach(card => {
        const badge = card.querySelector("span[data-i18n]");
        card.setAttribute("data-category-key", badge?.getAttribute("data-i18n") || "");
    });

    cards.forEach((card) => {
      card.setAttribute("aria-label", `Open ${card.querySelector("p")?.textContent.trim() || "gallery image"}`);
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

    const filterWrap = [...document.querySelectorAll("#gallery div")].find(el => el.querySelector('button[data-i18n="filter.all"]'));
    const filters = filterWrap ? [...filterWrap.children] : [];

    const applyFilter = (selectedFilter) => {
      const selectedKey = selectedFilter.getAttribute("data-i18n");
      const targetCategory = filterKeyToCategory[selectedKey];
      
      filters.forEach((filter) => {
        const active = filter === selectedFilter;
        filter.classList.toggle("bg-primary-container", active);
        filter.classList.toggle("text-pure-white", active);
        filter.classList.toggle("dark:bg-bright-gold", active);
        filter.classList.toggle("dark:text-[#241B29]", active);
        
        filter.classList.toggle("bg-surface-container", !active);
        filter.classList.toggle("dark:bg-dark-elevated", !active);
        filter.classList.toggle("dark:text-dark-text-secondary", !active);
        filter.setAttribute("aria-pressed", String(active));
      });

      cards.forEach((card) => {
        const cardKey = card.getAttribute("data-category-key");
        const cardCategory = keyToCategory[cardKey];
        const show = targetCategory === "All" || cardCategory === targetCategory;
        card.classList.toggle("hidden", !show);
      });
    };

    filters.forEach((filter) => {
      filter.addEventListener("click", () => applyFilter(filter));
    });
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

  setupMobileNavigation();
  setupGallery();
  setupContactLinks();
  setupNavigationState();
  setupTheme();
  
  // Need to wait until i18n is available if it's loaded after main.js
  if (window.i18n) {
    setupLanguage();
  } else {
    window.addEventListener('load', setupLanguage);
  }
})();
