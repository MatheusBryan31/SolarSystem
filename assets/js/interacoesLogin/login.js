/* Função para fazer os olhos da senha interagirem */
document.addEventListener("DOMContentLoaded", function(){
    const botaoMostrarSenha = document.getElementById("mostrarSenha");
    const campoSenha = document.getElementById("senha");
    const iconeSenha = document.getElementById("iconeSenha");

    document.addEventListener("click", function(){
        console.log("Clicou no botão!");
    });
}); // Para garantir que o HTML exista antes do JS rodar.