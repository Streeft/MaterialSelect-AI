# Importação de dados (Fase 3)

A importação foi projetada para **não depender do formato da planilha do
orientador**: um assistente de mapeamento converte qualquer CSV/XLSX tabular no
modelo interno, com validação completa antes de qualquer escrita.

## Fluxo

```mermaid
flowchart LR
  A[Upload CSV/XLSX] --> B[Detecção de cabeçalhos<br/>+ amostra + sugestões]
  B --> C[Mapeamento de colunas<br/>nome, classe, propriedades, unidades]
  C --> D[Validação (dry-run)<br/>relatório linha a linha]
  D --> E{Linhas válidas?}
  E -- importar --> F[Commit transacional<br/>apenas linhas válidas]
  E -- cancelar --> G[CANCELADO]
  F --> H[IMPORTADO]
  H -- rollback lógico --> I[REVERTIDO<br/>materiais do job removidos]
```

Estados do job: `PENDENTE → VALIDADO → IMPORTADO → REVERTIDO`, com `CANCELADO`
possível antes do commit. Cada job guarda o mapeamento e o relatório em JSON —
toda importação é auditável e reproduzível.

## Formatos de célula aceitos

| Entrada | Interpretação |
|---|---|
| vazio, `N/A`, `n/d`, `não disponível`, `-` | valor **ausente** (nunca zero) |
| `69,5` / `2.5` / `1,2e3` | escalar (vírgula ou ponto decimal, notação científica) |
| `210 GPa` | escalar com **unidade na célula** (prioridade sobre a unidade mapeada) |
| `120 - 150` / `120-150 MPa` | **faixa** (min/máx), com unidade opcional |
| colunas `*_min` / `*_max` / `*_tipico` | intervalo montado a partir de colunas separadas (papéis min/máx/típico) |
| `densidade [g/cm3]` (cabeçalho) | unidade detectada no cabeçalho e normalizada (`g/cm**3`) |

Todos os valores passam pelos **mesmos construtores de domínio da entrada
manual** (`build_scalar_value`/`build_interval_value`), ou seja: conversão Pint
para a unidade canônica, trilha `conversion_method`, validação de intervalo e a
regra "ausente ≠ 0" valem por construção. Valores importados recebem
`data_quality = IMPORTADO` e a fonte informada no mapeamento.

## Validação e duplicidades

O relatório linha a linha classifica cada registro como **OK**, **erro** (classe
desconhecida, célula não interpretável, intervalo incompleto...) ou
**duplicado** (nome repetido dentro do arquivo ou já existente no catálogo).
O commit importa **apenas as linhas válidas** — ou o usuário cancela tudo. O
commit revalida imediatamente antes de gravar (o catálogo pode ter mudado entre
validação e commit) e cria todos os materiais em **uma única transação**.

## Rollback lógico

Materiais criados por um job carregam `material.import_job_id`. O rollback
remove exatamente esses materiais (os valores caem em cascata) e marca o job
como `REVERTIDO` — a importação é desfeita como uma unidade, sem tocar em
materiais pré-existentes.

## Templates de mapeamento

Um mapeamento pode ser salvo com nome (`ImportMappingTemplate`) e reaplicado em
planilhas futuras com o mesmo layout — casando pelas colunas presentes.

## Segurança

- **Extensão e conteúdo:** apenas `.csv`/`.xlsx`; o arquivo é interpretado no
  upload e rejeitado se malformado.
- **Limites:** 5 MB por arquivo e 5.000 linhas por importação (configuráveis por
  ambiente).
- **Nome de arquivo sanitizado** (apenas o basename, charset restrito) e bytes
  armazenados sob nome derivado do id do job — o nome original nunca vira path.
- **Fórmulas:** XLSX é lido com `data_only=True` (nunca texto de fórmula);
  células de texto com prefixos executáveis (`=`, `+`, `@`, TAB) são
  neutralizadas e a sanitização é registrada como aviso no relatório.
- **Parsing estrito:** célula não reconhecida gera erro na linha — nada é
  coagido silenciosamente.

## Decisão de biblioteca

A leitura usa **`csv` da stdlib + openpyxl** em vez de pandas: todos os
requisitos (sniffing de delimitador `;`/`,`, encodings UTF-8/Latin-1, abas,
valores em cache de fórmulas) são cobertos sem uma dependência de ~60 MB. Se o
futuro exigir dataframes (estatística de colunas, perfis), pandas pode ser
adicionado apenas ao módulo `importers` sem tocar no restante.

## Endpoints

| Método | Rota | Função |
|---|---|---|
| POST | `/api/imports/upload` | envia arquivo, abre job, retorna cabeçalhos/amostra/sugestões |
| POST | `/api/imports/{id}/preview` | troca de aba (XLSX) |
| POST | `/api/imports/{id}/validate` | dry-run com relatório linha a linha |
| POST | `/api/imports/{id}/commit` | importa as linhas válidas (transacional) |
| POST | `/api/imports/{id}/cancel` | cancela antes do commit |
| POST | `/api/imports/{id}/rollback` | desfaz um commit (rollback lógico) |
| GET | `/api/imports` | histórico |
| GET | `/api/imports/{id}/report` | relatório persistido |
| GET/POST | `/api/import-templates` | templates de mapeamento |
