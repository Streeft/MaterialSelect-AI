import { afterEach, describe, expect, it } from "vitest";
import { makeComponent } from "@/lib/testing/planFixtures";
import { draftKey, parseDraft } from "@/lib/selectionDraft";
import { PLAN_DRAFT_HREF, hasSelectionDraft, writePlanDraft } from "./planDraft";

afterEach(() => window.localStorage.clear());

describe("Abrir na Seleção (D-225)", () => {
  it("writes the part's study as the wizard's own draft, per account", () => {
    expect(hasSelectionDraft(7)).toBe(false);
    expect(writePlanDraft(7, makeComponent())).toBe(true);
    expect(hasSelectionDraft(7)).toBe(true);
    expect(hasSelectionDraft(8)).toBe(false);

    const draft = parseDraft(window.localStorage.getItem(draftKey(7)));
    expect(draft).not.toBeNull();
    expect(draft?.step).toBe("constraints");
    expect(draft?.data.name).toBe("Camada externa");
    expect(draft?.data.functionText).toBe("Camada externa de roupa de esqui");
    expect(draft?.data.indexMode).toBe("viga-leve-rigidez");
    // Only the applied limits travel: the AI suggestion (density) is not in it.
    expect(JSON.stringify(draft?.data.stages)).toContain("temperatura_servico_min");
    expect(JSON.stringify(draft?.data.stages)).not.toContain("densidade");
  });

  it("says so when the browser refuses the draft", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(writePlanDraft(7, makeComponent())).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("opens the wizard on the limits and asks it to continue the draft", () => {
    expect(PLAN_DRAFT_HREF).toBe("/app/selecao?etapa=restricoes&rascunho=assistente");
  });
});
