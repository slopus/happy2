import { expect, it } from "vitest";
import "./theme.css";
import "./styles/menu.css";
import "./styles/icon.css";
import "./styles/badge.css";
import { Menu, type MenuItem } from "./Menu";
import { createRenderer } from "./testing";

const FIGTREE = "happy2 Figtree, system-ui, sans-serif";
const MONO = "happy2 Mono, ui-monospace, monospace";

/*
 * Icon centroid inside its 16px slot. The Icon set is optically centered to
 * <=0.4px at size 16 in every engine (Icon.tsx / Icon.test.tsx); the slot is
 * the same size as the glyph, so the alpha-weighted centroid must land on the
 * slot center (8, 8). Refuses a blank or clipped capture: the glyph must paint
 * pixels and its ink may not touch the slot's captured edges.
 */
async function iconCentroid(view: ReturnType<typeof createRenderer>, itemId: string) {
    const svg = view.$(
        `[data-testid="actions"] [data-item-id="${itemId}"] [data-happy2-ui="menu-item-icon"] svg`,
    );
    expect(svg.bounds().width, `${itemId} icon box`).toBe(16);
    expect(svg.bounds().height, `${itemId} icon box`).toBe(16);
    const visible = await svg.visibleMetrics();
    expect(visible.pixelCount, `${itemId} icon paints no pixels`).toBeGreaterThan(0);
    expect(visible.bounds.x, `${itemId} icon clipped left`).toBeGreaterThan(0);
    expect(visible.bounds.y, `${itemId} icon clipped top`).toBeGreaterThan(0);
    expect(visible.bounds.x + visible.bounds.width, `${itemId} icon clipped right`).toBeLessThan(
        16,
    );
    expect(visible.bounds.y + visible.bounds.height, `${itemId} icon clipped bottom`).toBeLessThan(
        16,
    );
    return visible.center;
}

it("holds Menu popover geometry, item rows, icon centroids, danger, and shortcuts", async () => {
    const selected: string[] = [];
    const view = createRenderer();

    const items: MenuItem[] = [
        { kind: "item", id: "copy", label: "Copy link", icon: "link", shortcut: "⌘C" },
        { kind: "item", id: "star", label: "Add to starred", icon: "star" },
        { kind: "item", id: "view", label: "View details", icon: "eye", shortcut: "⌘I" },
        { kind: "separator" },
        { kind: "item", id: "edit", label: "Edit message", icon: "edit", shortcut: "⌘E" },
        {
            kind: "item",
            id: "delete",
            label: "Delete message",
            icon: "close",
            danger: true,
            shortcut: "⇧⌘D",
        },
    ];

    view.render(
        () => <Menu data-testid="actions" items={items} onSelect={(id) => selected.push(id)} />,
        { width: 320, height: 240, padding: 24 },
    );
    await view.ready();

    /* ---- Card contract --------------------------------------------------- */

    const menu = view.$('[data-testid="actions"]');
    expect(menu.element.getAttribute("role")).toBe("menu");
    expect(menu.element.hasAttribute("data-has-icons")).toBe(true);
    /* default 220px card; height is the sum of 6+6 list padding, 5 rows @32,
     * and the 1px separator with 5px margins, plus the 1px border top+bottom. */
    expect(menu.bounds()).toEqual({ x: 24, y: 24, width: 220, height: 185 });
    expect(
        menu.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
        ]),
    ).toEqual({
        "background-color": "rgb(240, 240, 242)",
        "border-radius": "10px",
        "border-top-color": "rgb(209, 209, 214)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        display: "block",
    });
    expect((await menu.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const list = view.$('[data-testid="actions"] [data-happy2-ui="menu-list"]');
    /* The list is inset by exactly the 1px card border on every edge. */
    expect(list.offsets()).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    expect(list.computedStyles(["display", "flex-direction", "padding"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        padding: "6px",
    });

    /* ---- Row grid -------------------------------------------------------- */

    const item = (id: string) => view.$(`[data-testid="actions"] [data-item-id="${id}"]`);
    const rowIds = ["copy", "star", "view", "edit", "delete"] as const;

    for (const id of rowIds) {
        const row = item(id);
        expect(row.element.getAttribute("role"), `${id} role`).toBe("menuitem");
        expect(row.bounds().height, `${id} height`).toBe(32);
        expect(
            row.computedStyles([
                "align-items",
                "background-color",
                "border-radius",
                "cursor",
                "display",
                "padding",
            ]),
            id,
        ).toEqual({
            "align-items": "center",
            "background-color": "rgba(0, 0, 0, 0)",
            "border-radius":
                id === "copy" ? "3px 3px 6px 6px" : id === "delete" ? "6px 6px 3px 3px" : "6px",
            cursor: "pointer",
            display: "flex",
            padding: "0px 10px",
        });
    }

    /* Deterministic vertical rhythm: 32px rows, +11px across the separator. */
    expect(item("copy").bounds().y).toBe(31);
    expect(item("star").bounds().y).toBe(63);
    expect(item("view").bounds().y).toBe(95);
    expect(item("edit").bounds().y).toBe(138);
    expect(item("delete").bounds().y).toBe(170);
    /* Each item's border-box is inset by the 6px list padding on both sides. */
    expect(item("copy").offsets()).toMatchObject({ top: 6, left: 6, right: 6 });

    /* Separator: 1px hairline spanning the padded inner width (220-2-12=206),
     * 5px of breathing room above and below. */
    const separator = view.$('[data-testid="actions"] [data-happy2-ui="menu-separator"]');
    expect(separator.element.getAttribute("role")).toBe("separator");
    expect(separator.bounds()).toMatchObject({ width: 206, height: 1, y: 132 });
    expect(separator.computedStyle("background-color")).toBe("rgb(234, 234, 234)");
    expect(separator.computedStyles(["margin-top", "margin-bottom"])).toEqual({
        "margin-top": "5px",
        "margin-bottom": "5px",
    });

    /* ---- Leading icon gutter + centroids --------------------------------- */

    for (const id of rowIds) {
        const slot = view.$(
            `[data-testid="actions"] [data-item-id="${id}"] [data-happy2-ui="menu-item-icon"]`,
        );
        expect(slot.bounds().width, `${id} slot`).toBe(16);
        expect(slot.bounds().height, `${id} slot`).toBe(16);
        /* 16px glyph centered in the 32px row starts 8px down, 10px in. */
        expect(slot.offsets(), `${id} slot offset`).toMatchObject({ top: 8, left: 10 });
    }
    expect(
        view
            .$('[data-testid="actions"] [data-item-id="copy"] [data-happy2-ui="menu-item-icon"]')
            .computedStyle("color"),
    ).toBe("rgb(142, 142, 147)");

    /* Every glyph is a non-directional icon, so its ink centroid must land on
     * the slot center (8, 8) within the tuned 0.4px (contract ceiling 0.75). */
    for (const id of rowIds) {
        const center = await iconCentroid(view, id);
        expect(Math.abs(center.x - 8), `${id} icon centroid x`).toBeLessThanOrEqual(0.4);
        expect(Math.abs(center.y - 8), `${id} icon centroid y`).toBeLessThanOrEqual(0.4);
    }

    /* ---- Labels: typography, colors, shared baseline, alignment ---------- */

    const label = (id: string) =>
        view.$(`[data-testid="actions"] [data-item-id="${id}"] [data-happy2-ui="menu-item-label"]`);
    let sharedBaseline: number | undefined;
    for (const id of rowIds) {
        const el = label(id);
        const metrics = el.textMetrics();
        expect(metrics.font, `${id} label font`).toMatchObject({
            family: FIGTREE,
            size: 13,
            weight: "500",
            lineHeight: 16,
        });
        /* Left-aligned label: horizontal position is deterministic, not a
         * centroid target — 10px padding + 16px gutter + 8px gap = 34px. */
        expect(el.offsets().left, `${id} label left`).toBe(34);
        expect((await el.visibleMetrics()).pixelCount, `${id} label ink`).toBeGreaterThan(0);
        const baseline = metrics.baseline.fromSurfaceTop - item(id).bounds().y;
        sharedBaseline ??= baseline;
        expect(Math.abs(baseline - sharedBaseline), `${id} shared baseline`).toBeLessThanOrEqual(
            0.001,
        );
    }
    /* Non-danger labels inherit the bright body text; the danger row is red. */
    expect(label("copy").computedStyle("color")).toBe("rgb(0, 0, 0)");

    /* ---- Danger row ------------------------------------------------------ */

    const del = item("delete");
    expect(del.element.hasAttribute("data-danger")).toBe(true);
    expect(del.computedStyle("color")).toBe("rgb(255, 59, 48)");
    expect(label("delete").computedStyle("color")).toBe("rgb(255, 59, 48)");
    expect(
        view
            .$('[data-testid="actions"] [data-item-id="delete"] [data-happy2-ui="menu-item-icon"]')
            .computedStyle("color"),
    ).toBe("rgb(255, 59, 48)");

    /* ---- Shortcuts: KeyCap right-aligned in the row ---------------------- */

    for (const id of ["copy", "view", "edit", "delete"] as const) {
        const cap = view.$(
            `[data-testid="actions"] [data-item-id="${id}"] [data-happy2-ui="key-cap"]`,
        );
        expect(cap.bounds().height, `${id} keycap height`).toBe(18);
        /* Trailing edge sits on the row's 10px right padding. */
        expect(cap.offsets().right, `${id} keycap right`).toBe(10);
        expect((await cap.visibleMetrics()).pixelCount, `${id} keycap ink`).toBeGreaterThan(0);
    }
    /* The no-shortcut row renders no KeyCap. */
    expect(
        view.container.querySelector(
            '[data-testid="actions"] [data-item-id="star"] [data-happy2-ui="key-cap"]',
        ),
    ).toBeNull();

    /* ---- Interaction ----------------------------------------------------- */

    (item("copy").element as HTMLButtonElement).click();
    (item("delete").element as HTMLButtonElement).click();
    expect(selected).toEqual(["copy", "delete"]);

    await view.screenshot("Menu.test");
}, 120_000);

it("holds Menu section labels, disabled items, and text-only alignment", async () => {
    const selected: string[] = [];
    const view = createRenderer();

    const grouped: MenuItem[] = [
        { kind: "label", label: "Sort by" },
        { kind: "item", id: "recent", label: "Most recent", icon: "clock" },
        { kind: "item", id: "unread", label: "Unread first", icon: "inbox" },
        { kind: "separator" },
        { kind: "label", label: "Filter" },
        { kind: "item", id: "mentions", label: "Only mentions", icon: "at" },
        { kind: "item", id: "muted", label: "Include muted", icon: "bell", disabled: true },
    ];
    const textOnly: MenuItem[] = [
        { kind: "item", id: "rename", label: "Rename" },
        { kind: "item", id: "duplicate", label: "Duplicate", shortcut: "⌘D" },
        { kind: "separator" },
        { kind: "item", id: "leave", label: "Leave channel", danger: true },
    ];

    view.render(
        () => (
            <Menu
                data-testid="grouped"
                items={grouped}
                onSelect={(id) => selected.push(id)}
                width={224}
            />
        ),
        { width: 300, height: 300, padding: 24 },
    );
    view.render(() => <Menu data-testid="text" items={textOnly} width={192} />, {
        width: 260,
        height: 200,
        padding: 24,
    });
    await view.ready();

    /* ---- Section labels -------------------------------------------------- */

    const grouped$ = view.$('[data-testid="grouped"]');
    expect(grouped$.bounds().width).toBe(224);

    const menuLabels = view.container.querySelectorAll(
        '[data-testid="grouped"] [data-happy2-ui="menu-label"]',
    );
    expect(menuLabels.length).toBe(2);

    const sortBy = view.$('[data-testid="grouped"] [data-happy2-ui="menu-label"]');
    expect(sortBy.bounds().height).toBe(24);
    expect(sortBy.textMetrics().font).toMatchObject({
        family: MONO,
        size: 11,
        weight: "700",
        lineHeight: 24,
    });
    expect(sortBy.computedStyles(["color", "text-transform"])).toEqual({
        color: "rgb(142, 142, 147)",
        "text-transform": "uppercase",
    });
    /* Mono uppercase caps sit optically centered in the 24px label box.
     * Left-aligned word, so the vertical axis only (measured <=0.3px, the same
     * treatment as the sidebar section label; contract ceiling 0.75). */
    const sortInk = await sortBy.visibleMetrics();
    expect(sortInk.pixelCount).toBeGreaterThan(0);
    expect(Math.abs(sortInk.center.y - 12), "section label optical y").toBeLessThanOrEqual(0.75);

    /* ---- Disabled row ---------------------------------------------------- */

    const muted = view.$('[data-testid="grouped"] [data-item-id="muted"]');
    expect((muted.element as HTMLButtonElement).disabled).toBe(true);
    expect(muted.element.getAttribute("aria-disabled")).toBe("true");
    expect(muted.computedStyles(["cursor", "opacity"])).toEqual({
        cursor: "not-allowed",
        opacity: "0.4",
    });

    /* ---- Text-only menu: no gutter reserved ------------------------------ */

    const text$ = view.$('[data-testid="text"]');
    expect(text$.bounds().width).toBe(192);
    expect(text$.element.hasAttribute("data-has-icons")).toBe(false);
    /* No item declares an icon, so no leading slot is rendered at all. */
    expect(
        view.container.querySelector('[data-testid="text"] [data-happy2-ui="menu-item-icon"]'),
    ).toBeNull();
    /* Labels sit flush on the 10px row padding when there is no gutter. */
    const rename = view.$(
        '[data-testid="text"] [data-item-id="rename"] [data-happy2-ui="menu-item-label"]',
    );
    expect(rename.offsets().left).toBe(10);
    expect(rename.textMetrics().font).toMatchObject({ family: FIGTREE, size: 13, weight: "500" });
    /* Even without a gutter the trailing KeyCap still right-aligns. */
    const dupCap = view.$(
        '[data-testid="text"] [data-item-id="duplicate"] [data-happy2-ui="key-cap"]',
    );
    expect(dupCap.offsets().right).toBe(10);
    /* Danger still paints red in a text-only menu. */
    expect(view.$('[data-testid="text"] [data-item-id="leave"]').computedStyle("color")).toBe(
        "rgb(255, 59, 48)",
    );

    /* ---- Interaction: enabled fires, disabled is inert ------------------- */

    (
        view.$('[data-testid="grouped"] [data-item-id="recent"]').element as HTMLButtonElement
    ).click();
    (muted.element as HTMLButtonElement).click();
    expect(selected).toEqual(["recent"]);

    await view.screenshot("Menu.variants.test");
}, 120_000);
