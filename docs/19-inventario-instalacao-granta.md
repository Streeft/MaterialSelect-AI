# Inventário técnico da instalação Granta EduPack 2025 R2

Snapshot auditado em **07/10/2026** a partir da cópia da instalação disponível
no Google Drive do projeto. Este documento registra **estrutura, metadados e
fontes técnicas** usadas para construir o pipeline oficial; ele não reproduz o
corpus de registros licenciados.

## 1. Estrutura principal

A árvore observada é:

```text
ANSYS Inc/
├─ Shared Files/
└─ v252/
   ├─ licensingclient/
   ├─ Addins/
   ├─ commonfiles/
   ├─ prereq/
   ├─ installer/
   └─ edupack/
      ├─ Config/
      ├─ Exporters/
      ├─ Samples/
      ├─ database/
      ├─ locales/ + idiomas
      ├─ LicenseAdaptor/
      └─ executáveis/DLLs
```

Licenciamento e `LicenseAdaptor` entram apenas no inventário. O pipeline de
catálogo não modifica, emula nem contorna mecanismos de licença.

## 2. Bancos encontrados

`edupack/database` possui **22 diretórios de dataset**. **21** contêm
`data.gdb`; `L2_MedicalDevices` aparece apenas com `Pages` no snapshot
auditado.

| Dataset | data.gdb (bytes) |
|---|---:|
| L3_Polymer | 1.119.711.232 |
| L3_Sustainability | 380.289.024 |
| L3_Aerospace | 302.764.032 |
| L2_MSE | 210.735.104 |
| L2_Sustainability | 200.097.792 |
| L3_BioEngineering | 200.052.736 |
| L3_Standard | 192.745.472 |
| L2_Bioengineering | 189.575.168 |
| Elements | 149.790.720 |
| BuiltEnvironment | 63.684.608 |
| Design | 62.128.128 |
| L2_Spanish | 28.762.112 |
| L2_Portuguese | 27.787.264 |
| L2_French | 27.250.688 |
| L2_English | 27.021.312 |
| L2_German | 25.776.128 |
| L1_Spanish | 14.176.256 |
| L1_Portuguese | 13.168.640 |
| L1_French | 13.090.816 |
| L1_English | 13.041.664 |
| L1_German | 11.988.992 |
| L2_MedicalDevices | — |

Total dos 21 `data.gdb`: **3.273.637.888 bytes** (~3,05 GiB).

O `L3_Standard/data.gdb` foi identificado como **Microsoft Access/Jet**, não
como geodatabase GIS:

- tamanho: 192.745.472 bytes;
- SHA-256: `47699ff042a573b2990ae501860f43cbf93f22c3aeade19247eca33c64021f6a`;
- o arquivo expõe estruturas como `MaterialUniverse`, `ProcessUniverse`,
  unidades, valores discretos, equações, parâmetros, relações e grafos.

**Não concatenar os 21 bancos.** Níveis, idiomas e verticais podem repetir a
mesma identidade externa. A incorporação exige reconciliação por id/GRUID e
schema para classificar cada dataset como canônico, extensão, especialização,
localização ou subconjunto.

## 3. L3 Standard além do banco

Cada banco principal traz, além de `data.gdb`, combinações de:

- `Templates/`;
- `index/` (índice Lucene);
- `Pages/`;
- `HTML/`.

### Templates do MaterialUniverse

No snapshot do L3 Standard:

- All bulk materials
- All materials
- Ceramics
- Core materials
- Foams
- Magnetic materials
- Materials data for simulation
- Metals
- Polymers - All
- Polymers - Elastomers
- Polymers - Plastics
- Stainless alloys
- Tool steels
- Woods

### Templates do ProcessUniverse

- Joining processes
- Shaping processes
- Surface treatment

Os arquivos `.cet` são presets/configuração de seleção e layout, não registros
de propriedades. Eles são úteis como vocabulário de navegação e como referência
de UX, mas não substituem a extração relacional.

### Attribute Notes

`HTML/en.com.attributenotes.chm`:

- tamanho: 20.675.292 bytes;
- SHA-256: `1dc40697ed8e489ba9c8f6eea20f9742f7f831c854b92ebd17909580be471ae7`.

A árvore interna referencia tópicos de materiais, processos, coatings,
eletromagnetismo, baterias, manufatura aditiva, curvas e bases especializadas.
Essas notas são documentação/semântica. Texto licenciado só deve ser publicado
ou redistribuído quando a licença permitir; o pipeline não as converte em
números automaticamente.

## 4. ProductConfig.xml

`Config/ProductConfig.xml`:

- tamanho: 112.834 bytes;
- SHA-256: `6540692712f832fb0ad3bcba8e6e941289f1baa0d9479d8a1a8a4ccade39a3be`.

Contagens observadas:

| Bloco | Registros |
|---|---:|
| PrimaryProcesses | 19 |
| SecondaryProcesses | 4 |
| FinishingProcesses | 11 |
| Transportation | 54 |
| StaticFuels | 15 |
| MobileFuels | 25 |
| MaterialCosts | 15 |
| Countries | 53 |

O arquivo contém parâmetros relevantes a Eco Audit/Part Cost, incluindo
energia/carbono de transporte, densidade crítica, distâncias/fatores de
transporte, combustíveis, custos, defaults de processo, frações de
reciclagem/refugo e dados por país.

`scripts/granta/product_config_to_canonical.py` preserva esses fatos sem
assumir que todos já podem alimentar os cálculos atuais.

## 5. Exporters como dicionário semântico

`edupack/Exporters` contém configurações para, entre outros:

- MaterialUniverse;
- Global Metals;
- Global Polymers;
- MMPDS;
- JAHM;
- High Temperature Alloy Data;
- Electromagnetics;
- Sheet Steels;
- ASME;
- Additive Data;
- ESDU;
- formatos/solvers como Workbench, MAPDL, Abaqus, LS-DYNA, Nastran, Fluent,
  Motor-CAD, Electronics Desktop, Sherlock e MatML.

O arquivo de transferência genérico
`Exporter_Data_Transfer.exp`:

- tamanho: 29.522 bytes;
- SHA-256: `fa2497f9f93ab466a46d4b14bc02cea33e4d8bbb0636aa9b4a7e62890fb76bf9`;
- referencia nove tabelas:
  - ASME BPVC 2023 Edition;
  - ESDU MMDH;
  - Global Metals Specifications;
  - High Temperature Alloy Data;
  - JAHM Curve Data;
  - MaterialUniverse;
  - MMPDS-2024 Data;
  - Global Polymers Plastics;
  - Electromagnetic Materials.

Os `.exp` usam `StandardName` e `EntireGraph=true`. Isso permite distinguir,
por exemplo, `Density` escalar de propriedades dependentes de temperatura,
frequência, deformação ou ciclos. O parser
`scripts/granta/exporter_configs_to_dictionary.py` consolida esse vocabulário
por GUID/tabela sem copiar registros de materiais.

## 6. Componentes funcionais identificados

A instalação contém bibliotecas cujos nomes confirmam subsistemas relevantes à
comparação funcional do MaterialSelect:

- `Granta.DataAccess.Core.MSAccess.dll`
- `Granta.DataAccess.MSAccess.dll`
- `Granta.DataAccess.Projects.MSAccess.dll`
- `Granta.DataPopulation.dll`
- `cesdb.dll`
- `DbUtil.dll`
- `CESSearch.dll`
- `LuceneSearch.dll`
- `Charting.dll` / `Granta.Charting.UI.dll`
- `ExprLib.dll`
- `Granta.EngineeringSolver.dll`
- `Granta.Selection.dll` / `Granta.Selection.WinForms.dll`
- `Granta.SynthesizerUI.dll`
- `Granta.ProductDesign.dll` e reporting associado

Os nomes das DLLs orientam o inventário de capacidades; não são documentação de
API e não autorizam inferir comportamento interno que os arquivos não provam.

## 7. Samples e páginas

`Samples/eco_audit` confirma material auxiliar dedicado ao Eco Audit.

`Pages/` contém a aplicação web estática usada por páginas de apoio do
EduPack (HTML/JS/CSS/assets). Ela é referência de organização/UX, não fonte
relacional de propriedades.

## 8. Ferramentas versionadas nesta PR

| Ferramenta | Papel |
|---|---|
| `export_all_databases.ps1` | encontra e exporta todos os `data.gdb` em uma execução |
| `export_access_gdb.ps1` | exporta um Access/Jet em modo somente leitura, preservando schema/tipos/blobs |
| `validate_raw_export.py` | recalcula hashes, contagens e sidecars do export bruto |
| `exporter_configs_to_dictionary.py` | consolida GUIDs/tabelas/`StandardName`/curvas dos `.exp` |
| `product_config_to_canonical.py` | normaliza fatos do ProductConfig sem fuzzy write |
| `build_canonical_bundle.py` | fecha o staging revisado num ZIP canônico com manifest e hashes |

## 9. Limite do snapshot

Este inventário descreve os arquivos que já estavam presentes no Drive durante a
auditoria de 07/10/2026. Antes de gerar a release oficial, execute novamente
`export_all_databases.ps1` sobre a instalação/cópia final e compare
`database_inventory.json` com este snapshot.

O corpus de materiais propriamente dito não é versionado aqui. A verdade sobre
contagens de registros, identidades e propriedades só deve ser declarada depois
do export relacional validado.
