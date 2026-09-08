// Flat config: o ESLint 9 aboliu o `.eslintrc.json` e a flag `--ext`.
//
// O conteúdo é o mesmo de antes — `next/core-web-vitals`, nada mais —, mas o
// alcance agora é declarado por glob no script `lint` do package.json, e não
// mais por `--ext .ts,.tsx`. Sem os globs explícitos o ESLint 9 lintaria só
// arquivos `.js` ao receber um diretório, e o portão passaria a verde sem ter
// olhado uma linha de TypeScript — falha silenciosa, do tipo que este projeto
// já pagou caro em outros lugares.
import coreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [".next/**", ".next-e2e/**", "node_modules/**"],
  },
  ...coreWebVitals,

  {
    // O `eslint-config-next` 16 traz o eslint-plugin-react-hooks da era do React
    // Compiler, e com ele uma regra que a versão 14 não tinha:
    // `set-state-in-effect`. Ela acusa seis pontos de código **pré-existente** —
    // semear a seleção padrão em `/app/comparar`, `/app/mapas` e `/app/painel`,
    // a queda de log para linear quando a escala não é permitida (B8) e o
    // fechamento da gaveta ao navegar (D-37).
    //
    // São achados legítimos, mas cada correção é uma refatoração de estado
    // derivado numa tela de produto, com risco de regressão em comportamentos
    // que já foram, eles próprios, correções de bug. Isso não pertence a um PR
    // cujo objetivo é fechar CVE.
    //
    // Fica em `warn`: continua aparecendo na saída do lint a cada execução, e
    // não some. O débito está registrado em `docs/TODO.md` como item próprio.
    // Ao quitá-lo, promova a regra de volta para `error` no mesmo PR.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
