/* Estrutura de navegação compartilhada das páginas internas.
   HTML estático, sem interpolar dados externos ou de usuários. */
(() => {
  'use strict';
  const anchor = document.getElementById('internal-shell');
  if (!anchor) return;
  const template = document.createElement('template');
  template.innerHTML = `
    <header class="dash-topbar">
      <div class="dash-brand-group">
        <button class="dash-menu-button" id="dash-menu-button" type="button" aria-label="Abrir menu" aria-controls="sidebar-container" aria-expanded="false">☰</button>
        <a class="dash-brand" href="index.html" aria-label="SolarSystem, página inicial">Solar<span>System</span></a>
        <span class="dash-brand-separator" aria-hidden="true"></span>
        <span class="dash-brand-caption">Monitoramento de Usinas Solares</span>
      </div>
      <div class="dash-top-actions">
        <div class="dash-search-wrap">
          <label class="sr-only" for="dash-search">Buscar usinas</label>
          <svg viewBox="0 0 24 24" class="dash-search-icon" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16 16 5 5"></path></svg>
          <input id="dash-search" type="search" placeholder="Buscar usina..." autocomplete="off">
          <div id="dash-search-results" class="dash-search-results" hidden></div>
        </div>
        <a class="dash-top-icon" href="cadastro.html" aria-label="Cadastrar nova usina" title="Nova usina">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v8M8 12h8"></path></svg>
        </a>
        <a class="dash-top-icon dash-notification" href="alarmes.html" aria-label="Visualizar alarmes" title="Alarmes">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10M10 21h4"></path></svg>
          <span class="dash-notification-count" id="dash-notification-count" hidden>0</span>
        </a>
        <a class="dash-top-icon dash-settings-shortcut" href="configuracoes.html" aria-label="Configurações" title="Configurações">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 1.6-2.5 2-2.5 3.2M12 17.5h.01"></path></svg>
        </a>
        <button class="dash-user" id="open-user-profile" type="button" title="Informações do usuário" aria-label="Informações do usuário: Técnico" aria-haspopup="dialog" aria-controls="user-profile-dialog">
          <span class="dash-user-avatar" aria-hidden="true">T</span><span>Técnico</span>
        </button>
        <a class="dash-sign-out" href="login.html">Sair</a>
      </div>
    </header>
    <aside class="sidebar" id="sidebar-container" aria-label="Menu lateral"></aside>
    <button id="dash-menu-backdrop" class="dash-menu-backdrop" type="button" aria-label="Fechar menu" hidden></button>
  `;
  anchor.replaceWith(template.content);
})();
