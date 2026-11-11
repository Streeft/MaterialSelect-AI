import { test, expect } from "./session";

/**
 * D-207: the command palette against the real API. Ctrl+K opens it, "aço" asks
 * `GET /api/search` (not the whole catalogue), the first material offered is a
 * steel — never "Argamassa … Traço" — and Enter opens its sheet.
 */
test("Ctrl+K, buscar aço e abrir um aço com Enter", async ({ page }) => {
  await page.goto("/app");
  const searchButton = page.getByRole("button", { name: /Buscar/ }).first();
  // First visit compiles the route on `next dev`; give it room on a shared runner.
  await expect(searchButton).toBeVisible({ timeout: 45_000 });

  const dialog = page.getByRole("dialog", { name: "Buscar no MaterialSelect AI" });
  // A key pressed before hydration reaches no listener: press again until it
  // opens, but never on an open palette (Ctrl+K also closes it).
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });

  // From here until Enter, nothing may download the catalogue to search it.
  const fullCatalogue: string[] = [];
  const watch = (request: import("@playwright/test").Request) => {
    if (/\/api\/materials(\?|$)/.test(request.url())) fullCatalogue.push(request.url());
  };
  page.on("request", watch);

  const searched = page.waitForResponse((response) =>
    /\/api\/search\?/.test(response.url()) && response.status() === 200,
  );
  await dialog.getByRole("combobox").fill("aço");
  await searched;

  // Records come first once something is typed, best match on top.
  const firstMaterial = dialog.getByRole("option").first();
  await expect(firstMaterial).toContainText(/^Aço/i, { timeout: 20_000 });
  const name = ((await firstMaterial.locator("span.truncate").textContent()) ?? "").trim();

  page.off("request", watch);
  expect(fullCatalogue).toEqual([]);

  // The first option is highlighted; Enter opens it.
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\/materiais\/\d+/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 45_000 });
  await expect(page).toHaveTitle(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · `));
});
