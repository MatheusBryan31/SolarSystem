(() => {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const rememberCheckbox = document.getElementById('remember-email');
  const passwordButton = document.getElementById('toggle-password');
  const eyeIcon = document.getElementById('toggle-password-icon');
  const year = document.getElementById('copyright-year');
  const STORAGE_KEY = 'solarsystem.rememberedEmail';

  if (!form || !emailInput || !passwordInput || !rememberCheckbox || !passwordButton) return;
  if (year) year.textContent = String(new Date().getFullYear());

  passwordButton.addEventListener('click', () => {
    const visible = passwordInput.type === 'password';
    passwordInput.type = visible ? 'text' : 'password';
    passwordButton.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
    passwordButton.setAttribute('title', visible ? 'Ocultar senha' : 'Mostrar senha');
    passwordButton.setAttribute('aria-pressed', String(visible));
    if (eyeIcon) eyeIcon.setAttribute('href', visible ? '#i-eye' : '#i-eye-off');
  });

  try {
    const savedEmail = localStorage.getItem(STORAGE_KEY);
    if (savedEmail) {
      emailInput.value = savedEmail;
      rememberCheckbox.checked = true;
    }
  } catch {
    // Sem acesso ao armazenamento, a página continua utilizável.
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    try {
      if (rememberCheckbox.checked) localStorage.setItem(STORAGE_KEY, emailInput.value.trim());
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // A preferência de e-mail é opcional.
    }
    passwordInput.value = '';
    window.location.assign('index.html');
  });

  let recoveryTimer;
  const recovery = document.querySelector('[data-demo-message]');
  recovery.addEventListener('click', () => {
    const toast = document.getElementById('toast');
    toast.textContent = recovery.dataset.demoMessage;
    toast.classList.add('show');
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => toast.classList.remove('show'), 5000);
  });
})();
