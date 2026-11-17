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
    settings: 'configuracoes.html'
  };
  const items = [
    { label: 'Visão geral', href: 'index.html' },
    { label: 'Usinas', href: 'usinas.html' },
    { label: 'Alarmes', href: 'alarmes.html' },
    { label: 'Relatórios', href: 'relatorios.html' },
    { label: 'Configurações', href: 'configuracoes.html' }
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
  // Conserva o texto que já existia em cada página.
  profileCaption.textContent = ['details', 'reports'].includes(page) ? 'Solaris' : 'SolarSystem';
  profileInfo.append(profileCaption);
  profile.append(avatar, profileInfo);

  sidebar.replaceChildren(brand, nav, spacer, profile);
})();
