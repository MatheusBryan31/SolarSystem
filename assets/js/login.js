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
    },
    'Espanhol': {
        boasVindas: 'Bienvenido a SolarSystem',
        acesseConta: 'Accede a tu cuenta para continuar',
        placeholderEmail: 'Ingresa tu correo electrónico',
        placeholderSenha: 'Ingresa tu contraseña',
        lembrarSenha: 'Recordar contraseña',
        esqueciSenha: 'Olvidé mi contraseña',
        entrar: 'Iniciar sesión',
        registrar: 'Registrarse',
        termos: 'Términos de servicio',
        politicas: 'Políticas de privacidad',
        direitos: '\u00A9 SS 2026 todos los derechos reservados.'
    },
    'Inglês': {
        boasVindas: 'Welcome to SolarSystem',
        acesseConta: 'Sign in to your account to continue',
        placeholderEmail: 'Enter your email',
        placeholderSenha: 'Enter your password',
        lembrarSenha: 'Remember me',
        esqueciSenha: 'Forgot password?',
        entrar: 'Sign in',
        registrar: 'Register',
        termos: 'Terms of Service',
        politicas: 'Privacy Policy',
        direitos: '© SS 2026 all rights reserved.'
    }
};
// Função que realmente muda os textos da tela
function aplicarTraducoes(idioma){
    const lang = traducoes[idioma] ? idioma : 'Português';
    const t = traducoes[lang];

    // Atualiza os elementos com o atributo data-i18n
    document.querySelectorAll('[data-i18n]').forEach(elemento =>{
        const chave = elemento.getAttribute('data-i18n');
        if(t[chave]){
            elemento.textContent = t[chave];
        }
    });

    // Atualiza os placeholders dos inputs de e-mail e senha
    const inputEmail = document.getElementById('email');
    const inputSenha = document.getElementById('senha');

    if(inputEmail) inputEmail.placeholder = t.placeholderEmail;
    if(inputSenha) inputSenha.placeholder = t.placeholderSenha;
}