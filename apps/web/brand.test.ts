import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AI_DRAFT_NOTE,
  AI_OFF_NOTICE,
  API_AVAILABLE,
  API_UNREACHABLE,
  DISCLOSURE,
  PAGE_INTRO,
  REFERENCE_NOTE,
} from "./lib/messages.ts";

// The brand guidelines are the canonical specification (CLAUDE.md section 14). These
// tests read that document and compare it with the code, so a colour, a font weight, a
// spacing value or an approved sentence cannot change in one place and not the other.

const WEB = fileURLToPath(new URL(".", import.meta.url));
const GUIDELINES = readFileSync(join(WEB, "..", "..", "docs", "design", "OSTENSIA_BRAND_GUIDELINES.md"), "utf8");
const GLOBALS = readFileSync(join(WEB, "app", "globals.css"), "utf8");
const LAYOUT = readFileSync(join(WEB, "app", "layout.tsx"), "utf8");

const HEX_ROW = /^\|\s*([a-z0-9-]+(?:\s*\/\s*[a-z0-9-]+)*)\s*\|\s*(#[0-9A-Fa-f]{6}(?:\s*\/\s*#[0-9A-Fa-f]{6})*)\s*\|/;

function guidelineColours(): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const line of GUIDELINES.split("\n")) {
    const row = HEX_ROW.exec(line);
    if (row === null) continue;
    const names = (row[1] ?? "").split("/").map((part) => part.trim());
    const values = (row[2] ?? "").split("/").map((part) => part.trim().toUpperCase());
    expect(names.length, line).toBe(values.length);
    names.forEach((name, index) => tokens.set(name, values[index] ?? ""));
  }
  return tokens;
}

function cssColours(): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of GLOBALS.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    tokens.set(match[1] ?? "", (match[2] ?? "").toUpperCase());
  }
  return tokens;
}

describe("colour tokens", () => {
  const fromGuidelines = guidelineColours();
  const fromCss = cssColours();

  it("reads both sources", () => {
    expect(fromGuidelines.size).toBeGreaterThanOrEqual(21);
    expect(fromCss.size).toBeGreaterThanOrEqual(21);
  });

  it("globals.css holds exactly the colours in the guidelines, with the same values", () => {
    expect(Object.fromEntries([...fromCss].sort())).toEqual(Object.fromEntries([...fromGuidelines].sort()));
  });

  it("keeps the two approved contrast adjustments", () => {
    expect(fromCss.get("success-700")).toBe("#1A7C49");
    expect(fromCss.get("line-500")).toBe("#8792A6");
  });
});

describe("spacing, radii and sizes", () => {
  const px = (name: string): number | undefined => {
    const match = new RegExp(`--${name}:\\s*([0-9]+)px`).exec(GLOBALS);
    return match === null ? undefined : Number(match[1]);
  };

  it("uses the approved spacing scale and no other", () => {
    const scale = /Spacing scale \(px\): ([0-9, ]+)\./.exec(GUIDELINES);
    expect(scale).not.toBeNull();
    const approved = (scale?.[1] ?? "").split(",").map((value) => Number(value.trim()));
    const defined = [...GLOBALS.matchAll(/--space-([0-9]+):\s*([0-9]+)px/g)].map((match) => {
      expect(Number(match[1])).toBe(Number(match[2]));
      return Number(match[2]);
    });
    expect(defined).toEqual(approved);
  });

  it("matches the radii", () => {
    expect(GUIDELINES).toContain("Radius: controls 6px; cards 8px; badges 4px.");
    expect([px("radius-control"), px("radius-card"), px("radius-badge")]).toEqual([6, 8, 4]);
  });

  it("matches the shadow, the header, the control height and the page width", () => {
    expect(GUIDELINES).toContain("0 1px 2px rgba(15, 27, 45, 0.06)");
    expect(GLOBALS).toContain("--shadow-card: 0 1px 2px rgba(15, 27, 45, 0.06);");
    expect(GUIDELINES).toContain("Header: 56px");
    expect(px("header-height")).toBe(56);
    expect(GUIDELINES).toContain("40px tall");
    expect(px("control-height")).toBe(40);
    expect(GUIDELINES).toContain("max width 1080px");
    expect(px("content-max")).toBe(1080);
  });

  it("matches the type scale", () => {
    expect(GUIDELINES).toContain("12 badges; 13 disclosure and captions; 14 labels and secondary text;");
    expect(GUIDELINES).toContain("16 body; 20 section titles; 28 page title.");
    expect([12, 13, 14, 16, 20, 28].map((size) => px(`text-${size}`))).toEqual([12, 13, 14, 16, 20, 28]);
  });
});

describe("typography", () => {
  it("loads IBM Plex through next/font with the approved weights only", () => {
    expect(GUIDELINES).toContain("Weights 400, 500 and 600 only.");
    expect(LAYOUT).toContain('from "next/font/google"');
    expect(LAYOUT).toContain("IBM_Plex_Sans");
    expect(LAYOUT).toContain("IBM_Plex_Mono");
    for (const match of LAYOUT.matchAll(/weight:\s*\[([^\]]*)\]/g)) {
      for (const weight of (match[1] ?? "").split(",")) expect(["400", "500", "600"]).toContain(weight.trim().replaceAll('"', ""));
    }
    expect(LAYOUT).toContain('lang="en"');
  });

  it("falls back to system fonts", () => {
    expect(GLOBALS).toMatch(/--font-sans:\s*var\(--font-plex-sans\),\s*system-ui/);
    expect(GLOBALS).toMatch(/--font-mono:\s*var\(--font-plex-mono\),\s*ui-monospace/);
  });
});

// Contrast, recomputed from the tokens the app actually ships (WCAG 2.2).
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function ratio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("contrast (WCAG 2.2 AA)", () => {
  const colour = cssColours();
  const get = (name: string): string => {
    const value = colour.get(name);
    if (value === undefined) throw new Error(`no token ${name}`);
    return value;
  };

  // Text that appears in the interface, with the surface it sits on. 4.5:1.
  const TEXT: ReadonlyArray<readonly [string, string]> = [
    ["ink-900", "surface-0"],
    ["ink-900", "surface-100"],
    ["ink-900", "brand-50"],
    ["ink-900", "ai-50"],
    ["ink-900", "danger-50"],
    ["ink-900", "warning-50"],
    ["ink-900", "success-50"],
    ["ink-700", "surface-0"],
    ["ink-700", "surface-100"],
    ["ink-500", "surface-0"],
    ["ink-500", "surface-100"],
    ["ink-500", "brand-50"],
    ["ink-500", "ai-50"],
    ["surface-0", "brand-600"],
    ["surface-0", "brand-700"],
    ["brand-600", "surface-0"],
    ["brand-600", "surface-100"],
    ["brand-600", "brand-50"],
    ["ai-600", "ai-50"],
    ["ai-600", "surface-0"],
    ["sim-600", "surface-0"],
    ["sim-600", "surface-100"],
    ["paypal-op-600", "surface-0"],
    ["success-700", "success-50"],
    ["success-700", "surface-0"],
    ["danger-700", "danger-50"],
    ["danger-700", "surface-0"],
    ["warning-700", "warning-50"],
    ["warning-700", "surface-0"],
    ["hold-700", "hold-50"],
    ["hold-700", "surface-0"],
  ];

  // Borders and indicators that identify a control or a state. 3:1.
  const NON_TEXT: ReadonlyArray<readonly [string, string]> = [
    ["line-500", "surface-0"],
    ["brand-600", "surface-0"],
    ["ai-600", "ai-50"],
    ["sim-600", "surface-0"],
    ["danger-700", "surface-0"],
    ["paypal-op-600", "surface-0"],
  ];

  it.each(TEXT)("text %s on %s is at least 4.5:1", (foreground, background) => {
    expect(ratio(get(foreground), get(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT)("%s against %s is at least 3:1", (foreground, background) => {
    expect(ratio(get(foreground), get(background))).toBeGreaterThanOrEqual(3);
  });

  it("keeps the measured values the guidelines quote", () => {
    expect(ratio(get("ink-500"), get("brand-50"))).toBeCloseTo(4.73, 1);
    expect(ratio(get("success-700"), get("success-50"))).toBeCloseTo(4.65, 1);
    expect(ratio(get("line-500"), get("surface-0"))).toBeCloseTo(3.14, 1);
  });
});

describe("approved interface language (guidelines section 10)", () => {
  // The guidelines wrap their lines; compare with whitespace collapsed.
  const flat = (text: string): string => text.replace(/\s+/g, " ");
  const document = flat(GUIDELINES);

  it.each([
    ["the persistent disclosure", DISCLOSURE],
    ["the page introduction", PAGE_INTRO],
    ["the AI drafting note", AI_DRAFT_NOTE],
    ["the AI-off notice", AI_OFF_NOTICE],
    ["the API-available status", API_AVAILABLE],
    ["the API-unreachable status", API_UNREACHABLE],
    ["the mandate-reference note", REFERENCE_NOTE],
  ])("%s matches the guidelines word for word", (_name, text) => {
    expect(document).toContain(flat(text));
  });

  it("never says the reference was attached to a PayPal order", () => {
    expect(REFERENCE_NOTE.toLowerCase()).not.toContain("paypal");
    expect(REFERENCE_NOTE).toContain("It is not proof of who approved the mandate, of their consent, or of any authorization.");
  });

  it("says the AI never approves a purchase", () => {
    expect(AI_DRAFT_NOTE).toContain("AI never approves a purchase.");
  });
});
