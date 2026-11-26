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
- Overlay discreta no canto superior direito (`#stream-quality`) mostrando resolução e FPS reais da stream em foco (ex.: `1080p · 60 fps`), clicável (ou tecla `I`) para expandir estatísticas extras sob demanda (resolução exata, quadros, bitrate, codec, perda, jitter e latência).
- Barra de controles do rodapé (`.controls`), overlay de qualidade e cursor em tela cheia ocultam automaticamente após 3 segundos de inatividade do mouse sobre o vídeo, somem ao sair da área do vídeo e reaparecem ao movimentar o mouse.
- Atalhos de teclado no player (`F` tela cheia, `M` mudo, `↑`/`↓` volume, `G` grade, `1`–`9` telas, `I` estatísticas, `P` pessoas na sala, `Esc` fecha painéis).
- Seletor manual de qualidade (`Auto` / `1080p` / `720p` / `360p`) para quem assiste.
- Diálogo reutilizável para convidados escolherem qualidade (`1080p` padrão / `720p`) e áudio (desmarcado por padrão) antes de transmitir, além de botão **Trocar tela** (anfitrião e convidado transmitindo) sem encerrar a sala.
- Avisos discretos (`toast`) quando alguém entra, sai ou inicia/troca transmissão.
- Controles individuais de áudio por quadro no modo grade (mudo, volume relativo e botão "ouvir só esta tela").
- Lista de pessoas na sala (`👥` / tecla `P`) para convidados (e para o anfitrião em tela cheia), exibindo contagem `X de Y assistindo` e status `· transmitindo`.
- Continuidade da sala após saída do anfitrião enquanto houver ao menos um convidado transmitindo, encerrando automaticamente quando o último transmissor parar ou sair.
- **Somente em teste (`staging`)**:
  - Codec preferencial de transmissão alterado para **AV1** (com fallback automático para **H.264** na escolha de capacidade e **VP8** via `backupCodec` quando necessário), buscando usar encoder/decoder por hardware.
  - Estatísticas sob demanda exibem também `Encoder`/`Decoder` (`Hardware`, `Misto (GPU+CPU)` ou `Software (...)`) e, para quem transmite, `Limite` (`Nenhum`, `CPU` ou `Rede (upload)`).
  - Framerate travado em **30 fps** em todas as qualidades (`1080p`, `720p` e camadas de simulcast `720p`/`360p`) para reduzir uso de CPU/GPU e upload.
  - Simulcast desativado (`simulcast: false`) para liberar aceleração por hardware e reduzir uso de CPU e upload (ocultando o seletor manual de qualidade quando a stream tem camada única).

## Tags de retorno existentes

- `production-stable-2026-10-30`: snapshot inicial da produção antes da separação dos ambientes.
- `production-before-unified-entry-2026-10-30`: produção antes do link único e remoção da senha.
- `production-before-window-audio-2026-11-02`: produção antes da alteração de captura de áudio por janela.
- `production-before-fastlive-rebrand-2026-11-03`: produção antes do rebrand visual para FastLive.
- `production-before-vps-rename-2026-11-03`: produção antes da migração das pastas e containers da VPS para `fastlive`.
- `production-before-root-link-2026-11-03`: produção antes de o link compartilhado passar a ser a raiz do domínio.
- `production-before-player-enhancements-2026-11-26`: produção antes da promoção dos recursos do player, lista de participantes, troca de tela e continuidade de sala.
- `v1.0.0` e `v1.1.0`: tags do projeto upstream.

## Última promoção

- Promovidos para produção em 2026-11-26 os recursos validados em teste: overlay de qualidade com estatísticas sob demanda, auto-ocultamento de controles/cursor em 3s, atalhos de teclado, seletor manual de qualidade, troca de tela sem encerrar a sala, opções de qualidade/áudio para convidados, toasts de presença/transmissão, áudio individual na grade, lista de participantes na sala e continuidade da sala enquanto houver convidado transmitindo (commits `b6ab072`, `da65ee0`, `0c14290`, `4875896` em `staging`; `7397e18`, `49e4695`, `4de0957`, `b97465a` em `production`; tag de retorno `production-before-player-enhancements-2026-11-26`). Havia 1 sala LiveKit ativa (5 participantes, 1 transmissor) no momento da checagem; o reinício do app de produção foi autorizado explicitamente pelo usuário.

## Próximo passo

Repositório privado `git@github.com:daviferreirax/FastLive.git` configurado como `origin`. Commits locais e tag de retorno `production-before-player-enhancements-2026-11-26` registrados em `production` e `staging` (ainda sem `git push` para `origin`). Teste de `AV1` (fallback `H.264`/`VP8`), indicadores de hardware/limite, trava em `30 fps` e `simulcast: false` implantado apenas em `/home/ubuntu/fastlive-staging` (`staging`), aguardando validação do usuário antes de promover para produção.
