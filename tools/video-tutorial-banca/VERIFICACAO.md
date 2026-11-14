# Verificação das saídas finais (Etapa 10)

Conferência feita em 13/11/2026 sobre os arquivos de `out/` (fora do Git).
Specs e loudness medidos com `ffprobe` e `ffmpeg -af ebur128`. Legendas
conferidas por script sobre os SRT.

## Arquivos

| Arquivo | Vídeo | Áudio | Duração | Loudness |
|---|---|---|---|---|
| `materialselect_completo_1080p.mp4` (legenda gravada) | H.264 1920×1080, 30 fps | AAC 48 kHz, estéreo | 10:28,5 | −16,0 LUFS |
| `materialselect_completo_sem_legenda_1080p.mp4` | H.264 1920×1080, 30 fps | AAC 48 kHz, estéreo | 10:28,5 | −16,0 LUFS |
| `materialselect_curto_1080p.mp4` (v1) | H.264 1920×1080, 30 fps | AAC 48 kHz, estéreo | 2:59,7 | −16,0 LUFS |
| `materialselect_completo.srt` | 143 entradas | | | |
| `materialselect_curto.srt` | 36 entradas | | | |

## Regras editoriais

| Regra | Completo (v3) | Curto (v1) |
|---|---|---|
| Legenda: no máximo 2 linhas de 42 caracteres | ok (máx. 42, 2 linhas) | ok (máx. 42, 2 linhas) |
| Sem exemplo da viga de bicicleta, "Carregar exemplo", "Viga leve limitada por rigidez", 100 000 N/m | ok: 0 ocorrências no SRT; o gravador não registrou nenhuma em `problemas.json` | ok: 0 ocorrências no SRT |
| Números narrados iguais aos da tela | ok: todo número é lido de volta da tela (`r.expect`) na gravação; `problemas.json` vazio | aprovado na v1 |
| Selo de demonstração visível | ok: catálogo do seed (`is_demo`); conferido nos quadros de verificação | aprovado na v1 |
| Citação de Ashby (2017) | ok: "Ashby, em 2017, organiza…" | cita o método de Ashby, sem o ano (texto da v1, aprovado e mantido) |
| "A IA não decide" | ok: "Ela não produz valores e não decide." | texto da v1, aprovado e mantido |
| Sem dados pessoais (conta como "Participante", sem e-mails) | ok: 0 "@" nos SRT; conta de gravação renomeada | ok |
| Só capturas reais, sem vídeo gerado por IA | ok: telas gravadas do app local; camada Remotion desenhada por código | ok |
| Banco local de gravação, nunca o de produção | ok: SQLite local de gravação | ok |
| Sobreposição de fala sobre a cena seguinte | nenhuma (P1 e D3 regravadas) | n/a |
