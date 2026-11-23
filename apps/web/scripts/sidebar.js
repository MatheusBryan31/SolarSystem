/* Menu lateral compartilhado pelas páginas internas do SolarSystem. */
(() => {
  const sidebar = document.getElementById('sidebar-container');
  if (!sidebar) return;

  const page = document.body.dataset.page;
  const activePages = {
    overview: 'index.html',
    plants: 'usinas.html',
    form: 'usinas.html',
    details: 'usinas.html',
    alarms: 'alarmes.html',
    reports: 'relatorios.html',
    settings: 'configuracoes.html',
  };
  const items = [
    { label: 'Visão geral', href: 'index.html' },
    { label: 'Usinas', href: 'usinas.html' },
    { label: 'Alarmes', href: 'alarmes.html' },
    { label: 'Relatórios', href: 'relatorios.html' },
    { label: 'Configurações', href: 'configuracoes.html' },
  ];

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = 'index.html';
  const brandName = document.createElement('span');
  brandName.className = 'brand-name';
  brandName.textContent = 'SolarSystem';
  brand.append(brandName); // Sem o solzinho ao lado do nome.

  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Menu principal');
  for (const item of items) {
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    if (activePages[page] === item.href) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    nav.append(link);
  }

  const spacer = document.createElement('div');
  spacer.className = 'sidebar-spacer';
  const profile = document.createElement('div');
  profile.className = 'profile';
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = 'T';
  const profileInfo = document.createElement('div');
  profileInfo.append(document.createTextNode('Técnico'));
  const profileCaption = document.createElement('small');
  profileCaption.textContent = 'SolarSystem';
  profileInfo.append(profileCaption);
  profile.append(avatar, profileInfo);

  sidebar.replaceChildren(brand, nav, spacer, profile);
  const icons = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V7l7-4v18M10 12l5-4v13M15 11l6-3v13M2 21h20M6 10h1M6 14h1M6 18h1"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3.5 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.5 3.5a1.7 1.7 0 0 0-3 0ZM12 9v5M12 17h.01"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V12h4v8M10 20V4h4v16M16 20v-9h4v9M2 20h20"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 14 5l3-.5.7 3 3 1.5-1 3 1 3-3 1.5-.7 3-3-.5-2 2-2-2-3 .5-.7-3-3-1.5 1-3-1-3 3-1.5.7-3 3 .5z"/><circle cx="12" cy="12" r="3"/></svg>',
  ];
  document.querySelectorAll('#sidebar-container .nav a').forEach((link, index) => {
    if (!icons[index]) return;
    const icon = make('span', undefined, 'dash-side-icon');
    icon.innerHTML = icons[index]; // Somente SVGs literais e controlados pelo aplicativo.
    link.prepend(icon);
  });

  const openAlarms = plants.flatMap((p) => (p.alarms || []).filter((a) => a.status === 'Aberto'));
  const notification = byId('dash-notification-count');
  if (notification) {
    notification.hidden = openAlarms.length === 0;
    notification.textContent = openAlarms.length > 99 ? '99+' : String(openAlarms.length);
  }

  const menuButton = byId('dash-menu-button');
  const backdrop = byId('dash-menu-backdrop');
  if (menuButton && backdrop) {
    const mobile = matchMedia('(max-width: 800px)');
    const setMenu = (open) => {
      const restoreFocus = sidebar.contains(document.activeElement) || document.activeElement === backdrop;
      sidebar.inert = mobile.matches && !open;
      document.querySelector('main').inert = open;
      document.body.classList.toggle('menu-open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      backdrop.hidden = !open;
      if (open) sidebar.querySelector('.nav a.active')?.focus();
      else if (restoreFocus && mobile.matches) menuButton.focus();
    };
    setMenu(false);
    mobile.addEventListener('change', () => setMenu(false));
    menuButton.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    backdrop.addEventListener('click', () => setMenu(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !backdrop.hidden) setMenu(false);
    });
    document
      .querySelectorAll('#sidebar-container .nav a')
      .forEach((link) => link.addEventListener('click', () => setMenu(false)));
  }

  const headerSearch = byId('dash-search');
  const headerResults = byId('dash-search-results');
  if (headerSearch && headerResults) {
    headerSearch.addEventListener('input', () => {
      const term = headerSearch.value.trim().toLocaleLowerCase('pt-BR');
      headerResults.replaceChildren();
      headerResults.hidden = !term;
      if (!term) return;
      const matches = plants
        .filter((plant) => {
          const fields = [plant.name, plant.city, plant.state, ...plant.inverters.map((item) => item.serial)];
          return fields.join(' ').toLocaleLowerCase('pt-BR').includes(term);
        })
        .slice(0, 7);
      if (!matches.length) headerResults.append(make('p', 'Nenhuma usina encontrada.', 'dash-search-empty'));
      matches.forEach((plant) => {
        const link = make('a', plant.name);
        link.href = `detalhes.html?id=${encodeURIComponent(plant.id)}`;
        link.append(make('small', `${plant.city}/${plant.state} · ${statusOf(plant)}`));
        headerResults.append(link);
      });
    });
    headerSearch.addEventListener('focus', () => {
      if (headerSearch.value.trim()) headerResults.hidden = false;
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.dash-search-wrap')) headerResults.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !headerResults.hidden) {
        headerSearch.focus();
        headerResults.hidden = true;
      }
    });
  }
})();
