# Solaris — protótipo front-end

Protótipo de monitoramento de usinas fotovoltaicas feito com HTML, CSS e JavaScript puro.

## Abrir o projeto

Abra a pasta `frontend` no VS Code e execute `login.html` com o Live Server. Também é possível abrir cada arquivo HTML diretamente no navegador.

## Páginas

- `login.html`: acesso demonstrativo.
- `index.html`: visão geral com indicadores, mapa ilustrativo e usinas recentes.
- `usinas.html`: listagem, pesquisa por nome ou número de série e filtro por status.
- `detalhes.html`: painel, inversores e alarmes de uma usina.
- `cadastro.html`: cadastro e edição de usinas.
- `alarmes.html`, `relatorios.html` e `configuracoes.html`: telas auxiliares do protótipo.

Cada tela tem sua estrutura em um arquivo HTML próprio. `styles.css` reúne os estilos compartilhados. `app.js` cuida de interações e dados demonstrativos.

## Limites do protótipo

Os dados ficam no `localStorage` do navegador. O login aceita qualquer e-mail e senha preenchidos. Não há back-end, banco de dados, autenticação segura, recuperação real de senha ou integração com fabricantes. Indicadores de geração e mapa são apenas demonstrativos.

## Identidade visual

- Azul-marinho: `#10243A` — navegação.
- Verde solar: `#159447` — ações principais.
- Amarelo solar: `#F4B323` — destaques e atenção.
- Tipografia: DM Sans e Manrope.
