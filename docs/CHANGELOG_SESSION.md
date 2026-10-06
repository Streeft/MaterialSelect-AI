# Registro de sessões

Uma seção por sessão de trabalho, **da mais recente para a mais antiga**. O
arquivo respondia a "o que mudou na última sessão" enquanto houve uma só; com
quatro, guardar apenas a última apagaria justamente o que explica por que o
código está como está.

As sessões 1 e 2 foram escritas ao vivo. A seção da **sessão 2 foi reconstruída
depois**, a partir do `git log` e do `DECISIONS.md` — está marcada como tal, e é
por isso que ela tem menos detalhe de processo que as outras.

| Sessão | Quando | O que | Backend | Frontend |
|---|---|---|---|---|
| [53](#sessão-53--061026--vinculação-automática-de-processos-demo-aos-materiais-de-teste-por-classe) | 06/10/2026 | Script idempotente `link_demo_processes` e migração Alembic `b7d219fa82de` para vincular automaticamente processos de conformação demo aos materiais de teste criados por usuários com base na classe do material (`metais`, `polimeros`, etc.), destravando o Eco Audit e o Dimensionador de Custo | 3854 → 3857 | 778 (inalterado) |
| [52](#sessão-52--061026--segunda-rodada-do-pr-100-um-pdf-por-vez-e-um-relógio-para-o-upload) | 06/10/2026 | A segunda revisão do PR #100 achou que os limites de memória do upload eram por leitura (três uploads de 8 KB simultâneos: +624 MB) e que a CPU não tinha limite (uma forma redesenhada não decodifica nada): um PDF por vez no processo (três simultâneos: 247 MB), relógio a cada parse e 30 s por upload, pypdf fixado em `<6.20` com autoverificação que recusa todo PDF se os medidores não forem alcançados, a lista de remoção recusa os erros sem dois-pontos e o `Cérebro/` na frente, e nenhuma recusa cita a linha (D-101, segunda rodada) | 3825 → 3854 | 762 (inalterado) |
| [51](#sessão-51--061026--a-revisão-do-pr-100-o-orçamento-é-cobrado-a-cada-decodificação) | 06/10/2026 | A revisão do PR #100 achou que o orçamento do upload não segurava uma página só (160 formas de 3,9 MB num PDF de 0,66 MB: 639 MB de pico) e que um prefixo mal escrito em `removidos.txt` passava em silêncio: o orçamento passou a ser cobrado a cada decodificação (76 MB de pico no mesmo arquivo), o upload limita o que o pypdf lê de uma vez (formas aninhadas), a lista de remoção falha fechada em todos os leitores, a regra das páginas de fora ficou proporcional, as recusas ficaram em português, a releitura forçada ganhou nota e rótulo próprios e os ≈600 MB viraram ≈528 MB (D-101, atualização da revisão do PR #100) | 3781 → 3825 | 762 (inalterado) |
| [50](#sessão-50--061026--os-dois-ashby-em-português-fica-o-de-2012) | 06/10/2026 | Dos dois scans do Ashby em português fica o de 2012 (4ª ed., provavelmente o mais novo, não confirmado): o sem data e a cópia byte a byte dele na raiz saem do git, do manifesto e do RAG pela lista de remoção, pelos caminhos e pelo conteúdo, em linhas `mantido-no-historico:` que a limpeza do histórico não lê (D-101, atualização dos dois Ashby) | 3770 → 3781 | 762 (inalterado) |
| [49](#sessão-49--061026--a-revisão-do-pr-98-o-teto-era-por-fluxo-não-por-documento) | 06/10/2026 | A revisão do PR #98 achou que o teto de 500 MB era por fluxo e a memória somava as páginas, que um livro lido pela metade passava em silêncio e nunca era relido, e que o upload dos Cadernos tinha a mesma soma: o pypdf solta as cópias entre páginas, o Cérebro lê com 200 MB por fluxo, orçamento por documento e falha acima de 20% das páginas de fora, a linha virou `::warning::` com a classe do erro, o `status` ganhou rótulo próprio e `ingerir` ganhou `forcar`; o upload lê com 4 MB por fluxo, 32 MB por arquivo e páginas contadas antes (endurecimento de segurança; D-101, atualização da revisão do PR #98) | 3743 → 3770 | 762 (inalterado) |
| [48](#sessão-48--061026--phasebars-no-eco-audit-e-reordenação-de-estágios-por-arraste-opções-1-e-2) | 06/10/2026 | Barras de energia e carbono por fase no Eco Audit, individual e comparativo (`PhaseBars`, Opção 1), e reordenação dos estágios da Seleção por arraste, com os botões ↑/↓ mantidos para teclado (`reorderStages`, Opção 2); veio pelo PR #101 em `main`, registrada aqui no merge com o ramo do PR #100 | 3743 (inalterado) | 762 → 778 |
| [47](#sessão-47--061026--o-teto-de-descompressão-do-pypdf-e-os-dois-ashby) | 06/10/2026 | A segunda `ingerir` saiu com 1 por dois Ashby barrados pelo teto de 75 MB por fluxo do pypdf: o Cérebro lê com teto de 500 MB, no `ContextVar` do pypdf (piso 6.18), e pula a página que não decodifica dizendo quantas; o upload dos Cadernos mantém o padrão e falha na primeira página ilegível (D-101, atualização do teto de descompressão) | 3725 → 3743 | 762 (inalterado) |
| [46](#sessão-46--061026--o-nul-do-pypdf-e-a-ingestão-que-não-para-num-documento) | 06/10/2026 | A primeira `ingerir` em produção morreu com `PostgreSQL text fields cannot contain NUL (0x00) bytes`: o NUL sai na fonte (`storable_text()` nos leitores, no fatiador e nas fontes dos Cadernos), e um documento que o banco recusa volta ao *savepoint* e sai `falhou` sem parar a execução; erro de banco num CLI imprime só a classe, e o log daquela execução, com texto do livro, espera o dono apagá-lo (D-101, atualização de 06/10) | 3699 → 3725 | 762 (inalterado) |
| [45](#sessão-45--300926-a-051026--o-cérebro-entra-em-produção) | 30/09 a 05/10/2026 | O Cérebro entra em produção pelo GitHub Actions: workflow `conhecimento.yml` (ingestão que baixa do LFS só o que o banco não tem, vetores de 768 dimensões com a sobra noturna da cota gratuita, retrato), ingestão segura contra ponteiro LFS, cópias e versão ilegível, busca sobre índice em memória e a identidade de vetor em `/api/health` (D-101); no merge com `main`, a ingestão direcionada da sessão 39 (`--file`, `--force`) sob as mesmas garantias e a entrada `arquivos` de `ingerir`; na revisão final, o `embed` respeita a lista de remoção | 3338 → 3552 no ramo; 3395 → 3624 com o merge; 3660 com a revisão final; 3699 com o merge do PR #94 | 753 (inalterado no ramo); 762 com o merge do PR #94 |
| [44](#sessão-44--021026--lote-quádruplo-de-melhorias-seleção-busca-dimensionador-e-eco-audit-opções-1-a-4) | 02/10/2026 | Lote quádruplo de melhorias: duplicação de estágio (P0-1), busca ponderada e destaque (P1-1), seções circulares no solver (P2) e comparação lado a lado no Eco Audit (P3) | 3395 → 3407 | 753 → 762 |
| [43](#sessão-43--021026--deslocamentos-astronômicos-positivos-e-calc-dominante-no-extrator-html-opção-1) | 02/10/2026 | Descarte de caixas com deslocamento positivo astronômico e avaliação afim de operando negativo dominante em `calc()` no extrator de HTML (D-97/D-99, Opção 1) | 3382 → 3395 | 753 (inalterado) |
| [42](#sessão-42--021026--herança-de-css-visibility-e-resgate-por-visibilityvisible-no-extrator-html-opção-1) | 02/10/2026 | Herança estrita de CSS `visibility` e resgate de elementos filhos via `visibility:visible` no extrator de HTML dos Cadernos (D-97/D-99, Opção 1) | 3376 → 3382 | 753 (inalterado) |
| [41](#sessão-41--011026--correção-de-guardrails-de-ia-e-exportação-nativa-pptx-b2) | 01/10/2026 | Correção de guardrails de IA (números em trechos do RAG e separador de milhar) e exportador PPTX nativo do Report com endpoints e interface (B2, Opção A) | 3362 → 3376 | 752 → 753 |
| [40](#sessão-40--011026--localizador-de-citação-do-markdown--links-sem-p-1-1-d-100) | 01/10/2026 | Localizador de citação do Markdown sem `p. 1-1`, formatação de páginas únicas `p. X` e sincronização frontend/backend (D-100, Opção 1) | 3356 → 3362 | 751 → 752 |
| [39](#sessão-39--011026--indexação-direcionada-do-linksmd-e-expurgo-do-material-de-curso-a7) | 01/10/2026 | Indexação direcionada de arquivos no RAG (`Links.md`), ação `conhecimento_indexar_links` no Actions e fechamento do item A7 (D-100) | 3347 → 3356 | 751 (inalterado) |
| [38](#sessão-38--300926--concorrência-das-cotas-em-postgresql-na-ci-opção-b) | 30/09/2026 | Concorrência multithread das cotas dos Cadernos exercitada contra PostgreSQL 16 na CI (D-97/D-99, Opção B) | 3343 → 3347 | 751 (inalterado) |
| [37](#sessão-37--300926--linha-de-tabela-com-pipes-não-é-mais-heading-d-97) | 30/09/2026 | Linha de tabela com pipes não é mais tratada como heading pelo fatiador (chunking.py, D-97) | 3338 → 3343 | 751 (inalterado) |
| [36](#sessão-36--300926--o-material-de-curso-sai-do-histórico) | 30/09/2026 | O material de curso sai do banco de produção e do histórico do git (D-100): `main` `873dd53` → `b7dd105`, árvore idêntica, verificação a 0; pendências do autor registradas | 3338 (inalterado) | 751 (inalterado) |
| [35](#sessão-35--290926--o-material-de-curso-sai-do-cérebro) | 29/09/2026 | O material de curso da ENG02016 sai do Cérebro: 71 arquivos fora do repositório, a lista de remoção como fonte única, a ferramenta que apaga do banco com simulação primeiro — por caminho ou por conteúdo —, o `Links.md` indexado e o guia de limpeza do histórico (D-100) | 3270 → 3338 | 751 (inalterado) |
| [34](#sessão-34--290926--cadernos-o-lote-de-pendências-das-fases-3-e-4) | 29/09/2026 | Cadernos: nove pendências das fases 3 e 4 (velocidade no vídeo, um rasterizador só, corte da nota, cor das marcas, duplicata da OpenAlex, troca de provedor, atribuição na conversa, nós ocultos por CSS inline, cota atômica) e as três rodadas de correção da revisão final (D-99) | 2979 → 3270 | 735 → 751 |
| [33](#sessão-33--280926-a-290926--cadernos-fase-4-o-estúdio-visual-e-sonoro) | 28 e 29/09/2026 | Cadernos, fase 4: resumo em áudio e em vídeo pela voz do navegador, apresentação de slides com PPTX e infográfico com layout do backend; o dado em destaque sem isenção e a unidade com maiúsculas (D-98) | 2651 → 2979 | 608 → 735 |
| [32](#sessão-32--250926-a-280926--cadernos-fase-3-fontes-externas) | 25 a 28/09/2026 | Cadernos, fase 3: site, YouTube com transcrição colada, OpenAlex, Wikipédia e busca na web pelo Gemini. Tudo por um portão anti-SSRF, com a origem e a licença coladas à citação e custo zero (D-97) | 1966 → 2651 | 563 → 608 |
| [31](#sessão-31--250926--auditoria-do-pr-78-curva-custo--lote-do-antigravity) | 25/09/2026 | Auditoria do PR #78 (curva custo × lote, execução agêntica externa): comportamento correto, cobertura de teste devolvida e o registro que faltava, escrito (D-96) | 1963 → 1966 | 563 (inalterado) |
| [30](#sessão-30--250926--o-estúdio-de-texto-dos-cadernos) | 25/09/2026 | Cadernos, fase 2: o Estúdio de texto — relatório, cartões, teste, tabela e mapa mental, gerados em segundo plano e conferidos item a item (D-94) | 1917 → 1966 | 536 → 554 |
| [29](#sessão-29--250926--cadernos-o-notebooklm-dentro-do-app-e-o-gemini-gratuito) | 25/09/2026 | Cadernos, fase 1: fontes privadas, conversa citada com número conferido, guia, notas e cota, na tela de três painéis do NotebookLM (D-92); o Gemini gratuito como IA oficial, por configuração (D-93) | 1856 → 1906 | 505 → 536 (com os 6 do D-91, mesclado de main) |
| [28](#sessão-28--240926-a-280926--turma-de-terça-processos-no-objetivo-ux-guiada-pesos-com-limite-e-a-ia) | 24 a 28/09/2026 | Preparação para a turma: processos no Objetivo, Seleção guiada, superfícies enxutas, pesos com limite 1, Objetivo antes de Restrições e a IA do laudo (D-84 a D-89) | 1785 → 1856 | 431 → 505 |
| [27](#sessão-27--240926--o-portão-vira-um-modo-acesso-aberto-para-uma-turma-d-83) | 24/09/2026 | Acesso aberto para estudantes com qualquer conta Google, catálogo compartilhado protegido, e o workflow que abre e fecha (D-83) | 1755 → 1785 | 422 → 427 |
| [26](#sessão-26--21092026-a-22092026--a-auditoria-de-produção-o-seed-desconectado-d-71-e-a-exclusão-de-demo-por-um-flag-d-72) | 21 e 22/09/2026 | Auditoria ao vivo da produção; o defeito do seed desconectado (D-71) achado e corrigido; mecanismo de exclusão de dado demo por `is_demo` (D-72) e a regra escrita para qualquer agente/IDE | 1727 → 1741 | 368 (inalterado) |
| [25](#sessão-25--210926--a-unidade-de-leitura-fecha-a-matriz) | 21/09/2026 | Unidade de leitura por propriedade (D-70) — ler não é guardar. **Matriz a 32 de 32 (100%)** | 1683 → 1727 | 356 → 368 |
| [24](#sessão-24--160926--p4-o-battery-designer-e-a-reconciliação-do-pr-56) | 16/09/2026 | P4 Battery Designer (D-69) — a álgebra do pack é argumento, a química é dado medido. **Fecha a última linha em zero da matriz**; reconcilia o PR #56 | 1656 → 1683 | 349 → 356 |
| [23](#sessão-23--160926--p3-os-sandwich-panels-fecham-a-faixa) | 16/09/2026 | P3 Sandwich Panels (D-68) — o painel passa do limite de Voigt, e é assim que se sabe que não é mistura. **Fecha a faixa P3** | 1629 → 1656 | 345 → 349 |
| [22](#sessão-22--150926-a-160926--p3-o-synthesizer) | 15 e 16/09/2026 | P3 Synthesizer: registro derivado com a derivação a tiracolo (D-67) — a regra é da propriedade, não da receita | 1561 → 1629 | 334 → 345 |
| [21](#sessão-21--150926--p3-o-eco-audit) | 15/09/2026 | P3 Eco Audit: cinco fases, dois modelos de uso, pódio recusável (D-66) | 1505 → 1561 | 321 → 334 |
| [20](#sessão-20--150926--p3-o-custo-da-peça-e-o-custo-como-objetivo) | 15/09/2026 | P3 Part Cost Estimator + objetivo custo nos casos de carga (D-65) | 1432 → 1505 | 308 → 321 |
| [19](#sessão-19--150926--p2-restante-o-solver-e-o-index-finder) | 15/09/2026 | P2 restante (Engineering Solver e Performance Index Finder, D-64) — fecha a faixa P2 | 1341 → 1432 | 299 → 308 |
| [18](#sessão-18--140926--p2-o-fim-do-fluxo-do-manual) | 14/09/2026 | P2 (Find Similar, registro de referência e diferença percentual, D-63) | 1297 → 1341 | 286 → 299 |
| [17](#sessão-17--140926--p1-4-o-catálogo-ganha-dono-e-o-usuário-ganha-espaço) | 14/09/2026 | P1-4 (`My Records`: registro próprio, favoritos e recentes, D-62) — fecha a faixa P1 | 1234 → 1297 | 277 → 286 |
| [16](#sessão-16--130926-a-140926--p1-3-a-taxonomia-vira-registro-e-o-segundo-universo-se-navega) | 13 e 14/09/2026 | P1-3 (browse: registro de família, árvore navegável, trilha e a ficha do processo, D-61) | 1209 → 1234 | 253 → 277 |
| [15](#sessão-15--110926-a-130926--p1-2-o-gráfico-passa-a-reprovar) | 11 e 13/09/2026 | P1-2 (Chart Stage: a região de um plano como critério, D-60) — o único nível 1 da matriz de maturidade | 1141 → 1209 | 232 → 253 |
| [14](#sessão-14--100926-a-110926--p0-4-processo-passa-a-ter-atributo-e-o-exercício-11-fecha) | 10 e 11/09/2026 | P0-4 (atributos de processo com proveniência, envelope de capacidade e discreto, D-59) — o quarto e último gargalo P0 | 1076 → 1141 | 225 → 232 |
| [13](#sessão-13--090926-a-100926--p0-1-p0-2-e-p0-3-a-plataforma-de-seleção-ganha-pilha-segundo-universo-e-escolha-de-resultado) | 09 e 10/09/2026 | P0-1 (pilha de estágios, D-56), P0-2 (universo de processos, D-57) e P0-3 (universo do resultado, D-58), a partir da análise de lacunas contra os manuais do EduPack | 884 → 1076 | 197 → 225 |
| [12](#sessão-12--080926--a-ferramenta-no-ar-e-a-camada-de-ia-ligada-em-produção) | 08/09/2026 | Deploy em produção (Vercel + Fly + Neon, D-52), caminho de implantação sem terminal e a camada de IA ligada de verdade | 872 → 884 | 197 (inalterado) |
| [11](#sessão-11--010926-a-020926--m5-topsis-promethee-ii-ahp-e-m6-restrições-aninhadas-entregues-via-sdd) | 01 e 02/09/2026 | M5 (TOPSIS, PROMETHEE II, AHP) e M6 (restrições aninhadas), dez tarefas mais uma rodada de correção da revisão final de branch, via SDD | 831 → 872 | 165 → 179 |
| [10](#sessão-10--270826-a-310826--backlog-b1b10-entregue-por-inteiro-via-sdd) | 27 a 31/08/2026 | Backlog B1–B10 (dez tarefas de baixa prioridade) entregue por inteiro, dirigido por subagentes | 795 → 831 | 162 → 165 |
| [9](#sessão-9--260826-a-270826--rag-sobre-o-cérebro-d-47-e-a-pr-26-fechada-e-remesclada) | 26 e 27/08/2026 | RAG sobre o Cérebro (D-47, 18 tarefas via SDD), PR #26 investigada/fechada e depois remesclada pelo autor | 713 → 795 | 157 → 162 |
| [8](#sessão-8--240826-a-250826--reconciliação-de-branches-m9-e-o-checkout-do-stripe-testado-ao-vivo) | 24 e 25/08/2026 | Reconciliação de branches, M9 (portão de assinatura, D-46) e checkout do Stripe testado ao vivo | 639 → 713 | 148 → 157 |
| [7](#sessão-7--210826--triagem-de-licenciamento-m1) | 21/08/2026 | Triagem de licenciamento (M1) | 632 → 639 | 148 (inalterado) |
| [6](#sessão-6--210826--estudo-de-caso-didático-a2) | 21/08/2026 | Estudo de caso didático (A2) | 630 → 632 | 148 (inalterado) |
| [5](#sessão-5--210826--auditoria-m2-e-a-instalação-do-ambiente-de-assistente) | 21/08/2026 | Fase 7: auditoria de alterações (M2) | 617 → 630 | 148 (inalterado) |
| [4](#sessão-4--110826-a-120826--fase-9-e-a-varredura-que-a-fechou) | 11 e 12/08/2026 | Fase 9 (seis frentes) e a varredura de fechamento | 436 → 591 | 123 → 141 |
| [3](#sessão-3--110826--os-provedores-reais-da-camada-de-ia) | 11/08/2026 | Fase 6: provedores reais de IA | 391 → 436 | 123 |
| [2](#sessão-2--050826-a-100826--fase-7-parcial-ci-obrigatória-e-fase-8) | 05/08 a 10/08/2026 | Fase 7 (relatório HTML), CI obrigatória, Fase 8 (redesign) | 362 → 391 | 44 → 123 |
| [1](#sessão-1--300726-a-040826--fases-5-a-7) | 30/07 a 04/08/2026 | Fases 5, 6 e 7 (exportação) | 169 → 362 | 13 → 44 |

As sessões entre a 11 e a 12 — o patch de design "Prisma" (D-49, D-50), o
upgrade de segurança S1 e a rodada de desempenho — **não têm seção própria
aqui**. O registro delas ficou em `TODO.md` ("Débitos já quitados") e em
`DECISIONS.md`.

---

## Sessão 53 — 06/10/26 — Vinculação automática de processos demo aos materiais de teste por classe

**O pedido.** O usuário relatou não conseguir validar se o Eco Audit estava funcionando corretamente para os materiais cadastrados/testados por ele: *"não consigo validar se o Eco Audit está funcionando corretamente, pois não tenhum nenhum processo cadastrado que faz este material, e sem processo não há auditoria: é o processo que diz quanta energia a conformação gasta e quanto material foi preciso comprar. Com base nisso, crie alguns processos de teste para imputar para que eu possa testes"*, seguido de: *"crie um script/seed de migração para vincular automaticamente os processos demo aos meus materiais de teste"*.

**O problema.** O módulo Eco Audit ([D-66](DECISIONS.md)) calcula a fase de manufatura e a massa comprada da peça (`massa / (1 - f)`) a partir dos processos compatíveis vinculados ao material na tabela associativa `material_process`. No catálogo demo inicial, os processos compatíveis com dados ambientais (`energia-processo`, `co2-processo`, `fracao-refugo`) estavam vinculados apenas aos materiais pré-semeados; quando o usuário cadastra novos materiais de teste (ou importa lotes), esses materiais nasciam sem processos associados, impedindo a execução e validação da auditoria ecológica.

**O que mudou:**

- **Script idempotente `link_demo_processes` (`apps/api/app/db/link_demo_processes.py`):**
  - Mapeamento determinístico das cinco grandes famílias de materiais para processos compatíveis com atributos ambientais completos:
    - `metais`: fundição em areia (`fundicao-areia`), forjamento (`forjamento`), extrusão (`extrusao`), usinagem convencional (`usinagem-convencional`), solda MIG (`solda-mig`), anodização (`anodizacao`), parafusamento (`parafusamento`), pintura líquida (`pintura`).
    - `polimeros`: moldagem por injeção (`moldagem-injecao`), extrusão (`extrusao`), adesivagem (`adesivagem`), pintura líquida (`pintura`).
    - `ceramicas`: prensagem e sinterização (`prensagem-sinterizacao`), retificação (`retificacao`).
    - `compositos`: moldagem por compressão (`moldagem-compressao`), usinagem convencional (`usinagem-convencional`), adesivagem (`adesivagem`), pintura líquida (`pintura`).
    - `elastomeros`: moldagem por compressão (`moldagem-compressao`), moldagem por injeção (`moldagem-injecao`), extrusão (`extrusao`), adesivagem (`adesivagem`).
  - Função pública `link_demo_processes(db, material_ids=None, only_active=True) -> dict[str, int]` idempotente: insere apenas associações inexistentes (`ON CONFLICT DO NOTHING`), preserva vínculos manuais já existentes e suporta vincular materiais específicos ou toda a base.
  - Ponto de entrada CLI `python -m app.db.link_demo_processes` com argumentos `--all` (inclui inativos) e `--materials` (IDs específicos).
- **Migração Alembic `b7d219fa82de` (`apps/api/alembic/versions/b7d219fa82de_vincular_processos_demo_por_classe.py`):**
  - Revision `b7d219fa82de`, down_revision `4dbd71e64b6b`.
  - Executa a vinculação idempotente via SQL direto com junção em `material`, `material_class` e `process` durante `alembic upgrade head`, garantindo que deploys e ambientes existentes (Neon/Fly/local) atualizem automaticamente os materiais de teste sem intervenção manual.
- **Testes unitários (`apps/api/app/tests/test_link_demo_processes.py`):**
  - 3 novos testes cobrindo idempotência (segunda execução reporta 0 links novos), vinculação para novos materiais do usuário e respeito ao filtro de materiais ativos.

**Como se sabe que passa:**
- 3 testes unitários novos passam em SQLite em memória e em PostgreSQL.
- Migração Alembic executa perfeitamente nos dois sentidos (`upgrade` e `downgrade`).
- Sem `POSTGRES_TEST_URL`, 3851 passam e 6 pulam; na CI com PostgreSQL, todos os 3857 testes passam (0 skips).

**Números:** Backend 3854 → **3857** (+3 testes). Frontend 778 (inalterado).

---

## Sessão 52 — 06/10/26 — Segunda rodada do PR #100: um PDF por vez e um relógio para o upload

**O pedido.** Corrigir tudo o que a segunda revisão do PR #100 achou: dois
problemas Importantes (N1, N2) e três menores (m1–m3), e o texto que ela
apontou como impreciso. Feito por cima de `6ab8980`; o PR ainda não estava
mesclado.

**O que mudou** ([D-101](DECISIONS.md), atualização "segunda rodada"):

- **N1 — um PDF por vez no processo.** Os limites de memória eram por
  leitura: duas leituras no teto somavam +428 MB, três +624 MB. `read_upload`
  toma `_UPLOAD_PDF_SLOT` (`BoundedSemaphore(1)`), espera até 15 s e então
  recusa com "Outro PDF está sendo lido agora no servidor; tente enviar de novo
  em instantes."; a vaga é solta em `finally`. O Cérebro não a toma. Medido:
  três simultâneos, 247 MB de pico (eram 643), servidos em fila em 18 s.
- **N2 — relógio no upload.** O medidor confere o relógio também no começo de
  cada parse (uma forma desenhada de novo é lida de novo sem decodificar), e o
  upload tem `UPLOAD_MAX_SECONDS = 30` (400 páginas de texto denso leem em 3 a
  6 s aqui). A recusa diz o tempo em segundos (antes, "0 min"). Medido: 400
  desenhos de 0,4 MB param em 30,3 s, 40 de 3,9 MB em 35,3 s (o que passa é o
  parse de um fluxo). Corrigida a frase falsa "cerca de um minuto de CPU" em
  `readers.py` e no D-101.
- **m1 — pypdf fixado e autoverificado.** `pypdf>=6.18,<6.20` nos dois lugares
  do `pyproject.toml` (o `Dockerfile.api` e a CI instalam dele). O primeiro
  upload de cada processo lê um PDF mínimo sob um medidor e confere uma
  decodificação e dois parses; se não chegarem, log `ERROR` e todo upload de
  PDF recusado — nunca no import, nunca uma exceção.
- **m2 — lista de remoção.** Recusados também: espaço ou tab no lugar dos
  dois-pontos, os dois-pontos de largura cheia, `mantido-no-historico/…`,
  `sha256 <hex>` e um caminho com `Cérebro/` na frente (mensagem: os caminhos
  são relativos ao KNOWLEDGE_DIR). O shell do passo 4 do docs/17 recusa as
  mesmas formas. A lista real lê igual (16, 14, 35, 2).
- **m3.** As duas mensagens antigas da lista não citam mais a linha.
- Uma consequência dita no D-101: a decodificação que passa do orçamento de
  bytes termina, mas o fluxo que ela produziu não é mais lido; dois testes de
  orçamento ganharam uma página de fora.

**Como se sabe que passa.** 29 testes novos: a vaga (o segundo upload espera
e é recusado sem entrar; esperando o bastante, lê depois do primeiro; a vaga
é solta em sucesso, PDF quebrado e excesso de páginas; o Cérebro não a toma),
o relógio (uma forma em cache desenhada 200 vezes parada em poucos parses, com
uma decodificação só; o Cérebro conferindo a cada parse; a unidade do tempo),
a autoverificação (passa no pypdf real; um decodificador não alcançado recusa
todo PDF, uma verificação só, linha de log, TXT continua; um erro dentro dela
é um "não"), e as novas formas da lista no leitor e no shell, e as mensagens
sem a linha.

**Números.** Backend 3825 → 3854 (sem `POSTGRES_TEST_URL`, 3848 passam e 6
pulam). Frontend 762, inalterado. `ruff` e `black` limpos.

**Pendente, e só o autor faz**, depois do merge: **Deploy da API**.

## Sessão 51 — 06/10/26 — A revisão do PR #100: o orçamento é cobrado a cada decodificação

**O pedido.** Corrigir tudo o que a revisão do PR #100 achou: dois problemas
Importantes (I1, I2) e cinco menores (M1–M5). Feito por cima de `1212cee`, na
mesma branch; o PR #100 ainda não estava mesclado.

**O que mudou** ([D-101](DECISIONS.md), atualização da revisão do PR #100):

- **I1 — o orçamento do upload não segurava uma página só.** Ele era conferido
  entre páginas (nunca depois da última), e o pypdf decodifica e guarda cada
  forma XObject de uma página dentro de um `extract_text` só: a sonda da
  revisão, uma página de 160 formas distintas de 3,9 MB num PDF de 0,66 MB,
  era lida com 639 MB de pico. `readers._metered_decoding` põe um medidor na
  frente de `pypdf.filters.decode_stream_data` (o caminho de toda
  decodificação, conferido nos fontes do 6.18.0 e do 6.19.0), ativo só dentro
  de `read_pdf` por um `ContextVar`, restaurado também por exceção e invisível
  a outra thread; instalado uma vez, sob trava, e nunca removido. A
  decodificação que passa do orçamento termina e a próxima é recusada por uma
  `BaseException` (`_DecodeBudgetSpent`), porque o pypdf engole `Exception` em
  cada forma. A mesma sonda agora é recusada na página 1 em 0,2 s com 76 MB
  de pico; 10 formas (39 MB), antes lidas, também. A soltura por página
  (`_release_decoded`) fica, agora só soltando.
- **O parse de formas aninhadas, achado ao medir I1.** Uma forma de 3,9 MB de
  operadores custa +225 MB enquanto o pypdf a lê, e duas, uma dentro da outra,
  +420 MB — com 8 MB decodificados, dentro do orçamento. `UPLOAD_MAX_PARSED_BYTES`
  (4 MB, o teto por fluxo) limita o que se lê de uma vez: o medidor envolve
  `ContentStream.__init__`, soma cada fluxo de conteúdo vivo e o solta por
  `weakref.finalize`. Aninhadas no teto: recusado com 244 MB de pico (o custo
  de um fluxo no teto); oito lado a lado: lido, 269 MB e 48 s.
- **M5.** O prazo de 15 min do Cérebro é conferido a cada decodificação e
  entre páginas; o texto diz que nunca no meio do parse de um fluxo.
- **I2 — a lista de remoção falha fechada.** Uma linha cujo primeiro trecho tem
  dois-pontos e não é `sha256:` nem `mantido-no-historico:`, escritos
  exatamente assim, é recusada com o número da linha e os prefixos que
  existem, sem citar a linha. Saem diferente de 0 antes de tocar qualquer
  coisa: ingestão, plano do LFS, `embed`, `prune`, gerador do manifesto,
  `status` (que imprime o retrato e então dá `::error::`) e o bloco do passo 4
  do docs/17 (que apaga o arquivo de saída). Dois-pontos num trecho seguinte
  continua caminho. A lista real lê igual: 16 caminhos (14 para a limpeza), 35
  `sha256:`, 2 mantidos.
- **M1.** Falha quem tem mais de 20% das páginas de fora **e** ao menos duas
  delas ou metade do documento: 2 de 3, 2 de 4, 2 de 9 e 1 de 2 falham; uma
  página nunca derruba documento de 3 páginas ou mais.
- **M2.** Abrir um PDF que o pypdf recusa não mostra mais o texto em inglês
  dele, nem a página ilegível de um upload; a recusa do teto de 4 MB por fluxo
  (que fica) diz a causa provável e a saída: exportar o PDF "achatado".
- **M3.** A releitura forçada dos mesmos bytes que falha grava "A releitura
  forçada (sha256 …)", e o `status` a mostra como `RELEITURA FALHOU`.
- **M4.** Os cinco "≈600 MB" viraram ≈528 MB.

**Como se sabe que passa.** 44 testes novos: a sonda da revisão em escala
(20 formas de 1 MB com orçamento de 5 MB: recusada na página 1, cinco
decodificações em vez de vinte, pico rastreado abaixo de 12 MB), a última
página e o documento de uma página presos ao orçamento, a página do Cérebro
parada no meio contada como de fora, o medidor só dentro da leitura (e não
noutra thread), formas aninhadas recusadas e lado a lado lidas, o prazo
conferido a cada decodificação, as mensagens de abertura, as linhas da regra
proporcional, a releitura forçada no banco e no `status`, e os onze prefixos
mal escritos recusados em cada leitor e no shell do docs/17. Mutantes: sem a
recusa do prefixo, 17 testes caem; sem o medidor na decodificação, 4; sem o
limite do parse, 1.

**Números.** Backend 3781 → 3825 (sem `POSTGRES_TEST_URL`, 3819 passam e 6
pulam). Frontend 762, inalterado. `ruff` e `black` limpos; `actionlint` limpo
em `conhecimento.yml`.

**Pendente, e só o autor faz**, depois do merge: **Deploy da API** — o
medidor do upload só existe em produção depois dele —, e os passos que a
sessão 50 já deixou ([TODO.md](TODO.md) A7, item 3).

## Sessão 50 — 06/10/26 — Os dois Ashby em português: fica o de 2012

**O pedido.** O autor decidiu o item "Os dois Ashby em português" do TODO:
ficar só com a edição mais nova. Fica
`01-Bibliografia/Michael Ashby (Auth.)-Seleção De Materiais No Projeto Mecânico (2012).pdf`
(4ª edição, 152 MB); sai `01-Bibliografia/Selecao_de_Materiais_no_Projeto_Mecanico.pdf`
(sem data, 103,5 MB). Que o de 2012 é o mais novo é **provável, não
confirmado** — ninguém comparou as folhas de rosto, e baixar os dois do LFS
gastaria banda. O histórico do git **não** é reescrito por isso.

**O que mudou** ([D-101](DECISIONS.md), atualização "os dois Ashby"; nota no
[D-100](DECISIONS.md)):

- O ponteiro saiu do git e a entrada saiu do `manifesto.json` (121 → 120
  entradas, o mesmo formato). Saiu junto a cópia byte a byte dele na raiz do
  Cérebro, `Selecao_de_Materiais_no_Projeto_Mecanico.pdf` (o mesmo oid,
  conferido no ponteiro; o manifesto não a declarava) — num segundo commit, a
  pedido do autor, que quer só a edição nova também na árvore. As outras 17
  cópias avulsas da raiz ficam. Os extratos de capítulo não mudaram.
- `Cérebro/removidos.txt` ganhou os dois caminhos e o `sha256:` do oid do
  ponteiro. O caminho de `01-Bibliografia/` casa a linha `FALHOU` da segunda
  `ingerir`; o conteúdo casa qualquer outra cópia com os mesmos bytes.
- **A limpeza do histórico não leva este caminho.** A conversão do passo 4 do
  guia de limpeza (`docs/17`) mandaria toda linha de caminho para o
  `git filter-repo`. Um terceiro tipo de linha, `mantido-no-historico:<caminho>`,
  lido pelo mesmo `app/knowledge/removal.py`: casa como caminho no banco, na
  ingestão, no `embed` e no gerador do manifesto, e fica fora de
  `RemovalList.history_purge_entries`; o `grep -v` do passo 4 ganhou
  `-e '^mantido-no-historico:'`. Um caminho escrito dos dois jeitos é limpo.
- Os números do Cérebro, lidos dos ponteiros: 239 ponteiros (eram 241), 119
  objetos LFS distintos (eram 120); a primeira ingestão completa baixa 119
  PDFs, ≈528 MB (503,1 MiB), em vez de 120 e ≈631 MB; continuam 120 cópias
  byte a byte (17 na raiz, 103 fichas) — a cópia que saiu era de um arquivo
  que também saiu. Atualizados no README do Cérebro, `13-deploy.md`,
  `PROJECT_CONTEXT.md`, `docs/CLAUDE.md`, `CLAUDE.md` e TODO; os registros de
  sessões anteriores ficam com os números da época.

**Como se sabe que passa.** 11 testes novos: o leitor (o prefixo casa como
caminho e prefixo de pasta, sai de `history_purge_entries`, é validado como
qualquer caminho, perde para a linha comum); a lista real (o Ashby e a cópia da raiz saem
pelo caminho e pelo conteúdo, o de 2012 e os extratos não, a limpeza continua com
as mesmas 14 linhas); a ingestão pula o caminho e uma cópia com os mesmos bytes
em outro caminho e indexa a edição que fica; o plano do LFS, com a lista real,
não baixa nenhum dos dois ponteiros que saíram, se voltarem; o `prune` lista e apaga a
linha `FALHOU` pelo caminho e a cópia pelo conteúdo; e o bloco de shell do
passo 4 do `docs/17`, rodado sobre a lista real, sai igual a
`history_purge_entries` (sem o `-e` novo, ele falha). `manifesto.json` validado
como JSON.

**Números.** Backend 3770 → 3781 (sem `POSTGRES_TEST_URL`, 3775 passam e 6
pulam). Frontend 762, inalterado. `ruff` e `black` limpos.

**Pendente, e só o autor faz**, depois do merge: **Administração do banco** →
`conhecimento_simular_remocao` (um documento só: `01-Bibliografia/…
sha256:27882628`) → `conhecimento_remover` → **Base de conhecimento (Cérebro)**
→ `ingerir` ([TODO.md](TODO.md) A7, item 3). Sem deploy da API: o `prune` e a
ingestão rodam no runner, do código de `main`.

## Sessão 49 — 06/10/26 — A revisão do PR #98: o teto era por fluxo, não por documento

**O pedido.** Corrigir, pela causa, a revisão feita depois do merge do PR #98:
três achados importantes (I1–I3) e três menores (M1–M3).

**A causa, medida no pypdf 6.19.** O pypdf guarda cada fluxo decodificado no
próprio objeto (`EncodedStreamObject.decoded_self`), e cada objeto resolvido em
`PdfReader.resolved_objects`, enquanto o leitor vive. O teto de 500 MB valia
para um fluxo; a memória crescia com a **soma** das páginas: 8 páginas de
150 MB subiam ~143 MB por página até 1,2 GB de RSS (pico 1,34 GB). E o custo de
um fluxo depende do que ele carrega: imagem embutida ~2× o tamanho, operadores
de texto ou traço ~35× (medido aqui: 1 MB, +35 MB e 1,5 s; 2 MB, +70 MB e
3,4 s; 4 MB, +140 MB e 8,3 s). No upload, o mesmo: 10 páginas de 70 MB num
arquivo de 684 KB, 783 MB de pico — e uma página só de 75 MB de operadores
pediria ~2,6 GB na VM de 512 MB.

**O que mudou** ([D-101](DECISIONS.md), atualização da revisão do PR #98):

- **I1.** `readers._release_decoded`, depois de cada página, conta o que o
  pypdf decodificou e, com mais de 16 MB de cópias guardadas, as solta
  (`decoded_self = None`). O mesmo livro fica plano em ~194 MB (pico 337 MB),
  e mais rápido (4,9 s contra 9,9 s). `CORPUS_MAX_STREAM_BYTES` caiu de 500
  para **200 MB**; o documento ganhou orçamento — `CORPUS_MAX_DECODED_BYTES`
  (16 GB, uma página que bateu no teto conta como o teto) e
  `CORPUS_MAX_SECONDS` (15 min) —, gasto o qual as páginas restantes saem
  como `DocumentBudgetExceeded`. O comentário do teto e o D-101 dizem o que
  ele limita e o que não: uma página patológica de operadores não é
  interrompida no meio.
- **I2.** Mais de 20% das páginas de fora, e ao menos 3, é `falhou` (saída 1;
  nada novo gravado; um livro já indexado mantém a versão anterior; a próxima
  `ingerir` tenta de novo), decidido assim que a conta fecha. A linha
  `PÁGINAS IGNORADAS` é uma anotação `::warning::` (contagens, classe do erro,
  caminho redigido). O `status` dá a esses livros o rótulo
  `PÁGINAS IGNORADAS` com a contagem, soma todos numa linha, chama a nota de
  truncamento de `AVISO` e reserva `VERSÃO ANTERIOR` para a versão nova que
  não pôde ser lida — a contagem vive na frase de `error`
  (`skipped_pages_note`/`skipped_pages_in`, sem migração), e uma versão nova
  que falha carrega a frase da anterior. `conhecimento.yml` ganhou a entrada
  booleana `forcar`, que passa `--force` ao plano do LFS e à ingestão, só
  junto de `arquivos` (recusada sem eles, ou com outra ação), por `env:`.
- **I3 — endurecimento de segurança.** `read_upload` lê com
  `UPLOAD_MAX_STREAM_BYTES = 4 MB` por fluxo (abaixo dos 75 MB do pypdf),
  `UPLOAD_MAX_DECODED_BYTES = 32 MB` por arquivo e o limite de páginas
  conferido **antes** de decodificar a primeira; passar de um deles recusa o
  arquivo em português. O arquivo de 684 KB que custava 783 MB agora é
  recusado na página 1 com 42 MB de pico; 40 páginas de 3 MB, recusadas na 11ª
  com 56 MB. Vale também para o PDF que a busca na web traz.
- **M1.** O motivo de cada página pulada é contado pelo nome da classe
  (`ExtractedText.skip_reasons`): na nota, na linha da CLI, na falha. Nunca a
  mensagem.
- **M2.** Um fluxo pequeno que toda página usa fica decodificado (uma vez só,
  testado); um grande é solto e decodificado de novo, e cada vez conta no
  orçamento. O fluxo acima do teto que toda página usa — o pypdf não guarda
  falha — é limitado pela regra dos 20%, que para a leitura cedo (cinco
  tentativas num livro de vinte páginas, testado).
- **M3.** O teste diz o que a numeração garante: nenhum trecho começa ou
  termina na página pulada, e um que a atravesse é citado como `1–3`; o
  D-101 diz o mesmo em vez de "continuam certos".

**Como se sabe que passa.** `test_knowledge_pdf_limits.py` de 18 para 41
testes, 3 novos em `test_knowledge_status.py` e 1 em `test_notebooks.py` (o
422 em português pela rota de upload), nenhum com rede, com PDFs
sintéticos pequenos e limites rebaixados por parâmetro: as cópias guardadas
nunca passam do limite depois de uma página (sem a correção: 12 MB contra
1 MB) e o pico do `tracemalloc` em 8 páginas de 3 MB fica em ~7 MB (sem: 28 MB,
contra o limite de 16 MB do teste); orçamento de bytes e de tempo (relógio
falso); a página que bate no teto custa o teto; o limiar nos dois lados
(2 de 10 passa, 3 de 10 falha, 4 de 20 passa, 5 de 20 falha); o fluxo
compartilhado acima do teto para na 5ª página; o upload recusa pelo limite de
páginas sem extrair nenhuma, pelo orçamento e pelo teto de 4 MB; livro novo
acima do limiar sai `FALHOU`, sem trechos, com saída 1; livro indexado mantém
os trechos; a nota da versão anterior é carregada; rótulos do `status`.
`actionlint` limpo no `conhecimento.yml` (sem `shellcheck` instalado, o shell
dos `run:` não foi analisado por ele).

**Números.** Backend 3743 → 3770 (sem `POSTGRES_TEST_URL`, 3764 passam e 6
pulam). Frontend 762, inalterado. `ruff` e `black` limpos.

**Pendente, e só o autor faz.**

- **Deploy da API** depois do merge: o upload dos Cadernos só ganha os
  limites novos quando a API for reimplantada (é a parte de segurança).
- **`ingerir` de novo**, como já pedia a sessão 47 — agora com o teto de
  200 MB. Se um Ashby sair com `PÁGINAS IGNORADAS … (LimitReachedError ×K)`,
  as páginas dele passam de 200 MB; com `FALHOU … mais que 20%`, o livro não
  entra assim, e a decisão é do autor (tirá-lo, ou subir o teto sabendo do
  custo).

## Sessão 48 — 06/10/26 — PhaseBars no Eco Audit e reordenação de estágios por arraste (Opções 1 e 2)

**Registro escrito depois.** O trabalho chegou a `main` pelo PR #101 sem seção
própria aqui; os outros documentos já o chamavam de "Sessão 48". Esta seção foi
escrita no merge de `main` com o ramo do PR #100, a partir do PR e do item
correspondente em [TODO.md](TODO.md) ("Débitos já quitados"). As sessões do
ramo do PR #100, que tinham sido numeradas 48 a 51 em paralelo, passaram a 49
a 52.

**O que mudou.**

- **Eco Audit — barras por fase (Opção 1).** `PhaseBars`
  (`apps/web/components/eco/PhaseBars.tsx`) desenha as cinco fases do ciclo de
  vida em energia (MJ) e carbono (kg de CO₂), no modo individual e no
  comparativo lado a lado, com `role="figure"`/`role="meter"`, ausência com
  rótulo escrito e o crédito (valor negativo) marcado. As larguras saem de um
  helper puro, `calculateBarWidth`, sobre os números que o backend já devolve.
- **Seleção — reordenação por arraste (Opção 2).** `StageList` ganhou
  arrastar e soltar sobre uma função pura e imutável,
  `reorderStages(stages, from, to)`, com uma alça `⠿` rotulada
  (`selectionExtras.stageDragHandle(n)`); os botões ↑/↓ continuam, porque são o
  caminho de teclado.
- `CardProps` passou a estender `HTMLAttributes` e a repassar o resto das
  props (o arraste precisa dos eventos no cartão), e o tipo saiu no barril de
  `@/components/ui`.

**Números.** Backend 3743, inalterado. Frontend 762 → 778 (+10 em
`PhaseBars.test.tsx`, +6 em `StageList.test.tsx`). O PR registrou 777 e
"+9"; o Vitest conta 778, porque `PhaseBars.test.tsx` tem 10 casos — corrigido
nos documentos no merge.

## Sessão 47 — 06/10/26 — O teto de descompressão do pypdf e os dois Ashby

**O pedido.** A segunda `ingerir` em produção (execução 37473592736, depois do
PR #97) gravou 118 documentos e saiu com 1 por dois `FALHOU`:
`Não foi possível ler o PDF: Limit reached while decompressing. N bytes
remaining.` — os dois Ashby em português de `01-Bibliografia/` (152 e
103,5 MB). Corrigir pela causa sem afrouxar a guarda onde ela protege.

**A causa.** É a guarda do pypdf contra bomba de descompressão:
`pypdf.Configuration.zlib_maximum_output_length`, 75 MB por fluxo
decodificado no pypdf 6.19.0 (a versão que o `pip install` do runner instala
hoje), levantada como `LimitReachedError` em `filters._decompress_with_limit`.
Reproduzida com o pypdf real: um PDF sintético de 118 KB cuja primeira página
decodifica para 120 MB falha com a mesma mensagem; nele o erro sai no
`extract_text()` daquela página, não na abertura do arquivo, e a segunda página
lê normalmente. Qual fluxo dos dois livros estoura não foi inspecionado: são
objetos LFS, e baixá-los aqui gastaria a banda do dono.

**O que mudou** ([D-101](DECISIONS.md), atualização do teto de descompressão):

- `read_pdf` (`app/knowledge/readers.py`) ganhou `max_stream_bytes` e
  `skip_unreadable_pages`, os dois desligados por padrão. `extract_text` — só a
  ingestão do Cérebro a chama — liga os dois, com
  `CORPUS_MAX_STREAM_BYTES = 500_000_000`; `read_upload` (Cadernos) não liga
  nenhum e aplica explicitamente o padrão do pypdf.
- O teto vive no `ContextVar` do pypdf (`apply_configuration`), desfeito na
  saída, com exceção também, e invisível a outra thread. O piso do `pypdf` no
  `pyproject.toml` subiu de 4.2 para **6.18**, a primeira versão com essa API.
- Página que não decodifica, no Cérebro, vira página vazia contada em
  `ExtractedText.skipped_pages` (a numeração das outras não muda). O documento
  é indexado; `error` diz "K de N páginas não puderam ser lidas…";
  `DocumentOutcome` leva `skipped_pages`/`page_count`; a CLI imprime
  `[ingest] PÁGINAS IGNORADAS …` (só contagens, caminho redigido se não
  declarado) e não sai com 1. Nenhuma página legível é falha comum; legíveis
  sem texto continuam `SEM TEXTO`. No upload, a primeira página ilegível ainda
  derruba a leitura.

**Como se sabe que passa.** 18 testes novos em
`test_knowledge_pdf_limits.py`, nenhum com rede; sem a correção o arquivo nem
importa (`CORPUS_MAX_STREAM_BYTES` não existe), e o código antigo, conferido
com o `stash`, recusa em `extract_text` o mesmo PDF sintético com a mensagem de
produção. Um PDF sintético cujo
fluxo decodifica 5 MB além do teto **real** do pypdf: `read_pdf` padrão e
`read_upload` falham com a mensagem de produção, `extract_text` o lê; com o
teto do Cérebro rebaixado, a página pesada é pulada e a outra lida; o teto
volta ao padrão depois da leitura, depois de uma exceção, e uma thread que
lê um upload enquanto outra segura o teto maior ainda é recusada; página
ilegível (um `zlib.error` injetado) pulada com a numeração certa nos trechos,
falha quando são todas, `SEM TEXTO` quando as legíveis são vazias, saída 0 da
CLI, linha redigida para documento não declarado; `max_stream_bytes=0` (que o
pypdf leria como "sem limite") recusado. Medido à mão com o pypdf 6.19: fluxo
de 120 MB lido em 1,0 s (pico de RSS 263 MB); de 450 MB, 5,6 s e 893 MB; de
600 MB, página pulada em 3,4 s com 988 MB; o upload recusa os três em
≤ 0,5 s, com 177 MB.

**Números.** Backend 3725 → 3743 (sem `POSTGRES_TEST_URL`, 3737 passam e 6
pulam). Frontend 762, inalterado. `ruff` e `black` limpos.

**Pendente, e só o autor faz.**

- Decidir se um dos dois Ashby sai (TODO, baixa prioridade: quase certamente
  o mesmo livro em dois scans) — de preferência antes da próxima `ingerir`.
- Depois do merge: **Base de conhecimento (Cérebro)** → `ingerir` de novo (roda
  do código de `main`, sem deploy; só os dois Ashby são baixados e lidos, do
  cache do LFS se dentro de 7 dias) e **Deploy da API** (o piso do pypdf subiu).

## Sessão 46 — 06/10/26 — O NUL do pypdf e a ingestão que não para num documento

**O pedido.** A primeira `ingerir` de **Base de conhecimento (Cérebro)** no
Neon (segunda execução do workflow; a primeira só rodou `status`) falhou
depois de gravar um documento:
`sqlalchemy.exc.DataError: (psycopg.DataError) PostgreSQL text fields cannot
contain NUL (0x00) bytes`, no `replace_chunks` de `_ingest_one`. Corrigir pela
causa, e fazer a ingestão sobreviver a um documento que o banco recuse.

**A causa.** O pypdf devolve U+0000 para um glifo que não consegue mapear (um
`\000` numa string de conteúdo com Helvetica basta, e é como os testes o
reproduzem). O SQLite — o banco de todos os testes — guarda o caractere; o
PostgreSQL recusa o `INSERT` inteiro. E a exceção atravessava `ingest()`: a
CLI saía com traceback, os documentos anteriores ficavam (commit por
documento) e o resto do Cérebro nem era tentado.

**O que mudou** ([D-101](DECISIONS.md), atualização de 06/10):

- **`storable_text()`** (`app/knowledge/readers.py`): remove U+0000 e troca
  *surrogate* — que não codifica em UTF-8 e falha no driver — por U+FFFD;
  nada mais. Aplicada em `read_pdf` (e na mensagem de erro do pypdf), no DOCX,
  em `decode_text` (que só recusava NUL nos primeiros 4 KiB; TXT e Markdown
  passam por ele), em `extract_html` (texto e título), no título e na
  procedência do manifesto e no motivo gravado em `error`. Como defesa em
  profundidade, no `normalise()` do fatiador: todo trecho, `heading` e
  `search_text` sai dele, de qualquer leitor ou de texto colado. Nos Cadernos,
  `NotebookService.ingest` passa título, origem, páginas e `meta` pela mesma
  regra (um texto colado em JSON traz `\u0000` sem leitor nenhum).
- **Um *savepoint* por documento** (`KnowledgeService._ingest_one`): a gravação
  roda em `begin_nested()`; uma recusa do banco volta só aquele documento — o
  novo some, o já indexado recupera trechos e vetores — e ele é registrado
  `falhou` num segundo *savepoint*, pela mesma via de uma versão ilegível
  (`_extraction_failed`, agora "não pôde ser gravada"). O motivo nomeia só a
  classe do erro (`O banco de dados recusou a gravação deste documento
  (DataError); …`): a mensagem do driver traz o SQL e o texto do livro, e o log
  é público. A execução segue, o commit por documento da CLI continua
  funcionando e a saída continua 1. Conexão perdida ainda encerra a execução.

**Como se sabe que passa.** 17 testes novos; 14 falham sem a correção
(conferido com as mudanças de código guardadas no `stash`) e 3 são guardas que
passam dos dois lados — a prova de que a fixture produz o NUL que o pypdf de
fato devolve, a conexão perdida que ainda encerra a execução, e o HTML, cujo
extrator já descartava o NUL (agora contrato, não efeito colateral). Os 14:
trecho, `heading`, `search_text`, título do manifesto, mensagem do parser,
upload de PDF e texto colado nos Cadernos, NUL depois dos 4 KiB de um TXT; e o
*savepoint*: três documentos, o do meio recusado com um
`DataError` levantado **depois** de os trechos novos irem ao banco — os outros
dois gravados, o recusado `falhou` com os trechos antigos de volta, sem SQL nem
parâmetro no motivo, saída 1 da CLI. Dois deles rodam contra PostgreSQL de
verdade (`test_knowledge_ingest_postgres.py`, a guarda `POSTGRES_TEST_URL` que
o job de backend da CI já define): sem a correção, o primeiro reproduz o erro
de produção literalmente; o segundo prova o *savepoint* com o `DataError` real.
Conferido também à mão num PostgreSQL 16 local: a CLI sem a correção morre no
terceiro documento, com ela grava os três.

**Números.** Backend 3699 → 3716 (sem `POSTGRES_TEST_URL`, 3710 passam e 6
pulam; com ele, os 3716 passam). Frontend 762, inalterado. `ruff` e `black`
limpos.

**Fica de fora, e é anterior.** Um nome de arquivo que não decodifica como
UTF-8 (só possível no Linux) quebra a pré-passagem com `UnicodeEncodeError`
antes de qualquer escrita — fora do *savepoint*, que só cobre a gravação. Os
nomes do Cérebro vêm do git em UTF-8.

**A revisão achou o que a correção não cobria: o log público.** O traceback
daquela execução (37415600025, job 112113411666, passo "Ingerir") trazia
`[SQL: INSERT INTO knowledge_chunk …]` e `[parameters: {…}]` com ~1000 trechos
de um livro licenciado. O *savepoint* registra o que o banco recusa dentro
dele; a conexão perdida, o commit por documento e as escritas dos fatiadores
continuavam emitindo o SQL do SQLAlchemy com os parâmetros no traceback se a
conexão caísse ali. `DatabaseEngine.connect` desliga `echo` e `echo_pool` (já
desligados) e `app/knowledge/cli.py` silencia `sqlalchemy.engine` para `WARNING`
em todas as ações, mantendo só as mensagens de negócio. O log daquela execução
foi apagado pelo autor no menu do Actions.

**Números com a revisão.** Backend 3716 → 3725 (+9 testes: os limites de log,
o silenciamento e a recusa de NUL em novos pontos). Frontend 762, inalterado.

**Pendente, e só o autor faz:** **Deploy da API** (a rota de upload dos Cadernos
só ganha a proteção depois de reimplantada) e **`ingerir` de novo** (roda do
código de `main`, sem deploy; os documentos já gravados saem `inalterados` e a
execução tenta o restante do Cérebro).

## Sessão 45 — 30/09/26 a 05/10/26 — O Cérebro entra em produção

**O pedido.** O autor pediu para resolver a ingestão do `Links.md` (o item A7 do
TODO) e ativar a busca semântica em produção. Em 05/10/2026, depois da primeira
rodada, pediu busca por palavras **e** por vetores, aceitando que o texto dos
livros vá ao Gemini no plano gratuito, onde o Google pode usá-lo.

**O que mudou** ([D-101](DECISIONS.md)):

- **Workflow `conhecimento.yml`** ("Base de conhecimento (Cérebro)"): três ações
  manuais (`status`, `ingerir`, `embeddings`) e uma noturna (`embeddings` com a
  sobra da cota gratuita). Roda num runner do GitHub com `lfs: false` por padrão
  — só `ingerir` baixa do LFS o que o banco ainda não tem.
- **Ingestão segura contra o que o Actions pode entregar:** ponteiro LFS
  recusado sem tocar o banco; versão nova de documento que falha mantém os
  trechos da anterior; e cópia byte a byte de documento já indexado é registrada
  como cópia (aponta para o mesmo `knowledge_document`) sem reindexar.
- **Busca sobre índice em memória na API:** o banco guarda trechos e vetores; a
  API sobe com o índice carregado e faz a busca semântica (produto escalar em
  `array('f')`) em microssegundos sem bater no banco a cada chamada.
- **Identidade de vetor:** `/api/health` publica o provedor de embeddings, o
  modelo e a dimensão (`768`). A API recusa vetores de dimensão diferente na
  partida.

**Como se sabe que passa.** 214 testes novos no ramo; 3660 testes de backend
ao todo com a revisão final.

**Números.** Backend 3338 → 3552 no ramo; 3395 → 3624 com o merge de `main`;
3660 com a revisão final; 3699 com o merge do PR #94. Frontend 753 → 762 com o
merge do PR #94.

## Sessão 44 — 02/10/26 — Lote quádruplo de melhorias: Seleção, Busca, Dimensionador e Eco Audit (Opções 1 a 4)

Quatro melhorias funcionais entregues num PR só:

1. **Seleção (P0-1):** duplicação de estágio na pilha (`duplicateStage`).
2. **Busca (P1-1):** pontuação por relevância no catálogo e destaque de termos
   (`HighlightText`).
3. **Dimensionador (P2):** seções circulares maciças no solver de vigas e colunas.
4. **Eco Audit (P3):** comparação lado a lado de dois materiais no ciclo de vida.

**Números.** Backend 3395 → 3407. Frontend 753 → 762.

## Sessão 43 — 02/10/26 — Deslocamentos astronômicos positivos e calc() dominante no extrator HTML (Opção 1)

Defesa contra injeção de prompt nos Cadernos: caixas empurradas para fora por
`left: 9999px` etc. e `calc(50% - 20000px)` descartadas.

**Números.** Backend 3382 → 3395. Frontend 753 (inalterado).

## Sessão 42 — 02/10/26 — Herança de CSS visibility e resgate por visibility:visible no extrator HTML (Opção 1)

Semântica estrita de `visibility:hidden` com herança e resgate por
`visibility:visible` nos nós filhos.

**Números.** Backend 3376 → 3382. Frontend 753 (inalterado).

## Sessão 41 — 01/10/26 — Correção de guardrails de IA e exportação nativa PPTX (B2)

Exportador nativo em PPTX do `Report` e liberação de números legítimos do RAG
nas guardrails.

**Números.** Backend 3362 → 3376. Frontend 752 → 753.

## Sessão 40 — 01/10/26 — Localizador de citação do Markdown / Links sem p. 1-1 (D-100)

Citação de documentos não paginados sem `p. 1-1` e formato `p. X` para página
única.

**Números.** Backend 3356 → 3362. Frontend 751 → 752.

## Sessão 39 — 01/10/26 — Indexação direcionada do Links.md e expurgo do material de curso (A7)

Indexação sob demanda via `--file` e ação `conhecimento_indexar_links`.

**Números.** Backend 3347 → 3356. Frontend 751 (inalterado).

## Sessão 38 — 30/09/26 — Concorrência das cotas em PostgreSQL na CI (Opção B)

Concorrência multithread do `UPDATE … WHERE` testada contra PostgreSQL 16 na CI.

**Números.** Backend 3343 → 3347. Frontend 751 (inalterado).

## Sessão 37 — 30/09/26 — Linha de tabela com pipes não é mais heading (D-97)

Correção do fatiador do RAG.

**Números.** Backend 3338 → 3343. Frontend 751 (inalterado).

## Sessão 36 — 30/09/26 — O material de curso sai do histórico

Reescrita de histórico pelo autor (`873dd53` → `b7dd105`).

**Números.** Inalterados.

## Sessão 35 — 29/09/26 — O material de curso sai do Cérebro

71 arquivos fora do repositório e lista de remoção em `Cérebro/removidos.txt`.

**Números.** Backend 3270 → 3338. Frontend 751 (inalterado).

## Sessão 34 — 29/09/26 — Cadernos: o lote de pendências das fases 3 e 4

Nove pendências fechadas nos Cadernos (D-99).

**Números.** Backend 2979 → 3270. Frontend 735 → 751.

## Sessão 33 — 28 e 29/09/26 — Cadernos, fase 4: o Estúdio visual e sonoro

Resumo em áudio, vídeo, slides PPTX e infográfico (D-98).

**Números.** Backend 2651 → 2979. Frontend 608 → 735.

## Sessão 32 — 25 a 28/09/26 — Cadernos, fase 3: fontes externas

Site, YouTube, OpenAlex, Wikipédia e busca web com Gemini (D-97).

**Números.** Backend 1966 → 2651. Frontend 563 → 608.

## Sessão 31 — 25/09/26 — Auditoria do PR #78: curva custo × lote do Antigravity

Auditoria da implementação externa da curva custo × lote (D-96).

**Números.** Backend 1963 → 1966. Frontend 563 (inalterado).

## Sessão 30 — 25/09/26 — O Estúdio de texto dos Cadernos

Relatório, cartões, teste, tabela e mapa mental (D-94).

**Números.** Backend 1917 → 1966. Frontend 536 → 554.

## Sessão 29 — 25/09/26 — Cadernos, fase 1: o NotebookLM dentro do app e o Gemini gratuito

Cadernos de estudo e provedor Gemini gratuito (D-92, D-93).

**Números.** Backend 1856 → 1906. Frontend 505 → 536.

## Sessão 28 — 24 a 28/09/26 — Turma de terça: processos no Objetivo, UX guiada, pesos com limite e a IA

Melhorias para uso em sala de aula (D-84 a D-89).

**Números.** Backend 1785 → 1856. Frontend 431 → 505.

## Sessão 27 — 24/09/26 — O portão vira um modo acesso aberto para uma turma (D-83)

Acesso para turmas acadêmicas.

**Números.** Backend 1755 → 1785. Frontend 422 → 427.

## Sessão 26 — 21 e 22/09/26 — A auditoria de produção, o seed desconectado (D-71) e a exclusão de demo por um flag (D-72)

Correção de seed e flag `is_demo`.

**Números.** Backend 1727 → 1741. Frontend 368 (inalterado).

## Sessão 25 — 21/09/26 — A unidade de leitura fecha a matriz

Unidades de leitura por propriedade (D-70). Matriz a 100%.

**Números.** Backend 1683 → 1727. Frontend 356 → 368.

## Sessão 24 — 16/09/26 — P4: o Battery Designer e a reconciliação do PR #56

Battery Designer (D-69) e reconciliação do PR #56.

**Números.** Backend 1656 → 1683. Frontend 349 → 356.

## Sessão 23 — 16/09/26 — P3: os Sandwich Panels fecham a faixa

Sandwich Panels no Synthesizer (D-68).

**Números.** Backend 1629 → 1656. Frontend 345 → 349.

## Sessão 22 — 15 e 16/09/26 — P3: o Synthesizer

Synthesizer de compósitos e espumas (D-67).

**Números.** Backend 1561 → 1629. Frontend 334 → 345.

## Sessão 21 — 15/09/26 — P3: o Eco Audit

Eco Audit de ciclo de vida (D-66).

**Números.** Backend 1505 → 1561. Frontend 321 → 334.

## Sessão 20 — 15/09/26 — P3: o custo da peça e o custo como objetivo

Part Cost Estimator e objetivo custo no solver (D-65).

**Números.** Backend 1432 → 1505. Frontend 308 → 321.

## Sessão 19 — 15/09/26 — P2 restante: o solver e o index finder

Engineering Solver e Performance Index Finder (D-64).

**Números.** Backend 1341 → 1432. Frontend 299 → 308.

## Sessão 18 — 14/09/26 — P2: o fim do fluxo do manual

Find Similar e comparação percentual (D-63).

**Números.** Backend 1297 → 1341. Frontend 286 → 299.

## Sessão 17 — 14/09/26 — P1-4: o catálogo ganha dono e o usuário ganha espaço

`My Records`: registros próprios, favoritos e recentes (D-62).

**Números.** Backend 1234 → 1297. Frontend 277 → 286.

## Sessão 16 — 13 e 14/09/26 — P1-3: a taxonomia vira registro e o segundo universo se navega

Browse de famílias e ficha do processo (D-61).

**Números.** Backend 1209 → 1234. Frontend 253 → 277.

## Sessão 15 — 11 e 13/09/26 — P1-2: o gráfico passa a reprovar

Chart Stage: região do plano como critério (D-60).

**Números.** Backend 1141 → 1209. Frontend 232 → 253.

## Sessão 14 — 10 e 11/09/26 — P0-4: processo passa a ter atributo e o exercício 11 fecha

Atributos de processo, envelope de capacidade e discreto (D-59).

**Números.** Backend 1076 → 1141. Frontend 225 → 232.

## Sessão 13 — 09 e 10/09/26 — P0-1, P0-2 e P0-3: a plataforma de seleção ganha pilha, segundo universo e escolha de resultado

Pilha de estágios (D-56), segundo universo (D-57) e resultado (D-58).

**Números.** Backend 884 → 1076. Frontend 197 → 225.

## Sessão 12 — 08/09/26 — A ferramenta no ar e a camada de IA ligada em produção

Deploy em produção (D-52).

**Números.** Backend 872 → 884. Frontend 197 (inalterado).

## Sessão 11 — 01 e 02/09/26 — M5 (TOPSIS, PROMETHEE II, AHP) e M6 (restrições aninhadas) entregues via SDD

Métodos multicritério e árvore de restrições.

**Números.** Backend 831 → 872. Frontend 165 → 179.

## Sessão 10 — 27 a 31/08/26 — Backlog B1–B10 entregue por inteiro via SDD

Dez tarefas de baixa prioridade entregues.

**Números.** Backend 795 → 831. Frontend 162 → 165.

## Sessão 9 — 26 e 27/08/26 — RAG sobre o Cérebro (D-47) e a PR #26 fechada e remesclada

RAG com BM25 + vetores sobre o acervo.

**Números.** Backend 713 → 795. Frontend 157 → 162.

## Sessão 8 — 24 e 25/08/26 — Reconciliação de branches, M9 e o checkout do Stripe testado ao vivo

Portão de assinatura (D-46).

**Números.** Backend 639 → 713. Frontend 148 → 157.

## Sessão 7 — 21/08/26 — Triagem de licenciamento (M1)

Triagem de licenças.

**Números.** Backend 632 → 639. Frontend 148 (inalterado).

## Sessão 6 — 21/08/26 — Estudo de caso didático (A2)

Tirante leve e rígido de Ashby.

**Números.** Backend 630 → 632. Frontend 148 (inalterado).

## Sessão 5 — 21/08/26 — Auditoria (M2) e a instalação do ambiente de assistente

Fase 7: auditoria de alterações.

**Números.** Backend 617 → 630. Frontend 148 (inalterado).

## Sessão 4 — 11 e 12/08/26 — Fase 9 e a varredura que a fechou

Fase 9: seis frentes.

**Números.** Backend 436 → 591. Frontend 123 → 141.

## Sessão 3 — 11/08/26 — Os provedores reais da camada de IA

Fase 6: provedores reais de IA.

**Números.** Backend 391 → 436. Frontend 123.

## Sessão 2 — 05/08/26 a 10/08/26 — Fase 7 parcial, CI obrigatória e Fase 8

Fase 7 (relatório HTML), CI obrigatória, Fase 8 (redesign).

**Números.** Backend 362 → 391. Frontend 44 → 123.

## Sessão 1 — 30/07/26 a 04/08/26 — Fases 5 a 7

Fases 5, 6 e 7 (exportação).

**Números.** Backend 169 → 362. Frontend 13 → 44.
