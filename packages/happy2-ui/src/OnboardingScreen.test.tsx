import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { useState } from "react";
import { flushSync } from "react-dom";
import "./theme.css";
import "./styles/onboarding-screen.css";
import "./styles/icon.css";
import "./styles/setup-option-card.css";
import "./styles/text-field.css";
import "./styles/banner.css";
import "./styles/badge.css";
import { OnboardingScreen, type OnboardingStep } from "./OnboardingScreen";
import { Icon } from "./Icon";
import { SetupOptionCard } from "./SetupOptionCard";
import { TextField } from "./TextField";
import { Banner } from "./Banner";
import { createRenderer, type Bounds, type RenderedElement } from "./testing";

/*
 * External focus-ring painted extent beyond an interactive child's border box.
 * These are the component contracts the body scrollport must never clip:
 * SetupOptionCard `:focus-visible` is `2px` outline + `2px` outline-offset, and
 * TextField's control `:focus-within` is `2px` outline + `1px` outline-offset.
 */
const OPTION_RING_EXTENT = 4;
const FIELD_RING_EXTENT = 3;

/*
 * Asserts an interactive child sits far enough inside the scrollport that its
 * external focus ring cannot be clipped on the requested edges. Insets are read
 * from border boxes, so the right inset conservatively includes the scrollbar
 * gutter; every reported inset must still clear the ring's painted extent.
 */
function assertRingClearance(
    scrollport: Bounds,
    child: Bounds,
    extent: number,
    edges: readonly string[],
    name: string,
) {
    expect(child.x - scrollport.x, `${name}: left ring clearance`).toBeGreaterThanOrEqual(extent);
    expect(
        scrollport.x + scrollport.width - (child.x + child.width),
        `${name}: right ring clearance`,
    ).toBeGreaterThanOrEqual(extent);
    if (edges.includes("top"))
        expect(child.y - scrollport.y, `${name}: top ring clearance`).toBeGreaterThanOrEqual(
            extent,
        );
    if (edges.includes("bottom"))
        expect(
            scrollport.y + scrollport.height - (child.y + child.height),
            `${name}: bottom ring clearance`,
        ).toBeGreaterThanOrEqual(extent);
}

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
        "background-color": "rgb(255, 255, 255)",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
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
    expect(bg.computedStyle("background-image")).toBe("none");
    expect(bg.computedStyle("background-size")).toBe("cover");
    expect(scrim.offsets()).toMatchObject({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(scrim.computedStyle("background-color")).toBe("rgba(0, 0, 0, 0.32)");

    /* ---- Card: centered on both axes, 480×600 -------------------------- */

    const card = view.$('[data-happy2-ui="onboarding-card"]');
    const cb = card.bounds();
    expect(cb.width).toBe(480);
    expect(cb.height).toBe(600);
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
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "14px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "padding-bottom": "40px",
        "padding-left": "40px",
        "padding-right": "40px",
        "padding-top": "40px",
    });
    /* At every supported height >=648px the frame is exactly 600px tall. */
    expect(card.computedStyle("height")).toBe("600px");
    expect(card.computedStyle("max-height")).toBe("none");

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
    expect(brandName.computedStyle("color")).toBe("rgb(0, 0, 0)");
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
    expect(completeDot.computedStyle("background-color")).toBe("rgb(52, 199, 89)");
    expect(currentDot.computedStyle("background-color")).toBe("rgb(0, 122, 255)");
    expect(upcomingDot.computedStyle("background-color")).toBe("rgba(0, 0, 0, 0)");
    expect(upcomingDot.computedStyle("border-top-color")).toBe("rgb(142, 142, 147)");

    const completeLabel = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="complete"] [data-happy2-ui="onboarding-step-label"]',
    );
    const currentLabel = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="current"] [data-happy2-ui="onboarding-step-label"]',
    );
    const upcomingLabel = view.$(
        '[data-happy2-ui="onboarding-step"][data-state="upcoming"] [data-happy2-ui="onboarding-step-label"]',
    );
    expect(completeLabel.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(currentLabel.computedStyle("color")).toBe("rgb(0, 0, 0)");
    expect(upcomingLabel.computedStyle("color")).toBe("rgb(142, 142, 147)");

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
        color: "rgb(0, 122, 255)",
        "font-size": "12px",
        "font-weight": "700",
        "letter-spacing": "0.96px",
        "line-height": "16px",
        "text-transform": "uppercase",
    });
    await paints(kicker, "kicker");

    expect(title.element.tagName).toBe("H1");
    expect(title.height()).toBe(30);
    expect(title.computedStyle("color")).toBe("rgb(0, 0, 0)");
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
        color: "rgb(142, 142, 147)",
        "font-size": "15px",
        "font-weight": "400",
        "line-height": "22px",
    });
    await paints(copy, "copy");

    /* Content vertical rhythm: kicker→title 12px, title→copy 14px. */
    expect(title.offsets().top - (kicker.offsets().top + kicker.height())).toBe(12);
    expect(copy.offsets().top - (title.offsets().top + title.height())).toBe(14);

    /* ---- Body slot: full-bleed scrollport + inner content wrapper ------- */

    const body = view.$('[data-happy2-ui="onboarding-body"]');
    const bodyContent = view.$('[data-happy2-ui="onboarding-body-content"]');
    const bodyChild = view.$('[data-testid="onboarding-body-child"]');
    expect(bodyChild.height()).toBe(44);

    /* The scrollport owns scrolling and fills its allocated region with zero
     * margin and zero padding, edge to edge on both axes. */
    expect(
        body.computedStyles([
            "margin-top",
            "margin-right",
            "margin-bottom",
            "margin-left",
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
            "overflow-y",
        ]),
    ).toEqual({
        "margin-top": "0px",
        "margin-right": "0px",
        "margin-bottom": "0px",
        "margin-left": "0px",
        "padding-top": "0px",
        "padding-right": "0px",
        "padding-bottom": "0px",
        "padding-left": "0px",
        "overflow-y": "auto",
    });
    /* The scrollport spans the full card content-box width (480 − 2×1 border −
     * 2×40 padding) with no extra inset of its own on either side. */
    expect(body.bounds().width).toBe(398);
    expect(body.offsets()).toMatchObject({ left: 41, right: 41 });

    /* Spacing, gap, and the focus-safe gutter live on the inner wrapper. */
    expect(
        bodyContent.computedStyles([
            "display",
            "flex-direction",
            "gap",
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
        ]),
    ).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "12px",
        "padding-top": "28px",
        "padding-right": "8px",
        "padding-bottom": "8px",
        "padding-left": "8px",
    });
    /* The 28px content→body separation is preserved by the wrapper's top gutter. */
    expect(bodyChild.offsets().top).toBe(28);

    /* ---- Footer -------------------------------------------------------- */

    const footer = view.$('[data-happy2-ui="onboarding-footer"]');
    expect(
        footer.computedStyles([
            "color",
            "font-size",
            "line-height",
            "margin-top",
            "margin-right",
            "margin-bottom",
            "margin-left",
        ]),
    ).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "13px",
        "line-height": "18px",
        "margin-top": "20px",
        "margin-right": "8px",
        "margin-bottom": "0px",
        "margin-left": "8px",
    });
    /* The footer is pinned to the card content-box bottom and its horizontal
     * edges align with body children inside the shared 8px gutter. */
    expect(footer.offsets().bottom).toBe(41);
    expect(footer.bounds().x).toBe(bodyChild.bounds().x);
    expect(footer.bounds().width).toBe(bodyChild.bounds().width);
    await paints(footer, "footer");

    await view.screenshot("OnboardingScreen.test");
}, 120_000);

it("keeps loading and form card rects identical while holding width variants", async () => {
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
        { width: 1024, height: 704 },
    );
    view.render(
        () => (
            <OnboardingScreen
                brand={{ name: "Relay" }}
                copy="We are provisioning the base image and starting your first agent."
                data-testid="resolved"
                kicker="Almost there"
                steps={steps}
                title="Building your workspace"
            >
                <div data-testid="resolved-body-child" style={{ height: "44px" }}>
                    body
                </div>
            </OnboardingScreen>
        ),
        { width: 1024, height: 704 },
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
        { width: 1024, height: 704 },
    );
    view.render(
        () => (
            <OnboardingScreen data-testid="minimal" title="Enter your invite code">
                <div data-testid="minimal-body-child" style={{ height: "40px" }}>
                    body
                </div>
            </OnboardingScreen>
        ),
        { width: 1024, height: 704 },
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
        "border-top-color": "rgb(0, 122, 255)",
        "border-top-width": "2px",
        "border-left-color": "rgb(209, 209, 214)",
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
        color: "rgb(142, 142, 147)",
        "font-size": "14px",
        "font-weight": "500",
        "line-height": "20px",
    });
    expect(loadingLabel.textMetrics().text).toBe("Provisioning workspace…");
    await paints(loadingLabel, "loading label");

    /* Probe resolution changes body content without moving or resizing the card. */
    const loadingCard = view.$('[data-testid="loading"] [data-happy2-ui="onboarding-card"]');
    const resolvedCard = view.$('[data-testid="resolved"] [data-happy2-ui="onboarding-card"]');
    expect(loadingCard.bounds()).toMatchObject({ width: 480, height: 600 });
    expect(resolvedCard.bounds()).toMatchObject({ width: 480, height: 600 });
    expect(loadingCard.offsets()).toEqual(resolvedCard.offsets());

    /* ---- Large width variant: 640px card, custom mark, image bg --------- */

    const largeCard = view.$('[data-testid="large"] [data-happy2-ui="onboarding-card"]');
    expect(largeCard.bounds()).toMatchObject({ width: 640, height: 600 });
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

it("keeps short-window overflow reachable without clipping a focused trailing field", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <OnboardingScreen
                copy="Agent code runs inside the selected sandbox provider."
                data-testid="scroll"
                kicker="Server setup"
                title="Choose a sandbox"
                width="large"
            >
                <SetupOptionCard
                    data-testid="opt-first"
                    description="Docker 25 is ready to run agents."
                    icon="terminal"
                    title="Docker"
                />
                <TextField data-testid="field-mid" label="Image name" value="daycare" />
                <SetupOptionCard
                    description="A lean sandbox with the core agent toolchain."
                    icon="image"
                    title="Daycare Minimal"
                />
                <SetupOptionCard
                    description="A complete sandbox with the full Daycare toolchain."
                    icon="image"
                    title="Daycare Full"
                />
                <TextField
                    data-testid="field-last"
                    label="Notes"
                    value="Ship it when the build turns green."
                />
            </OnboardingScreen>
        ),
        { width: 720, height: 480 },
    );
    await view.ready();

    /* ---- The scrollport fills the card's content-box region exactly ------ */

    const card = view.$('[data-testid="scroll"] [data-happy2-ui="onboarding-card"]');
    const body = view.$('[data-testid="scroll"] [data-happy2-ui="onboarding-body"]');
    const bodyEl = body.element as HTMLElement;
    /* The card uses the 24px top/bottom safe gutter at the minimum 480px
     * window height: 480 − 48 = 432. */
    expect(card.bounds()).toMatchObject({ x: 40, y: 24, width: 640, height: 432 });
    expect(card.computedStyle("height")).toBe("432px");
    /* Full bleed: the scrollport spans the card's whole content box (the large
     * card is 640 − 2×1 border − 2×40 padding = 558) and, as the last card
     * child here, runs to the content-box edge on the sides and the bottom. */
    expect(body.bounds().width, "scrollport width == card content width").toBe(558);
    expect(body.offsets()).toMatchObject({ left: 41, right: 41, bottom: 41 });
    expect(
        body.computedStyles([
            "margin-top",
            "margin-right",
            "margin-bottom",
            "margin-left",
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
        ]),
    ).toEqual({
        "margin-top": "0px",
        "margin-right": "0px",
        "margin-bottom": "0px",
        "margin-left": "0px",
        "padding-top": "0px",
        "padding-right": "0px",
        "padding-bottom": "0px",
        "padding-left": "0px",
    });
    /* The content genuinely overflows, so both scroll edges are exercised. */
    expect(bodyEl.scrollHeight, "content overflows the scrollport").toBeGreaterThan(
        bodyEl.clientHeight,
    );

    /* ---- Scrolled to the top: first child's ring clears the top edge ----- */

    bodyEl.scrollTop = 0;
    const firstOption = view.$('[data-testid="opt-first"]');
    assertRingClearance(
        body.bounds(),
        firstOption.bounds(),
        OPTION_RING_EXTENT,
        ["top"],
        "first option",
    );
    /* The 28px content→body separation lives in the wrapper's top gutter. */
    expect(firstOption.offsets().top, "first child rests at the 28px gutter").toBe(28);
    await paintsUnclipped(firstOption, "first option card");

    /* A TextField near the top edge is likewise clear on its sides. */
    const midControl = view.$('[data-testid="field-mid"] [data-happy2-ui="text-field-control"]');
    assertRingClearance(body.bounds(), midControl.bounds(), FIELD_RING_EXTENT, [], "mid field");

    /* ---- Scrolled to the bottom: last child's ring clears the bottom ----- */

    bodyEl.scrollTop = bodyEl.scrollHeight;
    const lastControl = view.$('[data-testid="field-last"] [data-happy2-ui="text-field-control"]');
    const lastInput = view.$('[data-testid="field-last"] [data-happy2-ui="text-field-input"]');
    assertRingClearance(
        body.bounds(),
        lastControl.bounds(),
        FIELD_RING_EXTENT,
        ["bottom"],
        "last field",
    );

    /* Focus the trailing field: its accent ring is really painted and stays
     * inside the scrollport at the bottom scroll edge. */
    (lastInput.element as HTMLInputElement).focus();
    (lastInput.element as HTMLInputElement).style.caretColor = "transparent";
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    expect(document.activeElement).toBe(lastInput.element);
    expect(
        lastControl.computedStyles([
            "outline-color",
            "outline-offset",
            "outline-style",
            "outline-width",
        ]),
    ).toEqual({
        "outline-color": "rgb(0, 122, 255)",
        "outline-offset": "1px",
        "outline-style": "solid",
        "outline-width": "2px",
    });
    expect((await lastInput.visibleMetrics()).pixelCount, "focused field paints").toBeGreaterThan(
        0,
    );
    /* The painted ring rectangle (border box + 3px) is inside the scrollport. */
    const sp = body.bounds();
    const ring = lastControl.bounds();
    expect(ring.y - FIELD_RING_EXTENT - sp.y, "ring top inside scrollport").toBeGreaterThanOrEqual(
        0,
    );
    expect(
        sp.y + sp.height - (ring.y + ring.height + FIELD_RING_EXTENT),
        "ring bottom inside scrollport",
    ).toBeGreaterThanOrEqual(0);
    expect(ring.x - FIELD_RING_EXTENT - sp.x, "ring left inside scrollport").toBeGreaterThanOrEqual(
        0,
    );

    await view.screenshot("OnboardingScreen.scroll.test");
}, 120_000);

it("keeps the declared body gap whether an optional leading banner is present or absent", async () => {
    const view = createRenderer();

    /* With a leading provider banner (the ServerOnboarding provider notice). */
    view.render(
        () => (
            <OnboardingScreen
                data-testid="with-banner"
                kicker="Server setup"
                title="Pick a base image"
            >
                <Banner data-testid="note" icon="shield" tone="info">
                    Agent code runs inside the Docker sandbox.
                </Banner>
                <SetupOptionCard data-testid="wb-first" icon="image" title="Daycare Minimal" />
                <SetupOptionCard data-testid="wb-second" icon="image" title="Daycare Full" />
            </OnboardingScreen>
        ),
        { width: 1024, height: 704 },
    );
    /* Without the banner: the same two option cards, nothing else. */
    view.render(
        () => (
            <OnboardingScreen
                data-testid="no-banner"
                kicker="Server setup"
                title="Pick a base image"
            >
                <SetupOptionCard data-testid="nb-first" icon="image" title="Daycare Minimal" />
                <SetupOptionCard data-testid="nb-second" icon="image" title="Daycare Full" />
            </OnboardingScreen>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    const gapBetween = (top: RenderedElement<Element>, bottom: RenderedElement<Element>) =>
        bottom.offsets().top - (top.offsets().top + top.height());

    /* ---- Present: banner→first card and card→card are both the 12px gap -- */

    const note = view.$('[data-testid="note"]');
    const wbFirst = view.$('[data-testid="wb-first"]');
    const wbSecond = view.$('[data-testid="wb-second"]');
    /* The banner is the first flow child: it rests at the wrapper's top gutter,
     * never touching the content block, with no external margin of its own. */
    expect(note.offsets().top, "banner at top gutter").toBe(28);
    expect(gapBetween(note, wbFirst), "banner → first card gap").toBe(12);
    expect(gapBetween(wbFirst, wbSecond), "card → card gap (with banner)").toBe(12);

    /* ---- Absent: the first card takes the banner's place, gaps unchanged -- */

    const nbFirst = view.$('[data-testid="nb-first"]');
    const nbSecond = view.$('[data-testid="nb-second"]');
    expect(nbFirst.offsets().top, "first card at top gutter").toBe(28);
    expect(gapBetween(nbFirst, nbSecond), "card → card gap (no banner)").toBe(12);

    await view.screenshot("OnboardingScreen.gaps.test");
}, 120_000);

it("preserves the body DOM for one lifetime and remounts only it when bodyKey changes", async () => {
    const view = createRenderer();
    let setFixture!: (next: { bodyKey: string; revision: number }) => void;
    function Fixture() {
        const [fixture, updateFixture] = useState({ bodyKey: "sandbox", revision: 0 });
        setFixture = updateFixture;
        return (
            <OnboardingScreen
                bodyKey={fixture.bodyKey}
                data-testid="keyed"
                title={`Choose a sandbox ${fixture.revision}`}
            >
                {Array.from({ length: 12 }, (_, index) => (
                    <button key={index} type="button">
                        Provider {index + 1}
                    </button>
                ))}
            </OnboardingScreen>
        );
    }

    view.render(Fixture, { width: 720, height: 480, padding: 0 });
    await view.ready();
    const card = view.container.querySelector('[data-happy2-ui="onboarding-card"]')!;
    const firstBody = view.container.querySelector<HTMLElement>(
        '[data-happy2-ui="onboarding-body"]',
    )!;
    firstBody.scrollTop = firstBody.scrollHeight;
    expect(firstBody.scrollTop).toBeGreaterThan(0);

    flushSync(() => setFixture({ bodyKey: "sandbox", revision: 1 }));
    const sameBody = view.container.querySelector<HTMLElement>(
        '[data-happy2-ui="onboarding-body"]',
    )!;
    expect(sameBody).toBe(firstBody);
    expect(sameBody.scrollTop).toBeGreaterThan(0);
    expect(view.container.querySelector('[data-happy2-ui="onboarding-card"]')).toBe(card);

    flushSync(() => setFixture({ bodyKey: "base-image", revision: 2 }));
    const nextBody = view.container.querySelector<HTMLElement>(
        '[data-happy2-ui="onboarding-body"]',
    )!;
    expect(nextBody).not.toBe(firstBody);
    expect(nextBody.scrollTop).toBe(0);
    expect(view.container.querySelector('[data-happy2-ui="onboarding-card"]')).toBe(card);
}, 120_000);
