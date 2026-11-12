import { test, expect } from "./session";

/**
 * D-210: each ready-made study, from one click to the results, in a real
 * browser against the real backend. The templates come from
 * `GET /api/selection/templates` (formulation only, no material number); the
 * funnel beside the limits comes from `POST /api/selection/funnel`; the run is
 * the ordinary one. Whether a winner exists depends on the seeded catalogue,
 * so the assertion is that the results screen answers — a winner, or the
 * honest "Nenhum vencedor declarado" — never an error.
 */
const TEMPLATES = ["Viga leve e rígida", "Mola leve", "Painel leve e rígido", "Trocador de calor"];

for (const name of TEMPLATES) {
  test(`modelo pronto até os resultados: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/app/selecao");
    await expect(page.getByRole("heading", { name: "Seleção de materiais" })).toBeVisible({
      timeout: 45_000,
    });

    await page.getByRole("button", { name: `Usar este modelo: ${name}` }).click({ timeout: 30_000 });
    await expect(page.getByLabel("Nome do estudo")).toHaveValue(name);

    // The limits the template brought, with the live funnel beside them.
    await page.getByRole("button", { name: "Ver os limites" }).click();
    await expect(page).toHaveURL(/etapa=restricoes/);
    const funnel = page.getByRole("complementary", { name: "Funil de candidatos" });
    // An `exists` limit reads "<propriedade> definido" in the funnel.
    await expect(funnel.getByText(/definido/).first()).toBeVisible({ timeout: 15_000 });

    const actionBar = page.getByRole("group", { name: "Ações da etapa" });
    const run = actionBar.getByRole("button", { name: "Executar seleção" });
    await expect(run).toBeEnabled({ timeout: 15_000 });
    await run.click();

    await expect(page).toHaveURL(/etapa=resultados/);
    await expect(
      page.getByRole("heading", { name: /^(Vencedor: |Nenhum vencedor declarado)/ }),
    ).toBeVisible({ timeout: 20_000 });
  });
}
