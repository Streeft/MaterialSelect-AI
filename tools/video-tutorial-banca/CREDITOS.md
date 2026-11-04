# Créditos e licenças do vídeo tutorial

Tudo o que aparece ou se ouve no vídeo tem a origem registrada aqui. Uma cópia
deste arquivo vai para `assets/CREDITOS.md` junto da mídia gerada.

## Imagem

| Item | Origem | Licença |
|---|---|---|
| Telas do MaterialSelect AI | Gravação real do app, rodando localmente em modo produção (Playwright + CDP screencast), banco SQLite local de gravação | Do autor do TCC |
| Valores do catálogo nas telas | Catálogo demonstrativo do seed (`is_demo`, qualidade `ESTIMADO`) | Fictícios, do repositório |
| Cartelas (título, capítulos, limites, final) | Desenhadas por `scripts/montar.py` com PIL; texto renderizado pelo script, não por IA | Próprias |
| Fontes tipográficas | Inter e JetBrains Mono, instaladas no sistema | SIL Open Font License 1.1 |
| Cursor e destaque de clique | Desenhados por `scripts/overlay.js` só no navegador da gravação | Próprios |

## Som

| Item | Origem | Licença |
|---|---|---|
| Narração | Síntese local com **Piper** (`piper-tts` 1.8.0) e a voz `pt_BR-cadu-medium` | Piper: GPL-3.0-or-later (programa). Voz cadu: conjunto de dados **CC0** (OHF-Voice/voice-datasets). O modelo foi ajustado a partir da voz `en_US-lessac-medium`, treinada no corpus Lessac do Blizzard Challenge 2013, cuja licença restringe o uso a fins **não comerciais** de pesquisa e ensino. A apresentação à banca do TCC é uso acadêmico não comercial. |
| Trilha de fundo | Síntese própria em `scripts/sons.py` (seno, ruído filtrado, numpy) | Própria, sem obra de terceiros |
| Sons de clique, confirmação e transição | Síntese própria em `scripts/sons.py` | Próprios |

Higgsfield não foi usado: o saldo do plano gratuito (10 créditos) não cobria a
narração completa (cerca de 54 créditos estimados), e o autor escolheu a opção de
voz local gratuita.

## Ferramentas

FFmpeg (montagem, loudnorm, legendas), Playwright 1.63 com Chromium
(gravação), Pillow e NumPy (quadros e áudio), faster-whisper `small`
(conferência de pronúncia da narração; não gera nada que vai ao vídeo).
