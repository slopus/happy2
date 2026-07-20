import "./styles.css";
import { expect, it, vi } from "vitest";
import { Avatar } from "./Avatar";
import { Rail, type RailItem } from "./Rail";
import { createRenderer, type RenderedElement } from "./testing";

const items: RailItem[] = [
    { badge: 12, icon: "inbox", id: "inbox", label: "Inbox" },
    { icon: "chat", id: "chat", label: "Chat" },
    { icon: "spark", id: "agents", label: "Agents" },
    { icon: "tasks", id: "tasks", label: "Tasks" },
];

/* 1/2/3-digit badge counts, the fifth rail glyph (files), and a label long
 * enough to hit the 48px ellipsis clamp. */
const badgeItems: RailItem[] = [
    { badge: 5, icon: "chat", id: "one-digit", label: "Chat" },
    { badge: 64, icon: "tasks", id: "two-digit", label: "Tasks" },
    { badge: 128, icon: "spark", id: "three-digit", label: "Agents" },
    { icon: "files", id: "files", label: "Files" },
    { icon: "inbox", id: "long-label", label: "Notifications" },
];

/*
 * Anchored optical measurement.
 *
 * Playwright element captures carry a deterministic sub-pixel window offset
 * that varies with absolute page position (measured up to ±0.8px here), so a
 * raw captured centroid cannot be compared against box geometry at <1px
 * precision. Instead the SAME host element is captured twice — once showing
 * only a test dot whose center is the host's exact box center, once showing
 * only the measured part — and the centroids are differenced: both captures
 * share one window, so the offset cancels exactly. pixelCount is asserted >0
 * for both passes, so a clipped or blank capture can never pass.
 *
 * Hosts in the fixtures below are wrapped with a 0.5px shim where needed so
 * the anchor dot lands on integer CSS positions (exact device pixels at the
 * mandatory 2x scale); sharp-edged ink at fractional positions is what the
 * capture resampler quantizes worst.
 */
async function anchoredCenter(
    view: { $: (selector: string) => RenderedElement<Element> },
    hostSelector: string,
    partSelector: string,
) {
    const host = view.$(hostSelector).element as HTMLElement;
    const part = view.$(partSelector).element as HTMLElement;
    const hostBounds = host.getBoundingClientRect();

    const dot = document.createElement("div");
    Object.assign(dot.style, {
        position: "absolute",
        left: `${hostBounds.width / 2 - 2}px`,
        top: `${hostBounds.height / 2 - 2}px`,
        width: "4px",
        height: "4px",
        background: "#808080",
    });
    const hostPosition = getComputedStyle(host).position;
    if (hostPosition === "static") host.style.setProperty("position", "relative", "important");
    /* The host's own background (e.g. the active pill) would register as ink;
     * transitions would smear the black/white differencing passes. */
    host.style.setProperty("background", "transparent", "important");
    host.style.setProperty("transition", "none", "important");
    host.appendChild(dot);

    const children = Array.from(host.querySelectorAll<HTMLElement>("*")).filter((el) => el !== dot);
    const saved = children.map((el) => el.style.cssText);
    const showOnly = (visible: (el: HTMLElement) => boolean) => {
        children.forEach((el, i) => {
            el.style.cssText = saved[i]!;
            el.style.setProperty("transition", "none", "important");
            el.style.setProperty("visibility", visible(el) ? "visible" : "hidden", "important");
        });
    };

    try {
        /* Pass A: anchor dot only. */
        showOnly(() => false);
        dot.style.visibility = "visible";
        const anchor = await view.$(hostSelector).visibleMetrics();
        expect(anchor.pixelCount, `anchor pixels for ${hostSelector}`).toBeGreaterThan(0);

        /* Pass B: the measured part only (visibility:visible on the part
         * overrides its hidden ancestors without moving layout). */
        dot.style.visibility = "hidden";
        showOnly((el) => el === part || part.contains(el));
        const ink = await view.$(hostSelector).visibleMetrics();
        expect(ink.pixelCount, `ink pixels for ${partSelector}`).toBeGreaterThan(0);

        return {
            dx: ink.center.x - anchor.center.x,
            dy: ink.center.y - anchor.center.y,
        };
    } finally {
        dot.remove();
        children.forEach((el, i) => {
            el.style.cssText = saved[i]!;
        });
        host.style.removeProperty("background");
        host.style.removeProperty("transition");
        if (hostPosition === "static") host.style.removeProperty("position");
    }
}

it("holds Rail geometry, states, and optical alignment", { timeout: 240_000 }, async () => {
    const onFooterSelect = vi.fn();
    const onItemSelect = vi.fn();
    const onPrimarySelect = vi.fn();
    const onAppearanceToggle = vi.fn();
    const view = createRenderer();

    /* Each surface pairs the contract fixture with a duplicate used for the
     * anchored optical captures. With no right hairline the rail centers its
     * children on integer positions inside the full 64px lane, so both rails
     * already land on integer CSS pixels (no shim needed) and the captures are
     * exact. */
    view.render(
        () => (
            <div style={{ display: "flex", gap: "20px", height: "100%" }}>
                <Rail
                    activeItemId="agents"
                    data-testid="rail-main"
                    footer={<Avatar initials="SK" online size="md" tone="mint" />}
                    footerLabel="Open profile"
                    items={items}
                    onFooterSelect={onFooterSelect}
                    onItemSelect={onItemSelect}
                    primaryAction={{
                        label: "Create",
                        menuItems: [
                            { id: "agent", icon: "spark", kind: "item", label: "New agent" },
                            { id: "channel", icon: "hash", kind: "item", label: "New channel" },
                        ],
                        onMenuSelect: onPrimarySelect,
                    }}
                />
                <div style={{ paddingLeft: "0px", height: "100%" }}>
                    <Rail
                        activeItemId="agents"
                        data-testid="rail-m"
                        footer={<Avatar initials="SK" online size="md" tone="mint" />}
                        items={items}
                        onItemSelect={() => {}}
                    />
                </div>
            </div>
        ),
        { width: 240, height: 420 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", gap: "20px", height: "100%" }}>
                <Rail
                    activeItemId="inbox"
                    brand={
                        <span
                            data-testid="custom-brand"
                            style={{
                                background: "#38bdf8",
                                borderRadius: "10px",
                                display: "block",
                                height: "34px",
                                width: "34px",
                            }}
                        />
                    }
                    data-testid="rail-custom"
                    items={items.slice(0, 2)}
                    onItemSelect={() => {}}
                />
                <div style={{ paddingLeft: "0px", height: "100%" }}>
                    <Rail
                        activeItemId="inbox"
                        data-testid="rail-brand"
                        items={items.slice(0, 2)}
                        onItemSelect={() => {}}
                    />
                </div>
            </div>
        ),
        { width: 240, height: 560 },
    );
    view.render(
        () => (
            <div style={{ paddingLeft: "0px", height: "100%" }}>
                <Rail
                    activeItemId="files"
                    data-testid="rail-badges"
                    items={badgeItems}
                    onItemSelect={() => {}}
                />
            </div>
        ),
        { width: 240, height: 360 },
    );
    view.render(
        () => (
            <Rail
                activeItemId="inbox"
                appearance="dark"
                data-testid="rail-appearance"
                items={items.slice(0, 2)}
                onAppearanceToggle={onAppearanceToggle}
                onItemSelect={() => {}}
            />
        ),
        { width: 64, height: 220 },
    );
    await view.ready();

    /* ---- Root contract ------------------------------------------------- */

    const rail = view.$('[data-testid="rail-main"]');
    expect(rail.element.tagName).toBe("NAV");
    expect(rail.bounds()).toEqual({ x: 0, y: 0, width: 64, height: 420 });
    expect(
        rail.computedStyles([
            "background-color",
            "border-right-width",
            "box-sizing",
            "display",
            "flex-direction",
            "flex-grow",
            "flex-shrink",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        // Transparent over the window backdrop; no right hairline — seamless
        // with the title bar and (in chat) the sidebar.
        "background-color": "rgba(0, 0, 0, 0)",
        "border-right-width": "0px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "flex-grow": "0",
        "flex-shrink": "0",
        "padding-bottom": "16px",
        "padding-left": "0px",
        "padding-right": "0px",
        "padding-top": "12px",
    });

    /* The taller surface fills too: the rail is height-fluid. */
    expect(view.$('[data-testid="rail-custom"]').bounds()).toEqual({
        x: 0,
        y: 0,
        width: 64,
        height: 560,
    });

    /* The generated happy otter is the default 32px brand mark. It occupies
     * the former R slot without restoring any text glyph. */
    const brandImage = view.$('[data-testid="rail-main"] [data-happy2-ui="rail-brand-image"]');
    const brandImageElement = brandImage.element as HTMLImageElement;
    await brandImageElement.decode();
    expect(brandImage.element.tagName).toBe("IMG");
    expect(brandImage.bounds()).toEqual({ x: 16, y: 12, width: 32, height: 32 });
    expect(brandImage.computedStyles(["display", "height", "object-fit", "width"])).toEqual({
        display: "block",
        height: "32px",
        "object-fit": "contain",
        width: "32px",
    });
    expect(brandImageElement.complete).toBe(true);
    expect(brandImageElement.naturalWidth).toBe(128);
    expect(brandImage.element.getAttribute("alt")).toBe("");
    expect(brandImage.element.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelectorAll('[data-happy2-ui="rail-brand-glyph"]')).toHaveLength(0);

    /* Supplied brand content replaces the otter inside the same centered slot. */
    expect(
        document.querySelectorAll(
            '[data-testid="rail-custom"] [data-happy2-ui="rail-brand-image"]',
        ),
    ).toHaveLength(0);

    /* ---- Appearance -------------------------------------------------------- */

    const appearanceToggle = view.$(
        '[data-testid="rail-appearance"] [data-happy2-ui="rail-appearance-toggle"]',
    );
    expect(appearanceToggle.bounds().width).toBe(28);
    expect(appearanceToggle.bounds().height).toBe(28);
    expect(appearanceToggle.element.getAttribute("aria-label")).toBe("Use light appearance");
    expect(appearanceToggle.element.getAttribute("aria-pressed")).toBe("true");
    expect(
        view
            .$(
                '[data-testid="rail-appearance"] [data-happy2-ui="rail-appearance-toggle"] [data-happy2-ui="icon"]',
            )
            .element.getAttribute("data-name"),
    ).toBe("sun");
    expect(appearanceToggle.computedStyles(["border-radius", "color", "cursor"])).toEqual({
        "border-radius": "999px",
        color: "rgb(142, 142, 147)",
        cursor: "pointer",
    });
    (appearanceToggle.element as HTMLButtonElement).click();
    expect(onAppearanceToggle).toHaveBeenCalledTimes(1);
    expect(view.$('[data-testid="rail-custom"] [data-testid="custom-brand"]').bounds().width).toBe(
        34,
    );
    expect(view.$('[data-testid="rail-custom"] [data-testid="custom-brand"]').bounds()).toEqual({
        x: 15,
        y: 12,
        width: 34,
        height: 34,
    });

    /* ---- Items: 52×48 buttons on the 4px rhythm -------------------------- */

    const inbox = view.$('[data-testid="rail-main"] [data-item-id="inbox"]');
    const chat = view.$('[data-testid="rail-main"] [data-item-id="chat"]');
    const active = view.$('[data-testid="rail-main"] [data-item-id="agents"]');

    expect(inbox.element.tagName).toBe("BUTTON");
    /* Items start after the 32px otter mark and its 8px gap. */
    expect(inbox.bounds()).toEqual({ x: 6, y: 52, width: 52, height: 48 });
    expect(chat.bounds()).toEqual({ x: 6, y: 104, width: 52, height: 48 });
    expect(
        inbox.computedStyles([
            "background-color",
            "border-radius",
            "border-top-width",
            "box-sizing",
            "color",
            "cursor",
            "display",
            "flex-direction",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "8px",
        "border-top-width": "0px",
        "box-sizing": "border-box",
        color: "rgb(142, 142, 147)",
        cursor: "pointer",
        display: "flex",
        "flex-direction": "column",
    });

    /* Active state: accent-soft fill, accent-strong icon, solid label. */
    expect(active.element.getAttribute("aria-current")).toBe("page");
    expect(inbox.element.getAttribute("aria-current")).toBeNull();
    expect(active.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(0, 122, 255, 0.14)",
        color: "rgb(0, 122, 255)",
    });
    expect(
        view
            .$(
                '[data-testid="rail-main"] [data-item-id="agents"] [data-happy2-ui="rail-item-label"]',
            )
            .computedStyle("color"),
    ).toBe("rgb(0, 0, 0)");

    /* ---- Icon and label inside an item ------------------------------------ */

    const chatIconBox = view.$(
        '[data-testid="rail-main"] [data-item-id="chat"] [data-happy2-ui="rail-item-icon"]',
    );
    expect(chatIconBox.bounds().width).toBe(20);
    expect(chatIconBox.bounds().height).toBe(20);
    /* Content column (20 icon + 4 gap + 12 label) centers in the 48px lane. */
    expect(chatIconBox.bounds().x - chat.bounds().x).toBe(16);
    expect(chatIconBox.bounds().y - chat.bounds().y).toBe(6);

    const chatIcon = view.$(
        '[data-testid="rail-main"] [data-item-id="chat"] [data-happy2-ui="icon"]',
    );
    expect(chatIcon.computedStyle("color")).toBe("rgb(142, 142, 147)");

    /* Optical: every rail glyph, active and inactive, centroid vs the item
     * center — the icon row center sits exactly 8px above it. Raw drift
     * measures <=0.15 horizontal and <=0.10 vertical in all engines with no
     * CSS correction; any residue is glyph mass owned by Icon path data. */
    for (const [railId, itemId] of [
        ["rail-m", "inbox"], // inactive, measured under its badge overlay
        ["rail-m", "chat"], // inactive
        ["rail-m", "agents"], // active (spark glyph)
        ["rail-m", "tasks"], // inactive
        ["rail-badges", "files"], // active
    ] as const) {
        const delta = await anchoredCenter(
            view,
            `[data-testid="${railId}"] [data-item-id="${itemId}"]`,
            `[data-testid="${railId}"] [data-item-id="${itemId}"] [data-happy2-ui="icon"]`,
        );
        expect(
            Math.abs(delta.dx),
            `${itemId} icon optical x (signed ${delta.dx})`,
        ).toBeLessThanOrEqual(0.75);
        expect(
            Math.abs(delta.dy + 8),
            `${itemId} icon optical y (signed ${delta.dy + 8})`,
        ).toBeLessThanOrEqual(0.75);
    }

    const chatLabel = view.$(
        '[data-testid="rail-main"] [data-item-id="chat"] [data-happy2-ui="rail-item-label"]',
    );
    const labelMetrics = chatLabel.textMetrics();
    expect(labelMetrics.text).toBe("Chat");
    expect(labelMetrics.font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    expect(labelMetrics.font.size).toBe(10);
    expect(labelMetrics.font.weight).toBe("700");
    expect(labelMetrics.font.lineHeight).toBe(12);
    expect(labelMetrics.font.letterSpacing).toBeCloseTo(0.2, 3);
    expect(chatLabel.bounds().y - chat.bounds().y).toBe(30);

    /* Labels: word ink is inherently asymmetric (ascenders, descenders,
     * per-letter mass — "Agents" measures -0.5..-0.65 in every engine even
     * with the trailing letter-spacing bias cancelled), so the horizontal
     * centroid is asserted at the 0.75 contract and the vertical axis via
     * line-box symmetry: the 12px line box sits 30px from the item top and
     * 8px from its bottom, mirroring the icon's 6px top inset. */
    for (const [railId, itemId, text] of [
        ["rail-m", "chat", "Chat"], // inactive
        ["rail-m", "agents", "Agents"], // active
        ["rail-badges", "two-digit", "Tasks"], // inactive
        ["rail-badges", "files", "Files"], // active
    ] as const) {
        const item = view.$(`[data-testid="${railId}"] [data-item-id="${itemId}"]`);
        const label = view.$(
            `[data-testid="${railId}"] [data-item-id="${itemId}"] [data-happy2-ui="rail-item-label"]`,
        );
        expect(label.element.textContent).toBe(text);
        expect(label.bounds().y - item.bounds().y).toBe(30);
        expect(label.bounds().height).toBe(12);
        const delta = await anchoredCenter(
            view,
            `[data-testid="${railId}"] [data-item-id="${itemId}"]`,
            `[data-testid="${railId}"] [data-item-id="${itemId}"] [data-happy2-ui="rail-item-label"]`,
        );
        expect(
            Math.abs(delta.dx),
            `${text} label optical x (signed ${delta.dx})`,
        ).toBeLessThanOrEqual(0.75);
    }

    /* Long labels clamp to the 48px lane with an ellipsis, ink kept inside. */
    const longLabel = view.$(
        '[data-testid="rail-badges"] [data-item-id="long-label"] [data-happy2-ui="rail-item-label"]',
    );
    expect(longLabel.computedStyle("text-overflow")).toBe("ellipsis");
    expect(longLabel.bounds().width).toBe(48);
    const longLabelVisible = await longLabel.visibleMetrics();
    expect(longLabelVisible.pixelCount).toBeGreaterThan(0);
    expect(longLabelVisible.bounds.width).toBeLessThanOrEqual(48.5);

    /* ---- Unread badge overlapping the icon top-right ----------------------- */

    /* The badge keeps a 4px inset from the icon's top-right edge for every
     * digit count; the pill keeps its 18px height and grows leftward only. */
    const badgeWidths: number[] = [];
    for (const [itemId, text] of [
        ["one-digit", "5"],
        ["two-digit", "64"],
        ["three-digit", "128"],
    ] as const) {
        const badge = view.$(
            `[data-testid="rail-badges"] [data-item-id="${itemId}"] [data-happy2-ui="rail-item-badge"]`,
        );
        const iconBox = view.$(
            `[data-testid="rail-badges"] [data-item-id="${itemId}"] [data-happy2-ui="rail-item-icon"]`,
        );
        expect(
            iconBox.bounds().x + iconBox.bounds().width - (badge.bounds().x + badge.bounds().width),
            `${text} badge right inset`,
        ).toBe(4);
        expect(badge.bounds().y - iconBox.bounds().y, `${text} badge top inset`).toBe(4);
        const count = view.$(
            `[data-testid="rail-badges"] [data-item-id="${itemId}"] [data-happy2-ui="count-badge"]`,
        );
        expect(count.element.textContent).toBe(text);
        expect(count.bounds().height).toBe(18);
        const countVisible = await count.visibleMetrics();
        expect(countVisible.pixelCount, `${text} badge ink`).toBeGreaterThan(0);
        badgeWidths.push(count.bounds().width);
    }
    expect(badgeWidths[0]).toBe(18);
    expect(badgeWidths[1]!).toBeGreaterThan(badgeWidths[0]!);
    expect(badgeWidths[2]!).toBeGreaterThan(badgeWidths[1]!);

    /* Badge styling and absence on badge-less items (checked on rail-main). */
    const count12 = view.$(
        '[data-testid="rail-main"] [data-item-id="inbox"] [data-happy2-ui="count-badge"]',
    );
    expect(count12.element.textContent).toBe("12");
    expect(count12.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgb(0, 122, 255)",
        "border-radius": "4px",
        color: "rgb(255, 255, 255)",
    });
    expect(
        document.querySelectorAll(
            '[data-testid="rail-main"] [data-item-id="chat"] [data-happy2-ui="rail-item-badge"]',
        ).length,
    ).toBe(0);

    /* ---- Footer pinned to the bottom ---------------------------------------- */

    const footer = view.$('[data-testid="rail-main"] [data-happy2-ui="rail-footer"]');
    const footerBounds = footer.bounds();
    expect(footerBounds.y + footerBounds.height).toBe(420 - 16);
    const footerAction = view.$('[data-testid="rail-main"] [data-happy2-ui="rail-footer-action"]');
    expect(footerAction.element.tagName).toBe("BUTTON");
    expect(footerAction.element.getAttribute("aria-label")).toBe("Open profile");
    expect(footerAction.bounds()).toEqual({ x: 14, y: 368, width: 36, height: 36 });
    const footerAvatar = view.$('[data-testid="rail-main"] [data-happy2-ui="avatar"]');
    expect(footerAvatar.bounds().width).toBe(36);
    const avatarBounds = footerAvatar.bounds();
    expect(avatarBounds.x).toBe(14);
    expect(64 - avatarBounds.x - avatarBounds.width).toBe(14);
    expect(420 - avatarBounds.y - avatarBounds.height).toBe(16);
    const primary = view.$('[data-testid="rail-main"] [data-happy2-ui="rail-primary"]');
    expect(primary.bounds()).toEqual({ x: 14, y: 318, width: 36, height: 36 });
    expect(primary.bounds().width).toBe(footerAvatar.bounds().width);
    expect(primary.element.getAttribute("aria-haspopup")).toBe("menu");
    const footerVisible = await footerAvatar.visibleMetrics();
    expect(footerVisible.pixelCount).toBeGreaterThan(0);
    expect(
        document.querySelectorAll('[data-testid="rail-custom"] [data-happy2-ui="rail-footer"]')
            .length,
    ).toBe(0);

    (footerAction.element as HTMLButtonElement).click();
    expect(onFooterSelect).toHaveBeenCalledTimes(1);

    (primary.element as HTMLButtonElement).click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(primary.element.getAttribute("aria-expanded")).toBe("true");
    const createAgent = view.$(
        '[data-testid="rail-main"] [data-happy2-ui="rail-primary-popover"] [data-item-id="agent"]',
    );
    (createAgent.element as HTMLButtonElement).click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(onPrimarySelect).toHaveBeenCalledWith("agent");
    expect(primary.element.getAttribute("aria-expanded")).toBe("false");
    (primary.element as HTMLButtonElement).click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const reopenedCreateAgent = view.$(
        '[data-testid="rail-main"] [data-happy2-ui="rail-primary-popover"] [data-item-id="agent"]',
    );
    (reopenedCreateAgent.element as HTMLButtonElement).focus();
    reopenedCreateAgent.element.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(primary.element.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(primary.element);
    (primary.element as HTMLButtonElement).click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    (chat.element as HTMLButtonElement).focus();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(primary.element.getAttribute("aria-expanded")).toBe("false");

    /* ---- Selection callback -------------------------------------------------- */

    (chat.element as HTMLButtonElement).click();
    expect(onItemSelect).toHaveBeenCalledTimes(1);
    expect(onItemSelect).toHaveBeenCalledWith("chat");

    /* Pixel measurements scroll the page; reset before the capture. */
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("Rail.test");
});
