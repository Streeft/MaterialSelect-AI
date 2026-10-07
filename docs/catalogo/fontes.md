# Fontes do catálogo — vereditos de licença

> Registro do portão de licença do catálogo complementar
> ([D-103](../DECISIONS.md), rascunho; regra completa em
> [`20-catalogo-fontes-abertas.md`](../20-catalogo-fontes-abertas.md)).
> Verificação de **07/10/2026**, feita no papel do agente `guardiao-licencas`.
> **Nenhum dado de material foi coletado para produzir este arquivo, e nenhum
> arquivo Granta foi lido.**

Três escopos, com regras diferentes:

1. **Fontes abertas** (§3–§4) — candidatas ao catálogo complementar, com
   veredito deste portão.
2. **Granta EduPack** (§6) — trilha própria do autor, tratada no
   [D-102](../DECISIONS.md) e em
   [`18-catalogo-oficial-granta.md`](../18-catalogo-oficial-granta.md). Este
   arquivo só registra a pendência documental; não dá veredito.
3. **Bases comerciais** (§5) — recusadas para extração em massa; o Total
   Materia é registrado também como inspiração de funcionalidade.

O repositório é **público** ([D-22](../DECISIONS.md)) e a aplicação é
**implantada** (Vercel + Fly, [D-52](../DECISIONS.md)), com login e um portão
de assinatura paga no código ([D-46](../DECISIONS.md),
[D-83](../DECISIONS.md)). Tudo o que entra no catálogo é **redistribuição
pública**, e o uso pode ser **comercial** no sentido das licenças Creative
Commons: uma licença "NC" não serve enquanto o app tiver cobrança no código,
mesmo com o Stripe desligado.

---

## 1. Os quatro estados de um veredito

| Veredito | O que quer dizer | Pode coletar? |
|---|---|---|
| **APROVADA** | Licença confirmada por leitura direta da página oficial, com cópia datada arquivada, e todas as condições da linha cumpríveis. | Sim, nas condições da linha. |
| **APROVADA-CONDICIONAL** | O texto da licença é inequívoco, mas a leitura direta da página oficial ainda não foi feita (condição C0, §2). | **Não**, até a C0 ser cumprida e a linha virar APROVADA. |
| **PENDENTE** | Licença ambígua, ou a "fonte" é um agregador cujas partes têm licenças diferentes. Escalada ao autor. | **Não.** Tratada como recusada até decisão registrada. |
| **RECUSADA** | Os termos proíbem extração, redistribuição ou uso comercial, ou a base é comercial sem licença de redistribuição demonstrada. | **Não.** |

Uma linha só muda de estado por decisão humana registrada aqui (data, quem,
evidência) e, se mudar o desenho, numa atualização do D-103.

## 2. Limitação desta verificação (condição C0)

Em 07/10/2026 a política de saída de rede desta sessão **bloqueou a leitura
direta** de todos os sites oficiais tentados (`next-gen.materialsproject.org`,
`www.wikidata.org`, `www.nist.gov`, `www.optimade.org`,
`www.totalmateria.com`, `www.matweb.com`; o Internet Archive também não
respondeu). Só o GitHub estava acessível, e dele foi lido diretamente o
arquivo de licença do JARVIS-Tools. O texto das demais licenças foi lido em
**resultados de busca que citam a página oficial**, com a URL oficial anotada
na tabela.

Isso basta para recusar (uma proibição citada pela própria página não melhora
com uma segunda leitura), mas **não basta para aprovar**: o trecho de um
buscador não tem data e termos mudam. Por isso nenhuma fonte saiu APROVADA. A
condição **C0**, comum a toda linha APROVADA-CONDICIONAL, é:

> **C0.** Antes da primeira coleta, uma pessoa (ou um agente com acesso) abre a
> página oficial de licença indicada na linha, confere que o texto ainda diz o
> que está resumido aqui, salva uma cópia datada (PDF da página ou link do
> Internet Archive) em `docs/catalogo/autorizacoes/evidencias/` e anota nesta
> tabela a data e quem conferiu. Só então a linha vira APROVADA.

---

## 3. Fontes abertas — tabela de vereditos

Data de todas as verificações: **07/10/2026** (por busca, salvo onde dito; ver §2).

| Fonte | Licença | URL da licença | Atribuição exigida | Redistribuição | Veredito | Data | Observações |
|---|---|---|---|---|---|---|---|
| Materials Project (dados pela API) | CC-BY-4.0 | <https://next-gen.materialsproject.org/about/terms> (texto também em <https://legacy.materialsproject.org/terms>) | Sim: Materials Project + Jain et al., *APL Materials* 1, 011002 (2013) — <https://next-gen.materialsproject.org/about/cite> | Permitida, inclusive comercial, com atribuição | **APROVADA-CONDICIONAL** | 07/10/2026 | C0 pendente. Só pela API, nunca raspando o site; avisar o suporte antes de download grande; dado **calculado (DFT)**; MPContribs fora (termos próprios). §4.1 |
| Wikidata (dados estruturados) | CC0-1.0 | <https://www.wikidata.org/wiki/Wikidata:Licensing> | Não exigida (registrar mesmo assim) | Permitida, sem restrição | **APROVADA-CONDICIONAL** | 07/10/2026 | C0 pendente. Só declarações **com referência**; referência a base recusada não entra. §4.2 |
| NIST Chemistry WebBook (SRD 69) | © U.S. Secretary of Commerce, "All rights reserved" (Standard Reference Data Act, 15 U.S.C. § 290e) | <https://webbook.nist.gov/chemistry/> · <https://www.nist.gov/open/license> | — | Não concedida | **RECUSADA** | 07/10/2026 | Exige permissão escrita do NIST. Acesso livre não é licença. §4.3 |
| NIST SRD (em bloco) | Copyright pelo SRD Act, por base | <https://www.nist.gov/open/license> · <https://www.nist.gov/srd> | Por base | Não concedida em bloco | **RECUSADA** (em bloco) | 07/10/2026 | Cada SRD vira linha própria. Dado NIST **não-SRD** é outra coisa (§4.3). |
| NIST — conjuntos não-SRD (`data.nist.gov`) | Obra de servidor federal (17 U.S.C. § 105); licença NIST para o exterior | <https://www.nist.gov/open/license> | Citar a obra | Permitida | **PENDENTE** (por conjunto) | 07/10/2026 | Aprovável conjunto a conjunto, em linha própria, com C0. §4.3 |
| NIST Atomic Weights and Isotopic Compositions (SRD 144) | Ambígua: tem número de SRD, mas o catálogo do data.gov aponta para a licença geral do NIST | <https://www.nist.gov/pml/atomic-weights-and-isotopic-compositions-relative-atomic-masses> | A confirmar | A confirmar | **PENDENTE** | 07/10/2026 | Escalada ao autor. Rota sem ambiguidade: massas atômicas pela Wikidata (CC0), com a CIAAW/IUPAC como referência. §4.3 |
| MIL-HDBK-5J (31/01/2003) | "Distribution Statement A — approved for public release; distribution is unlimited" (lido por busca, não na cópia oficial) | <https://quicksearch.dla.mil/> (ASSIST) · <https://everyspec.com/MIL-HDBK/MIL-HDBK-0001-0099/MIL_HDBK_5J_139/> | Citar o documento | Aparentemente irrestrita | **PENDENTE** | 07/10/2026 | Cancelado pela Força Aérea dos EUA em 2006; substituído pelo MMPDS. Ver o que falta em §4.4. |
| JARVIS-DFT (NIST) | CC-BY-4.0 nos itens do figshare; software sob 17 U.S.C. § 105 | <https://figshare.com/authors/Kamal_Choudhary/4445539> · <https://github.com/usnistgov/jarvis> (licença do **software**, lida diretamente em 07/10/2026) | Sim: DOI do item + Choudhary et al., *npj Computational Materials* 6, 173 (2020) | Permitida, com atribuição | **APROVADA-CONDICIONAL** | 07/10/2026 | C0 pendente **por item do figshare**; dado **calculado (DFT)**. §4.5 |
| OPTIMADE (provedores individuais) | Não é fonte: é protocolo; cada provedor declara a sua (`license`, `available_licenses` em `/info`) | <https://www.optimade.org/> · <https://github.com/Materials-Consortia/providers> | Por provedor | Por provedor | **PENDENTE** (por provedor) | 07/10/2026 | Nenhum provedor aprovado em bloco. §4.6 |
| Conjuntos CC BY no Zenodo, Mendeley Data e Figshare | Por conjunto (padrão CC-BY-4.0 no Zenodo e no figshare; Mendeley oferece CC0, CC BY e CC BY-NC) | <https://help.zenodo.org/docs/deposit/describe-records/licenses> · <https://info.figshare.com/?p=2627> | Por conjunto | Por conjunto | **PENDENTE** (por conjunto) | 07/10/2026 | Triagem em §4.7: NC e ND recusados; SA escalado; rótulo aberto sobre dado copiado de base comercial é recusado. |

---

## 4. Notas por fonte aberta

### 4.1 Materials Project

- **Licença.** Os termos dizem que, ao baixar conteúdo, o usuário aceita a
  Creative Commons Attribution 4.0, que permite copiar, distribuir, transmitir
  e adaptar sem permissão específica, com atribuição.
- **Condições de coleta** (mesmos termos): não raspar o site; coletar pela
  **API**; antes de baixar fração grande da base, escrever ao suporte do
  Materials Project com o e-mail da conta e o caso de uso. Essa mensagem é **do
  autor**, não de um agente.
- **Dado calculado.** Os termos avisam que o dado é computado e pode não ser
  exato o bastante para a aplicação. Toda linha daqui é **calculada (DFT)** e
  nunca se mistura com valor medido sem sinalização (decisão aberta no D-103).
- **CC BY pede indicar modificação.** A proveniência já guarda valor e unidade
  originais e o método de conversão (princípio 4); o rótulo da fonte diz
  "adaptado".
- **MPContribs** tem termos próprios
  (<https://next-gen.materialsproject.org/about/mpcontribs-terms>) e **não** está
  coberto por esta linha.

### 4.2 Wikidata

- **Licença.** Dado estruturado nos espaços *main*, *property* e *lexeme* sob
  CC0; texto dos outros espaços sob CC BY-SA 4.0 (não entra no catálogo).
- **CC0 da Wikidata não lava a origem.** Só entram declarações **com
  referência**; a referência e o QID vão para a proveniência; declaração cuja
  referência seja uma base recusada aqui (§5) ou o Granta **não entra** por
  este portão.
- **Acesso** pelo SPARQL ou pelos *dumps*, com `User-Agent` identificado (o
  projeto já usa `EXTERNAL_CONTACT` nos Cadernos, D-97), nunca raspando páginas.

### 4.3 NIST

- **Standard Reference Data (SRD)** — o Standard Reference Data Act
  (15 U.S.C. § 290e) autoriza copyright em nome dos EUA sobre as bases SRD. O
  WebBook (SRD 69) exibe "All rights reserved". **Acesso livre não é licença
  de redistribuição.**
- **Dado NIST não-SRD** — obra de servidor federal (17 U.S.C. § 105), sem
  copyright nos EUA; a página de licença do NIST concede, onde houver copyright
  no exterior, o direito de publicar, derivar e distribuir. Aprovável **por
  conjunto**, em linha nova.
- **SRD 144** — as duas leituras dão vereditos opostos; resolveria uma
  declaração na página da própria base ou resposta escrita do NIST. Para um
  universo "Elementos", a rota sem ambiguidade é a Wikidata (CC0) com a
  CIAAW/IUPAC como referência.

### 4.4 MIL-HDBK-5J

Edição de 31/01/2003, "Distribution Statement A", cancelada em 2006 e
substituída pelo MMPDS. Para aprovar faltam:

1. **Cópia oficial arquivada** — o PDF do ASSIST, com a capa do *Distribution
   Statement*, em `autorizacoes/evidencias/`.
2. **Decisão do autor sobre documento cancelado** — os *allowables* (bases
   A/B/S) têm significado estatístico de projeto; se entrar, o rótulo da fonte
   diz "documento cancelado em 2006; valores históricos".
3. **Nunca MMPDS** — só a edição 5J (ver §5).
4. **Transcrição manual de tabelas em PDF**, com dupla conferência no QA — não
   há versão estruturada pública.

### 4.5 JARVIS-DFT

- O software JARVIS-Tools é obra de servidores do NIST (17 U.S.C. § 105),
  distribuído sem custo, de forma não exclusiva, com o aviso e a isenção de
  garantia acompanhando as cópias (lido diretamente em `LICENSE.rst`, 07/10/2026).
  **Isso é o software, não o dado.**
- Os conjuntos no figshare aparecem sob CC BY 4.0, mas a licença é **por
  item**: cada arquivo baixado registra DOI e licença do item.
- Dado **calculado (DFT)**.

### 4.6 OPTIMADE

Especificação de API, não base. Antes de consultar um provedor, ele vira
**linha própria** com a licença lida em `/info` **e** na página humana;
provedor sem licença declarada é recusado. O Materials Project servido por
OPTIMADE é a mesma fonte da §4.1.

### 4.7 Zenodo, Mendeley Data, Figshare

Repositórios, não fontes: a licença é escolhida por quem deposita.

| Licença do conjunto | Veredito |
|---|---|
| CC0, CC BY 4.0 | Aprovável, em linha própria com DOI, autores e C0. |
| CC BY-NC (qualquer versão) | **Recusada** — o app tem portão de assinatura paga no código (D-46). |
| CC BY-ND | **Recusada** — normalizar unidade é obra derivada. |
| CC BY-SA | **Escalar ao autor**. |
| Sem licença, ou "todos os direitos reservados" | **Recusada**. |

Independente do rótulo: conjunto cuja descrição diz que os valores vieram de
MatWeb, ASM, Total Materia, MMPDS ou CAMPUS é **recusado** — quem depositou não
tinha como conceder uma licença que não possuía.

---

## 5. Bases comerciais

### 5.1 Recusadas para extração em massa

Os trechos abaixo foram lidos em **resultados de busca que citam a página
oficial** (a leitura direta foi bloqueada, §2). Para recusar, basta.

| Base | Cláusula (citada da página oficial, via busca) | URL | Veredito | Data |
|---|---|---|---|---|
| MatWeb | Licença "personal, limited, nonexclusive, nontransferable, nonsublicensable" para acessar e guardar subconjuntos num único computador pessoal, "not to exceed data from a total of 500 materials"; proíbe modificar, traduzir ou reproduzir o banco "except for personal use". | <https://apm.matweb.com/reference/terms.aspx> (também `www.matweb.com/reference/terms.aspx`) | **RECUSADA** | 07/10/2026 |
| Total Materia | "Gathering data from the Website through manual harvesting or automated means, including but not limited to the systematic manual saving of data, and use of scripts, bots, or web crawlers, is strictly prohibited." A política de uso justo limita a 2000 páginas vistas por mês por licença. | <https://www.totalmateria.com/terms-of-use> | **RECUSADA** para extração; ver §5.2 | 07/10/2026 |
| ASM International (Handbooks Online, ASM Materials Database) | "Systematic downloading or harvesting articles, citations, and metadata is strictly prohibited"; webcrawlers e outros meios automáticos proibidos (texto reproduzido por guia de biblioteca licenciada). | <https://licenses.library.ubc.ca/ASMInternational_ASMHandbooks> (termos da ASM via UBC) · <https://dl.asminternational.org/> | **RECUSADA** | 07/10/2026 |
| MMPDS (Battelle/FAA) | Edições correntes vendidas pela Battelle e licenciados; cláusula de termos não lida nesta sessão. | <https://standards.globalspec.com/std/1405296/mmpds> | **RECUSADA** | 07/10/2026 |
| CAMPUS (CWFG mbH) | Termos de uso não localizados (o site é financiado pelos fabricantes participantes; marca registrada da CWFG). | <https://www.campusplastics.com/> | **RECUSADA** por padrão | 07/10/2026 |

Notas:

- **MMPDS.** Um resultado de busca afirmou que "o MMPDS Handbook" foi
  aprovado para distribuição pública ilimitada; isso pode valer para a
  primeira edição publicada pela FAA (DOT/FAA/AR-MMPDS-01) e não para as
  edições correntes. Se o autor quiser essa edição, ela vira **linha própria
  PENDENTE** na §3, com a capa oficial arquivada — nunca por analogia com esta
  linha nem com o MIL-HDBK-5J.
- **CAMPUS.** Reabrir só com termos escritos que permitam redistribuição.
- **Recusar a extração não proíbe citar.** Mencionar que uma base existe, ou
  apontar o leitor para ela, não é extração.

### 5.2 Total Materia como inspiração de funcionalidade

O Total Materia é **recusado como fonte de dado**, e registrado como
**referência de produto**. A regra: só se descreve o que é observável nas
páginas públicas de marketing e documentação do produto
(<https://www.totalmateria.com/horizon/>,
<https://docs.totalmateria.com/>), sem entrar com conta, sem copiar texto,
tabela, imagem, nome de registro ou valor, e sem reproduzir o desenho de tela.
Recursos observados publicamente em 07/10/2026 (por busca):

- busca por designação, norma, composição química e requisito de propriedade;
- equivalência de materiais entre normas e regiões, apresentada numa escala
  de "idêntico" a "semelhante";
- comparação lado a lado de muitos materiais (composição e propriedades);
- curvas tensão-deformação, fadiga e fluência por temperatura e taxa de
  deformação;
- exportação para formatos de ferramentas CAD/CAE e genéricos (XML, planilha);
- referência bibliográfica por registro e acompanhamento de atualizações.

As ideias aplicáveis ao app viraram itens de backlog em
[`../TODO.md`](../TODO.md) ("Funcionalidades inspiradas no Total Materia").
Cada uma é desenhada com conteúdo e dado próprios, de fonte APROVADA.

---

## 6. Granta EduPack — trilha própria do autor (D-102)

**Fora do escopo de veredito deste portão.** O Granta EduPack é tratado no
[D-102](../DECISIONS.md) (aceita, 07/10/2026): corpus fora do Git, bundle
privado endereçado por `OFFICIAL_CATALOG_BUNDLE_URL`, identidade externa,
dry-run e revisor humano no commit. Operação em
[`18-catalogo-oficial-granta.md`](../18-catalogo-oficial-granta.md);
inventário da instalação em
[`19-inventario-instalacao-granta.md`](../19-inventario-instalacao-granta.md).
Este arquivo não acrescenta juízo sobre essa trilha.

O que se registra aqui, por ser fato documental:

- **A autorização de uso e redistribuição é responsabilidade documentada do
  autor.** O D-102 §8 exige um revisor humano no commit e diz que "a
  aplicação não infere licença"; o `dataset.json` leva um `license_label`
  declarado por quem monta o bundle.
- **O documento dessa autorização está pendente de arquivo** em
  [`autorizacoes/`](autorizacoes/) (com dado pessoal redigido). Para o
  catálogo ter a mesma trilha de evidência que as fontes abertas, ele deve
  cobrir:
  1. **Quem** é autorizado (pessoa, trabalho e instituição).
  2. **Quais bancos e release** (p. ex. os `data.gdb` listados no doc 19, 2025
     R2) e em que volume.
  3. **Extração** dos registros para outra aplicação, incluindo os dados que a
     Ansys licencia de terceiros dentro do produto (MMPDS, ASME, ESDU, JAHM…,
     que aparecem nos Exporters do doc 19 §5), ou a exclusão expressa deles.
  4. **Hospedagem** do bundle e da base derivada (o bundle fica fora do Git,
     mas o banco de produção é servido pela internet).
  5. **Exibição em aplicação implantada** a usuários autenticados que não são
     licenciados do EduPack, incluindo as exportações (CSV, XLSX, HTML, DOCX,
     PPTX), as figuras e o processamento pela camada de IA — e se isso vale
     com o portão de assinatura do código.
  6. **Obra derivada** — conversão de unidade, normalização e combinação com
     fontes abertas.
  7. **Prazo** e o que acontece ao fim.
  8. **Atribuição** — texto exato e onde exibi-lo (tela, exportação,
     `Source.license_label`).
- Um modelo de pedido, opcional, está em
  [`autorizacoes/pedido-ansys.md`](autorizacoes/pedido-ansys.md). Enviar ou não
  é decisão do autor.
- **As fichas Granta do Cérebro** seguem o [D-45](../DECISIONS.md) (material
  de leitura da IA) e não são porta de entrada para o catálogo: dado Granta
  estruturado entra só pelo bundle do D-102.

---

## 7. Pendências para o autor decidir

1. **C0:** conferir diretamente, de uma máquina com acesso, as páginas do
   Materials Project, da Wikidata e do JARVIS-DFT, arquivar as cópias em
   `autorizacoes/evidencias/` e promover as linhas a APROVADA.
2. **Materials Project:** escrever ao suporte do MP antes do download grande
   (exigência dos termos).
3. **"Calculado":** escolher como o dado DFT é marcado (D-103, questão aberta).
4. **SRD 144:** aceitar a rota pela Wikidata ou pedir esclarecimento ao NIST.
5. **MIL-HDBK-5J:** decidir se um documento cancelado em 2006 entra, e com
   qual rótulo (§4.4).
6. **CC BY-SA:** política para conjuntos com compartilhamento pela mesma
   licença.
7. **Granta:** arquivar em `autorizacoes/` o documento de autorização (§6).
