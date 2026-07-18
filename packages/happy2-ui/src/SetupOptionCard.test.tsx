import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/setup-option-card.css";
import "./styles/badge.css";
import "./styles/icon.css";
import { SetupOptionCard } from "./SetupOptionCard";
import { createRenderer, type RenderedElement } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Alpha-weighted ink centroid of `partSelector` (a painted glyph with no
 * optical nudge of its own), expressed as an offset from the center of
 * `hostSelector` (positive = right / low). Refuses a blank or clipped capture:
 * the part must paint pixels and its ink may not touch any edge of the captured
 * box, so a truncated screenshot can never pass silently.
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

/* Asserts a text part paints and its ink stays inside its own line box (never a
 * blank or vertically clipped capture). */
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

const part = (view: Renderer, testId: string, name: string) =>
    view.$(`[data-testid="${testId}"] [data-happy2-ui="${name}"]`);

it("holds SetupOptionCard layout, typography, selection, and status geometry", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
                <SetupOptionCard
                    data-testid="selected"
                    icon="terminal"
                    meta="Docker 25.0.3"
                    recommended
                    selected
                    status={{ label: "HEALTHY", variant: "success", icon: "check-circle" }}
                    title="Docker"
                />
                <SetupOptionCard
                    data-testid="chip"
                    description="Ubuntu 24.04 with the standard agent toolchain preinstalled."
                    icon="code"
                    meta="Download and build"
                    status={{ label: "READY", variant: "info" }}
                    title="Standard base image"
                />
                <SetupOptionCard
                    data-testid="disabled"
                    description="Runs each agent in an isolated local container."
                    disabled
                    hint="Start the Docker daemon, then reopen this step."
                    hintTone="danger"
                    icon="shield"
                    status={{ label: "UNAVAILABLE", variant: "danger" }}
                    title="Docker"
                />
                <SetupOptionCard
                    data-testid="pending"
                    icon="image"
                    meta="Download and build"
                    pending
                    title="Custom base image"
                />
            </div>
        ),
        { width: 440, height: 640, padding: 16 },
    );
    await view.ready();

    /* ---- Root: full-width button on the 4px grid ----------------------- */

    const selected = view.$('[data-testid="selected"]');
    expect(selected.element.tagName).toBe("BUTTON");
    expect((selected.element as HTMLButtonElement).type).toBe("button");
    /* Full width: fills the 440px surface minus its 16px padding on both sides. */
    expect(selected.bounds().width).toBe(408);

    const chip = view.$('[data-testid="chip"]');
    expect(
        chip.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "box-sizing",
            "color",
            "cursor",
            "display",
            "font-family",
            "gap",
            "padding",
        ]),
    ).toEqual({
        "align-items": "flex-start",
        "background-color": "rgb(36, 34, 43)",
        "border-radius": "10px",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        cursor: "pointer",
        display: "flex",
        "font-family": fontFamily(),
        gap: "12px",
        padding: "16px",
    });

    /* ---- Selected: accent border + accent-soft fill + trailing check ---- */

    expect(
        selected.computedStyles(["background-color", "border-top-color", "border-top-width"]),
    ).toEqual({
        "background-color": "rgba(139, 124, 247, 0.15)",
        "border-top-color": "rgb(139, 124, 247)",
        "border-top-width": "1px",
    });

    /* ---- Leading icon chip: 36×36, optically centered glyph ------------- */

    const iconChip = part(view, "chip", "setup-option-icon");
    expect(iconChip.bounds()).toMatchObject({ width: 36, height: 36 });
    expect(
        iconChip.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "color",
            "display",
            "justify-content",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-radius": "8px",
        color: "rgb(165, 160, 176)",
        display: "flex",
        "justify-content": "center",
    });
    /* The "code" glyph is bilaterally symmetric on both axes, so it holds a
     * tight optical-centering tolerance in the 36px chip. */
    const glyph = await glyphDrift(
        view,
        '[data-testid="chip"] [data-happy2-ui="setup-option-icon"]',
        '[data-testid="chip"] [data-happy2-ui="setup-option-icon"] svg',
    );
    expect(Math.abs(glyph.dx), "chip glyph horizontal centroid").toBeLessThanOrEqual(0.5);
    expect(Math.abs(glyph.dy), "chip glyph vertical centroid").toBeLessThanOrEqual(0.5);

    /* ---- Body typography + colors + unclipped paint -------------------- */

    const title = part(view, "chip", "setup-option-title");
    expect(title.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(237, 234, 242)",
        "font-size": "15px",
        "font-weight": "600",
        "line-height": "20px",
    });
    expect(title.textMetrics().text).toBe("Standard base image");
    await paints(title, "title");

    const description = part(view, "chip", "setup-option-description");
    expect(
        description.computedStyles(["color", "font-size", "font-weight", "line-height"]),
    ).toEqual({
        color: "rgb(165, 160, 176)",
        "font-size": "13px",
        "font-weight": "400",
        "line-height": "18px",
    });
    await paints(description, "description");

    const meta = part(view, "chip", "setup-option-meta");
    expect(meta.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "12px",
        "font-weight": "500",
        "line-height": "16px",
    });
    expect(meta.textMetrics().text).toBe("Download and build");
    await paints(meta, "meta");

    const hint = part(view, "disabled", "setup-option-hint");
    expect(hint.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(248, 113, 113)",
        "font-size": "12px",
        "font-weight": "400",
        "line-height": "16px",
    });
    await paints(hint, "hint");

    const recommended = part(view, "selected", "setup-option-recommended");
    expect(recommended.computedStyles(["color", "text-transform"])).toEqual({
        color: "rgb(139, 124, 247)",
        "text-transform": "uppercase",
    });

    /* ---- Status Badge pinned to the trailing end of the title row ------- */

    const row = part(view, "selected", "setup-option-title-row");
    const status = part(view, "selected", "setup-option-status");
    const rowBounds = row.bounds();
    const statusBounds = status.bounds();
    /* Right edges align: the pill is pushed to the row end. */
    expect(
        Math.abs(rowBounds.x + rowBounds.width - (statusBounds.x + statusBounds.width)),
        "status pinned to row right edge",
    ).toBeLessThanOrEqual(0.5);
    /* And it sits in the right half of the row, not next to the title. */
    expect(statusBounds.x - rowBounds.x, "status pushed past row midpoint").toBeGreaterThan(
        rowBounds.width / 2,
    );
    expect(
        status.element.querySelector('[data-happy2-ui="badge"]'),
        "status renders a Badge",
    ).not.toBeNull();

    /* ---- Selected shows the check-circle, not the ring ------------------ */

    expect(
        view.container.querySelector(
            '[data-testid="selected"] [data-happy2-ui="setup-option-spinner"]',
        ),
        "selected has no ring",
    ).toBeNull();
    const check = part(view, "selected", "setup-option-check");
    expect(check.computedStyle("color")).toBe("rgb(139, 124, 247)");
    const checkGlyph = await glyphDrift(
        view,
        '[data-testid="selected"] [data-happy2-ui="setup-option-trailing"]',
        '[data-testid="selected"] [data-happy2-ui="setup-option-check"] svg',
    );
    expect(Math.abs(checkGlyph.dx), "check glyph horizontal centroid").toBeLessThanOrEqual(0.5);
    expect(Math.abs(checkGlyph.dy), "check glyph vertical centroid").toBeLessThanOrEqual(0.5);

    /* ---- Disabled: dimmed, not-allowed, native control disabled -------- */

    const disabled = view.$('[data-testid="disabled"]');
    expect((disabled.element as HTMLButtonElement).disabled).toBe(true);
    expect(disabled.computedStyles(["cursor", "opacity"])).toEqual({
        cursor: "not-allowed",
        opacity: "0.55",
    });

    /* ---- Pending: static ring, native control disabled, no check ------- */

    const pending = view.$('[data-testid="pending"]');
    expect((pending.element as HTMLButtonElement).disabled).toBe(true);
    expect(
        view.container.querySelector(
            '[data-testid="pending"] [data-happy2-ui="setup-option-check"]',
        ),
        "pending has no check",
    ).toBeNull();
    const spinner = part(view, "pending", "setup-option-spinner");
    expect(spinner.bounds()).toMatchObject({ width: 20, height: 20 });
    expect(
        spinner.computedStyles([
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
        ]),
    ).toEqual({
        "border-radius": "999px",
        "border-top-color": "rgb(139, 124, 247)",
        "border-top-width": "2px",
        "box-sizing": "border-box",
    });
    /* Static ring paints an unclipped, geometrically centered contour. */
    const ring = await spinner.visibleMetrics();
    expect(ring.pixelCount, "ring paints no pixels").toBeGreaterThan(0);
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

    await view.screenshot("SetupOptionCard.test");
}, 120_000);

it("invokes onSelect on click and never while disabled", async () => {
    const view = createRenderer();
    const onEnabled = vi.fn();
    const onDisabled = vi.fn();

    view.render(
        () => (
            <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
                <SetupOptionCard
                    data-testid="clickable"
                    icon="users"
                    onSelect={onEnabled}
                    title="Open"
                />
                <SetupOptionCard
                    data-testid="blocked"
                    disabled
                    icon="shield"
                    onSelect={onDisabled}
                    title="Closed"
                />
            </div>
        ),
        { width: 440, height: 200, padding: 16 },
    );
    await view.ready();

    const clickable = view.$('[data-testid="clickable"]');
    clickable.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onEnabled, "enabled card fires onSelect").toHaveBeenCalledTimes(1);

    /* A disabled native button does not dispatch a click to its handler. */
    (view.$('[data-testid="blocked"]').element as HTMLButtonElement).click();
    expect(onDisabled, "disabled card never fires onSelect").not.toHaveBeenCalled();
}, 120_000);
