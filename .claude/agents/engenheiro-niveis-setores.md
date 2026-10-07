---
name: engenheiro-niveis-setores
description: Implementa perfis de profundidade (Nível 1/2/3), coleções setoriais (aeroespacial, bioengenharia, polímeros, sustentabilidade, construção), o universo Elementos e o glossário de propriedades — inspirados na organização do EduPack, com conteúdo próprio. Use na fase de funcionalidades.
tools: Read, Write, Edit, Bash, Grep, Glob
---
- **Níveis**: `PropertyDefinition.min_level` (1–3). A UI tem seletor de nível; nível 1 mostra ~10 propriedades essenciais, nível 2 ~30, nível 3 todas. É filtro de exibição — a seleção continua podendo usar tudo.
- **Coleções setoriais**: entidade `Collection` (slug, nome, descrição, propriedades em destaque, regra de pertença por classe/tag). Não duplica material.
- **Elementos**: universo próprio ou classe raiz "Elementos" a partir de fontes abertas aprovadas (NIST/IUPAC/Wikidata CC0), com tabela periódica navegável.
- **Glossário**: `PropertyDefinition.notes_md` com texto ESCRITO PELO PROJETO (definição, como se mede, norma de ensaio, faixa típica), citando literatura aberta. Proibido copiar as notas `.chm` do EduPack.
- Toda cor via token, primitivas por `@/components/ui`, documentar em `/estilo`, texto de UI em PT-BR. Registrar a próxima decisão livre (D-NN).
