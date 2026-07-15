import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/tabs.css";
import "./styles/icon.css";
import "./styles/badge.css";
import { type TabItem, Tabs, type TabsSize } from "./Tabs";
import { createRenderer, type RenderedElement } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

/*
 * Contract geometry per size. Heights sit on the 4px grid; label typography
 * mirrors Button (12/13/14 · 16/18/20 line box) so a tab reads as a control.
 */
const sizeSpec: Record<
    TabsSize,
    {
        height: number;
        fontSize: number;
        lineHeight: number;
        padding: string;
        gap: number;
        icon: number;
    }
> = {
    small: { height: 32, fontSize: 12, lineHeight: 16, padding: "0px 12px", gap: 6, icon: 14 },
    medium: { height: 40, fontSize: 13, lineHeight: 18, padding: "0px 14px", gap: 8, icon: 16 },
    large: { height: 48, fontSize: 14, lineHeight: 20, padding: "0px 16px", gap: 8, icon: 18 },
};

const sizes = ["small", "medium", "large"] as const;

/* activeId "unread" (label + accent badge). Mixed content so every measurable
 * form is present: icon+label, label+badge, icon+label+badge, icon+label,
 * label-only. */
const inboxTabs: TabItem[] = [
    { id: "all", label: "All", icon: "inbox" },
    { id: "unread", label: "Unread", badge: 3 },
    { id: "mentions", label: "Mentions", icon: "at", badge: 12 },
    { id: "threads", label: "Threads", icon: "thread" },
    { id: "reactions", label: "Reactions" },
];

const uiFont = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Alpha-weighted ink centroid of a painted glyph, expressed as an offset from
 * the center of its own box. Refuses blank or clipped captures: the glyph must
 * paint pixels and its ink may not touch the captured box edges.
 */
async function glyphDrift(part: RenderedElement<Element>, name: string) {
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(visible.bounds.y, `${name} ink clipped at top`).toBeGreaterThan(-0.5);
    expect(visible.bounds.y + visible.bounds.height, `${name} ink clipped at bottom`).toBeLessThan(
        box.height + 0.5,
    );
    return {
        dx: visible.center.x - box.width / 2,
        dy: visible.center.y - box.height / 2,
    };
}

it("holds Tabs dimensions, typography, colors, and the active underline for every size", async () => {
    const view = createRenderer();

    const surfaceWidth = 640;
    const pad = 16;
    for (const size of sizes) {
        view.render(
            () => <Tabs activeId="unread" onSelect={() => {}} size={size} tabs={inboxTabs} />,
            { width: surfaceWidth, height: sizeSpec[size].height + 40, padding: pad },
        );
    }
    await view.ready();

    // Pass A — DOM geometry, computed styles, typography and baselines. No
    // pixel captures here: visibleMetrics() repaints ancestor backgrounds and
    // forces reflows, and interleaving it between textMetrics() reads perturbs
    // WebKit's sub-pixel baseline. All ink work is deferred to pass B.
    for (const size of sizes) {
        const spec = sizeSpec[size];
        const bar = view.$(`.happy2-tabs[data-size="${size}"]`);

        // Root: block-level flex bar that fills the surface and owns the
        // bottom hairline; its height is the tab height plus that 1px rule.
        expect(bar.width(), `${size} bar width`).toBe(surfaceWidth - 2 * pad);
        expect(bar.height(), `${size} bar height`).toBe(spec.height + 1);
        expect(
            bar.computedStyles([
                "display",
                "box-sizing",
                "border-bottom-color",
                "border-bottom-style",
                "border-bottom-width",
                "font-family",
            ]),
            `${size} bar contract`,
        ).toEqual({
            display: "flex",
            "box-sizing": "border-box",
            "border-bottom-color": "rgba(255, 255, 255, 0.07)",
            "border-bottom-style": "solid",
            "border-bottom-width": "1px",
            "font-family": uiFont(),
        });

        // Every tab: same height/typography, blockified flex item, transparent
        // borderless background. Active tab is primary text, idle is secondary.
        let sharedBaseline: number | undefined;
        for (const tab of inboxTabs) {
            const active = tab.id === "unread";
            const el = view.$(`.happy2-tabs[data-size="${size}"] [data-tab-id="${tab.id}"]`);
            expect(el.height(), `${size}/${tab.id} height`).toBe(spec.height);
            expect(el.element.getAttribute("role"), `${size}/${tab.id} role`).toBe("tab");
            expect(el.element.getAttribute("aria-selected"), `${size}/${tab.id} selected`).toBe(
                active ? "true" : "false",
            );
            expect(
                el.computedStyles([
                    "align-items",
                    "background-color",
                    "border-top-width",
                    "box-sizing",
                    "color",
                    "cursor",
                    "display",
                    "font-family",
                    "font-size",
                    "font-weight",
                    "height",
                    "line-height",
                    "padding",
                ]),
                `${size}/${tab.id} contract`,
            ).toEqual({
                "align-items": "center",
                "background-color": "rgba(0, 0, 0, 0)",
                "border-top-width": "0px",
                "box-sizing": "border-box",
                color: active ? "rgb(237, 234, 242)" : "rgb(165, 160, 176)",
                cursor: "pointer",
                display: "flex",
                "font-family": uiFont(),
                "font-size": `${spec.fontSize}px`,
                "font-weight": "600",
                height: `${spec.height}px`,
                "line-height": `${spec.lineHeight}px`,
                padding: spec.padding,
            });

            // Label typography + baseline. Every label in the bar shares one
            // browser-laid-out baseline (proves "baseline shared across tabs"),
            // independent of whether the tab carries an icon or a count badge.
            const label = view.$(
                `.happy2-tabs[data-size="${size}"] [data-tab-id="${tab.id}"] [data-happy2-ui="tab-label"]`,
            );
            const metrics = label.textMetrics();
            expect(metrics, `${size}/${tab.id} label metrics`).toMatchObject({
                font: {
                    family: "happy2 Figtree, system-ui, sans-serif",
                    lineHeight: spec.lineHeight,
                    size: spec.fontSize,
                    weight: "600",
                },
                text: tab.label,
            });
            const baseline = metrics.baseline.fromSurfaceTop;
            sharedBaseline ??= baseline;
            expect(
                Math.abs(baseline - sharedBaseline),
                `${size}/${tab.id} shared baseline`,
            ).toBeLessThanOrEqual(0.05);

            // Label box is vertically centered in the tab (layout complement to
            // the baseline metric).
            const labelBounds = label.bounds();
            const tabBounds = el.bounds();
            expect(
                Math.abs(
                    labelBounds.y + labelBounds.height / 2 - (tabBounds.y + tabBounds.height / 2),
                ),
                `${size}/${tab.id} label box centering`,
            ).toBeLessThanOrEqual(0.5);
        }

        // Label-only tab: word ink is horizontally asymmetric, so centering is
        // proven as line-box symmetry (equal left/right inset), not a centroid.
        const plain = view.$(
            `.happy2-tabs[data-size="${size}"] [data-tab-id="reactions"] [data-happy2-ui="tab-label"]`,
        );
        const plainOffsets = plain.offsets();
        expect(
            Math.abs(plainOffsets.left - plainOffsets.right),
            `${size} label-only line-box symmetry`,
        ).toBeLessThanOrEqual(0.5);

        // Active underline: 2px accent bar spanning the full active tab, dropped
        // 1px below the tab box to overlap the container hairline.
        const activeTab = view.$(`.happy2-tabs[data-size="${size}"] [data-tab-id="unread"]`);
        const underline = view.$(
            `.happy2-tabs[data-size="${size}"] [data-tab-id="unread"] [data-happy2-ui="tab-underline"]`,
        );
        const tb = activeTab.bounds();
        const ub = underline.bounds();
        expect(ub.height, `${size} underline height`).toBe(2);
        expect(ub.width, `${size} underline width`).toBe(tb.width);
        expect(Math.abs(ub.x - tb.x), `${size} underline x`).toBeLessThanOrEqual(0.05);
        expect(
            Math.abs(ub.y - tb.y - (spec.height - 1)),
            `${size} underline drop`,
        ).toBeLessThanOrEqual(0.05);
        expect(underline.computedStyle("background-color"), `${size} underline color`).toBe(
            "rgb(139, 124, 247)",
        );

        // Idle tabs carry no underline element at all.
        for (const id of ["all", "mentions", "threads", "reactions"]) {
            expect(
                view
                    .$(`.happy2-tabs[data-size="${size}"] [data-tab-id="${id}"]`)
                    .element.querySelector('[data-happy2-ui="tab-underline"]'),
                `${size}/${id} no underline`,
            ).toBeNull();
        }

        // Exactly one active tab per bar.
        expect(
            view.$(`.happy2-tabs[data-size="${size}"]`).element.querySelectorAll("[data-active]")
                .length,
            `${size} single active`,
        ).toBe(1);

        // Leading icon box + trailing CountBadge geometry (DOM only).
        for (const id of ["all", "mentions"]) {
            const iconBox = view.$(
                `.happy2-tabs[data-size="${size}"] [data-tab-id="${id}"] [data-happy2-ui="tab-icon"]`,
            );
            const tab = view.$(`.happy2-tabs[data-size="${size}"] [data-tab-id="${id}"]`);
            expect(iconBox.bounds().width, `${size}/${id} icon box w`).toBe(spec.icon);
            expect(iconBox.bounds().height, `${size}/${id} icon box h`).toBe(spec.icon);
            expect(
                Math.abs(iconBox.bounds().y - tab.bounds().y - (spec.height - spec.icon) / 2),
                `${size}/${id} icon vertical box centering`,
            ).toBeLessThanOrEqual(0.1);
        }

        const badgeCases = [
            { id: "unread", tone: "accent" },
            { id: "mentions", tone: "neutral" },
        ] as const;
        for (const { id, tone } of badgeCases) {
            const tab = view.$(`.happy2-tabs[data-size="${size}"] [data-tab-id="${id}"]`);
            const label = view.$(
                `.happy2-tabs[data-size="${size}"] [data-tab-id="${id}"] [data-happy2-ui="tab-label"]`,
            );
            const badge = view.$(
                `.happy2-tabs[data-size="${size}"] [data-tab-id="${id}"] [data-happy2-ui="count-badge"]`,
            );
            expect(badge.element.getAttribute("data-tone"), `${size}/${id} badge tone`).toBe(tone);
            expect(badge.height(), `${size}/${id} badge height`).toBe(18);
            const lb = label.bounds();
            const bb = badge.bounds();
            expect(
                Math.abs(bb.x - (lb.x + lb.width) - spec.gap),
                `${size}/${id} label→badge gap`,
            ).toBeLessThanOrEqual(0.05);
            expect(
                Math.abs(bb.y + bb.height / 2 - (tab.bounds().y + tab.bounds().height / 2)),
                `${size}/${id} badge vertical centering`,
            ).toBeLessThanOrEqual(0.6);
        }
    }

    // Pass B — painted-ink measurements. Each visibleMetrics() capture guards
    // pixelCount > 0 so a blank/clipped screenshot can never pass silently.
    for (const size of sizes) {
        // Active underline actually paints its accent bar.
        expect(
            (
                await view
                    .$(
                        `.happy2-tabs[data-size="${size}"] [data-tab-id="unread"] [data-happy2-ui="tab-underline"]`,
                    )
                    .visibleMetrics()
            ).pixelCount,
            `${size} underline ink`,
        ).toBeGreaterThan(0);

        // Label ink present and unclipped inside its own line box.
        for (const tab of inboxTabs) {
            const label = view.$(
                `.happy2-tabs[data-size="${size}"] [data-tab-id="${tab.id}"] [data-happy2-ui="tab-label"]`,
            );
            const ink = await label.visibleMetrics();
            const box = label.bounds();
            expect(ink.pixelCount, `${size}/${tab.id} label ink`).toBeGreaterThan(0);
            expect(ink.bounds.y, `${size}/${tab.id} label ink top`).toBeGreaterThan(-0.5);
            expect(
                ink.bounds.y + ink.bounds.height,
                `${size}/${tab.id} label ink bottom`,
            ).toBeLessThan(box.height + 0.5);
        }

        // Leading-icon glyph optically centered in its box. Icon.tsx verifies
        // centroid <=0.4 at 14/16/20; the large (18) box gets the 0.75 optical
        // ceiling since 18 is not in that verified set.
        for (const id of ["all", "mentions"]) {
            const svg = view.$(
                `.happy2-tabs[data-size="${size}"] [data-tab-id="${id}"] [data-happy2-ui="tab-icon"] svg`,
            );
            const drift = await glyphDrift(svg, `${size}/${id} icon`);
            const ceiling = size === "large" ? 0.75 : 0.4;
            expect(
                Math.abs(drift.dx),
                `${size}/${id} icon centroid x ${drift.dx}`,
            ).toBeLessThanOrEqual(ceiling);
            expect(
                Math.abs(drift.dy),
                `${size}/${id} icon centroid y ${drift.dy}`,
            ).toBeLessThanOrEqual(ceiling);
        }

        // Trailing badge digits paint (guards a blank count pill).
        for (const id of ["unread", "mentions"]) {
            const badgeInk = view.$(
                `.happy2-tabs[data-size="${size}"] [data-tab-id="${id}"] [data-happy2-ui="count-badge-label"]`,
            );
            expect(
                (await badgeInk.visibleMetrics()).pixelCount,
                `${size}/${id} badge ink`,
            ).toBeGreaterThan(0);
        }
    }

    await view.screenshot("Tabs.test");
}, 120_000);

it("holds Tabs arity, active sweep, and count badges", async () => {
    const view = createRenderer();

    const two: TabItem[] = [
        { id: "a", label: "Overview" },
        { id: "b", label: "Activity", badge: 9 },
    ];
    const admin: TabItem[] = [
        { id: "members", label: "Members", badge: 128 },
        { id: "bans", label: "Bans", badge: 4 },
        { id: "audit", label: "Audit log" },
        { id: "backups", label: "Backups" },
    ];

    view.render(() => <Tabs activeId="a" onSelect={() => {}} tabs={two} />, {
        width: 420,
        height: 80,
        padding: 16,
    });
    view.render(() => <Tabs activeId="members" onSelect={() => {}} tabs={admin} />, {
        width: 520,
        height: 80,
        padding: 16,
    });
    // Active sweep: same tab set, active moving across three positions.
    for (const active of ["all", "mentions", "reactions"] as const) {
        view.render(() => <Tabs activeId={active} onSelect={() => {}} tabs={inboxTabs} />, {
            width: 640,
            height: 80,
            padding: 16,
        });
    }
    await view.ready();

    // Arity: each bar renders exactly its tab count and one active underline.
    for (const [selector, count, activeId] of [
        ['.happy2-tabs [data-tab-id="a"]', 2, "a"],
        ['.happy2-tabs [data-tab-id="members"]', 4, "members"],
    ] as const) {
        const bar = view.$(selector).element.closest(".happy2-tabs")!;
        expect(bar.querySelectorAll('[data-happy2-ui="tab"]').length, `${activeId} arity`).toBe(
            count,
        );
        expect(
            bar.querySelectorAll('[data-happy2-ui="tab-underline"]').length,
            `${activeId} one underline`,
        ).toBe(1);
        expect(
            bar
                .querySelector(`[data-tab-id="${activeId}"] [data-happy2-ui="tab-underline"]`)
                ?.parentElement?.getAttribute("data-tab-id"),
            `${activeId} underline on active`,
        ).toBe(activeId);
    }

    // Count badge grows with digit count (CountBadge stepped width 18/25/32).
    const twoBar = view.$('[data-tab-id="a"]').element.closest(".happy2-tabs")!;
    const b9 = twoBar.querySelector('[data-tab-id="b"] [data-happy2-ui="count-badge"]');
    expect((b9 as HTMLElement).getBoundingClientRect().width, "single-digit badge").toBe(18);
    const adminBar = view.$('[data-tab-id="members"]').element.closest(".happy2-tabs")!;
    const b128 = adminBar.querySelector('[data-tab-id="members"] [data-happy2-ui="count-badge"]');
    expect(
        (b128 as HTMLElement).getBoundingClientRect().width,
        "triple-digit badge",
    ).toBeGreaterThan(18);

    // Sweep: active underline follows activeId, all bars agree on tab height.
    for (const active of ["all", "mentions", "reactions"] as const) {
        const tab = view.$(`[data-tab-id="${active}"][aria-selected="true"]`);
        expect(tab.height(), `${active} swept height`).toBe(40);
        const underline = view.$(
            `[data-tab-id="${active}"][aria-selected="true"] [data-happy2-ui="tab-underline"]`,
        );
        expect(underline.bounds().width, `${active} swept underline width`).toBe(
            tab.bounds().width,
        );
    }

    await view.screenshot("Tabs.variants.test");
}, 120_000);

it("fires onSelect with the tab id when a tab is clicked", async () => {
    const onSelect = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <Tabs
                activeId="all"
                onSelect={onSelect}
                tabs={[
                    { id: "all", label: "All" },
                    { id: "unread", label: "Unread", badge: 3 },
                ]}
            />
        ),
        { width: 320, height: 72, padding: 16 },
    );
    await view.ready();

    (view.$('[data-tab-id="unread"]').element as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("unread");
});
