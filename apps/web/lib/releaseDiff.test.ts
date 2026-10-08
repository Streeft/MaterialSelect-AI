import { describe, expect, it } from "vitest";
import {
  comparablePartners,
  comparableReleases,
  defaultPair,
  describeChange,
  originalText,
  readingText,
  recordName,
  sideText,
} from "@/lib/releaseDiff";
import {
  absentToValue,
  densityChange,
  demoR1,
  demoR2,
  newItem,
  notRegisteredToValue,
  releaseList,
  removedItem,
  renameChange,
  undeclaredRelease,
  valueToAbsent,
  writingChange,
} from "@/components/catalog/releaseFixtures";
import type { CatalogRelease } from "@/lib/types";

const real = (slug: string, previous: string | null): CatalogRelease => ({
  ...demoR1,
  slug,
  release: slug,
  is_demo: false,
  lineage: "granta",
  previous_slug: previous,
});

describe("which releases may be compared (D-108)", () => {
  it("offers only releases of the same lineage, both real or both fictitious", () => {
    const releases = [demoR1, demoR2, real("g1", null), real("g2", "g1"), undeclaredRelease];
    expect(comparablePartners(releases, "g1").map((r) => r.slug)).toEqual(["g2"]);
    expect(comparablePartners(releases, "catalogo-demo-r1").map((r) => r.slug)).toEqual([
      "catalogo-demo-r2",
    ]);
    // A release with no declared lineage is comparable with nothing.
    expect(comparablePartners(releases, "sem-linha")).toEqual([]);
    expect(comparableReleases(releases).map((r) => r.slug)).toEqual([
      "catalogo-demo-r1",
      "catalogo-demo-r2",
      "g1",
      "g2",
    ]);
  });

  it("has nothing to offer with a single release", () => {
    expect(comparableReleases([demoR1])).toEqual([]);
    expect(defaultPair([demoR1])).toBeNull();
  });

  it("opens the latest release against its predecessor, a real catalogue first", () => {
    expect(defaultPair(releaseList)).toEqual({ base: "catalogo-demo-r1", target: "catalogo-demo-r2" });
    expect(defaultPair([demoR1, demoR2, real("g1", null), real("g2", "g1")])).toEqual({
      base: "g1",
      target: "g2",
    });
  });
});

describe("a change in words (D-24)", () => {
  it("writes a number in the reading unit, and the source's own writing apart", () => {
    expect(readingText(densityChange.before?.reading ?? null)).toBe("7,85 g/cm³");
    expect(readingText(densityChange.after?.reading ?? null)).toBe("7,9 g/cm³");
    expect(originalText(densityChange.before?.original ?? null)).toBe("7.850 kg/m³");
    expect(originalText(writingChange.after?.original ?? null)).toBe("200.000 MPa");
  });

  it("writes an absence out instead of a zero, a dash or a blank", () => {
    expect(sideText(absentToValue.before)).toBe("declarado ausente pela fonte");
    expect(sideText(notRegisteredToValue.before)).toBe("não cadastrado nesta release");
    expect(sideText(null)).toBe("não cadastrado nesta release");
    expect(readingText(valueToAbsent.after?.reading ?? null)).toBeNull();
  });

  it("says declared-absent to value and value to absent in a sentence", () => {
    expect(describeChange(absentToValue)).toBe(
      "Passou de declarado ausente pela fonte para 0,25 W/(m·K).",
    );
    expect(describeChange(valueToAbsent)).toBe(
      "Passou de 3,9 g/cm³ para declarado ausente pela fonte.",
    );
    expect(describeChange(notRegisteredToValue)).toBe(
      "Passou de não cadastrado nesta release para 110 °C.",
    );
  });

  it("says a value change as a change and a rewriting as the same physical value", () => {
    expect(describeChange(densityChange)).toBe("Passou de 7,85 g/cm³ para 7,9 g/cm³.");
    expect(describeChange(writingChange)).toBe(
      "Mesmo valor físico, escrito de outro modo: 200 GPa na base e 200.000 MPa no alvo.",
    );
  });

  it("quotes a text field and writes a null one as 'não informado'", () => {
    expect(describeChange(renameChange)).toBe(
      "Passou de Liga Demo de Cobre para Liga Demo de Cobre (revisada).",
    );
    expect(describeChange({ ...renameChange, before_text: null })).toContain("não informado");
  });

  it("names a record by the side where it exists", () => {
    expect(recordName(newItem)).toBe("Compósito Demo Laminado");
    expect(recordName(removedItem)).toBe("Cerâmica Demo Refratária");
  });
});
