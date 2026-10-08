# Backlog priorizado

Documento canônico do que falta. Substitui `backlog.md`, que agora aponta para
cá.

**Dificuldade:** ▁ baixa (horas) · ▃ média (1–2 dias) · ▆ alta (uma semana ou mais).

Identificadores (`A1`, `M7`…) são **estáveis**: um item concluído sai da lista e
vai para "Débitos já quitados", deixando lacuna na numeração em vez de renumerar
os vizinhos — outros documentos citam esses códigos.

---

## Alta prioridade

**C1 — popular o catálogo oficial licenciado.** ▆ A fundação de código saiu em
D-102: extrator Access, parser do ProductConfig, bundle verificado, identidade
externa, dry-run/import e cutover seguro. Falta a etapa de dados, que não pode
ser feita dentro do runner Linux da CI: rodar o extrator numa máquina Windows
com ACE/Jet sobre os `data.gdb`, reconciliar L1/L2/L3 e verticais por
identidade/GRUID, revisar o mapeamento para o contrato canônico, hospedar o ZIP
em URL privada e executar o runbook de
[`18-catalogo-oficial-granta.md`](18-catalogo-oficial-granta.md). **Não é
pendência de arquitetura nem autorização; é execução da extração/reconciliação
dos bytes licenciados.**

**C2 — fechar o portão de licença das fontes abertas (D-103, rascunho).** ▁
Nenhum dado pode ser coletado antes. Pendências do autor, detalhadas em
[`catalogo/fontes.md` §7](catalogo/fontes.md):

- **C0:** abrir diretamente as páginas de licença do Materials Project, da
  Wikidata e de cada item JARVIS-DFT no figshare, arquivar cópia datada em
  `catalogo/autorizacoes/evidencias/` e promover as linhas a APROVADA (a sessão
  de 07/10/2026 teve a leitura direta bloqueada).
- **Materials Project:** escrever ao suporte antes de um download grande.
- **"Calculado":** decidir como o dado DFT é marcado (enum, valor suplementar
  ou rótulo da fonte) — fecha o rascunho do D-103.
- **SRD 144, MIL-HDBK-5J, CC BY-SA:** decisões de política (§4.3, §4.4, §4.7).
- **Granta:** arquivar em `catalogo/autorizacoes/` o documento de autorização
  de uso e redistribuição, cobrindo os itens de `fontes.md` §6.

**S3 — as cadeias de CVE que nenhum upgrade fecha.** ▃ O S2 (ver "Débitos já
quitados") derrubou o `npm audit` de 27 para **14** achados e fechou as duas
cadeias que tinham caminho de upgrade. As três que sobraram **não têm versão
corrigida publicada**, e por isso são acompanhamento, não tarefa:

- **`plotly.js` → `maplibre-gl` (2 críticos).** *XSS sanitizer bypass*
  ([GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579)),
  que atinge `maplibre-gl <= 6.4.0`. O `plotly.js` 3.7.0 depende de
  `maplibre-gl ^4.7.1`, e nem a 4.1.0 do Plotly ajuda: ela pede `^5.24.0`,
  ainda dentro da faixa vulnerável. O `fixAvailable` do npm aponta
  `plotly.js@2.34.0`, que é **downgrade de major** — a mesma armadilha do
  `@lhci/cli`, e pela mesma razão: a versão sugerida é anterior à que
  introduziu a dependência.

  **Medido: o código vulnerável não chega ao navegador.** O Plotly é montado à
  la carte (`lib/plotly-custom.ts` registra `bar`, `box`, `heatmap`, `scatter`
  e `scatterpolar`), e nenhum traço de mapa entra no pacote. Numa build de
  produção com 22 chunks, `Plotly` aparece em 2 deles e `maplibre` em
  **nenhum** — controle positivo feito junto, para que o zero não fosse o zero
  de um diretório vazio. Reavalie **se um sexto traço for registrado**: um
  `scattermap` ou `choroplethmap` puxaria o maplibre para dentro do pacote e
  transformaria isto num problema alcançável em produção.
- **`@lhci/cli` (9 achados).** A 0.15.1 — a mais nova — ainda depende de
  `tmp ^0.1.0`, `uuid ^8.3.1` e `inquirer ^6.3.1`, todos em faixa vulnerável.
  Só roda no job de Lighthouse.
- **`express`/`qs` (2 moderados).** Presos dentro do próprio `@lhci/cli`.

**Débito de lint aberto pelo S2 — quitado (P4).** ▁ Os seis pontos de
`react-hooks/set-state-in-effect` foram corrigidos e a regra voltou a `error`,
que é o que o débito pedia. Cinco viraram ajuste durante a renderização / estado
derivado (semeadura de seleção padrão em `/app/comparar`, `/app/mapas` e
`/app/painel`, a queda de log para linear do B8 e o fechamento da gaveta do
D-37). O sexto, o `ThemeToggle`, era de outra natureza e ganhou outra correção:
a preferência de tema mora em `localStorage`, que é fonte **externa** ao React,
e o certo ali é `useSyncExternalStore` — que resolve os dois renders e traz o par
de snapshots que preserva a hidratação (servidor devolve `null`, nada é pintado
antes de montar). O clique agora escreve na fonte e a fonte notifica; não sobrou
`setState` nenhum no componente. Resta 1 aviso de
`react-hooks/incompatible-library` no `MaterialForm.tsx` (o `watch()` do
react-hook-form não é memoizável) que é informativo e não tem correção local.

A6 (Cérebro em `main`) foi decidido, não executado: ver "Débitos já
quitados".

---

## Média prioridade

**Funcionalidades inspiradas no Total Materia (D-103).** Recursos observados
só nas páginas públicas do produto ([`catalogo/fontes.md`
§5.2](catalogo/fontes.md)); nenhum conteúdo dele é copiado e nenhum dado vem
dele. Cada item é desenhado com dado de fonte APROVADA e passa pelas regras de
sempre (princípios 1 a 4, D-24, ADR 0004).

- **TM1 — equivalência de designações entre normas.** ✔ Mecanismo entregue
  (D-115, Sessão 70): grupo de equivalência com tipo (equivalente, aproximada,
  similar), fonte obrigatória e membros ligados a designações; escrita só do
  curador; seção "Equivalências" na ficha; nunca inferida por nome ou código
  (o "parecido" segue sendo o Find Similar, D-63). **Só há dado demo**
  (`seed_demo_equivalences`, 5 grupos fictícios). Resíduos: (a) **dado real**,
  bloqueado até haver fonte APROVADA em `docs/catalogo/fontes.md` que publique
  equivalências (nenhuma está; condição C0); (b) o bundle do D-102 ainda não
  aceita `equivalences.ndjson`; (c) não há tela de edição — o curador usa a API
  (`/api/equivalencias`); (d) a busca (`norma:`/`designacao:`) não expande por
  equivalência, de propósito: seria inferir.
- **TM2 — busca por composição química e por designação.** ✔ Entregue (D-105,
  Sessão 60); resíduos abaixo.
- **TM3 — comparação de muitos materiais.** ▃ Ampliar o comparador para dezenas
  de registros, com composição e propriedades lado a lado, mantendo a tabela
  como alternativa textual de toda figura (D-31).
- **TM4 — curvas dependentes de temperatura e taxa.** ✔ Entregue (D-106,
  Sessão 61); resíduos abaixo.
- **TM5 — exportação para formatos CAE/CAD.** ✔ Entregue (D-104, Sessão 59);
  resíduos abaixo.
- **TM6 — referência por valor visível e filtrável.** ▁ A proveniência já
  existe; falta mostrar a contagem de referências por registro e um filtro
  "só valores com referência bibliográfica".
- **TM7 — o que mudou entre releases.** ✔ Entregue (D-108, Sessão 63);
  resíduos abaixo.

**Resíduos das mudanças entre releases (TM7, [D-108](DECISIONS.md)).** O TM7 foi
entregue (ver "Débitos já quitados"); ficou de fora, de propósito:

- **TM7-a — promover uma release.** ▆ O importador cria `Material` novo a cada
  release e **nunca desativa** a release anterior: depois da segunda importação
  as duas ficam ativas lado a lado, com registros em dobro no catálogo. Falta a
  ação administrativa que, ao vigorar a release nova de uma linha, ponha
  `is_active=False` na anterior e nos materiais dela (nunca `DELETE`). E a
  **segunda release com processos falha** por colisão de slug ("Slug de
  processo … já existe sem identidade externa deste dataset"): o importador não
  reaproveita o processo da release anterior (o modal reaproveita pelo slug e
  ganha uma ref nova). Nenhum dos dois é corrigido pelo TM7.
- **TM7-b — imutabilidade no banco.** ▃ Um curador pode editar valor de material
  oficial pela API de materiais; o diff lê o que está gravado e passaria a
  refletir a edição. Proposta: recusar edição de material com `CatalogRecordRef`
  ou marcar "editado após a importação" a partir da auditoria.
- **TM7-c — outros universos no diff.** ▃ O diff cobre **só materiais**:
  processos, modais, valores suplementares, valores do dataset, composição,
  designações e curvas ficam de fora.
- **TM7-d — desempenho.** ▁ O diff é **recalculado a cada requisição** (duas
  consultas por release, tudo em memória). Com o catálogo Granta inteiro
  (milhares de registros × dezenas de propriedades) pode passar de segundos;
  materializar no import se medir lento. O CSV/XLSX não pagina. A rota de um
  só registro também monta o diff inteiro e devolve um item (achado da revisão).
- **TM7-e — `is_active` não entra no diff.** ▁ Um registro presente nas duas
  releases que passa de ativo para inativo sai como "inalterado", porque
  `is_active` não está em `TEXT_FIELDS`. Hoje o importador sempre grava `True`;
  entra junto com o TM7-a, que passa a desativar a release anterior.
- **TM7-f — faixa com `normalized_value` só de um lado.** ▁ Comparar o
  representativo de uma faixa que tem `normalized_value` de um lado e nada do
  outro compara número com `None` e produziria uma "mudança de valor" falsa. O
  importador não gera esse caso hoje.
- **TM7-g — grafia da unidade e defesa em profundidade.** ▁ `kg/m^3` contra
  `kg/m³` conta como "só a escrita da fonte" (coerente com o nome da natureza;
  documentar na tela). Propriedade sem definição levanta `ValueError` (500) em
  vez de `ValidationError`; a chave estrangeira impede hoje.

**Resíduos da composição e das designações (TM2, [D-105](DECISIONS.md)).** O
TM2 foi entregue (ver "Débitos já quitados"); ficou de fora, de propósito:

- **TM2-a — editar composição e designações.** ▃ Hoje só o seed demo e o bundle
  oficial escrevem as duas tabelas. Falta API e formulário, com auditoria (M2),
  `require_catalog_curator` no compartilhado (D-83) e o registro próprio (D-62).
- **TM2-b — composição como estágio de seleção.** ▃ Um estágio `limit` sobre
  elemento, no motor, no funil e no laudo, pela mesma regra de alcance em três
  valores (`app/domain/composition.evaluate`).
- **TM2-c — % atômica e composição por condição.** ▆ Converter % atômica exige
  a composição inteira e as massas atômicas (cálculo, não unidade); composição
  por estado (fundido × laminado) pede chave de condição. Até lá ficam fora, ou
  em `CatalogSupplementalValue` se vierem no bundle.
- **TM2-d — composição nas exportações e no comparador.** ▃ CSV/XLSX/relatório
  e MatML (`ChemicalComposition`) ainda não a levam; o comparador amplo é o TM3.
- **TM2-e — dados reais.** ▁ Nenhum registro real tem composição ou designação:
  dependem do bundle do D-102 (C1) ou de fonte aberta APROVADA (C2, D-103).

**Resíduos das curvas (TM4, [D-106](DECISIONS.md)).** O TM4 foi entregue (ver
"Débitos já quitados"); ficou de fora, de propósito:

- **TM4-a — dados reais.** ▁ Só o demo (117 curvas fictícias, D-107) tem curva; o resto
  depende do bundle do D-102 (`material_curves.ndjson`) ou de fonte aberta
  APROVADA (D-103). A tela já mostra "Nenhuma curva cadastrada" com a contagem
  por tipo.
- **TM4-b — ler um valor de uma curva.** ▆ "Valor a 20 °C" por interpolação ou
  outra regra declarada, com referência ao dado original (docs/18 §6). Hoje
  nada é interpolado, extrapolado nem reamostrado.
- **TM4-c — histerese, curvas não monotônicas e eixos fora da lista.** ▃
  Continuam em `CatalogSupplementalValue` até haver tipo.
- **TM4-d — edição pela API e pela interface.** ▃ Com auditoria (M2),
  `require_catalog_curator` no compartilhado (D-83) e o registro próprio (D-62);
  hoje só o seed demo e o bundle escrevem.
- **TM4-e — escolher a unidade do parâmetro da família.** ▁ Hoje sai na
  convenção da grandeza (°C para temperatura); a legenda da tela a repete.
- **TM4-f — nova grandeza de eixo exige migração.** ▁ A lista de grandezas
  (`QUANTITIES`, 8) está escrita por extenso no `CHECK` da migração
  `0925e0787863`; acrescentar uma grandeza sem migração nova deixa modelo e
  banco divergentes. Achado da revisão do TM4.
- **TM4-g — curvas duplicadas depois de um segundo cutover.** ▃ Uma release nova
  de outro dataset acrescenta curvas sem aposentar as da release anterior do
  mesmo material (o mesmo padrão dos valores globais), e a ficha pode listar a
  curva duas vezes. Decidir a regra de aposentadoria junto com o cutover.
- **TM4-h — folga do eixo em °C/°F.** ▁ `_padded` não passa de zero na unidade de
  leitura; num eixo de temperatura, dados de 20 a 600 °C começam em 0 °C. Só
  estético, nenhum ponto se perde.
- **Dependência TM5-b:** a curva plástica dos decks de CAE lê `material_curve` e
  pede regra declarada de conversão engenharia → verdadeira e de origem da
  deformação plástica — ver TM5-b abaixo.

**Resíduos do cartão para CAE (TM5, [D-104](DECISIONS.md)).** O TM5 foi
entregue (ver "Débitos já quitados"); ficou de fora, de propósito:

- **TM5-a — os três slugs que o cartão lê e o catálogo ainda não define.** ▁
  `coef_poisson`, `coef_expansao_termica` e `calor_especifico` são o contrato
  do `app/exporters/cae/quantities.py`; enquanto não existirem (criados por quem
  cura o catálogo ou trazidos pelo bundle do D-102, com unidade canônica
  compatível), os decks de MAPDL, Abaqus, Nastran e LS-DYNA recusam todo
  material por falta de ν e só o MatML sai. Não semear definição vazia: ela
  ficaria em ~0 % no painel (a objeção do D-69).
- **TM5-b — curva tensão-deformação plástica e dados dependentes de
  temperatura.** ▆ `*PLASTIC` (Abaqus), `TB,MISO`/`MPTEMP`/`MPDATA` (MAPDL),
  `MATS1`/`TABLES1` (Nastran), `*MAT_PIECEWISE_LINEAR_PLASTICITY` (LS-DYNA).
  Depende do modelo do TM4 (D-106, entregue): a curva vem de `material_curve`,
  mas não entra em cálculo nem em exportação até haver regra determinística de
  conversão engenharia → verdadeira e de origem da deformação plástica.
- **TM5-c — XML do Engineering Data do Ansys Workbench.** ▃ Não feito: o
  formato é um dialeto do MatML com metadados próprios, e a documentação pública
  acessível nesta sessão não bastou para escrevê-lo sem copiar um arquivo
  exportado — o que a regra do D-104 proíbe.
- **TM5-d — cartões térmicos.** ▃ Condutividade e calor específico no `MAT4`
  do Nastran e num material térmico do LS-DYNA; hoje são declarados "fora deste
  cartão" no comentário.
- **TM5-e — validar os arquivos num solver.** ▁ Os golden files foram escritos
  a partir da documentação pública, sem rodar MAPDL, Abaqus, Nastran nem
  LS-DYNA, e sem validar o MatML contra o XSD 3.1 (rede bloqueada). Abrir cada
  um num solver licenciado (ou num validador de esquema) e registrar o
  resultado no D-104.

---

## Baixa prioridade

**Cérebro em produção — pendências deixadas pelo D-101.** Nenhuma bloqueia o
uso; as três primeiras são decisão ou conferência do autor.

- **As 120 cópias idênticas na árvore.** ▁ 17 PDFs da raiz de `Cérebro/` repetem
  `01-`, `04-` e `05-`, e a pasta
  `Fichas descritivas de materiais - Granta Edupack - Nível 2/` inteira repete
  `03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/`. A ingestão já as indexa uma vez
  só (fica a cópia declarada no manifesto), e desde a revisão final do D-101
  uma `ingerir` nem as baixa do LFS; tirá-las do git não muda o RAG: muda o
  tamanho do clone e o que o leitor da pasta vê. Decisão do autor — e um `git rm` não as tira do
  histórico nem do armazenamento LFS. Eram 18 na raiz até 06/10/2026: a
  cópia do Ashby em português que saiu foi junto com ele (D-101), e só ela —
  as outras continuam esperando esta decisão.
- **Documento que falhou é baixado de novo a cada `ingerir`.** ▁ O plano do
  LFS só poupa o que está `EXTRAIDO` com os mesmos bytes; um `FALHOU` (um PDF
  digitalizado, `SEM TEXTO`, inclusive) é baixado e lido de novo, como sempre
  foi lido de novo. Se o Cérebro tiver digitalizados grandes, isso pesa na
  banda de LFS do mês (o `[lfs] baixar …` diz quantos MB). Saída possível:
  tratar um `FALHOU` com os mesmos bytes como falha conhecida, sem baixar,
  com `--force` para tentar de novo — decisão do autor, porque é declarar a
  falha permanente.
- **Confirmar os limites do Neon e a memória do Fly.** ▁ O D-101 supôs 0,5 GB de
  armazenamento e 5 GB de transferência por mês no Neon gratuito; confira no
  painel do Neon. Depois da primeira consulta com a IA real, olhe a memória da
  máquina no painel do Fly — o medido foi ≈100 MB por processo a 18 mil trechos,
  numa VM de 512 MB.
- **Reembedar as fontes antigas dos Cadernos.** ▁ Os vetores gravados antes do
  D-101 têm 3072 dimensões (o tamanho nativo do `gemini-embedding-001`) e a
  pergunta agora é embedada com 768: a busca semântica os ignora, e aquelas
  fontes são achadas só por palavras. O `status` do workflow do Cérebro mostra
  quantos são ("cadernos: … ficam fora da busca semântica"). Um comando que os
  reembede, dentro da cota, na forma do `app.knowledge.embed`.
- **Quantização int8 dos vetores.** ▁ Alavanca guardada, não pendência: os
  vetores em `array('f')` ocupam ≈58 MB residentes a 18 mil × 768; em int8,
  um quarto disso. Só vale se a memória do Fly apertar.

**Cadernos — pendências deixadas pela fase 4 (D-98).** Nenhuma bloqueia o uso.

- **A voz pt-BR depende do aparelho do aluno.** ▁ O áudio e o vídeo falam pelo
  `speechSynthesis` do navegador, e a oferta de vozes pt-BR muda com o sistema:
  o Windows tem vozes naturais, macOS, Android e iOS variam, e o Chromium
  *headless* não tem nenhuma — por isso a CI só exercita o motor falso
  (`lib/testing/fakeSpeech.ts`). A tela já diz quando usou outra variante de
  português ou quando não há voz. Falta conferir ao vivo num Android e num
  iPhone (o `playLine` existe para o gesto do iOS) e registrar o que se ouviu.
- **Sem MP3 nem MP4, por decisão.** A Web Speech API não entrega o áudio que
  produz, e um TTS no servidor ou é pago ou não cabe na máquina do Fly. O que
  se baixa é o roteiro (DOCX/TXT) e o deck com a narração nas notas (PPTX).
  Reavalie só se aparecer um TTS gratuito que rode no servidor sem conta com
  forma de pagamento.
- **Conferir ao vivo os downloads por URL de blob no Safari/iOS.** ▁ Desde o
  lote de pendências, os gráficos baixam PNG e SVG pelo mesmo caminho do
  Estúdio (`lib/rasterize.ts`, `downloadBlob`, URL revogada em 30 s), e não mais
  por URL `data:`. Os testes usam jsdom; falta baixar um gráfico e um
  infográfico num iPhone e num Safari de desktop e registrar o que aconteceu. O
  `xmlns` duplicado que o compositor de figuras emitia também só foi reproduzido
  no jsdom — a correção é inócua em qualquer navegador, mas não se sabe se
  algum deles duplicava.
- **O dia do deploy do lote de pendências deixa passar algumas gerações a
  mais.** ▁ Aceito, sem código. Uma geração do Estúdio que estava rodando no
  momento do deploy nasceu no modelo antigo, que contava no sucesso, e por isso
  nunca reservou unidade; o deploy reinicia a máquina, ela fica presa e é
  descontada como `slack` de um contador que nunca a teve. Resultado: no
  máximo `NOTEBOOK_STUDIO_IN_FLIGHT` gerações a mais naquele dia, e apagar uma
  delas devolve uma unidade que não foi tirada (o contador nunca fica abaixo de
  zero). Some sozinho no dia seguinte.

**Cadernos — pendências deixadas pela fase 3 (D-97).** Nenhuma bloqueia o uso;
cada uma tem o motivo de ter ficado de fora.

- **Transcrição automática do YouTube.** ▆ Hoje é impossível sem custo: desde
  2025–26 o endpoint de legendas exige um token *Proof-of-Origin* que só o
  BotGuard de um navegador gera, e responde 200 vazio sem ele; IP de datacenter
  é bloqueado. As saídas conhecidas (navegador *headless*, serviço pago)
  quebram o custo zero. O aluno cola a transcrição. Reavalie só se o YouTube
  voltar a servir legenda sem o token.
- **Trafilatura no lugar do extrator de HTML.** ▁ `app/notebooks/html_text.py`
  é o ponto único de troca, com a assinatura `extract_html(data, charset) ->
  (title, ExtractedText)`. Troque se a qualidade da extração em páginas reais
  não bastar. A regra de descartar nós ocultos (defesa contra injeção de prompt)
  tem de sobreviver à troca.
- **Conferir ao vivo as "Sugestões da Pesquisa Google".** ▁ Quando
  `WEB_SEARCH_PROVIDER=gemini` for ligado em produção, faça uma busca no modo
  Web e confirme que a faixa de sugestões aparece legível na moldura isolada
  (sem script) e que uma ficha abre a pesquisa numa aba nova. O formato do HTML
  do Google foi deduzido da documentação, porque os testes não têm rede, e os
  termos do *grounding* exigem que ele seja mostrado. Se as fichas precisarem de
  script, a saída é `allow-scripts` **sem** `allow-same-origin`, nunca as duas
  juntas. Passo a passo em [13-deploy.md §5-sexies](13-deploy.md).
- **CSS inline que o extrator lê a mais** (D-99, N-6). ▁ O outro lado de ler só
  o inline: uma coluna sob um `font-size:0` de layout que volta ao tamanho
  legível por **classe** de folha de estilo, ou por um `var()` que só a folha
  declara, herda o 0 e é descartada; o navegador a mostra. E os orçamentos do
  leitor (8 KB e 64 declarações comuns por atributo, 4096 declarações de
  propriedades personalizadas em escopo, o trabalho de expansão por página)
  descartam o nó que os passa, visível ou não. Os dois erram para o lado de
  tirar texto, e um teste fixa cada um.

**B11 — a unidade canônica impressa como o Pint a escreve — quitado (P4).** ▁
`app/calculations/units.py` ganhou `pretty_unit()`, e o `export_service` o aplica
nas tabelas do relatório, nas do laudo, na folha de proveniência e nos rótulos de
eixo do mapa — os dois lugares de uma vez, que era o ponto: consertar só o eixo
deixaria a figura discordando da tabela ao lado.

**Uma coisa deliberadamente não é embelezada: o método de conversão.**
`identity:kg/m**3` e `pint:GPa->Pa` permanecem exatos, e um teste fixa isso. O
docstring de `to_canonical` promete que aquele campo é **reproduzível** — é o
trilho de auditoria, não texto de leitura —, e o Pint não sabe ler `kg/m³` de
volta. Só a unidade de **exibição** é embelezada.

A linha `Unidades de exibição` da matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md) mede a **outra** metade:
se o usuário pode *escolher* a unidade de leitura (MPa em vez de Pa). Eram duas
perguntas dividindo o mesmo rótulo, e a segunda foi fechada depois pelo
[D-70](DECISIONS.md) — a linha está em **3** e a matriz em 32 de 32.

---

## Entidades ainda não modeladas

`GeneratedReport`, e nada mais de estrutural no roteiro imediato. Aguarda
especificação de caso de uso. (`User` e `Project` saíram desta lista com A5;
`AuditEvent` saiu com M2; `SavedChart` saiu com B7 — salvar e reabrir
configurações de mapa; `SelectionStage` saiu com P0-1; `Process`,
`ProcessClass` e `MaterialProcess` saíram com P0-2;
`ProcessAttributeDefinition` e `ProcessAttributeValue` saíram com P0-4; `TransportMode` saiu com o Eco Audit e `BatteryChemistry` com o Battery Designer — as duas na mesma forma, vocabulário fechado e semeado fora dos dois universos.)

**Nada de estrutural pendente no roteiro imediato, e a faixa P1 fechou.** Os
quatro gargalos P0 estão entregues, mais o P1-1 (busca), o P1-2 (Chart Stage), o
P1-3 (browse) e o P1-4 (`My Records`) — este último o que mexeu na fronteira que
o D-42 estabeleceu, e o único da faixa a mexer nela. O **P2**, a **P3**, o
**Battery Designer** (P4) e o **DOCX** (P4 restante) saíram em seguida, e a
**unidade de leitura** ([D-70](DECISIONS.md)) fechou a última linha abaixo do
corte: a matriz está em **32 de 32** (3,59 de nível médio). O que resta em cada
linha não é capacidade ausente, é profundidade — a lista de "faltam" de cada uma
continua lá, e a métrica para de medir no 3.

---

## Débitos já quitados

Registrados para não voltarem por engano:

- ~~**TM7 — o que mudou entre releases (Sessão 63, [D-108](DECISIONS.md))**~~ —
  `catalog_dataset.lineage` (a que catálogo a release pertence, do manifest,
  sem backfill) e `is_demo` (migração `73a9b5da72b2`); diff derivado do que cada
  release gravou, casado pela identidade externa e comparado no canônico, com a
  natureza da mudança (valor, presença, forma, só a escrita da fonte,
  metadado); `GET /api/catalogo/releases[/…/diff/…]`, CSV/XLSX; `clear_demo`
  apaga releases fictícias; na interface, `/app/catalogo/releases` (resumo,
  filtros, lista paginada, detalhe campo a campo, estados escritos,
  "Exportar ▾", tudo na URL) e duas releases demo (`seed_demo_releases`,
  chamadas por `seed_extended`). Resíduos TM7-a a TM7-d em "Média prioridade".
- ~~**Demo completo — designação, composição e curva para os 75 materiais demo (Sessão 62, [D-107](DECISIONS.md))**~~ —
  156 designações `DEMO-…`, 380 linhas de composição (resto e ausente declarados,
  nunca calculados) e 117 curvas derivadas das propriedades de cada material
  (família por temperatura nos metais, ruptura frágil em cerâmica e compósito,
  elastômero hiperelástico), todas `is_demo`, em `seed_extended` (`semear_demo`),
  idempotente e coberta por `clear_demo`; `python -m app.db.demo_coverage` lista
  quem tem o quê e a razão de cada ausência (só a Cerâmica Demo D fica sem curva).
  Resíduo: **DC-a** — o demo não exemplifica mais "material sem composição" no
  catálogo estendido (o estado vazio segue testado por unidade e na Cerâmica Demo
  D, sem curva).

- ~~**TM4 — curvas dependentes de temperatura e taxa (Sessão 61, [D-106](DECISIONS.md))**~~ —
  `MaterialCurve`/`MaterialCurveSeries`/`MaterialCurvePoint` (figura → série →
  ponto, `CHECK`s de finitude e de faixa, fonte obrigatória, migração
  `0925e0787863`); geometria e unidade de leitura no backend
  (`GET /api/materials/{id}/curvas[/{curva}]`); CSV/XLSX; importador do D-102;
  demo fictício (3 curvas) e `clear_demo`; na ficha, a seção Curvas com gráfico
  SVG próprio (família por cor, traço e marcador, faixa, `ChartTooltip`),
  unidade e escala na URL, tabela de pontos (D-31) e "Exportar ▾". Resíduos
  TM4-a a TM4-e em "Média prioridade". 4079 → 4164 testes de backend e 797 →
  815 de frontend.

- ~~**TM2 — busca por composição química e por designação (Sessão 60, [D-105](DECISIONS.md))**~~ —
  `MaterialDesignation` e `MaterialCompositionEntry` (% em massa, resto e
  ausente sem número por `CHECK`, fonte obrigatória, migração `0d3c39eb2f81`);
  `comp:`, `norma:` e `designacao:` na linguagem do D-55, com a composição lida
  por alcance em lógica de três valores — ausência não passa, nem sob `NOT`, e é
  contada; `GET /api/materials/busca` com o relatório; ficha com as seções
  Composição química e Designações; ajuda da busca no catálogo; contrato do
  bundle oficial; demo fictício com prefixo `DEMO-` e `clear_demo` cobrindo as
  duas tabelas. Resíduos TM2-a a TM2-e em "Média prioridade". 3938 → 4079 testes
  de backend e 783 → 797 de frontend.
- ~~**TM5 — exportação para formatos CAE (Sessão 59, [D-104](DECISIONS.md))**~~ —
  `GET /api/exports/materiais/{id}/cae?formato=…&unidades=…` e o item "Cartão de
  material para CAE…" no "Exportar ▾" da ficha. Cinco renderizadores em
  `app/exporters/cae/` (MAPDL, MatML 3.1, Abaqus, Nastran `MAT1`, LS-DYNA
  `*MAT_ELASTIC`), escritos a partir da documentação pública; três sistemas de
  unidades consistentes, convertidos só pelo Pint a partir do canônico;
  ausente omitido com "não cadastrado", nunca 0; recusa 422 quando falta o
  mínimo do formato; aviso de limitação, proveniência e marca de fictício em
  todo arquivo; escape por formato; visibilidade do D-62 coberta pelo canário.
  Resíduos em "Média prioridade" (TM5-a a TM5-e). 3864 → 3938 testes de backend
  e 778 → 783 de frontend.
- ~~**A7 — Execução do Cérebro no RAG de produção concluída (D-101)**~~ —
  executada com sucesso pelo autor em produção (Neon) via GitHub Actions (workflow
  Base de conhecimento, ação `ingerir` e indexação de `Links.md`, com as remoções
  já aplicadas via `admin-banco.yml`). A pendência operacional A7 do roteiro imediato
  está encerrada. Os procedimentos externos de governança fora do código (ticket de
  suporte do GitHub para `refs/pull/*` e objetos órfãos LFS, e atualização de eventuais
  clones anteriores a 30/09/2026) permanecem documentados como guia em
  `docs/17-limpeza-historico-cerebro.md`.
- ~~**Auditoria de Conformidade e Acessibilidade — Frentes 1 a 4 e Mapa de Ashby 2D (Sessão 56)**~~ —
  auditoria técnica rigorosa de alinhamento ao Design System MSDS 2.0 ([D-80](DECISIONS.md) e [D-91](DECISIONS.md)), WCAG 2.1 AA e princípios determinísticos:
  1. **Frente 1 (Eco Audit & Custo):** componentes `PhaseBars.tsx`, cartões de premissa e tabelas comparativas auditados. Padronização formal do seletor de modo ("Individual" vs "Comparativo") em `apps/web/app/app/eco/page.tsx` com `ButtonGroup` e `ButtonGroupItem` (Segmented Control semântico com `role="group"`, `aria-label` e `aria-pressed`), restabelecendo a regra de hierarquia visual de no máximo um botão primário visível por tela (ação principal "Executar auditoria" / "Comparar auditorias").
  2. **Frente 2 (Seleção):** suporte a reordenação por arraste (`StageList.tsx`, `reorderStages`) com alça dedicada `⠿` (`aria-label` via `i18n-extras.ts`), estados visuais dinâmicos de dragover (`ring-2 ring-brand-500 shadow-lift`) e preservação estrita dos botões de incremento/decremento (↑ e ↓) para navegabilidade completa por teclado.
  3. **Frente 3 (Busca Ponderada & Destaque):** busca textual com ranqueamento SQL (`material_repository.py`) e marcação contextual via `HighlightText.tsx` auditados. Destaque sutil com cores semânticas de leitura, preservação de acessibilidade de contrastes e integração nas listas, cartões e catálogo.
  4. **Frente 4 (Solver com Seções Circulares Maciças):** formulação teórica de Ashby para seções circulares em flexão e compressão validada dimensionalmente e numericamente (`load_cases.py`), cobrindo índices de mérito $M_1$ e fatores estruturais exatos com total determinismo e sem inferência de IA.
  5. **Auditoria Técnica do Mapa de Ashby 2D (`AshbyMap.tsx`, `chart_service.py`, `palette.ts`, `figureExport.ts`):** conformidade integral com MSDS 2.0 confirmada:
     - Paleta Okabe-Ito de 8 cores para famílias de materiais (acessível para daltonismo).
     - Exportação SVG e PNG com fontes inline embutidas (`@font-face` Inter / JetBrains Mono) para portabilidade e fidelidade gráfica.
     - Tabela de acessibilidade para tecnologias assistivas (`role="table"`, alternativa acessível ao gráfico interativo).
     - Hierarquia estrita de botões (máximo de 1 primário por contexto, tooltips com atalhos e variantes consistentes).
  Cobertura total de testes preservada: 3857 backend (0 skips na CI) e 778 frontend (100% verdes).
- ~~**Padronização do seletor de modo do Eco Audit com ButtonGroup/ButtonGroupItem (Sessão 55)**~~ —
  auditoria de conformidade com o Design System (MSDS 2.0, [D-80](DECISIONS.md) e [D-91](DECISIONS.md)) identificou que os botões soltos de alternância de modo ("Individual" e "Comparativo") no topo de `apps/web/app/app/eco/page.tsx` usavam variantes de botão soltas (`variant="primary"` e `variant="secondary"`), violando a regra de hierarquia visual (máximo de um botão primário por tela, reservado para a ação principal "Executar auditoria" / "Comparar auditorias"). Substituídos pelo componente padronizado `ButtonGroup` e `ButtonGroupItem` (Segmented Control semântico com `role="group"`, `aria-label` e `aria-pressed`), preservando acessibilidade, semântica e 100% dos testes (3857 backend e 778 frontend).
- ~~**A7, item 4 — Apagar o log público com texto de livro licenciado (D-101)**~~ —
  **feito em 06/10/2026, pelo autor, na interface do Actions** (a execução → ⋯ → **Delete all logs**). Era o log da primeira `ingerir` em produção (execução 37415600025, job 112113411666, passo "Ingerir"), cujo traceback imprimiu o SQL e os parâmetros do `INSERT` — ~1000 trechos de um livro licenciado — num log público. A correção do código (PR #97: os CLIs do Cérebro imprimem só a classe do erro de banco, e o motor tem `hide_parameters=True`) impede o próximo; apagar o log tira o que já estava publicado. **Apagar não desfaz uma cópia** que alguém tenha feito enquanto o log esteve público — da execução, em 06/10/2026 por volta das 04:50 UTC, até a exclusão, no mesmo dia. Os logs redigidos (`--redact`) de `conhecimento_simular_remocao`/`conhecimento_remover` não entram aqui: o autor foi avisado de que apagá-los é opcional, e não há registro de que tenham sido apagados. Para conferir: a página da execução não deve mais mostrar a saída dos passos. O resto da A7 (itens 1 a 3) continua aberto.
- ~~**Revisão do PR #100, segunda rodada: um PDF por vez e relógio no upload (D-101)**~~ —
  os limites de memória do upload eram por leitura: três uploads de 8 KB simultâneos somavam +624 MB na VM de 512 MB. Agora o processo lê um PDF por vez (`_UPLOAD_PDF_SLOT`; o segundo espera 15 s e recebe "tente de novo") — três simultâneos: 247 MB de pico. E a CPU não tinha limite: uma forma já decodificada é lida de novo a cada desenho, sem decodificação que algum orçamento visse (40 desenhos de 0,4 MB, 23 s, num arquivo de 2 KB); o relógio passou a ser conferido a cada parse, e o upload tem 30 s. O pypdf ficou fixado em `<6.20`, e o primeiro upload confere que os medidores são alcançados — se não, todo PDF é recusado, com linha de log. A lista de remoção também recusa os erros sem dois-pontos (espaço, tab, dois-pontos de largura cheia, `sha256 <hex>`) e o caminho escrito com `Cérebro/`, e nenhuma recusa cita mais a linha. Resta, documentado: ~225 MB por um fluxo de operadores no teto, e nenhum fluxo interrompido no meio. Falta ao autor só o **Deploy da API** depois do merge.
- ~~**Revisão do PR #100: orçamento por decodificação e lista de remoção que falha fechada (D-101)**~~ —
  o orçamento do upload só era conferido entre páginas (e nunca depois da última): uma página com 160 formas de 3,9 MB, num PDF de 0,66 MB, chegava a 639 MB na API de 512 MB. Agora todo fluxo que o pypdf decodifica é cobrado na hora (`readers._metered_decoding`, um `ContextVar` que só existe dentro de `read_pdf`; a parada é uma `BaseException`, porque o pypdf engole `Exception` em cada forma): a mesma página é recusada com 76 MB de pico. Medindo isso apareceu o parse de formas aninhadas (+420 MB com duas de 3,9 MB uma dentro da outra), limitado no upload a 4 MB lidos de uma vez (`UPLOAD_MAX_PARSED_BYTES`). **Segurança:** um prefixo mal escrito em `Cérebro/removidos.txt` (`mantido-no-histórico:`, `SHA256:`) virava um caminho que não casava nada e o arquivo seria ingerido e enviado ao Gemini; agora é recusado com o número da linha, e ingestão, plano do LFS, `embed`, `prune`, `status`, gerador do manifesto e o passo 4 do docs/17 param. Também: a regra das páginas de fora ficou proporcional (2 de 3, 2 de 4, 1 de 2 falham; uma página nunca derruba documento de 3+), as recusas de abrir PDF ficaram em português, a recusa do teto por fluxo diz como contornar ("achatar" o PDF), a releitura forçada que falha não diz mais "versão nova" (rótulo `RELEITURA FALHOU`), o prazo de 15 min é conferido a cada decodificação e os "≈600 MB" viraram ≈528 MB. Resta, documentado: um fluxo de operadores no teto de 4 MB custa ~225 MB enquanto é lido, e nenhum fluxo é interrompido no meio (D-101, atualização da revisão do PR #100). Falta ao autor só o **Deploy da API** depois do merge.
- ~~**Os dois Ashby em português (D-101)**~~ —
  `01-Bibliografia/` tinha dois scans de *Seleção de Materiais no Projeto Mecânico*, não byte a byte iguais, e os dois eram indexados (texto em dobro na busca, o dobro de vetores; foram os dois `FALHOU` da segunda `ingerir`). O autor decidiu ficar só com a edição mais nova: fica `Michael Ashby (Auth.)-Seleção De Materiais No Projeto Mecânico (2012).pdf` (4ª ed., 152 MB); saiu `Selecao_de_Materiais_no_Projeto_Mecanico.pdf` (sem data, 103,5 MB) do git e do `manifesto.json`, junto com a cópia byte a byte dele na raiz do Cérebro (que o manifesto não declarava), e os dois entraram em `Cérebro/removidos.txt` pelo caminho (`mantido-no-historico:`, porque não é material a apagar do histórico) e pelo conteúdo (`sha256:` do oid do ponteiro, o mesmo nos dois). Que o de 2012 é a mais nova é **provável, não confirmado**. Reverter: apagar as três linhas da lista e restaurar os dois arquivos e a entrada do manifesto do histórico (D-101, atualização de 06/10/2026). Falta só a execução do autor, no item 3 da A7: `conhecimento_simular_remocao` → `conhecimento_remover` → `ingerir`.
- ~~**Leitura de PDF limitada por documento, não só por fluxo (revisão do PR #98; inclui endurecimento de segurança do upload dos Cadernos)**~~ —
  o teto do pypdf é por fluxo e a memória somava as páginas (as cópias decodificadas ficavam no leitor até a última página): 8 páginas de 150 MB subiam a 1,2 GB, e um upload de 684 KB com 10 páginas de 70 MB custava 783 MB de pico na API de 512 MB. `readers._release_decoded` solta as cópias entre páginas (o mesmo livro fica em ~194 MB); o Cérebro lê com teto de 200 MB (era 500), orçamento por documento (16 GB decodificados, 15 min) e falha um livro com mais de 20% das páginas de fora (e ao menos 3 — regra trocada na revisão do PR #100, acima), parando assim que a conta fecha; o motivo de cada página pulada sai pelo nome da classe; a linha `PÁGINAS IGNORADAS` virou anotação `::warning::`; o `status` deixou de chamar esses livros de `VERSÃO ANTERIOR`; e `conhecimento.yml` ganhou `forcar` (só com `arquivos`) para reextrair. **Segurança:** o upload lê com 4 MB por fluxo, 32 MB por arquivo e o limite de páginas conferido antes de decodificar — um aluno autenticado não derruba mais a API com um PDF de 15 MB (D-101, atualização da revisão do PR #98; uma página só ainda passava do orçamento, fechado na revisão do PR #100, acima). Resta, documentado: uma página patológica de operadores não é interrompida no meio (só um subprocesso com `RLIMIT_AS` o faria), e o orçamento do upload ainda custa até ~1 min de CPU.
- ~~**Eco Audit com barras de energia/carbono por fase e reordenação por arraste em seleção (Opções 1 e 2 - Sessão 48)**~~ —
  implementação e integração completa das Opções 1 e 2:
  1. **Eco Audit — Barras por fase (Opção 1):** novo componente `PhaseBars.tsx` (`apps/web/components/eco/PhaseBars.tsx`) renderizando barras horizontais semânticas e acessíveis (`role="figure"`, `role="meter"`) para as cinco fases do ciclo de vida em energia (MJ) e carbono (kg CO₂), tanto no modo individual quanto no comparativo lado a lado (Material A vs B), com helper puro `calculateBarWidth`, tratamento explícito de dados ausentes e badge verde `(crédito)` para valores negativos; integrado em `apps/web/app/app/eco/page.tsx` com 10 novos testes unitários em `apps/web/components/eco/PhaseBars.test.tsx`.
  2. **Seleção — Reordenação de estágios por arraste (Opção 2):** suporte completo a drag-and-drop na pilha de estágios em `apps/web/components/selection/StageList.tsx`, através de função pura e imutável `reorderStages(stages, fromIndex, toIndex)`, manipuladores de eventos (`onDragStart`, `onDragOver`, `onDragLeave`, `onDrop`), feedback visual dinâmico no destino (`ring-2 ring-brand-500 shadow-lift`), controle de arraste dedicado `⠿` acessível e internacionalizado via `selectionExtras.stageDragHandle(n)` em `apps/web/lib/i18n-extras.ts`, preservando integralmente os botões ↑ e ↓ existentes para WCAG e teclado; 6 novos testes unitários em `apps/web/components/selection/StageList.test.tsx`.
  Cobertura total de testes: 3743 testes de backend (inalterado, 0 skips) e 762 → 778 testes de frontend (+16 novos testes, todos verdes).
- ~~**Lote quádruplo de melhorias: Seleção (P0-1), Busca e Highlight (P1-1), Dimensionador Circular (P2) e Eco Audit Comparativo (P3)**~~ —
  as quatro frentes de refinamento funcional solicitadas pelo usuário foram implementadas e integradas de ponta a ponta na mesma PR:
  1. **Seleção (P0-1):** duplicação de estágio na pilha de seleção (`duplicateStage` em `apps/web/components/selection/StageList.tsx`), clonando recursivamente grupos e restrições com identificadores novos (`nextEditorId`), etiqueta `(cópia)` no rótulo, botão de ação `⧉` acessível com tooltip `t.stageDuplicate(n)` inserindo a duplicata logo abaixo do estágio original, e testes unitários (+3 testes frontend em `StageList.test.tsx`).
  2. **Busca Avançada (P1-1):** ordenação por relevância na busca textual do catálogo (`apps/api/app/repositories/material_repository.py`) com pontuação ponderada via `case` SQL favorecendo correspondência exata de nome (peso 100), início de nome (peso 50), presença em nome (peso 20), descrição (peso 10) e normas (peso 5), combinada com extração de termos positivos em `apps/api/app/services/search_query.py` (`extract_positive_terms`, +5 testes em `test_search_query.py`). No frontend, novo componente `HighlightText.tsx` (+5 testes em `HighlightText.test.tsx`) destacando termos de consulta com estilo sutil (`bg-amber-100 dark:bg-amber-900/40`) integrado em `MaterialRows.tsx`, `MaterialCards.tsx`, `MaterialList.tsx` e `catalogo/page.tsx`.
  3. **Dimensionador Estrutural (P2):** inclusão de seções circulares maciças em flexão e compressão (`apps/api/app/calculations/load_cases.py`), cobrindo `viga-circular-rigidez` (índice $M_1 = E^{1/2}/\rho$, fator estrutural derivado $C_1 = 2 (L^5 F / (\pi \delta))^{1/2}$), `viga-circular-resistencia` (índice $M_1 = \sigma_y^{2/3}/\rho$, fator $C_1 = (4 \pi)^{1/3} (F L)^{2/3}$) e `coluna-circular-flambagem` (índice $M_1 = E^{1/2}/\rho$, fator $C_1 = 2 (F L^2 / (\pi^2 c_1))^{1/2}$), com derivações de Ashby completas e testes unitários (+4 testes backend em `test_load_cases.py`).
  4. **Eco Audit Comparativo (P3):** modo de comparação lado a lado de múltiplos materiais (`EcoMaterialInput`, `EcoComparisonRequest`, `EcoComparisonResultOut` em `apps/api/app/schemas/eco.py`, `apps/api/app/services/eco_service.py`, `POST /api/eco/comparar` em `apps/api/app/routers/eco.py`, +3 testes backend em `test_eco_api.py`). No frontend, interface comparativa completa em `apps/web/app/app/eco/page.tsx`, com cards de entrada independentes para Material A e Material B (massa, fração reciclada, rota de fim de vida), premissas compartilhadas de transporte e uso, validação conjunta, pódios de vencedores em energia e pegada de carbono com indicação de redução percentual e tabela detalhada de variações por fase (B − A) com diferenciação visual e semântica (+1 teste frontend em `apps/web/lib/api.test.ts`).
  Cobertura total de testes: 3395 → 3407 testes de backend (+12) e 753 → 762 testes de frontend (+9), todos verdes.
- ~~**Deslocamentos astronômicos positivos e subtração dominante em `calc()` no extrator de HTML (D-97/D-99, Opção 1)**~~ —
  o extrator de conteúdo HTML dos Cadernos (`app/notebooks/html_text.py`) agora detecta
  e descarta caixas deliberadamente empurradas para fora da viewport através de grandes
  deslocamentos positivos (`_FAR_POSITIVE_PX = 9999px`), cobrindo `left`, `right`, `top`, `bottom`,
  `inset`, `margin-left`, `margin-top`, `text-indent` e transformações/traduções (`translate`),
  comum em técnicas evasivas de injeção de prompt. Além disso, termos matemáticos em `calc()`
  agora passam por teste afim bounded (`percent_of=0px` e `percent_of=10000px`), identificando
  expressões em que um operando negativo supera qualquer dimensão plausível de tela (ex.:
  `calc(50% - 20000px)` e `calc(100% - 99999px)`), ao mesmo tempo em que preserva centralizações
  e ajustes legítimos de layout (como `calc(50% - 10px)` e `calc(50% - 600px)`). Cobertura
  completa com 13 novos testes em `test_html_hidden_css.py` (3382 → 3395 testes de backend).
- ~~**Herança de CSS `visibility:hidden` e resgate por `visibility:visible` no extrator de HTML (D-97/D-99, Opção 1)**~~ —
  o extrator de conteúdo web (`app/notebooks/html_text.py`) agora implementa a semântica
  estrita da especificação CSS para a propriedade `visibility`: `visibility:hidden` (e `collapse`)
  é herdado pelos descendentes através do estado de estilo `_Inherited(visible=...)`, silenciando
  o texto do elemento e de seus filhos (`node.mute = True`), mas permitindo que qualquer elemento
  descendente restaure sua visibilidade declarando explicitamente `visibility:visible`. Textos,
  títulos (`<h1>`–`<h6>`) e tabelas de dados (`<table>`) contidos em elementos visíveis resgatados
  são lidos e renderizados normalmente, enquanto conteúdos puramente ocultos continuam sendo
  descartados contra injeção de prompt. Cobertura completa com 6 novos testes em `test_html_hidden_css.py`
  (3376 → 3382 testes de backend).
- ~~**Exportador PPTX nativo do Report e rotas de exportação (B2) + Liberação de números do RAG nas guardrails**~~ —
  o renderizador `Report` em PowerPoint (`app/exporters/pptx.py`) foi completado e ganhou endpoints
  oficiais na API (`/api/exports/catalogo.pptx`, `/api/exports/estudos/{id}.pptx` e `/api/exports/estudos/{id}/laudo.pptx`),
  além de integração completa no frontend (`ExportButtons.tsx`, `api.ts`, `i18n.ts`). Inclui slide de título,
  seções tabulares divididas em blocos de até 10 linhas com numeração de continuação `(1/N)`, tratamento
  de dados ausentes (`"ausente"`), slide dedicado de interpretação técnica da IA com narrativa fluida no laudo,
  e slide mandatório com os três avisos de limitação de uso, reprodutibilidade e dados fictícios.
  Em conjunto, foi corrigido o falso positivo das guardrails de IA (`ungrounded_numbers`), que antes
  rejeitava citações legítimas a números presentes nos trechos recuperados do RAG (como `p. 80-200`)
  e falhava no agrupamento de milhares com vírgula para números decimais. Cobertura completa com 14 novos
  testes de backend (3362 → 3376) e 1 de frontend (752 → 753).
- ~~**Cérebro — localizador de citação do Markdown / Links sem `p. 1-1` (D-100)**~~ —
  documentos não paginados (`LINK`, `VIDEO`) agora omitem o indicador de páginas
  no bloco de referências do prompt (`app/ai/prompts.py`) e têm `page_start`/`page_end`
  nulos no schema de resposta da API (`CitedSourceOut` em `ai_service.py`). Para
  documentos paginados, páginas únicas são formatadas como `p. X` (em vez de `p. X-X`)
  e intervalos como `p. X-Y`, tanto no prompt do RAG quanto na renderização do
  frontend (`StudyExplanation.tsx`), com cobertura completa em testes de backend
  (3356 → 3362) e frontend (751 → 752).
- ~~**Tirar o material de curso da ENG02016 do banco e do histórico / Ingestão do `Links.md` (D-100/A7)**~~ —
  remoção completa do material didático da disciplina e trabalhos de alunos do repositório,
  do banco e do histórico git (30/09/2026). Para o `Links.md` restante no RAG de produção,
  implementada a ingestão direcionada de arquivos sob demanda (`python -m app.knowledge.ingest --file <path>`),
  com validação estrita (raiz, manifesto, links simbólicos e arquivos operacionais) e
  ação correspondente `conhecimento_indexar_links` no workflow `.github/workflows/admin-banco.yml`,
  permitindo indexação direta em produção (Neon) pelo GitHub Actions sem exigir clone com PDFs LFS locais.
  Passos externos do proprietário (ticket de suporte do GitHub, refazer clones antigos e exclusão dos logs)
  instruídos e documentados em `docs/17-limpeza-historico-cerebro.md`.
- ~~**Concorrência das cotas exercitada contra PostgreSQL na CI (D-97/D-99)**~~ —
  quatro testes multithread contra PostgreSQL 16 (`apps/api/app/tests/test_notebook_quota_postgres.py`)
  estressando concorrência real sob nível de isolamento READ COMMITTED: 20 threads disputando
  a criação do zero (comportamento de `ON CONFLICT DO NOTHING` + `reserve`), 20 threads em corrida
  na última vaga (`already=4, limit=5`), 15 reservers e 5 releasers intercalados, e 10 threads
  com reserva com folga (`slack=2`), garantindo ausência de overspending ou race conditions.
  Integrado na CI via contêiner de serviço `postgres:16` no job `backend` (Python 3.11 e 3.12)
  e step dedicado no job `migrations-postgres` (3343 → 3347 testes de backend).
- ~~**Linha de tabela lida como título pelo fatiador (D-97)**~~ —
  `looks_like_heading` em `app/knowledge/chunking.py` ganhou guarda explícita:
  linha contendo `" | "` nunca é tratada como heading, impedindo que linhas
  de tabela (DOCX, Markdown) sejam consumidas como títulos de seção e rotulem
  erroneamente os chunks seguintes. 5 novos testes de regressão em
  `test_knowledge_chunking.py` (3338 → 3343 testes de backend).
- ~~**Cadernos — lote de pendências das fases 3 e 4 (D-97/D-98)**~~ — nove
  itens da "Baixa prioridade" fechados num PR, com uma revisão final que achou
  quatro problemas importantes e uma segunda revisão que achou um crítico e
  dois importantes no leitor de CSS inline, todos corrigidos com teste de
  regressão.
  - **Velocidade no vídeo** (D-98): o resumo em vídeo oferece 0,75×–1,5× com o
    mesmo controle do áudio, só quando há voz.
  - **Dois rasterizadores** (D-98): `lib/figureExport.ts` passou a usar
    `svgToPngBlob`/`downloadBlob` de `lib/rasterize.ts`; os gráficos ganharam o
    teto de `canvas` do iOS, o erro tipado ("Baixe o SVG.") e a revogação da
    URL, e o compositor deixou de emitir `xmlns` duplicado.
  - **Corte da nota** (D-98): "Salvar como nota" corta numa quebra de linha que
    guarde ao menos metade do espaço (senão no último espaço), nunca dentro de
    um número (`guardrails.NUMBER_TOKEN`), e termina dizendo que encurtou — com
    o limite escrito "20.000", na convenção do D-30.
  - **Cor das marcas** (D-98): as marcas `[n]` do infográfico usam a tinta
    esmaecida do tema claro (`#4a5162`, `--ink-muted`) na tela e no SVG; o menor
    contraste é 6,51:1.
  - **Duplicata da OpenAlex** (D-97): o id mesclado fica em `meta.merged_from` e
    é recusado antes da cota e da rede; só a primeira descoberta gasta a
    unidade, e vira um 409 claro.
  - **Resultados velhos na troca de provedor** (D-97): trocar de provedor limpa
    resposta, marcações e erro, e descarta a busca em andamento feita sob o
    outro (guarda por geração).
  - **Atribuição na conversa** (D-97): a linha de crédito aparece sob o excerto
    em toda `CitationChips` (conversa, resumo, Estúdio); sem atribuição, nada.
  - **Nós ocultos por CSS inline** (D-97): além de `display`/`visibility`,
    opacidade (também em `filter`), `clip`/`clip-path`, deslocamento para fora
    da página (qualquer caixa posicionada, `margin`, `translate` em
    comprimento), caixa zero com overflow cortado e escala a quase nada. Fonte
    minúscula e tinta transparente são **herdadas** e o filho pode desfaz-las,
    então só o texto ilegível sai — a coluna de `font-size:16px` dentro de uma
    linha `font-size:0` fica. **Qualquer** declaração que oculta conta, não só a
    última (`display:none;display:x` passava), com `var()`, `calc()` e escapes
    CSS resolvidos.
  - **O leitor de CSS inline sem teto** (D-99, segunda revisão): a expansão de
    `var()` que pedia gigabytes a uma página de 0,2 MB (N-1), o `var(--x,)`
    que derrubava a extração com 500 (N-2), o escopo copiado a cada nó (N-3),
    a profundidade que contava referências lado a lado (N-4) e a matemática
    não avaliada que deixava passar (N-5). Orçamentos por atributo, escopo,
    expansão e página; o que passa deles, ou faz o leitor tropeçar, oculta o
    nó. Os testes de regressão estão em `test_html_css_budgets.py`.
  - **Cota não atômica** (D-92/D-94/D-97): as três cotas são **reservadas** por
    um `UPDATE … WHERE contador < limite` e devolvidas quando a operação não
    cobra; um teste da forma do SQL falha se o código voltar a
    ler-e-escrever. A devolução de uma geração é idempotente — só quem tira a
    linha de `gerando` devolve —, e apagar um caderno devolve as gerações em
    andamento dele.

  O que ficou pendente está em "Baixa prioridade".
- ~~**Cadernos, fase 4 — Estúdio visual e sonoro (D-98)**~~ — Resumo em
  áudio (quatro modelos, dois apresentadores), Resumo em vídeo (deck + narração
  numa chamada), Apresentação de slides e Infográfico (três orientações), no
  mesmo modal do D-94. Nenhum ladrilho do Estúdio diz mais "em breve".
  - **A voz é a do navegador** (`speechSynthesis`), uma frase por vez, com
    `playLine` para o gesto do iOS: custo zero, e por isso sem MP3/MP4.
  - **O item conferido é a fala, o slide inteiro, a cena inteira** e cada dado,
    ponto e etapa do infográfico.
  - **O dado em destaque segue a regra estrita**: sem a isenção de inteiros até
    100, sem as palavras do aluno, e com a unidade escrita no trecho —
    comparada com maiúsculas (mPa ≠ MPa).
  - **O layout do infográfico sai do backend**, com a tipografia (`styles`),
    para a tela e o SVG; o PNG é rasterizado no navegador, e o PDF dos slides é
    a impressão.
  - **PPTX com notas** para slides e vídeo; DOCX e TXT do roteiro de áudio;
    todo arquivo com os avisos e as referências. Nenhuma migração.

  O que ficou pendente está em "Baixa prioridade".
- ~~**Cadernos, fase 3 — fontes externas (D-97)**~~ — A aba **Link** acrescenta
  um site ou um vídeo do YouTube, e a caixa de pesquisa das Fontes busca
  **Artigos** (OpenAlex), **Wikipédia** e **Web** (*grounding* do Gemini) e
  acrescenta os resultados marcados.
  - **A rede do servidor só se abre por um portão:** `safe_fetch`, com lista de
    bloqueio explícita, IP fixado com `Host` + SNI, cada redirecionamento
    conferido de novo, tetos de tamanho e de prazo (DNS incluído), sem cookies
    e com `Connection: close` .
  - **A duplicata é barrada antes da rede**, pela origem canônica. A cota
    diária (`NOTEBOOK_DAILY_FETCHES`) conta quando a requisição sai do
    servidor — a consulta ao DNS de um nome inclusive —, e é gravada antes do
    erro.
  - **O extrator de HTML** usa só a biblioteca padrão e descarta os nós
    ocultos.
  - **A atribuição CC BY-SA 4.0** da Wikipédia vai para as citações e as
    exportações do Estúdio.
  - **O YouTube funciona pela transcrição colada.**
  - **O Gemini só busca**: o texto gerado é descartado, e as Sugestões da
    Pesquisa ficam numa moldura sem script.
  - **Custo zero:** OpenAlex e web vêm desligadas até haver uma chave gratuita,
    de conta sem forma de pagamento.

  O que ficou pendente está em "Baixa prioridade".
- ~~**Cadernos, fase 2 — Estúdio de texto (D-94)**~~ — Relatório (seis
  modelos, texto corrido ou tópicos), Cartões didáticos, Teste (múltipla escolha
  ou V/F), Tabela de dados (colunas escolhidas) e Mapa mental, no modal
  Formato/Modelo com lápis. Geração em segundo plano com artefato preso lido
  como falho; todo número de todo item conferido contra o trecho que ele cita,
  distratores inclusive; célula sem valor com rótulo escrito; layout do mapa no
  backend para a tela e o SVG; cota própria. Exportações DOCX/CSV/XLSX/SVG com
  os avisos.
- ~~**Atualização do Guia de Estilo (`/app/estilo`)**~~ — As três primitivas
  novas do barril (`Bar`, `PageHeader`, `PanelShell`), o token de raio
  `rounded-panel` (24 px / 1.5 rem), os seis tokens de superfície `rail-*`
  com mini-frame de navegação, e a vitrine completa das 7 paletas por rota de
  D-49 combinando galeria comparativa simultânea e alternador interativo de
  matiz (`document.documentElement.dataset.section`). Quita o débito remanescente
  da revisão final do patch Prisma.
- ~~**P4 restante (DOCX)** — exportação nativa em DOCX~~ — `app/exporters/docx.py`
  renderiza `Report` em documentos Word (.docx) nativos via `python-docx` puro,
  sem dependências de sistema operacional em C (D-20). Cobertura completa de
  `/api/exports/catalogo.docx` e `/api/exports/estudos/{id}.docx`, com tabelas
  formatadas (`w:tblHeader` para repetir cabeçalhos na quebra de página, `w:cantSplit`
  para não partir linhas), os três avisos de auditoria, e suporte nos botões do
  frontend (`ExportButtons.tsx`, `api.ts`, `i18n.ts`).
- ~~**P0-1** — a seleção era de estágio único~~ — o gargalo arquitetural que a
  análise de lacunas apontou, entregue em seis passos
  ([D-56](DECISIONS.md), [07-selecao-deterministica.md](07-selecao-deterministica.md)).
  `SelectionStage` é entidade de primeira classe, ordenada e habilitável, com
  dois tipos: `limit` (a árvore do M6) e `tree` (seleção de pastas da taxonomia,
  **com descendentes** — o que `in_class` não sabe fazer, porque compara o slug
  da própria classe e todo material mora numa folha). Migração aditiva
  `a1c4f2e8b7d3` com backfill; funil por estágio e seção "Estágios" nos dois
  documentos; a pilha editável em `/app/selecao`, que continua abrindo com um
  único estágio para quem faz um estudo simples. **O P0-2 acrescentou o terceiro
  tipo, `process`** — ver a entrada abaixo. Fechou de passagem a lacuna de
  round-trip que o M6 deixou anotada. **O que ficou de fora, e é melhoria e não
  bloqueio:** reordenar por arraste (duplicação de estágio entregue na Sessão 44). O Chart Stage que
  filtra, também listado ali, saiu depois como P1-2 — ver a entrada abaixo.
- ~~**P0-2** — não existia universo de processos~~ — `ProcessClass`
  hierárquica, `Process` e a associação N–N `material_process`, entregues em
  sete passos ([D-57](DECISIONS.md)). O Tree Stage virou a **junção entre
  tabelas** do método: um terceiro tipo de estágio, `process`, mantém os
  materiais que *algum* processo selecionado serve, por pasta ou por folha, com
  descendentes; a ficha do material passou a listar os processos compatíveis.
  Migração aditiva `f24e93bb85f4`, com backfill; funil por estágio distinguindo
  `in_tree` de `in_process`; e a taxonomia de processos semeada por
  `app/db/seed_extended.py`. **O que ficou de fora, e é o próximo
  gargalo e não uma lacuna deste item:** selecionar **processos** como resultado
  (exercício 11 do manual) — o P0-3.
- ~~**P0-3** — a seleção só devolvia materiais~~ — `SelectionStudy.universe`,
  um **motor só** para os dois universos (`RecordSnapshot`), o estágio
  `material` fechando a junção inversa, os documentos declarando o universo e o
  controle na tela ([D-58](DECISIONS.md)). Ranqueamento e índice recusados com
  o motivo escrito num estudo de processos. Quatro defeitos achados no caminho,
  **dois deles lendo o documento renderizado**: o exportador resolvendo id de
  processo contra a tabela de materiais (imprimiria proveniência de material sob
  nome de processo), a coluna Tipo com o slug cru, a validação de `class_slugs`
  contra a taxonomia errada e o `switch` de reabertura não-exaustivo. **O que
  ficou de fora, e virou o P0-4:** atributos de processo.
- ~~**P0-4** — processo não tinha atributo~~ — `ProcessAttributeDefinition` e
  `ProcessAttributeValue` com o trilho de proveniência inteiro, mais os **dois
  tipos de valor que o modelo não cobria**: envelope de capacidade (comparado por
  **alcance**, não pelo ponto médio) e discreto por pertinência a vocabulário
  fechado ([D-59](DECISIONS.md)). Fecha o exercício 11 do manual: Limit Stage
  sobre atributo de processo na API e na tela, e o ranqueamento que o D-58
  recusava. Duas migrações aditivas — `d4a8c1f70b93` (a primeira **sem backfill**,
  e honestamente: a informação é nova) e `e6c3f45a91d8` (`selection_constraint.labels`)
  —, cinco atributos demonstrativos fictícios com ausência nas duas formas, e a
  folha de proveniência de processo com a coluna *Tipo de valor* que diz por qual
  regra cada número foi comparado.

  Três defeitos no caminho, **dois deles não por asserção que falhou**: um
  estágio de limites num estudo de processos resolvia slugs contra o catálogo de
  materiais e então não admitia ninguém, sem explicação; a interpretação da IA
  dizia "Partindo de 13 **materiais**" numa seleção de processos (achado lendo o
  laudo renderizado, e a mesma palavra chegava ao prompt de um provedor real); e
  habilitar o ranqueamento abriu a possibilidade de o mapa do laudo destacar
  materiais com ids de processo, fechada por guard de universo com teste que
  constrói a colisão de slug de propósito.

  **O que ficou de fora, nomeado e registrado em P1:** a **ficha do processo na
  tela** (`GET /api/processes/{slug}` já devolve tudo, falta a rota), catálogo de
  processos **editável** (pede a trilha de auditoria do M2), **intervalo de
  material lido como envelope** (mudaria toda contagem de funil existente, então é
  item próprio) e ~~gráfico de atributo de processo~~ (entregue: mapa de atributos
  de processo 2D Ashby completo em `/app/mapas` e estágios de gráfico, com envelopes
  e respeito às Regras D-59 e D-60).
- ~~**P1-1** — busca era `LIKE`~~ — analisador próprio com AND/OR/NOT, frase,
  parênteses e curinga ([D-55](DECISIONS.md)). Falta relevância (entregue na Sessão 44 com ordenação por case ponderado), *fuzzy* e
  destaque do trecho (entregue na Sessão 44 com HighlightText), registrados como melhoria e não como bloqueio.
- ~~**P1-3** — não havia porta de entrada para navegar~~ — uma pasta da taxonomia
  virou **registro** e o segundo universo passou a se navegar
  ([D-61](DECISIONS.md)). `applications` e `characteristics` em `MaterialClass` e
  `ProcessClass` (texto editorial, **fora do princípio 1 por construção**, preso
  pela regra oposta: NULL é "ninguém escreveu" e a tela escreve isso — D-24);
  `GET /api/classes/{slug}` e `GET /api/processes/classes/{slug}` devolvendo
  prosa, trilha e subpastas, com o breadcrumb saindo de
  `app.domain.taxonomy.lineages` — a mesma travessia do Tree Stage, então trilha
  e estágio não podem discordar sobre quem está sob quem. Cinco rotas novas,
  entre elas a **ficha do processo**, que a API devolvia desde o P0-4 sem ninguém
  renderizar. Migração aditiva `a7d51c93e084`, sem backfill.

  **Uma decisão anterior foi revertida:** `process_count` passou a contar só
  processos ativos. Raciocínio inteiro no D-61 — o resumo é que o docstring do
  repositório sempre disse que a contagem responde "esta pasta está vazia", que o
  operador servido pela razão antiga não tem tela, e que o registro de família põe
  a contagem ao lado da lista, onde "2 processos" seguido de um lê como página que
  perdeu uma linha.

  **O que ficou de fora, e é melhoria e não bloqueio:** *Science Notes* e imagem
  de família, e o catálogo de processos **editável** — registrado desde o P0-2,
  porque pede a trilha de auditoria que o catálogo de materiais tem. (Favoritos e
  recentes saíram com o P1-4.)
- ~~**P1-4** — o catálogo não tinha dono e o usuário não tinha espaço~~ —
  entregue em sete passos ([D-62](DECISIONS.md)). `Material.owner_id` anulável dá
  o registro próprio (NULL é o catálogo compartilhado); `Favorite` e
  `RecentRecord` dão favoritos e recentes nos dois universos, com XOR entre as
  duas colunas de registro para haver chave estrangeira de verdade;
  `/app/meus-registros` é o espaço. A regra de visibilidade vive num lugar só e
  falha fechada, e o canário varre `app.openapi()` em vez de uma lista escrita à
  mão. **Escrita não ganhou predicado próprio**, porque não teria ramo
  alcançável. O documento declara registro próprio no topo e na folha de
  proveniência.

  **O defeito que a própria decisão previu, e que apareceu na hora:** o padrão
  seguro (`None` = só o compartilhado) estreita a leitura, e o `SelectionService`
  recebia `user` opcional porque só a auditoria o lia — então por um commit o
  registro próprio de uma pessoa sumiu do estudo dela, em toda seleção e todo
  documento. O canário não pega isso por construção: ele falha quando um registro
  **aparece** para quem não pode vê-lo, nunca quando **some** para quem pode.
  `user` virou obrigatório (o erro passa a ser `TypeError`) e entrou o controle
  positivo. Ver D-62.

  **O que ficou de fora:** um registro próprio de *processo* (os registros
  **sintetizados**, que eram a outra ausência, saíram com o Synthesizer —
  [D-67](DECISIONS.md)) e
  registro próprio de *processo*, que pede o catálogo de processos editável.
- ~~**P2** — o fluxo do manual não tinha fim~~ — `Find Similar`, registro de
  referência e a tabela de comparação com diferença percentual, entregues em
  seis passos ([D-63](DECISIONS.md)). `app/domain/nearness.py` mede a distância
  em espaço log onde a propriedade permite, escala pela dispersão do conjunto e
  **promedia** (soma penalizaria a base mais larga por ter respondido mais); a
  **base é tudo ou nada** e volta na resposta com os excluídos nomeados;
  `units.is_ratio_scale` decide, por comportamento, onde um percentual significa
  alguma coisa; a referência é **parâmetro da pergunta** e vive na URL.

  **O que ficou de fora:** similaridade no universo de processos, fixar a
  referência como estado de um projeto (o *reference record* propriamente dito,
  e a razão de a capacidade ficar em 3), e destacá-la nas figuras.
- ~~**P2 restante** — o método parava antes de dimensionar~~ — Engineering Solver
  e Performance Index Finder, entregues em três passos
  ([D-64](DECISIONS.md)). São **uma derivação só**: `app/calculations/
  load_cases.py` guarda sete casos padrão com a derivação escrita por extenso, e
  a fatoração de Ashby vira literal — `massa = fator estrutural / índice`, com o
  índice **lido do catálogo pelo slug** e nunca reescrito no caso. Os dois
  espaços de nomes (variável de projeto × slug de propriedade) são separados e a
  separação é conferida **no import**. A variável livre é área numa viga e
  espessura numa placa, cada caso declara qual, e a prova dimensional lê a
  unidade declarada. `/app/dimensionar` mostra o fator estrutural ao lado do
  resultado, para a massa poder ser conferida à mão.

  **O que ficou de fora:** seções além de maciça quadrada, retangular e circular (circulares entregues na Sessão 44), navegar
  por faceta em vez de por caso, e amarrar um dimensionamento a um estudo salvo
  e ao laudo. O objetivo **custo** estava nesta lista e **saiu no P3**, junto com
  o Part Cost Estimator de que dependia ([D-65](DECISIONS.md)).
- ~~**P3 (primeiro item)** — o Part Cost Estimator, e com ele o objetivo custo~~
  — `POST /api/custo/estimar` estima `C = m·Cm/(1−f) + C_t/n + Ċ_oh/ṅ +
  C_c/(ṅ·t_wo·L)` sobre os processos compatíveis com o material e devolve os
  **quatro termos**, porque é o comportamento de cada um com o lote — material
  como piso, ferramental caindo com 1/n, os dois de tempo imóveis — que decide
  alguma coisa; `/app/custo` imprime coluna por coluna e o dimensionamento liga
  nele com a massa que acabou de calcular. Premissa de oficina é entrada com
  valor visível; processo sem dado econômico é nomeado, nunca zerado; e a unidade
  monetária é dita em palavras, porque dinheiro não está em sistema de unidades
  nenhum.

  No mesmo item, o **objetivo custo** ([D-65](DECISIONS.md)): seis índices gêmeos
  no seed, `LoadCase.cost_index_slug`, e `objective` em `POST
  /api/solver/resolver`. A mesma derivação, lida outra vez — quem chama nomeia o
  objetivo e o caso escolhe o índice, como o D-35 exige. A consequência que a
  tela carrega: `custo_massa` é adimensional, então a análise dimensional devolve
  a dimensão da massa nas duas execuções; ela prova a álgebra e deixou de nomear
  a resposta.

  A **curva custo × lote** saiu depois, num PR à parte ([D-96](DECISIONS.md)):
  `/app/custo` desenha C(n) em log–log, reamostrando os mesmos quatro termos —
  não uma segunda derivação.

  **O que ficou de fora:** o custo por família de processo, e custo como
  objetivo em estudo de **processos** — um processo não tem `custo_massa`, e
  ali a pergunta é a do estimador.
- ~~**P3 (segundo item)** — o Eco Audit~~ — `POST /api/eco/auditar` e
  `/app/eco` somam energia e carbono da peça em cinco fases
  ([D-66](DECISIONS.md)). A resposta não é o total: é **qual fase domina**, uma
  vez em energia e outra em carbono, porque as duas podem discordar. Faltando o
  dado de qualquer fase, o pódio e o total são **recusados com o motivo
  escrito** — a fase que ninguém calculou pode ser a que domina.

  Quatro decisões que não se mexem: a fase de uso tem **dois modelos que não são
  variantes de um** (no estático a massa não entra, e os campos do outro modelo
  são recusados, nunca ignorados); a fase de material é cobrada sobre a **massa
  comprada**, `massa / (1 − f)`, o que é também por que a auditoria exige
  processo; a reciclagem é gasto no fim desta vida e poupança no início da
  próxima, e **não se abate crédito**; e aterro e incineração ficam declarados
  sem energia em vez de valerem zero.

  Dados novos: quatro propriedades ambientais (categoria `AMBIENTAL`, que
  existia sem uso), dois atributos de processo e `TransportMode` — nem material
  nem processo, com a justificativa no modelo.

  **O que ficou de fora:** a figura de barras por fase, comparar dois materiais
  na mesma auditoria (entregue na Sessão 44 com comparação lado a lado, deltas e vencedores), e energia catalogada para aterro e incineração.
- ~~**P3 (terceiro item)** — o Synthesizer~~ — `POST /api/synthesis/previa`,
  `POST /api/synthesis` e `/app/sintetizar` criam **materiais hipotéticos** a
  partir de materiais catalogados mais uma receita: compósito de dois
  constituintes com fração volumétrica, ou espuma de um sólido com densidade
  relativa ([D-67](DECISIONS.md)). É o item que mais perto passa de violar o
  princípio 1, e o que o separa é uma frase: **um valor sintetizado não é
  inventado; é calculado, e a diferença é que ele carrega a derivação.**

  A decisão que carrega o item: **a regra de mistura é propriedade da
  propriedade, não da receita.** Densidade linear por volume (exata); módulo como
  **par de limites** de Voigt e Reuss, porque a direção não está catalogada;
  custo e as quatro grandezas ambientais por **fração mássica**, o que exige as
  duas densidades; temperatura de serviço pelo **mínimo**. E **resistência de
  compósito sem regra nenhuma** — quem a controla é a interface, sobre a qual o
  catálogo nada sabe —, enquanto a **espuma tem** regra de resistência, por ser o
  mesmo material com vazios e ter mecanismo de falha que escala (Gibson–Ashby):
  a diferença não está na fórmula, está no que se sabe.

  Três garantias: cada valor nomeia a lei e a **base** dela (exata, limites,
  empírica); a qualidade do dado é a **pior dos pais que a regra leu** (incerteza
  de entrada propagada, incerteza de modelo dita em palavras); e um sintetizado é
  **sempre registro próprio**, por `CheckConstraint` portável
  (`NOT (is_synthesized AND owner_id IS NULL)` — o PostgreSQL recusa
  `boolean = 1`). A prévia vem **antes** da identidade: o passo do nome só
  aparece depois de haver prévia. Migração `ebf6d9eb737a`, com
  `server_default` posto e depois retirado, conferida por mutação.

  **O que ficou de fora:** laminados com orientação declarada, sintetizar sobre
  um sintetizado e a figura do par de limites no mapa.
- ~~**P3 (quarto item)** — os Sandwich Panels~~ — terceiro tipo do Synthesizer:
  duas faces de espessura *t* sobre um núcleo de espessura *c*
  ([D-68](DECISIONS.md)). **Fecha a faixa P3.**

  Metade dele é o Synthesizer sem adaptação nenhuma: densidade e grandezas por
  massa saem pelas **mesmas regras do compósito**, na fração de espessura das
  faces, porque massa é massa e o arranjo não a move. A outra metade é uma regra
  só, e ela não é mistura: o **módulo de flexão equivalente**, que nas mesmas
  frações volumétricas fica **2,7× acima do limite de Voigt** — o teto de
  qualquer regra das misturas. É a afirmação central do item, e é medida, não
  declarada. Duas degenerescências conferem a fórmula inteira (sem núcleo
  devolve `Ef`; sem faces, `Ec`), e **só a razão t/c decide**, o que é o que
  torna legítimo plotar o painel ao lado de sólidos.

  A recusa: **resistência é competição entre modos de falha** — escoamento da
  face, cisalhamento do núcleo, enrugamento da face — e vale o menor. Só o
  primeiro é calculável, e o mínimo sobre parte dos modos é um limite superior,
  não a resistência. Mesma forma da recusa do pódio no D-66. Condutividade e
  dureza também ficam fora, cada uma com seu motivo.

  Sem migração: `MaterialSynthesis.kind` já é texto e `parameters` já é JSON.
  Oito mutações conferidas; a que dá regra de resistência ao painel morre no
  import.

  **O que ficou de fora:** núcleo em colmeia (tem escalas próprias), a figura do
  painel em corte, e os modos de falha que pedem dados de cisalhamento do
  núcleo.
- ~~**P1-2** — o gráfico mostrava e não selecionava~~ — quarto tipo de estágio,
  `chart`, entregue em seis passos ([D-60](DECISIONS.md),
  [07-selecao-deterministica.md](07-selecao-deterministica.md)). Carrega o plano,
  a caixa (um limite por eixo, em coordenadas de dados, nunca pixel) e a linha
  iso-índice no nível **guardado** — número e não "a linha que passa pelo
  material 7", porque um estudo salvo tem de reexecutar para a mesma resposta.
  Três coisas que valem mais do que parecem: **um eixo pode ser quantidade
  derivada** (é o que um estágio de limites, que nomeia slug de propriedade, não
  alcança); **registro não plotável não passa**, mesmo onde a caixa não limita
  aquele eixo; e o documento **redesenha o plano em que a decisão foi
  desenhada**, com a região como figura e a geometria vinda de
  `ChartService.property_map`, a mesma chamada que serve a tela. Migração aditiva
  `f2b6d0e39c47`, a segunda **sem backfill** (a informação é nova), conferida por
  mutação nas duas direções — sem a guarda `kind <> 'chart'` a própria migração
  não roda.

  **O que ficou de fora, e é melhoria e não bloqueio:** ~~desenhar a caixa
  **arrastando** no gráfico da tela~~ (entregue no Opção A / D-60: seleção
  interativa por cursor com modo `select2d`, conversão de escala linear/log,
  sincronização bidirecional de shapes no Plotly, preview dinâmico no estágio e
  atalho direto "Criar estágio na Seleção" via deep link) — ~~resta o mapa
  do universo de processos~~ (entregue: suporte a `universe="process"` em
  `property_map`, nuvens e envelopes convexos por família de processos, rejeição
  estrita de atributos discretos conforme Regra D-59, rejeição de índices
  analíticos, e preview interativo completo tanto em `/app/mapas` quanto no
  ChartStage de `/app/selecao`).
- ~~**S2** — CVEs do toolchain de desenvolvimento~~ — `npm audit` em
  `apps/web` de **27 para 14** achados, com as duas cadeias que tinham caminho
  de upgrade fechadas por inteiro. `vitest` 2 → **5** (com `vite` 7,
  `@vitejs/plugin-react` 5 e `@types/node` 22) fechou o **único crítico** de
  então, mais `vite`, `esbuild`, `vite-node` e `@vitest/mocker`. `eslint` 8 →
  **9** e `eslint-config-next` 14 → **16** fecharam `@next/eslint-plugin-next`,
  `eslint-config-next` e `glob`. `@lhci/cli` 0.13 → **0.15.1** fechou `tar-fs`,
  `ws`, `@sentry/node` e `cookie`. Sobraram `brace-expansion`, `js-yaml` e
  `body-parser`, que caíram junto na re-resolução do lockfile. O que **não**
  fecha é o S3, acima.

  **Três coisas que não eram bump mecânico:**

  1. **O `npm audit fix` cego quebrou a instalação e foi revertido.** Ele
     re-hoistou o `vitest` para a raiz e deixou o `jsdom` em
     `apps/web/node_modules`; como o vitest resolve o `jsdom` a partir da
     própria localização, os 24 arquivos de teste morreram com
     `Cannot find package 'jsdom'` — reproduzido com `npm ci` limpo, para não
     confundir com estado sujo de `node_modules`. O caminho que funcionou foi
     declarar as versões no `package.json` e deixar o npm re-resolver a árvore
     inteira de uma vez.
  2. **A migração do Vite 6 mudou de lugar as condições de resolução do SSR, e
     isso derrubou nove testes de shadow DOM.** O `vitest.config.ts` já trazia
     `resolve.conditions: ["browser"]` com um comentário explicando por quê: sem
     ele o `lit-html` resolve pelo build `node/`, que tem `isServer` fixo em
     `true` e desliga em silêncio o mixin de delegação de ARIA do
     `@material/web`. Desde o Vite 6 o pipeline de SSR lê as **suas próprias**
     condições, e `resolve.conditions` deixou de alcançá-lo — a falha que aquele
     comentário previa, acontecendo. Corrigido repetindo a condição em
     `ssr.resolve.conditions`/`externalConditions`. **As duas listas têm de
     concordar.**
  3. **O ESLint 9 aboliu o `.eslintrc.json` e a flag `--ext`.** O conteúdo da
     config não mudou (`next/core-web-vitals` e nada mais), mas o alcance passou
     a ser glob explícito no script `lint`: ao receber um diretório, o ESLint 9
     linta só `.js`, e o portão passaria verde **sem ter olhado uma linha de
     TypeScript**. Falha silenciosa, do tipo que este projeto já pagou caro.

  **E um achado que não estava no enunciado do S2:** o lockfile antigo tinha
  `resolved`/`integrity` em apenas **59 de 1095** entradas, então o `npm audit`
  não conseguia identificar a maior parte da árvore para conferir contra a base
  de avisos. Os "27 achados, nenhum deles em código de produção" eram
  subcontagem: os dois críticos de `plotly.js`/`maplibre-gl` já estavam lá, nas
  mesmas versões, e simplesmente não eram reportados. O lockfile regenerado é
  completo, e por isso o número de agora é comparável ao que qualquer outra
  máquina veria.

- ~~**S1** — upgrade de segurança do Next e do PostCSS~~ — `next` 14.2.35 →
  **16.3.4** e `postcss` → **8.5.28**, fechando os **21 CVEs do Next** (SSRF em
  rewrites e em Server Actions, DoS em Server Components e no Image Optimizer,
  XSS com nonce de CSP, envenenamento de cache, divulgação de endpoints internos
  de Server Function) e os **4 do PostCSS** (path traversal por
  `sourceMappingURL`, XSS por `</style>` não escapado). Os dois saíram limpos do
  `npm audit`; o que restou virou **S2** e é todo de desenvolvimento.

  **Não havia caminho menor:** `14.2.35` é a última versão que a linha 14
  recebeu, então nenhum desses CVEs tinha correção dentro do major — o upgrade
  de major era a única opção, e não uma preferência. O que tornou isso viável
  com risco baixo é que o Next 16 **ainda aceita React 18**
  (`peerDependencies`), então a migração para o React 19 não veio junto; e a
  base não usa `cookies()`/`headers()` nem `params`/`searchParams` em server
  component, que são as duas maiores quebras do Next 15.

  **Três quebras reais apareceram, e nenhuma delas é bump mecânico:**

  1. **O Turbopack virou o bundler padrão** e o Next 16 recusa a build ao ver
     uma chave `webpack` sem uma `turbopack` — e essa chave é o alias que monta
     o Plotly à la carte. `--webpack` explícito em `dev`, `build` e no
     `webServer` do `playwright.config.ts`, com medição comparativa e o porquê
     em [D-51](DECISIONS.md). Maior chunk continua **980 KB**.
  2. **`next lint` foi removido.** O script `lint` passou a chamar o ESLint
     direto, cobrindo os mesmos diretórios que o `next lint` cobria por padrão —
     nem mais, nem menos. (A forma exata mudou de novo no S2, com a migração
     para *flat config*: a flag `--ext` não existe mais no ESLint 9 e o alcance
     virou glob explícito.)
  3. **O Next 16 bloqueia requisição cross-origin a recurso de desenvolvimento
     (`/_next/*`)**, e trata `127.0.0.1` como origem diferente de `localhost`.
     Como a suíte E2E serve e navega em `127.0.0.1:3011`, o runtime do cliente
     era recusado, **a página não hidratava** e os dois specs morriam olhando
     para o "Verificando sessão…" renderizado no servidor. O diagnóstico foi
     difícil justamente porque não havia requisição falhando para apontar: o
     recurso bloqueado era o que dispararia as requisições. Corrigido com
     `allowedDevOrigins: ["127.0.0.1"]` no `next.config.mjs`.

  **E um quarto achado, que não é do Next mas veio à tona por ele:**
  `selectMwcOption` (`e2e/mwc.ts`) devolvia o controle enquanto o menu do
  `md-outlined-select` ainda fechava; o clique seguinte do spec caía sobre um
  `md-select-option` e repetia até estourar o teste. É corrida antiga, não
  regressão do upgrade: passava porque a primeira visita à rota compilava
  devagar e dava tempo de tudo assentar — com a rota já compilada (spec rodando
  em segundo lugar no mesmo worker) ela perde. Intermitente, aliás: reproduziu
  em algumas execuções e não em outras. O helper agora espera a **opção** sumir.
  Medido, e não suposto: o `md-menu` (role=listbox) reporta `visible=false` ao
  Playwright mesmo aberto, então esperar por ele seria um no-op; quem fica
  visível — e quem intercepta o clique — é a opção.

- ~~**Prisma** — patch de sistema de design (paleta por rota, vitrine
  pública, migração para `/app`)~~ — sete tarefas dirigidas por subagentes
  mais uma rodada final de verificação (plano em
  `.superpowers/sdd/2026-09-03-design-system-prisma/`). **Fase 1** (tokens e
  primitivas): `app/globals.css` ganhou blocos `[data-section="…"]` por
  rota — cada área do produto com seu próprio matiz de `--brand-*`/
  `--accent`, trocado via `data-section` no `<html>`
  (`components/layout/SectionTheme.tsx`) — substituindo a paleta única de
  D-38 sem revogar o método de medição dela: par mais apertado 5,59:1 (era
  5,01:1), nenhum par abaixo de 6,2:1 ([D-49](DECISIONS.md)).
  `--quality-*`/`--success`/`--warning`/`--danger`/`--info` e a paleta
  Okabe–Ito continuam intocados de propósito — proveniência e alerta não
  variam por rota. **Fase 2** (camada comercial): `/` virou a vitrine
  pública (`components/marketing/Landing.tsx`, sem sidebar nem portão de
  login), nove árvores de rota migraram para `/app/*` — as seis rotas do
  produto (`selecao`, `mapas`, `comparar`, `catalogo`, `painel`,
  `importar`) mais `estilo`, `admin` e `materiais`, as últimas três fora
  da lista de rotas da própria spec e descobertas só durante a Tarefa 5 —
  levando `AuthGate` junto — achado nesta sessão e não no README do
  patch, que só falava em mover `AppSidebar`/`LimitationNotice`: é
  `AuthGate` que hoje condiciona toda rota a sessão + assinatura ativa, e
  deixá-lo no layout raiz teria vazado o portão de login para a vitrine
  pública. `BottomNav` chegou para telefone e `MaterialCards` passou a
  renderizar ao lado de `MaterialTable` no catálogo (`sm:hidden`/`hidden
  sm:block`), DOM duplicado de propósito — custo aceito porque o catálogo
  é paginado. `PageHeader` substitui o `<h1>` manual em dez arquivos de
  rota (`group="estudar"`: seleção/mapas/comparar; `group="dados"`:
  catálogo/painel/importar; mais admin/classes, admin/propriedades,
  materiais/novo e materiais/[id]/editar);
  `/entrar` e `/assinatura` ficam de fora por decisão do próprio spec, que
  não lhes dá seção. **Descartado por decisão do spec, não por omissão:** a
  "coluna de cobertura" do catálogo que o README do patch pedia para ganhar
  `Bar` — não existe tal coluna nesta base, e o item foi abandonado já na
  Fase 1 em vez de forçado. Preços na vitrine ficam com `R$ —` (três
  planos, eixo definido — número de materiais, quem pode importar — nenhum
  valor inventado, item 1 da metodologia). Os cinco "refinamentos ainda
  opcionais" do README do patch continuam fora de escopo, registrados aqui
  em vez de silenciosamente descartados: `tabular-nums` generalizado,
  `PanelShell` em todo shell de rota, estudos-modelo por query string em
  `/selecao`, aviso de demonstração como convite de ativação, e qualquer
  copy adicional de vitrine além da que o patch já trouxe pronta.

  **Dois defeitos que a revisão de cada tarefa já tinha achado e corrigido
  antes desta entrega chegar aqui:** a Task 6 devolveu um badge
  `is_demo`/`keywords` que faltava em `MaterialCards` (presente na tabela,
  ausente no cartão) e documentou a remoção do toggle manual
  "Tabela/Cartões" do catálogo como [D-50](DECISIONS.md) — a troca por
  breakpoint automático era a leitura técnica certa (a spec pede
  exatamente isso), mas tinha saído sem registro.

  **Esta tarefa (verificação final) achou e corrigiu mais dois, nenhum
  coberto por teste automatizado até agora:** (1) `apps/web/e2e/golden-
  path.spec.ts` quebrava em modo estrito do Playwright —
  `getByText(MATERIAL_RIGIDO)` resolvia a dois elementos (o cartão novo da
  Task 6 e a linha da tabela, ambos no DOM ao mesmo tempo por desenho, só
  um visível por CSS de breakpoint) — corrigido escopando a leitura para
  `page.getByRole("table").getByText(…)`. (2) um bug de CSS real, achado só
  em navegador de verdade: os seis blocos `[data-theme="dark"]
  [data-section="…"]` em `globals.css` usavam combinador descendente
  (espaço) em vez de seletor composto, mas `data-theme` e `data-section`
  são escritos no mesmo elemento (`<html>`, não em dois aninhados) — a
  regra nunca casava, e as seis rotas caíam silenciosamente na cor de
  fallback única do tema escuro, zerando D-49 inteiro no escuro sem erro
  algum. `materialTheme.test.ts` não pega isso porque testa o *gerador* dos
  tokens, não a sintaxe deste arquivo CSS. Corrigido removendo o espaço;
  confirmado ao vivo com Chromium real que as seis rotas voltam a ter
  `--accent` distinto no tema escuro depois da correção.

  D-24 (ausência nunca vira zero) verificado ao vivo com um caso construído
  na hora, já que os cinco materiais de seed não tinham nenhum candidato
  sem escore: um material importado sem `modulo_young` recebe `score: null`
  no ranking e `Bar` não renderiza nenhum preenchimento — nem 0%, nem
  100% — só o rótulo "Dados ausentes: modulo_young"; o material com escore
  completo (único candidato pontuável) recebe 100%. 872 testes de backend
  (intocado por esta tarefa), 193 de frontend, 2 E2E e Lighthouse (11
  rotas, 33 execuções) verdes ao final.

  **Débito aberto pela revisão final de branch — quitado:** `/app/estilo`
  (a página viva do guia de estilo, de onde saem as capturas usadas como
  figuras de interface na monografia) foi atualizada com as três primitivas
  novas do barril (`Bar`, `PageHeader`, `PanelShell`), o token de raio
  `rounded-panel`, os seis tokens de superfície `rail-*`, e a vitrine
  comparativa e alternador interativo das sete paletas por rota introduzidas
  por D-49.
- ~~**M5** — Métodos multicritério adicionais (TOPSIS, AHP, PROMETHEE)~~ —
  implementado **por pedido explícito do orientador**, revertendo a nota "só
  faça se o orientador pedir" que este item carregava antes: o usuário
  confirmou explicitamente que o orientador pediu, então o item deixou de
  estar fora de escopo. `app/domain/ranking.py` ganhou `rank_topsis` e
  `rank_promethee`, ambos reaproveitando a mesma entrada genérica (critérios
  com direção/peso/normalização) da soma ponderada já existente via o
  auxiliar compartilhado `_split_complete_and_excluded` — exclusão de dado
  ausente e renormalização de pesos idênticas nos três métodos, nunca
  reimplementadas. **TOPSIS** decide por proximidade a um ponto ideal/anti-
  ideal; decisão de escopo registrada no próprio docstring: ao contrário da
  soma ponderada, a contribuição por critério não soma o escore (a razão de
  distâncias não é uma agregação linear). **PROMETHEE II** decide por fluxo
  de saída líquido de comparações pareadas; decisão de escopo: só a função de
  preferência "usual" (tipo I), sem limiares de indiferença/preferência, e
  exige ao menos dois materiais completos para comparar. `app/domain/ahp.py`
  ganhou `derive_weights` para obter pesos de critério a partir de uma matriz
  de comparação pareada (escala 1–9 de Saaty): pesos por **média normalizada
  das colunas** (a aproximação documentada de Saaty ao autovetor principal,
  não um solver numérico) e rejeição dura de qualquer matriz com razão de
  consistência acima de 0,1 — nunca devolve pesos parciais de julgamentos
  autocontraditórios. `RankingIn`/`StudyIn` ganharam `method`
  (`weighted_sum`/`topsis`/`promethee`), persistido em
  `SelectionStudy.method` (migration `f8c93a1d8844`) para que um estudo
  salvo reexecute com o mesmo método; `POST /api/selection/ahp-weights`
  chama `derive_weights` diretamente, sem persistência. No frontend,
  `apps/web/app/selecao/page.tsx` ganhou o seletor de método e
  `apps/web/components/selection/AhpMatrixInput.tsx` a entrada de matriz de
  comparação (só o triângulo superior é editável; diagonal e triângulo
  inferior seguem por construção). 852 testes de backend (nenhum skip) e 171
  de frontend, todos verdes ao final. Ver
  `docs/04-metodologia-selecao.md` para a descrição de cada método.
  **Addendo da revisão final de branch (corrigido na mesma sessão):**
  `AhpWeightsIn.matrix` aceitava `NaN`/`Infinity` e produzia 500 em vez de
  422 (faltava `allow_inf_nan=False`); um estudo PROMETHEE com menos de dois
  candidatos completos após o filtro derrubava a resposta inteira em vez de
  degradar como `weighted_sum`/TOPSIS já faziam; e `method` passou a
  aparecer de fato no painel de proveniência dos resultados e na nota de
  "Contribuições" do relatório/laudo, que antes afirmavam algo falso para
  TOPSIS especificamente. Detalhe completo em
  `.superpowers/sdd/2026-09-01-m5-m6-multicriterio-e-restricoes-aninhadas/final-fix-wave-report.md`.
- ~~**M6** — Restrições com parênteses lógicos~~ — `ConstraintGroup`
  (`app/models/selection.py`), um nó de árvore booleana AND/OR que se
  autorreferencia por `parent_group_id`; a migration `6845a9523f17` cria a
  tabela e faz o backfill — exatamente um grupo raiz por estudo já existente,
  com o `combinator` que o estudo já tinha, reapontando cada
  `SelectionConstraint` para esse grupo via a nova coluna `group_id`
  (nullable até o backfill terminar, só então travada `NOT NULL` — a ordem
  importa contra um banco com estudos salvos). `app/domain/filters.py` ganhou
  `ConstraintGroupNode` (dataclass simples, sem SQLAlchemy — `domain` não
  importa isso) e `apply_constraint_tree`, que percorre a árvore
  recursivamente por material; `test_single_root_group_matches_flat_apply_
  constraints` prova que um grupo raiz sem filhos avalia **identicamente** ao
  `apply_constraints` plano de antes — a garantia de compatibilidade
  retroativa do backfill, não só descrita, testada. Na API,
  `ConstraintGroupIn` (`app/schemas/selection.py`) é opcional em
  `StudyIn`/`FilterRequest`/`RunRequest` — a ausência de `root_group`
  preserva o formato plano `constraints`/`combinator` que essas rotas já
  tinham; quando presente, `SelectionService._persist_group_tree` grava a
  árvore de verdade, raiz primeiro e filhos em profundidade. No frontend,
  `apps/web/components/selection/ConstraintEditor.tsx` virou um editor de
  árvore recursivo — cada grupo com seu próprio alternador AND/OR e
  "Adicionar grupo"/"Adicionar restrição" em qualquer profundidade — e
  `/selecao` passa a enviar `root_group` ao rodar ou salvar. ~~**Limitação
  conhecida, registrada e não corrigida na entrega inicial:**~~ `GET
  /api/selection/studies/{id}` devolvia as restrições apenas no formato plano,
  então reabrir um estudo aninhado podia achatar a exibição num único grupo.
  **Fechada integralmente no P0-1 ([D-56](DECISIONS.md)) e na Opção 1 (M6 round-trip)**:
  `StudyOut.root_group` e `StageOut.root_group` reconstroem fielmente a árvore
  recursiva `ConstraintGroupIn` com ordenação determinística por `position` e
  fallback robusto para estudos legados sem estágios (sintetizando `LimitStage`
  com a árvore intacta), `StudyDetail` em `@materialselect/shared-types`
  espelha o contrato, e `apps/web/app/app/selecao/page.tsx` (`loadStudy`)
  hidrata a árvore sem qualquer achatamento ao reabrir. Ver
  `docs/07-selecao-deterministica.md` para a descrição do modelo de árvore e
  o exemplo trabalhado. 862 testes de backend (nenhum skip, antes 852) e 176
  de frontend (antes 171), todos verdes ao final, expandidos com regressões de
  round-trip em `test_selection_stages.py`.
  **Addendo da revisão final de branch (corrigido na mesma sessão):** o
  laudo de engenharia (D-41) descrevia a lógica de um estudo aninhado como
  um único combinador achatado, com linhas de subgrupo opacas — corrigido
  com `SelectionService.describe_root_group` (hoje `describe_pipeline`, D-56), que renderiza a árvore
  AND/OR real na aba "Problema" do relatório/laudo. Total final: 872 testes
  de backend, 179 de frontend.
- ~~**B1–B10**~~ — as dez pendências de baixa prioridade, entregues numa
  sessão dirigida por subagentes (o plano de implementação existiu em
  `docs/superpowers/plans/2026-08-27-backlog-b1-b10.md`; o histórico do git é
  o registro agora). **B1** filtros compartilháveis por URL
  (`apps/web/app/mapas/url-state.ts`, um parâmetro `estado` opaco em
  base64url, com o link antigo `?x=&y=` continuando a funcionar). **B7**
  `SavedChart` — configuração de mapa salva e reaberta, isolada por projeto
  no mesmo padrão de `SelectionStudy` (D-42); a revisão final de branch
  pegou um bug real (o botão "carregar" aplicava os dados da *lista*, que
  omite `configuration` de propósito, em vez de buscar o registro completo —
  corrigido). **B6** envelope elíptico ajustado como alternativa ao fecho
  convexo (`app/domain/geometry.py::fitted_ellipse`, autovalores em forma
  fechada de uma matriz 2×2, sempre backend, nunca no React — ADR 0004).
  **B8** evitar a segunda requisição ao alternar linear/log — o backend
  devolve `envelopes_alt` (o envelope na escala oposta) na mesma resposta; a
  revisão final também pegou que faltava `placeholderData` no `useQuery` do
  frontend, sem o qual a troca de escala continuava recarregando a tela
  inteira em vez de trocar instantaneamente — corrigido. **B9**
  renormalização em massa ao trocar só a unidade canônica de uma propriedade
  (dimensão física inalterada): todo `MaterialPropertyValue.normalized_value`
  é recalculado numa única transação atômica — computa tudo antes de
  escrever qualquer linha, um valor incompatível aborta a operação inteira
  sem gravação parcial; `value_min`/`value_max`/`uncertainty`/`original_unit`
  nunca são tocados (CLAUDE.md §1.4). **B5** busca por palavra-chave migrou
  de `LIKE` sobre `Material.keywords` convertido de JSON para texto para uma
  tabela de associação indexada (`MaterialKeyword`), mantendo `keywords`
  como fonte de verdade e sincronizando o índice a cada gravação. **B3**
  importação de JSON e SQLite — a revisão pegou um risco real de injeção SQL
  no nome de tabela interpolado em `read_sqlite` (inofensivo no único
  chamador atual, mas uma função pública com um parâmetro pensado para reuso
  futuro); corrigido com escape padrão de identificador SQL antes de
  mesclar. **B4** detecção de encoding além de UTF-8/Latin-1, via
  `charset-normalizer`. **B2** arquitetura de exportação PPTX
  (`to_pptx(report) -> bytes`), deliberadamente sem rota exposta, como o
  próprio item pedia. *Nota posterior (D-98):* o renderizador do `Report`
  continua sem rota; o PPTX que o Estúdio entrega (slides e vídeo) é outro,
  `app/exporters/studio_pptx.py`, que só reaproveita as constantes de 16:9 e o
  slide de avisos de `pptx.py`, promovidos a nome público. **B10** `httpx2` instalado para calar o aviso de
  depreciação do TestClient do Starlette. 831 testes de backend (0 skip,
  antes 795) e 165 de frontend (antes 162) ao final; a revisão final de
  branch rodou `alembic upgrade head` + seed num banco limpo para confirmar
  que a cadeia das duas migrations novas (`SavedChart`, `MaterialKeyword`) é
  linear.
- ~~**RAG sobre o Cérebro**~~ — o Cérebro (D-45) deixou de estar inerte em
  `main`: `app/knowledge/retrieval.py` faz busca híbrida (BM25 + semântica,
  fundidas por *reciprocal rank fusion*) e alimenta `interpret()`/`explain()`
  da camada de IA com trechos numerados, *gated* por `provider.simulated` — o
  `mock` nunca aciona a busca, preservando a garantia de determinístico e sem
  rede. `explain()` ganhou citação **verificada** por índice
  (`guardrails.check_citations`), não citação livre: um índice fora do que
  foi de fato recuperado naquela chamada é descartado. A garantia mais
  importante da metodologia ficou intacta e provada, não só prometida: um
  número presente só num trecho recuperado continua sendo recusado como
  restrição, porque `check_constraint`/`ungrounded_numbers` nunca leem
  `context.retrieved` — teste dedicado cobre exatamente isso, e dois
  revisores confirmaram separadamente que nenhum caminho novo alcança essas
  funções. Receita gratuita de embeddings (Jina AI, 1M tokens/mês sem
  cartão) documentada em `.env.example`, sem padrão de propósito (mesmo
  raciocínio de `AI_BASE_URL`, D-36); sem nada configurado, cai para busca só
  léxica. 55 testes novos de backend nesta entrega; 795 no total (nenhum
  skip) depois da rodada de correção da revisão final e da PR #26. Ver
  [D-47](DECISIONS.md) e [09-camada-ia.md](09-camada-ia.md).
- ~~**M4** — Unificar o contrato de tipos~~ — npm workspaces (`package.json`
  na raiz, `workspaces: ["apps/web", "packages/shared-types"]`) +
  `transpilePackages` em `next.config.mjs`. `packages/shared-types/index.ts`
  passa a ser importado de verdade por `apps/web` (como
  `@materialselect/shared-types`), não só copiado à mão; `apps/web/lib/types.ts`
  virou um barril de reexportação, preservando os 39 pontos de importação que já
  usavam `@/lib/types`. A divergência que a duplicação escondia (`x_quality`/
  `y_quality` não-nulos em `shared-types`, corretamente nulos em
  `apps/web/lib/types.ts`) foi resolvida ao consolidar num arquivo só — a
  versão de `apps/web`, que era a exercitada pelo typechecker. Ver [D-16](DECISIONS.md).
- ~~**M9** — Reconciliar as duas arquiteturas de cobrança~~ — **decidido: o
  portão binário do plano de 18/08 é o que fica ligado.** `require_active_
  subscription` passou a valer em todo router exceto `health`/`auth`/`billing`;
  o plano Free/Pro de 21/08 fica registrado como desenho alternativo, não
  implementado. `AuthGate.tsx` voltou a dois estágios (`/auth/me` →
  `/billing/status`); a sessão fixa de E2E/Lighthouse já escrevia uma
  `Subscription` ativa para este momento. Verificado ao vivo: sem cookie →
  401, com assinatura ativa → 200, autenticado sem assinatura → 403 (com
  `/billing/status` continuando alcançável). **Checkout real testado de
  ponta a ponta** (25/08): o autor configurou Stripe em modo de teste e um
  cliente OAuth do Google na própria máquina e completou o fluxo completo —
  login → checkout hospedado → pagamento de teste → webhook → `/assinatura`
  com assinatura ativa. Essa verificação achou um bug real que os 713 testes
  não pegavam (webhook sempre devolvia 500 contra o SDK de verdade); corrigido
  e coberto por teste no PR #21. Ver [D-46](DECISIONS.md).
- ~~**A6** — Purgar o material licenciado do Cérebro em `main`~~ — **decidido
  não purgar.** O autor optou por manter os 158 arquivos (11 livros
  comerciais, 103 fichas Granta EduPack, material de curso e trabalhos
  entregues) como base de conhecimento da camada de IA, com informação
  completa sobre a exposição. Risco aceito, não descuido. Ver
  [D-45](DECISIONS.md). **Emendado pelo D-100:** o material de curso e os
  trabalhos entregues saíram do repositório e, em 30/09/2026, também do
  histórico (A7); os livros e as fichas continuam como a decisão os deixou.
- ~~**A7 (parte executada)** — Material de curso fora do banco de produção e
  do histórico~~ — **feito em 30/09/2026.** Depois do merge do PR #85, o autor
  rodou `conhecimento_remover` em produção (não há bases locais: o autor
  trabalha só na nuvem). Com a *ruleset* `CI obrigatoria em main` desligada, o
  histórico foi reescrito com o git-filter-repo 2.47.0 pelo guia
  [`17-limpeza-historico-cerebro.md`](17-limpeza-historico-cerebro.md) — as 14
  linhas de caminho de `removidos.txt`, as regras de `--replace-text` e
  `push --force --atomic` —, e a *ruleset* foi religada. `main`: `873dd53` →
  `b7dd105`, árvore idêntica, 659 → 583 commits (76 duplicatas de uma
  reescrita anterior colapsadas), assinaturas GPG perdidas. Verificação: os 71
  caminhos e os nomes dos alunos aparecem 0 vezes no histórico. O que resta
  continua aberto em A7. Ver [D-100](DECISIONS.md).
- ~~**M8** — Desempenho medido (Lighthouse)~~ — job `Lighthouse` em `ci.yml`:
  build de produção, API e frontend em portas isoladas (8811), sessão fixa via
  `E2E_SESSION_TOKEN` para que as 11 rotas auditadas sejam as telas reais
  autenticadas (sem isso, todas cairiam em `/entrar` e o Lighthouse mediria só
  a tela de login), com limiares por assertiva
  (`apps/web/lighthouserc.json`): performance ≥0,7, acessibilidade ≥0,9,
  boas práticas ≥0,8, interativo ≤5 s, FCP ≤2,5 s, LCP ≤4 s, CLS ≤0,1, TBT
  ≤500 ms. `scripts/protect-main.ps1` já lista `Lighthouse` entre os nomes
  exigidos — falta confirmar que o script foi de fato executado contra a
  ruleset viva no GitHub (ver `CLAUDE.md` §7).
- ~~**M1** — Triagem de licenciamento das bases incorporadas~~ — `Source`
  ganhou `license_label`/`license_url`, a sinalização explícita
  `contains_third_party_data` e um carimbo de quem registrou a fonte e
  quando. O portão fica na importação (`ImportService._check_source_licensing`,
  rodando em `validate()` e de novo em `commit()`): uma fonte **nova** sem
  licença registrada é recusada antes de qualquer linha ser escrita, e uma
  fonte marcada como possivelmente contendo dado de terceiro exige uma
  segunda confirmação humana explícita (`source_review_confirmed`). Reusar
  um `source_label` já registrado não reabre a decisão a cada importação.
  `GET /api/sources` lista toda fonte com sua licença e revisor. Ver
  [D-44](DECISIONS.md).
- ~~**A2** — Estudo de caso didático completo~~ — o tirante leve e rígido
  ("light, stiff tie") de Ashby, reproduzido do enunciado ao relatório
  exportado contra a aplicação real (não simulado): nove materiais reais de
  literatura (não o `sample-data/` fictício) importados pelo assistente de
  importação, o índice `rigidez-especifica` já semeado, uma restrição de
  fragilidade que exclui a cerâmica mesmo com o melhor índice bruto, e a
  ordenação resultante batendo com os três pontos consolidados na literatura
  de Ashby: compósitos à frente de metais, os três metais estruturais num
  platô de menos de 2% entre si, cerâmica excluída por fragilidade apesar do
  índice. Roteiro completo, com as respostas reais da API como evidência, em
  [`docs/12-estudo-de-caso.md`](12-estudo-de-caso.md); regressão automatizada
  em `app/tests/test_case_study.py`.
- ~~**M2** — Auditoria de alterações~~ — `AuditEvent`
  (`app/models/audit.py`) registra quem, o quê e quando para material, classe,
  propriedade, índice de desempenho e estudo de seleção: um retrato de
  `user_email`/`entity_label` (sobrevive à conta ou à entidade sumirem depois)
  e um diff só dos campos que mudaram. `GET /api/audit` lista por
  entidade, com a mesma fronteira de projeto de todo endpoint de estudo — o
  catálogo é visível a qualquer usuário logado, um estudo só ao seu dono,
  inclusive depois de excluído (retrato de `project_id`, não junção viva). A
  importação em lote fica de fora de propósito: `ImportService` monta
  `Material` direto, sem os métodos públicos de `MaterialService` que
  chamam o audit — `ImportJob` já é a trilha desse fluxo. Ver
  [D-43](DECISIONS.md).
- ~~**A5** — Autenticação e autorização por projeto~~ — login exclusivamente
  por terceiros (Google, OAuth 2.0; sem senha em lugar nenhum), sessão em
  cookie `httpOnly` (`UserSession` é linha de banco, não JWT — logout revoga
  de verdade), catálogo global compartilhado entre usuários autenticados, um
  `Project` por `User` criado no primeiro login, `SelectionStudy` escopado por
  `project_id` (ver [D-42](DECISIONS.md), [ARCHITECTURE.md §7](ARCHITECTURE.md)).
  O Playwright (A4/B11) não passa pelo Google: `app/db/seed.py` grava uma
  sessão fixa só quando `ENVIRONMENT=development` **e** `E2E_SESSION_TOKEN`
  está no ambiente, e a suíte injeta esse token como cookie antes da primeira
  navegação — sem nenhuma rota de bypass exposta pela API. Destrava M2.
- ~~**A4** — testes end-to-end dos fluxos~~ — Playwright cobre importar →
  selecionar → visualizar → exportar como uma sessão contínua no navegador,
  contra API e banco (SQLite, descartável) próprios, em portas isoladas das de
  desenvolvimento (`apps/web/e2e/`, `apps/web/playwright.config.ts`,
  `apps/api/scripts/e2e_server.py`; `npm run test:e2e`). Achou um bug real de
  produção antes de ir ao ar: a sugestão automática de coluna na importação
  (`_suggest`, `app/importers/service.py`) comparava um slug hifenizado
  (`slugify()` sempre usa `-`) contra o slug armazenado, que usa `_` — então
  **toda propriedade de nome composto** ("Módulo de Young", "Limite de
  escoamento" etc.) nunca era sugerida automaticamente, e só "Densidade"
  (palavra única) por coincidência funcionava. Corrigido comparando os dois
  lados já normalizados; regressão coberta em `test_imports_api.py`.
- ~~**B11** — Playwright (A4) como check obrigatório de CI~~ — job
  `E2E (Playwright)` em `ci.yml`: Python + Node no mesmo runner, Chromium via
  `--with-deps`, `npm run test:e2e`, relatório HTML publicado como artefato
  quando falha. `playwright.config.ts` resolvia o Python fixo em
  `.venv/Scripts/python.exe` (layout Windows) — não existe no runner Ubuntu;
  agora `E2E_API_PYTHON` sobrepõe o caminho, e o workflow passa
  `E2E_API_PYTHON=python`, o que o `setup-python` já deixa no PATH.
  `scripts/protect-main.ps1` ganhou o nome do check e foi rodado contra o
  repositório.
- ~~`black --check` falhava em arquivos anteriores à Fase 5~~ — backend formatado
  por inteiro em commit próprio; `black --check` virou portão de CI.
- ~~Isolamento de testes quebrado com pysqlite~~ — corrigido no `conftest.py`,
  guardado por `test_isolation.py` (ver [DECISIONS.md](DECISIONS.md) D-17).
- ~~Sem CI~~ — `.github/workflows/ci.yml` roda em todo PR e push.
- ~~**A3** — relatório em HTML imprimível~~ — `app/exporters/html.py` renderiza o
  mesmo `Report` que já alimentava CSV e XLSX, com folha de impressão; o PDF sai
  do navegador e nenhuma dependência de geração de PDF entrou no projeto.
  Escape de marcação próprio + CSP `default-src 'none'` como camada
  independente.
- ~~**M7** — unicidade em `material_property_value`~~ —
  `uq_material_property_value_pair` na migration `bfeee728d230`. A migration
  **falha e não apaga nada** se encontrar duplicatas: dizer quais são e deixar a
  escolha com o usuário é preferível a descartar proveniência em silêncio.
- ~~**M3** — acessibilidade~~ — teclado, foco visível nos dois temas, link de
  pular para o conteúdo, rótulos programáticos, contraste AA medido contra a
  superfície mais escura em que cada token aparece ([D-29](DECISIONS.md)) e
  **tabela de dados por figura** ([D-31](DECISIONS.md)), que é o que torna um
  mapa de Ashby legível por leitor de tela. O axe roda sobre as primitivas e
  sobre as telas principais dentro do `npm run test`
  (`apps/web/app/routes.a11y.test.tsx`); a lista do que só se verifica à mão
  está em [11-usabilidade.md](11-usabilidade.md) §6. A metade de **desempenho**
  do item não foi feita e virou **M8**.
- ~~README afirmava que a CI bloqueia o merge~~ — passou a ser verdade com A1;
  antes disso o texto foi corrigido para não prometer garantia que não havia.
- ~~**A1** — checks de CI obrigatórios~~ — ruleset `CI obrigatoria em main`
  exigindo `Backend (Python 3.11)`, `Backend (Python 3.12)` e `Frontend`, **sem
  ator de exceção** (vale para o dono do repositório também) e com a branch
  obrigada a estar atualizada com `main` antes do merge. Só foi possível porque
  o repositório passou a ser **público**: no GitHub Free a proteção de branch
  não existe em repositório privado, e tanto `PUT /branches/main/protection`
  quanto `POST /rulesets` respondiam
  `403 — "Upgrade to GitHub Pro or make this repository public"`
  (ver [DECISIONS.md](DECISIONS.md) D-22). Reaplicável e auditável por
  `scripts/protect-main.ps1`, que é idempotente.
