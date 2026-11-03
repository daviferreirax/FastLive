# Estado para passagem entre IAs

Última atualização: 2026-11-03.

## Estado atual

- Produção: `/home/ubuntu/peekme`, branch `production`, commit `5c96708` (`Document shared AI project workflow`), rodando o código do commit `50e2ca8` (`Capture audio from selected window`).
- Teste: `/home/ubuntu/peekme-staging`, branch `staging`. Projeto renomeado visualmente e nos metadados para **FastLive** (com novo ícone SVG vetorial `icon.svg`, título e textos em `index.html`, `style.css`, `app.js`, `server.js` e `package.json`), mantendo os nomes das pastas e containers da VPS intactos para não interromper o Docker/Caddy/LiveKit.
- Produção mantém o link `https://exemplo.duckdns.org/assistir/sala1`; teste usa `https://teste.exemplo.duckdns.org/assistir/sala1`.
- O teste e a produção continuam em containers separados, mas compartilham LiveKit, Caddy e recursos da VPS.

## Comportamento implementado

- Identidade visual **FastLive** no ambiente de teste (ícone SVG e cabeçalho estilizado).
- Primeiro visitante é anfitrião; próximos são convidados pelo mesmo endereço. A senha de transmissão foi removida.
- Áudio desmarcado inicialmente; 1080p selecionado por padrão.
- A captura solicita `windowAudio: 'window'` temporariamente quando se cria a captura de tela. Com navegador compatível, escolher uma janela permite ao navegador oferecer áudio do aplicativo. Compartilhar o monitor inteiro ainda pode incluir todo o áudio do Windows.

## Tags de retorno existentes

- `production-stable-2026-10-30`: snapshot inicial da produção antes da separação dos ambientes.
- `production-before-unified-entry-2026-10-30`: produção antes do link único e remoção da senha.
- `production-before-window-audio-2026-11-02`: produção antes da alteração de captura de áudio por janela.
- `v1.0.0` e `v1.1.0`: tags do projeto upstream, não snapshots criados para deploy.

## Próximo passo

Aguardar validação visual do usuário no ambiente de teste (`https://teste.exemplo.duckdns.org/assistir/sala1`). Só promover para produção e configurar o repositório privado no GitHub após aprovação explícita do usuário.
