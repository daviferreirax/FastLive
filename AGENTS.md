# Instruções para agentes de IA

Leia este arquivo e, antes de qualquer alteração, leia também `AMBIENTES.md`, `docs/AI-WORKFLOW.md` e `docs/AI-HANDOFF.md`.

## Regras obrigatórias

- Converse com o usuário em português do Brasil, de forma clara e direta.
- Respeite o ambiente indicado pelo usuário. O ambiente de teste fica em `/home/ubuntu/fastlive-staging` na branch `staging`; produção fica em `/home/ubuntu/fastlive` na branch `production`.
- Se o usuário pedir uma alteração sem dizer o ambiente e o contexto não deixar isso claro, pergunte antes de editar ou implantar. Nunca promova para produção sem pedido explícito.
- Não altere o checkout de produção durante um trabalho de teste. Não altere o checkout de teste durante uma publicação, salvo se for necessário registrar a mesma documentação nos dois ambientes.
- Confira `git status` antes de editar. Preserve alterações não commitadas de qualquer pessoa; não use `reset --hard`, `clean`, descarte de alterações ou troca de branch para contornar conflitos.
- Faça commits locais claros para que outra IA possa continuar pelo Git. Não faça `git push` para o repositório `upstream` original. Só publique no remoto `origin` (`daviferreirax/FastLive`) se o usuário pedir explicitamente.
- Nunca leia, imprima, copie para o Git ou inclua em respostas valores de `.env`, `.env.staging`, tokens, senhas ou chaves. Esses arquivos são locais e ignorados pelo Git.
- Produção e teste compartilham o mesmo servidor LiveKit e os recursos da VPS. Antes de reiniciar o app de produção, confira se há sala ativa e avise se o reinício puder interromper alguém.
- Ao implantar, reconstrua somente o serviço `app` do ambiente autorizado. Não derrube nem recrie LiveKit, Caddy, DuckDNS ou outros serviços para uma alteração comum da aplicação.
- Relate o que mudou, em qual ambiente, o que foi verificado, o commit resultante e qualquer teste manual que ainda dependa do usuário.

## Estado funcional que deve ser preservado

- O link compartilhado é `/assistir/sala1`. A primeira pessoa recebe o papel de anfitrião; as seguintes entram como convidadas. Não há senha de transmissão.
- O checkbox de áudio começa desmarcado e a qualidade padrão é 1080p.
- Para áudio específico de aplicativo, o anfitrião precisa selecionar a janela do jogo e habilitar o áudio da janela no seletor do Chrome/Edge compatível. Compartilhar o monitor inteiro ainda pode capturar a mixagem do Windows, incluindo o Discord.
- Convidados podem compartilhar sua própria tela conforme o limite `MAX_SCREENS`; mantenha `/api/share` e `/api/unshare` usando o identificador interno real da sala.
- O áudio por janela injeta `windowAudio` temporariamente na chamada `getDisplayMedia`, pois o SDK LiveKit atualmente usado não repassa essa opção. Preserve a restauração da função original e teste em navegador real quando alterar essa lógica.
