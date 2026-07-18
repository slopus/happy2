import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/onboarding-screen.css";
import "./styles/icon.css";
import { OnboardingScreen, type OnboardingStep } from "./OnboardingScreen";
import { Icon } from "./Icon";
import { createRenderer, type RenderedElement } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const steps: readonly OnboardingStep[] = [
    { label: "Account", state: "complete" },
    { label: "Server", state: "current" },
    { label: "Finish", state: "upcoming" },
];

/*
 * Alpha-weighted ink centroid of `partSelector` (a painted glyph with no
 * optical nudge of its own), expressed as an offset from the center of
 * `hostSelector` (positive = right / low). Refuses a blank or clipped capture.
 */
async function glyphDrift(view: Renderer, hostSelector: string, partSelector: string) {
    const host = view.$(hostSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const pb = part.bounds();
    expect(visible.bounds.x, `${partSelector} ink clipped left`).toBeGreaterThan(0);
    expect(visible.bounds.y, `${partSelector} ink clipped top`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${partSelector} ink clipped right`,
    ).toBeLessThan(pb.width);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${partSelector} ink clipped bottom`,
    ).toBeLessThan(pb.height);
    const hb = host.bounds();
    return {
        dx: visible.center.x + pb.x - hb.x - hb.width / 2,
        dy: visible.center.y + pb.y - hb.y - hb.height / 2,
    };
}

/* Asserts a text part paints and its ink stays inside its own line box. */
async function paints(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThan(0);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThanOrEqual(
        box.height,
    );
    return vis;
}

/* Asserts a painted part fills unclipped within its own box on every edge. */
async function paintsUnclipped(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(vis.bounds.x, `${name} ink clipped left`).toBeGreaterThanOrEqual(0);
    expect(vis.bounds.y, `${name} ink clipped top`).toBeGreaterThanOrEqual(0);
    expect(vis.bounds.x + vis.bounds.width, `${name} ink clipped right`).toBeLessThanOrEqual(
        box.width,
    );
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped bottom`).toBeLessThanOrEqual(
        box.height,
    );
    return vis;
}

it("holds OnboardingScreen centered card, step rail, typography, and optical brand glyph", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <OnboardingScreen
                brand={{ name: "Relay" }}
                copy="Point Relay at the workspace server that will run your agents."
                data-testid="onboarding"
                footer={<span data-testid="onboarding-foot">Need help connecting?</span>}
                kicker="Step 2 of 3"
                steps={steps}
                title="Connect your server"
            >
                <div data-testid="onboarding-body-child" style={{ height: "44px" }}>
                    body
                </div>
            </OnboardingScreen>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    /* ---- Root: full-window dark shell ---------------------------------- */

    const root = view.$('[data-testid="onboarding"]');
    expect(root.element.tagName).toBe("DIV");
    expect(root.bounds()).toMatchObject({ x: 0, y: 0, width: 1024, height: 704 });
    expect(root.element.getAttribute("data-state")).toBe("form");
    expect(
        root.computedStyles([
            "align-items",
            "background-color",
            "box-sizing",
            "color",
            "display",
            "font-family",
            "justify-content",
            "overflow-x",
            "overflow-y",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(19, 18, 23)",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        display: "flex",
        "font-family": fontFamily(),
        "justify-content": "center",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
    });

    /* ---- Background + scrim layers fill the root ----------------------- */

    const bg = view.$('[data-happy2-ui="onboarding-bg"]');
    const scrim = view.$('[data-happy2-ui="onboarding-scrim"]');
    expect(bg.element.getAttribute("data-has-image")).toBeNull();
    expect(bg.offsets()).toMatchObject({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(bg.computedStyle("background-image")).toContain("gradient");
    expect(bg.computedStyle("background-size")).toBe("cover");
    expect(scrim.offsets()).toMatchObject({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(scrim.computedStyle("background-color")).toBe("rgba(0, 0, 0, 0.6)");

    /* ---- Card: centered on both axes, 480 wide ------------------------- */

    const card = view.$('[data-happy2-ui="onboarding-card"]');
    const cb = card.bounds();
    expect(cb.width).toBe(480);
    expect(card.element.getAttribute("data-width")).toBe("medium");
    expect(Math.abs(cb.x + cb.width / 2 - 512), "card horizontal center").toBeLessThanOrEqual(0.6);
    expect(Math.abs(cb.y + cb.height / 2 - 352), "card vertical center").toBeLessThanOrEqual(0.6);
    expect(
        card.computedStyles([
            "background-color",
            "border-radius",
            "box-sizing",
            "display",
            "flex-direction",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "background-color": "rgb(28, 27, 34)",
        "border-radius": "14px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "padding-bottom": "40px",
        "padding-left": "40px",
        "padding-right": "40px",
        "padding-top": "40px",
    });
    /* Card honors the 24px gutter cap and never exceeds it in the window. */
    expect(card.computedStyle("max-height")).toBe("calc(100% - 48px)");
    expect(cb.height, "card within gutter cap").toBeLessThanOrEqual(656);

    /* ---- Brand mast ---------------------------------------------------- */

    const brand = view.$('[data-happy2-ui="onboarding-brand"]');
    const mark = view.$('[data-happy2-ui="onboarding-mark"]');
    const brandName = view.$('[data-happy2-ui="onboarding-brand-name"]');
    expect(brand.offsets()).toMatchObject({ left: 41, top: 41 }); /* 1px border + 40 padding */
    expect(brand.height()).toBe(28);
    expect(mark.bounds()).toMatchObject({ width: 28, height: 28 });
    expect(
        mark.computedStyles([
            "align-items",
            "border-radius",
            "box-sizing",
            "color",
            "display",
            "justify-content",
        ]),
    ).toEqual({
        "align-items": "center",
        "border-radius": "8px",
        "box-sizing": "border-box",
        color: "rgb(255, 255, 255)",
        display: "flex",
        "justify-content": "center",
    });
    expect(mark.computedStyle("background-image")).toContain("linear-gradient");
    expect(brandName.offsets().left).toBe(40); /* 28 mark + 12 gap, relative to brand */
    expect(brandName.computedStyle("color")).toBe("rgb(237, 234, 242)");
    const nameMetrics = brandName.textMetrics();
    expect(nameMetrics.text).toBe("Relay");
    expect(nameMetrics.font).toMatchObject({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: -0.15,
        lineHeight: 20,
        size: 15,
        weight: "700",
    });
    await paints(brandName, "brand name");

    /* Brand mark glyph (default spark) optically centered in the 28px chip. */
    const markGlyph = await glyphDrift(
        view,
        '[data-happy2-ui="onboarding-mark"]',
        '[data-happy2-ui="onboarding-mark"] svg',
    );
    expect(Math.abs(markGlyph.dx), "mark glyph horizontal centroid").toBeLessThanOrEqual(0.5);
    expect(Math.abs(markGlyph.dy), "mark glyph vertical centroid").toBeLessThanOrEqual(0.5);

    /* ---- Step rail ----------------------------------------------------- */

    const rail = view.$('[data-happy2-ui="onboarding-steps"]');
    const stepEls = rail.element.querySelectorAll('[data-happy2-ui="onboarding-step"]');
    expect(stepEls.length).toBe(3);

    const completeDot = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="complete"] [data-happy2-ui="onboarding-step-dot"]',
    );
    const currentDot = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="current"] [data-happy2-ui="onboarding-step-dot"]',
    );
    const upcomingDot = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="upcoming"] [data-happy2-ui="onboarding-step-dot"]',
    );
    expect(completeDot.computedStyle("background-color")).toBe("rgb(52, 211, 153)");
    expect(currentDot.computedStyle("background-color")).toBe("rgb(139, 124, 247)");
    expect(upcomingDot.computedStyle("background-color")).toBe("rgba(0, 0, 0, 0)");
    expect(upcomingDot.computedStyle("border-top-color")).toBe("rgb(85, 81, 95)");

    const completeLabel = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="complete"] [data-happy2-ui="onboarding-step-label"]',
    );
    const currentLabel = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="current"] [data-happy2-ui="onboarding-step-label"]',
    );
    const upcomingLabel = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="upcoming"] [data-happy2-ui="onboarding-step-label"]',
    );
    expect(completeLabel.computedStyle("color")).toBe("rgb(165, 160, 176)");
    expect(currentLabel.computedStyle("color")).toBe("rgb(237, 234, 242)");
    expect(upcomingLabel.computedStyle("color")).toBe("rgb(117, 112, 133)");

    /* The complete step paints its check glyph unclipped inside the dot. */
    const completeCheck = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="complete"] [data-happy2-ui="onboarding-step-dot"] svg',
    );
    await paintsUnclipped(completeCheck, "complete check glyph");

    /* ---- Content block ------------------------------------------------- */

    const kicker = view.$('[data-happy2-ui="onboarding-kicker"]');
    const title = view.$('[data-happy2-ui="onboarding-title"]');
    const copy = view.$('[data-happy2-ui="onboarding-copy"]');

    expect(
        kicker.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "letter-spacing",
            "line-height",
            "text-transform",
        ]),
    ).toEqual({
        color: "rgb(139, 124, 247)",
        "font-size": "12px",
        "font-weight": "700",
        "letter-spacing": "0.96px",
        "line-height": "16px",
        "text-transform": "uppercase",
    });
    await paints(kicker, "kicker");

    expect(title.element.tagName).toBe("H1");
    expect(title.height()).toBe(30);
    expect(title.computedStyle("color")).toBe("rgb(237, 234, 242)");
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.text).toBe("Connect your server");
    expect(titleMetrics.font).toMatchObject({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: -0.48,
        lineHeight: 30,
        size: 24,
        weight: "700",
    });
    expect(titleMetrics.baseline.fromElementTop).toBeGreaterThan(0);
    expect(titleMetrics.baseline.fromElementTop).toBeLessThan(30);
    await paints(title, "title");

    expect(copy.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(165, 160, 176)",
        "font-size": "15px",
        "font-weight": "400",
        "line-height": "22px",
    });
    await paints(copy, "copy");

    /* Content vertical rhythm: kicker→title 12px, title→copy 14px. */
    expect(title.offsets().top - (kicker.offsets().top + kicker.height())).toBe(12);
    expect(copy.offsets().top - (title.offsets().top + title.height())).toBe(14);

    /* ---- Body slot hosts the app children ------------------------------ */

    const body = view.$('[data-happy2-ui="onboarding-body"]');
    const bodyChild = view.$('[data-testid="onboarding-body-child"]');
    expect(bodyChild.height()).toBe(44);
    expect(body.computedStyles(["margin-top", "overflow-y"])).toEqual({
        "margin-top": "28px",
        "overflow-y": "auto",
    });

    /* ---- Footer -------------------------------------------------------- */

    const footer = view.$('[data-happy2-ui="onboarding-footer"]');
    expect(footer.computedStyles(["color", "font-size", "line-height", "margin-top"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "13px",
        "line-height": "18px",
        "margin-top": "28px",
    });
    await paints(footer, "footer");

    await view.screenshot("OnboardingScreen.test");
}, 120_000);

it("holds OnboardingScreen loading, large width, and minimal variants", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <OnboardingScreen
                brand={{ name: "Relay" }}
                copy="We are provisioning the base image and starting your first agent."
                data-testid="loading"
                kicker="Almost there"
                loadingLabel="Provisioning workspace…"
                state="loading"
                steps={steps}
                title="Building your workspace"
            >
                <div data-testid="loading-body-child">body</div>
            </OnboardingScreen>
        ),
        { width: 1024, height: 400 },
    );
    view.render(
        () => (
            <OnboardingScreen
                backgroundUrl="data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='8'%20height='8'%3E%3Crect%20width='8'%20height='8'%20fill='%238b7cf7'/%3E%3C/svg%3E"
                brand={{
                    mark: <Icon color="var(--happy2-text-on-accent)" name="zap" size={16} />,
                    name: "Relay",
                }}
                copy="Choose the base image and defaults new agents inherit."
                data-testid="large"
                kicker="Step 3 of 3"
                steps={steps}
                title="Set up your workspace"
                width="large"
            >
                <div data-testid="large-body-child" style={{ height: "40px" }}>
                    body
                </div>
            </OnboardingScreen>
        ),
        { width: 1024, height: 400 },
    );
    view.render(
        () => (
            <OnboardingScreen data-testid="minimal" title="Enter your invite code">
                <div data-testid="minimal-body-child" style={{ height: "40px" }}>
                    body
                </div>
            </OnboardingScreen>
        ),
        { width: 1024, height: 400 },
    );
    await view.ready();

    /* ---- Loading: deterministic static ring + label replaces the body -- */

    const loadingRoot = view.$('[data-testid="loading"]');
    expect(loadingRoot.element.getAttribute("data-state")).toBe("loading");
    expect(
        view.container.querySelector('[data-testid="loading-body-child"]'),
        "body children hidden while loading",
    ).toBeNull();

    const loader = view.$('[data-testid="loading"] [data-happy2-ui="onboarding-loader"]');
    expect(loader.computedStyles(["align-items", "display"])).toEqual({
        "align-items": "center",
        display: "flex",
    });

    const spinner = view.$('[data-testid="loading"] [data-happy2-ui="onboarding-spinner"]');
    expect(spinner.bounds()).toMatchObject({ width: 20, height: 20 });
    expect(
        spinner.computedStyles([
            "border-radius",
            "border-top-color",
            "border-top-width",
            "border-left-color",
            "box-sizing",
        ]),
    ).toEqual({
        "border-radius": "999px",
        "border-top-color": "rgb(139, 124, 247)",
        "border-top-width": "2px",
        "border-left-color": "rgba(255, 255, 255, 0.13)",
        "box-sizing": "border-box",
    });
    const ring = await spinner.visibleMetrics();
    expect(ring.pixelCount, "spinner paints no pixels").toBeGreaterThan(0);
    const sb = spinner.bounds();
    expect(ring.bounds.x, "ring clipped left").toBeGreaterThanOrEqual(0);
    expect(ring.bounds.y, "ring clipped top").toBeGreaterThanOrEqual(0);
    expect(ring.bounds.x + ring.bounds.width, "ring clipped right").toBeLessThanOrEqual(sb.width);
    expect(ring.bounds.y + ring.bounds.height, "ring clipped bottom").toBeLessThanOrEqual(
        sb.height,
    );
    expect(
        Math.abs(ring.bounds.x + ring.bounds.width / 2 - sb.width / 2),
        "ring x center",
    ).toBeLessThanOrEqual(0.75);
    expect(
        Math.abs(ring.bounds.y + ring.bounds.height / 2 - sb.height / 2),
        "ring y center",
    ).toBeLessThanOrEqual(0.75);

    const loadingLabel = view.$(
        '[data-testid="loading"] [data-happy2-ui="onboarding-loading-label"]',
    );
    expect(loadingLabel.offsets().left).toBe(32); /* 20px ring + 12px gap */
    expect(
        loadingLabel.computedStyles(["color", "font-size", "font-weight", "line-height"]),
    ).toEqual({
        color: "rgb(165, 160, 176)",
        "font-size": "14px",
        "font-weight": "500",
        "line-height": "20px",
    });
    expect(loadingLabel.textMetrics().text).toBe("Provisioning workspace…");
    await paints(loadingLabel, "loading label");

    /* ---- Large width variant: 640px card, custom mark, image bg --------- */

    const largeCard = view.$('[data-testid="large"] [data-happy2-ui="onboarding-card"]');
    expect(largeCard.bounds().width).toBe(640);
    expect(largeCard.element.getAttribute("data-width")).toBe("large");

    const largeBg = view.$('[data-testid="large"] [data-happy2-ui="onboarding-bg"]');
    expect(largeBg.element.getAttribute("data-has-image")).toBe("");
    const largeBgImage = largeBg.computedStyle("background-image");
    expect(largeBgImage).toContain("data:image");
    expect(largeBgImage).not.toContain("gradient");

    const customMark = view.$('[data-testid="large"] [data-happy2-ui="onboarding-mark"]');
    expect(customMark.bounds()).toMatchObject({ width: 28, height: 28 });
    expect(customMark.element.querySelector("svg")?.getAttribute("data-name")).toBe("zap");

    /* ---- Minimal: title + body slot only ------------------------------- */

    const minimal = view.$('[data-testid="minimal"]');
    expect(
        minimal.element.querySelector('[data-happy2-ui="onboarding-brand"]'),
        "no brand",
    ).toBeNull();
    expect(
        minimal.element.querySelector('[data-happy2-ui="onboarding-steps"]'),
        "no steps",
    ).toBeNull();
    expect(
        minimal.element.querySelector('[data-happy2-ui="onboarding-kicker"]'),
        "no kicker",
    ).toBeNull();
    expect(
        minimal.element.querySelector('[data-happy2-ui="onboarding-copy"]'),
        "no copy",
    ).toBeNull();
    expect(
        minimal.element.querySelector('[data-happy2-ui="onboarding-footer"]'),
        "no footer",
    ).toBeNull();
    const minimalTitle = view.$('[data-testid="minimal"] [data-happy2-ui="onboarding-title"]');
    expect(minimalTitle.textMetrics().text).toBe("Enter your invite code");
    await paints(minimalTitle, "minimal title");
    expect(
        view.$('[data-testid="minimal"] [data-happy2-ui="onboarding-card"]').bounds().width,
    ).toBe(480);

    await view.screenshot("OnboardingScreen.variants.test");
}, 120_000);
