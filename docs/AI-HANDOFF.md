# Estado para passagem entre IAs

Última atualização: 2026-11-03.

## Estado atual

- Produção: `/home/ubuntu/peekme`, branch `production`, commits `f71bc44` (`Rebrand application to FastLive with custom vector logo`) e `685070d` (`Add daviferreirax copyright to LICENSE`). O app foi reconstruído sem salas ativas e `/healthz` respondeu com sucesso.
- Teste: `/home/ubuntu/peekme-staging`, branch `staging`, commits `bb6d07d` (`Rebrand application to FastLive with custom vector logo`) e `131a822` (`Add daviferreirax copyright to LICENSE`).
- Produção mantém o link `https://exemplo.duckdns.org/assistir/sala1`; teste usa `https://teste.exemplo.duckdns.org/assistir/sala1`.
- O rebrand para **FastLive** foi promovido para produção a pedido do usuário. O teste e a produção continuam em containers separados, mas compartilham LiveKit, Caddy e recursos da VPS.

## Comportamento implementado

- Identidade visual **FastLive** nos ambientes de teste e produção (ícone SVG vetorial e cabeçalho estilizado).
- Primeiro visitante é anfitrião; próximos são convidados pelo mesmo endereço. A senha de transmissão foi removida.
- Áudio desmarcado inicialmente; 1080p selecionado por padrão.
- A captura solicita `windowAudio: 'window'` temporariamente quando se cria a captura de tela. Com navegador compatível, escolher uma janela permite ao navegador oferecer áudio do aplicativo. Compartilhar o monitor inteiro ainda pode incluir todo o áudio do Windows.

## Tags de retorno existentes

- `production-stable-2026-10-30`: snapshot inicial da produção antes da separação dos ambientes.
- `production-before-unified-entry-2026-10-30`: produção antes do link único e remoção da senha.
- `production-before-window-audio-2026-11-02`: produção antes da alteração de captura de áudio por janela.
- `production-before-fastlive-rebrand-2026-11-03`: produção antes do rebrand para FastLive.
- `v1.0.0` e `v1.1.0`: tags do projeto upstream, não snapshots criados para deploy.

## Próximo passo

Repositório privado `git@github.com:daviferreirax/FastLive.git` configurado como `origin` (e o repositório original renomeado para `upstream`), com as branches `production`, `staging` e todas as tags publicadas. Aguardar o próximo pedido do usuário. Confirmar o ambiente antes de editar se o usuário não o especificar. Não publicar alterações na produção sem pedido explícito.
