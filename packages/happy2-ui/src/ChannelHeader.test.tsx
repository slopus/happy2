import { type ReactNode } from "react";
import "./styles.css";
import { expect, it } from "vitest";
import { Button } from "./Button";
import { ChannelHeader } from "./ChannelHeader";
import type { MenuItem } from "./Menu";
import { createRenderer, type RenderedElement } from "./testing";
/*
 * The header is a 52px strip whose bottom hairline sits inside the box, so
 * the content lane is 51px tall and its center is 25.5px from the top.
 */
const LANE_CENTER = 25.5;
/* Fixtures sit on the app surface color the header is contracted against.
   The extra half-pixel of top padding puts *.5 offsets on integer device rows
   so element captures never expand the clip and skew centroid measurements. */
function stage(testid: string, padding: number, children: ReactNode) {
    return (
        <div
            data-testid={testid}
            style={{
                background: "#17161c",
                boxSizing: "border-box",
                height: "100%",
                padding: `${padding + 0.5}px ${padding}px ${Math.max(0, padding - 0.5)}px`,
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}
const menuItems: MenuItem[] = [
    { icon: "eye", id: "details", kind: "item", label: "View details" },
    { icon: "star", id: "star", kind: "item", label: "Star channel" },
    { kind: "separator" },
    { danger: true, icon: "close", id: "leave", kind: "item", label: "Leave channel" },
];
function actions() {
    return (
        <>
            <Button aria-label="Notifications" icon="bell" iconOnly size="small" variant="ghost" />
            <Button aria-label="Search" icon="search" iconOnly size="small" variant="ghost" />
        </>
    );
}
it("holds ChannelHeader geometry, colors, and optical alignment", { timeout: 90000 }, async () => {
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
                    menuItems={menuItems}
                    onMembersClick={() => {}}
                    onMenuSelect={() => {}}
                    onStarToggle={() => {}}
                    onTitleClick={() => {}}
                    starred
                    title="launch-week"
                    topic="Ship mobile v2 by Fri"
                />,
            ),
        { width: 760, height: 76 },
    );
    view.render(
        () =>
            stage(
                "s-narrow",
                12,
                <ChannelHeader
                    agentCount={12}
                    memberCount={8}
                    menuItems={menuItems}
                    onMembersClick={() => {}}
                    onMenuSelect={() => {}}
                    onStarToggle={() => {}}
                    onTitleClick={() => {}}
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
    await view.ready();
    const header = (s: string) => view.$(`[data-testid="${s}"] [data-happy2-ui="channel-header"]`);
    const part = (s: string, name: string) =>
        view.$(`[data-testid="${s}"] [data-happy2-ui="channel-header-${name}"]`);
    const count = (s: string, selector: string) =>
        view.container.querySelectorAll(`[data-testid="${s}"] ${selector}`).length;
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
    /* ---- Leading star toggle -------------------------------------------- */
    const star = part("s-full", "star");
    expect(star.element.tagName).toBe("BUTTON");
    expect(star.element.getAttribute("aria-pressed")).toBe("true");
    expect(star.element.hasAttribute("data-starred")).toBe(true);
    expect(star.bounds().width).toBe(28);
    expect(star.bounds().height).toBe(28);
    /* Starred → amber (--happy2-warning). */
    expect(star.computedStyle("color")).toBe("rgb(251, 191, 36)");
    const starIcon = view.$(
        '[data-testid="s-full"] [data-happy2-ui="channel-header-star"] [data-happy2-ui="icon"]',
    );
    expect(starIcon.element.getAttribute("data-name")).toBe("star");
    const starInk = await inkCenter("star icon", star, hFull);
    expect(Math.abs(starInk.dx), "star optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(starInk.dy), "star optical y").toBeLessThanOrEqual(0.75);
    /* ---- Lead is a button when onTitleClick is set: icon · title -------- */
    const lead = part("s-full", "lead");
    expect(lead.element.tagName).toBe("BUTTON");
    const icon = part("s-full", "icon");
    expect(icon.bounds().width).toBe(16);
    expect(icon.bounds().height).toBe(16);
    expect(icon.computedStyle("color")).toBe("rgb(117, 112, 133)");
    const iconInk = await inkCenter("hash icon", icon, hFull);
    expect(Math.abs(iconInk.dx), "hash icon optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(iconInk.dy), "hash icon optical y").toBeLessThanOrEqual(0.75);
    const title = part("s-full", "title");
    expect(title.element.textContent).toBe("launch-week");
    expect(title.bounds().height).toBe(20);
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    expect(titleMetrics.font.size).toBe(15);
    expect(titleMetrics.font.weight).toBe("700");
    expect(titleMetrics.font.lineHeight).toBe(20);
    expect(title.computedStyle("color")).toBe("rgb(237, 234, 242)");
    /* Word labels have asymmetric ink along x, so only the vertical centroid
       is asserted. */
    const titleInk = await inkCenter("title launch-week", title, hFull);
    expect(Math.abs(titleInk.dy), "title launch-week optical y").toBeLessThanOrEqual(0.75);
    const dot = part("s-full", "dot");
    expect(dot.bounds().width).toBe(3);
    expect(dot.bounds().height).toBe(3);
    expect(dot.bounds().y - hFull.bounds().y + 1.5).toBe(LANE_CENTER);
    expect(dot.computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(85, 81, 95)",
        "border-radius": "999px",
    });
    const topic = part("s-full", "topic");
    expect(topic.element.textContent).toBe("Ship mobile v2 by Fri");
    expect(topic.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "12px",
        "font-weight": "400",
        "line-height": "16px",
    });
    const topicInk = await inkCenter("topic Ship-mobile", topic, hFull);
    expect(Math.abs(topicInk.dy), "topic optical y").toBeLessThanOrEqual(0.75);
    /* ---- Member pill: users icon + count -------------------------------- */
    const members = part("s-full", "members");
    expect(members.element.tagName).toBe("BUTTON");
    expect(members.bounds().height).toBe(28);
    expect(members.element.getAttribute("aria-label")).toBe("12 members");
    const membersIcon = view.$(
        '[data-testid="s-full"] [data-happy2-ui="channel-header-members"] [data-happy2-ui="icon"]',
    );
    expect(membersIcon.element.getAttribute("data-name")).toBe("users");
    const memberCount = part("s-full", "member-count");
    expect(memberCount.element.textContent).toBe("12");
    expect(memberCount.computedStyles(["font-size", "font-weight"])).toEqual({
        "font-size": "13px",
        "font-weight": "600",
    });
    /* "12" is a 2-digit run: '1' carries almost no ink on the left of its
       advance, so a multi-digit run's ink is inherently right-heavy. That is
       glyph-ink asymmetry, not a box bias — only the vertical centroid is held
       to tolerance. */
    const memberInk = await inkCenter("count 12", memberCount, hFull);
    expect(Math.abs(memberInk.dy), "count 12 optical y").toBeLessThanOrEqual(0.75);
    /* ---- Agent chip ----------------------------------------------------- */
    const chip = view.$('[data-testid="s-full"] [data-happy2-ui="badge"]');
    expect(chip.element.getAttribute("data-variant")).toBe("accent");
    expect(chip.element.textContent).toBe("3 agents");
    expect(chip.bounds().height).toBe(18);
    expect(
        count("s-full", '[data-happy2-ui="badge-icon"] [data-name="spark"]'),
        "agent chip spark glyph",
    ).toBe(1);
    /* ---- Actions slot --------------------------------------------------- */
    expect(count("s-full", '[data-happy2-ui="channel-header-actions"]'), "actions slot").toBe(1);
    expect(
        count("s-full", '[data-happy2-ui="channel-header-actions"] [data-happy2-ui="button"]'),
    ).toBe(2);
    /* ---- Overflow menu: closed → open on click -------------------------- */
    const menuButton = view.$(
        '[data-testid="s-full"] [data-happy2-ui="channel-header-menu"] [data-happy2-ui="button"]',
    );
    expect(menuButton.element.getAttribute("aria-haspopup")).toBe("menu");
    expect(count("s-full", '[data-happy2-ui="channel-header-menu-popover"]'), "menu closed").toBe(
        0,
    );
    (menuButton.element as HTMLButtonElement).click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(count("s-full", '[data-happy2-ui="channel-header-menu-popover"]'), "menu open").toBe(1);
    expect(
        count(
            "s-full",
            '[data-happy2-ui="channel-header-menu-popover"] [data-happy2-ui="menu-item"]',
        ),
        "three actionable menu items",
    ).toBe(3);
    (menuButton.element as HTMLButtonElement).click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(
        count("s-full", '[data-happy2-ui="channel-header-menu-popover"]'),
        "menu re-closed",
    ).toBe(0);
    /* The whole meta cluster pins to the 16px right gutter. */
    const meta = part("s-full", "meta");
    expect(meta.bounds().x + meta.bounds().width).toBeCloseTo(
        hFull.bounds().x + hFull.bounds().width - 16,
        1,
    );
    /* ---- Narrow (420px): truncating topic, 1-digit count ---------------- */
    const hNarrow = header("s-narrow");
    expect(hNarrow.bounds().height).toBe(52);
    const narrowTopic = part("s-narrow", "topic");
    const narrowTopicText = narrowTopic.element.querySelector(".happy2-channel-header__topic-ink")!;
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
    /* ---- Minimal: title only, every optional part absent ---------------- */
    const hMin = header("s-min");
    expect(hMin.bounds()).toEqual({ x: 12, y: 12.5, width: 456, height: 52 });
    const minLead = part("s-min", "lead");
    /* No onTitleClick → the lead is a heading, not a button. */
    expect(minLead.element.tagName).toBe("H2");
    const minIcon = view.$(
        '[data-testid="s-min"] [data-happy2-ui="channel-header-icon"] [data-happy2-ui="icon"]',
    );
    expect(minIcon.element.getAttribute("data-name")).toBe("inbox");
    const minTitle = part("s-min", "title");
    expect(minTitle.element.textContent).toBe("Inbox");
    const minTitleInk = await inkCenter("title Inbox", minTitle, hMin);
    expect(Math.abs(minTitleInk.dy), "title Inbox optical y").toBeLessThanOrEqual(0.75);
    for (const name of ["star", "dot", "topic", "members", "actions", "menu"]) {
        expect(
            count("s-min", `[data-happy2-ui="channel-header-${name}"]`),
            `minimal has no ${name}`,
        ).toBe(0);
    }
    expect(count("s-min", '[data-happy2-ui="badge"]'), "minimal has no agent chip").toBe(0);
    /* Pixel measurements can scroll the page; reset before the capture. */
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("ChannelHeader.test");
});
