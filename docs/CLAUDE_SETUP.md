# Configuração do Claude Code para este projeto

Leia isto ao retomar o MaterialSelect AI **numa máquina nova**. Não é sobre o
projeto em si — é sobre recriar o mesmo ambiente de assistente (marketplaces,
plugins e skills) que a sessão de desenvolvimento já usa, sem depender de
lembrar o que foi instalado onde.

O catálogo de skills disponível numa sessão do Claude Code não vive dentro do
repositório — vive na conta e na máquina de quem roda o Claude Code
(`~/.claude/`). `.claude/skills/` **deste** repositório está vazio de propósito:
nenhuma skill aqui é específica do MaterialSelect AI. Por isso este arquivo é
uma receita de reinstalação, não uma cópia de arquivos de terceiros — copiar o
conteúdo de plugins de outros fornecedores para dentro de um repositório
**público** seria redistribuir algo que não é nosso para redistribuir.

---

## 1. Pré-requisito

Claude Code instalado e autenticado na mesma conta usada no desenvolvimento
deste projeto. A lista abaixo reflete o estado em 2026-08-18; se divergir do
que `claude marketplace list` e `claude plugin list` mostrarem no futuro,
**os comandos ao vivo são a fonte de verdade**, não esta tabela.

## 2. Marketplaces conectados

| Marketplace | Origem | Comando para reconectar | O que traz | Documentação oficial |
|---|---|---|---|---|
| `claude-plugins-official` | `github:anthropics/claude-plugins-official` | `claude marketplace add anthropics/claude-plugins-official` | Catálogo oficial da Anthropic — centenas de integrações de terceiros (Figma, Zoom, Twilio, Auth0, Sanity, HubSpot, Airtable, RH, vendas, jurídico etc.) mais skills genéricas de fluxo (`code-review`, `qa`, `investigate`, `design-review`...). A maioria não tem relação com este projeto; é o preço de vir de um marketplace geral. | [github.com/anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) |
| `superpowers-dev` | `git:https://github.com/obra/superpowers.git` | `claude marketplace add https://github.com/obra/superpowers.git` | Plugin `superpowers`: metodologia de trabalho (brainstorming, TDD, debugging sistemático, escrita de planos, revisão de código) usada durante as fases deste projeto. | [github.com/obra/superpowers](https://github.com/obra/superpowers) |
| `thedotmack` | `github:thedotmack/claude-mem` | `claude marketplace add thedotmack/claude-mem` | Plugin `claude-mem`: memória persistente entre sessões (o histórico "S3", "S4"... que aparece no início das sessões deste projeto vem dele). | [github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) |

## 3. Plugins instalados

Depois de conectar os marketplaces acima:

```bash
claude plugin install superpowers@superpowers-dev
claude plugin install claude-mem@thedotmack
```

`claude-plugins-official` não precisa de `plugin install` separado — seu
catálogo já fica disponível como skills assim que o marketplace é adicionado.

## 4. gstack (instalação à parte, fora do sistema de marketplace)

O [gstack](https://github.com/garrytan/gstack) expõe papéis de uma equipe de
engenharia (`/plan-eng-review`, `/investigate`, `/cso`, `/review`, `/ship`...)
como comandos de barra — a lista completa por papel já está documentada em
[`CLAUDE.md`](../CLAUDE.md), seção "gstack", e não é repetida aqui. Ele **não**
é instalado via `claude marketplace`:

```bash
git clone https://github.com/garrytan/gstack ~/.agents/skills/gstack
cd ~/.agents/skills/gstack
./setup
```

> **Cuidado específico do Windows:** o instalador do gstack no Windows copia os
> arquivos de skill para `~/.claude/skills/` em vez de criar links simbólicos
> (evita exigir "Developer Mode"). Isso significa que um `git pull` no repositório
> do gstack **não** atualiza as skills já registradas — é preciso rodar
> `./setup` de novo depois de cada atualização, ou as skills ficam
> silenciosamente desatualizadas em relação à documentação do próprio gstack.
> Em Linux/macOS o setup usa symlink e isso não se aplica.

## 5. Verificação pós-instalação

```bash
claude marketplace list
claude plugin list
```

Depois, numa sessão do Claude Code neste repositório, confirme que as skills
usadas no dia a dia deste projeto aparecem na listagem: `superpowers:*`,
`code-review`, `fastapi-python`, `frontend-design`, `design-review`, `qa`,
`investigate`, e os comandos do gstack citados em `CLAUDE.md`.

## 6. O que este arquivo não cobre

Configuração do **projeto** em si (backend, frontend, variáveis de ambiente,
banco de dados) está em [`CLAUDE.md`](../CLAUDE.md) seção 6 e em
[`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md). Este arquivo cobre só o
assistente; aquele cobre a aplicação.
