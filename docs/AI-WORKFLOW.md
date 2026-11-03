# Fluxo de trabalho para várias IAs

Este documento é a referência operacional compartilhada por Codex, Antigravity e outras ferramentas. O histórico de chats não é a fonte de verdade; use os arquivos e o Git.

## Começo de cada tarefa

1. Leia `AGENTS.md`, `AMBIENTES.md` e este arquivo. Leia também `docs/AI-HANDOFF.md` para saber o estado mais recente.
2. Confira a pasta atual, a branch e `git status --short --branch` nos checkouts envolvidos. O checkout de produção e o de teste são pastas diferentes; não troque as branches vinculadas a elas.
3. Confirme o ambiente pedido pelo usuário. Se estiver ambíguo, pergunte. Pesquisa e revisão sem alteração podem ser feitas sem implantar nada.
4. Não comece se houver alterações não commitadas de outra pessoa sem antes entendê-las. Não as descarte.

## Desenvolvimento e passagem entre IAs

- Alterações em desenvolvimento vão para o checkout de teste e a branch `staging`, a menos que o usuário determine claramente outro fluxo.
- Faça alterações pequenas, revise o diff, rode verificações adequadas e crie um commit local com mensagem descritiva.
- Atualize `docs/AI-HANDOFF.md` ao terminar: registre o que foi feito, branch/commit, testes, limitações e próximo passo. Não coloque segredos ou dados pessoais nesse arquivo.
- Antes de outra IA continuar, ela deve conferir o último commit e o estado da árvore. Se o mesmo checkout estiver sendo usado, não trabalhem nele ao mesmo tempo. Para trabalho paralelo, use branches e worktrees separados e integre os commits deliberadamente.
- Os checkouts locais estão vinculados ao mesmo repositório Git. O remoto `origin` aponta para o repositório privado do usuário (`git@github.com:daviferreirax/FastLive.git`), enquanto `upstream` aponta para `https://github.com/williampeixinho/PeekMe.git` (do criador original do projeto). Nunca envie alterações para `upstream`. Publique em `origin` quando o usuário pedir.

## Promoção para produção

1. Exija pedido explícito do usuário para promover/publicar.
2. Confirme que o commit de teste foi verificado pelo usuário e registre o commit/tag de origem.
3. Confira se há sala LiveKit ativa. Reiniciar o app pode desconectar clientes; programe a implantação sem transmissão ativa.
4. Integre apenas os commits aprovados à branch `production`, preserve sua configuração local e crie um tag de retorno antes de publicar.
5. Valide a configuração e reconstrua apenas o app de produção com o comando documentado em `AMBIENTES.md`.
6. Verifique `/healthz`, a página pública e o estado dos containers. Atualize `docs/AI-HANDOFF.md` com o resultado.

Não faça deploy de produção por inferência, por conveniência ou porque um teste passou. O usuário decide quando promover.

## Segredos e configuração local

- Nunca execute `cat .env`, `cat .env.staging`, `env`, `printenv` ou comandos que possam imprimir valores secretos.
- Para saber se uma variável existe, faça uma checagem que imprima apenas “configurada”/“ausente”. Não copie tokens de um ambiente para o outro.
- Não adicione `.env*`, tokens, chaves ou credenciais a commits, artefatos de teste ou mensagens.
- O ambiente de teste compartilha LiveKit com produção. Não teste mudanças em portas, chaves LiveKit, Caddy ou firewall como se o teste fosse isolado desses serviços.

## Deploys neste servidor

- Teste: em `/home/ubuntu/peekme-staging`, valide Compose e reconstrua só o serviço de teste:

  ```sh
  docker compose -p peekme-staging --env-file .env.staging -f docker-compose.staging.yml config -q
  sudo docker compose -p peekme-staging --env-file .env.staging -f docker-compose.staging.yml up -d --build
  ```

- Produção: somente após autorização explícita, em `/home/ubuntu/peekme`:

  ```sh
  docker compose --env-file .env config -q
  sudo docker compose --env-file .env up -d --build --no-deps app
  ```

Não execute `docker compose down` para publicar uma alteração comum. Não use o Compose de produção para reconstruir o teste nem o Compose de teste para reconstruir a produção.

## Reversão

- Tags existentes estão listadas em `AMBIENTES.md` e em `git tag --list`.
- Antes de reverter, confira a branch e o estado limpo. Identifique exatamente a tag aprovada e os arquivos de configuração envolvidos; uma tag Git não restaura arquivos `.env` nem a imagem Docker em execução.
- Reverter código em produção também exige pedido explícito do usuário e reconstrução do app. Nunca apague tags de retorno.
