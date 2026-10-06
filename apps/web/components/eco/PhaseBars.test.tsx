import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseBars, calculateBarWidth, type PhaseBarRow } from "./PhaseBars";
import { ecoPhaseI18n } from "@/lib/i18n-extras";

describe("calculateBarWidth", () => {
  it("retorna 0 para valores nulos, inválidos ou escala zero", () => {
    expect(calculateBarWidth(null, 100)).toBe(0);
    expect(calculateBarWidth(undefined as unknown as number, 100)).toBe(0);
    expect(calculateBarWidth(NaN, 100)).toBe(0);
    expect(calculateBarWidth(50, 0)).toBe(0);
    expect(calculateBarWidth(50, -10)).toBe(0);
  });

  it("calcula a proporção percentual correta", () => {
    expect(calculateBarWidth(50, 100)).toBe(50);
    expect(calculateBarWidth(25, 100)).toBe(25);
    expect(calculateBarWidth(100, 100)).toBe(100);
    expect(calculateBarWidth(33.333, 100)).toBe(33.3);
  });

  it("utiliza a magnitude absoluta para créditos negativos", () => {
    expect(calculateBarWidth(-40, 100)).toBe(40);
    expect(calculateBarWidth(-100, 100)).toBe(100);
  });

  it("limita em 100% caso ultrapasse a magnitude máxima", () => {
    expect(calculateBarWidth(150, 100)).toBe(100);
  });
});

describe("PhaseBars (Modo Individual)", () => {
  const sampleRows: PhaseBarRow[] = [
    {
      phase: "material",
      label: "Material (extração)",
      items: [{ seriesName: "Impacto", value: 120.5, tone: "primary" }],
    },
    {
      phase: "manufacture",
      label: "Manufatura",
      items: [{ seriesName: "Impacto", value: 45.0, tone: "primary" }],
    },
    {
      phase: "transport",
      label: "Transporte",
      items: [{ seriesName: "Impacto", value: null, reason: "Sem rota definida", tone: "primary" }],
    },
    {
      phase: "eol",
      label: "Fim de vida",
      items: [{ seriesName: "Impacto", value: -15.2, tone: "primary" }],
    },
  ];

  it("renderiza o título, fases e valores formatados", () => {
    render(<PhaseBars title="Energia por fase" unit="MJ" rows={sampleRows} />);

    expect(screen.getByRole("figure", { name: "Energia por fase" })).toBeInTheDocument();
    expect(screen.getByText("Material (extração)")).toBeInTheDocument();
    expect(screen.getByText("Manufatura")).toBeInTheDocument();

    // Valores formatados
    expect(screen.getByText(/120,5 MJ/)).toBeInTheDocument();
    expect(screen.getByText(/45 MJ/)).toBeInTheDocument();
  });

  it("renderiza valor nulo com motivo ou texto de não calculada", () => {
    render(<PhaseBars title="Energia por fase" unit="MJ" rows={sampleRows} />);

    expect(screen.getByText("Sem rota definida")).toBeInTheDocument();
  });

  it("renderiza valor negativo com badge de crédito", () => {
    render(<PhaseBars title="Energia por fase" unit="MJ" rows={sampleRows} />);

    expect(screen.getByText(new RegExp(ecoPhaseI18n.creditBadge))).toBeInTheDocument();
    expect(screen.getByText(/-15,2 MJ/)).toBeInTheDocument();
  });

  it("atribui atributos acessíveis role=meter aos elementos de barra", () => {
    render(<PhaseBars title="Energia por fase" unit="MJ" rows={sampleRows} />);

    const meters = screen.getAllByRole("meter");
    expect(meters.length).toBe(3); // 3 com valor numérico (material, manufacture, eol)
    expect(meters[0]).toHaveAttribute("aria-valuenow", "120.5");
  });
});

describe("PhaseBars (Modo Comparativo A vs B)", () => {
  const compareRows: PhaseBarRow[] = [
    {
      phase: "material",
      label: "Material",
      items: [
        { seriesName: "Aço 1020", value: 100, tone: "primary" },
        { seriesName: "Alumínio 6061", value: 200, tone: "secondary" },
      ],
    },
    {
      phase: "eol",
      label: "Fim de vida",
      items: [
        { seriesName: "Aço 1020", value: -20, tone: "primary" },
        { seriesName: "Alumínio 6061", value: -50, tone: "secondary" },
      ],
    },
  ];

  it("renderiza legenda com as séries comparadas", () => {
    render(
      <PhaseBars
        title="Comparativo de Pegada de Carbono"
        unit="kg CO₂eq"
        rows={compareRows}
      />,
    );

    expect(screen.getByText("Aço 1020")).toBeInTheDocument();
    expect(screen.getByText("Alumínio 6061")).toBeInTheDocument();
  });

  it("escala as barras pela maior magnitude geral entre as duas séries", () => {
    render(
      <PhaseBars
        title="Comparativo de Pegada de Carbono"
        unit="kg CO₂eq"
        rows={compareRows}
      />,
    );

    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(4);
    // Maior valor é 200 (Alumínio). Aço (100) deve ter width: 50%
    const acoMaterialMeter = meters.find((m) =>
      m.getAttribute("aria-label")?.includes("Material - Aço 1020"),
    );
    const aluMaterialMeter = meters.find((m) =>
      m.getAttribute("aria-label")?.includes("Material - Alumínio 6061"),
    );

    expect(acoMaterialMeter).toHaveStyle({ width: "50%" });
    expect(aluMaterialMeter).toHaveStyle({ width: "100%" });
  });
});
