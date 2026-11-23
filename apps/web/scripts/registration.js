/* Protótipo visual de cadastro: sem envio ou persistência de dados. */
(() => {
  const dialog = document.getElementById('registration-dialog');
  const form = document.getElementById('registration-form');
  const message = document.getElementById('registration-message');
  const title = document.getElementById('registration-title');
  const password = document.getElementById('registration-password');
  const toggle = document.getElementById('registration-toggle-password');

  function reset() {
    form.reset();
    form.hidden = false;
    title.hidden = false;
    dialog.setAttribute('aria-labelledby', 'registration-title');
    message.hidden = true;
    message.textContent = '';
    password.type = 'password';
    toggle.setAttribute('aria-label', 'Mostrar senha');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.querySelector('use').setAttribute('href', '#i-eye-off');
  }

  document.getElementById('open-registration').addEventListener('click', () => {
    reset();
    dialog.showModal();
  });
  document.getElementById('close-registration').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', reset);
  toggle.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.querySelector('use').setAttribute('href', visible ? '#i-eye' : '#i-eye-off');
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('registration-name');
    name.value = name.value.trim();
    if (name.value.length < 2) {
      name.setCustomValidity('Informe pelo menos dois caracteres para o nome.');
      name.reportValidity();
      name.setCustomValidity('');
      return;
    }
    if (!form.reportValidity()) return;
    form.reset();
    form.hidden = true;
    title.hidden = true;
    dialog.setAttribute('aria-labelledby', 'registration-message');
    message.textContent = 'Simulação concluída. Nenhuma conta foi criada e nenhum e-mail foi enviado.';
    message.hidden = false;
    message.focus();
  });
})();
