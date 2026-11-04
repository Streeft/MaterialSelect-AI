# Vídeo tutorial para a banca

Produz o vídeo tutorial do MaterialSelect AI a partir do app real, rodando
localmente. Nada aqui altera `apps/api` ou `apps/web`, e nada toca o banco de
produção: tudo roda contra um SQLite local de gravação.

## Arquivos

| Arquivo | Papel |
|---|---|
| `roteiro-mestre.md` | Roteiro aprovado pelo autor (estrutura, narração, ações de tela) |
| `roteiro-final.md` | Texto integral da narração e a tabela de tempos, gerado na montagem |
| `cenas.json` | Narração por cena (texto da legenda) e as grafias só para a voz |
| `CREDITOS.md` | Origem e licença de cada imagem, voz e som |
| `dados/materiais-ficticios-video.csv` | CSV fictício de três materiais para a cena de Importar |
| `scripts/subir-app.sh` | Sobe API (4 processos) e web em modo produção; `--reset` recria o banco de gravação |
| `scripts/preparar_dados.py` | Estudo salvo e caderno de exemplo, só contra a API local |
| `scripts/narrar.py` | Narração com Piper, uma frase por vez, com os tempos de cada frase |
| `scripts/overlay.js` | Cursor visível, destaque de clique e o ocultamento combinado (D1), só no navegador da gravação |
| `scripts/gravar.js`, `scripts/cenas_acoes.js` | Gravação por CDP screencast com relógio virtual; ações de cada cena |
| `scripts/tomada.sh` | Uma tomada a partir do zero: banco novo, dados, gravação |
| `scripts/sons.py` | Trilha e sons de interface, por síntese própria |
| `scripts/montar.py` | Quadros a 30 fps, zoom, cartelas, mixagem, loudnorm, SRT e saídas |

Mídia (`out/`, `tmp/`, `assets/`) fica fora do Git.

## Como reproduzir

```bash
python3 -m venv /tmp/claude-0/venv-api && /tmp/claude-0/venv-api/bin/pip install -e "apps/api[dev]" piper-tts faster-whisper
```

```bash
cd tools/video-tutorial-banca
python scripts/narrar.py --voz pt_BR-cadu-medium.onnx --saida tmp/narracao
scripts/tomada.sh --saida tmp/gravacao
python scripts/sons.py --saida tmp/sons --duracao 900
python scripts/montar.py
```

A voz `pt_BR-cadu-medium` vem de `rhasspy/piper-voices` (Hugging Face). Para
depurar seletores sem gravar quadros: `scripts/tomada.sh --saida tmp/seco --seco`.

## Regras editoriais que o gravador verifica sozinho

- Strings proibidas na área visível (exemplo da viga de bicicleta, linha
  "Viga leve limitada por rigidez", dimensionamento com 100 000 N/m) param ou
  marcam a cena em `problemas.json`.
- Todo número narrado é lido de volta da tela (`r.expect`) e a gravação para se
  divergir.
- Espera do servidor ("Recalculando…", "Conferindo a soma dos pesos…") pausa o
  relógio e vira corte seco; botão desabilitado por mais de 10 s interrompe a
  tomada.
