const usinas = [
    ["Usina Solar 1", "Online", "563 kWh"],
    ["Usina Solar 2", "Online", "723 kWh"],
    ["Usina Solar 3", "Online", "63 kWh"],
    ["Usina Solar 4", "Falha", "0 kWh"],
    ["Usina Solar 5", "Online", "463 kWh"],
    ["Usina Solar 6", "Falha", "1,23 kWh"]
];

const listaUsinas = document.getElementById("listaUsinas");

usinas.forEach(usina => {

    const classeStatus = usina[1] === "Online"
        ? "text-bg-success"
        : "text-bg-danger";

    listaUsinas.innerHTML += `
        <tr>
            <td>${usina[0]}</td>

            <td>
                <span class="badge ${classeStatus}">
                    ${usina[1]}
                </span>
            </td>

            <td>${usina[2]}</td>

            <td>
                <a href="TelaUsinaSelecionada.html" class="btn btn-sm btn-primary">
                    Ver detalhes
                </a>
            </td>
        </tr>
    `;
});