# Sistema interno Helix Dynamics (Centro Alvorada)

Sem dependências: só precisa do Node 18 ou mais novo.

    node server.js          # abre em http://localhost:3000 (PORT=8080 node server.js para outra porta)
    node test.js            # testes automáticos (usam uma cópia dos dados)

Os 6 agentes entram **só pelo Discord** (botão "Entrar com Discord"), cada um com o ID já cadastrado. Quem não estiver cadastrado é recusado.
O mestre entra pelo link "Acesso do mestre" na tela de login; a senha está em `data/CREDENCIAIS.txt` (ou defina ADMIN_PASSWORD antes da primeira execução).

## Ligar o login do Discord (uma vez)
1. Em https://discord.com/developers/applications crie uma aplicação (Nova aplicação).
2. Em OAuth2, copie o **Client ID** e o **Client Secret**.
3. Em OAuth2 > Redirects, adicione exatamente `ENDEREÇO_DO_SITE/auth/discord/callback` (ex.: `https://helix.seusite.com/auth/discord/callback`; para testar local: `http://localhost:3000/auth/discord/callback`).
4. Rode o servidor com as variáveis:

       DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... PUBLIC_URL=https://helix.seusite.com node server.js

   Em hospedagens, são as mesmas três variáveis de ambiente. Não use barra no fim do PUBLIC_URL.
Os 30 arquivos do seu ZIP já estão importados. Tudo começa **oculto**: entre como `mestre`, vá em Documentos e libere
(Todos os agentes, ou só agentes selecionados). Em "Agentes e acessos" você troca senha, nível e crachá de cada um.

Importante
- Para colocar online, use uma hospedagem que rode Node e guarde a pasta `data/` (Render, Railway, Fly, VPS). Em hospedagem sem disco persistente, o que você mudar se perde ao reiniciar.
- Use HTTPS (as hospedagens acima já dão).
- Os arquivos só saem do servidor para quem está liberado. Os 3 arquivos da A.E.G.I.S. e o bilhete estão como "Mestre" e nunca são entregues a jogadores.
- Faça backup da pasta `data/`.
