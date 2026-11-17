import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-243: the signed PDF (refused when it is not a PDF, accepted by its bytes, shown with its
 * hash and replaceable with the old one kept), the send's link with its validity and "Ainda não
 * aberto", revoking behind a confirmation, and the Word and PowerPoint downloads.
 *
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

  // D-243: the signed PDF. A file that only has the name of a PDF is refused by its bytes.
  await page.getByRole("button", { name: "Enviar ou ver o PDF assinado da versão 1" }).click();
  const signed = page.getByRole("dialog", { name: "PDF assinado da versão 1" });
  await expect(signed).toBeVisible();
  await expect(signed.getByText("Nenhum PDF assinado enviado ainda.")).toBeVisible();
  const chooser = signed.getByLabel("Escolher o PDF");
  await chooser.setInputFiles({
    name: "falso.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html>não sou um PDF</html>"),
  });
  await expect(signed.getByText(/"falso\.pdf" não é um PDF/)).toBeVisible();
  await expect(signed.getByText("Nenhum PDF assinado enviado ainda.")).toBeVisible();
  // A real one (its first bytes) goes up and shows with its SHA-256.
  const firstPdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  await chooser.setInputFiles({ name: "laudo-assinado.pdf", mimeType: "application/pdf", buffer: firstPdf });
  const history = signed.getByRole("list", { name: "Histórico de PDFs assinados desta versão" });
  await expect(history.getByText("laudo-assinado.pdf")).toBeVisible({ timeout: 30_000 });
  await expect(history.getByText("PDF atual")).toBeVisible();
  await expect(history.getByText(/SHA-256 [0-9a-f]{64}/)).toBeVisible();
  // Another one replaces it as the current; the first stays in the history.
  const secondPdf = Buffer.from("%PDF-1.4\n% assinado com certificado\n%%EOF\n");
  await chooser.setInputFiles({ name: "laudo-certificado.pdf", mimeType: "application/pdf", buffer: secondPdf });
  await expect(history.getByRole("listitem")).toHaveCount(2, { timeout: 30_000 });
  await expect(history.getByRole("listitem").first()).toContainText("laudo-certificado.pdf");
  await expect(history.getByRole("listitem").first()).toContainText("PDF atual");
  await expect(history.getByRole("listitem").nth(1)).toContainText("anterior");
  const pdfAxe = await runAxe(page);
  expect(pdfAxe, describeFound(pdfAxe)).toEqual([]);
  // The old one is still downloadable, byte for byte.
  const old = await page.request.get(
    (await history.getByRole("listitem").nth(1).getByRole("link", { name: /^Baixar / }).getAttribute("href"))!,
  );
  expect(old.ok()).toBe(true);
  expect((await old.body()).equals(firstPdf)).toBe(true);
  await signed.getByRole("button", { name: "Concluir" }).click();
  await expect(signed).toBeHidden();
  await expect(page.getByRole("row", { name: /Versão 1/ }).getByText(/^Anexado · [0-9A-F]{4}-/)).toBeVisible();

  // D-243: the send's link has a validity and has not been opened; revoking asks first.
  await page.getByRole("button", { name: "Ver os envios da versão 1 e os links" }).click();
  const deliveries = page.getByRole("dialog", { name: "Envios da versão 1" });
  await expect(deliveries).toBeVisible();
  await expect(deliveries.getByText("Link ativo")).toBeVisible();
  await expect(deliveries.getByText(/^Válido até /)).toBeVisible();
  await expect(deliveries.getByText("Ainda não aberto")).toBeVisible();
  await expect(deliveries.getByText("HTML anexado")).toBeVisible();
  const deliveriesAxe = await runAxe(page);
  expect(deliveriesAxe, describeFound(deliveriesAxe)).toEqual([]);
  await deliveries.getByRole("button", { name: /^Revogar o link do envio para cliente@empresa\.com\.br/ }).click();
  const revoke = page.getByRole("dialog", { name: "Revogar este link?" });
  await expect(revoke).toBeVisible();
  await revoke.getByRole("button", { name: "Revogar link" }).click();
  await expect(page.getByText("Link revogado.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(deliveries.getByText(/^Revogado em /)).toBeVisible();
  await expect(deliveries.getByRole("button", { name: /^Revogar o link/ })).toHaveCount(0);
  await deliveries.getByRole("button", { name: "Concluir" }).click();
  await expect(deliveries).toBeHidden();

  // D-243: Word and PowerPoint, with the fields typed above, download as real Office files.
  for (const [label, extension] of [
    ["Baixar Word", "docx"],
    ["Baixar PowerPoint", "pptx"],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 90_000 }),
      page.getByRole("link", { name: label }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^laudo-de-engenharia-.*\\.${extension}$`));
    const bytes = await (await import("node:fs/promises")).readFile((await download.path())!);
    expect(bytes.subarray(0, 2).toString()).toBe("PK"); // an Office file is a zip
    expect(bytes.length).toBeGreaterThan(20_000);
  }

  // Anyone holding the code can check it, without a session.
  // `request` is not the browser's context: it carries no session cookie.
  const check = await request.get(`${API}/api/laudos/verificar/${code}`);
  expect(check.ok()).toBe(true);
  const body = (await check.json()) as {
    version: number;
    engineer_name: string;
    signed_pdf: { sha256: string } | null;
  };
  expect(body.version).toBe(1);
  expect(body.engineer_name).toBe("Ana Souza");
  // D-243: the verification says a signed PDF exists and gives its hash (the newest one).
  expect(body.signed_pdf?.sha256).toMatch(/^[0-9a-f]{64}$/);
});
