import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/thread-list.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/icon.css";
import { ThreadList, type ThreadItem } from "./ThreadList";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * ThreadList optical contract. Every measured part must paint (pixelCount > 0)
 * so a blank/clipped capture can never pass silently; text ink additionally
 * may not touch its own line box's top/bottom edge. The only fully symmetric
 * painted mark is a participant avatar disc (a pre-tuned Avatar primitive):
 * its alpha centroid is asserted at the tuned 0.4px, but ONLY on the isolated
 * single-avatar row — a stacked avatar is overlapped by the sibling behind it,
 * whose opaque gradient shows through the top avatar's transparent corners and
 * biases the centroid. Titles, snippets, timestamps and count runs are
 * asymmetric left/right-aligned word ink, so they are held to geometry,
 * baseline and paint (line-box position), never to a centroid.
 */
const fontFamily =
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const followed: ThreadItem[] = [
    {
        id: "launch",
        lastActivity: "2m",
        participants: [
            { initials: "MB", tone: "violet" },
            { initials: "AL", tone: "mint" },
            { initials: "GB", tone: "amber" },
        ],
        replyCount: 12,
        snippet: "Marco: pushed the final build to staging, ready for a look",
        subscribed: true,
        title: "Launch checklist for v4",
        unreadCount: 3,
    },
    {
        id: "design",
        lastActivity: "1h",
        participants: [
            { initials: "ND", tone: "rose" },
            { initials: "PK", tone: "ocean" },
        ],
        replyCount: 5,
        snippet: "Nadia: the truncation on this preview should ellipsize cleanly at every width",
        subscribed: true,
        title: "Design review — settings surface and every empty state everywhere",
    },
    {
        id: "infra",
        lastActivity: "3h",
        participants: [
            { initials: "JS", tone: "ember" },
            { initials: "KL", tone: "ocean" },
            { initials: "SR", tone: "violet" },
            { initials: "TT", tone: "mint" },
            { initials: "WU", tone: "amber" },
        ],
        replyCount: 128,
        snippet: "Moved the queue workers over; watching the backlog drain",
        subscribed: true,
        title: "Infra migration",
        unreadCount: 24,
    },
    {
        id: "muted",
        lastActivity: "1d",
        participants: [{ initials: "CC", tone: "slate" }],
        replyCount: 2,
        snippet: "Someone shared a cat gif again",
        subscribed: false,
        title: "Off-topic banter",
    },
];

/* Alpha-weighted ink of `el`, guaranteed to paint. */
async function ink(el: RenderedElement<Element>, label: string) {
    const metrics = await el.visibleMetrics();
    expect(metrics.pixelCount, `${label} paints no pixels`).toBeGreaterThan(0);
    return metrics;
}

/* Text ink must sit inside its own box on the vertical axis (never clipped). */
async function unclippedText(el: RenderedElement<Element>, label: string) {
    const metrics = await ink(el, label);
    const height = el.height();
    expect(metrics.bounds.y, `${label} ink clipped at top`).toBeGreaterThan(0);
    expect(metrics.bounds.y + metrics.bounds.height, `${label} ink clipped at bottom`).toBeLessThan(
        height,
    );
    return metrics;
}

it("holds ThreadList geometry, row anatomy, and optical alignment", async () => {
    const selected: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <ThreadList
                data-testid="list"
                onSelect={(id) => selected.push(id)}
                threads={followed}
            />
        ),
        { width: 480, height: 320, padding: 20 },
    );
    view.render(
        () => <ThreadList data-testid="empty" emptyLabel="No followed threads yet" threads={[]} />,
        { width: 480, height: 140, padding: 20 },
    );
    await view.ready();

    /* ---- Card contract ------------------------------------------------- */

    const root = view.$('[data-testid="list"]');
    expect(root.element.tagName).toBe("DIV");
    expect(root.element.getAttribute("role")).toBe("list");
    expect(root.bounds()).toEqual({ x: 20, y: 20, width: 440, height: 258 });
    expect(
        root.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "overflow-x",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "10px",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily,
        "overflow-x": "hidden",
        "overflow-y": "hidden",
    });

    /* ---- Row grid: four flush 64px rows inside the 1px border ----------- */

    const row = (id: string) => view.$(`[data-testid="list"] [data-thread-id="${id}"]`);
    expect(row("launch").bounds()).toEqual({ x: 21, y: 21, width: 438, height: 64 });
    expect(row("design").bounds().y).toBe(85);
    expect(row("infra").bounds().y).toBe(149);
    expect(row("muted").bounds().y).toBe(213);
    expect(row("launch").element.tagName).toBe("BUTTON");
    expect(row("launch").computedStyles(["align-items", "gap", "height", "padding"])).toEqual({
        "align-items": "center",
        gap: "12px",
        height: "64px",
        padding: "0px 16px",
    });

    /* ---- Stacked avatar lane ------------------------------------------- */

    const avatar = (id: string, nth: number) =>
        view.$(
            `[data-thread-id="${id}"] [data-happy2-ui="thread-list-avatars"] > :nth-child(${nth})`,
        );

    /* launch: three 28px discs at an 18px step, first mark painted on top. */
    for (let n = 1; n <= 3; n += 1) {
        const a = avatar("launch", n);
        expect(a.bounds().width, `launch avatar ${n} width`).toBe(28);
        expect(a.bounds().height, `launch avatar ${n} height`).toBe(28);
        expect(a.computedStyle("border-radius"), `launch avatar ${n} radius`).toBe("999px");
        expect(a.computedStyle("z-index"), `launch avatar ${n} z`).toBe(String(4 - n));
        const shadow = a.computedStyle("box-shadow");
        expect(shadow, `launch avatar ${n} ring color`).toContain("rgb(255, 255, 255)");
        expect(shadow, `launch avatar ${n} ring spread`).toContain("2px");
    }
    expect(avatar("launch", 2).bounds().x - avatar("launch", 1).bounds().x).toBe(18);
    expect(avatar("launch", 3).bounds().x - avatar("launch", 2).bounds().x).toBe(18);

    /* infra: five participants collapse to two discs + a "+3" overflow chip
     * that closes the lane on the same 18px step. */
    const infraA1 = avatar("infra", 1);
    const infraA2 = avatar("infra", 2);
    const more = view.$('[data-thread-id="infra"] [data-happy2-ui="thread-list-avatar-more"]');
    expect(infraA2.bounds().x - infraA1.bounds().x).toBe(18);
    expect(more.bounds().x - infraA2.bounds().x).toBe(18);
    expect(more.bounds()).toMatchObject({ width: 28, height: 28 });
    expect(more.element.textContent).toBe("+3");
    expect(more.computedStyle("background-color")).toBe("rgb(240, 240, 242)");
    await ink(more, "overflow chip");

    /* Isolated single avatar: symmetric disc centered in its 28px box. A
     * stacked avatar cannot be used here (sibling ink bleeds through its
     * corners); the muted row's lone disc has nothing behind it. */
    const soloAvatar = view.$('[data-thread-id="muted"] [data-happy2-ui="avatar"]');
    expect(soloAvatar.bounds()).toMatchObject({ width: 28, height: 28 });
    const soloInk = await ink(soloAvatar, "solo avatar");
    expect(Math.abs(soloInk.center.x - 14), "solo avatar centroid x").toBeLessThanOrEqual(0.4);
    expect(Math.abs(soloInk.center.y - 14), "solo avatar centroid y").toBeLessThanOrEqual(0.4);

    /* ---- Title + snippet typography ------------------------------------ */

    const part = (id: string, hook: string) =>
        view.$(`[data-thread-id="${id}"] [data-happy2-ui="${hook}"]`);

    const launchTitle = part("launch", "thread-list-title");
    expect(launchTitle.textMetrics()).toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            lineHeight: 18,
            size: 13,
            weight: "700",
        },
        text: "Launch checklist for v4",
    });
    expect(launchTitle.computedStyle("color")).toBe("rgb(0, 0, 0)");
    await unclippedText(launchTitle, "launch title");

    /* Read row: same face, 600 weight instead of 700. */
    const designTitle = part("design", "thread-list-title");
    expect(designTitle.textMetrics().font.weight).toBe("600");

    /* Truncation: the long read row ellipsizes both lines. */
    for (const hook of ["thread-list-title", "thread-list-snippet"] as const) {
        const el = part("design", hook).element as HTMLElement;
        expect(el.scrollWidth, `design ${hook} overflows`).toBeGreaterThan(el.clientWidth);
    }
    expect(designTitle.computedStyles(["overflow-x", "text-overflow", "white-space"])).toEqual({
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });

    const launchSnippet = part("launch", "thread-list-snippet");
    expect(launchSnippet.textMetrics().font).toMatchObject({
        lineHeight: 18,
        size: 12,
        weight: "400",
    });
    expect(launchSnippet.computedStyle("color")).toBe("rgb(142, 142, 147)");
    await unclippedText(launchSnippet, "launch snippet");

    /* Title and snippet share the text column's left edge. */
    expect(Math.abs(launchTitle.bounds().x - launchSnippet.bounds().x)).toBeLessThanOrEqual(0.5);

    /* ---- Timestamp: 11px muted, flush 16px off the row's right edge ----- */

    const rowRight = (id: string) => row(id).bounds().x + row(id).bounds().width;
    for (const id of ["launch", "design"] as const) {
        const time = part(id, "thread-list-time");
        expect(time.textMetrics().font.size, `${id} time size`).toBe(11);
        expect(time.computedStyle("color"), `${id} time color`).toBe("rgb(142, 142, 147)");
        const timeRight = time.bounds().x + time.bounds().width;
        expect(
            Math.abs(rowRight(id) - timeRight - 16),
            `${id} time right inset`,
        ).toBeLessThanOrEqual(0.5);
        await unclippedText(time, `${id} time`);
    }
    expect(part("launch", "thread-list-time").element.textContent).toBe("2m");

    /* ---- Reply-count pill ---------------------------------------------- */

    const replies = part("launch", "thread-list-replies");
    expect(replies.bounds().height).toBe(18);
    expect(replies.computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "999px",
    });
    const replyIcon = view.$(
        '[data-thread-id="launch"] [data-happy2-ui="thread-list-replies-icon"] svg',
    );
    expect(replyIcon.bounds()).toMatchObject({ width: 12, height: 12 });
    await ink(replyIcon, "reply icon");

    const replyCount = part("launch", "thread-list-reply-count");
    expect(replyCount.element.textContent).toBe("12");
    expect(replyCount.textMetrics().font).toMatchObject({
        family: "happy2 Mono, ui-monospace, monospace",
        size: 11,
        weight: "700",
    });
    expect(replyCount.computedStyle("color")).toBe("rgb(142, 142, 147)");
    await unclippedText(replyCount, "reply count");
    expect(part("infra", "thread-list-reply-count").element.textContent).toBe("128");

    /* ---- Unread badge: accent CountBadge, 16px off the right edge ------- */

    const badge = (id: string) => view.$(`[data-thread-id="${id}"] [data-happy2-ui="count-badge"]`);
    expect(badge("launch").element.textContent).toBe("3");
    expect(badge("launch").bounds().height).toBe(18);
    expect(badge("launch").computedStyle("background-color")).toBe("rgb(0, 122, 255)");
    await ink(badge("launch"), "unread badge");
    expect(badge("infra").element.textContent).toBe("24");
    /* Read rows carry no unread badge. */
    expect(
        view.container.querySelector('[data-thread-id="design"] [data-happy2-ui="count-badge"]'),
    ).toBeNull();

    /* Trailing lane (reply pill + badge) is flush 16px off the right edge,
     * and the pill and badge share the snippet line. */
    for (const id of ["launch", "design"] as const) {
        const trailing = part(id, "thread-list-trailing");
        const trailingRight = trailing.bounds().x + trailing.bounds().width;
        expect(
            Math.abs(rowRight(id) - trailingRight - 16),
            `${id} trailing right inset`,
        ).toBeLessThanOrEqual(0.5);
    }
    expect(
        Math.abs(part("launch", "thread-list-replies").bounds().y - badge("launch").bounds().y),
        "reply pill and unread badge share the line",
    ).toBeLessThanOrEqual(0.5);

    /* ---- Muted (unsubscribed) affordance ------------------------------- */

    expect(row("muted").element.getAttribute("data-subscribed")).toBe("false");
    expect(row("launch").element.hasAttribute("data-subscribed")).toBe(false);
    const follow = part("muted", "thread-list-follow");
    expect(follow.computedStyle("color")).toBe("rgb(142, 142, 147)");
    const followIcon = view.$('[data-thread-id="muted"] [data-happy2-ui="thread-list-follow"] svg');
    expect(followIcon.bounds()).toMatchObject({ width: 14, height: 14 });
    await ink(follow, "muted bell");
    /* Subscribed rows show no bell. */
    expect(
        view.container.querySelector(
            '[data-thread-id="launch"] [data-happy2-ui="thread-list-follow"]',
        ),
    ).toBeNull();

    /* ---- Empty slot ---------------------------------------------------- */

    const emptyRoot = view.$('[data-testid="empty"]');
    expect(emptyRoot.computedStyle("background-color")).toBe("rgb(255, 255, 255)");
    expect(emptyRoot.computedStyle("border-top-width")).toBe("1px");
    expect(
        view.container.querySelector('[data-testid="empty"] [data-happy2-ui="thread-list-item"]'),
    ).toBeNull();
    const empty = view.$('[data-testid="empty"] [data-happy2-ui="thread-list-empty"]');
    expect(empty.element.textContent).toBe("No followed threads yet");
    expect(empty.computedStyles(["color", "font-size", "text-align"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "13px",
        "text-align": "center",
    });
    await ink(empty, "empty label");

    /* ---- Interaction --------------------------------------------------- */

    (row("infra").element as HTMLButtonElement).click();
    expect(selected).toEqual(["infra"]);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("ThreadList.test");
}, 120_000);
