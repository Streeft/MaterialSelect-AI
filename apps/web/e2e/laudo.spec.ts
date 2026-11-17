import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-242: after issuing, "Enviar ao cliente" with the mock provider (the E2E API
 * sends nothing): the dialog warns that the server only simulates, the preview is
 * the server's e-mail, and the send lands in the version's history as "Simulado".
 *
 * D-241: the laudo screen end to end — a saved study, the engineer's form, the
 * watermarked preview in a new tab, "Emitir" behind its confirmation, and the
 * frozen version opened from the list with its verification code, which the
 * public route then recognises without a session.
 */

const API = "http://127.0.0.1:8811";
const STUDY = "Estudo E2E do laudo";

async function savedStudy(page: import("@playwright/test").Page): Promise<number> {
  const response = await page.request.post(`${API}/api/selection/studies`, {
    data: {
      name: `${STUDY} ${Date.now()}`,
      description: "Suporte leve e rígido para a E2E do laudo.",
      constraints: [{ operator: "gt", property_slug: "modulo_young", value: 1, unit: "GPa" }],
      index: { name: "Viga leve", expression: "sqrt(modulo_young) / densidade", goal: "maximize" },
      criteria: [
        { key: "__index__", weight: 2 },
        { key: "densidade", weight: 1 },
        { key: "modulo_young", weight: 1 },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { id: number }).id;
}

test("laudo: pré-visualiza com marca de rascunho, emite e abre a versão congelada", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const studyId = await savedStudy(page);
  await page.goto(`/app/selecao/laudo?estudo=${studyId}`);

  await expect(page.getByRole("heading", { name: "Laudo de engenharia", level: 1 })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText("Nenhuma versão emitida ainda.")).toBeVisible();
  const issue = page.getByRole("button", { name: "Emitir", exact: true });
  await expect(issue).toBeDisabled();

  await page.getByLabel(/^Nome/).fill("Ana Souza");
  await page.getByLabel(/^Título profissional/).fill("Engenheira mecânica");
  await page.getByLabel(/^CREA ou registro/).fill("CREA-SP 5069999999");
  await page.getByLabel(/^Cidade de emissão/).fill("São Carlos");
  await page.getByLabel(/^Massa da peça/).fill("1.5");
  await page.getByLabel(/^Lote/).fill("2000");

  const axe = await runAxe(page);
  expect(axe, describeFound(axe)).toEqual([]);

  // The preview: a new tab, watermarked, already with the cost section.
  const [preview] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: "Pré-visualizar" }).click(),
  ]);
  await preview.waitForLoadState();
  expect(preview.url()).toContain(`/api/exports/estudos/${studyId}/laudo.html`);
  await expect(preview.getByText("RASCUNHO — não emitido").first()).toBeVisible();
  await expect(preview.getByRole("heading", { name: /Resumo executivo/ })).toBeVisible();
  // The figure names itself (role="img" + aria-label); its <title> repeats the name.
  await expect(preview.getByRole("img", { name: "Custo por peça conforme o lote" })).toBeAttached();
  await preview.close();

  // Emitir asks first, and says that it freezes.
  await expect(issue).toBeEnabled();
  await issue.click();
  const dialog = page.getByRole("dialog", { name: "Emitir a versão 1 do laudo?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/congela esta versão/)).toBeVisible();
  await dialog.getByRole("button", { name: "Emitir e congelar" }).click();

  const done = page.getByText(/Versão 1 emitida\. Código de verificação [0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}\./);
  await expect(done).toBeVisible({ timeout: 45_000 });
  const code = ((await done.textContent()) ?? "").match(/[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/)![0];

  const open = page.getByRole("link", { name: "Abrir a versão 1 para imprimir" });
  await expect(open).toBeVisible();
  const [frozen] = await Promise.all([page.waitForEvent("popup"), open.click()]);
  await frozen.waitForLoadState();
  expect(frozen.url()).toContain(`/laudo/versoes/1.html`);
  await expect(frozen.getByText(code).first()).toBeVisible();
  await expect(frozen.getByText("RASCUNHO — não emitido")).toHaveCount(0);
  await frozen.close();

  // D-242: send it to the client. The test server's e-mail provider is the mock.
  await page.getByRole("button", { name: "Enviar a versão 1 ao cliente por e-mail" }).click();
  const send = page.getByRole("dialog", { name: "Enviar a versão 1 ao cliente" });
  await expect(send).toBeVisible();
  await expect(send.getByText("Envio por e-mail não configurado neste servidor")).toBeVisible();
  const mail = send.frameLocator('iframe[title="Pré-visualização do e-mail que será enviado"]');
  await expect(mail.getByText("Segue o laudo de engenharia emitido.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(mail.getByText("Ana Souza — Engenheira mecânica")).toBeVisible();
  await expect(send.getByRole("button", { name: "Enviar e-mail" })).toBeDisabled();
  await send.getByLabel(/^Para/).fill("cliente@empresa.com.br");
  await send.getByLabel(/^Para/).press("Enter");
  await expect(
    send.getByRole("list", { name: "Endereços em Para" }).getByText("cliente@empresa.com.br"),
  ).toBeVisible();
  const sendAxe = await runAxe(page);
  expect(sendAxe, describeFound(sendAxe)).toEqual([]);
  await send.getByRole("button", { name: "Enviar e-mail" }).click();
  await expect(page.getByText(/Envio simulado registrado para 1 destinatário/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(send).toBeHidden();
  const row = page.getByRole("row", { name: /Versão 1/ });
  await expect(row.getByText("1 envio")).toBeVisible();
  await expect(row.getByText("Simulado")).toBeVisible();

  // Anyone holding the code can check it, without a session.
  // `request` is not the browser's context: it carries no session cookie.
  const check = await request.get(`${API}/api/laudos/verificar/${code}`);
  expect(check.ok()).toBe(true);
  const body = (await check.json()) as { version: number; engineer_name: string };
  expect(body.version).toBe(1);
  expect(body.engineer_name).toBe("Ana Souza");
});
