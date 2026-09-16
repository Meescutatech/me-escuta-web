# me-escuta-web — as telas
Next.js (App Router) na Vercel. Tronco `main`. Escreve SÓ por RPC `api.*`; leitura em `core` com RLS.


## feature: conversas

### O que faz
A caixa de entrada, o fio da conversa e o composer. É dona de POR QUAL NÚMERO a mensagem sai.
NÃO é dona do envio em si — quem fala com a Meta/WuzAPI é o sender, no `me-escuta-runtime`.

### Decisões
- 2026-09-15 · O seletor "Enviando por" passa a valer: escolher outro número manda
  `{telefone, phone_number_id, corpo}` no lugar de `{conversa_id, corpo}`, e a porta acha ou cria o
  fio daquele número (`md5(phone_number_id|telefone)`). A decisão é pura, em
  `lib/conversas/envio-canal.ts`; a tela só obedece.
  Motivo: o seletor existia desde o M7 e nunca chegava ao envio — `fioNovo` só pintava o aviso
  âmbar. Relato do COO testando com três números: *"todas as msgs vieram para mim pelo teste_meta"*.
  Descartado: (a) mandar o par JUNTO com `conversa_id` — a porta completa pela conversa apontada
  (passo ii da 0118) e o número escolhido se perde de novo, em silêncio; (b) uma conversa que
  responde por dois números — a conversa É o par (número, telefone), e misturar quebra o id.
- 2026-09-15 · Canal fora da lista que o servidor autorizou é RECUSADO na tela, com motivo, antes
  do clique. Motivo: no Lite o número é o WhatsApp PESSOAL de uma fonoaudióloga.
  Descartado: deixar a porta recusar — o custo de descobrir depois é a mensagem sumir sem projeção.
