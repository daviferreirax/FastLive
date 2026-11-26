# Estado para passagem entre IAs

Última atualização: 2026-11-26.

## Estado atual

- Produção: `/home/ubuntu/fastlive`, branch `production`. Containers `fastlive-app-1`, `fastlive-livekit-1`, `fastlive-caddy-1` e `fastlive-duckdns-1` (com volumes HTTPS `fastlive_caddy_data` e `fastlive_caddy_config` preservados). Produção e teste estão alinhados nos recursos promovidos.
- Teste: `/home/ubuntu/fastlive-staging`, branch `staging`. Container `fastlive-app-staging` (projeto `fastlive-staging`).
- Produção é acessada na raiz do domínio principal configurado no `.env` (`https://${DOMAIN}`); teste na raiz do subdomínio de teste (`https://${STAGING_DOMAIN}`).
- Toda a identidade do projeto e da infraestrutura da VPS foi migrada para **FastLive**.

## Comportamento implementado

- Identidade visual e operacional **FastLive** nos ambientes de teste e produção (ícone SVG vetorial, cabeçalho estilizado, pastas `/home/ubuntu/fastlive` e `/home/ubuntu/fastlive-staging` e containers `fastlive-*`).
- Primeiro visitante é anfitrião; próximos são convidados pelo mesmo endereço. A senha de transmissão foi removida.
- Áudio desmarcado inicialmente; 1080p selecionado por padrão.
- A captura solicita `windowAudio: 'window'` temporariamente quando se cria a captura de tela. Com navegador compatível, escolher uma janela permite ao navegador oferecer áudio do aplicativo. Compartilhar o monitor inteiro ainda pode incluir todo o áudio do Windows.
- Overlay discreta no canto superior direito (`#stream-quality`) mostrando resolução e FPS reais da stream em foco (ex.: `1080p · 30 fps`), clicável (ou tecla `I`) para expandir estatísticas extras sob demanda (resolução exata, quadros, bitrate, codec, `Encoder`/`Decoder`, `Limite` de envio, perda, jitter e latência).
- Barra de controles do rodapé (`.controls`), overlay de qualidade e cursor em tela cheia ocultam automaticamente após 3 segundos de inatividade do mouse sobre o vídeo, somem ao sair da área do vídeo e reaparecem ao movimentar o mouse.
- Atalhos de teclado no player (`F` tela cheia, `M` mudo, `↑`/`↓` volume, `G` grade, `1`–`9` telas, `I` estatísticas, `P` pessoas na sala, `Esc` fecha painéis).
- Seletor manual de qualidade (`Auto` / `1080p` / `720p` / `360p`) para quem assiste (oculto automaticamente quando a stream tem camada única).
- Diálogo reutilizável para convidados escolherem qualidade (`1080p` padrão / `720p`) e áudio (desmarcado por padrão) antes de transmitir, além de botão **Trocar tela** (anfitrião e convidado transmitindo) sem encerrar a sala.
- Avisos discretos (`toast`) quando alguém entra, sai ou inicia/troca transmissão.
- Controles individuais de áudio por quadro no modo grade (mudo, volume relativo e botão "ouvir só esta tela").
- Lista de pessoas na sala (`👥` / tecla `P`) para convidados (e para o anfitrião em tela cheia), exibindo contagem `X de Y assistindo` e status `· transmitindo`.
- Continuidade da sala após saída do anfitrião enquanto houver ao menos um convidado transmitindo, encerrando automaticamente quando o último transmissor parar ou sair.
- Codec preferencial de transmissão configurado para **H.264** (com fallback automático para **VP8** via `backupCodec`), com `simulcast: false` e framerate travado em **30 fps** em todas as qualidades para reduzir uso de CPU e upload.

## Tags de retorno existentes

- `production-stable-2026-10-30`: snapshot inicial da produção antes da separação dos ambientes.
- `production-before-unified-entry-2026-10-30`: produção antes do link único e remoção da senha.
- `production-before-window-audio-2026-11-02`: produção antes da alteração de captura de áudio por janela.
- `production-before-fastlive-rebrand-2026-11-03`: produção antes do rebrand visual para FastLive.
- `production-before-vps-rename-2026-11-03`: produção antes da migração das pastas e containers da VPS para `fastlive`.
- `production-before-root-link-2026-11-03`: produção antes de o link compartilhado passar a ser a raiz do domínio.
- `production-before-player-enhancements-2026-11-26`: produção antes da promoção dos recursos do player, lista de participantes, troca de tela e continuidade de sala.
- `production-before-h264-30fps-2026-11-26`: produção antes da promoção do codec `H.264`, trava em `30 fps`, `simulcast: false` e indicadores de aceleração/limite.
- `v1.0.0` e `v1.1.0`: tags do projeto upstream.

## Última promoção

- Promovidos para produção em 2026-11-26 os ajustes de codificação e desempenho validados em teste: codec preferencial `H.264` (fallback `VP8`), `simulcast: false`, framerate travado em `30 fps`, ocultação automática do seletor manual em camada única e indicadores `Encoder`/`Decoder` + `Limite` nas estatísticas sob demanda (commits `cf44acc`, `8b06089`, `7621b06`, `7c95a41`, `b8dfd8c` em `staging`; `07f8058`, `6d8bb74`, `8976d1a`, `6363428` em `production`; tag de retorno `production-before-h264-30fps-2026-11-26`). Não havia salas LiveKit ativas no momento do deploy.

## Próximo passo

Repositório privado `git@github.com:daviferreirax/FastLive.git` configurado como `origin`. Produção e teste estão alinhados com commits e tags locais (sem `git push` para `origin`). Aguardar o próximo pedido do usuário; não publicar no remoto nem alterar produção sem pedido explícito.
