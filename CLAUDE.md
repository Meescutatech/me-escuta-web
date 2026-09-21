# me-escuta-web — as telas
Next.js (App Router) na Vercel. Tronco `main`. Escreve SÓ por RPC `api.*`; leitura em `core` com RLS.

**Deploy é manual:** `vercel git connect` não funciona (zero GitHub Apps na org, E-381). Push para
`origin/main` **não dispara build**. Deploy é `npx vercel --prod` na raiz do repo.
**Deploy acontece junto ao commit** — não deixar para depois. Push + deploy na mesma sessão.


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

- 2026-09-16 · ⛔ **PARCIALMENTE SUPERSEDIDA no mesmo dia: a CAIXA virou uma RÉGUA** (ver a decisão
  da divisão simples, abaixo). Continua valendo: thread inteira, `FioLead` reusado, teto de 20 por
  irmão, leitura no `Promise.all`. Deixou de valer: a `<section>` com borda, cabeçalho próprio e
  `max-h-[420px] overflow-y-auto`.
  Cada fio irmão é uma **thread inteira** na tela de conversas — `<section>` com
  cabeçalho (chip M7 + selos + "abrir") e o `FioLead` dentro, com as últimas 20 mensagens daquele
  número. A página lê as mensagens dos irmãos no `Promise.all` que já existia.
  Motivo: a primeira entrega mostrava uma linha de prévia por irmão e foi recusada — *"teria que ter
  realmente uma divisão de thread de onde foi cada conversa"*. O print do Kommo mostra blocos de
  mensagens, não resumos.
  Descartado: (a) resumo de uma linha com a prévia; (b) reescrever o render de fio no inbox — o
  `FioLead` do drawer já resolve blocos por dia, áudio, imagem e estado de entrega; (c) trazer a
  thread inteira de cada irmão: `lerMensagens` traz até 500, e um lead de 3 fios pediria 1.500 numa
  tela que já lê o fio aberto.

- 2026-09-16 · A divisão entre números é uma **régua no mesmo fio**, não uma caixa: um bloco por
  número, cada um aberto por um divisor (régua atravessando, rótulo do M7 no meio, selos e
  "abrir"), e as mensagens correndo na mesma coluna. O fio aberto também ganha régua, e **só
  quando há irmãos**. Hierarquia por peso — aberto em `text-tinta`, irmãos em `text-suave` — nunca
  por uma palavra dizendo "você está aqui".
  Motivo: a caixa foi recusada — *"gostaria que fosse uma divisão mais simples na mesma tela de
  conversa… uma linha que mostra onde acabou a conversa de um número e onde começou do novo"*, com
  o print do Kommo do lado. E rolagem dentro de rolagem era a **causa** dos dois defeitos de
  layout, não um detalhe estético.
  Descartado: (a) intercalar as mensagens cronologicamente e dividir a cada troca de número —
  escolha do Diogo pela tool, em 16/09. Os tetos são diferentes (500 no fio aberto, 20 por irmão),
  então a linha do tempo única mentiria sobre quando cada conversa começou, e dois números ativos
  no mesmo dia viram uma régua a cada troca, que é o oposto de "simples"; (b) o título
  "TAMBÉM FALAM POR OUTRO NÚMERO" — all-caps competindo com o chip de dia, e a régua já diz isso.
- 2026-09-16 · O `FioLead` só auto-rola quando é o fio principal (prop `autoRolar`, default
  `true`; o inbox passa `false` nos irmãos).
  Motivo: ele abre "no presente" subindo até o primeiro ancestral rolável. Na caixa de 420px isso
  comia os 61px de cima e cortava a primeira bolha (medido: `scrollTop 61 de 61`). **Depois que a
  caixa saiu, isto deixou de ser acabamento e virou risco de verdade:** o ancestral rolável passou
  a ser o fio inteiro, então auto-rolar num irmão saltaria a tela da Sara.
  Descartado: `scroll-mt`/padding no topo — disfarça o recorte e deixa a thread irmã começando
  pelo meio, que é o oposto do que o bloco serve para mostrar.
- 2026-09-16 · A âncora do fim do fio (`<div ref={fimRef} />`) fica **acima** do bloco das irmãs.
  Motivo: os cinco que miram nela — abertura, mensagem nova, envio, "ver no fio", proposta do
  Jarvis — querem a última mensagem DESTA conversa; nenhum quer o fim do documento. Com a âncora
  embaixo, abrir a conversa rolava até as irmãs e o fio aberto saía de vista (`scrollTop 1087 de
  1104`). A hipótese registrada era "mover o JSX das irmãs", e a medição no DOM a **refutou**: o
  markup estava certo; quem estava no lugar errado era a âncora.
  Descartado: (a) mover a seção das irmãs para fora do contêiner de rolagem — viraria faixa fixa
  comendo altura em tela baixa; (b) um ref próprio só para a abertura — os outros quatro
  continuariam mirando as irmãs.
  ⚠️ Fora de escopo, de propósito: com irmãs presentes, `aoRolar`/`noFimRef` só considera "no fim"
  quem rolou até o fim delas, então mensagem nova vira pill em vez de rolar. Não rouba o scroll da
  Sara (RF-30), então fica.
- 2026-09-16 · A régua diz **qual número é**: E.164 legível ao lado do rótulo (some abaixo de
  `sm`) e, no hover, o número + a via (API oficial × WhatsApp Lite, derivada do prefixo `lite:`) +
  a consequência (número de teste só entrega a quem está na lista de permissão). Regras puras em
  `regras/numero.ts`: `viaDoNumero`, `numeroLegivel`, `identidadeDoNumero`.
  Motivo: a régua dizia só "CLARA", e saber por qual número a conversa corre muda o que se
  escreve — no Lite, o número é o WhatsApp pessoal de uma fonoaudióloga.
  Decisões dentro da regra: formato desconhecido volta **inteiro**, sem remendo (número mal
  agrupado deixa de bater com o que se procura no WhatsApp, e ninguém vê que foi a tela que
  mexeu); E.164 ilegível pela RLS **diz isso**, nunca fica em branco; o `phone_number_id` nunca
  entra no texto (CA-9 — no Lite ele carrega o nome da fono).
  ⚠️ **O `verified_name` — o nome que aparece no WhatsApp de quem recebe — NÃO existe no banco.**
  Não é coluna de `core.canal_whatsapp`; vive na Graph API e num comentário da migration `0094`
  (conferido em 28/07: `627327023793464` → "Me Escuta", `608866985643828` → "Test Number"). Tê-lo
  na tela custa coluna nova + leitura da Graph no runtime. Até lá, a tela fala do NÚMERO e da VIA,
  e não do nome exibido: inventar identidade de canal é o que o M7 existe para impedir.

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

Em 16/09, mais duas, as duas pegas pela mutação antes de qualquer commit:

7. **a abertura mirar o fio** — a janela ia até `totalAnteriorRef.current = total` e **engolia o
   ramo `else`**, onde `fimRef.current` aparece de novo. Trocar o alvo da abertura por `null`
   deixava a guarda verde: o `fimRef` do outro ramo respondia por ele. Delimitar pelo fechamento
   real não basta se o fechamento escolhido for o do bloco **de fora** — a janela certa era só o
   ramo, até o `} else if`;
8. **a ordem da âncora** — ancorada em `irmaos.length > 0`, que no dia seguinte passou a aparecer
   **duas vezes** (o divisor do fio aberto nasceu acima do bloco das irmãs), e o `indexOf` pegou a
   errada. Âncora não envelhece só quando o código muda: envelhece quando o arquivo **cresce à
   volta dela**.

Os três padrões que se repetem, e o que fazer:

| padrão do erro | o conserto |
|---|---|
| ancorar no **nome** (variável, símbolo, import) | ancorar na **chamada** ou no **uso**, dentro do bloco que importa |
| ancorar na **linha exata** que o conserto altera | ancorar no **miolo** da regra, que sobrevive ao conserto |
| **janela fixa** de N caracteres | delimitar pelo **fechamento real** (`</section>`, fim do bloco) |

| janela pelo fechamento do bloco **de fora** | delimitar pelo fechamento do **ramo** que importa |
| âncora que o arquivo **duplica** ao crescer | ancorar no que é único do trecho (`irmaos.map(`) |

E um sinal que denuncia guarda furada sem precisar pensar: **se a mutação devolve o mesmo placar do
controle, o teste não está medindo nada.** Foi assim que os casos 5 e 6 apareceram.

⚠️ **Mas o sinal tem um falso positivo, e ele apareceu duas vezes em 16/09: a mutação que não
introduz o defeito.** Mover `if (!autoRolar) return;` duas linhas para baixo, mas ainda antes da
linha que rola, não muda comportamento nenhum — verde ali é o **certo**. Acrescentar uma segunda
saída sem remover a primeira, idem. Antes de acusar a guarda, confira se a mutação **de fato
quebra a coisa**: "mover" é remover de um lado E inserir no outro, numa troca só.

Verde não é guarda. **Guarda é o que fica vermelho quando você quebra de propósito** — e a mutação
só vale como prova quando ela própria seria um defeito de verdade.
- 2026-09-16 · "não entregue" com `131030` diz **"número fora da lista de permissão do número de
  teste — inclua na Meta e tente de novo"**, e o retry fica. O texto vem de `motivoErroEnvio`
  (`lib/conversas/thread.ts`), usado pelo inbox e pelo fio do funil.
  Motivo: a equipe via "erro 131030" e não sabia que era a lista da Meta; incluído o número, o
  reenvio entrega. Não existe allow list nossa de destinatário (medido em 16/09).
  Descartado: pôr 131030 em `ERRO_PERMANENTE` — tiraria o "Tentar de novo" de quem acabou de ser
  incluído na lista.

- 2026-09-21 · `ConteudoBolha` ganha galho para `tipo_conteudo = 'template'`, ANTES do fallback de
  mídia; com corpo mostra o corpo, sem corpo diz que o texto não ficou registrado.
  Motivo: reportado em produção — o template saía no chat com ÍCONE DE FOTO, rótulo
  `Mensagem (template)` e "visualização chega com a pipeline de mídia". Não era mídia: sem galho
  próprio, `template` escorria até o fallback, cujo rótulo genérico é `Mensagem (${tipo})`. Mesma
  classe que já tinha mordido em `reaction` e em `botao`. Medido em `core.mensagem`: os dois
  templates de 21/09 com `corpo` vazio e `status_entrega='lido'` — chegaram e foram lidos. O runtime
  passou a gravar o corpo a partir dali; as linhas anteriores ficam vazias para sempre, e é por isso
  que o galho tem dois lados.
  Descartado: montar o corpo na tela a partir de `core.template_whatsapp` — a definição pode ter
  mudado depois do envio, e a bolha mostraria um texto que ninguém recebeu.

## feature: canais e números

### O que faz
A tela de números de WhatsApp (`/configuracoes/canais`): lista, registra, pareia (QR) e liga ou
desliga canais oficiais e não oficiais. NÃO é dona da regra de quem pode escrever — a guarda de papel
é da porta (`me-escuta-db`, 0337) — nem da sessão do WuzAPI, que é do runtime.

### Decisões
- ⚠️ SUPERSEDIDA em 2026-09-16 (tarde): o formulário virou só o botão, para todo papel — ver a
  decisão "o número pessoal é de quem cadastra" abaixo. O portão do QR descrito aqui continua valendo.
- 2026-09-16 · `membro` registra e pareia o PRÓPRIO número não oficial: dono fixo nele, finalidade
  sempre `producao` (forçada também na action, que é endpoint), departamento obrigatório e só entre
  as lotações dele (`api.departamentos_do_uid`, a mesma função da PMEE6). Oficial, ligar e desligar
  continuam da gestão. O portão do QR (`podeCriarSessao`) compara o uid lido no servidor com o dono
  lido do banco, nunca com o que a tela manda.
  Motivo: o roteiro de 17/09 manda cada fono cadastrar o seu número; a tela abria em leitura e a saída
  usada em 15/09 foi promover as três a `admin`. A 0337 já aceitava o membro — a trava era só nossa.
  Descartado: deixar a fono escolher Teste/Produção; deixar o membro pareá-lo sem ser o dono.
- 2026-09-16 · id `lite:` repetido tenta `-2`, `-3`… só quando a porta devolve `unique_violation`
  (classe nova `conflito_id`, que não pede recarregar); cada tentativa leva o seu id no payload, e a
  tela usa o id GRAVADO para criar a sessão.
  Motivo: "canal lite:admin-me-escuta ja existe" — uma pessoa não conseguia ter dois números.
  Descartado: ler a lista de canais para deduplicar antes (o membro não enxerga os canais alheios);
  trocar o formato do id (mudaria a chave de conversas que já existem).
- 2026-09-16 · os contadores do topo contam as linhas VISÍVEIS (`contagemDaLista`); "N desligados"
  é quanto está escondido. O seletor de pessoa passa `items`, senão o Base UI mostra o UUID.
  Descartado: contar "não oficiais" sobre todos — o topo dizia o que a lista não mostrava.
- 2026-09-16 · o número pessoal é de QUEM CADASTRA, para todo papel, e o painel é só o aviso de ban e
  o botão (D116). `registrarMeuNumero()` não recebe nada do cliente: papel, uid, nome e e-mail vêm do
  servidor e `formNumeroPessoal` decide (produção, sem número, sem departamento — a 0348 tirou a
  exigência). Nome truncado em 60; sem nome utilizável, o início do e-mail. `registrarCanal` passa a
  recusar não oficial e fica só para o oficial.
  Motivo: "o numero é da pessoa e ela só registra" — o formulário tinha quatro campos de burocracia.
  Descartado: admin escolher o dono; o departamento pela lotação (as fonos admin não têm); o campo
  Número (o runtime gravar o número no pareamento virou card); prévia do id na tela (exigiria o nome
  no cliente).
- 2026-09-16 · "Adicionar número" abre SEMPRE o painel lateral, e a primeira tela dele é o seletor
  (oficial × não oficial); o formulário do oficial mora no painel (`form-numero-oficial.tsx`) e o
  bloco inline da tabela saiu. "Não oficial" registra na hora; a fono (`momentoInicialDoPainel`) não
  vê o seletor e o painel já abre gerando. "Gerando o QR…" até o primeiro QR (`telaDoQr`), e a
  releitura é de 1 s enquanto o QR não chegou (depois 5 s).
  Motivo: pedido do Diogo com print ("aviso ridículo"); e o QR levava ~10 s — medido: WuzAPI gera
  0,7 s depois do `connect`, a primeira leitura saía antes e a próxima só em 5 s.
  Descartado: manter o aviso de ban separado (o risco está na própria opção); o oficial abrir o
  bloco inline (dois lugares para o mesmo botão); seletor com "Oficial" desabilitado para a fono.
- 2026-09-16 · "Remover conexão" no dropdown do canal: gestão remove qualquer canal, membro só o
  próprio (`podeRemoverCanal`). Para canal `lite:`, a action chama `desconectarNoRuntime` ANTES de
  emitir `canal_removido`. A readback confere o ledger (`EXCECOES` com `conferirLedger: true`),
  porque a view filtra o canal removido e a projeção lida voltaria vazia.
  Motivo: a fono precisa poder desconectar o próprio número; a gestão precisa poder desconectar qualquer um.
  Descartado: DELETE real (FK cascade quebraria conversas); desconectar pelo runtime (sem mudança de código — o reload periódico já descarta canais sem credencial).
- 2026-09-16 · teardown (DELETE /lite/instancia/:canal) antes de canal_removido — a ordem importa porque a 0349 apaga a credencial na projeção, e sem ela o runtime não sabe qual instância apagar (`03febdb`). Limite de tentativas de registrarComIdLivre elevado de 5 para 100 — o teto de 5 era artificial e impedia orgs com mais de 5 fonos.
  Descartado: limite 200 (desperdício); sem limite (loop infinito num bug de unicidade).

## feature: funil

O que faz: board Kanban com arraste de cards entre etapas, incluindo terminais (Venda ganha / Venda perdida). NÃO é dona de moverCardEtapa (server action), do diálogo de motivo de perda, nem de filtros/busca.

### Decisões

- 2026-09-16 · `decidirAlvo` extraída para `lib/funil/decidir-alvo.ts` como função pura (testável em Node sem DOM). O snapshot agora grava `topo`/`base` de cada coluna e `scrollLeft` do trilho. Quando X bate em mais de uma coluna (terminais empilhados), Y desempata; X é ajustado pelo delta de scroll entre snapshot e momento do hit-test.
  Motivo: dois bugs — (1) `find()` por X retornava sempre o 1º terminal, "Venda perdida" nunca era alcançado; (2) auto-scroll mudava a posição visual das colunas mas o snapshot ficava stale.
  Descartado: re-snapshot a cada frame (causaria flicker por instabilidade de midpoints); lib externa de drag (já descartada na v5).
- 2026-09-16 · Venda ganha só move, sem diálogo. Igual ao Kommo.
  Motivo: decisão do Diogo — escopo mínimo, portões de transição (W1) ficam para card separado.
  Descartado: diálogo de confirmação; diálogo que pede valor da venda.
- 2026-09-16 · Busca 9º dígito: `variantesNonoDigito` decide pela CONTAGEM de dígitos (10 = sem 9, 11 = com 9), não pelo valor do 3º dígito. Motivo: "3196890099" tem "9" na posição 2, mas é um número de 10 dígitos sem o nono — decidir pelo caractere geraria a variante errada. Descartado: heurística pelo valor do dígito; normalização na gravação (banco guarda o que a Meta manda).

## Contra regressão (E-449, 16/09/2026) — vale para toda mudança aqui

- **Sem causa medida, não há conserto nem deploy.** Primeiro log, dado ou reprodução; "tentar e ver" em produção é proibido.
- **O teste vermelho escrito antes cobre também** os caminhos de erro das chamadas externas (404, 401, 5xx, timeout, "já não existe") e o que o conserto pode quebrar ao lado.
- **Ação destrutiva nasce com o desfazer.** Apagar em produção começa listando o que vai sair, cruzado com o banco.
- **Antes de pedir deploy:** CI verde no SHA, `revisor-de-codigo` no diff, SHA anterior anotado para rollback, e o estado de produção conferido antes e depois. **Um deploy por hipótese**: se não resolveu, volta primeiro.
- **Um clone, uma sessão.** Alteração que não é sua no `git status` → pare e pergunte.
- **Documenta só depois de validado.**
