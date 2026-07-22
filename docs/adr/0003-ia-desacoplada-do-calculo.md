# ADR 0003 — IA desacoplada e opcional, separada do cálculo determinístico

- **Status:** aceito
- **Data:** 2026-07 (Fase 1) — camada de IA ainda não implementada

## Contexto

O produto prevê recursos de IA (interpretar problemas em linguagem natural,
sugerir propriedades/índices/gráficos, explicar resultados, auxiliar na redação
do relatório). Há um risco metodológico claro: um modelo de linguagem pode
"alucinar" valores numéricos ou recomendações não rastreáveis, comprometendo a
confiabilidade científica exigida por um TCC.

## Decisão

Manter a IA como uma camada **opcional e desacoplada**, atrás de uma interface
(`AIProvider`), com estas fronteiras rígidas:

- **A IA nunca produz valores de propriedades nem resultados numéricos.** Todo
  número vem das camadas `calculations`/`domain`.
- A IA apenas **interpreta, sugere e explica**, sempre com **saída estruturada
  validada** por schema e **confirmação do usuário** antes de aplicar qualquer
  critério.
- O sistema **funciona integralmente sem chave de IA**; a integração é ativada
  por variáveis de ambiente.
- Nenhum segredo em código; logs sem dados sensíveis.

Nesta fase a camada existe apenas como stub documentado (`app/ai/`).

## Consequências

- **Positivas:** confiabilidade e reprodutibilidade preservadas; o núcleo
  determinístico é a fonte de verdade; a IA agrega usabilidade sem virar risco.
- **Negativas:** exige disciplina de arquitetura (validação de saída, timeouts,
  tratamento de falhas) quando a camada for implementada (Fase 6).
