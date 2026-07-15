import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/secret-reveal.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/banner.css";
import { SecretReveal } from "./SecretReveal";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * SecretReveal is a one-time token card. Its contract is: a surface card
 * (radius 10, hairline border, 16 padding), a header carrying a Figtree label +
 * a mono meta line on the left and a reveal(ghost icon-only)/copy(secondary)
 * Button pair on the right, a `--happy2-bg-code` well (radius 6) holding a mono
 * token, and an optional warning Banner. The token area is always full-width so
 * masking (a fixed dot run) vs revealing (the wrapping real token) changes only
 * the well's height and text colour, never its width.
 *
 * The token and the label/meta carry inherently asymmetric ink (word/number
 * runs, left-aligned), so those are asserted through typography, deterministic
 * insets, colour tokens, and unclipped visible-pixel presence — never a forced
 * centroid. The one symmetric painted target, the reveal-toggle eye glyph, is
 * held to the tuned centroid budget; its centering is carried by the shared
 * Icon path data, so this component adds no per-engine translateY corrections.
 */

/* Symmetric painted glyph: tuned budget with the 0.75px contract ceiling. */
const ICON_TOL = 0.4;

/* getComputedStyle keeps the family quotes except on WebKit (Button.test quirk);
 * textMetrics() strips them on every engine. */
const computedFontFamily =
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';
const uiFamily = "happy2 Figtree, system-ui, sans-serif";
const monoFamily = "happy2 Mono, ui-monospace, monospace";

const SECRET = "happy2_demo_secret_0f2c1a7b4e51d0c8a6f3b"; // 40 chars → wraps at 296px
const WARNING = "Copy this now — it won't be shown again.";
const LABEL = "Personal access token";
const META = "tok_… · expires in 24h";
/* The masked view renders a fixed 24-dot run regardless of secret length. */
const MASK = "•".repeat(24);

/*
 * Alpha-weighted ink centroid of `part`, expressed relative to the center of
 * `box`. Refuses a blank or clipped capture: the part must paint pixels and its
 * ink may not touch the captured box edges, so a truncated screenshot can never
 * pass silently.
 */
async function iconDrift(
    part: RenderedElement<Element>,
    box: RenderedElement<Element>,
    name: string,
) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const p = part.bounds();
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThan(0);
    expect(vis.bounds.x, `${name} ink clipped at left`).toBeGreaterThan(0);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThan(
        p.height,
    );
    expect(vis.bounds.x + vis.bounds.width, `${name} ink clipped at right`).toBeLessThan(p.width);
    const b = box.bounds();
    return {
        x: vis.center.x + p.x - b.x - b.width / 2,
        y: vis.center.y + p.y - b.y - b.height / 2,
    };
}

/*
 * Guards a left-aligned text span's capture without chasing a centroid: it must
 * paint pixels, and its ink must sit inside the span box vertically (leading top
 * and bottom) and not overflow it — so a blank or clipped token can't pass.
 */
async function assertTextInk(span: RenderedElement<Element>, name: string) {
    const vis = await span.visibleMetrics();
    const box = span.bounds();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThan(0);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThanOrEqual(
        box.height,
    );
    expect(vis.bounds.x, `${name} ink starts before box`).toBeGreaterThanOrEqual(0);
    expect(vis.bounds.x + vis.bounds.width, `${name} ink overflows box`).toBeLessThanOrEqual(
        box.width + 0.5,
    );
}

it("holds SecretReveal card, header, mono token, and warning-banner contract", async () => {
    const view = createRenderer();

    // Masked and revealed at the same 360px card width, same secret: only the
    // well's height and token colour change between them.
    view.render(
        () => (
            <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
                <SecretReveal
                    data-testid="masked"
                    label={LABEL}
                    meta={META}
                    secret={SECRET}
                    style={{ width: "360px" }}
                    warning={WARNING}
                />
                <SecretReveal
                    data-testid="revealed"
                    label={LABEL}
                    meta={META}
                    revealed
                    secret={SECRET}
                    style={{ width: "360px" }}
                    warning={WARNING}
                />
            </div>
        ),
        { width: 392, height: 460, padding: 16 },
    );
    await view.ready();

    const card = view.$('[data-testid="masked"]');

    // ---- Root card box contract ---------------------------------------------
    expect(card.bounds().width, "card width").toBe(360);
    expect(
        card.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "padding",
            "row-gap",
        ]),
        "card computed",
    ).toEqual({
        "background-color": "rgb(28, 27, 34)",
        "border-radius": "10px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": computedFontFamily,
        padding: "16px",
        "row-gap": "12px",
    });

    // ---- Header: label + mono meta, actions right-pinned --------------------
    const header = view.$('[data-testid="masked"] [data-happy2-ui="secret-reveal-header"]');
    expect(header.computedStyle("min-height"), "header min-height").toBe("28px");
    expect(header.offsets().left, "header left inset").toBe(17); // border 1 + pad 16
    expect(header.offsets().right, "header right inset").toBe(17);

    const label = view.$('[data-testid="masked"] [data-happy2-ui="secret-reveal-label"]');
    expect(label.textMetrics().text, "label text").toBe(LABEL);
    expect(label.textMetrics().font, "label font").toMatchObject({
        family: uiFamily,
        lineHeight: 16,
        size: 13,
        weight: "600",
    });
    expect(label.computedStyle("color"), "label color").toBe("rgb(237, 234, 242)");

    const meta = view.$('[data-testid="masked"] [data-happy2-ui="secret-reveal-meta"]');
    expect(meta.textMetrics().text, "meta text").toBe(META);
    expect(meta.textMetrics().font, "meta font").toMatchObject({
        family: monoFamily,
        lineHeight: 16,
        size: 12,
        weight: "500",
    });
    expect(meta.computedStyle("color"), "meta color").toBe("rgb(117, 112, 133)");
    // Meta stacks directly under the label: 16px line box + 2px column gap.
    expect(meta.bounds().y - label.bounds().y, "label/meta stack").toBeCloseTo(18, 3);

    // Copy button holds the 17px right inset; reveal precedes it with a 6px gap.
    const reveal = view.$('[data-testid="masked"] .happy2-secret-reveal__reveal');
    const copy = view.$('[data-testid="masked"] .happy2-secret-reveal__copy');
    expect(reveal.bounds(), "reveal square").toMatchObject({ width: 28, height: 28 });
    expect(copy.bounds().height, "copy height").toBe(28);
    expect(copy.bounds().x - (reveal.bounds().x + reveal.bounds().width), "action gap").toBeCloseTo(
        6,
        3,
    );
    expect(
        card.bounds().x + card.bounds().width - (copy.bounds().x + copy.bounds().width),
        "actions right inset",
    ).toBeCloseTo(17, 3);
    // Copy is a secondary Button labelled "Copy" with the files glyph.
    expect(
        copy.computedStyles(["background-color", "border-top-color", "color"]),
        "copy tokens",
    ).toEqual({
        "background-color": "rgb(36, 34, 43)",
        "border-top-color": "rgba(255, 255, 255, 0.13)",
        color: "rgb(237, 234, 242)",
    });
    const copyLabel = view.$(
        '[data-testid="masked"] .happy2-secret-reveal__copy [data-happy2-ui="button-label"]',
    );
    expect(copyLabel.textMetrics().text, "copy label").toBe("Copy");
    const copyGlyph = view.$('[data-testid="masked"] .happy2-secret-reveal__copy svg');
    expect(copyGlyph.element.getAttribute("data-name"), "copy glyph").toBe("files");
    expect(copyGlyph.bounds(), "copy glyph box").toMatchObject({ width: 14, height: 14 });

    // Reveal-toggle eye glyph: symmetric painted content, optically centered in
    // its 28px ghost square (shared Icon path data, no local correction).
    const revealGlyph = view.$('[data-testid="masked"] .happy2-secret-reveal__reveal svg');
    expect(revealGlyph.element.getAttribute("data-name"), "reveal glyph").toBe("eye");
    expect(revealGlyph.bounds(), "reveal glyph box").toMatchObject({ width: 14, height: 14 });
    const rg = await iconDrift(revealGlyph, reveal, "reveal icon");
    expect(Math.abs(rg.x), "reveal icon optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(rg.y), "reveal icon optical y").toBeLessThanOrEqual(ICON_TOL);

    // ---- Field well + masked token ------------------------------------------
    const field = view.$('[data-testid="masked"] [data-happy2-ui="secret-reveal-field"]');
    expect(field.bounds().width, "field width").toBe(326); // 360 - 2×16 pad - 2×1 border
    expect(field.bounds().height, "masked field height").toBe(46); // 20 line + 2×12 pad + 2×1
    expect(field.offsets().left, "field left inset").toBe(17);
    expect(field.offsets().right, "field right inset").toBe(17);
    expect(
        field.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "box-sizing",
            "display",
            "padding",
        ]),
        "field computed",
    ).toEqual({
        "background-color": "rgb(20, 19, 25)",
        "border-radius": "6px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "box-sizing": "border-box",
        display: "block",
        padding: "12px 14px",
    });

    const token = view.$('[data-testid="masked"] [data-happy2-ui="secret-reveal-token"]');
    expect(token.textMetrics().text, "masked token text").toBe(MASK);
    expect(token.textMetrics().font, "masked token font").toMatchObject({
        family: monoFamily,
        letterSpacing: 0,
        lineHeight: 20,
        size: 13,
        weight: "500",
    });
    expect(token.computedStyle("color"), "masked token color").toBe("rgb(165, 160, 176)");
    expect(token.computedStyle("font-variant-numeric"), "token tabular").toContain("tabular-nums");
    expect(token.bounds().x - field.bounds().x, "token left inset").toBeCloseTo(15, 3); // border 1 + pad 14
    await assertTextInk(token, "masked token");

    // ---- Warning Banner (composed) ------------------------------------------
    const banner = view.$('[data-testid="masked"] [data-happy2-ui="banner"]');
    expect(banner.element.getAttribute("data-tone"), "banner tone").toBe("warning");
    expect(
        banner.computedStyles(["background-color", "border-top-color", "border-radius"]),
        "banner tokens",
    ).toEqual({
        "background-color": "rgba(251, 191, 36, 0.13)",
        "border-top-color": "rgb(251, 191, 36)",
        "border-radius": "10px",
    });
    const bannerMsg = view.$('[data-testid="masked"] [data-happy2-ui="banner-message"]');
    expect(bannerMsg.textMetrics().text, "banner message").toBe(WARNING);

    // ---- Masked vs revealed: width stable, only height/colour change --------
    const revealedField = view.$('[data-testid="revealed"] [data-happy2-ui="secret-reveal-field"]');
    const revealedToken = view.$('[data-testid="revealed"] [data-happy2-ui="secret-reveal-token"]');
    expect(revealedField.bounds().width, "revealed field width").toBe(326);
    // Same width as masked, but the 40-char token wraps to ≥ 2 lines → taller.
    expect(revealedField.bounds().width, "width stability").toBe(field.bounds().width);
    expect(revealedToken.bounds().height, "revealed token wraps").toBeGreaterThanOrEqual(40);
    expect(revealedField.bounds().height, "revealed grows").toBeGreaterThan(field.bounds().height);
    expect(revealedToken.textMetrics().text, "revealed token text").toBe(SECRET);
    expect(revealedToken.computedStyle("color"), "revealed token color").toBe("rgb(237, 234, 242)");
    await assertTextInk(revealedToken, "revealed token");

    await view.screenshot("SecretReveal.test");
}, 120_000);

it("holds SecretReveal copied, minimal, and reveal/copy interaction states", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <SecretReveal
                copied
                data-testid="copied"
                label="Webhook signing secret"
                meta="whsec_…"
                revealed
                secret="whsec_3f9ac2b7e1d64850bb9c72af10e5"
                style={{ width: "360px" }}
            />
        ),
        { width: 392, height: 140, padding: 16 },
    );

    let toggles = 0;
    let copies = 0;
    view.render(
        () => (
            <SecretReveal
                data-testid="minimal"
                onCopy={() => (copies += 1)}
                onToggleReveal={() => (toggles += 1)}
                secret="sk_test_51H8x2eLkd0"
                style={{ width: "300px" }}
            />
        ),
        { width: 332, height: 108, padding: 16 },
    );
    await view.ready();

    // ---- Copied: copy Button flips to the success treatment + check glyph ----
    const copiedCard = view.$('[data-testid="copied"]');
    expect(copiedCard.element.getAttribute("data-copied"), "data-copied set").toBe("");
    const copiedButton = view.$('[data-testid="copied"] .happy2-secret-reveal__copy');
    expect(
        copiedButton.computedStyles(["background-color", "border-top-color", "color"]),
        "copied tokens",
    ).toEqual({
        "background-color": "rgba(52, 211, 153, 0.13)",
        "border-top-color": "rgba(0, 0, 0, 0)",
        color: "rgb(110, 231, 183)",
    });
    const copiedLabel = view.$(
        '[data-testid="copied"] .happy2-secret-reveal__copy [data-happy2-ui="button-label"]',
    );
    expect(copiedLabel.textMetrics().text, "copied label").toBe("Copied");
    const copiedGlyph = view.$('[data-testid="copied"] .happy2-secret-reveal__copy svg');
    expect(copiedGlyph.element.getAttribute("data-name"), "copied glyph").toBe("check");

    // ---- Minimal: no label / meta / warning, header collapses to actions -----
    const minimal = view.$('[data-testid="minimal"]');
    expect(minimal.bounds().width, "minimal width").toBe(300);
    expect(
        view.container.querySelector(
            '[data-testid="minimal"] [data-happy2-ui="secret-reveal-label"]',
        ),
        "no label",
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="minimal"] [data-happy2-ui="secret-reveal-meta"]',
        ),
        "no meta",
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="minimal"] [data-happy2-ui="banner"]'),
        "no warning banner",
    ).toBeNull();
    const minimalHeader = view.$('[data-testid="minimal"] [data-happy2-ui="secret-reveal-header"]');
    expect(minimalHeader.bounds().height, "header collapses to action row").toBe(28);
    const minimalField = view.$('[data-testid="minimal"] [data-happy2-ui="secret-reveal-field"]');
    expect(minimalField.bounds().width, "minimal field width").toBe(266); // 300 - 32 - 2
    const minimalToken = view.$('[data-testid="minimal"] [data-happy2-ui="secret-reveal-token"]');
    expect(minimalToken.textMetrics().text, "minimal masked").toBe(MASK);
    expect(minimalToken.computedStyle("color"), "minimal masked color").toBe("rgb(165, 160, 176)");

    // ---- Interaction: reveal and copy fire their own callbacks ---------------
    const revealButton = view.$('[data-testid="minimal"] .happy2-secret-reveal__reveal')
        .element as HTMLButtonElement;
    const copyButton = view.$('[data-testid="minimal"] .happy2-secret-reveal__copy')
        .element as HTMLButtonElement;
    expect(revealButton.getAttribute("aria-label"), "reveal aria").toBe("Reveal secret");
    revealButton.click();
    copyButton.click();
    copyButton.click();
    expect(toggles, "toggle callback").toBe(1);
    expect(copies, "copy callback").toBe(2);

    await view.screenshot("SecretReveal.variants.test");
}, 120_000);
