# Ambientes PeekMe

## Produção

- Pasta: `/home/ubuntu/peekme`
- Branch local: `production`
- Endereço: `https://exemplo.duckdns.org`
- Sala fixa: `/assistir/sala1`
- Ponto de retorno criado antes do ambiente de teste: `production-stable-2026-10-30`

## Teste

- Pasta: `/home/ubuntu/peekme-staging`
- Branch local: `staging`
- Arquivo Compose: `docker-compose.staging.yml`
- Endereço: `https://teste.exemplo.duckdns.org`
- Sala fixa: `/assistir/sala1`
- Porta interna do app: `3078` (não abrir no firewall; o Caddy atende HTTPS na 443).

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
