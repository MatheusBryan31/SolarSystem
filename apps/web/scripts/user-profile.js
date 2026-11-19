/* Informações disponíveis no protótipo da Visão geral. */
(() => {
  const dialog = document.getElementById('user-profile-dialog');
  const open = document.getElementById('open-user-profile');
  const close = document.getElementById('close-user-profile');
  if (!dialog || !open || !close) return;

  open.addEventListener('click', () => dialog.showModal());
  close.addEventListener('click', () => dialog.close());
})();
