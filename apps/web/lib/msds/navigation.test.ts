import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "msds.css"), "utf8");
const bottomNav = readFileSync(resolve(__dirname, "../../components/layout/BottomNav.tsx"), "utf8");
const table = readFileSync(resolve(__dirname, "../../components/ui/Table.tsx"), "utf8");

describe("navigation and data on the M3 roles (D-137)", () => {
  it("tabs draw a 3 px rounded indicator in primary and keep no 2 px underline", () => {
    expect(css).toMatch(/\.msds-tab::after \{[^}]*height: 3px; border-radius: 3px 3px 0 0; background: rgb\(var\(--m3-primary\)\)/);
    expect(css).toContain('.msds-tab[data-active="true"]::after { transform: scaleX(1); }');
    expect(css).not.toMatch(/\.msds-tab \{[^}]*border-bottom: 2px/);
  });

  it("the tab divider is outline-variant and the active label is primary", () => {
    expect(css).toMatch(/\.msds-tablist \{[^}]*--m3-outline-variant/);
    expect(css).toContain('.msds-tab[data-active="true"] { color: rgb(var(--m3-primary)); }');
  });

  it("list items and table rows answer hover with the 8% veil, not a fill", () => {
    expect(css).toContain("background: rgb(var(--m3-on-surface) / var(--state-hover))");
    expect(table).toContain("[&>tr:hover]:bg-m3-on-surface/[0.08]");
    expect(table).not.toContain("bg-surface-sunken [&>tr]");
  });

  it("the bottom bar marks the active item with a 56 x 32 pill and no top bar", () => {
    expect(bottomNav).toContain("h-8 w-14");
    expect(bottomNav).toContain("rounded-full");
    expect(bottomNav).not.toContain("h-[3px] w-6");
  });

  it("the bottom bar stays on the dark rail (D-37)", () => {
    expect(bottomNav).toContain("bg-rail");
    expect(bottomNav).not.toContain("bg-m3-");
  });
});
