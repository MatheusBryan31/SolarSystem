
const usinas = [
    { nome: "Usina Solar 1", status: "Online", producao: 563, atualizacao: "08:30" },
    { nome: "Usina Solar 2", status: "Online", producao: 723, atualizacao: "08:25" },
    { nome: "Usina Solar 3", status: "Online", producao: 63, atualizacao: "08:20" },
    { nome: "Usina Solar 4", status: "Falha", producao: 0, atualizacao: "07:50" },
    { nome: "Usina Solar 5", status: "Online", producao: 463, atualizacao: "08:15" },
    { nome: "Usina Solar 6", status: "Falha", producao: 1.23, atualizacao: "07:45" }
];

const listaUsinas = document.getElementById("listaUsinas");
const buscaUsina = document.getElementById("buscaUsina");
const mensagemVazia = document.getElementById("mensagemVazia");

const formatarNumero = numero =>
    numero.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function atualizarIndicadores() {
    const online = usinas.filter(usina => usina.status === "Online").length;
    const falhas = usinas.filter(usina => usina.status === "Falha").length;
    const producao = usinas.reduce((total, usina) => total + usina.producao, 0);

    document.getElementById("totalUsinas").textContent = usinas.length;
    document.getElementById("usinasOnline").textContent = online;
    document.getElementById("usinasFalha").textContent = falhas;
    document.getElementById("producaoTotal").textContent =
        `${formatarNumero(producao)} kWh`;
}

function exibirUsinas(filtro = "") {
    const encontradas = usinas.filter(usina =>
        usina.nome.toLowerCase().includes(filtro.toLowerCase())
    );

    listaUsinas.replaceChildren();

    encontradas.forEach((usina, indice) => {
        const linha = document.createElement("tr");
        const classeStatus = usina.status === "Online" ? "online" : "falha";

        linha.innerHTML = `
            <td>${usina.nome}</td>
            <td><span class="status ${classeStatus}">${usina.status}</span></td>
            <td>${formatarNumero(usina.producao)} kWh</td>
            <td>${usina.atualizacao}</td>
            <td>
                <a class="botao-detalhes" href="TelaUsinaSelecionada.html">
                    <i class="bi bi-eye"></i> Ver detalhes
                </a>
            </td>
        `;

        listaUsinas.appendChild(linha);
    });

    mensagemVazia.hidden = encontradas.length > 0;
    document.getElementById("contadorUsinas").textContent =
        `${encontradas.length} de ${usinas.length} usinas`;
}

function exibirAlertas() {
    const listaAlertas = document.getElementById("listaAlertas");
    const comFalha = usinas.filter(usina => usina.status === "Falha");

    listaAlertas.replaceChildren();

    if (comFalha.length === 0) {
        listaAlertas.textContent = "Nenhuma falha registrada.";
        return;
    }

    comFalha.forEach(usina => {
        const alerta = document.createElement("div");
        alerta.className = "alerta";

        const icone = document.createElement("span");
        icone.className = "alerta-icone";
        icone.innerHTML = '<i class="bi bi-exclamation-triangle"></i>';

        const texto = document.createElement("div");
        const nome = document.createElement("strong");
        nome.textContent = usina.nome;

        const descricao = document.createElement("small");
        descricao.textContent = "Verifique o status desta usina.";

        texto.append(nome, document.createElement("br"), descricao);
        alerta.append(icone, texto);
        listaAlertas.appendChild(alerta);
    });
}

function criarGrafico() {
    const elemento = document.getElementById("graficoProducao");

    if (typeof Chart === "undefined" || !elemento) return;

    new Chart(elemento, {
        type: "line",
        data: {
            labels: ["20/10", "21/10", "22/10", "23/10", "24/10", "25/10", "26/10"],
            datasets: [{
                label: "Energia gerada (kWh)",
                data: [420, 560, 710, 540, 610, 680, 740],
                borderColor: "#1765c0",
                backgroundColor: "rgba(23, 101, 192, 0.10)",
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointBackgroundColor: "#1765c0"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true },
                x: { grid: { display: false } }
            }
        }
    });
}

buscaUsina.addEventListener("input", () => {
    exibirUsinas(buscaUsina.value);
});

atualizarIndicadores();
exibirUsinas();
exibirAlertas();
criarGrafico();
