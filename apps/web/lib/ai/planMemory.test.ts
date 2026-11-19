import { describe, expect, it, vi } from "vitest";
import { makePlan } from "@/lib/testing/planFixtures";
import { clearPlanMemory, parseRememberedPlan, writePlanMemory } from "./planMemory";

describe("planMemory (D-251)", () => {
  it("round-trips a proposal and clears it", () => {
    writePlanMemory("inicio", { text: "pedido", plan: makePlan() });
    const raw = window.sessionStorage.getItem("msai.plan.inicio");
    expect(parseRememberedPlan(raw)?.text).toBe("pedido");
    writePlanMemory("inicio", null);
    expect(window.sessionStorage.getItem("msai.plan.inicio")).toBeNull();
  });

  it("reads nothing from a value that is not a proposal", () => {
    expect(parseRememberedPlan(null)).toBeNull();
    expect(parseRememberedPlan("{não é json")).toBeNull();
    expect(parseRememberedPlan('"texto"')).toBeNull();
    expect(parseRememberedPlan('{"text":1,"plan":{"components":[{}]}}')).toBeNull();
    expect(parseRememberedPlan('{"text":"x","plan":{"components":[]}}')).toBeNull();
  });

  it("forgets both slots at once (the logout)", () => {
    writePlanMemory("inicio", { text: "a", plan: makePlan() });
    writePlanMemory("selecao", { text: "b", plan: makePlan() });
    clearPlanMemory();
    expect(window.sessionStorage.getItem("msai.plan.inicio")).toBeNull();
    expect(window.sessionStorage.getItem("msai.plan.selecao")).toBeNull();
  });

  it("does not throw when storage refuses", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    expect(() => writePlanMemory("inicio", { text: "a", plan: makePlan() })).not.toThrow();
    set.mockRestore();
  });
});
