import { describe, expect, it } from "vitest";
import { SHARED_STYLES } from "./shared.js";

/*
 * The TODO apps render inside a sandboxed MCP Apps iframe, so their appearance
 * must come from the standard host style variables the Happy bridge maps from
 * theme.css — with defensive fallbacks centralized at the app root. These tests
 * pin that contract so a regression to a hardcoded palette or a missing fallback
 * is caught at build time.
 */
describe("TODO app shared styles", () => {
    it("resets html, body, and #root to fill the sandbox document with no default margin", () => {
        // Guards the blank-panel defect: the surface must fill the frame instead
        // of collapsing to content height, and carry no browser-default margin.
        expect(SHARED_STYLES).toContain(
            "html, body { width: 100%; height: 100%; margin: 0; padding: 0; }",
        );
        expect(SHARED_STYLES).toMatch(/#root \{[^}]*width: 100%[^}]*min-height: 100%[^}]*\}/);
        // The React root id the apps mount into.
        expect(SHARED_STYLES).toContain("#root {");
    });

    it("consumes the standard MCP style variables the host bridge supplies", () => {
        for (const variable of [
            "--color-background-primary",
            "--color-background-secondary",
            "--color-background-tertiary",
            "--color-text-primary",
            "--color-text-secondary",
            "--color-border-primary",
            "--color-ring-primary",
            "--color-background-inverse",
            "--color-text-inverse",
            "--color-text-danger",
            "--color-background-danger",
            "--border-radius-md",
            "--font-sans",
        ]) {
            expect(SHARED_STYLES, `expected ${variable} to be consumed`).toContain(
                `var(${variable}`,
            );
        }
    });

    it("gives every host variable a defensive fallback so a bare sandbox still renders", () => {
        // Every var() reading any host contract variable — color, font, radius,
        // border width, or shadow — must supply a fallback argument (a `)` right
        // after the name means no fallback). Internal `--td-*`/alias reads are
        // deliberately excluded by the namespace anchor.
        const bareReads = SHARED_STYLES.match(
            /var\(--(?:color|font|border-radius|border-width|shadow)-[a-z0-9-]+\)/g,
        );
        expect(bareReads, "host contract variables must always carry a fallback").toBeNull();
    });

    it("uses a monochrome primary action rather than a blue-filled button", () => {
        // The primary action mirrors Happy's inverse (black/white) fill, not the
        // accent blue, which is reserved for focus and selection.
        expect(SHARED_STYLES).toContain(".td-btn-primary { background: var(--action)");
        expect(SHARED_STYLES).not.toMatch(/td-btn-primary[^}]*var\(--accent\)/);
    });

    it("uses the matching Happy role values when the host omits a style variable", () => {
        // Keep the bare-sandbox surface faithful to the same source roles the
        // host forwards: surface, pressed surface, primary radio ring, and
        // primary button fill. These are fallbacks only; the standard MCP
        // variables above remain the plugin's public styling contract.
        expect(SHARED_STYLES).toContain(
            "--bg: var(--color-background-primary, light-dark(#ffffff, #18171c));",
        );
        expect(SHARED_STYLES).toContain(
            "--inset: var(--color-background-tertiary, light-dark(#f0f0f2, #2c2c2e));",
        );
        expect(SHARED_STYLES).toContain(
            "--accent: var(--color-ring-primary, light-dark(#007aff, #0a84ff));",
        );
        expect(SHARED_STYLES).toContain("--action: var(--color-background-inverse, #000000);");
        expect(SHARED_STYLES).toContain("--action-text: var(--color-text-inverse, #ffffff);");
    });

    it("centralizes the raw fallback palette at the app root only", () => {
        // Hex/rgb literals may appear only inside the complete .td-root rule.
        // Extract from `.td-root {` to its matching close brace (its declarations
        // contain no nested braces) rather than stopping at an arbitrary line.
        const rootStart = SHARED_STYLES.indexOf(".td-root {");
        const rootEnd = SHARED_STYLES.indexOf("}", rootStart);
        expect(rootStart).toBeGreaterThanOrEqual(0);
        expect(rootEnd).toBeGreaterThan(rootStart);
        const rootBlock = SHARED_STYLES.slice(rootStart, rootEnd + 1);
        const literalsEverywhere = SHARED_STYLES.match(/#[0-9a-fA-F]{3,6}\b|rgb\(/g) ?? [];
        const literalsInRoot = rootBlock.match(/#[0-9a-fA-F]{3,6}\b|rgb\(/g) ?? [];
        expect(literalsEverywhere.length).toBeGreaterThan(0);
        expect(literalsInRoot.length).toBe(literalsEverywhere.length);
    });
});
