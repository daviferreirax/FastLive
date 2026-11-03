# Estado para passagem entre IAs

Última atualização: 2026-11-03.

## Estado atual

- Produção: `/home/ubuntu/fastlive`, branch `production`. Containers migrados para `fastlive-app-1`, `fastlive-livekit-1`, `fastlive-caddy-1` e `fastlive-duckdns-1` (com volumes HTTPS `fastlive_caddy_data` e `fastlive_caddy_config` preservados).
- Teste: `/home/ubuntu/fastlive-staging`, branch `staging`. Container migrado para `fastlive-app-staging` (projeto `fastlive-staging`).
- Produção é acessada em `https://exemplo.duckdns.org`; teste em `https://teste.exemplo.duckdns.org` (raiz do domínio, sala única).
- Toda a identidade do projeto e da infraestrutura da VPS foi migrada para **FastLive**.

## Comportamento implementado

- Identidade visual e operacional **FastLive** nos ambientes de teste e produção (ícone SVG vetorial, cabeçalho estilizado, pastas `/home/ubuntu/fastlive` e `/home/ubuntu/fastlive-staging` e containers `fastlive-*`).
- Primeiro visitante é anfitrião; próximos são convidados pelo mesmo endereço. A senha de transmissão foi removida.
- Áudio desmarcado inicialmente; 1080p selecionado por padrão.
- A captura solicita `windowAudio: 'window'` temporariamente quando se cria a captura de tela. Com navegador compatível, escolher uma janela permite ao navegador oferecer áudio do aplicativo. Compartilhar o monitor inteiro ainda pode incluir todo o áudio do Windows.

## Tags de retorno existentes

- `production-stable-2026-10-30`: snapshot inicial da produção antes da separação dos ambientes.
- `production-before-unified-entry-2026-10-30`: produção antes do link único e remoção da senha.
- `production-before-window-audio-2026-11-02`: produção antes da alteração de captura de áudio por janela.
- `production-before-fastlive-rebrand-2026-11-03`: produção antes do rebrand visual para FastLive.
- `production-before-vps-rename-2026-11-03`: produção antes da migração das pastas e containers da VPS para `fastlive`.
- `production-before-root-link-2026-11-03`: produção antes de o link compartilhado passar a ser a raiz do domínio.
- `v1.0.0` e `v1.1.0`: tags do projeto upstream.

## Última promoção

- O "Link para assistir" copiado pelo anfitrião passou a ser a raiz do domínio (`location.origin`) em vez de `/assistir/<apelido>`. Validado pelo usuário no teste e promovido para produção em 2026-11-03 (commit `2260602` em `staging`, `5d0aeb9` em `production`). Links antigos `/assistir/...` continuam abrindo o app. Não havia salas ativas no momento do deploy.

## Próximo passo

Repositório privado `git@github.com:daviferreirax/FastLive.git` configurado como `origin`, com as branches `production`, `staging` e todas as tags publicadas. Aguardar o próximo pedido do usuário. Confirmar o ambiente antes de editar se o usuário não o especificar. Não publicar alterações na produção sem pedido explícito.
