# KASE BOT

Versão inicial de testes do bot da KASE Esports.

## Rodar localmente
1. Instale Node.js 20 ou superior.
2. Execute `npm install`.
3. Configure `PAIRING_NUMBER` como variável de ambiente, usando código do país + DDD + número, somente dígitos.
4. Execute `npm start`.

## Render
- Tipo: Web Service
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: Node
- Variável `PAIRING_NUMBER`: seu número com código do país, DDD e telefone, sem `+`, espaços ou símbolos.

## Importante
- Nunca envie a pasta `sessao/` ao GitHub.
- Nunca publique códigos de pareamento ou arquivos de autenticação.
- O disco local do serviço gratuito do Render é efêmero; reinicializações podem apagar a sessão do WhatsApp. Este projeto é apenas para testes no plano gratuito.
- O código inicial inclui `.menu`, `.regras`, `.adm` e `.infogrupo`. Recursos de moderação ainda não foram implementados.
