import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/build-progress-panel.css";
import { BuildProgressPanel } from "./BuildProgressPanel";
import { createRenderer, type RenderedElement } from "./testing";

const monoFamily = () =>
    server.browser === "webkit"
        ? "happy2 Mono, ui-monospace, monospace"
        : '"happy2 Mono", ui-monospace, monospace';

/* Asserts a text/glyph part paints and its ink stays inside its own box (never
 * a blank or vertically clipped capture). */
async function paints(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThanOrEqual(0);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThanOrEqual(
        box.height + 0.5,
    );
    return vis;
}

const failedLog = [
    "resolved base image node:20-bookworm-slim",
    "pulling layer sha256:9f3e… (12.4 MB)",
    "extracting rootfs → /var/lib/daycare/base",
    "running provisioning step 3/6: apt-get install -y build-essential",
    "E: Unable to locate package build-essentail",
    "provisioning step 3/6 exited with code 100",
    "build aborted after 42s",
].join("\n");

const longCurrent =
    "pulling layer sha256:1ab7… (48.9 MB) → extracting rootfs to /var/lib/daycare/base/overlay/diff/really/long/path";

it("holds BuildProgressPanel layout, progress geometry, typography, log, and failure states", async () => {
    const view = createRenderer();
    let retries = 0;

    view.render(
        () => (
            <BuildProgressPanel
                currentLogLine={longCurrent}
                data-testid="bp-building"
                progress={45}
                status="building"
                statusLabel="Downloading base layers"
                title="Daycare Minimal"
            />
        ),
        { width: 400, height: 168 },
    );
    view.render(
        () => (
            <BuildProgressPanel
                currentLogLine="tagged daycare-minimal:latest"
                data-testid="bp-ready"
                progress={100}
                status="ready"
                statusLabel="Build complete"
                title="Daycare Minimal"
            />
        ),
        { width: 400, height: 140 },
    );
    view.render(
        () => (
            <BuildProgressPanel
                data-testid="bp-pending"
                progress={0}
                status="pending"
                statusLabel="Queued behind 2 builds"
                title="Research Heavy"
            />
        ),
        { width: 400, height: 120 },
    );
    view.render(
        () => (
            <BuildProgressPanel
                data-testid="bp-failed"
                error="Provisioning step 3/6 failed: package build-essentail could not be located."
                log={failedLog}
                logTruncated
                onRetry={() => (retries += 1)}
                progress={38}
                status="failed"
                statusLabel="Build failed while provisioning"
                title="Research Heavy"
            />
        ),
        { width: 480, height: 380 },
    );
    view.render(
        () => (
            <BuildProgressPanel
                data-testid="bp-retrying"
                error="Provisioning step 3/6 failed: package build-essentail could not be located."
                log={failedLog}
                progress={38}
                retrying
                status="failed"
                statusLabel="Retrying build"
                title="Research Heavy"
            />
        ),
        { width: 480, height: 380 },
    );
    view.render(
        () => (
            <BuildProgressPanel
                data-testid="bp-over"
                progress={140}
                status="building"
                statusLabel="Almost there"
                title="Clamp Over"
            />
        ),
        { width: 400, height: 120 },
    );
    view.render(
        () => (
            <BuildProgressPanel
                data-testid="bp-under"
                progress={-5}
                status="building"
                statusLabel="Just starting"
                title="Clamp Under"
            />
        ),
        { width: 400, height: 120 },
    );
    await view.ready();

    /* ---- Root: flex column card on the app surface --------------------- */

    const root = view.$('[data-testid="bp-building"]');
    expect(root.element.tagName).toBe("DIV");
    expect(root.element.getAttribute("data-status")).toBe("building");
    expect(
        root.computedStyles([
            "background-color",
            "border-top-left-radius",
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "font-family",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-top-left-radius": "10px",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        display: "flex",
        "flex-direction": "column",
        "font-family":
            server.browser === "webkit"
                ? "happy2 Figtree, system-ui, sans-serif"
                : '"happy2 Figtree", system-ui, sans-serif',
        "padding-bottom": "20px",
        "padding-left": "20px",
        "padding-right": "20px",
        "padding-top": "20px",
    });

    /* ---- Header: title typography + phase badge ------------------------ */

    const title = view.$('[data-testid="bp-building"] [data-happy2-ui="build-progress-title"]');
    expect(title.textMetrics().text).toBe("Daycare Minimal");
    expect(title.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(0, 0, 0)",
        "font-size": "15px",
        "font-weight": "600",
        "line-height": "20px",
    });
    await paints(title, "title");

    const badgeLabel = (testid: string) =>
        view
            .$(`[data-testid="${testid}"] [data-happy2-ui="badge-label"]`)
            .element.textContent?.trim();
    expect(badgeLabel("bp-building")).toBe("BUILDING");
    expect(badgeLabel("bp-ready")).toBe("READY");
    expect(badgeLabel("bp-pending")).toBe("QUEUED");
    expect(badgeLabel("bp-failed")).toBe("FAILED");
    /* Ready badge carries the check-circle glyph. */
    expect(
        view
            .$('[data-testid="bp-ready"] [data-happy2-ui="badge"] [data-happy2-ui="icon"]')
            .element.getAttribute("data-name"),
    ).toBe("check-circle");

    /* ---- Progress track + fill geometry -------------------------------- */

    const track = view.$('[data-testid="bp-building"] [data-happy2-ui="build-progress-track"]');
    const fill = view.$('[data-testid="bp-building"] [data-happy2-ui="build-progress-fill"]');
    expect(track.height()).toBe(8);
    /* Track spans the full 358px content measure (400 − 2×1 border − 2×20 pad). */
    const rootInner = root.bounds().width - 2 - 40;
    expect(Math.abs(track.width() - rootInner)).toBeLessThanOrEqual(0.5);
    expect(track.computedStyle("border-top-left-radius")).toBe("999px");
    expect(track.computedStyle("overflow-x")).toBe("hidden");
    /* Fill width is exactly 45% of the track within 1px, accent-colored. */
    expect(Math.abs(fill.width() - 0.45 * track.width())).toBeLessThanOrEqual(1);
    expect(fill.computedStyle("background-color")).toBe("rgb(43, 172, 204)");

    /* Ready: fill forced to the full track width, success-colored. */
    const readyTrack = view.$('[data-testid="bp-ready"] [data-happy2-ui="build-progress-track"]');
    const readyFill = view.$('[data-testid="bp-ready"] [data-happy2-ui="build-progress-fill"]');
    expect(Math.abs(readyFill.width() - readyTrack.width())).toBeLessThanOrEqual(0.5);
    expect(readyFill.computedStyle("background-color")).toBe("rgb(52, 199, 89)");

    /* Numeric clamp: >100 saturates to the full width, <0 collapses to zero. */
    const overTrack = view.$('[data-testid="bp-over"] [data-happy2-ui="build-progress-track"]');
    const overFill = view.$('[data-testid="bp-over"] [data-happy2-ui="build-progress-fill"]');
    expect(Math.abs(overFill.width() - overTrack.width())).toBeLessThanOrEqual(0.5);
    const underFill = view.$('[data-testid="bp-under"] [data-happy2-ui="build-progress-fill"]');
    expect(underFill.width()).toBe(0);
    expect(
        view
            .$('[data-testid="bp-over"] [data-happy2-ui="build-progress-percent"]')
            .element.textContent?.trim(),
    ).toBe("100%");
    expect(
        view
            .$('[data-testid="bp-under"] [data-happy2-ui="build-progress-percent"]')
            .element.textContent?.trim(),
    ).toBe("0%");

    /* ---- Status line: label + tabular mono percent --------------------- */

    const statusLabel = view.$(
        '[data-testid="bp-building"] [data-happy2-ui="build-progress-status-label"]',
    );
    expect(statusLabel.textMetrics().text).toBe("Downloading base layers");
    expect(
        statusLabel.computedStyles(["color", "font-size", "font-weight", "line-height"]),
    ).toEqual({
        color: "rgb(73, 69, 79)",
        "font-size": "13px",
        "font-weight": "500",
        "line-height": "18px",
    });
    const percent = view.$('[data-testid="bp-building"] [data-happy2-ui="build-progress-percent"]');
    expect(percent.element.textContent?.trim()).toBe("45%");
    expect(percent.computedStyle("font-family")).toBe(monoFamily());
    await paints(statusLabel, "status label");

    /* ---- Current log line: monospace, single line, ellipsis ------------ */

    const current = view.$(
        '[data-testid="bp-building"] [data-happy2-ui="build-progress-current-text"]',
    );
    expect(current.computedStyles(["font-family", "text-overflow", "white-space"])).toEqual({
        "font-family": monoFamily(),
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    /* The long single line overflows its box and is clipped (not wrapped). */
    expect(current.element.scrollWidth, "current log line truncates").toBeGreaterThan(
        current.element.clientWidth,
    );
    /* Hidden entirely once the build is ready. */
    expect(
        view.container.querySelector(
            '[data-testid="bp-ready"] [data-happy2-ui="build-progress-current"]',
        ),
        "current log line hidden when ready",
    ).toBeNull();

    /* ---- Retained log block + truncation note -------------------------- */

    const log = view.$('[data-testid="bp-failed"] [data-happy2-ui="build-progress-log"]');
    expect(log.element.tagName).toBe("PRE");
    expect(
        log.computedStyles([
            "background-color",
            "font-family",
            "max-height",
            "overflow-x",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(246, 248, 250)",
        "font-family": monoFamily(),
        "max-height": "160px",
        "overflow-x": "auto",
        "overflow-y": "auto",
    });
    await paints(log, "retained log");

    const truncated = view.$(
        '[data-testid="bp-failed"] [data-happy2-ui="build-progress-truncated"]',
    );
    expect(truncated.element.textContent?.trim()).toBe("Earlier log truncated");
    expect(truncated.computedStyle("color")).toBe("rgb(142, 142, 147)");
    /* No truncation note when logTruncated is not set. */
    expect(
        view.container.querySelector(
            '[data-testid="bp-retrying"] [data-happy2-ui="build-progress-truncated"]',
        ),
        "no truncation note without logTruncated",
    ).toBeNull();

    /* ---- Failure block: error text + Retry ----------------------------- */

    const errorText = view.$(
        '[data-testid="bp-failed"] [data-happy2-ui="build-progress-error-text"]',
    );
    expect(errorText.computedStyle("color")).toBe("rgb(244, 67, 54)");
    await paints(errorText, "error text");

    const retry = view.$('[data-testid="bp-failed"] [data-happy2-ui="button"]');
    expect(
        view
            .$('[data-testid="bp-failed"] [data-happy2-ui="button-label"]')
            .element.textContent?.trim(),
    ).toBe("Retry build");
    expect((retry.element as HTMLButtonElement).disabled).toBe(false);
    (retry.element as HTMLButtonElement).click();
    expect(retries).toBe(1);

    /* No failure block (or Retry) on a non-failed panel. */
    expect(
        view.container.querySelector(
            '[data-testid="bp-building"] [data-happy2-ui="build-progress-error"]',
        ),
        "no failure block while building",
    ).toBeNull();

    /* ---- Retrying: disabled Retry + static ring ------------------------ */

    const retryingButton = view.$('[data-testid="bp-retrying"] [data-happy2-ui="button"]');
    expect((retryingButton.element as HTMLButtonElement).disabled).toBe(true);

    const spinner = view.$('[data-testid="bp-retrying"] [data-happy2-ui="build-progress-spinner"]');
    expect(spinner.bounds()).toMatchObject({ width: 20, height: 20 });
    expect(
        spinner.computedStyles(["border-radius", "border-top-color", "border-top-width"]),
    ).toEqual({
        "border-radius": "999px",
        "border-top-color": "rgb(43, 172, 204)",
        "border-top-width": "2px",
    });
    /* Static ring paints an unclipped, geometrically centered contour. */
    const ring = await spinner.visibleMetrics();
    expect(ring.pixelCount, "spinner paints no pixels").toBeGreaterThan(0);
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

    await view.screenshot("BuildProgressPanel.test");
}, 120_000);
