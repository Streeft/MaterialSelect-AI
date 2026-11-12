import { test, expect } from "./session";

/**
 * D-217: the catalogue as pages, against the real API. The seed has only a
 * handful of materials, so the spec files 55 records of the reader's own
 * (named "Liga paginada <run> NNN"), reads them 50 at a time, walks to page 2 by the
 * button and by the address, and checks a chip carries the server's count.
 * The records are deactivated at the end so the other specs see the seed.
 */

const API = "http://127.0.0.1:8811";
// A suffix per run: a retry runs in a fresh worker and must not collide with
// the names of a first attempt (a name stays taken after deactivation).
const PREFIX = `Liga paginada ${Date.now().toString(36)}`;
test("catálogo paginado: 50 por página, próxima página na URL e contagem no chip", async ({
  page,
}) => {
  const classes = await page.request.get(`${API}/api/classes`);
  expect(classes.ok()).toBe(true);
  const [klass] = (await classes.json()) as { id: number; slug: string; name: string }[];
  expect(klass).toBeTruthy();

  const created: number[] = [];
  try {
    await walkThePages(page, klass!, created);
  } finally {
    for (const id of created) await page.request.delete(`${API}/api/materials/${id}`);
  }
});

async function walkThePages(
  page: import("@playwright/test").Page,
  klass: { id: number; name: string },
  created: number[],
) {
  for (let i = 1; i <= 55; i++) {
    const response = await page.request.post(`${API}/api/materials`, {
      data: {
        name: `${PREFIX} ${String(i).padStart(3, "0")}`,
        class_id: klass.id,
        is_own_record: true,
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    created.push(((await response.json()) as { id: number }).id);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  const firstPage = page.waitForResponse(
    (r) => /\/api\/materials\/busca\?/.test(r.url()) && r.url().includes("limit=50"),
  );
  await page.goto(`/app/catalogo?busca=${encodeURIComponent(PREFIX)}`);
  await firstPage;

  const table = page.getByRole("table");
  await expect(table.getByRole("link", { name: `${PREFIX} 001` })).toBeVisible({ timeout: 45_000 });
  await expect(table.getByRole("link", { name: new RegExp(PREFIX) })).toHaveCount(50);

  const nav = page.getByRole("navigation", { name: "Paginação" });
  await expect(nav.getByText("1–50 de 55")).toBeVisible();
  await nav.getByRole("button", { name: "Próxima página" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(table.getByRole("link", { name: new RegExp(PREFIX) })).toHaveCount(5);
  await expect(table.getByRole("link", { name: `${PREFIX} 055` })).toBeVisible();

  // The address alone reopens page 2.
  await page.reload();
  await expect(
    page.getByRole("table").getByRole("link", { name: `${PREFIX} 051` }),
  ).toBeVisible({ timeout: 45_000 });

  // The class chip says what choosing that class would leave (server count).
  await page.getByRole("button", { name: /^Classe: / }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(`^${klass.name}, 55 resultados$`) }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // On a phone: one page of cards, not every match (the audit counted 678).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/catalogo?busca=${encodeURIComponent(PREFIX)}`);
  const cards = page.locator("ul li").filter({ hasText: PREFIX });
  await expect(cards.first()).toBeVisible({ timeout: 45_000 });
  await expect(cards).toHaveCount(50);
  await expect(page.getByRole("navigation", { name: "Paginação" })).toBeVisible();
}
