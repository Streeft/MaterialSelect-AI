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
| Narração do **corte curto** | Voz "Andre" (ElevenLabs), gerada pelo Higgsfield (`text2speech_v2`, variante `elevenlabs`) a partir do texto do roteiro; 8 cenas, 6,45 créditos do plano do autor | Uso conforme os termos do Higgsfield/ElevenLabs para o conteúdo gerado na conta do autor |
| Narração do **vídeo completo** (v3) | Voz "Marcio - Viral Hook Narrator" (ElevenLabs, `voice_id plASsyS7JE6GCAvx9uIc`), modelo `eleven_v4`, gerada pelo conector MCP do ElevenLabs na conta do autor (plano gratuito) a partir do texto de [`roteiro-v3.md`](roteiro-v3.md); 29 cenas, 7.540 caracteres, uma tomada por cena. As marcas de entonação (`[excited]`, `[warmly]`…) vão só para a voz, nunca para a legenda | Uso conforme os termos do ElevenLabs para o conteúdo gerado na conta do autor |
| Camada de movimento (v2/v3) | Composições Remotion 4 em `motion/` (fora do repositório), desenhadas por código; nenhuma tela simulada por IA | Próprias |
| Sons de interface extras (pop, tic, impacto, swish, riser) | Síntese própria em `scripts/sons_v2.py` (numpy, semente fixa) | Próprios |
| Trilha de fundo | "Wallpaper", Kevin MacLeod (incompetech.com), baixada de `incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3`; encadeada, filtrada e nivelada a −36 LUFS por `scripts/preparar_trilha.py` | **CC BY 4.0** (creativecommons.org/licenses/by/4.0/). Crédito obrigatório, reproduzido abaixo e na descrição do YouTube |
| Sons de clique, confirmação e transição | Síntese própria em `scripts/sons.py` (seno, ruído filtrado, numpy) | Próprios |

Crédito da música, como deve aparecer na descrição e na vinheta final:

> "Wallpaper" Kevin MacLeod (incompetech.com)
> Licensed under Creative Commons: By Attribution 4.0 License
> http://creativecommons.org/licenses/by/4.0/

Por que duas vozes: o corte curto, já aprovado, fica como está (voz Andre). Na
versão completa v3 o autor pediu uma voz única, mais animada, e escolheu Marcio;
a narração anterior com a voz local Piper (`pt_BR-cadu-medium`) saiu do vídeo.

## Ferramentas

FFmpeg (montagem, loudnorm, legendas), Remotion 4.0.537 (camada de movimento e
render final), Playwright 1.63 com Chromium (gravação), Pillow e NumPy (quadros e áudio), faster-whisper `small`
(conferência de pronúncia da narração; não gera nada que vai ao vídeo).
