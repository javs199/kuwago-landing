import { createApiCatalogAdapter, createStaticCatalogAdapter, loadCatalog, toMarketplaceCard, cartAvailability } from './catalog-adapter.js';

(() => {
  // With a configured public API the page shows only published services (or an error/empty state), never Stitch examples.
  const apiBase = (window.KUWAGO_CATALOG_API?.baseUrl || '').replace(/\/+$/,'');
  const adapter = apiBase ? createApiCatalogAdapter(apiBase) : createStaticCatalogAdapter();
  const expectedSource = apiBase ? 'api' : 'static_reference';
  const $ = id => document.getElementById(id);
  const cart = [];
  let data = { services: [], categories: [] }, catalog = null, loadState = 'loading';
  let activeCategory = 'all', activeService = null, editing = null;
  let language = document.documentElement.lang;
  const lang = () => language === 'es' ? 'es' : 'en';
  const t = key => window.i18n[lang()][`mp.${key}`];
  const categoryName = id => data.categories.find(row => row.id === id)?.translations[lang()].name || t(id) || id;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (label, action, className = 'mp-button mp-secondary') => {
    const node = el('button', label, className); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const reference = (item, parent = null) => {
    const price = item?.referencePrice || parent?.referencePrice;
    let label = t('quote');
    if (price) label = `${t('from')} ${price.symbol}${price.amount} ${t(price.unit)}`;
    else if (item?.price && item.price.kind !== 'quote') {
      label = `${item.price.kind === 'from' ? t('from') + ' ' : ''}${new Intl.NumberFormat(lang(), { style:'currency', currency:item.price.currency, currencyDisplay:'code' }).format(item.price.amountMinor / 100)} ${t(item.price.unit)}`;
    }
    const duration = item?.durationMinutes ?? parent?.durationMinutes ?? '—';
    return `${label} · ${duration} ${t('minutes')}`;
  };
  const cardPrice = service => {
    if (!service.options || service.options.length <= 1) return reference(service);
    const priced = service.options.filter(o => o.price && (o.price.kind === 'fixed' || o.price.kind === 'from'));
    if (!priced.length) return reference(service);
    const lowest = priced.reduce((min, curr) => curr.price.amountMinor < min.price.amountMinor ? curr : min, priced[0]);
    const formatted = new Intl.NumberFormat(lang(), { style:'currency', currency:lowest.price.currency, currencyDisplay:'code' }).format(lowest.price.amountMinor / 100);
    const label = `${t('from')} ${formatted} ${t(lowest.price.unit)}`;
    const duration = lowest.durationMinutes ?? service.durationMinutes ?? '—';
    return `${label} · ${duration} ${t('minutes')}`;
  };
  const updateDialogMeta = opt => {
    $('mp-dialog-meta').textContent = `${t(activeService.source === 'stitch_reference' ? 'reference' : 'details')}: ${reference(opt, activeService)}`;
  };
  function renderOptionChoices(service, selectedId) {
    const fieldset = $('mp-option-choices');
    if (!fieldset) return;
    fieldset.replaceChildren();
    const legend = el('legend', t('chooseOption'));
    legend.setAttribute('data-i18n', 'mp.chooseOption');
    fieldset.append(legend);
    const options = service.options || [];
    for (const opt of options) {
      const label = el('label', '', 'mp-option-choice');
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'mp-selected-option'; radio.value = opt.id;
      radio.checked = opt.id === selectedId; radio.required = true;
      radio.addEventListener('change', () => {
        if (radio.checked) updateDialogMeta(opt);
      });
      const info = el('div', '', 'mp-option-info');
      const name = el('span', opt[lang()]?.name || opt.translations?.[lang()]?.name || opt.id, 'mp-option-name');
      const meta = el('span', reference(opt, service), 'mp-option-meta');
      info.append(name, meta);
      label.append(radio, info);
      fieldset.append(label);
    }
  }
  function openOptions(service, index = null) {
    if (loadState !== 'ready' || !data.services.some(row => row.id === service.id && row.revisionId === service.revisionId)) return;
    activeService = service; editing = index;
    $('mp-dialog-title').textContent = service[lang()].title;
    $('mp-dialog-desc').textContent = service[lang()].description;
    const selectedOptionId = index !== null ? cart[index].optionId : service.options[0]?.id;
    renderOptionChoices(service, selectedOptionId);
    const chosenOption = service.options?.find(o => o.id === selectedOptionId) || service.options?.[0] || service;
    updateDialogMeta(chosenOption);
    $('mp-option-date').value = index === null ? $('mp-date').value : cart[index].date;
    $('mp-option-travelers').value = index === null ? $('mp-travelers').value : cart[index].travelers;
    $('mp-options').querySelector('[type="submit"]').textContent = t(index === null ? 'add' : 'save');
    $('mp-dialog').showModal();
  }
  function renderCategories() {
    $('mp-category').replaceChildren();
    $('mp-filters').replaceChildren();
    for (const id of ['all', ...data.categories.map(row => row.id)]) {
      const label = id === 'all' ? t('all') : categoryName(id);
      const option = el('option',label); option.value = id; $('mp-category').append(option);
      const filter = button(label, () => {
        activeCategory = id; $('mp-category').value = id; renderCards();
        $('mp-filters').querySelector('[aria-pressed="true"]')?.focus();
      }, 'mp-chip');
      filter.setAttribute('aria-pressed',String(activeCategory === id)); $('mp-filters').append(filter);
    }
    $('mp-category').value = activeCategory;
  }
  function renderCards() {
    $('mp-cards').replaceChildren(); renderCategories();
    $('mp-cards').setAttribute('aria-busy',String(loadState === 'loading'));
    if (loadState === 'loading') { $('mp-results').textContent = t('loading'); return; }
    if (loadState === 'error') {
      $('mp-results').textContent = t('loadError');
      $('mp-cards').append(button(t('retry'),refreshCatalog)); return;
    }
    const query = $('mp-query').value.trim().toLocaleLowerCase(lang());
    const services = data.services.filter(service => (activeCategory === 'all' || service.category === activeCategory) && `${service[lang()].title} ${service[lang()].description}`.toLocaleLowerCase(lang()).includes(query));
    for (const service of services) {
      const card = el('article','','mp-service mp-panel'), media = el('div','','mp-service-media');
      const image = el('img'); image.src = service.image; image.alt = service.alt[lang()]; image.loading = 'lazy'; image.width = 640; image.height = 360;
      media.append(image,el('span',categoryName(service.category),'mp-badge'));
      const content = el('div','','mp-service-content');
      const modality = `${t(service.experienceType === 'private' ? 'privateType' : service.experienceType || 'unspecified')} · ${t(service.venue || 'unspecified')}`;
      content.append(el('h3',service[lang()].title),el('p',service[lang()].description),el('p',`${service.durationMinutes ?? '—'} ${t('minutes')} · ${modality}`,'mp-meta'));
      if (service.source === 'stitch_reference') content.append(el('small',t('reference'),'mp-reference'));
      content.append(el('p',cardPrice(service),'mp-price'));
      const actions = el('div','','mp-actions');
      actions.append(button(t('details'),() => openOptions(service)),button(t('options'),() => openOptions(service),'mp-button'));
      content.append(actions); card.append(media,content); $('mp-cards').append(card);
    }
    $('mp-results').textContent = services.length ? `${services.length} ${t('results')}` : t(data.services.length ? 'noResults' : 'emptyCatalog');
  }
  function renderCart() {
    $('mp-count').textContent = String(cart.length); $('mp-cart-items').replaceChildren();
    if (!cart.length) $('mp-cart-items').append(el('p',t('empty')));
    cart.forEach((item,index) => {
      const availability = cartAvailability(item,catalog);
      const service = data.services.find(row => row.id === item.id);
      const row = el('div','','mp-cart-item'), content = el('div');
      if (service) { const image = el('img'); image.src = service.image; image.alt = ''; image.width = 64; image.height = 64; row.append(image); }
      const title = service?.[lang()].title || item.id;
      content.append(el('h3',title));
      const option = service?.options?.find(row => row.id === item.optionId);
      const optionName = option ? (option[lang()]?.name || option.translations?.[lang()]?.name || '') : '';
      if (optionName) content.append(el('p', optionName, 'mp-cart-option'));
      if (availability === 'available') content.append(el('p',`${item.date ? new Intl.DateTimeFormat(lang(),{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${item.date}T12:00:00Z`)) : t('noDate')} · ${item.travelers} ${t('travelers')}`));
      else content.append(el('p',t(availability),'mp-reference'));
      const actions = el('div','','mp-actions');
      if (service && ['available','changed'].includes(availability)) {
        const edit = button(t('edit'),() => openOptions(service,index),'mp-text-button');
        edit.setAttribute('aria-label',`${t('edit')}: ${title}`); actions.append(edit);
      }
      const remove = button(t('remove'),() => { cart.splice(index,1); renderCart(); $('mp-cart-title').focus(); },'mp-text-button');
      remove.setAttribute('aria-label',`${t('remove')}: ${title}`); actions.append(remove);
      content.append(actions); row.append(content); $('mp-cart-items').append(row);
    });
  }
  async function refreshCatalog() {
    loadState = 'loading'; catalog = null; data = {services:[],categories:[]}; renderCards(); renderCart();
    const result = await loadCatalog(adapter,expectedSource);
    loadState = result.status; catalog = result.catalog;
    data = catalog ? {categories:catalog.categories,services:catalog.services.map(service => toMarketplaceCard(service,apiBase))} : {services:[],categories:[]};
    if (!data.categories.some(row => row.id === activeCategory)) activeCategory = 'all';
    renderCards(); renderCart();
  }
  $('mp-cart-title').tabIndex = -1;
  $('mp-search').addEventListener('submit',event => { event.preventDefault(); activeCategory = $('mp-category').value; renderCards(); location.hash = 'experiences'; });
  $('mp-close').addEventListener('click',() => $('mp-dialog').close());
  $('mp-options').addEventListener('submit',event => {
    event.preventDefault();
    if (!activeService || !$('mp-options').reportValidity()) return;
    const selectedRadio = $('mp-option-choices')?.querySelector('input[name="mp-selected-option"]:checked');
    const optionId = selectedRadio ? selectedRadio.value : activeService.options[0]?.id;
    const item = {id:activeService.id,revisionId:activeService.revisionId,optionId,date:$('mp-option-date').value,travelers:Number($('mp-option-travelers').value)};
    if (cartAvailability(item,catalog) !== 'available') { $('mp-dialog').close(); $('mp-results').textContent = t('changed'); return; }
    if (editing === null) cart.push(item); else cart[editing] = item;
    $('mp-dialog').close(); renderCart(); if (editing !== null) $('mp-cart-title').focus();
  });
  document.addEventListener('kuwago:language',event => {
    language = event.detail.lang; renderCards(); renderCart();
    if ($('mp-dialog').open && activeService) {
      $('mp-dialog-title').textContent = activeService[lang()].title;
      $('mp-dialog-desc').textContent = activeService[lang()].description;
      const selectedRadio = $('mp-option-choices')?.querySelector('input[name="mp-selected-option"]:checked');
      const selectedId = selectedRadio ? selectedRadio.value : activeService.options[0]?.id;
      renderOptionChoices(activeService, selectedId);
      const chosenOption = activeService.options?.find(o => o.id === selectedId) || activeService.options?.[0] || activeService;
      updateDialogMeta(chosenOption);
      $('mp-options').querySelector('[type="submit"]').textContent = t(editing === null ? 'add' : 'save');
    }
  });
  void refreshCatalog();
})();
