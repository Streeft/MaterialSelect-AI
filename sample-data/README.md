# sample-data

Este diretório contém dados sintéticos usados como exemplo e para documentar o
**formato de referência** esperado pelo importador (Fase 3).

- `materials_demo.csv` — exemplo de planilha "achatada" (uma linha por material,
  colunas de propriedades com unidade indicada no cabeçalho). Serve como
  referência do tipo de arquivo que o assistente de importação deverá mapear.

Os mesmos cinco materiais são carregados no banco pelo seed programático em
`apps/api/app/db/seed.py` (que é a fonte usada pela aplicação). O CSV aqui é
apenas ilustrativo do formato de importação.
