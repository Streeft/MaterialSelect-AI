import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  decodeUrlJson,
  encodeUrlJson,
  enumCodec,
  isStringRecord,
  jsonCodec,
  readUrlState,
  textCodec,
  useUrlState,
  writeUrlState,
  type UrlSpec,
} from "./urlState";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

interface Brief {
  mass: string;
  mode: "massa" | "custo";
  inputs: Record<string, string>;
}

const SPEC: UrlSpec<Brief> = {
  mass: { param: "massa", codec: textCodec, defaultValue: "" },
  mode: { param: "objetivo", codec: enumCodec(["massa", "custo"] as const), defaultValue: "massa" },
  inputs: { param: "entradas", codec: jsonCodec(isStringRecord), defaultValue: {} },
};

function Form() {
  const [state, setState] = useUrlState(SPEC);
  return (
    <div>
      <label>
        Massa
        <input value={state.mass} onChange={(e) => setState({ mass: e.target.value })} />
      </label>
      <button type="button" onClick={() => setState({ mode: "custo", inputs: { vao: "2" } })}>
        Custo
      </button>
      <output aria-label="estado">{JSON.stringify(state)}</output>
    </div>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/app/teste");
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("readUrlState / writeUrlState", () => {
  it("lê o que há e completa o resto com o padrão", () => {
    expect(readUrlState(SPEC, "?massa=2&objetivo=custo")).toEqual({
      mass: "2",
      mode: "custo",
      inputs: {},
    });
  });

  it("ignora valor malformado em vez de consertá-lo", () => {
    const state = readUrlState(SPEC, "?objetivo=volume&entradas=%%%");
    expect(state.mode).toBe("massa");
    expect(state.inputs).toEqual({});
  });

  it("tira da URL o valor igual ao padrão e mantém os parâmetros alheios", () => {
    expect(writeUrlState(SPEC, "?outro=1&massa=2", { mass: "", mode: "custo" })).toBe(
      "?outro=1&objetivo=custo",
    );
  });

  it("faz ida e volta de JSON com acento", () => {
    const value = { nome: "aço ± 2" };
    expect(decodeUrlJson(encodeUrlJson(value))).toEqual(value);
    expect(decodeUrlJson("não é base64")).toBeUndefined();
  });
});

describe("useUrlState", () => {
  it("abre com o estado que o link traz", () => {
    window.history.replaceState(null, "", `/app/teste?massa=3&entradas=${encodeUrlJson({ vao: "5" })}`);
    render(<Form />);
    expect(screen.getByLabelText("Massa")).toHaveValue("3");
    expect(JSON.parse(screen.getByLabelText("estado").textContent ?? "")).toMatchObject({
      inputs: { vao: "5" },
    });
  });

  it("escreve cada tecla na URL sem perder caractere (ida e volta)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Form />);
    await user.type(screen.getByLabelText("Massa"), "12,5");
    expect(screen.getByLabelText("Massa")).toHaveValue("12,5");
    expect(new URLSearchParams(window.location.search).get("massa")).toBe("12,5");
    expect(window.location.pathname).toBe("/app/teste");

    // A reload reads the same state back.
    unmount();
    render(<Form />);
    expect(screen.getByLabelText("Massa")).toHaveValue("12,5");
  });

  it("grava vários campos numa escrita só", async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole("button", { name: "Custo" }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("objetivo")).toBe("custo");
    expect(decodeUrlJson(params.get("entradas") ?? "")).toEqual({ vao: "2" });
  });

  it("acompanha o Voltar do navegador", () => {
    render(<Form />);
    act(() => {
      window.history.replaceState(null, "", "/app/teste?massa=9");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByLabelText("Massa")).toHaveValue("9");
  });
});
