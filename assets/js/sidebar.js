const paginaAtual = location.pathname.split("/").pop() || "TelaPrincipal.html";

const itensMenu = [
    { nome: "Painel",    arquivo: "TelaPrincipal.html",       icone: "bi-house-door",
      paginas: ["TelaPrincipal.html"] },
    { nome: "Usinas",    arquivo: "TelaUsinasGeral.html",     icone: "bi-sun",
      paginas: ["TelaUsinasGeral.html", "TelaUsinaSelecionada.html"] },
    { nome: "Cadastrar", arquivo: "TelaCadastrarUsina.html",  icone: "bi-plus-lg",
      paginas: ["TelaCadastrarUsina.html"] }
];

const menu = document.getElementById("sidebar");

if (menu) {
    const links = itensMenu.map(item => {
        const ativo = item.paginas.includes(paginaAtual);
        return `
            <a href="${item.arquivo}" class="menu-item ${ativo ? "ativo" : ""}"
               ${ativo ? 'aria-current="page"' : ""}>
                <i class="bi ${item.icone}" aria-hidden="true"></i>
                <span>${item.nome}</span>
            </a>`;
    }).join("");

    menu.className = "menu-lateral";
    menu.innerHTML = `
        <a href="TelaPrincipal.html" class="menu-logo" aria-label="Ir para o painel principal">
            <img src="assets/img/logo.svg" alt="">
        </a>

        <nav class="menu-itens" aria-label="Menu principal">${links}</nav>

        <a href="login.html" class="menu-item">
            <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
            <span>Sair</span>
        </a>
    `;
}

const topo = document.getElementById("topo");

if (topo) {
    topo.className = "topo";
    topo.innerHTML = `
        <span class="topo-marca">Monitoramento Solar</span>
        <div class="topo-usuario">
            <span>Usuário</span>
            <span class="topo-avatar"><i class="bi bi-person-fill" aria-hidden="true"></i></span>
        </div>
    `;
}
