import "./styles.css";
import type { JSX } from "solid-js";
import { expect, it } from "vitest";
import { Button } from "./Button";
import { ChannelHeader, type ChannelMember } from "./ChannelHeader";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * The header is a 52px strip whose bottom hairline sits inside the box, so
 * the content lane is 51px tall and its center is 25.5px from the top.
 */
const LANE_CENTER = 25.5;

/* Fixtures sit on the app surface color the header is contracted against.
   Text parts inside the lane land at *.5 offsets (15.5/16.5/17.5); the extra
   half-pixel of top padding puts them on integer device rows so element
   captures never expand the clip and skew centroid measurements. */
function stage(testid: string, padding: number, children: JSX.Element) {
    return (
        <div
            data-testid={testid}
            style={{
                background: "#17161c",
                "box-sizing": "border-box",
                height: "100%",
                padding: `${padding + 0.5}px ${padding}px ${Math.max(0, padding - 0.5)}px`,
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}

const members: ChannelMember[] = [
    { initials: "MJ", tone: "amber" },
    { initials: "SK", tone: "mint" },
    { initials: "CX", tone: "ember", type: "agent" },
    { initials: "LP", tone: "ocean" },
];

function actions() {
    return (
        <>
            <Button aria-label="Notifications" icon="bell" iconOnly size="small" variant="ghost" />
            <Button aria-label="More" icon="more" iconOnly size="small" variant="ghost" />
        </>
    );
}

it("holds ChannelHeader geometry, colors, and optical alignment", { timeout: 90_000 }, async () => {
    /* Runs at the default 1600x1600 tester viewport: the Playwright window
       is provisioned larger (vite.config.ts contextOptions), so element
       captures are true 2x — CaptureSanity.test.tsx guards that invariant.
       Every fixture below fits fully inside the viewport, so nothing is
       ever clipped, and inkCenter() additionally rejects blank captures. */
    const view = createRenderer();

    view.render(
        () =>
            stage(
                "s-full",
                12,
                <ChannelHeader
                    actions={actions()}
                    agentCount={3}
                    memberCount={12}
                    members={members}
                    title="launch-week"
                    topic="Ship mobile v2 by Fri"
                />,
            ),
        { width: 760, height: 76 },
    );
    view.render(
        () =>
            stage(
                "s-wide",
                12,
                <ChannelHeader
                    actions={actions()}
                    agentCount={1}
                    memberCount={128}
                    members={members.slice(0, 1)}
                    title="eng-core"
                    topic="Runtime, infra, and the auth stack"
                />,
            ),
        { width: 1200, height: 76 },
    );
    view.render(
        () =>
            stage(
                "s-narrow",
                12,
                <ChannelHeader
                    agentCount={12}
                    memberCount={8}
                    members={members.slice(0, 2)}
                    title="support-fires"
                    topic="Escalations, refunds, and the weekly pager review that never seems to end"
                />,
            ),
        { width: 420, height: 76 },
    );
    view.render(() => stage("s-min", 12, <ChannelHeader icon="inbox" title="Inbox" />), {
        width: 480,
        height: 76,
    });
    view.render(
        () =>
            stage(
                "s-fluid",
                0,
                <ChannelHeader
                    icon="spark"
                    title="Agent runs"
                    topic="Every run across the workspace"
                />,
            ),
        { width: 640, height: 64 },
    );
    await view.ready();

    const header = (s: string) => view.$(`[data-testid="${s}"] [data-rigged-ui="channel-header"]`);
    const part = (s: string, name: string) =>
        view.$(`[data-testid="${s}"] [data-rigged-ui="channel-header-${name}"]`);

    /* Alpha-weighted ink centroid of `el`, relative to its header's top-left.
       Also guards that a clipped or blank capture can never pass again. */
    async function inkCenter(
        label: string,
        el: RenderedElement<Element>,
        head: RenderedElement<Element>,
    ) {
        const ink = await el.visibleMetrics();
        expect(ink.pixelCount, `${label} has painted pixels`).toBeGreaterThan(0);
        expect(ink.bounds.width, `${label} ink width`).toBeGreaterThan(0);
        expect(ink.bounds.height, `${label} ink height`).toBeGreaterThan(0);
        const b = el.bounds();
        const h = head.bounds();
        return {
            dx: ink.center.x - b.width / 2,
            dy: ink.center.y + (b.y - h.y) - LANE_CENTER,
            ink,
        };
    }

    /* ---- Root contract (s-full, 760px) --------------------------------- */

    const hFull = header("s-full");
    expect(hFull.element.tagName).toBe("HEADER");
    expect(hFull.bounds()).toEqual({ x: 12, y: 12.5, width: 736, height: 52 });
    expect(
        hFull.computedStyles([
            "align-items",
            "background-color",
            "border-bottom-color",
            "border-bottom-style",
            "border-bottom-width",
            "box-sizing",
            "color",
            "display",
            "height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(0, 0, 0, 0)",
        "border-bottom-color": "rgba(255, 255, 255, 0.07)",
        "border-bottom-style": "solid",
        "border-bottom-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        display: "flex",
        height: "52px",
        "padding-left": "16px",
        "padding-right": "16px",
    });

    /* ---- Left cluster: icon · title · dot · topic ----------------------- */

    const icon = part("s-full", "icon");
    expect(icon.bounds()).toEqual({ x: 28, y: 30, width: 16, height: 16 });
    expect(icon.computedStyle("color")).toBe("rgb(117, 112, 133)");
    /* The 16px icon box is lane-centered, so box center == lane center. */
    const iconInk = await inkCenter("hash icon", icon, hFull);
    expect(Math.abs(iconInk.dx), "hash icon optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(iconInk.dy), "hash icon optical y").toBeLessThanOrEqual(0.75);

    const title = part("s-full", "title");
    expect(title.element.textContent).toBe("launch-week");
    expect(title.bounds().x).toBe(52);
    expect(title.bounds().y).toBe(28);
    expect(title.bounds().height).toBe(20);
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.font.family).toBe("Rigged Figtree, system-ui, sans-serif");
    expect(titleMetrics.font.size).toBe(15);
    expect(titleMetrics.font.weight).toBe("700");
    expect(titleMetrics.font.lineHeight).toBe(20);
    expect(title.computedStyle("color")).toBe("rgb(237, 234, 242)");
    /* Word labels have asymmetric ink along x, so only the vertical centroid
       is asserted; horizontal truth is the 52px x-offset above. */
    const titleInk = await inkCenter("title launch-week", title, hFull);
    expect(Math.abs(titleInk.dy), "title launch-week optical y").toBeLessThanOrEqual(0.75);

    const dot = part("s-full", "dot");
    expect(dot.bounds().width).toBe(3);
    expect(dot.bounds().height).toBe(3);
    /* 3px separator dot rides the exact lane center. */
    expect(dot.bounds().y - hFull.bounds().y + 1.5).toBe(LANE_CENTER);
    expect(dot.bounds().x - (title.bounds().x + title.bounds().width)).toBeCloseTo(8, 1);
    expect(dot.computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(85, 81, 95)",
        "border-radius": "999px",
    });

    const topic = part("s-full", "topic");
    expect(topic.element.textContent).toBe("Ship mobile v2 by Fri");
    expect(topic.bounds().y - hFull.bounds().y).toBe(17.5);
    expect(topic.bounds().x - (dot.bounds().x + 3)).toBeCloseTo(8, 1);
    expect(topic.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "12px",
        "font-weight": "400",
        "line-height": "16px",
    });
    const topicTruncation = view.$(
        '[data-testid="s-full"] [data-rigged-ui="channel-header-topic"] .rigged-channel-header__topic-ink',
    );
    expect(topicTruncation.computedStyles(["overflow-x", "text-overflow", "white-space"])).toEqual({
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    /* Sentence topics are asymmetric along x; vertical centroid only. */
    const topicInk = await inkCenter("topic Ship-mobile", topic, hFull);
    expect(Math.abs(topicInk.dy), "topic optical y").toBeLessThanOrEqual(0.75);

    /* ---- Facepile: 3 of 4 members, -6px overlap, ringed ------------------ */

    const faces = view.container.querySelectorAll(
        '[data-testid="s-full"] .rigged-channel-header__face',
    );
    expect(faces.length).toBe(3);
    const face1 = view.$('[data-testid="s-full"] .rigged-channel-header__face:nth-of-type(1)');
    const face2 = view.$('[data-testid="s-full"] .rigged-channel-header__face:nth-of-type(2)');
    const face3 = view.$('[data-testid="s-full"] .rigged-channel-header__face:nth-of-type(3)');
    expect(face1.bounds().width).toBe(20);
    expect(face1.bounds().height).toBe(20);
    /* toBeCloseTo: subtracting fractional page offsets carries float dust
     * (13.999999999999943) when sibling fixtures shift the container. */
    expect(face2.bounds().x - face1.bounds().x).toBeCloseTo(14, 6);
    expect(face3.bounds().x - face2.bounds().x).toBeCloseTo(14, 6);
    expect(face1.bounds().y - hFull.bounds().y).toBe(15.5);
    const ring = face1.computedStyle("box-shadow");
    expect(ring).toContain("rgb(23, 22, 28)");
    expect(ring).toContain("0px 0px 0px 3px");
    /* Third face is the agent: rounded square, not a circle. */
    expect(face3.computedStyle("border-radius")).toBe("6px");
    expect(face1.computedStyle("border-radius")).toBe("999px");
    const facepile = part("s-full", "facepile");
    expect(facepile.bounds().width).toBe(48);
    /* The face discs paint opaque and edge-to-edge: the pile's visible ink
       must fill its 48x20 box exactly and center on the lane. */
    const pileInk = await inkCenter("facepile", facepile, hFull);
    expect(pileInk.ink.bounds).toEqual({ x: 0, y: 0, width: 48, height: 20 });
    expect(Math.abs(pileInk.dx), "facepile optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(pileInk.dy), "facepile optical y").toBeLessThanOrEqual(0.75);
    const faceInk = await inkCenter("face MJ", face1, hFull);
    expect(Math.abs(faceInk.dx), "face optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(faceInk.dy), "face optical y").toBeLessThanOrEqual(0.75);

    /* ---- Member count and agent chip ------------------------------------ */

    const count = part("s-full", "member-count");
    expect(count.element.textContent).toBe("12");
    expect(count.bounds().y - hFull.bounds().y).toBe(17.5);
    expect(count.bounds().x - (facepile.bounds().x + facepile.bounds().width)).toBeCloseTo(6, 1);
    expect(count.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "12px",
        "font-weight": "500",
        "line-height": "16px",
    });
    const countInk = await inkCenter("count 12", count, hFull);
    expect(Math.abs(countInk.dx), "count 12 optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(countInk.dy), "count 12 optical y").toBeLessThanOrEqual(0.75);

    const chip = view.$('[data-testid="s-full"] [data-rigged-ui="badge"]');
    expect(chip.element.getAttribute("data-variant")).toBe("accent");
    expect(chip.element.textContent).toBe("3 agents");
    expect(chip.bounds().height).toBe(18);
    /* The 18px chip box rides the lane center exactly: (51 - 18) / 2. */
    expect(chip.bounds().y - hFull.bounds().y).toBe(16.5);
    expect(chip.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(139, 124, 247, 0.15)",
        color: "rgb(168, 155, 255)",
    });
    expect(
        view.container.querySelectorAll(
            '[data-testid="s-full"] [data-rigged-ui="badge-icon"] [data-name="spark"]',
        ).length,
    ).toBe(1);
    expect(chip.bounds().x - (count.bounds().x + count.bounds().width)).toBeCloseTo(12, 1);
    /* The label's ink correction belongs to Badge (badge.css) and is asserted
       at <=0.75px in Badge.test.tsx; here the chip only has to keep the label
       line-box on the chip box and the paint within a lane-sane band. */
    const chipLabel = view.$('[data-testid="s-full"] [data-rigged-ui="badge-label"]');
    expect(chipLabel.bounds().height).toBe(18);
    /* Badge owns a per-engine translateY ink correction on its label, which
       shifts this rect by up to ~0.7px per engine; the ink-band assertion
       below holds the optical contract, so the box only keeps a sane lane. */
    expect(Math.abs(chipLabel.bounds().y - hFull.bounds().y - 16.5)).toBeLessThanOrEqual(0.75);
    const chipLabelInk = await inkCenter("chip label 3-agents", chipLabel, hFull);
    expect(Math.abs(chipLabelInk.dy), "chip label vertical band").toBeLessThanOrEqual(1.25);

    /* ---- Actions slot pinned to the right edge --------------------------- */

    const actionsSlot = part("s-full", "actions");
    expect(actionsSlot.bounds().x + actionsSlot.bounds().width).toBe(
        hFull.bounds().x + hFull.bounds().width - 16,
    );
    const actionButtons = view.container.querySelectorAll(
        '[data-testid="s-full"] [data-rigged-ui="channel-header-actions"] [data-rigged-ui="button"]',
    );
    expect(actionButtons.length).toBe(2);
    const firstAction = view.$(
        '[data-testid="s-full"] [data-rigged-ui="channel-header-actions"] [data-rigged-ui="button"]',
    );
    expect(firstAction.bounds().width).toBe(28);
    expect(firstAction.bounds().height).toBe(28);
    expect(actionsSlot.bounds().x - (chip.bounds().x + chip.bounds().width)).toBeCloseTo(12, 1);

    /* ---- Wide (1200px): singular chip, 3-digit count, 1-face pile -------- */

    const hWide = header("s-wide");
    expect(hWide.bounds()).toEqual({ x: 12, y: 12.5, width: 1176, height: 52 });
    const wideActions = part("s-wide", "actions");
    expect(wideActions.bounds().x + wideActions.bounds().width).toBe(
        hWide.bounds().x + hWide.bounds().width - 16,
    );

    const wideTitle = part("s-wide", "title");
    expect(wideTitle.element.textContent).toBe("eng-core");
    const wideTitleInk = await inkCenter("title eng-core", wideTitle, hWide);
    expect(Math.abs(wideTitleInk.dy), "title eng-core optical y").toBeLessThanOrEqual(0.75);

    const wideTopic = part("s-wide", "topic");
    const wideTopicText = wideTopic.element.querySelector(".rigged-channel-header__topic-ink")!;
    expect(wideTopicText.scrollWidth, "wide topic does not truncate").toBe(
        wideTopicText.clientWidth,
    );
    const wideTopicInk = await inkCenter("topic Runtime-infra", wideTopic, hWide);
    expect(Math.abs(wideTopicInk.dy), "topic Runtime-infra optical y").toBeLessThanOrEqual(0.75);

    const wideFaces = view.container.querySelectorAll(
        '[data-testid="s-wide"] .rigged-channel-header__face',
    );
    expect(wideFaces.length).toBe(1);
    const widePile = part("s-wide", "facepile");
    expect(widePile.bounds().width).toBe(20);
    expect(widePile.bounds().y - hWide.bounds().y).toBe(15.5);

    const wideCount = part("s-wide", "member-count");
    expect(wideCount.element.textContent).toBe("128");
    const wideCountInk = await inkCenter("count 128", wideCount, hWide);
    /* The counter has letter-spacing: normal, yet "128" measures dx
       +0.86..+1.34 across engines: '1' carries almost no ink on the left of
       its advance, so a 3-digit run's ink is inherently right-heavy. That is
       glyph-ink asymmetry, not a box bias — the line box is asserted centered
       instead, and only the vertical centroid is held to tolerance. */
    expect(wideCount.bounds().y - hWide.bounds().y).toBe(17.5);
    expect(wideCount.bounds().height).toBe(16);
    expect(Math.abs(wideCountInk.dy), "count 128 optical y").toBeLessThanOrEqual(0.75);

    const wideChip = view.$('[data-testid="s-wide"] [data-rigged-ui="badge"]');
    expect(wideChip.element.textContent).toBe("1 agent");
    expect(wideChip.bounds().y - hWide.bounds().y).toBe(16.5);
    const wideChipLabel = view.$('[data-testid="s-wide"] [data-rigged-ui="badge-label"]');
    const wideChipInk = await inkCenter("chip label 1-agent", wideChipLabel, hWide);
    expect(Math.abs(wideChipInk.dy), "chip label 1-agent vertical band").toBeLessThanOrEqual(1.25);

    /* ---- Narrow (420px): truncating topic, plural chip, 1-digit count ---- */

    const hNarrow = header("s-narrow");
    expect(hNarrow.bounds().height).toBe(52);
    const narrowTitle = part("s-narrow", "title");
    expect(narrowTitle.element.textContent).toBe("support-fires");
    const narrowTitleInk = await inkCenter("title support-fires", narrowTitle, hNarrow);
    expect(Math.abs(narrowTitleInk.dy), "title support-fires optical y").toBeLessThanOrEqual(0.75);

    const narrowTopic = part("s-narrow", "topic");
    const narrowTopicText = narrowTopic.element.querySelector(".rigged-channel-header__topic-ink")!;
    expect(narrowTopicText.scrollWidth, "narrow topic truncates with an ellipsis").toBeGreaterThan(
        narrowTopicText.clientWidth,
    );
    const narrowTopicInk = await inkCenter("topic truncated", narrowTopic, hNarrow);
    expect(Math.abs(narrowTopicInk.dy), "truncated topic optical y").toBeLessThanOrEqual(0.75);

    const narrowCount = part("s-narrow", "member-count");
    expect(narrowCount.element.textContent).toBe("8");
    const narrowCountInk = await inkCenter("count 8", narrowCount, hNarrow);
    expect(Math.abs(narrowCountInk.dx), "count 8 optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(narrowCountInk.dy), "count 8 optical y").toBeLessThanOrEqual(0.75);

    const narrowChip = view.$('[data-testid="s-narrow"] [data-rigged-ui="badge"]');
    expect(narrowChip.element.textContent).toBe("12 agents");
    const narrowChipLabel = view.$('[data-testid="s-narrow"] [data-rigged-ui="badge-label"]');
    const narrowChipInk = await inkCenter("chip label 12-agents", narrowChipLabel, hNarrow);
    expect(Math.abs(narrowChipInk.dy), "chip label 12-agents vertical band").toBeLessThanOrEqual(
        1.25,
    );

    expect(
        view.container.querySelectorAll('[data-testid="s-narrow"] .rigged-channel-header__face')
            .length,
    ).toBe(2);
    const narrowMeta = part("s-narrow", "meta");
    /* toBeCloseTo: sums of 3-decimal-rounded rect values carry 0.001 dust. */
    expect(narrowMeta.bounds().x + narrowMeta.bounds().width).toBeCloseTo(
        hNarrow.bounds().x + hNarrow.bounds().width - 16,
        2,
    );

    /* ---- Minimal: no topic and every right-side part absent -------------- */

    const hMin = header("s-min");
    expect(hMin.bounds()).toEqual({ x: 12, y: 12.5, width: 456, height: 52 });
    const minIcon = view.$(
        '[data-testid="s-min"] [data-rigged-ui="channel-header-icon"] [data-rigged-ui="icon"]',
    );
    expect(minIcon.element.getAttribute("data-name")).toBe("inbox");
    const minIconInk = await inkCenter("inbox icon", part("s-min", "icon"), hMin);
    expect(Math.abs(minIconInk.dx), "inbox icon optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(minIconInk.dy), "inbox icon optical y").toBeLessThanOrEqual(0.75);
    const minTitle = part("s-min", "title");
    expect(minTitle.element.textContent).toBe("Inbox");
    const minTitleInk = await inkCenter("title Inbox", minTitle, hMin);
    expect(Math.abs(minTitleInk.dy), "title Inbox optical y").toBeLessThanOrEqual(0.75);
    for (const name of ["dot", "topic", "facepile", "member-count", "actions"]) {
        expect(
            view.container.querySelectorAll(
                `[data-testid="s-min"] [data-rigged-ui="channel-header-${name}"]`,
            ).length,
            `minimal has no ${name}`,
        ).toBe(0);
    }
    expect(
        view.container.querySelectorAll('[data-testid="s-min"] [data-rigged-ui="badge"]').length,
    ).toBe(0);

    /* ---- Fluid: fills an unpadded container edge to edge ------------------ */

    const hFluid = header("s-fluid");
    expect(hFluid.bounds()).toEqual({ x: 0, y: 0.5, width: 640, height: 52 });
    const fluidIcon = view.$(
        '[data-testid="s-fluid"] [data-rigged-ui="channel-header-icon"] [data-rigged-ui="icon"]',
    );
    expect(fluidIcon.element.getAttribute("data-name")).toBe("spark");
    const fluidIconInk = await inkCenter("spark icon", part("s-fluid", "icon"), hFluid);
    expect(Math.abs(fluidIconInk.dx), "spark icon optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(fluidIconInk.dy), "spark icon optical y").toBeLessThanOrEqual(0.75);
    const fluidTitle = part("s-fluid", "title");
    const fluidTitleInk = await inkCenter("title Agent-runs", fluidTitle, hFluid);
    expect(Math.abs(fluidTitleInk.dy), "title Agent-runs optical y").toBeLessThanOrEqual(0.75);
    const fluidTopic = part("s-fluid", "topic");
    const fluidTopicInk = await inkCenter("topic Every-run", fluidTopic, hFluid);
    expect(Math.abs(fluidTopicInk.dy), "topic Every-run optical y").toBeLessThanOrEqual(0.75);

    /* Pixel measurements can scroll the page; reset before the capture. */
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("ChannelHeader.test");
});
