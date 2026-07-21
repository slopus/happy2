import "./styles.css";
import { expect, it } from "vitest";
import { ApprovalCard, type ApprovalRequest, type ApprovalResolution } from "./ApprovalCard";
import { createRenderer, RenderedElement } from "./testing";

/*
 * Optical assertions measure the alpha-weighted ink centroid (color-blind,
 * background-subtracted) of every text-or-glyph part against its box center.
 * Word labels and path-like mono strings carry inherently asymmetric ink
 * (ascender/descender mass follows the specific characters), so those parts
 * assert the vertical centroid only, plus deterministic line-box symmetry;
 * each such case is commented at the assertion site. Engine corrections in
 * approval-card.css were measured at true 2x in all three engines; residual
 * drift for every asserted part is <=0.42px, so TOL holds real margin.
 */

const request: ApprovalRequest = {
    action: "edit config/releases/onboarding.json",
    agent: "Codex",
    impact: "Applies to the next deploy only; nothing ships until the release train cuts.",
    initials: "CX",
    reason: "Wants to raise the rollout gate before Friday's release.",
    resources: ["onboarding.json", "release-train", "deploy-bot"],
    title: "Edit release gating config",
    tone: "mint",
    typeLabel: "PERMISSION",
};

/* Long-content variant: exercises the action-well ellipsis and title wrap. */
const longRequest: ApprovalRequest = {
    ...request,
    action: "rewrite infra/terraform/environments/production/eu-west-1/gateway/main.tf --force",
    typeLabel: "ESCALATION",
};

const TOL = 0.75;
/* Icons are centered by path data and rasterize deterministically; hold them
 * to the tighter budget (measured |drift| <= 0.11px in every engine). */
const ICON_TOL = 0.4;

const noop = () => {};

/* Ink centroid of `part`, in `box`-relative CSS px; every measured part must
 * paint (pixelCount > 0) so a clipped or blank capture can never pass. */
async function ink(part: RenderedElement<Element>, box: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} pixelCount`).toBeGreaterThan(0);
    const p = part.bounds();
    const b = box.bounds();
    return { x: vis.center.x + p.x - b.x, y: vis.center.y + p.y - b.y };
}

/* Layout-space top offset of `part` inside `box`, with `part`'s own optical
 * translate removed — line-box symmetry is asserted on layout geometry, and
 * translated parts must measure their ink against the untranslated box. */
function layoutTop(part: RenderedElement<Element>, box: RenderedElement<Element>) {
    const transform = getComputedStyle(part.element).transform;
    const translateY = transform.startsWith("matrix(")
        ? Number.parseFloat(transform.slice(7, -1).split(",")[5] ?? "0")
        : 0;
    return part.bounds().y - translateY - box.bounds().y;
}

it("holds pending ApprovalCard geometry, typography, and interactions", async () => {
    const view = createRenderer();

    const resolutions: ApprovalResolution[] = [];
    const expansions: boolean[] = [];
    view.render(
        () => (
            <ApprovalCard
                data-testid="ac-pending"
                expanded={false}
                onExpandedChange={(expanded) => expansions.push(expanded)}
                onResolutionChange={(resolution) => resolutions.push(resolution)}
                request={request}
                resolution="pending"
            />
        ),
        { width: 712, height: 224, padding: 16 },
    );
    view.render(
        () => (
            <ApprovalCard
                data-testid="ac-expanded"
                expanded
                onExpandedChange={noop}
                onResolutionChange={noop}
                request={request}
                resolution="pending"
            />
        ),
        { width: 712, height: 320, padding: 16 },
    );
    await view.ready();

    /* ---- Root card contract ------------------------------------------- */

    const card = view.$('[data-testid="ac-pending"]');
    expect(card.element.tagName).toBe("SECTION");
    expect(card.bounds()).toEqual({ x: 16, y: 16, width: 680, height: 191 });
    expect(
        card.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "max-width",
            "overflow-x",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "10px",
        "border-top-color": "rgb(255, 248, 240)" /* amber-tinted hairline */,
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "block",
        "max-width": "680px",
        "overflow-x": "hidden",
    });

    /* ---- Header: shield chip + warning type badge + agent -------------- */

    const chip = view.$('[data-testid="ac-pending"] [data-happy2-ui="approval-card-chip"]');
    expect(chip.bounds().x - card.bounds().x).toBe(17); /* border 1 + pad 16 */
    expect(chip.bounds().y - card.bounds().y).toBe(13); /* border 1 + pad 12 */
    expect(chip.bounds().width).toBe(26);
    expect(chip.bounds().height).toBe(26);
    expect(chip.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgb(255, 248, 240)",
        "border-radius": "8px",
        color: "rgb(142, 142, 147)",
    });

    const shield = view.$(
        '[data-testid="ac-pending"] [data-happy2-ui="approval-card-chip"] [data-happy2-ui="icon"]',
    );
    expect(shield.offsets()).toEqual({ top: 6, right: 6, bottom: 6, left: 6 });
    const shieldInk = await ink(shield, chip, "pending shield");
    expect(Math.abs(shieldInk.x - 13), "shield optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(shieldInk.y - 13), "shield optical y").toBeLessThanOrEqual(ICON_TOL);

    const badge = view.$('[data-testid="ac-pending"] [data-happy2-ui="badge"]');
    expect(badge.element.getAttribute("data-variant")).toBe("warning");
    expect(badge.bounds().x - card.bounds().x).toBe(51); /* chip 26 + gap 8 */
    expect(badge.bounds().height).toBe(18);
    expect(badge.textMetrics().text).toBe("PERMISSION");
    /* Badge box rides the header lane center; its ink is Badge's contract. */
    expect(badge.bounds().y - chip.bounds().y).toBe(4); /* (26 - 18) / 2 */
    expect((await badge.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const avatar = view.$('[data-testid="ac-pending"] [data-happy2-ui="avatar"]');
    expect(avatar.bounds().width).toBe(20);
    expect(avatar.element.getAttribute("data-type")).toBe("agent");
    expect(avatar.bounds().y - chip.bounds().y).toBe(3); /* (26 - 20) / 2 */
    expect((await avatar.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const header = view.$('[data-testid="ac-pending"] [data-happy2-ui="approval-card-header"]');
    const agentName = view.$(
        '[data-testid="ac-pending"] [data-happy2-ui="approval-card-agent-name"]',
    );
    const agentMetrics = agentName.textMetrics();
    expect(agentMetrics.text).toBe("Codex");
    expect(agentMetrics.font.size).toBe(12);
    expect(agentMetrics.font.weight).toBe("600");
    expect(agentName.computedStyle("color")).toBe("rgb(142, 142, 147)");
    /* 16px line box centered on the 26px header lane: symmetric by geometry. */
    expect(layoutTop(agentName, header)).toBe(5);
    /* "Codex" is a word label (cap + ascender ink); vertical centroid only. */
    const agentInk = await ink(agentName, header, "agent name");
    expect(Math.abs(agentInk.y - 13), "agent name optical y").toBeLessThanOrEqual(TOL);
    /* Identity block is pushed to the card's right edge. */
    const agent = view.$('[data-testid="ac-pending"] [data-happy2-ui="approval-card-agent"]');
    expect(card.bounds().x + 680 - (agent.bounds().x + agent.bounds().width)).toBe(17);

    /* ---- Title / reason / action well ---------------------------------- */

    const title = view.$('[data-testid="ac-pending"] [data-happy2-ui="approval-card-title"]');
    expect(title.bounds().y - card.bounds().y).toBe(49); /* header 26 + margin 10 */
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    expect(titleMetrics.font.size).toBe(15);
    expect(titleMetrics.font.weight).toBe("700");
    expect(titleMetrics.font.lineHeight).toBe(20);
    expect(titleMetrics.ink.width).toBeGreaterThan(0);
    expect(title.computedStyle("color")).toBe("rgb(0, 0, 0)");
    expect((await title.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const reason = view.$('[data-testid="ac-pending"] [data-happy2-ui="approval-card-reason"]');
    expect(reason.bounds().y - card.bounds().y).toBe(73);
    expect(reason.textMetrics().font.size).toBe(13);
    expect(reason.textMetrics().font.lineHeight).toBe(18);
    expect(reason.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect((await reason.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const action = view.$('[data-testid="ac-pending"] [data-happy2-ui="approval-card-action"]');
    expect(action.bounds().y - card.bounds().y).toBe(101);
    expect(action.bounds().width).toBe(646); /* fills the body: 680 - 2 - 32 */
    expect(action.bounds().height).toBe(32); /* 18 line + 12 pad + 2 border */
    expect(
        action.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "color",
            "font-size",
            "padding-left",
            "padding-top",
            "white-space",
        ]),
    ).toEqual({
        "background-color": "rgb(246, 248, 250)",
        "border-radius": "6px",
        "border-top-color": "rgb(234, 234, 234)",
        color: "rgb(0, 0, 0)",
        "font-size": "12px",
        "padding-left": "10px",
        "padding-top": "6px",
        "white-space": "nowrap",
    });
    expect(action.textMetrics().font.family).toBe("happy2 Mono, ui-monospace, monospace");
    /* Mono path string: left-aligned, slash/ascender-heavy ink — vertical
     * centroid only, held to the 32px well center. */
    const actionText = view.$(
        '[data-testid="ac-pending"] [data-happy2-ui="approval-card-action-text"]',
    );
    const actionInk = await ink(actionText, action, "action well text");
    expect(Math.abs(actionInk.y - 16), "action well optical y").toBeLessThanOrEqual(TOL);

    /* Collapsed: no details block. */
    expect(
        view.container.querySelector(
            '[data-testid="ac-pending"] [data-happy2-ui="approval-card-details"]',
        ),
    ).toBeNull();

    /* ---- Footer actions -------------------------------------------------- */

    const footer = view.$('[data-testid="ac-pending"] .happy2-approval-card__footer');
    const approve = view.$('[data-testid="ac-pending"] [data-action="approve"]');
    expect(approve.element.tagName).toBe("BUTTON");
    expect(approve.bounds().x - card.bounds().x).toBe(17);
    expect(approve.bounds().y - card.bounds().y).toBe(154); /* body 146 + 8 pad */
    expect(approve.bounds().height).toBe(28);
    expect(approve.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgb(0, 0, 0)",
        color: "rgb(255, 255, 255)",
    });
    /* Buttons ride the footer lane center; label/icon ink is Button's contract. */
    expect(approve.bounds().y - footer.bounds().y).toBe(9); /* border 1 + pad 8 */
    expect((await approve.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const deny = view.$('[data-testid="ac-pending"] [data-action="deny"]');
    expect(deny.bounds().height).toBe(28);
    expect(deny.bounds().y - footer.bounds().y).toBe(9);
    /* Engines report the button edge at a subpixel float; 3dp is exact enough. */
    expect(deny.bounds().x - (approve.bounds().x + approve.bounds().width)).toBeCloseTo(8, 3);
    expect(deny.computedStyles(["background-color", "border-top-color"])).toEqual({
        "background-color": "rgb(248, 248, 248)",
        "border-top-color": "rgb(209, 209, 214)",
    });
    expect(deny.textMetrics().text).toBe("Request changes");
    expect((await deny.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const toggle = view.$('[data-testid="ac-pending"] [data-happy2-ui="approval-card-toggle"]');
    expect(toggle.element.tagName).toBe("BUTTON");
    expect(toggle.element.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.bounds().height).toBe(28);
    /* Pinned to the footer's right edge. */
    expect(card.bounds().x + 680 - (toggle.bounds().x + toggle.bounds().width)).toBe(17);

    const toggleLabel = view.$(
        '[data-testid="ac-pending"] [data-happy2-ui="approval-card-toggle-label"]',
    );
    /* "Details" is a fixed word label (ascenders, no descenders); vertical
     * centroid only, held to the 28px toggle center. */
    const toggleInk = await ink(toggleLabel, toggle, "toggle label");
    expect(Math.abs(toggleInk.y - 14), "toggle label optical y").toBeLessThanOrEqual(TOL);
    const chevron = view.$(
        '[data-testid="ac-pending"] [data-happy2-ui="approval-card-toggle"] [data-happy2-ui="icon"]',
    );
    const chevronInk = await ink(chevron, chevron, "toggle chevron");
    /* Down-pointing chevron: ink is a shallow V, horizontally symmetric. */
    expect(Math.abs(chevronInk.x - 7), "chevron optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(chevronInk.y - 7), "chevron optical y").toBeLessThanOrEqual(ICON_TOL);

    (approve.element as HTMLButtonElement).click();
    (deny.element as HTMLButtonElement).click();
    (toggle.element as HTMLButtonElement).click();
    expect(resolutions).toEqual(["approved", "denied"]);
    expect(expansions).toEqual([true]);

    /* ---- Expanded: impact + resource badges ------------------------------ */

    const expanded = view.$('[data-testid="ac-expanded"]');
    expect(expanded.bounds()).toEqual({ x: 16, y: 16, width: 680, height: 287 });
    expect(expanded.element.getAttribute("data-expanded")).toBe("");

    const details = view.$('[data-testid="ac-expanded"] [data-happy2-ui="approval-card-details"]');
    expect(details.bounds().y - expanded.bounds().y).toBe(145);

    const labels = Array.from(
        view.container.querySelectorAll(
            '[data-testid="ac-expanded"] [data-happy2-ui="approval-card-detail-label"]',
        ),
    );
    expect(labels.length).toBe(2);
    expect(labels.map((label) => label.textContent)).toEqual(["Impact", "Resources"]);
    const impactLabel = view.$(
        '[data-testid="ac-expanded"] [data-happy2-ui="approval-card-detail-label"]',
    );
    const impactLabelMetrics = impactLabel.textMetrics();
    expect(impactLabelMetrics.font.family).toBe("happy2 Mono, ui-monospace, monospace");
    expect(impactLabelMetrics.font.size).toBe(10);
    expect(impactLabelMetrics.font.letterSpacing).toBeCloseTo(0.8, 3);
    expect(impactLabel.computedStyles(["color", "text-transform"])).toEqual({
        color: "rgb(142, 142, 147)",
        "text-transform": "uppercase",
    });
    /* Uppercase mono micro-labels: cap-band ink, centered on their 14px line.
     * The labels carry an optical translate, so the ink is measured in
     * details-container coordinates against the untranslated line-box center
     * (a self-relative measurement would move with the correction and could
     * never detect drift). */
    for (const [index, element] of labels.entries()) {
        const label = new RenderedElement(element, view.container);
        const target = layoutTop(label, details) + 7;
        const labelInk = await ink(label, details, `detail label ${index}`);
        expect(
            Math.abs(labelInk.y - target),
            `detail label ${index} optical y`,
        ).toBeLessThanOrEqual(TOL);
    }

    const impact = view.$('[data-testid="ac-expanded"] [data-happy2-ui="approval-card-impact"]');
    expect(impact.textMetrics().font.size).toBe(13);
    expect(impact.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect((await impact.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const resources = Array.from(
        view.container.querySelectorAll(
            '[data-testid="ac-expanded"] [data-happy2-ui="approval-card-resources"] [data-happy2-ui="badge"]',
        ),
    );
    expect(resources.length).toBe(3);
    /* The badge row lays out on one 18px lane with 6px gaps; badge ink is
     * Badge's contract, but every badge must actually paint. */
    const rowBadges = resources.map((element) => new RenderedElement(element, view.container));
    for (const [index, rowBadge] of rowBadges.entries()) {
        expect(rowBadge.bounds().height, `resource badge ${index} height`).toBe(18);
        expect(rowBadge.bounds().y, `resource badge ${index} lane`).toBe(rowBadges[0]!.bounds().y);
        expect(
            (await rowBadge.visibleMetrics()).pixelCount,
            `resource badge ${index} pixelCount`,
        ).toBeGreaterThan(0);
    }
    expect(
        rowBadges[1]!.bounds().x - (rowBadges[0]!.bounds().x + rowBadges[0]!.bounds().width),
    ).toBe(6);
    expect(
        rowBadges[2]!.bounds().x - (rowBadges[1]!.bounds().x + rowBadges[1]!.bounds().width),
    ).toBe(6);
    expect(rowBadges[0]!.element.getAttribute("data-variant")).toBe("outline");

    /* Expanded toggle points up: chevron rotated 180deg, ink still centered. */
    const upChevron = view.$(
        '[data-testid="ac-expanded"] [data-happy2-ui="approval-card-toggle"] [data-happy2-ui="icon"]',
    );
    expect(upChevron.computedStyle("transform")).toBe("matrix(-1, 0, 0, -1, 0, 0)");
    const upChevronInk = await ink(upChevron, upChevron, "expanded chevron");
    expect(Math.abs(upChevronInk.x - 7), "expanded chevron optical x").toBeLessThanOrEqual(
        ICON_TOL,
    );
    expect(Math.abs(upChevronInk.y - 7), "expanded chevron optical y").toBeLessThanOrEqual(
        ICON_TOL,
    );
    expect(
        view
            .$('[data-testid="ac-expanded"] [data-happy2-ui="approval-card-toggle"]')
            .element.getAttribute("aria-expanded"),
    ).toBe("true");

    await view.screenshot("ApprovalCard.test");
});

it("holds resolved ApprovalCard banners, state lines, and optical centering", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <ApprovalCard
                data-testid="ac-approved"
                expanded={false}
                onExpandedChange={noop}
                onResolutionChange={noop}
                request={request}
                resolution="approved"
            />
        ),
        { width: 712, height: 260, padding: 16 },
    );
    view.render(
        () => (
            <ApprovalCard
                data-testid="ac-denied"
                expanded={false}
                onExpandedChange={noop}
                onResolutionChange={noop}
                request={request}
                resolution="denied"
            />
        ),
        { width: 712, height: 260, padding: 16 },
    );
    await view.ready();

    /* ---- Approved: mint banner + muted state line ----------------------- */

    const approvedCard = view.$('[data-testid="ac-approved"]');
    expect(approvedCard.bounds()).toEqual({ x: 16, y: 16, width: 680, height: 223 });
    /* Resolved cards drop the amber hairline. */
    expect(approvedCard.computedStyle("border-top-color")).toBe("rgb(234, 234, 234)");

    for (const id of ["ac-approved", "ac-denied"] as const) {
        const cardEl = view.$(`[data-testid="${id}"]`);
        const banner = view.$(`[data-testid="${id}"] [data-happy2-ui="approval-card-banner"]`);
        expect(banner.bounds().height).toBe(32);
        expect(banner.bounds().width).toBe(678);
        expect(banner.bounds().y - cardEl.bounds().y).toBe(1);

        /* The colored band is 31px of content over a 1px hairline divider;
         * its optical center is 15.5px from the banner top. */
        const bannerLabel = view.$(
            `[data-testid="${id}"] [data-happy2-ui="approval-card-banner-label"]`,
        );
        const bannerMetrics = bannerLabel.textMetrics();
        expect(bannerMetrics.text).toBe(id === "ac-approved" ? "Approved" : "Denied");
        expect(bannerMetrics.font.family).toBe("happy2 Mono, ui-monospace, monospace");
        expect(bannerMetrics.font.size).toBe(11);
        expect(bannerMetrics.font.weight).toBe("700");
        expect(layoutTop(bannerLabel, banner)).toBe(0); /* 31px line box */
        /* Uppercase mono banner text: cap-band ink, no descenders; rendered
         * uppercase, left-aligned in the strip — vertical centroid only. */
        const bannerInk = await ink(bannerLabel, banner, `${id} banner label`);
        expect(Math.abs(bannerInk.y - 15.5), `${id} banner label optical y`).toBeLessThanOrEqual(
            2.3,
        );

        /* check / close banner glyphs: diagonal strokes make the horizontal
         * ink content-shaped; vertical centroid on the 15.5px strip center. */
        const bannerIcon = view.$(
            `[data-testid="${id}"] [data-happy2-ui="approval-card-banner"] [data-happy2-ui="icon"]`,
        );
        const bannerIconInk = await ink(bannerIcon, banner, `${id} banner icon`);
        expect(Math.abs(bannerIconInk.y - 15.5), `${id} banner icon optical y`).toBeLessThanOrEqual(
            ICON_TOL,
        );

        /* Buttons collapse into a single muted state line. */
        expect(
            view.container.querySelector(`[data-testid="${id}"] [data-happy2-ui="button"]`),
        ).toBeNull();
        const state = view.$(`[data-testid="${id}"] [data-happy2-ui="approval-card-state"]`);
        expect(state.computedStyle("color")).toBe("rgb(142, 142, 147)");
        const stateLabel = view.$(
            `[data-testid="${id}"] [data-happy2-ui="approval-card-state-label"]`,
        );
        expect(stateLabel.textMetrics().text).toBe(
            id === "ac-approved"
                ? "Approved — Codex can proceed"
                : "Denied — Codex will hold this change",
        );
        expect(stateLabel.textMetrics().font.size).toBe(12);
        /* Sentence-case word run (descenders in "proceed"/"change"): vertical
         * centroid only, held to the 16px state-line center. */
        const stateInk = await ink(stateLabel, state, `${id} state label`);
        expect(Math.abs(stateInk.y - 8), `${id} state label optical y`).toBeLessThanOrEqual(TOL);
        const stateIcon = view.$(
            `[data-testid="${id}"] [data-happy2-ui="approval-card-state"] [data-happy2-ui="icon"]`,
        );
        const stateIconInk = await ink(stateIcon, state, `${id} state icon`);
        expect(Math.abs(stateIconInk.y - 8), `${id} state icon optical y`).toBeLessThanOrEqual(
            ICON_TOL,
        );
        /* Details stay reachable after resolution. */
        expect(
            view
                .$(`[data-testid="${id}"] [data-happy2-ui="approval-card-toggle"]`)
                .element.getAttribute("aria-expanded"),
        ).toBe("false");
    }

    /* Resolution-specific colors. */
    const banner = view.$('[data-testid="ac-approved"] [data-happy2-ui="approval-card-banner"]');
    expect(banner.computedStyles(["background-color", "border-bottom-width", "color"])).toEqual({
        "background-color": "rgb(248, 248, 248)",
        "border-bottom-width": "1px",
        color: "rgb(52, 199, 89)",
    });
    expect(
        view
            .$('[data-testid="ac-approved"] [data-happy2-ui="approval-card-chip"]')
            .computedStyles(["background-color", "color"]),
    ).toEqual({
        "background-color": "rgb(248, 248, 248)",
        color: "rgb(52, 199, 89)",
    });
    expect(
        view
            .$('[data-testid="ac-approved"] [data-happy2-ui="badge"]')
            .element.getAttribute("data-variant"),
    ).toBe("neutral");
    expect(
        view
            .$(
                '[data-testid="ac-approved"] [data-happy2-ui="approval-card-state"] [data-happy2-ui="icon"]',
            )
            .computedStyle("color"),
    ).toBe("rgb(52, 199, 89)");
    const deniedBanner = view.$(
        '[data-testid="ac-denied"] [data-happy2-ui="approval-card-banner"]',
    );
    expect(deniedBanner.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgb(255, 240, 240)",
        color: "rgb(255, 59, 48)",
    });
    expect(
        view
            .$('[data-testid="ac-denied"] [data-happy2-ui="approval-card-chip"]')
            .computedStyle("color"),
    ).toBe("rgb(255, 59, 48)");

    await view.screenshot("ApprovalCard.resolutions.test");
});

it("holds expanded resolved ApprovalCards and fluid widths", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <ApprovalCard
                data-testid="ac-approved-x"
                expanded
                onExpandedChange={noop}
                onResolutionChange={noop}
                request={request}
                resolution="approved"
            />
        ),
        { width: 712, height: 356, padding: 16 },
    );
    view.render(
        () => (
            <ApprovalCard
                data-testid="ac-denied-x"
                expanded
                onExpandedChange={noop}
                onResolutionChange={noop}
                request={request}
                resolution="denied"
            />
        ),
        { width: 712, height: 356, padding: 16 },
    );
    view.render(
        () => (
            <ApprovalCard
                data-testid="ac-narrow"
                expanded={false}
                onExpandedChange={noop}
                onResolutionChange={noop}
                request={longRequest}
                resolution="pending"
            />
        ),
        { width: 480, height: 240, padding: 16 },
    );
    view.render(
        () => (
            <ApprovalCard
                data-testid="ac-wide"
                expanded={false}
                onExpandedChange={noop}
                onResolutionChange={noop}
                request={request}
                resolution="pending"
            />
        ),
        { width: 760, height: 224, padding: 16 },
    );
    await view.ready();

    /* ---- Expanded + resolved: banner, details, and state line coexist ---- */

    for (const id of ["ac-approved-x", "ac-denied-x"] as const) {
        const cardEl = view.$(`[data-testid="${id}"]`);
        expect(cardEl.bounds()).toEqual({ x: 16, y: 16, width: 680, height: 319 });
        expect(cardEl.element.getAttribute("data-expanded")).toBe("");

        const banner = view.$(`[data-testid="${id}"] [data-happy2-ui="approval-card-banner"]`);
        const bannerLabel = view.$(
            `[data-testid="${id}"] [data-happy2-ui="approval-card-banner-label"]`,
        );
        const bannerInk = await ink(bannerLabel, banner, `${id} banner label`);
        expect(Math.abs(bannerInk.y - 15.5), `${id} banner label optical y`).toBeLessThanOrEqual(
            2.3,
        );

        const details = view.$(`[data-testid="${id}"] [data-happy2-ui="approval-card-details"]`);
        expect(details.bounds().y - cardEl.bounds().y).toBe(177); /* banner 32 + body 145 */
        const resources = Array.from(
            view.container.querySelectorAll(
                `[data-testid="${id}"] [data-happy2-ui="approval-card-resources"] [data-happy2-ui="badge"]`,
            ),
        );
        expect(resources.length).toBe(3);
        for (const [index, element] of resources.entries()) {
            const rowBadge = new RenderedElement(element, view.container);
            expect(
                (await rowBadge.visibleMetrics()).pixelCount,
                `${id} resource badge ${index} pixelCount`,
            ).toBeGreaterThan(0);
        }

        /* Shield chip keeps its optical center in the resolved treatments. */
        const chip = view.$(`[data-testid="${id}"] [data-happy2-ui="approval-card-chip"]`);
        const shield = view.$(
            `[data-testid="${id}"] [data-happy2-ui="approval-card-chip"] [data-happy2-ui="icon"]`,
        );
        const shieldInk = await ink(shield, chip, `${id} shield`);
        expect(Math.abs(shieldInk.x - 13), `${id} shield optical x`).toBeLessThanOrEqual(ICON_TOL);
        expect(Math.abs(shieldInk.y - 13), `${id} shield optical y`).toBeLessThanOrEqual(ICON_TOL);
    }

    /* ---- Fluid + clamped widths ------------------------------------------- */

    const narrow = view.$('[data-testid="ac-narrow"]');
    expect(narrow.bounds().width).toBe(448);
    const narrowAction = view.$(
        '[data-testid="ac-narrow"] [data-happy2-ui="approval-card-action"]',
    );
    expect(narrowAction.width()).toBe(414);
    /* The long mono action truncates inside the well instead of widening it. */
    const narrowActionText = view.$(
        '[data-testid="ac-narrow"] [data-happy2-ui="approval-card-action-text"]',
    );
    expect(narrowActionText.width()).toBe(392); /* well 414 - pad 20 - border 2 */
    expect(narrowActionText.computedStyles(["overflow-x", "text-overflow"])).toEqual({
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
    });
    /* Ellipsized mono run keeps the well's vertical optical center. */
    const narrowActionInk = await ink(narrowActionText, narrowAction, "narrow action text");
    expect(Math.abs(narrowActionInk.y - 16), "narrow action optical y").toBeLessThanOrEqual(TOL);
    expect(view.$('[data-testid="ac-narrow"] [data-happy2-ui="badge"]').textMetrics().text).toBe(
        "ESCALATION",
    );
    expect(view.$('[data-testid="ac-wide"]').bounds().width).toBe(680); /* max-width clamp */

    await view.screenshot("ApprovalCard.expanded.test");
});
