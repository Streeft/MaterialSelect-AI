# Estudo de caso didático (A2)

Entregável explícito da proposta (itens 2.6 e 6): um caso com solução
consolidada na literatura, do enunciado ao relatório exportado, verificando
se os candidatos e a ordenação correspondem ao esperado. Este documento é
esse roteiro — e é também o registro de que ele foi de fato executado contra
a aplicação real, não simulado.

> Os artefatos citados abaixo — planilha de entrada, relatório de seleção,
> laudo de engenharia e o JSON bruto da execução — estão em
> [`docs/estudo-de-caso/`](estudo-de-caso/). Nada neste documento foi composto
> à mão a partir de números calculados fora da aplicação: cada tabela abaixo
> vem de uma resposta real da API, capturada no momento da execução (seção 4).

---

## 1. O caso escolhido, e por quê

**Tirante leve e rígido** ("light, stiff tie") — o exemplo mais simples e mais
citado da metodologia de Ashby (*Materials Selection in Mechanical Design*):
um elemento estrutural sob tração pura, de comprimento e rigidez axial
especificados, cujo objetivo é minimizar a massa variando apenas a área da
seção transversal. A derivação clássica (substituir a área que atende a
rigidez na expressão da massa) resulta no índice de desempenho a **maximizar**

```
M = E / ρ
```

— módulo de Young sobre densidade, "rigidez específica". Três razões para
escolher exatamente este caso, e não outro do mesmo livro:

1. **Já está no catálogo semeado.** `app/db/seed.py` registra o índice
   `rigidez-especifica` (`modulo_young / densidade`, maximizar) com a
   descrição "Módulo de Young por unidade de massa (E/ρ)" e a referência
   "Ashby, Material Selection in Mechanical Design" nas próprias hipóteses —
   este estudo de caso reusa esse índice, não inventa um novo.
2. **O resultado é genuinamente consolidado**, não uma curiosidade de um
   único autor: é o exemplo introdutório de virtualmente todo curso baseado
   em Ashby, com uma conclusão contraintuitiva e bem documentada — cerâmicas
   têm a melhor rigidez específica de todas as classes, e é exatamente por
   isso que o caso didático precisa de uma segunda restrição (§2) para chegar
   à resposta de engenharia real, não só à resposta aritmética.
3. **A rejeição por classe já existe na aplicação** (`not_in_class`), então a
   restrição de fragilidade do §2 não exige nenhuma propriedade nova
   (tenacidade à fratura não está no catálogo) — usa o que já está construído.

---

## 2. Enunciado, no formato Função → Restrições → Objetivo → Variáveis livres

O mesmo formato que `/selecao` pede ao usuário:

| Campo | Conteúdo |
|---|---|
| **Função** | Tirante — elemento estrutural sob tração pura |
| **Restrições** | (a) material fornecido para este estudo (nove candidatos, §3); (b) não frágil — cerâmicas excluídas do uso em tração, onde a baixa tenacidade à fratura as torna inadequadas apesar da rigidez específica alta |
| **Objetivo** | Minimizar a massa para uma rigidez axial especificada |
| **Variáveis livres** | Área da seção transversal |
| **Índice a maximizar** | `M = E / ρ` (`rigidez-especifica`, já semeado) |

A restrição (b) é a parte que a aritmética sozinha não resolve — é o próprio
ponto pedagógico do caso (§6).

---

## 3. Dados e fontes

Nove materiais, cinco classes — as mesmas do catálogo semeado (Metais,
Polímeros, Cerâmicas, Compósitos, Elastômeros). Só `densidade` e
`modulo_young` foram informados: as demais propriedades ficam ausentes, não
zeradas — a mesma regra que vale para qualquer material do catálogo.

| Material | Classe | ρ (g/cm³) | E (GPa) | E/ρ (GPa·cm³/g) |
|---|---|---:|---:|---:|
| CFRP laminado (epóxi/fibra de carbono) | Compósitos | 1,50 | 53 | 35,33 |
| Liga de alumínio 7075-T6 | Metais | 2,70 | 70 | 25,93 |
| Liga de titânio Ti-6Al-4V | Metais | 4,43 | 114 | 25,73 |
| Aço estrutural (tipo A36/SS400) | Metais | 7,85 | 200 | 25,48 |
| GFRP laminado (epóxi/fibra de vidro) | Compósitos | 1,80 | 26 | 14,44 |
| Alumina (Al₂O₃) | Cerâmicas | 3,90 | 390 | 100,00 |
| Poliamida 6/6 (Nylon) | Polímeros | 1,15 | 3,0 | 2,61 |
| Polipropileno | Polímeros | 0,905 | 1,5 | 1,66 |
| Borracha natural (NR) | Elastômeros | 1,10 | 0,05 | 0,045 |

CSV completo (o mesmo arquivo importado em §4):
[`estudo-de-caso/materiais-haste-leve-rigida.csv`](estudo-de-caso/materiais-haste-leve-rigida.csv).

### 3.1 Fontes e limitação das cifras

**Estas são cifras representativas de classe, não a medição de uma liga, lote
ou norma específica.** `E` varia com tratamento térmico, orientação de fibra,
grau do polímero e teor de umidade da madeira muito mais do que a precisão
aparente de duas ou três casas decimais sugere — e é exatamente por isso que
o princípio 1 do `CLAUDE.md` ("não inventar propriedades de materiais") não
foi violado no sentido em que a aplicação o proíbe: nenhum valor aqui é
apresentado como medição de um material específico do catálogo real da
aplicação (que continua vazio de dado proprietário, como sempre foi — ver
`PROJECT_CONTEXT.md §9`). É um conjunto **separado**, rotulado como tal desde
o `Source` até este documento, para demonstrar o método contra uma referência
publicada — não para povoar o catálogo de produção.

As cifras foram checadas contra duas referências independentes por busca (o
ambiente onde este estudo foi executado bloqueia o acesso direto às páginas de
origem — só a busca em si, não a leitura da página inteira, esteve disponível,
e isso está registrado aqui em vez de escondido):

- **Ashby, M. F. — *Materials Selection in Mechanical Design*** — referência
  do próprio índice `rigidez-especifica` já semeado; a ordem de grandeza de
  cada classe neste caso reproduz a que o livro relata (compósitos e
  cerâmicas no topo, metais em um platô estreito, polímeros e elastômeros
  muito abaixo).
- **MIT OpenCourseWare, curso 3.11 *Mechanics of Materials*** — tabela de
  propriedades de engenharia no formato Tipo/Densidade/Módulo de
  Young/Custo (aço, liga de alumínio 7075-T6, CFRP e GFRP laminados,
  alumina) — o mesmo formato das tabelas do próprio Ashby.
- **ScienceDirect, tópico "Material Property Chart"** — confirma a mesma
  faixa para essas classes e a correlação diagonal E–ρ que organiza os mapas
  de Ashby.
- Titânio Ti-6Al-4V, poliamida, polipropileno e borracha natural: valores
  "de manual" amplamente publicados, consistentes entre si e com a ordem de
  grandeza das referências acima.

A citação completa está gravada no próprio banco: o `Source` desta
importação (rótulo *"Estudo de caso didático — Ashby (valores típicos de
classe)"*) carrega o texto integral no campo `reference`, e aparece na
proveniência de cada valor no relatório exportado (§4).

---

## 4. Execução real

Executado contra a aplicação real — API subida localmente, banco limpo,
autenticação pela mesma sessão fixa que o Playwright usa (`ENVIRONMENT=development`
+ `E2E_SESSION_TOKEN`, sem bypass exposto por rota nenhuma — ver
`docs/CLAUDE.md §5`), sem nenhum atalho que pulasse a aplicação. Passo a
passo, com o endpoint real de cada etapa:

1. **Importação** — `POST /api/imports/upload` (planilha do §3) →
   `POST /api/imports/{id}/validate` (mapeamento explícito: só `densidade` e
   `modulo_young`, unidade de cada coluna declarada) → `valid_count: 9`,
   `error_count: 0` → `POST /api/imports/{id}/commit` → `imported_count: 9`.
   As sugestões automáticas de coluna (`suggestions` na resposta do upload)
   acertaram as nove colunas sozinhas, inclusive `densidade`/`modulo_young`
   por slug — o mesmo mecanismo cujo bug de hífen/underscore a suíte A4
   corrigiu numa sessão anterior.
2. **Isolamento do conjunto** — o catálogo já tinha os cinco materiais
   fictícios do seed; uma restrição `text_contains: "caso-de-estudo"` (a
   palavra-chave de toda linha da planilha) isola exatamente os nove
   materiais deste caso, sem tocar nos outros.
3. **Seleção** — `POST /api/selection/run`: restrições (conjunto do caso +
   `not_in_class: ["ceramicas"]`), índice `modulo_young / densidade`
   (maximizar), um único critério de ranking (`__index__`, peso 1,
   normalização minmax).
4. **Estudo salvo e exportação** — `POST /api/selection/studies` (mesmos
   parâmetros, para reexecução determinística) →
   `GET /api/exports/estudos/{id}.html` (relatório de seleção) e
   `GET /api/exports/estudos/{id}/laudo.html?responsavel=...` (laudo de
   engenharia, Fase 9).

Artefatos reais desta execução, sem edição:
[`evidencias/resultado-run.json`](estudo-de-caso/evidencias/resultado-run.json)
(resposta bruta de `/selection/run`),
[`evidencias/relatorio-selecao.html`](estudo-de-caso/evidencias/relatorio-selecao.html),
[`evidencias/relatorio-selecao.csv`](estudo-de-caso/evidencias/relatorio-selecao.csv) e
[`evidencias/laudo-engenharia.html`](estudo-de-caso/evidencias/laudo-engenharia.html).

E a auditoria (M2, esta mesma sessão) registrou o próprio ato de salvar o
estudo — `GET /api/audit?entity_type=selection_study` devolveu um evento
`CRIADO` com o e-mail da sessão e o nome do estudo, no instante exato em que
o `POST /api/selection/studies` do passo 4 respondeu. Nenhuma importação em
lote aparece na auditoria — o limite documentado em
[D-43](DECISIONS.md#d-43--a-trilha-de-auditoria-guarda-retratos-não-junções-vivas-e-não-cobre-a-importação-em-lote).

### Funil de restrições (resposta real)

| Restrição | Operador | Passaram | Restantes |
|---|---|---:|---:|
| Conjunto do estudo de caso | `text_contains` | 9 | 9 |
| Não frágil (cerâmica excluída de uso em tração) | `not_in_class` | 12 | 8 |

(14 materiais no catálogo no momento da execução — os 9 deste caso mais os 5
fictícios do seed; a primeira restrição já isola os 9, a segunda remove só a
Alumina.)

---

## 5. Resultado obtido

| Posição | Material | Classe | E/ρ (índice) | Escore normalizado |
|---:|---|---|---:|---:|
| 1 | CFRP laminado (epóxi/fibra de carbono) | Compósitos | 35 333 333 | 1,000 |
| 2 | Liga de alumínio 7075-T6 | Metais | 25 925 926 | 0,733 |
| 3 | Liga de titânio Ti-6Al-4V | Metais | 25 733 634 | 0,728 |
| 4 | Aço estrutural (tipo A36/SS400) | Metais | 25 477 707 | 0,721 |
| 5 | GFRP laminado (epóxi/fibra de vidro) | Compósitos | 14 444 444 | 0,408 |
| 6 | Poliamida 6/6 (Nylon) | Polímeros | 2 608 696 | 0,073 |
| 7 | Polipropileno | Polímeros | 1 657 459 | 0,046 |
| 8 | Borracha natural (NR) | Elastômeros | 45 455 | 0,000 |

(Índice em unidade canônica, Pa/(kg/m³) = m²/s² — o que importa é a ordem e a
razão entre valores, não a escala; a tabela do §3 traz os mesmos números em
GPa·cm³/g, mais legíveis.)

## 6. Comparação com a literatura

O resultado bate com o que a literatura de Ashby relata para este problema,
em três pontos específicos — nenhum deles é uma coincidência do conjunto de
materiais escolhido, são as três conclusões que o exemplo do tirante existe
para ilustrar:

1. **Compósitos de fibra à frente de metais.** CFRP lidera com folga (35,3
   contra ~25,5–25,9 dos metais) — cerca de 36% acima do melhor metal. É a
   conclusão central do exemplo: para rigidez por unidade de massa,
   compósitos avançados superam qualquer metal estrutural comum.
2. **Os três metais estruturais ficam num platô estreito.** Alumínio,
   titânio e aço variam menos de 2% entre si em E/ρ (25 477 707 a
   25 925 926 — a diferença é 1,8%), mesmo com `E` e `ρ` individualmente
   muito diferentes entre eles (ρ varia quase 3× entre alumínio e aço). É a
   observação mais citada dos mapas de Ashby: **como classe, os metais
   estruturais têm rigidez específica quase idêntica** — a escolha entre
   eles, na prática, se decide por outro critério (custo, temperatura de
   serviço, processo de fabricação), não pela rigidez por massa.
3. **A cerâmica tinha o melhor índice bruto — e foi corretamente excluída.**
   Alumina teria ficado em primeiro (100,0, quase 3× o CFRP) se só o índice
   decidisse. A restrição de fragilidade a remove antes do ranking, e é
   exatamente esse o ensinamento consolidado do próprio Ashby sobre
   cerâmicas: excelentes em rigidez específica, inadequadas para tração por
   baixa tenacidade à fratura — um único índice nunca é a resposta completa,
   é preciso a restrição que o índice sozinho não carrega. O funil do §4
   mostra a exclusão acontecendo, não apenas o resultado final sem ela.

**Os candidatos e a ordenação correspondem ao esperado** — o critério que o
item 2.6/6 da proposta pede como verificação.

---

## 7. Limitações deste caso

- **Cifras representativas, não medidas** (§3.1) — repetido aqui por ênfase:
  é o limite mais importante deste documento.
- **Sem custo nem temperatura de serviço.** O catálogo tem `custo_massa` e
  `temp_max_servico`; este caso deliberadamente não os usa, para manter o
  problema no formato mais simples e mais citável do livro. Acrescentá-los
  é a extensão natural (e o índice mudaria: `M = E / (ρ · Cm)` para custo,
  por exemplo).
- **Nove materiais no total** — três metais (para mostrar o platô entre eles,
  §6), dois compósitos, dois polímeros, uma cerâmica, um elastômero. Não é uma
  varredura de catálogo real, é o mínimo necessário para reproduzir a
  comparação entre classes.
- **Verificação de página bloqueada neste ambiente.** As buscas (§3.1)
  devolveram trechos e a ordem de grandeza, não a tabela completa lida da
  fonte original — registrado, não escondido.

## 8. Como reproduzir

- **Automatizado (regressão de CI):** `app/tests/test_case_study.py` —
  importa a mesma planilha, roda a mesma seleção e verifica a mesma
  ordenação e o platô dos três metais a cada execução da suíte.
- **Manual, contra uma API rodando:** repita os quatro passos do §4 com o
  arquivo de [`estudo-de-caso/materiais-haste-leve-rigida.csv`](estudo-de-caso/materiais-haste-leve-rigida.csv)
  e o mapeamento do §4 — o resultado é determinístico, reproduz
  exatamente a tabela do §5.
