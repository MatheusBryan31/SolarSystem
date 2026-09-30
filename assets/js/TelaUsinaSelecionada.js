const producao = [
    ["05/09", "1,10 MWh", "70%"],
    ["06/09", "1,20 MWh", "85%"],
    ["07/09", "1,20 MWh", "85%"],
    ["08/09", "1,20 MWh", "85%"]
];

const grafico = document.getElementById("grafico");

producao.forEach(dia => {
    grafico.innerHTML += `
        <div class="barra">
            <div class="valor">${dia[1]}</div>
            <div class="barra-valor" style="height: ${dia[2]};"></div>
            <span>${dia[0]}</span>
        </div>
    `;
});