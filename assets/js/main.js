(() => {
  const header = document.querySelector("header");
  const modal = document.getElementById("lightbox-modal");
  const modalImage = document.getElementById("lightbox-img");
  const modalTitle = document.getElementById("lightbox-title");
  const modalBadge = document.getElementById("lightbox-badge");
  let previousFocus = null;

  function setupMobileNavigation() {
    if (!header) return;

    const personIcon = [...header.querySelectorAll(".material-symbols-outlined")]
      .find((icon) => icon.textContent.trim() === "person");

    if (!personIcon) return;

    const originalControl = personIcon.parentElement;
    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.id = "mobile-menu-button";
    menuButton.className = "md:hidden w-10 h-10 rounded-full bg-primary-container text-pure-white flex items-center justify-center";
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
      <a href="#home">Home</a>
      <a href="#about">About</a>
      <a href="#gallery">Gallery</a>
      <a href="#contact">Contact</a>
    `;
    header.appendChild(mobileMenu);

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
    const badge = card.querySelector("span");
    const textCandidates = [...card.querySelectorAll("p")];
    const title = textCandidates[0]?.textContent.trim() || "Gallery image";

    modalImage.src = image?.src || "";
    modalImage.alt = title;
    modalTitle.textContent = title;
    modalBadge.textContent = badge?.textContent.trim() || "Gallery";
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
    previousFocus?.focus();
  }

  function setupGallery() {
    const cards = [...document.querySelectorAll('#gallery [onclick^="openLightbox"]')];

    cards.forEach((card) => {
      card.removeAttribute("onclick");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", `Open ${card.querySelector("p")?.textContent.trim() || "gallery image"}`);
      card.addEventListener("click", () => openLightbox(card));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLightbox(card);
        }
      });
    });

    const closeButton = modal?.querySelector("button");
    closeButton?.removeAttribute("onclick");
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

    const filterWrap = [...document.querySelectorAll("#gallery div")]
      .find((element) => element.textContent.includes("All Glimpses") && element.children.length === 5);
    const filters = filterWrap ? [...filterWrap.children] : [];

    const applyFilter = (selectedFilter) => {
      const category = selectedFilter.textContent.trim();
      filters.forEach((filter) => {
        const active = filter === selectedFilter;
        filter.classList.toggle("bg-primary-container", active);
        filter.classList.toggle("text-pure-white", active);
        filter.classList.toggle("bg-surface-container", !active);
        filter.setAttribute("aria-pressed", String(active));
      });

      cards.forEach((card) => {
        const cardCategory = card.querySelector("span")?.textContent.trim();
        card.classList.toggle("hidden", category !== "All Glimpses" && cardCategory !== category);
      });
    };

    filters.forEach((filter) => {
      filter.setAttribute("role", "button");
      filter.setAttribute("tabindex", "0");
      filter.addEventListener("click", () => applyFilter(filter));
      filter.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          applyFilter(filter);
        }
      });
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
      link.setAttribute("title", `${label} will be added before publication`);
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
})();
