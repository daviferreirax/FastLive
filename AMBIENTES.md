# Ambientes FastLive (baseado no PeekMe)

## Produção

- Pasta: `/home/ubuntu/peekme`
- Branch local: `production`
- Endereço: `https://exemplo.duckdns.org`
- Sala fixa: `/assistir/sala1`
- Ponto de retorno criado antes do ambiente de teste: `production-stable-2026-10-30`
- Último commit implantado: `685070d` (`Add daviferreirax copyright to LICENSE` / rebrand `FastLive` `f71bc44`)
- Tag de retorno imediatamente anterior ao rebrand FastLive: `production-before-fastlive-rebrand-2026-11-03`

## Teste

- Pasta: `/home/ubuntu/peekme-staging`
- Branch local: `staging`
- Arquivo Compose: `docker-compose.staging.yml`
- Endereço: `https://teste.exemplo.duckdns.org`
- Sala fixa: `/assistir/sala1`
- Porta interna do app: `3078` (não abrir no firewall; o Caddy atende HTTPS na 443).
- Último commit testado: `131a822` (`Add daviferreirax copyright to LICENSE` / rebrand `FastLive` `bb6d07d`)

O app de teste usa um `.env.staging` separado e o mesmo LiveKit da produção. Os
códigos das salas continuam aleatórios e cada app mantém seu próprio estado de
transmissão. Os testes ainda usam a CPU, memória, upload e servidor de vídeo desta
VPS; alterações no próprio LiveKit exigem planejamento separado.

## Fluxo de alterações

1. Fazer alterações somente em `/home/ubuntu/peekme-staging` quando o usuário pedir
   trabalho no ambiente de teste.
2. Conferir o teste em `https://teste.exemplo.duckdns.org`.
3. Só promover para `/home/ubuntu/peekme` e reconstruir produção quando o usuário
   pedir explicitamente.
4. Manter o tag `production-stable-2026-10-30` como ponto de retorno inicial.

## Containers e compartilhamento

- Produção: `peekme-app-1`; teste: `peekme-app-staging`.
- `peekme-livekit-1` e `peekme-caddy-1` são compartilhados. O app de teste tem estado de sala separado, mas as transmissões de ambos usam o mesmo LiveKit e a rede/upload/CPU da VPS.
- Para uma alteração comum de aplicação, reconstrua somente o app do ambiente autorizado. Não derrube o stack inteiro.

## Git e colaboração

- O checkout de produção e o checkout de teste são worktrees da mesma cópia local do Git, vinculados às branches `production` e `staging`.
- `origin` aponta para o repositório privado do usuário (`git@github.com:daviferreirax/FastLive.git`); `upstream` aponta para o repositório do criador do PeekMe (`https://github.com/williampeixinho/PeekMe.git`). Nunca faça push para `upstream`; publique em `origin` quando autorizado pelo usuário.
- As regras comuns para IAs estão em `AGENTS.md`; o procedimento está em `docs/AI-WORKFLOW.md`; o estado mais recente está em `docs/AI-HANDOFF.md`.

## Tags Git presentes

- `v1.0.0` e `v1.1.0`: versões upstream.
- `production-stable-2026-10-30`, `production-before-unified-entry-2026-10-30`, `production-before-window-audio-2026-11-02` e `production-before-fastlive-rebrand-2026-11-03`: pontos de retorno da produção.

Uma tag Git preserva um ponto no histórico do código, mas não salva `.env`, nem garante que uma imagem Docker antiga esteja disponível. Para voltar uma versão implantada, restaure o código aprovado e reconstrua o app; não remova tags.
