/* Função para fazer os olhos da senha interagirem */
document.addEventListener("DOMContentLoaded", function(){
    const botaoMostrarSenha = document.getElementById("mostrarSenha");
    const campoSenha = document.getElementById("senha");
    const iconeSenha = document.getElementById("iconeSenha");

    botaoMostrarSenha.addEventListener("click", function(){
        if(campoSenha.type == "password"){
            campoSenha.type = "text";
            iconeSenha.classList.remove("bi-eye");
            iconeSenha.classList.add("bi-eye-slash");
        }
        else{
            campoSenha.type = "password";
            iconeSenha.classList.remove("bi-eye-slash");
            iconeSenha.classList.add("bi-eye");
        }
    });
}); // Para garantir que o HTML exista antes do JS rodar.

/* Melhore este método, Bryan */
function entrar(){
    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    if(email == "@gmail.com" && senha === "12345"){
        window.location.href = "TelaPrincipal.html";
    }
    else{
        document.getElementById("erro").textContent = "E-mail ou senha incorretos.";
    }
}

/* Método para escolher idioma e servidor do dropdown == lista suspensa */
document.addEventListener('DOMContentLoaded', () => {
    
    // Seleção de Servidor
    const dropdownServidor = document.querySelectorAll('.topo-direito .dropdown')[0];
    if(dropdownServidor){
        const btnServidor = dropdownServidor.querySelector('.dropdown-toggle');
        const itemsServidor = dropdownServidor.querySelectorAll('.dropdown-item');

        itemsServidor.forEach(item => {
            item.addEventListener('click', (e) =>{
                e.preventDefault();
                const textoSelecionado = item.textContent.trim();

                btnServidor.innerHTML = `<i class="bi bi-hdd-rack"></i> ${textoSelecionado}`;
                localStorage.setItem('servidorSelecionado', textoSelecionado);
            });
        });

        const servidorSalvo = localStorage.getItem('servidorSelecionado');
        if(servidorSalvo){
            btnServidor.innerHTML = `<i class="bi bi-hdd-rack"></i> ${servidorSalvo}`;
        }
    }

    // Seleção do Idioma
    const dropdownIdioma = document.querySelectorAll('.topo-direito .dropdown')[1];
    if(dropdownIdioma){
        const btnIdioma = dropdownIdioma.querySelector('.dropdown-toggle');
        const itemsIdioma = dropdownIdioma.querySelectorAll('.dropdown-item');

        itemsIdioma.forEach(item =>{
            item.addEventListener('click', (e) =>{
                e.preventDefault();
                const textoSelecionado = item.textContent.trim();

                btnIdioma.innerHTML = `<i class="bi bi-globe"></i> ${textoSelecionado}`;
                localStorage.setItem('idiomaSelecionado', textoSelecionado);
            });
        });

        const idiomaSalvo = localStorage.getItem('idiomaSelecionado');
        if(idiomaSalvo){
            btnIdioma.innerHTML = `<i class="bi bi-globe"></i> ${idiomaSalvo}`;
        }
    } 
});

/* TRADUÇÃO DA PÁGINA */
const traducoes = {
    'Português': {
        boasVindas: 'Bem vindo a SolarSystem',
        acesseConta: 'Acesse sua conta para continuar',
        placeholderEmail: 'Digite o seu e-mail',
        placeholderSenha: 'Digite a sua senha',
        lembrarSenha: 'Lembrar Senha',
        esqueciSenha: 'Esqueci minha senha',
        entrar: 'Entrar',
        registrar: 'Registrar',
        termos: 'Termos de Serviço',
        politicas: 'Politicas de Privacidade',
        direitos: '\u00A9 SS 2026 todos os direitos reservados.'
    }
}