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
- 2026-09-15 · Os fios irmãos (outras conversas do mesmo lead, por outros números) aparecem em
  `/conversas`, abaixo do fio aberto — não no drawer do funil, onde eu os construí primeiro por ter
  lido errado o pedido. A regra é `lib/conversas/fios-irmaos.ts` e DERIVA da lista que a página já
  carrega: `ConversaResumo` traz `lead_id`, `previa`, `atualizado_em` e os quatro campos do M7.
  Motivo: o dado já está no cliente; consultar de novo seria pagar duas vezes pelo mesmo.
  Descartado: (a) leitura nova no servidor — a primeira versão do teste a exigia, e foi reescrita
  antes de virar código; (b) parentesco por telefone — sem `lead_id` não há prova de ser a mesma
  pessoa, e o erro mostraria a conversa de um desconhecido dentro da de outro.

- 2026-09-16 · Cada fio irmão é uma **thread inteira** na tela de conversas — `<section>` com
  cabeçalho (chip M7 + selos + "abrir") e o `FioLead` dentro, com as últimas 20 mensagens daquele
  número. A página lê as mensagens dos irmãos no `Promise.all` que já existia.
  Motivo: a primeira entrega mostrava uma linha de prévia por irmão e foi recusada — *"teria que ter
  realmente uma divisão de thread de onde foi cada conversa"*. O print do Kommo mostra blocos de
  mensagens, não resumos.
  Descartado: (a) resumo de uma linha com a prévia; (b) reescrever o render de fio no inbox — o
  `FioLead` do drawer já resolve blocos por dia, áudio, imagem e estado de entrega; (c) trazer a
  thread inteira de cada irmão: `lerMensagens` traz até 500, e um lead de 3 fios pediria 1.500 numa
  tela que já lê o fio aberto.

### Como se escreve guarda aqui (aprendido no dia, doendo)
Teste sobre texto-fonte tem de ancorar **no que muda quando o defeito entra**, e a única forma de
saber isso é **mutar**. Em 15-16/09, **seis** guardas minhas passaram no estado quebrado:

1. **o payload do fio novo** — só virou guarda quando deixou de ser ternário na action e virou
   função pura, testada por comportamento;
2. **a faixa única** — a âncora era a linha exata que o próprio conserto alterava (`{!interno &&
   origem &&` deixou de existir ao ganhar o `!fioNovo`, e o `indexOf` devolveu −1);
3. **o render dos fios irmãos** — passava 9/0 com a tela desligada por `{false && …}`, porque
   olhava se as chamadas existiam, não a **condição**;
4. **a leitura das mensagens dos irmãos** — ancorada no **nome da variável**: trocar a leitura real
   por `Promise.resolve({})` mantinha `mensagensDosIrmaos` no arquivo, e passava 7/0;
5. **o desenho da thread** — ancorado em `/FioLead/` no arquivo inteiro: o **import** sobrevive
   quando o uso some do render, e passava 7/0;
6. **a correção do nº 5** — usou **janela fixa** de 2600 caracteres onde a distância real era 2689.
   A guarda voltou a não distinguir: a mutação deu o mesmo resultado que o controle.

Os três padrões que se repetem, e o que fazer:

| padrão do erro | o conserto |
|---|---|
| ancorar no **nome** (variável, símbolo, import) | ancorar na **chamada** ou no **uso**, dentro do bloco que importa |
| ancorar na **linha exata** que o conserto altera | ancorar no **miolo** da regra, que sobrevive ao conserto |
| **janela fixa** de N caracteres | delimitar pelo **fechamento real** (`</section>`, fim do bloco) |

E um sinal que denuncia guarda furada sem precisar pensar: **se a mutação devolve o mesmo placar do
controle, o teste não está medindo nada.** Foi assim que os casos 5 e 6 apareceram.

Verde não é guarda. **Guarda é o que fica vermelho quando você quebra de propósito.**

### Pendência técnica — threads irmãs (16/09, feature quase concluída)

O que está no ar (`4ec6780`) e funciona: leitura das mensagens por irmão com teto de 20, `<section>`
por número com cabeçalho (chip M7 + selos + "abrir"), `FioLead` desenhando a thread. 7 testes,
1227/1227, 4 mutações reprovando.

**Falta acabamento, e são dois defeitos de layout — não de dado:**

1. **A primeira bolha fica cortada pelo cabeçalho.** O `FioLead` rola para o fim ao montar
   (`scrollIntoView` no `fimRef` dele) e, dentro do contêiner de `max-h-[420px]`, encosta no topo:
   a mensagem mais antiga aparece pela metade atrás da faixa do número. Conserto provável: o
   `FioLead` só deve auto-rolar quando é o fio principal — hoje ele o faz sempre.
2. **A ordem visual saiu invertida.** A seção das irmãs aparece ACIMA do fio aberto, quando a
   conversa aberta é o centro e as irmãs vêm depois. O bloco foi inserido antes do
   `<div ref={fimRef} />`, mas o resultado na tela ficou no topo — investigar o contêiner de
   rolagem antes de mover o JSX.

**Como retomar:** teste primeiro, mutação antes de chamar de guarda, e conferir na TELA — nesta
feature dez instrumentos deram conclusão errada e só o screenshot acertou.
