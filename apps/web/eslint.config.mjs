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
    // Compiler, e com ele a regra `set-state-in-effect`. Os seis pontos pré-existentes
    // (semeadura de seleção padrão em /app/comparar, /app/mapas e /app/painel, a
    // queda de log para linear em /app/painel e o fechamento da gaveta em AppSidebar)
    // foram todos refatorados para ajustes durante a renderização / estado derivado,
    // quitando o débito e restaurando a regra como erro impeditivo de CI.
    rules: {
      "react-hooks/set-state-in-effect": "error",
    },
  },
];
