import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/avatar.css";
import "./styles/icon.css";
import "./styles/notification-list.css";
import { NotificationList, type NotificationItem, type NotificationKind } from "./NotificationList";
import { createRenderer, type RenderedElement } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

/*
 * Box-relative geometry: an element's border-box expressed in the coordinate
 * space of its row (or any host). Rows are laid out on integer CSS pixels so
 * every expected value below is an exact integer on the 4px grid.
 */
function rel(el: RenderedElement<Element>, host: RenderedElement<Element>) {
    const b = el.bounds();
    const h = host.bounds();
    return { x: b.x - h.x, y: b.y - h.y, width: b.width, height: b.height };
}

/*
 * Alpha-weighted ink centroid of a painted glyph, expressed as a signed offset
 * from the centre of its own box. These glyphs (an accent disc, a stroked icon)
 * are designed to fill their box, so — unlike a text label sitting in a taller
 * line box — their ink legitimately reaches the box edges. The guard instead
 * refuses a blank or sliver capture: the part must paint pixels and its visible
 * bounds must span most of the box on both axes, so a clipped-away or empty
 * screenshot can never pass silently.
 */
async function glyphDrift(el: RenderedElement<Element>, label: string) {
    const visible = await el.visibleMetrics();
    expect(visible.pixelCount, `${label} paints no pixels`).toBeGreaterThan(0);
    const b = el.bounds();
    expect(visible.bounds.width, `${label} ink is a horizontal sliver`).toBeGreaterThan(
        b.width * 0.4,
    );
    expect(visible.bounds.height, `${label} ink is a vertical sliver`).toBeGreaterThan(
        b.height * 0.4,
    );
    return { dx: visible.center.x - b.width / 2, dy: visible.center.y - b.height / 2 };
}

/* Per-kind icon colour = the tone token the CSS resolves on the kind element. */
const kindColor: Record<NotificationKind, string> = {
    mention: "rgb(0, 122, 255)", // --happy2-accent-strong
    direct_message: "rgb(36, 138, 61)", // --happy2-success-strong
    reaction: "rgb(201, 52, 0)", // --happy2-warning-strong
    call: "rgb(36, 138, 61)", // --happy2-success-strong
    system: "rgb(142, 142, 147)", // --happy2-text-secondary
    moderation: "rgb(215, 0, 21)", // --happy2-danger-strong
    automation: "rgb(201, 52, 0)", // --happy2-warning-strong
};

const inbox: NotificationItem[] = [
    {
        id: "n1",
        kind: "mention",
        actor: { name: "Ada Lovelace", initials: "AL", tone: "violet" },
        text: "mentioned you in a very long channel discussion that keeps running well past the visible row",
        context: "Can you review the analytical engine diff before the launch?",
        time: "2m",
        unread: true,
    },
    {
        id: "n2",
        kind: "direct_message",
        actor: { name: "Grace Hopper", initials: "GH", tone: "ocean" },
        text: "sent you a direct message",
        context: "Re: Nanosecond wire lengths",
        time: "14m",
        unread: true,
    },
    {
        id: "n3",
        kind: "reaction",
        actor: { name: "Alan Turing", initials: "AT", tone: "amber" },
        text: "reacted to your message",
        context: "in #general",
        time: "1h",
    },
    {
        id: "n4",
        kind: "system",
        text: "Nightly backup completed successfully",
        context: "Retention job · 4.2 GB archived",
        time: "5h",
    },
];

it("holds NotificationList geometry, row anatomy, typography, and optical alignment", async () => {
    const selected: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ width: "440px" }}>
                <NotificationList
                    data-testid="inbox"
                    notifications={inbox}
                    onSelect={(id) => selected.push(id)}
                />
            </div>
        ),
        { width: 480, height: 300, padding: 12 },
    );
    await view.ready();

    const uiFamily =
        engine() === "webkit"
            ? "happy2 Figtree, system-ui, sans-serif"
            : '"happy2 Figtree", system-ui, sans-serif';

    /* ---- Root card contract ------------------------------------------- */

    const list = view.$('[data-testid="inbox"]');
    expect(list.element.getAttribute("data-happy2-ui")).toBe("notification-list");
    expect(list.element.tagName).toBe("DIV");
    expect(list.bounds().width).toBe(440);
    expect(
        list.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "flex-direction",
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
        "overflow-x": "hidden",
        "overflow-y": "hidden",
    });

    /* ---- Rows: fixed 64px, flush on the grid -------------------------- */

    const row = (id: string) => view.$(`[data-testid="inbox"] [data-item-id="${id}"]`);
    expect(row("n1").element.tagName).toBe("BUTTON");
    expect(row("n1").offsets()).toMatchObject({ top: 1, left: 1, right: 1 });
    expect(row("n1").bounds().width).toBe(438);
    for (const id of ["n1", "n2", "n3", "n4"] as const) {
        expect(row(id).bounds().height, `${id} height`).toBe(64);
    }
    expect(row("n2").bounds().y - row("n1").bounds().y, "row pitch").toBe(64);
    expect(row("n3").bounds().y - row("n2").bounds().y, "row pitch").toBe(64);

    /* ---- Read vs unread background token ------------------------------ */

    expect(row("n1").computedStyle("background-color"), "unread bg").toBe(
        "rgba(0, 122, 255, 0.14)",
    );
    expect(row("n3").computedStyle("background-color"), "read bg").toBe("rgba(0, 0, 0, 0)");

    /* ---- Unread dot: 8px accent disc, centred on the row midline ------ */

    expect(
        view.container.querySelector(
            '[data-testid="inbox"] [data-item-id="n3"] [data-happy2-ui="notification-unread"]',
        ),
        "read row has no unread dot",
    ).toBeNull();

    const dot = view.$(
        '[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="notification-unread"]',
    );
    expect(rel(dot, row("n1"))).toEqual({ x: 16, y: 28, width: 8, height: 8 });
    expect(dot.computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(0, 122, 255)",
        "border-radius": "999px",
    });
    // Symmetric disc → tight centroid inside its own 8px box, both axes.
    const dotDrift = await glyphDrift(dot, "unread dot");
    expect(Math.abs(dotDrift.dx), "unread dot x centroid").toBeLessThanOrEqual(0.4);
    expect(Math.abs(dotDrift.dy), "unread dot y centroid").toBeLessThanOrEqual(0.4);
    // The dot box is vertically centred in the 64px row.
    expect(dot.bounds().y - row("n1").bounds().y + 4, "dot vs row centre").toBe(32);

    /* ---- Actor avatar box (reused Avatar contract) -------------------- */

    const avatar = view.$('[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="avatar"]');
    expect(rel(avatar, row("n1"))).toEqual({ x: 36, y: 14, width: 36, height: 36 });

    /* ---- Corner kind badge: 18px raised chip with a 2px card ring ----- */

    const corner = view.$(
        '[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="notification-kind"]',
    );
    expect(corner.element.getAttribute("data-variant")).toBe("corner");
    expect(rel(corner, row("n1"))).toEqual({ x: 57, y: 35, width: 18, height: 18 });
    expect(
        corner.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "color",
        ]),
    ).toEqual({
        "background-color": "rgb(240, 240, 242)",
        "border-radius": "999px",
        "border-top-color": "rgb(255, 255, 255)",
        "border-top-width": "2px",
        color: kindColor.mention,
    });
    // The 12px corner glyph is measured clean: the raised chip (an ancestor of
    // the svg) is repainted opaque during the alpha sweep, fully backing the
    // 12px box, so no avatar ink pollutes the capture. Even below Icon's tuned
    // 14/16/20 sizes its alpha centroid stays within the tuned 0.4px in every
    // engine (measured; verified against the 0.4 bound).
    const cornerGlyph = view.$(
        '[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="notification-kind"] svg',
    );
    const cornerDrift = await glyphDrift(cornerGlyph, "corner glyph");
    expect(Math.abs(cornerDrift.dx), "corner glyph x centroid").toBeLessThanOrEqual(0.4);
    expect(Math.abs(cornerDrift.dy), "corner glyph y centroid").toBeLessThanOrEqual(0.4);

    /* ---- Actor-less kind tile: 36px soft chip, 16px glyph ------------- */

    expect(
        view.container.querySelector(
            '[data-testid="inbox"] [data-item-id="n4"] [data-happy2-ui="avatar"]',
        ),
        "actor-less row has no avatar",
    ).toBeNull();
    const tile = view.$(
        '[data-testid="inbox"] [data-item-id="n4"] [data-happy2-ui="notification-kind"]',
    );
    expect(tile.element.getAttribute("data-variant")).toBe("tile");
    expect(rel(tile, row("n4"))).toEqual({ x: 36, y: 14, width: 36, height: 36 });
    expect(tile.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgb(240, 240, 242)", // neutral tone → --happy2-bg-raised
        "border-radius": "999px",
        color: kindColor.system,
    });
    // 16px glyph is an Icon tuned size (centroid ≤ 0.4px by construction).
    const tileGlyph = view.$(
        '[data-testid="inbox"] [data-item-id="n4"] [data-happy2-ui="notification-kind"] svg',
    );
    expect(tileGlyph.bounds().width).toBe(16);
    const tileDrift = await glyphDrift(tileGlyph, "tile glyph");
    expect(Math.abs(tileDrift.dx), "tile glyph x centroid").toBeLessThanOrEqual(0.4);
    expect(Math.abs(tileDrift.dy), "tile glyph y centroid").toBeLessThanOrEqual(0.4);

    /* ---- Body: text + context stack, box-symmetric in the row -------- */

    const body = view.$(
        '[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="notification-body"]',
    );
    // text 20 + gap 2 + context 16 = 38, centred in the 64px row.
    expect(Math.abs(body.offsets().top - 13), "body top gap").toBeLessThanOrEqual(0.5);
    expect(Math.abs(body.offsets().bottom - 13), "body bottom gap").toBeLessThanOrEqual(0.5);
    expect(
        Math.abs(body.offsets().top - body.offsets().bottom),
        "body box symmetry",
    ).toBeLessThanOrEqual(0.5);

    const text = view.$(
        '[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="notification-text"]',
    );
    const textMetrics = text.textMetrics();
    expect(textMetrics.font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    expect(textMetrics.font.size).toBe(14);
    expect(textMetrics.font.lineHeight).toBe(20);
    expect(
        text.computedStyles([
            "color",
            "font-family",
            "font-weight",
            "overflow-x",
            "text-overflow",
            "white-space",
        ]),
    ).toEqual({
        color: "rgb(0, 0, 0)",
        "font-family": uiFamily,
        "font-weight": "600", // unread → heavier
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    // Long text truncates inside the 1fr body column.
    expect((text.element as HTMLElement).scrollWidth, "long text overflows").toBeGreaterThan(
        (text.element as HTMLElement).clientWidth,
    );
    expect((await text.visibleMetrics()).pixelCount, "text ink").toBeGreaterThan(0);

    const actorLead = view.$(
        '[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="notification-actor"]',
    );
    expect(actorLead.textMetrics().font.weight).toBe("700");
    expect(actorLead.textMetrics().text).toBe("Ada Lovelace");

    // Read row text is lighter than unread.
    const readText = view.$(
        '[data-testid="inbox"] [data-item-id="n3"] [data-happy2-ui="notification-text"]',
    );
    expect(readText.textMetrics().font.weight).toBe("500");

    const context = view.$(
        '[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="notification-context"]',
    );
    expect(context.textMetrics().font.size).toBe(12);
    expect(context.textMetrics().font.lineHeight).toBe(16);
    expect(context.computedStyle("color")).toBe("rgb(142, 142, 147)"); // --happy2-text-muted
    expect((await context.visibleMetrics()).pixelCount, "context ink").toBeGreaterThan(0);

    /* ---- Time: mono, muted, right-aligned in the row ----------------- */

    const time = view.$(
        '[data-testid="inbox"] [data-item-id="n1"] [data-happy2-ui="notification-time"]',
    );
    const timeMetrics = time.textMetrics();
    expect(timeMetrics.font.family).toBe("happy2 Mono, ui-monospace, monospace");
    expect(timeMetrics.font.size).toBe(11);
    expect(timeMetrics.text).toBe("2m");
    expect(time.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(time.offsets().right, "time right-alignment").toBe(16);
    expect((await time.visibleMetrics()).pixelCount, "time ink").toBeGreaterThan(0);
    // Time sits to the right of the body.
    expect(time.bounds().x, "time is after body").toBeGreaterThan(
        body.bounds().x + body.bounds().width,
    );

    /* ---- Interaction -------------------------------------------------- */

    (row("n2").element as HTMLButtonElement).click();
    (row("n4").element as HTMLButtonElement).click();
    expect(selected).toEqual(["n2", "n4"]);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("NotificationList.test");
}, 120_000);

const allKinds: NotificationItem[] = [
    {
        id: "mention",
        kind: "mention",
        actor: { name: "Ada", initials: "AL", tone: "violet" },
        text: "mentioned you",
        context: "in #eng-core",
        time: "2m",
    },
    {
        id: "direct_message",
        kind: "direct_message",
        actor: { name: "Katherine", initials: "KJ", tone: "mint" },
        text: "sent a direct message",
        context: "Trajectory looks good",
        time: "9m",
    },
    {
        id: "reaction",
        kind: "reaction",
        actor: { name: "Alan", initials: "AT", tone: "amber" },
        text: "reacted to your message",
        context: "in #general",
        time: "18m",
    },
    {
        id: "call",
        kind: "call",
        actor: { name: "Maya", initials: "MJ", tone: "rose" },
        text: "started a call",
        context: "Design sync",
        time: "40m",
    },
    {
        id: "system",
        kind: "system",
        actor: { name: "Relay", initials: "RL", tone: "slate" },
        text: "updated your workspace",
        context: "New settings applied",
        time: "1h",
    },
    {
        id: "moderation",
        kind: "moderation",
        actor: { name: "Trust & Safety", initials: "TS", tone: "rose" },
        text: "flagged a message",
        context: "3 reports",
        time: "2h",
    },
    {
        id: "automation",
        kind: "automation",
        actor: { name: "Triage bot", initials: "TB", tone: "brand" },
        text: "ran a workflow",
        context: "Assigned 3 issues",
        time: "3h",
    },
];

const tiles: NotificationItem[] = [
    {
        id: "t-system",
        kind: "system",
        text: "Nightly backup completed",
        context: "Retention job",
        time: "5h",
    },
    {
        id: "t-moderation",
        kind: "moderation",
        text: "Report queue updated",
        context: "2 items awaiting review",
        time: "6h",
    },
    {
        id: "t-automation",
        kind: "automation",
        text: "Webhook delivered",
        context: "deploy.succeeded",
        time: "1d",
    },
];

it("renders every notification kind with a centred kind glyph, plus tiles and the empty state", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ width: "440px" }}>
                <NotificationList
                    data-testid="kinds"
                    notifications={allKinds}
                    onSelect={() => {}}
                />
            </div>
        ),
        { width: 480, height: 540, padding: 12 },
    );
    view.render(
        () => (
            <div style={{ width: "360px" }}>
                <NotificationList data-testid="tiles" notifications={tiles} onSelect={() => {}} />
            </div>
        ),
        { width: 400, height: 220, padding: 12 },
    );
    view.render(
        () => (
            <div style={{ width: "360px" }}>
                <NotificationList
                    data-testid="empty"
                    emptyLabel="You're all caught up"
                    notifications={[]}
                />
            </div>
        ),
        { width: 400, height: 140, padding: 12 },
    );
    await view.ready();

    /* Every kind's corner glyph: correct tone colour and an optically centred
     * 12px glyph. Each measures within the tuned 0.4px on both axes in all
     * three engines even below Icon's tuned 14/16/20 calibration sizes. */
    for (const item of allKinds) {
        const kind = view.$(
            `[data-testid="kinds"] [data-item-id="${item.id}"] [data-happy2-ui="notification-kind"]`,
        );
        expect(kind.element.getAttribute("data-variant"), `${item.id} variant`).toBe("corner");
        expect(
            rel(kind, view.$(`[data-testid="kinds"] [data-item-id="${item.id}"]`)),
            `${item.id} box`,
        ).toEqual({
            x: 57,
            y: 35,
            width: 18,
            height: 18,
        });
        expect(kind.computedStyle("color"), `${item.id} colour`).toBe(kindColor[item.kind]);
        const glyph = view.$(
            `[data-testid="kinds"] [data-item-id="${item.id}"] [data-happy2-ui="notification-kind"] svg`,
        );
        expect(glyph.bounds().width, `${item.id} glyph size`).toBe(12);
        const drift = await glyphDrift(glyph, `${item.id} glyph`);
        expect(Math.abs(drift.dx), `${item.id} glyph x centroid`).toBeLessThanOrEqual(0.4);
        expect(Math.abs(drift.dy), `${item.id} glyph y centroid`).toBeLessThanOrEqual(0.4);
    }

    /* Actor-less tiles: soft tone background + a tuned 16px glyph. */
    const tileBg: Record<string, string> = {
        "t-system": "rgb(240, 240, 242)", // neutral → --happy2-bg-raised
        "t-moderation": "rgba(255, 59, 48, 0.12)", // --happy2-danger-soft
        "t-automation": "rgba(255, 149, 0, 0.14)", // --happy2-warning-soft
    };
    for (const item of tiles) {
        const tile = view.$(
            `[data-testid="tiles"] [data-item-id="${item.id}"] [data-happy2-ui="notification-kind"]`,
        );
        expect(tile.element.getAttribute("data-variant"), `${item.id} variant`).toBe("tile");
        expect(tile.bounds().width, `${item.id} tile size`).toBe(36);
        expect(tile.bounds().height, `${item.id} tile size`).toBe(36);
        expect(tile.computedStyle("background-color"), `${item.id} tile bg`).toBe(tileBg[item.id]);
        const glyph = view.$(
            `[data-testid="tiles"] [data-item-id="${item.id}"] [data-happy2-ui="notification-kind"] svg`,
        );
        expect(glyph.bounds().width, `${item.id} glyph size`).toBe(16);
        const drift = await glyphDrift(glyph, `${item.id} tile glyph`);
        expect(Math.abs(drift.dx), `${item.id} tile glyph x centroid`).toBeLessThanOrEqual(0.4);
        expect(Math.abs(drift.dy), `${item.id} tile glyph y centroid`).toBeLessThanOrEqual(0.4);
    }

    /* Empty state: a muted, centred caught-up message. */
    const empty = view.$('[data-testid="empty"] [data-happy2-ui="notification-list-empty"]');
    expect(empty.element.textContent).toBe("You're all caught up");
    expect(empty.computedStyles(["color", "text-align"])).toEqual({
        color: "rgb(142, 142, 147)",
        "text-align": "center",
    });
    expect(empty.bounds().height).toBeGreaterThanOrEqual(96);
    expect((await empty.visibleMetrics()).pixelCount, "empty ink").toBeGreaterThan(0);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("NotificationList.kinds");
}, 120_000);
