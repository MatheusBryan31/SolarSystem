# SolarSystem
    DESCRIÇÃO:
    Software de gestão de monitoramento de usinas fotovoltaicas desenvolvido pelos programadores Atos Marques, Eduardo Jardim e Matheus Bryan.


    OBJETIVO:
    Empresas de energia solar, além do serviço de instalação, oferecem o serviço de monitoramento das usinas de seus clientes. Nesse ínterim, no mercado, existem inúmeras fabricantes de inversores, isso faz com que exista várias plataformas de monitoramento.
    Dito isso, a empresa perde o controle centralizado, necessita de computadores com processamento mais robusto, uma adiministração de usuários e senhas complexa e perda de eficiência do funcionário.
    Demonstrado o contexto, o sistema supre todas essas necessidades, pois unifica as plataformas. Unificando esses softwares de monitoramento, a empresa ganha com o aumento de proatividade do funcionário, o computador demanda menos processamento, a administração de usina é mais organizada, e planejada, e o controle de acesso é metodizado, porque o login (usuário e senha) é um só.

    01/10/2026
    Durante a elaboração do Layout da tela de login, tivemos dificuldade com a imagem que estava ocupando toda a tela, o que pode deixar o site pesado com um grande volume de acessos. Com isso, encontramos uma solução: Em vez de carregar a imagem pelo arquivo HTML, deixamos o CSS encarregada de exibir a imagem, pelo CSS, no bloco 
    .area-apresentacao{} foi possível manipular a imagem utilizando as propriedades do background:
        background-image: url(); == Carrega a imagem.
        background-size: cover; == Preenche todo o espaço designado pela seção/section.
        background-position: center; == Centraliza a foto no espaço disponível.
    
    Depois, escolhemos arredondar a nossa .area-login, mas, mesmo usando as propriedades cerdas, percebemos que não havíam mudanças. Pesquisamos e descobrimos que estava sim arredondando, porém devido o fundo ser branco ocorria que não ficava explícito. Dito isso, pegamos a margem da área de login para a esquerda e negativamos para que encobrisse um pouco a imagem autoral - assim fica exposto o detalhe arredondado da .area-login. Também, aumentamos a largura da .area-apresentacao para que a imagem com folga ocupe a parte de trás da .area-login.
    
    O .formulário-login foi levemente direcionado para o lado superior direito.