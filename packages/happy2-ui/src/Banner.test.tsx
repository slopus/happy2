import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/banner.css";
import "./styles/icon.css";
import "./styles/button.css";
import { Banner, type BannerTone } from "./Banner";
import type { IconName } from "./Icon";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * Banner is an inline alert whose contract is: a soft tone fill, a matching
 * hairline border, a tone-colored 18px leading-icon slot, a 13px/18px text
 * block, and right-pinned actions. The text flows in its own line boxes (no
 * control-centering), so only the leading icon and the dismiss glyph are
 * optically centered — and that centering is carried by the shared Icon path
 * data, which is already tuned to <=0.4px in every engine, so no per-engine
 * translateY corrections exist in banner.css.
 *
 * Word labels (title, message) carry inherently asymmetric ink, so those are
 * asserted through font metrics, deterministic left inset (line-box), and
 * visible-pixel presence — never a forced centroid.
 */

/* Symmetric painted glyphs: tuned budget with the 0.75px contract ceiling. */
const ICON_TOL = 0.4;

/* textMetrics() strips the family quotes; getComputedStyle keeps them except
 * on WebKit (same quirk asserted in Button.test.tsx). */
const fontFamily = "happy2 Figtree, system-ui, sans-serif";
const computedFontFamily =
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : `"happy2 Figtree", system-ui, sans-serif`;

/* Solid theme tokens, resolved to the exact rgb()/rgba() each engine reports. */
const toneStyles: Record<
    BannerTone,
    {
        background: string;
        border: string;
        icon: string;
        iconName: IconName;
        title: string;
        message: string;
    }
> = {
    info: {
        background: "rgba(96, 165, 250, 0.13)",
        border: "rgb(96, 165, 250)",
        icon: "rgb(96, 165, 250)",
        iconName: "spark",
        title: "Heads up",
        message: "Retention policy updated.",
    },
    success: {
        background: "rgba(52, 211, 153, 0.13)",
        border: "rgb(52, 211, 153)",
        icon: "rgb(52, 211, 153)",
        iconName: "check-circle",
        title: "Backup complete",
        message: "Snapshot verified.",
    },
    warning: {
        background: "rgba(251, 191, 36, 0.13)",
        border: "rgb(251, 191, 36)",
        icon: "rgb(251, 191, 36)",
        iconName: "shield",
        title: "Guarded change",
        message: "Approval required.",
    },
    danger: {
        background: "rgba(248, 113, 113, 0.13)",
        border: "rgb(248, 113, 113)",
        icon: "rgb(248, 113, 113)",
        iconName: "bell",
        title: "Delivery failed",
        message: "Two webhooks retried.",
    },
    neutral: {
        background: "rgba(255, 255, 255, 0.05)",
        border: "rgba(255, 255, 255, 0.13)",
        icon: "rgb(165, 160, 176)",
        iconName: "eye",
        title: "Read receipts",
        message: "Receipts are on.",
    },
};

const tones = ["info", "success", "warning", "danger", "neutral"] as const;

/*
 * Alpha-weighted ink centroid of `part`, in `box`-relative CSS px. Refuses a
 * blank or clipped capture: the part must paint pixels and its ink may not
 * touch the captured box edges, so a truncated screenshot cannot pass silently.
 */
async function ink(part: RenderedElement<Element>, box: RenderedElement<Element>, name: string) {
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
    return { x: vis.center.x + p.x - b.x, y: vis.center.y + p.y - b.y };
}

it("holds Banner tone tokens, geometry, typography, and leading-icon centering", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {tones.map((tone) => (
                    <Banner
                        data-testid={`tone-${tone}`}
                        key={tone}
                        icon={toneStyles[tone].iconName}
                        onDismiss={() => {}}
                        title={toneStyles[tone].title}
                        tone={tone}
                    >
                        {toneStyles[tone].message}
                    </Banner>
                ))}
            </div>
        ),
        { width: 460, height: 426, padding: 16 },
    );
    await view.ready();

    for (const tone of tones) {
        const spec = toneStyles[tone];
        const banner = view.$(`[data-testid="tone-${tone}"]`);

        // Root box contract: 428px wide (460 - 2x16), title+message => 66px tall.
        expect(banner.bounds(), `${tone} bounds`).toMatchObject({ width: 428, height: 66 });
        expect(
            banner.computedStyles([
                "align-items",
                "background-color",
                "border-radius",
                "border-top-color",
                "border-top-width",
                "box-sizing",
                "column-gap",
                "display",
                "font-family",
                "min-height",
                "padding",
            ]),
            `${tone} computed`,
        ).toEqual({
            "align-items": "center",
            "background-color": spec.background,
            "border-radius": "10px",
            "border-top-color": spec.border,
            "border-top-width": "1px",
            "box-sizing": "border-box",
            "column-gap": "12px",
            display: "flex",
            "font-family": computedFontFamily,
            "min-height": "44px",
            padding: "12px 14px",
        });

        // Leading icon slot: 18px box, tone color, glyph optically centered.
        const slot = view.$(`[data-testid="tone-${tone}"] [data-happy2-ui="banner-icon"]`);
        expect(slot.bounds(), `${tone} icon slot`).toMatchObject({ width: 18, height: 18 });
        expect(slot.offsets().left, `${tone} icon inset`).toBe(15); // border 1 + pad 14
        expect(slot.computedStyle("color"), `${tone} icon color`).toBe(spec.icon);
        const glyph = view.$(`[data-testid="tone-${tone}"] [data-happy2-ui="banner-icon"] svg`);
        expect(glyph.bounds(), `${tone} glyph box`).toMatchObject({ width: 16, height: 16 });
        expect(glyph.element.getAttribute("data-name"), `${tone} glyph name`).toBe(spec.iconName);
        const g = await ink(glyph, slot, `${tone} icon`);
        // Slot center is (9, 9); the glyph must land there within the tuned budget.
        expect(Math.abs(g.x - 9), `${tone} icon optical x`).toBeLessThanOrEqual(ICON_TOL);
        expect(Math.abs(g.y - 9), `${tone} icon optical y`).toBeLessThanOrEqual(ICON_TOL);

        // Text block: title then message, both starting at the 45px content inset.
        const title = view.$(`[data-testid="tone-${tone}"] [data-happy2-ui="banner-title"]`);
        const message = view.$(`[data-testid="tone-${tone}"] [data-happy2-ui="banner-message"]`);
        expect(title.bounds().x - banner.bounds().x, `${tone} title inset`).toBe(45); // 15 + 18 + 12
        expect(message.bounds().x - banner.bounds().x, `${tone} message inset`).toBe(45);
        const titleMetrics = title.textMetrics();
        expect(titleMetrics.font, `${tone} title font`).toMatchObject({
            family: fontFamily,
            lineHeight: 18,
            size: 13,
            weight: "600",
        });
        expect(titleMetrics.text, `${tone} title text`).toBe(spec.title);
        expect(title.computedStyle("color"), `${tone} title color`).toBe("rgb(237, 234, 242)");
        const messageMetrics = message.textMetrics();
        expect(messageMetrics.font, `${tone} message font`).toMatchObject({
            family: fontFamily,
            lineHeight: 18,
            size: 13,
            weight: "400",
        });
        expect(messageMetrics.text, `${tone} message text`).toBe(spec.message);
        expect(message.computedStyle("color"), `${tone} message color`).toBe("rgb(165, 160, 176)");
        // Message stacks directly under the title: 18px line box + 4px column gap.
        expect(message.bounds().y - title.bounds().y, `${tone} title/message stack`).toBe(22);
        expect((await title.visibleMetrics()).pixelCount, `${tone} title ink`).toBeGreaterThan(0);
        expect((await message.visibleMetrics()).pixelCount, `${tone} message ink`).toBeGreaterThan(
            0,
        );
    }

    // Semantic role: danger interrupts (alert), softer tones announce politely.
    expect(view.$('[data-testid="tone-danger"]').element.getAttribute("role")).toBe("alert");
    expect(view.$('[data-testid="tone-info"]').element.getAttribute("role")).toBe("status");

    // Dismiss control: 18px ghost square pinned to the 15px right inset, close
    // glyph optically centered (same shared Icon path data as the leading slot).
    const dismiss = view.$('[data-testid="tone-info"] [data-happy2-ui="banner-dismiss"]');
    const infoBanner = view.$('[data-testid="tone-info"]');
    expect(dismiss.bounds()).toMatchObject({ width: 18, height: 18 });
    expect(dismiss.element.tagName).toBe("BUTTON");
    expect(
        infoBanner.bounds().x +
            infoBanner.bounds().width -
            (dismiss.bounds().x + dismiss.bounds().width),
    ).toBe(15); // pad 14 + border 1
    expect(dismiss.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "6px",
        color: "rgb(117, 112, 133)",
    });
    const dismissGlyph = view.$('[data-testid="tone-info"] [data-happy2-ui="banner-dismiss"] svg');
    expect(dismissGlyph.bounds()).toMatchObject({ width: 14, height: 14 });
    const d = await ink(dismissGlyph, dismiss, "dismiss");
    expect(Math.abs(d.x - 9), "dismiss optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(d.y - 9), "dismiss optical y").toBeLessThanOrEqual(ICON_TOL);

    await view.screenshot("Banner.test");
}, 120_000);

it("holds Banner layout modes: message-only, no-icon, action, dismiss, and wrapping", async () => {
    const view = createRenderer();

    // Single line, icon, no title/actions: the natural 44px floor.
    view.render(
        () => (
            <Banner data-testid="single" icon="spark" tone="info">
                Your workspace switched to the new retention policy.
            </Banner>
        ),
        { width: 460, height: 76, padding: 16 },
    );
    // No icon: message leads at the bare 15px inset.
    view.render(
        () => (
            <Banner data-testid="no-icon" tone="neutral">
                No leading icon on this one.
            </Banner>
        ),
        { width: 460, height: 76, padding: 16 },
    );
    // Full row: title + message + action Button + dismiss.
    let reviews = 0;
    let dismissed = 0;
    view.render(
        () => (
            <Banner
                action={{ label: "Review", onClick: () => (reviews += 1) }}
                data-testid="full"
                icon="shield"
                onDismiss={() => (dismissed += 1)}
                title="Guarded change pending"
                tone="warning"
            >
                An agent requested production credentials.
            </Banner>
        ),
        { width: 520, height: 96, padding: 16 },
    );
    // Single line + action, no dismiss: the 28px Button drives a 54px row.
    view.render(
        () => (
            <Banner
                action={{ label: "Retry", onClick: () => {} }}
                data-testid="action-only"
                icon="bell"
                tone="danger"
            >
                The nightly digest failed to deliver.
            </Banner>
        ),
        { width: 460, height: 96, padding: 16 },
    );
    // Constrained width: the message wraps and the icon rides the block center.
    view.render(
        () => (
            <Banner data-testid="wrap" icon="spark" title="Heads up" tone="info">
                This channel is archived, so new messages are disabled until an admin restores it.
            </Banner>
        ),
        { width: 300, height: 140, padding: 16 },
    );
    await view.ready();

    // ---- Single line: exact 44px, message at the 45px inset ------------------
    const single = view.$('[data-testid="single"]');
    expect(single.bounds()).toMatchObject({ width: 428, height: 44 });
    expect(single.computedStyle("min-height")).toBe("44px");
    const singleMsg = view.$('[data-testid="single"] [data-happy2-ui="banner-message"]');
    expect(singleMsg.bounds().x - single.bounds().x).toBe(45);
    expect((await singleMsg.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    // Icon stays optically centered in its slot even in the compact row.
    const singleSlot = view.$('[data-testid="single"] [data-happy2-ui="banner-icon"]');
    const singleGlyph = view.$('[data-testid="single"] [data-happy2-ui="banner-icon"] svg');
    const sg = await ink(singleGlyph, singleSlot, "single icon");
    expect(Math.abs(sg.x - 9), "single icon optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(sg.y - 9), "single icon optical y").toBeLessThanOrEqual(ICON_TOL);

    // ---- No icon: message leads at the bare content inset --------------------
    const noIcon = view.$('[data-testid="no-icon"]');
    expect(noIcon.bounds().height).toBe(44);
    expect(
        view.container.querySelector('[data-testid="no-icon"] [data-happy2-ui="banner-icon"]'),
    ).toBeNull();
    const noIconMsg = view.$('[data-testid="no-icon"] [data-happy2-ui="banner-message"]');
    expect(noIconMsg.bounds().x - noIcon.bounds().x).toBe(15); // border 1 + pad 14

    // ---- Full row: action Button + dismiss, order and insets -----------------
    const full = view.$('[data-testid="full"]');
    // Title+message block (40px) dominates the 28px Button => 66px row.
    expect(full.bounds().height).toBe(66);
    const action = view.$('[data-testid="full"] .happy2-banner__action');
    expect(action.element.tagName).toBe("BUTTON");
    expect(action.bounds().height).toBe(28);
    expect(action.textMetrics().text).toBe("Review");
    const fullDismiss = view.$('[data-testid="full"] [data-happy2-ui="banner-dismiss"]');
    // Action precedes dismiss with an 8px gap; dismiss holds the 15px right inset.
    expect(fullDismiss.bounds().x - (action.bounds().x + action.bounds().width)).toBe(8);
    expect(
        full.bounds().x +
            full.bounds().width -
            (fullDismiss.bounds().x + fullDismiss.bounds().width),
    ).toBe(15);
    // Callbacks fire independently.
    (action.element as HTMLButtonElement).click();
    (fullDismiss.element as HTMLButtonElement).click();
    expect(reviews).toBe(1);
    expect(dismissed).toBe(1);

    // ---- Action, no dismiss: 28px Button drives a 54px single-line row -------
    const actionOnly = view.$('[data-testid="action-only"]');
    expect(actionOnly.bounds().height).toBe(54);
    const retry = view.$('[data-testid="action-only"] .happy2-banner__action');
    expect(retry.bounds().height).toBe(28);
    // Last in the group => it holds the 15px right inset itself.
    expect(
        actionOnly.bounds().x +
            actionOnly.bounds().width -
            (retry.bounds().x + retry.bounds().width),
    ).toBe(15);
    expect(
        view.container.querySelector(
            '[data-testid="action-only"] [data-happy2-ui="banner-dismiss"]',
        ),
    ).toBeNull();

    // ---- Wrapping: taller row, message spans two lines, icon still centered --
    const wrap = view.$('[data-testid="wrap"]');
    expect(wrap.bounds().width).toBe(268); // 300 - 2x16
    expect(wrap.bounds().height).toBeGreaterThan(66); // grew past the single-line block
    const wrapMsg = view.$('[data-testid="wrap"] [data-happy2-ui="banner-message"]');
    expect(wrapMsg.bounds().height).toBeGreaterThanOrEqual(36); // >= two 18px lines
    expect((await wrapMsg.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const wrapSlot = view.$('[data-testid="wrap"] [data-happy2-ui="banner-icon"]');
    const wrapGlyph = view.$('[data-testid="wrap"] [data-happy2-ui="banner-icon"] svg');
    const wg = await ink(wrapGlyph, wrapSlot, "wrap icon");
    expect(Math.abs(wg.x - 9), "wrap icon optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(wg.y - 9), "wrap icon optical y").toBeLessThanOrEqual(ICON_TOL);

    await view.screenshot("Banner.variants.test");
}, 120_000);
