# Estado para passagem entre IAs

Última atualização: 2026-11-02.

## Estado atual

- Produção: `/home/ubuntu/peekme`, branch `production`, commit `50e2ca8` (`Capture audio from selected window`). O app foi reconstruído e `/healthz` respondeu com sucesso.
- Teste: `/home/ubuntu/peekme-staging`, branch `staging`, commit `5317534` (`Capture audio from selected window`). O usuário testou o áudio da janela em navegador real e confirmou que funcionou.
- Produção mantém o link `https://exemplo.duckdns.org/assistir/sala1`; teste usa `https://teste.exemplo.duckdns.org/assistir/sala1`.
- O áudio da janela foi promovido para produção a pedido do usuário. O teste e a produção continuam em containers separados, mas compartilham LiveKit, Caddy e recursos da VPS.
- A produção estava sem salas ativas na última implantação. Nenhuma outra alteração está pendente neste momento.

## Comportamento implementado

- Primeiro visitante é anfitrião; próximos são convidados pelo mesmo endereço. A senha de transmissão foi removida.
- Áudio desmarcado inicialmente; 1080p selecionado por padrão.
- A captura solicita `windowAudio: 'window'` temporariamente quando se cria a captura de tela. Com navegador compatível, escolher uma janela permite ao navegador oferecer áudio do aplicativo. Compartilhar o monitor inteiro ainda pode incluir todo o áudio do Windows.
- O usuário confirmou a captura por janela no ambiente de teste. Depois pediu e confirmou a promoção para produção.

## Tags de retorno existentes

- `production-stable-2026-10-30`: snapshot inicial da produção antes da separação dos ambientes.
- `production-before-unified-entry-2026-10-30`: produção antes do link único e remoção da senha.
- `production-before-window-audio-2026-11-02`: produção antes da alteração de captura de áudio por janela.
- `v1.0.0` e `v1.1.0`: tags do projeto upstream, não snapshots criados para deploy.

## Próximo passo

Aguardar o próximo pedido. Confirmar o ambiente antes de editar se o usuário não o especificar. Não publicar alterações na produção sem pedido explícito.
