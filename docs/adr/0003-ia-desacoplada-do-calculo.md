# ADR 0003 — IA desacoplada e opcional, separada do cálculo determinístico

- **Status:** aceito e **implementado na Fase 6** (ver
  [`../09-camada-ia.md`](../09-camada-ia.md))
- **Data:** 2026-07 (Fase 1); implementada em 2026-07 (Fase 6)

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

## Como ficou (Fase 6)

A decisão foi implementada com uma adição que ela não previa: **guardrails
executáveis**. A fronteira não é sustentada por instruções ao modelo, e sim por
regras em `app/ai/guardrails.py` pelas quais toda saída passa. A mais forte é a
ancoragem numérica — todo número de uma restrição proposta precisa aparecer no
enunciado do usuário, o que recusa inclusive conversões corretas, já que
converter (e registrar a trilha) é trabalho do backend.

O provedor recebe apenas o catálogo e o texto: sem sessão de banco, sem
avaliador de expressões. A implementação simulada (`app/ai/mock.py`) é
determinística e não exige chave nem rede.

## Consequências

- **Positivas:** confiabilidade e reprodutibilidade preservadas; o núcleo
  determinístico é a fonte de verdade; a IA agrega usabilidade sem virar risco.
  A fronteira virou propriedade testável, exercitada contra um provedor
  deliberadamente mentiroso na suíte.
- **Negativas:** os guardrails custam falsos positivos ocasionais — uma prosa
  legítima que cite uma cifra fora do conjunto calculado é descartada por
  inteiro. Preferiu-se recusar demais a deixar passar um número inventado.
