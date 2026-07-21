import "./styles.css";
import { expect, it } from "vitest";
import { Sidebar, type SidebarSection } from "./Sidebar";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * Optical tolerances. Every measured part must paint (pixelCount > 0) so a
 * clipped or blank capture can never pass. Ink centroids are asserted at
 * OPTICAL px on the relevant axes; after the engine-scoped corrections in
 * sidebar.css the measured drift is <= 0.4px wherever the content is
 * vertically symmetric (see the per-case notes where it is not).
 */
const OPTICAL = 0.75;

/*
 * Full realistic sidebar: unlabelled views section, labelled channel / agent /
 * direct sections covering every row kind in resting and unread states, short
 * and long labels, 1- and 2-char initials, 1/2/3-digit badge counts, both
 * agent statuses, meta trailing text, and presence. Geometry is hand-computed:
 * header 56, body pad 8, rows 32 with 2px gaps, 12px between sections, 24px
 * section heads, footer 56.
 */
const sections: SidebarSection[] = [
    {
        id: "views",
        items: [
            { badge: 12, icon: "inbox", id: "inbox", kind: "view", label: "Inbox", unread: true },
            { icon: "tasks", id: "my-issues", kind: "view", label: "My issues", meta: "7" },
            { icon: "spark", id: "agent-runs", kind: "view", label: "Agent runs", meta: "12" },
        ],
    },
    {
        action: { icon: "plus", label: "Add channel" },
        id: "channels",
        items: [
            { id: "launch-week", kind: "channel", label: "launch-week" },
            { badge: 4, id: "eng-core", kind: "channel", label: "eng-core", unread: true },
            { id: "design-crit", kind: "channel", label: "design-crit", unread: true },
        ],
        label: "Channels",
    },
    {
        id: "agents",
        items: [
            {
                id: "claude",
                initials: "CL",
                kind: "agent",
                label: "Claude",
                status: "ready",
                tone: "ember",
            },
            {
                id: "codex",
                initials: "CX",
                kind: "agent",
                label: "Codex",
                status: "working",
                tone: "mint",
            },
            {
                badge: 9,
                id: "scout",
                initials: "S",
                kind: "agent",
                label: "Scout",
                tone: "violet",
                unread: true,
            },
        ],
        label: "Agents",
    },
    {
        id: "direct",
        items: [
            {
                id: "maya",
                initials: "MJ",
                kind: "person",
                label: "Maya Johnson",
                online: true,
                tone: "rose",
            },
            { badge: 2, id: "jun", initials: "J", kind: "person", label: "Jun Park", unread: true },
            { id: "invite", kind: "action", label: "Invite teammates" },
            {
                badge: 3,
                icon: "bell",
                id: "requests",
                kind: "action",
                label: "Requests",
                unread: true,
            },
        ],
        label: "Direct",
    },
];

it("renders the Happy logo to the left of the product title", async () => {
    const view = createRenderer().render(
        () => (
            <Sidebar
                activeItemId=""
                brand
                data-testid="brand"
                onItemSelect={() => {}}
                sections={[]}
            />
        ),
        { width: 400, height: 240 },
    );
    await view.ready();

    const logo = view.$('[data-happy2-ui="sidebar-brand-logo"]');
    const logoImage = logo.element as HTMLImageElement;
    await logoImage.decode();
    expect(logo.bounds()).toEqual({ x: 16, y: 18, width: 20, height: 20 });
    expect(logo.computedStyles(["display", "height", "object-fit", "width"])).toEqual({
        display: "block",
        height: "20px",
        "object-fit": "contain",
        width: "20px",
    });
    expect(logoImage.naturalWidth).toBe(1024);
    expect(logoImage.getAttribute("alt")).toBe("");
    expect(logoImage.getAttribute("aria-hidden")).toBe("true");
    expect((await logo.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const title = view.$('[data-happy2-ui="sidebar-title"]');
    expect(title.bounds().x - (logo.bounds().x + logo.bounds().width)).toBe(5);
    expect(title.element.textContent).toBe("Happy 2");

    await view.screenshot("Sidebar.brand.test");
}, 120_000);

/* Ink centroid of `el`, in the coordinate space of its 32px row. */
async function rowInk(el: RenderedElement<Element>, row: RenderedElement<Element>) {
    const ink = await el.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);
    const b = el.bounds();
    const rb = row.bounds();
    return {
        x: b.x - rb.x + ink.center.x,
        y: b.y - rb.y + ink.center.y,
        ink,
    };
}

it("holds Sidebar geometry, row treatments, and optical alignment", async () => {
    const selected: string[] = [];
    const sectionActions: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <Sidebar
                activeItemId="my-issues"
                data-testid="full"
                footer={
                    <span
                        data-testid="footer-user"
                        style={{
                            color: "var(--happy2-text-secondary)",
                            fontSize: "13px",
                            lineHeight: "16px",
                        }}
                    >
                        Sasha K.
                    </span>
                }
                onCompose={() => {}}
                onItemSelect={(id) => selected.push(id)}
                onSectionAction={(id) => sectionActions.push(id)}
                sections={sections}
                subtitle="12 members · 3 agents"
                title="Acme Studio"
            />
        ),
        { width: 400, height: 744 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", height: "100%", width: "100%" }}>
                <Sidebar
                    activeItemId="row-1"
                    data-testid="overflow"
                    onItemSelect={() => {}}
                    sections={[
                        {
                            id: "flood",
                            items: Array.from({ length: 12 }, (_, index) => ({
                                icon: "doc" as const,
                                id: `row-${index}`,
                                kind: "view" as const,
                                label: `Saved view ${index}`,
                            })),
                        },
                    ]}
                    title="Overflow"
                />
            </div>
        ),
        { width: 400, height: 240 },
    );
    await view.ready();

    /* ---- Root contract ------------------------------------------------ */

    const root = view.$('[data-testid="full"]');
    expect(root.element.tagName).toBe("NAV");
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 360, height: 744 });
    expect(
        root.computedStyles([
            "background-color",
            "border-right-width",
            "box-sizing",
            "display",
            "flex-direction",
            "overflow-x",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-right-width": "0px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "overflow-x": "hidden",
        width: "360px",
    });

    /* ---- Header --------------------------------------------------------- */

    const header = view.$('[data-testid="full"] [data-happy2-ui="sidebar-header"]');
    expect(header.bounds()).toEqual({ x: 0, y: 0, width: 360, height: 56 });
    expect(header.computedStyles(["padding-left", "padding-right"])).toEqual({
        "padding-left": "16px",
        "padding-right": "16px",
    });

    const title = view.$('[data-testid="full"] [data-happy2-ui="sidebar-title"]');
    expect(title.bounds().x).toBe(16);
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.text).toBe("Acme Studio");
    expect(titleMetrics.font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    expect(titleMetrics.font.size).toBe(15);
    expect(titleMetrics.font.weight).toBe("800");
    expect(titleMetrics.font.lineHeight).toBe(20);
    expect(titleMetrics.font.letterSpacing).toBeCloseTo(-0.15, 3);
    expect(title.computedStyle("color")).toBe("rgb(0, 0, 0)");

    /*
     * Heading block (title + subtitle ink together) is optically centered in
     * the 56px header. The stack is box-symmetric (11px above and below) and
     * the painted centroid lands on the header midline.
     */
    const heading = view.$('[data-testid="full"] [data-happy2-ui="sidebar-heading"]');
    expect(heading.offsets().top).toBe(11);
    expect(heading.offsets().bottom).toBe(11);
    const headingInk = await heading.visibleMetrics();
    expect(headingInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(heading.bounds().y - header.bounds().y + headingInk.center.y - 28),
        "heading ink vs header center",
    ).toBeLessThanOrEqual(OPTICAL);

    /* Chevron ink rides the title's optical midline (measured <= 0.1 drift). */
    const titleInk = await title.visibleMetrics();
    expect(titleInk.pixelCount).toBeGreaterThan(0);
    const chevron = view.$('[data-testid="full"] .happy2-sidebar__title-chevron');
    expect(chevron.bounds().width).toBe(14);
    expect(chevron.computedStyle("color")).toBe("rgb(142, 142, 147)");
    const chevronInk = await chevron.visibleMetrics();
    expect(chevronInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(chevron.bounds().y + chevronInk.center.y - (title.bounds().y + titleInk.center.y)),
        "chevron ink vs title ink",
    ).toBeLessThanOrEqual(OPTICAL);

    const subtitle = view.$('[data-testid="full"] [data-happy2-ui="sidebar-subtitle"]');
    expect(subtitle.textMetrics().font.size).toBe(11);
    expect(subtitle.textMetrics().font.lineHeight).toBe(14);
    expect(subtitle.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect((await subtitle.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const compose = view.$('[data-testid="full"] .happy2-sidebar__compose');
    expect(compose.element.tagName).toBe("BUTTON");
    expect(compose.textMetrics().text).toContain("New chat");
    expect(compose.bounds().width).toBe(344);
    expect(compose.bounds().height).toBe(36);
    expect(compose.bounds().x).toBe(8);
    expect(compose.bounds().y).toBe(64);
    expect((await compose.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Body and section rhythm ---------------------------------------- */

    const body = view.$('[data-testid="full"] [data-happy2-ui="sidebar-body"]');
    expect(body.bounds().y).toBe(56);
    /* Scrollport edge-to-edge; the inner content wrapper owns the 8px inset. */
    expect(
        body.computedStyles(["overflow-y", "padding-left", "padding-right", "padding-top"]),
    ).toEqual({
        "overflow-y": "auto",
        "padding-left": "0px",
        "padding-right": "0px",
        "padding-top": "0px",
    });
    expect(
        view
            .$('[data-testid="full"] [data-happy2-ui="sidebar-body-content"]')
            .computedStyles(["padding-left", "padding-right", "padding-top"]),
    ).toEqual({
        "padding-left": "8px",
        "padding-right": "8px",
        "padding-top": "8px",
    });

    const row = (id: string) => view.$(`[data-testid="full"] [data-item-id="${id}"]`);
    /* 32px rows on the grid: gaps 2, sections 12 apart, heads 24. */
    expect(row("inbox").bounds()).toEqual({ x: 8, y: 108, width: 344, height: 32 });
    expect(row("my-issues").bounds().y).toBe(142);
    expect(row("agent-runs").bounds().y).toBe(176);
    expect(row("launch-week").bounds().y).toBe(246);
    expect(row("eng-core").bounds().y).toBe(280);
    expect(row("design-crit").bounds().y).toBe(314);
    expect(row("claude").bounds().y).toBe(384);
    expect(row("codex").bounds().y).toBe(418);
    expect(row("scout").bounds().y).toBe(452);
    expect(row("maya").bounds().y).toBe(522);
    expect(row("jun").bounds().y).toBe(556);
    expect(row("invite").bounds().y).toBe(590);
    expect(row("requests").bounds().y).toBe(624);

    const head = view.$(
        '[data-testid="full"] [data-section-id="channels"] [data-happy2-ui="sidebar-section-head"]',
    );
    expect(head.bounds().height).toBe(24);
    expect(head.bounds().y).toBe(220);
    const headLabel = view.$(
        '[data-testid="full"] [data-section-id="channels"] [data-happy2-ui="sidebar-section-label"]',
    );
    const headMetrics = headLabel.textMetrics();
    expect(headMetrics.font.family).toBe("happy2 Mono, ui-monospace, monospace");
    expect(headMetrics.font.size).toBe(11);
    expect(headMetrics.font.weight).toBe("700");
    expect(headMetrics.font.lineHeight).toBe(24);
    expect(headMetrics.font.letterSpacing).toBeCloseTo(0.88, 3);
    expect(headLabel.computedStyles(["color", "text-transform"])).toEqual({
        color: "rgb(142, 142, 147)",
        "text-transform": "uppercase",
    });

    /*
     * Section-label mono baselines: uppercase ink is optically centered in the
     * 24px head in every engine (measured drift <= 0.26, engine-identical).
     * Vertical-only: the labels are left-aligned words, so the horizontal
     * centroid is content, not alignment.
     */
    for (const sid of ["channels", "agents", "direct"] as const) {
        const label = view.$(
            `[data-testid="full"] [data-section-id="${sid}"] [data-happy2-ui="sidebar-section-label"]`,
        );
        const sectionHead = view.$(
            `[data-testid="full"] [data-section-id="${sid}"] [data-happy2-ui="sidebar-section-head"]`,
        );
        const ink = await label.visibleMetrics();
        expect(ink.pixelCount, `${sid} section label ink`).toBeGreaterThan(0);
        expect(
            Math.abs(label.bounds().y - sectionHead.bounds().y + ink.center.y - 12),
            `${sid} section label optical y`,
        ).toBeLessThanOrEqual(OPTICAL);
    }

    /* Section action is a hover affordance: present, hidden at rest. */
    const sectionAction = view.$(
        '[data-testid="full"] [data-section-id="channels"] [data-happy2-ui="sidebar-section-action"]',
    );
    expect(sectionAction.element.getAttribute("aria-label")).toBe("Add channel");
    expect(sectionAction.computedStyle("opacity")).toBe("0");
    expect(sectionAction.bounds().width).toBe(18);

    /* ---- Row states ------------------------------------------------------ */

    const active = row("my-issues");
    expect(active.element.getAttribute("aria-current")).toBe("page");
    expect(
        active.computedStyles(["background-color", "border-radius", "color", "padding-left"]),
    ).toEqual({
        "background-color": "rgb(240, 240, 242)",
        "border-radius": "6px",
        color: "rgb(0, 0, 0)",
        "padding-left": "10px",
    });
    const activeLabel = view.$(
        '[data-testid="full"] [data-item-id="my-issues"] [data-happy2-ui="sidebar-item-label"]',
    );
    expect(activeLabel.textMetrics().font.weight).toBe("600");

    const inactive = row("launch-week");
    expect(inactive.element.getAttribute("aria-current")).toBeNull();
    expect(inactive.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgb(142, 142, 147)",
    });
    const inactiveLabel = view.$(
        '[data-testid="full"] [data-item-id="launch-week"] [data-happy2-ui="sidebar-item-label"]',
    );
    expect(inactiveLabel.textMetrics().font.size).toBe(13);
    expect(inactiveLabel.textMetrics().font.weight).toBe("500");
    expect(inactiveLabel.textMetrics().font.lineHeight).toBe(16);

    /* Unread: bright 700 label + accent CountBadge on the right. */
    const unread = row("eng-core");
    expect(unread.element.hasAttribute("data-unread")).toBe(true);
    const unreadLabel = view.$(
        '[data-testid="full"] [data-item-id="eng-core"] [data-happy2-ui="sidebar-item-label"]',
    );
    expect(unreadLabel.computedStyles(["color", "font-weight"])).toEqual({
        color: "rgb(0, 0, 0)",
        "font-weight": "700",
    });
    expect(
        view.container.querySelector(
            '[data-item-id="design-crit"] [data-happy2-ui="sidebar-item-unread"]',
        ),
    ).not.toBeNull();
    expect(
        view.container.querySelector('[data-item-id="design-crit"] [data-happy2-ui="count-badge"]'),
    ).toBeNull();

    /* All row labels share one real DOM baseline. Their alpha centroids are
     * content-shaped (eng-core is lowercase and descender-heavy), so a
     * universal centroid-to-row-center assertion would be false typography. */
    let sharedRowBaseline: number | undefined;
    for (const id of [
        "inbox",
        "my-issues",
        "agent-runs",
        "launch-week",
        "eng-core",
        "design-crit",
        "claude",
        "codex",
        "scout",
        "maya",
        "jun",
        "invite",
        "requests",
    ] as const) {
        const label = view.$(
            `[data-testid="full"] [data-item-id="${id}"] [data-happy2-ui="sidebar-item-label"]`,
        );
        const metrics = label.textMetrics();
        const baseline = metrics.baseline.fromSurfaceTop - row(id).bounds().y;
        sharedRowBaseline ??= baseline;
        expect(
            Math.abs(baseline - sharedRowBaseline),
            `${id} shared row-label baseline`,
        ).toBeLessThanOrEqual(0.001);
        expect((await label.visibleMetrics()).pixelCount, `${id} label ink`).toBeGreaterThan(0);
    }

    /*
     * Leading glyph lane: 16px icon (view / channel / action kinds) optically
     * centered in the 20px lane that starts at the 10px row padding — lane
     * center is (20, 16) in row coordinates. Both axes (measured <= 0.23).
     */
    const leading = (id: string) =>
        view.$(
            `[data-testid="full"] [data-item-id="${id}"] [data-happy2-ui="sidebar-item-leading"]`,
        );
    for (const id of [
        "inbox",
        "my-issues",
        "agent-runs",
        "launch-week",
        "eng-core",
        "invite",
        "requests",
    ] as const) {
        const lane = leading(id);
        expect(lane.bounds().width, `${id} leading lane`).toBe(20);
        const centroid = await rowInk(lane, row(id));
        expect(Math.abs(centroid.x - 20), `${id} leading optical x`).toBeLessThanOrEqual(OPTICAL);
        expect(Math.abs(centroid.y - 16), `${id} leading optical y`).toBeLessThanOrEqual(OPTICAL);
    }
    expect(leading("eng-core").computedStyle("color")).toBe("rgb(142, 142, 147)");

    /* Person row: xs circle avatar with presence. */
    const personAvatar = view.$(
        '[data-testid="full"] [data-item-id="maya"] [data-happy2-ui="avatar"]',
    );
    expect(personAvatar.bounds().width).toBe(20);
    expect(personAvatar.bounds().height).toBe(20);
    expect(personAvatar.computedStyle("border-radius")).toBe("999px");
    view.$('[data-testid="full"] [data-item-id="maya"] [data-happy2-ui="avatar-presence"]');
    /*
     * Presence dot pulls the ink centroid toward the bottom-right corner by
     * design, so maya's leading lane only gets the paint sanity check; jun
     * (person, no presence) asserts the symmetric avatar centroid instead.
     */
    expect((await leading("maya").visibleMetrics()).pixelCount).toBeGreaterThan(0);
    for (const id of ["jun", "claude"] as const) {
        const centroid = await rowInk(leading(id), row(id));
        expect(Math.abs(centroid.x - 20), `${id} avatar optical x`).toBeLessThanOrEqual(OPTICAL);
        expect(Math.abs(centroid.y - 16), `${id} avatar optical y`).toBeLessThanOrEqual(OPTICAL);
    }

    /* Agent rows: xs rounded-square avatar + status treatments. */
    const agentAvatar = view.$(
        '[data-testid="full"] [data-item-id="claude"] [data-happy2-ui="avatar"]',
    );
    expect(agentAvatar.computedStyle("border-radius")).toBe("6px");
    const readyDot = view.$(
        '[data-testid="full"] [data-item-id="claude"] [data-happy2-ui="sidebar-item-status"]',
    );
    expect(readyDot.bounds().width).toBe(8);
    expect(readyDot.bounds().height).toBe(8);
    expect(readyDot.computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(52, 199, 89)",
        "border-radius": "999px",
    });
    /* Status dot: symmetric disc dead-centered on the row midline. */
    expect(readyDot.offsets().right).toBe(11);
    const readyInk = await rowInk(readyDot, row("claude"));
    expect(Math.abs(readyInk.y - 16), "ready dot optical y").toBeLessThanOrEqual(OPTICAL);
    expect(
        Math.abs(readyInk.ink.center.x - readyDot.bounds().width / 2),
        "ready dot optical x",
    ).toBeLessThanOrEqual(OPTICAL);

    const workingDot = view.$(
        '[data-testid="full"] [data-item-id="codex"] [data-happy2-ui="sidebar-item-status"]',
    );
    expect(workingDot.computedStyle("background-color")).toBe("rgb(255, 149, 0)");
    expect(workingDot.offsets().right).toBe(11);
    const workingDotInk = await rowInk(workingDot, row("codex"));
    expect(Math.abs(workingDotInk.y - 16), "working dot optical y").toBeLessThanOrEqual(OPTICAL);

    const workingLabel = view.$(
        '[data-testid="full"] [data-item-id="codex"] [data-happy2-ui="sidebar-item-working"]',
    );
    expect(workingLabel.element.textContent).toBe("working");
    expect(workingLabel.textMetrics().font.family).toBe("happy2 Mono, ui-monospace, monospace");
    expect(workingLabel.textMetrics().font.size).toBe(11);
    expect(workingLabel.computedStyle("color")).toBe("rgb(142, 142, 147)");
    /*
     * "working" pulse mark: 11px mono ink on the row midline (measured 0.15
     * Blink/Gecko, -0.07 WebKit). Vertical-only: the lowercase word's
     * horizontal centroid is content.
     */
    const workingInk = await rowInk(workingLabel, row("codex"));
    expect(Math.abs(workingInk.y - 16), "working mark optical y").toBeLessThanOrEqual(OPTICAL);

    /* ---- Trailing lane: badge and meta alignment -------------------------- */

    /* Meta: 11px muted, right-aligned in the badge lane, 10px off the edge. */
    const meta = (id: string) =>
        view.$(`[data-testid="full"] [data-item-id="${id}"] [data-happy2-ui="sidebar-item-meta"]`);
    expect(meta("my-issues").textMetrics().font.size).toBe(11);
    expect(meta("my-issues").computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(meta("my-issues").offsets().right).toBe(10);
    expect(meta("agent-runs").offsets().right).toBe(10);
    /* Two-digit meta "12": near-symmetric digit pair on the row midline. */
    const meta12 = await rowInk(meta("agent-runs"), row("agent-runs"));
    expect(Math.abs(meta12.y - 16), "meta 12 optical y").toBeLessThanOrEqual(OPTICAL);
    /*
     * Single "7" is a top-heavy lining figure: its centroid sits ~0.9px above
     * true center identically in Blink, Gecko, and WebKit (content ink bias,
     * not engine drift). The band pins that engine agreement.
     */
    const meta7 = await rowInk(meta("my-issues"), row("my-issues"));
    expect(meta7.y - 16, "meta 7 optical band").toBeGreaterThanOrEqual(-1.4);
    expect(meta7.y - 16, "meta 7 optical band").toBeLessThanOrEqual(-0.4);

    /* CountBadge trailing lane: 18px pill, 10px off the row edge, centered
     * vertically, across one- and two-digit counts and every row kind. */
    const badgeCases = [
        ["inbox", "12"],
        ["eng-core", "4"],
        ["scout", "9"],
        ["jun", "2"],
        ["requests", "3"],
    ] as const;
    for (const [id, count] of badgeCases) {
        const badge = view.$(
            `[data-testid="full"] [data-item-id="${id}"] [data-happy2-ui="count-badge"]`,
        );
        expect(badge.element.textContent, `${id} badge count`).toBe(count);
        expect(badge.bounds().height, `${id} badge height`).toBe(18);
        expect(badge.offsets().right, `${id} badge trailing offset`).toBe(10);
        expect(badge.offsets().top, `${id} badge top offset`).toBe(7);
        expect(badge.offsets().bottom, `${id} badge bottom offset`).toBe(7);
    }
    const unreadBadge = view.$(
        '[data-testid="full"] [data-item-id="eng-core"] [data-happy2-ui="count-badge"]',
    );
    expect(unreadBadge.computedStyle("background-color")).toBe("rgb(0, 122, 255)");
    expect((await unreadBadge.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* Action row: muted plus row. */
    expect(row("invite").computedStyle("color")).toBe("rgb(142, 142, 147)");

    /* ---- Footer ---------------------------------------------------------- */

    const footer = view.$('[data-testid="full"] [data-happy2-ui="sidebar-footer"]');
    expect(footer.bounds().height).toBe(56);
    expect(footer.offsets().bottom).toBe(0);
    expect(footer.computedStyles(["border-top-color", "border-top-width"])).toEqual({
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
    });
    /*
     * The footer is a free slot: the component centers the slot's line box in
     * the 56px lane (box-symmetric top/bottom) and the ink must paint. The
     * fixture text "Sasha K." carries a baseline period, so its centroid sits
     * ~1.1px low of center identically in all three engines — the band pins
     * that engine agreement without forcing consumer content bias to zero.
     */
    const footerUser = view.$('[data-testid="footer-user"]');
    /* Inline text rect hangs 1px below exact center from the baseline strut. */
    expect(Math.abs(footerUser.offsets().top - footerUser.offsets().bottom)).toBeLessThanOrEqual(1);
    const footerInk = await footerUser.visibleMetrics();
    expect(footerInk.pixelCount).toBeGreaterThan(0);
    const footerDy = footerUser.bounds().y - footer.bounds().y + footerInk.center.y - 28;
    expect(footerDy, "footer ink optical band").toBeGreaterThanOrEqual(0.6);
    expect(footerDy, "footer ink optical band").toBeLessThanOrEqual(1.6);

    /* ---- Interaction ------------------------------------------------------ */

    (row("codex").element as HTMLButtonElement).click();
    expect(selected).toEqual(["codex"]);
    (sectionAction.element as HTMLButtonElement).click();
    expect(sectionActions).toEqual(["channels"]);

    /* ---- Constrained sidebar: fixed width, scrolling body, no footer. ----- */

    const overflow = view.$('[data-testid="overflow"]');
    expect(overflow.bounds().width).toBe(360);
    expect(overflow.bounds().height).toBe(240);
    const overflowBody = view.$('[data-testid="overflow"] [data-happy2-ui="sidebar-body"]');
    expect(overflowBody.element.scrollHeight).toBeGreaterThan(overflowBody.element.clientHeight);
    expect(
        view.container.querySelector('[data-testid="overflow"] [data-happy2-ui="sidebar-footer"]'),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="overflow"] [data-happy2-ui="sidebar-section-head"]',
        ),
    ).toBeNull();
    expect(view.$('[data-testid="overflow"] [data-item-id="row-0"]').bounds().y).toBe(64);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("Sidebar.test");
}, 120_000);

it("renders actionable guidance for empty sections", async () => {
    const compose: string[] = [];
    const sectionActions: string[] = [];
    const view = createRenderer().render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="empty"
                onCompose={() => compose.push("compose")}
                onItemSelect={() => {}}
                onSectionAction={(id) => sectionActions.push(id)}
                sections={[
                    {
                        action: { icon: "plus", label: "Add channel" },
                        empty: {
                            actionLabel: "Create a channel",
                            description: "Channels keep your team's work in one place.",
                            icon: "hash",
                            title: "No channels yet",
                        },
                        id: "channels",
                        items: [],
                        label: "Channels",
                    },
                    {
                        action: { icon: "edit", label: "New message" },
                        empty: {
                            actionLabel: "Start a conversation",
                            description: "Message a teammate to start a direct chat.",
                            icon: "chat",
                            title: "No direct messages",
                        },
                        id: "dms",
                        items: [],
                        label: "Direct messages",
                    },
                ]}
                title="Empty workspace"
            />
        ),
        { width: 320, height: 360 },
    );
    await view.ready();

    expect(
        document.querySelectorAll('[data-testid="empty"] [data-happy2-ui="sidebar-section-empty"]'),
    ).toHaveLength(2);
    const channelsEmpty = view.$(
        '[data-testid="empty"] [data-section-id="channels"] [data-happy2-ui="sidebar-section-empty"]',
    );
    expect(
        channelsEmpty.computedStyles([
            "align-items",
            "display",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "align-items": "center",
        display: "flex",
        "padding-bottom": "0px",
        "padding-left": "10px",
        "padding-right": "6px",
        "padding-top": "0px",
    });
    expect(channelsEmpty.element.textContent).toContain(
        "Channels keep your team's work in one place.",
    );
    expect(
        document.querySelector(
            '[data-testid="empty"] [data-section-id="channels"] [data-happy2-ui="sidebar-section-empty-media"]',
        ),
        "compact empty state has no decorative medallion",
    ).toBeNull();

    const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
            '[data-testid="empty"] [data-happy2-ui="sidebar-section-empty"] button',
        ),
    );
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
        "Create a channel",
        "Start a conversation",
    ]);
    buttons.forEach((button) => button.click());
    expect(sectionActions).toEqual(["channels", "dms"]);

    const composeButton = document.querySelector<HTMLButtonElement>(
        '[data-testid="empty"] .happy2-sidebar__compose',
    );
    expect(composeButton).not.toBeNull();
    composeButton!.click();
    expect(compose).toEqual(["compose"]);

    await view.screenshot("Sidebar.empty.test");
});

/*
 * Active-state optical coverage for the four kinds the main fixture does not
 * activate (it activates a view row). The active treatment bumps the label to
 * 600 weight, which redistributes ink; the centroid must stay on the row
 * midline in every engine.
 */
it("keeps active row labels of every kind on the row midline", async () => {
    const view = createRenderer();
    const cases = [
        {
            active: "launch-week",
            items: [
                { id: "launch-week", kind: "channel", label: "launch-week" },
                { id: "eng-core", kind: "channel", label: "eng-core" },
            ],
        },
        {
            active: "claude",
            items: [
                {
                    id: "claude",
                    initials: "CL",
                    kind: "agent",
                    label: "Claude",
                    status: "ready",
                    tone: "ember",
                },
            ],
        },
        {
            active: "maya",
            items: [
                {
                    id: "maya",
                    initials: "MJ",
                    kind: "person",
                    label: "Maya Johnson",
                    online: true,
                    tone: "rose",
                },
            ],
        },
        {
            active: "invite",
            items: [{ id: "invite", kind: "action", label: "Invite teammates" }],
        },
    ] as const satisfies ReadonlyArray<{
        active: string;
        items: SidebarSection["items"];
    }>;

    for (const [index, testCase] of cases.entries()) {
        view.render(
            () => (
                <Sidebar
                    activeItemId={testCase.active}
                    data-testid={`state-${index}`}
                    onItemSelect={() => {}}
                    sections={[{ id: "s", items: [...testCase.items] }]}
                    title="States"
                />
            ),
            { width: 320, height: 138 },
        );
    }
    await view.ready();

    for (const [index, testCase] of cases.entries()) {
        const row = view.$(`[data-testid="state-${index}"] [data-item-id="${testCase.active}"]`);
        expect(row.element.getAttribute("aria-current")).toBe("page");
        expect(row.computedStyle("background-color")).toBe("rgb(240, 240, 242)");
        const label = view.$(
            `[data-testid="state-${index}"] [data-item-id="${testCase.active}"] [data-happy2-ui="sidebar-item-label"]`,
        );
        expect(label.textMetrics().font.weight).toBe("600");
        /* Vertical-only: word labels are horizontally asymmetric ink. */
        const centroid = await rowInk(label, row);
        expect(
            Math.abs(centroid.y - 16),
            `active ${testCase.active} label optical y`,
        ).toBeLessThanOrEqual(OPTICAL);
    }

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("Sidebar.states");
}, 120_000);

/* 8x8 patterned PNG (shared with the Avatar image test) — paints opaque ink in
   every engine so the row's forwarded photo is measurable. */
const FIXTURE_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==";

/*
 * A person or agent row with `imageUrl` paints the photo inside the xs avatar
 * box and drops the initials fallback; the leading lane and avatar geometry are
 * unchanged from the initials variant proven above.
 */
it("renders a photo avatar in the leading lane when a row supplies imageUrl", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="photo"
                onItemSelect={() => {}}
                sections={[
                    {
                        id: "people",
                        items: [
                            {
                                id: "maya",
                                imageUrl: FIXTURE_IMAGE,
                                initials: "MJ",
                                kind: "person",
                                label: "Maya Johnson",
                                online: true,
                                tone: "rose",
                            },
                            {
                                id: "scout",
                                imageUrl: FIXTURE_IMAGE,
                                initials: "SC",
                                kind: "agent",
                                label: "Scout",
                                tone: "violet",
                            },
                        ],
                    },
                ]}
                title="People"
            />
        ),
        { width: 320, height: 138 },
    );
    await view.ready();

    for (const [id, radius] of [
        ["maya", "999px"],
        ["scout", "6px"],
    ] as const) {
        const avatar = view.$(
            `[data-testid="photo"] [data-item-id="${id}"] [data-happy2-ui="avatar"]`,
        );
        expect(avatar.bounds().width, `${id} avatar width`).toBe(20);
        expect(avatar.bounds().height, `${id} avatar height`).toBe(20);
        const image = view.$(
            `[data-testid="photo"] [data-item-id="${id}"] [data-happy2-ui="avatar-image"]`,
        );
        expect(image.computedStyles(["border-radius", "object-fit"]), `${id} image`).toEqual({
            "border-radius": radius,
            "object-fit": "cover",
        });
        expect((await image.visibleMetrics()).pixelCount, `${id} image paints`).toBeGreaterThan(0);
        expect(
            view
                .$(`[data-testid="photo"] [data-item-id="${id}"]`)
                .element.querySelector('[data-happy2-ui="avatar-initials"]'),
            `${id} initials hidden`,
        ).toBeNull();
    }
}, 120_000);

/*
 * Child channels render directly under their parent, one 16px indent level
 * deeper, keeping their own stable `data-item-id`. Archived rows keep their
 * position and remain clickable but dim uniformly to 0.55 opacity so the state
 * reads distinctly from an ordinary resting (already secondary-grey) row.
 */
it("nests child channels under their parent and dims archived rows", async () => {
    const selected: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId="ios"
                data-testid="nested"
                onItemSelect={(id) => selected.push(id)}
                sections={[
                    {
                        id: "channels",
                        items: [
                            { id: "launch", kind: "channel", label: "launch-week" },
                            { depth: 1, id: "ios", kind: "channel", label: "ios-rollout" },
                            {
                                archived: true,
                                depth: 1,
                                id: "legacy",
                                kind: "channel",
                                label: "legacy-notes",
                            },
                            {
                                archived: true,
                                id: "fires",
                                kind: "channel",
                                label: "support-fires",
                            },
                        ],
                        label: "Channels",
                    },
                ]}
                title="Nesting"
            />
        ),
        { width: 360, height: 260 },
    );
    await view.ready();

    const row = (id: string) => view.$(`[data-testid="nested"] [data-item-id="${id}"]`);
    const leading = (id: string) =>
        view.$(
            `[data-testid="nested"] [data-item-id="${id}"] [data-happy2-ui="sidebar-item-leading"]`,
        );

    /* ---- Indentation --------------------------------------------------- */
    expect(row("launch").computedStyle("padding-left"), "parent padding").toBe("10px");
    expect(row("launch").element.getAttribute("data-depth"), "parent depth attr").toBeNull();
    expect(row("ios").computedStyle("padding-left"), "child padding").toBe("26px");
    expect(row("ios").element.getAttribute("data-depth"), "child depth attr").toBe("1");
    expect(row("legacy").computedStyle("padding-left"), "archived child padding").toBe("26px");
    /* The 16px indent shifts the child's leading lane exactly one level right. */
    expect(
        leading("ios").bounds().x - leading("launch").bounds().x,
        "child leading indent",
    ).toBeCloseTo(16, 1);

    /* ---- Archived dimming ---------------------------------------------- */
    expect(row("launch").computedStyle("opacity"), "resting opacity").toBe("1");
    expect(row("ios").computedStyle("opacity"), "active child opacity").toBe("1");
    expect(row("legacy").computedStyle("opacity"), "archived child opacity").toBe("0.55");
    expect(row("fires").computedStyle("opacity"), "archived top-level opacity").toBe("0.55");
    /* Every row still paints its label; dimming never blanks the capture. */
    for (const id of ["launch", "ios", "legacy", "fires"]) {
        const label = view.$(
            `[data-testid="nested"] [data-item-id="${id}"] [data-happy2-ui="sidebar-item-label"]`,
        );
        expect((await label.visibleMetrics()).pixelCount, `${id} label paints`).toBeGreaterThan(0);
    }

    /* ---- Order + stable identity + click ------------------------------- */
    const ordered = [
        ...view.container.querySelectorAll('[data-testid="nested"] [data-item-id]'),
    ].map((node) => node.getAttribute("data-item-id"));
    expect(ordered, "parent precedes its children").toEqual(["launch", "ios", "legacy", "fires"]);
    const archivedRow = row("fires").element as HTMLButtonElement;
    archivedRow.click();
    expect(selected, "archived rows stay clickable").toEqual(["fires"]);
    (row("legacy").element as HTMLButtonElement).click();
    expect(selected).toEqual(["fires", "legacy"]);

    await view.screenshot("Sidebar.nested");
}, 120_000);

/*
 * A channel row renders the hash glyph by default, but honours an explicit
 * `icon` for the channel kind so a private channel can paint the lock glyph
 * while staying a first-class `channel` row (same avatar-free leading lane and
 * nesting behaviour). Other kinds still ignore hash/lock.
 */
it("paints the lock glyph for a private channel row and hash for a shared one", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="icons"
                onItemSelect={() => {}}
                sections={[
                    {
                        id: "shared",
                        items: [{ id: "design", kind: "channel", label: "design" }],
                        label: "Shared",
                    },
                    {
                        id: "private",
                        items: [
                            { icon: "lock", id: "founders", kind: "channel", label: "founders" },
                        ],
                        label: "Private",
                    },
                ]}
                title="Channel glyphs"
            />
        ),
        { width: 360, height: 220 },
    );
    await view.ready();

    const glyph = (id: string) =>
        view
            .$(`[data-testid="icons"] [data-item-id="${id}"] [data-happy2-ui="icon"]`)
            .element.getAttribute("data-name");
    expect(glyph("design"), "shared channel keeps the hash glyph").toBe("hash");
    expect(glyph("founders"), "private channel paints the lock glyph").toBe("lock");
    expect(
        view.$(`[data-testid="icons"] [data-item-id="founders"]`).element.getAttribute("data-kind"),
        "private channel stays a channel row",
    ).toBe("channel");
});
