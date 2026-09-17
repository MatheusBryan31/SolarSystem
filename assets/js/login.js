/* Função para fazer os olhos da senha interagirem */
document.addEventListener("DOMContentLoaded", function(){
    const botaoMostrarSenha = document.getElementById("mostrarSenha");
    const campoSenha = document.getElementById("senha");
    const iconeSenha = document.getElementById("iconeSenha");

    botaoMostrarSenha.addEventListener("click", function(){
        if(campoSenha.type == "password"){
            campoSenha.type = "text";
            iconeSenha.classList.remove("bi-eye");
            iconeSenha.classList.add("bi")
        }
    });
}); // Para garantir que o HTML exista antes do JS rodar.