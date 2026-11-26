# Estado para passagem entre IAs

Última atualização: 2026-11-25.

## Estado atual

- Produção: `/home/ubuntu/fastlive`, branch `production`. Containers migrados para `fastlive-app-1`, `fastlive-livekit-1`, `fastlive-caddy-1` e `fastlive-duckdns-1` (com volumes HTTPS `fastlive_caddy_data` e `fastlive_caddy_config` preservados). Produção permanece inalterada em relação à última promoção (`5d0aeb9`).
- Teste: `/home/ubuntu/fastlive-staging`, branch `staging`. Container `fastlive-app-staging` (projeto `fastlive-staging`).
- Produção é acessada na raiz do domínio principal configurado no `.env` (`https://${DOMAIN}`); teste na raiz do subdomínio de teste (`https://${STAGING_DOMAIN}`).
- Toda a identidade do projeto e da infraestrutura da VPS foi migrada para **FastLive**.

## Comportamento implementado

- Identidade visual e operacional **FastLive** nos ambientes de teste e produção (ícone SVG vetorial, cabeçalho estilizado, pastas `/home/ubuntu/fastlive` e `/home/ubuntu/fastlive-staging` e containers `fastlive-*`).
- Primeiro visitante é anfitrião; próximos são convidados pelo mesmo endereço. A senha de transmissão foi removida.
- Áudio desmarcado inicialmente; 1080p selecionado por padrão.
- A captura solicita `windowAudio: 'window'` temporariamente quando se cria a captura de tela. Com navegador compatível, escolher uma janela permite ao navegador oferecer áudio do aplicativo. Compartilhar o monitor inteiro ainda pode incluir todo o áudio do Windows.
- **Somente em teste (`staging`)**:
  - Overlay discreta no canto superior direito (`#stream-quality`) mostrando resolução e FPS reais da stream em foco (ex.: `1080p · 60 fps`), clicável (ou tecla `I`) para expandir estatísticas extras sob demanda (resolução exata, quadros, bitrate, codec, perda, jitter e latência).
  - Barra de controles do rodapé (`.controls`), overlay de qualidade e cursor em tela cheia ocultam automaticamente após 3 segundos de inatividade do mouse sobre o vídeo, somem ao sair da área do vídeo e reaparecem ao movimentar o mouse.
  - Atalhos de teclado no player (`F` tela cheia, `M` mudo, `↑`/`↓` volume, `G` grade, `1`–`9` telas, `I` estatísticas, `P` pessoas na sala, `Esc` fecha painéis).
  - Seletor manual de qualidade (`Auto` / `1080p` / `720p` / `360p`) para quem assiste.
  - Diálogo reutilizável para convidados escolherem qualidade (`1080p` padrão / `720p`) e áudio (desmarcado por padrão) antes de transmitir, além de botão **Trocar tela** (anfitrião e convidado transmitindo) sem encerrar a sala.
  - Avisos discretos (`toast`) quando alguém entra, sai ou inicia/troca transmissão.
  - Controles individuais de áudio por quadro no modo grade (mudo, volume relativo e botão "ouvir só esta tela").
  - Lista de pessoas na sala (`👥` / tecla `P`) para convidados (e para o anfitrião em tela cheia), exibindo contagem `X de Y assistindo` e status `· transmitindo`.

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

Repositório privado `git@github.com:daviferreirax/FastLive.git` configurado como `origin`. Novos recursos do player, troca de tela sem derrubar a sala, opções de transmissão para convidados e controles individuais de áudio na grade aplicados apenas no ambiente de teste (`/home/ubuntu/fastlive-staging`, branch `staging`), aguardando validação manual do usuário para eventual promoção à produção mediante pedido explícito.
