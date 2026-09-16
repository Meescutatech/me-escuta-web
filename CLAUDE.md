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
- 2026-09-15 · A tela do lead mostra TODOS os fios, um bloco por número, mais recente primeiro
  (`lerFiosDoLeadAcao`, antes `lerConversaDoLeadAcao` com teto de um registro). A etiqueta de cada
  bloco delega ao `chipDoNumero` (M7) e o corte de 20 mensagens é POR BLOCO.
  Motivo: com o fio novo por número, o mesmo lead passou a ter mais de uma conversa — mostrar só a
  mais recente escondia conversa respondida, sem avisar. Medido em 15/09: 5 leads reais com 2+ fios,
  um com 3. Pedido do COO com print do Kommo: "mesma página em threads diferentes".
  Descartado: (a) rótulo próprio no cabeçalho — o chip já resolve os cinco casos e os selos, e
  garante que `phone_number_id` nunca vire rótulo (em canal não oficial ele é `lite:<fono>`);
  (b) aplicar o corte de mensagens ao conjunto — esconderia o fio antigo inteiro.
- 2026-09-15 · Em `lib/`, arquivo importado por teste usa caminho RELATIVO com extensão `.ts`, não
  o alias `@/`. Motivo: `node --test` não resolve o alias do tsconfig e falha com
  ERR_MODULE_NOT_FOUND **com o typecheck verde** — o TS resolve, o runtime não.
  Descartado: ensinar o runner a resolver o alias; custo desproporcional para um import.
