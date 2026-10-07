# Catálogo oficial licenciado: ingestão Granta EduPack

Este documento descreve o caminho de dados do catálogo oficial e o corte da base
fictícia. Ele complementa [06-importacao.md](06-importacao.md): o importador
interativo continua sendo a porta para planilhas de usuários; o catálogo oficial
é uma operação administrativa, versionada por *manifest* e checksum, com
reconciliação antes de escrever no catálogo compartilhado.

## 1. Princípio

Os arquivos licenciados do Granta **não entram no histórico Git**. O repositório
versiona somente:

- extratores e normalizadores;
- o contrato canônico;
- migrations e importador;
- testes;
- documentação e mapeamentos que não reproduzam o corpus.

O bundle com os registros oficiais fica em armazenamento privado, endereçado por
uma URL guardada no secret `OFFICIAL_CATALOG_BUNDLE_URL`. Cada execução valida
o SHA-256 do próprio ZIP, do `manifest.json` e de cada arquivo NDJSON antes de
ler um registro.

## 2. Fluxo

```text
data.gdb / ProductConfig.xml
        |
        v
extração somente leitura
        |
        v
staging NDJSON + hashes + schema
        |
        v
normalização e revisão humana
        |
        v
bundle canônico .zip
        |
        +--> dry-run: bytes + contagens + referências
        |
        v
excluir_demo
        |
        v
import oficial transacional
        |
        v
reconciliação / smoke tests
```

O importador oficial **recusa o commit** enquanto existir qualquer
`Material.is_demo=True`, `Process.is_demo=True` ou
`TransportMode.is_demo=True`.

## 3. Extração do Access

No Windows com Microsoft Access Database Engine instalado:

```powershell
pwsh scripts/granta/export_access_gdb.ps1 `
  -DatabasePath "C:\...\L3_Standard\data.gdb" `
  -OutputDirectory "D:\granta-export\L3_Standard"
```

O script:

1. tenta `Microsoft.ACE.OLEDB.16.0`, `12.0` e Jet 4;
2. nunca abre o banco em modo de escrita;
3. enumera tabelas de usuário;
4. grava `schema.json`;
5. grava uma linha JSON por registro em `tables/*.ndjson`;
6. preserva binários em `blobs/<sha256>.bin`;
7. gera `raw_manifest.json` com contagem e SHA-256 por tabela;
8. usa uma cópia temporária `.mdb` somente se o provider recusar a extensão
   `.gdb`.

O export bruto **não é o bundle de produção**. Ele existe para descoberta de
schema e para normalização posterior.

## 4. Contrato canônico

Um bundle pode declarar estes arquivos:

- `material_classes.ndjson`
- `property_definitions.ndjson`
- `materials.ndjson`
- `material_values.ndjson`
- `process_classes.ndjson`
- `process_attribute_definitions.ndjson`
- `processes.ndjson`
- `process_attribute_values.ndjson`
- `material_process_links.ndjson`
- `transport_modes.ndjson`
- `supplemental_values.ndjson`
- `dataset_values.ndjson`

`manifest.json` tem `schema_version=1`, metadados do dataset e, para cada
arquivo, `sha256` + `count`.

O builder:

```bash
python scripts/granta/build_canonical_bundle.py \
  --staging-dir /caminho/staging \
  --dataset-json /caminho/dataset.json \
  --output /caminho/materialselect-official.zip
```

Exemplo mínimo de `dataset.json`:

```json
{
  "slug": "granta-edupack-2025r2-l3-standard",
  "name": "Granta EduPack L3 Standard",
  "release": "2025 R2",
  "source_sha256": "<sha256 do data.gdb de origem>",
  "license_label": "Uso autorizado/licenciado",
  "provenance": "Extraído de instalação licenciada e revisado antes da carga"
}
```

O slug identifica **uma release imutável**. Se os bytes de origem mudarem,
cria-se outro slug/release; o importador nunca aceita que o mesmo dataset passe
a significar bytes diferentes.

## 5. Identidade externa e deduplicação

`CatalogRecordRef` liga cada registro interno a:

- dataset;
- tabela externa;
- id externo;
- GRUID, quando houver;
- SHA-256 do registro bruto;
- exatamente um alvo: material, processo ou modal.

Isso evita deduplicar apenas por nome. Um nome traduzido ou editado não é
identidade. GRUID/id externo e hash são a trilha auditável.

Datasets L1/L2/L3 e verticais não devem ser concatenados cegamente. Antes de
incorporar uma nova base, a reconciliação precisa classificá-la como:

- fonte canônica;
- extensão de propriedades;
- domínio especializado;
- tradução/localização;
- subconjunto/visão da mesma identidade.

## 6. Valores que o modelo atual não representa

`MaterialPropertyValue` continua sendo a fonte de verdade para valores
numéricos escalares/intervalares usados em seleção, ranking e gráficos.

Valores oficiais que não cabem nesse contrato — texto, vocabulário discreto,
curva, equação ou outro objeto estruturado — vão para
`CatalogSupplementalValue`.

A regra é **preservar antes de interpretar**. O simples fato de uma curva conter
um ponto a 20 °C não autoriza transformá-la em propriedade escalar. Quando uma
feature determinística for criada para consumir a curva, ela deve declarar como
o ponto foi escolhido/interpolado e manter a referência ao dado original.

`CatalogDatasetValue` faz a mesma coisa para fatos que pertencem ao dataset
como um todo, por exemplo defaults econômicos, combustíveis, dados por país e
parâmetros de fim de vida.

## 7. ProductConfig.xml

`scripts/granta/product_config_to_canonical.py` extrai sem copiar o XML para o
Git.

Ele gera:

- modais em `transport_modes.ndjson`;
- parâmetros adicionais dos modais;
- defaults de processo, quando há um `--process-map` revisado;
- combustíveis estáticos e móveis;
- parâmetros globais de fim de vida e custo;
- frações de valor de material reciclado/refugo por classe;
- dados por país (mão de obra, matriz energética/carbono e custos de
  combustíveis).

Processos **não são unidos por fuzzy match automaticamente**. A associação entre
um processo do ProductConfig e um registro do ProcessUniverse só acontece quando
um arquivo de mapeamento explícito aponta GRUID/nome para o external_id
canônico.

## 8. Proveniência/licença

No primeiro commit do dataset, o importador exige um usuário MaterialSelect
existente em `--reviewer-email`.

A `Source` oficial é criada com:

- `is_demo=False`;
- `contains_third_party_data=True`;
- rótulo de licença vindo do manifest;
- `reviewed_by_user_id`;
- `reviewed_at`.

Esse é o registro de que a decisão de incorporar a fonte foi humana. A aplicação
não infere licença.

## 9. Operação pelo GitHub Actions

No repositório, configure:

- `DATABASE_URL`: já usado pela Administração do banco;
- `OFFICIAL_CATALOG_BUNDLE_URL`: URL privada/temporária de leitura do bundle.

Ações disponíveis em **Administração do banco**:

- `semear_referencia`: só metadados/dados reais reutilizáveis;
- `semear_demo`: recria deliberadamente a base fictícia; uso de desenvolvimento;
- `excluir_demo`: hard delete exclusivamente de registros `is_demo=True`;
- `catalogo_oficial_validar`: baixa o bundle e roda o dry-run, sem escrita;
- `catalogo_oficial_importar`: baixa, revalida e faz o commit transacional.

Para `catalogo_oficial_importar`, o campo **E-mail** é o revisor humano da
fonte e precisa corresponder a uma conta que já entrou na aplicação.

## 10. Cutover recomendado

1. mesclar o PR de código;
2. **Deploy da API**;
3. confirmar migrações/health;
4. criar o secret `OFFICIAL_CATALOG_BUNDLE_URL`;
5. rodar `catalogo_oficial_validar`;
6. conferir hashes, dataset e contagens;
7. tirar snapshot/backup do banco de produção;
8. rodar `excluir_demo`;
9. rodar `semear_referencia`;
10. rodar `catalogo_oficial_importar`, informando o e-mail do revisor;
11. conferir o resumo do import e os smoke tests;
12. nunca rodar `semear_demo` nesse banco depois do cutover.

Se o import falha, a transação não deixa metade do catálogo oficial gravada.

## 11. O que esta fundação ainda não faz

O repositório **não contém** o corpus de materiais licenciado. A extração dos
`data.gdb` precisa ocorrer numa máquina Windows com ACE/Jet disponível, seguida
da normalização/revisão do schema bruto para o contrato canônico.

Também não se assume que `L3_Standard` contenha todos os domínios. Bases como
Polymer, Sustainability, Aerospace, BioEngineering, Elements e Design precisam
ser reconciliadas por identidade externa antes de serem incorporadas.

Esse limite é deliberado: um pipeline que preserva e prova cada registro é
preferível a uma carga automática que duplica ou achata dados oficiais.
