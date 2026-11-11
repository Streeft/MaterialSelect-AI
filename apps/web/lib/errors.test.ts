import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { apiErrorKind, describeApiError, isNotFound } from "./errors";
import { errorsText } from "./i18n-errors";

describe("describeApiError (D-200)", () => {
  it("turns a rejected fetch into the network sentence", () => {
    expect(describeApiError(new TypeError("Failed to fetch"))).toBe(errorsText.network);
    expect(describeApiError(new ApiError("Falha de rede", 0))).toBe(errorsText.network);
  });

  it.each([
    [401, errorsText.unauthorized],
    [403, errorsText.forbidden],
    [429, errorsText.rateLimited],
    [500, errorsText.server],
    [503, errorsText.server],
  ])("maps %i to its sentence", (status, text) => {
    expect(describeApiError(new ApiError("", status))).toBe(text);
  });

  it("never shows a 5xx detail, which can carry SQL or a path", () => {
    const text = describeApiError(new ApiError("Internal Server Error: sqlalchemy.exc.OperationalError", 500));
    expect(text).toBe(errorsText.server);
  });

  it("keeps a readable 409/422 detail and drops a technical one", () => {
    expect(describeApiError(new ApiError("Nome já em uso.", 409))).toBe("Nome já em uso.");
    expect(describeApiError(new ApiError("Nome já em uso.", 422))).toBe("Nome já em uso.");
    expect(describeApiError(new ApiError("Traceback (most recent call last)", 422))).toBe(errorsText.invalid);
  });

  it("shows a readable refusal from a 403/429; a plain Error stays generic stays generic", () => {
    expect(describeApiError(new ApiError("Limite diário atingido.", 429))).toBe("Limite diário atingido.");
    expect(describeApiError(new Error("Faixa invertida"))).toBe(errorsText.unknown);
  });

  it("uses the caller's fallback for a technical or non-Error value", () => {
    expect(describeApiError(new Error("TypeError: x is undefined"), "Falhou aqui.")).toBe("Falhou aqui.");
    expect(describeApiError("boom")).toBe(errorsText.unknown);
  });

  it("tells a 404 from a failure", () => {
    expect(isNotFound(new ApiError("x", 404))).toBe(true);
    expect(isNotFound(new ApiError("x", 500))).toBe(false);
    expect(apiErrorKind(new ApiError("x", 409))).toBe("conflict");
  });
});
