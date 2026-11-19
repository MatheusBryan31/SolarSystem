/* Informações do usuário compartilhadas pelas telas internas. */
(() => {
  const open = document.getElementById('open-user-profile');
  if (!open) return;

  // HTML fixo do protótipo, sem interpolar dados pessoais ou externos.
  const template = document.createElement('template');
  template.innerHTML = `
    <dialog id="user-profile-dialog" class="user-profile-dialog" aria-labelledby="user-profile-title">
      <button
        id="close-user-profile"
        class="user-profile-close"
        type="button"
        aria-label="Fechar informações do usuário"
        autofocus
      >×</button>
      <h2 id="user-profile-title">Informações do usuário</h2>
      <dl class="user-profile-details">
        <div><dt>Usuário</dt><dd>Técnico</dd></div>
        <div><dt>E-mail</dt><dd>Não informado</dd></div>
        <div><dt>Sistema</dt><dd>SolarSystem</dd></div>
        <div><dt>Ambiente</dt><dd>Demonstração</dd></div>
      </dl>
    </dialog>
  `;
  document.body.append(template.content);
  const dialog = document.getElementById('user-profile-dialog');
  const close = document.getElementById('close-user-profile');

  open.addEventListener('click', () => dialog.showModal());
  close.addEventListener('click', () => dialog.close());
})();
