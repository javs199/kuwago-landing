(() => {
  const data = window.KUWAGO_MARKETPLACE;
  const $ = id => document.getElementById(id);
  const cart = [];
  let activeCategory = 'all', activeService = null, editing = null;
  let language = document.documentElement.lang;
  const lang = () => language === 'es' ? 'es' : 'en';
  const t = key => window.i18n[lang()][`mp.${key}`];
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (label, action, className = 'mp-button mp-secondary') => {
    const node = el('button', label, className); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const reference = service => `${t('from')} $${service.priceReference} ${t(service.unit)} · ${service.durationMinutes} ${t('minutes')}`;
  function openOptions(service, index = null) {
    activeService = service; editing = index;
    $('mp-dialog-title').textContent = service[lang()].title;
    $('mp-dialog-desc').textContent = service[lang()].description;
    $('mp-dialog-meta').textContent = `${t('reference')}: ${reference(service)}`;
    $('mp-option-date').value = index === null ? $('mp-date').value : cart[index].date;
    $('mp-option-travelers').value = index === null ? $('mp-travelers').value : cart[index].travelers;
    $('mp-options').querySelector('[type="submit"]').textContent = t(index === null ? 'add' : 'save');
    $('mp-dialog').showModal();
  }
  function renderCards() {
    const query = $('mp-query').value.trim().toLocaleLowerCase(lang());
    const services = data.services.filter(service => (activeCategory === 'all' || service.category === activeCategory) && `${service[lang()].title} ${service[lang()].description}`.toLocaleLowerCase(lang()).includes(query));
    $('mp-cards').replaceChildren();
    services.forEach(service => {
      const card = el('article', '', 'mp-service mp-panel');
      const media = el('div', '', 'mp-service-media');
      const image = el('img'); image.src = service.image; image.alt = `${t('image')}: ${service[lang()].title}`; image.loading = 'lazy'; image.width = 640; image.height = 360;
      media.append(image, el('span', t(service.category), 'mp-badge'));
      const content = el('div', '', 'mp-service-content');
      content.append(el('h3', service[lang()].title), el('p', service[lang()].description), el('p', `${service.durationMinutes} ${t('minutes')} · ${t('private')}`, 'mp-meta'), el('small', t('reference'), 'mp-reference'), el('p', reference(service), 'mp-price'));
      const actions = el('div', '', 'mp-actions');
      actions.append(button(t('details'), () => openOptions(service)), button(t('options'), () => openOptions(service), 'mp-button'));
      content.append(actions); card.append(media, content); $('mp-cards').append(card);
    });
    $('mp-results').textContent = services.length ? `${services.length} ${t('results')}` : t('noResults');
    $('mp-filters').replaceChildren();
    ['all','wellness','dining','water','land','nature'].forEach(category => {
      const filter = button(t(category), () => {
        activeCategory = category; $('mp-category').value = category; renderCards();
        $('mp-filters').querySelector('[aria-pressed="true"]').focus();
      }, 'mp-chip');
      filter.setAttribute('aria-pressed', String(activeCategory === category));
      $('mp-filters').append(filter);
    });
  }
  function renderCart() {
    $('mp-count').textContent = String(cart.length);
    $('mp-cart-items').replaceChildren();
    if (!cart.length) $('mp-cart-items').append(el('p', t('empty')));
    cart.forEach((item,index) => {
      const service = data.services.find(service => service.id === item.id);
      const row = el('div', '', 'mp-cart-item');
      const image = el('img'); image.src = service.image; image.alt = ''; image.width = 64; image.height = 64;
      const content = el('div');
      content.append(el('h3', service[lang()].title), el('p', `${item.date ? new Intl.DateTimeFormat(lang(), { dateStyle: 'medium' }).format(new Date(`${item.date}T12:00:00`)) : t('noDate')} · ${item.travelers} ${t('travelers')}`));
      const actions = el('div', '', 'mp-actions');
      const edit = button(t('edit'), () => openOptions(service,index), 'mp-text-button');
      const remove = button(t('remove'), () => { cart.splice(index,1); renderCart(); $('mp-cart-title').focus(); }, 'mp-text-button');
      edit.setAttribute('aria-label', `${t('edit')}: ${service[lang()].title}`); remove.setAttribute('aria-label', `${t('remove')}: ${service[lang()].title}`);
      actions.append(edit,remove); content.append(actions); row.append(image,content); $('mp-cart-items').append(row);
    });
  }
  $('mp-cart-title').tabIndex = -1;
  // Category select includes only supplied services; empty design categories remain filterable.
  ['water','land','nature'].forEach(category => { const option = el('option', t(category)); option.value = category; option.dataset.i18n = `mp.${category}`; $('mp-category').append(option); });
  $('mp-search').addEventListener('submit', event => { event.preventDefault(); activeCategory = $('mp-category').value; renderCards(); location.hash = 'experiences'; });
  $('mp-close').addEventListener('click', () => $('mp-dialog').close());
  $('mp-options').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('mp-options').reportValidity()) return;
    const item = { id: activeService.id, date: $('mp-option-date').value, travelers: Number($('mp-option-travelers').value) };
    if (editing === null) cart.push(item); else cart[editing] = item;
    $('mp-dialog').close(); renderCart();
    if (editing !== null) $('mp-cart-title').focus();
  });
  document.addEventListener('kuwago:language', event => { language = event.detail.lang; renderCards(); renderCart(); });
  renderCards(); renderCart();
})();
