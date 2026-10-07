# 20 — Catálogo complementar de fontes abertas: portão de licença

Regra deste repositório para **qualquer agente ou pessoa** que traga dado de
material de uma fonte **aberta** (Materials Project, Wikidata, NIST, JARVIS,
conjuntos CC BY…) ou que proponha uma base comercial como fonte. O `CLAUDE.md`
da raiz aponta para cá (princípio 7). Decisão: [D-103](DECISIONS.md)
(**rascunho**). Vereditos por fonte: [`catalogo/fontes.md`](catalogo/fontes.md).

**O que este documento não cobre.** O catálogo oficial licenciado do Granta
EduPack tem trilha própria, do autor: [D-102](DECISIONS.md),
[`18-catalogo-oficial-granta.md`](18-catalogo-oficial-granta.md) (pipeline,
bundle, cutover) e
[`19-inventario-instalacao-granta.md`](19-inventario-instalacao-granta.md)
(inventário da instalação). Nada aqui revê, condiciona ou substitui o D-102.

## A regra em uma frase

**Dado de fonte aberta só entra no catálogo se a fonte tiver veredito
APROVADA em [`catalogo/fontes.md`](catalogo/fontes.md), com a licença
registrada na `Source` ([D-44](DECISIONS.md)), e pelo mesmo pipeline do
D-102 — bundle canônico com manifest e SHA-256, dry-run, identidade externa em
`CatalogRecordRef` e revisor humano no commit —, nunca por seed, nunca à mão no
banco.**

Não existe um segundo importador para fontes abertas. O F0 original previa um
(`app.db.import_catalog`); o D-102 já entregou o pipeline em `app/catalog/`, e
duas portas de entrada para o mesmo catálogo seriam duas verdades sobre
proveniência. Uma fonte aberta vira um `CatalogDataset` próprio (slug e
release imutáveis), classificado na reconciliação do D-102 §5 — em geral como
**extensão de propriedades** ou **domínio especializado** do catálogo
canônico.

## Por que a regra é dura

O repositório é **público** ([D-22](DECISIONS.md)) e a aplicação é
**implantada** ([D-52](DECISIONS.md)), com portão de assinatura paga no código
([D-46](DECISIONS.md), [D-83](DECISIONS.md)). Tudo o que entra no catálogo é
redistribuído — na tela, nas exportações, nas figuras e no que a camada de IA
lê. Uma fonte proibida descoberta depois não se desfaz com um `DELETE`, e o
histórico git não se apaga de verdade ([D-100](DECISIONS.md) mostrou o custo de
tentar).

## Proibido

- **Coletar de fonte RECUSADA, PENDENTE ou APROVADA-CONDICIONAL.** Só a
  APROVADA é coletável, e nas condições da linha.
- **Extração em massa de base comercial** — MatWeb, Total Materia, ASM,
  MMPDS, CAMPUS ou qualquer outra cujos termos proíbam *scraping*, coleta
  sistemática ou redistribuição. Vale para script, robô e cópia manual
  sistemática.
- **Copiar conteúdo de base comercial** — texto, tabelas, imagens, nomes de
  registro — mesmo quando o uso for só **inspiração de funcionalidade**. A
  inspiração descreve o que um produto faz, a partir das páginas públicas
  dele; o conteúdo fica lá ([`catalogo/fontes.md` §5](catalogo/fontes.md)).
- **Lavar a origem.** Valor de base comercial que chegou a um repositório
  aberto (um *dataset* no Zenodo, uma declaração na Wikidata) continua sendo
  cópia da base comercial: é recusado ([`catalogo/fontes.md` §4.2 e
  §4.7](catalogo/fontes.md)).
- **Escrever valor de propriedade de material em literal Python**
  (princípio 1).
- **Preencher lacuna** com estimativa, média de família ou "valor típico" sem
  fonte (princípio 3: ausência é `is_missing=True`, nunca zero).
- **Ler arquivos Granta** a partir deste fluxo. O dado Granta entra só pela
  trilha do D-102, que é operada pelo autor.

## Obrigatório

- **Fonte nova é linha nova em `fontes.md` antes da coleta**, com licença,
  URL da página de licença, atribuição, redistribuição/uso comercial,
  veredito, data e quem verificou. Em dúvida, **não aprovar e escalar** ao
  autor; o agente não decide licença ambígua.
- **Leitura direta da página de licença** (condição C0 de `fontes.md` §2),
  com cópia datada em `docs/catalogo/autorizacoes/evidencias/`. Um trecho de
  buscador basta para recusar, nunca para aprovar.
- **Licença Creative Commons "NC" não serve** enquanto o código tiver
  cobrança; "ND" também não (normalizar unidade é obra derivada); "SA" é
  escalada ao autor.
- **`is_demo=False`** em todo registro de fonte aberta. O commit de qualquer
  dataset recusa enquanto houver demo no banco (D-102, invariante 4).
- **Calculado nunca se passa por medido.** Dado de DFT (Materials Project,
  JARVIS) é marcado como calculado e nunca sobrescreve valor medido. Hoje
  `DataQuality` tem `MEDIDO`, `IMPORTADO` e `ESTIMADO`; como representar
  "calculado" — valor novo do enum, `CatalogSupplementalValue` ou rótulo da
  `Source` — é decisão aberta no D-103.
- **Unidade original + normalizada + método** preservados (princípio 4), o que
  também cumpre o "indicar modificação" da CC BY.
- **Atribuição exigida pela licença** no rótulo da `Source` e no manifest do
  dataset, e portanto em toda exportação que já carrega a proveniência.
- **Log de workflow: só contagens e hashes** — o log do Actions é público
  (lição do D-101).
- **Staging fora do git** (`data/staging/`, no `.gitignore`); o bundle
  canônico segue o D-102 (URL privada, manifest com hash e contagem).

## Fluxo

```
fontes.md (veredito APROVADA, C0 cumprida)
        │
        ▼
coleta pela API/dump oficial ─► data/staging/ (fora do git)
        │
        ▼
QA de unidade e plausibilidade (só reporta, não corrige)
        │
        ▼
bundle canônico do D-102 (dataset.json com licença e atribuição)
        │
        ▼
catalogo_oficial_validar (dry-run) ─► catalogo_oficial_importar (revisor humano)
```

| Etapa | Saída verificável |
|---|---|
| **F0 — Portão de licença** (esta) | `catalogo/fontes.md` com veredito por fonte, data e URL; nenhum dado coletado. |
| F1 — Representar "calculado" | Decisão registrada no D-103 (enum, suplementar ou rótulo) antes de a primeira linha DFT existir. |
| F2 — Coleta | Staging em `data/staging/` + `manifest.json`, só de fonte APROVADA. |
| F3 — QA | Checagens de unidade e física; zero erro bloqueante. |
| F4 — Bundle e dry-run | `build_canonical_bundle.py` + `catalogo_oficial_validar`; contagens batem com o manifest. |
| F5 — Commit | `catalogo_oficial_importar` com o e-mail do revisor (ação do autor no Actions), depois do cutover do D-102. |

## Ver também

- [`catalogo/fontes.md`](catalogo/fontes.md) — vereditos, condição C0, a
  trilha Granta (D-102) e o que a autorização dela deve cobrir, e as bases
  comerciais recusadas.
- [`catalogo/autorizacoes/`](catalogo/autorizacoes/) — onde se arquivam
  autorizações e evidências de licença.
- [D-44](DECISIONS.md) (licença no registro da fonte), [D-45](DECISIONS.md)
  (Cérebro), [D-72](DECISIONS.md) (exclusão de demo), [D-102](DECISIONS.md)
  (pipeline do catálogo oficial), [D-103](DECISIONS.md) (esta regra,
  rascunho).
