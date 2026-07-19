import "@fontsource-variable/jetbrains-mono/index.css";
import { expect, it } from "vitest";
import { createRenderer } from "happy2-gym/playwright";
import { server, userEvent } from "vitest/browser";

function renderer() {
    return createRenderer<HTMLElement>((component, surface) => {
        const element = component();
        surface.append(element);
        return () => element.remove();
    });
}

it("clears inherited pointer hover once without erasing intentional hover", async () => {
    const view = renderer().render(
        () => {
            const wrapper = document.createElement("div");
            const style = document.createElement("style");
            style.textContent = `
                [data-testid="hover-target"] {
                    background: rgb(255 255 255);
                }
                [data-testid="hover-child"] {
                    background: rgb(255 255 255);
                    height: 16px;
                    transition: background-color 120ms ease;
                    width: 16px;
                }
                [data-testid="hover-target"]:hover [data-testid="hover-child"] {
                    background: rgb(0 0 0);
                }
            `;
            const element = document.createElement("button");
            element.dataset.testid = "hover-target";
            Object.assign(element.style, {
                height: "32px",
                width: "80px",
            });
            element.addEventListener("pointerleave", () => {
                element.style.setProperty("--pointer-leave", "observed");
            });
            const child = document.createElement("span");
            child.dataset.testid = "hover-child";
            element.append(child);
            wrapper.append(style, element);
            return wrapper;
        },
        { height: 80, width: 140 },
    );
    const target = view.$('[data-testid="hover-target"]').element as HTMLElement;
    const child = view.$('[data-testid="hover-child"]').element;
    await userEvent.hover(target);
    for (const animation of child.getAnimations()) animation.finish();
    expect(target.matches(":hover")).toBe(true);
    expect(getComputedStyle(child).backgroundColor).toBe("rgb(0, 0, 0)");

    await view.ready();
    expect(target.matches(":hover")).toBe(false);
    expect(getComputedStyle(child).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(target.style.getPropertyValue("--pointer-leave")).toBe("observed");

    await userEvent.hover(target);
    for (const animation of child.getAnimations()) animation.finish();
    await view.ready();
    expect(target.matches(":hover")).toBe(true);
    expect(getComputedStyle(child).backgroundColor).toBe("rgb(0, 0, 0)");
});

it("measures rendered coordinates and computed CSS", () => {
    const view = renderer().render(
        () => {
            const element = document.createElement("div");
            element.dataset.testid = "geometry";
            Object.assign(element.style, {
                backgroundColor: "rgb(18, 52, 86)",
                boxSizing: "border-box",
                height: "20px",
                left: "17.5px",
                position: "absolute",
                top: "23.25px",
                transform: "translate(0.5px, 0.25px)",
                width: "40px",
            });
            return element;
        },
        { height: 100, padding: 11, width: 120 },
    );

    const element = view.$('[data-testid="geometry"]');
    expect(element.bounds()).toEqual({ x: 18, y: 23.5, width: 40, height: 20 });
    expect(element.offsets()).toEqual({ top: 23.5, right: 62, bottom: 56.5, left: 18 });
    expect(element.computedStyles(["background-color", "box-sizing", "height", "width"])).toEqual({
        "background-color": "rgb(18, 52, 86)",
        "box-sizing": "border-box",
        height: "20px",
        width: "40px",
    });

    const surfacePage = element.element.parentElement!.getBoundingClientRect();
    expect(element.pageBounds()).toEqual({
        x: Math.round((surfacePage.x + 18 + window.scrollX) * 1_000) / 1_000,
        y: Math.round((surfacePage.y + 23.5 + window.scrollY) * 1_000) / 1_000,
        width: 40,
        height: 20,
    });
});

it("finds the alpha-weighted optical center of every visible pixel", async () => {
    const view = renderer().render(
        () => {
            const element = document.createElement("div");
            element.dataset.testid = "pixels";
            Object.assign(element.style, {
                height: "2.5px",
                left: "20.25px",
                position: "absolute",
                top: "20.25px",
                width: "6.5px",
            });

            const opaque = document.createElement("span");
            Object.assign(opaque.style, {
                background: "rgb(20, 40, 60)",
                height: "2px",
                left: "0.25px",
                position: "absolute",
                top: "0.25px",
                width: "2px",
            });
            const translucent = document.createElement("span");
            Object.assign(translucent.style, {
                background: "rgb(80 100 120 / 0.5)",
                height: "2px",
                left: "4.25px",
                position: "absolute",
                top: "0.25px",
                width: "2px",
            });
            element.append(opaque, translucent);
            return element;
        },
        { height: 50, width: 50 },
    );

    const metrics = await view.$('[data-testid="pixels"]').visibleMetrics();
    const rasterOffset = server.browser === "chromium" ? 0.75 : 0.25;
    expect(metrics.bounds).toEqual({ x: rasterOffset, y: rasterOffset, width: 6, height: 2 });
    expect(metrics.pixelCount).toBe(32);
    expect(metrics.alphaMass).toBeCloseTo(24, 1);
    expect(metrics.center.x).toBeCloseTo(2.583 + rasterOffset - 0.25, 2);
    expect(metrics.center.y).toBe(1 + rasterOffset);
});

it("reads the browser's actual text baseline and resulting vertical offset", async () => {
    const view = renderer().render(
        () => {
            const row = document.createElement("div");
            row.dataset.testid = "baseline-row";
            Object.assign(row.style, {
                fontFamily: '"JetBrains Mono Variable"',
                fontSize: "20px",
                fontSynthesis: "none",
                fontWeight: "500",
                left: "20px",
                lineHeight: "32px",
                position: "absolute",
                top: "24px",
                whiteSpace: "nowrap",
            });

            const text = document.createElement("span");
            text.dataset.testid = "baseline-text";
            text.textContent = "Hgx";
            Object.assign(text.style, {
                display: "inline-block",
                transform: "translateY(2px)",
            });

            // An empty inline block independently exposes the row baseline:
            // its bottom margin edge is the CSS inline baseline by definition.
            const expected = document.createElement("span");
            expected.dataset.testid = "expected-baseline";
            Object.assign(expected.style, {
                display: "inline-block",
                height: "0",
                verticalAlign: "baseline",
                width: "0",
            });
            row.append(text, expected);
            return row;
        },
        { height: 100, width: 240 },
    );

    await view.ready();
    expect(document.fonts.check('20px "JetBrains Mono Variable"')).toBe(true);

    const text = view.$('[data-testid="baseline-text"]');
    const expectedBaseline = view.$('[data-testid="expected-baseline"]').bounds().y;
    const metrics = text.textMetrics();
    expect(metrics.font).toMatchObject({
        family: "JetBrains Mono Variable",
        lineHeight: 32,
        size: 20,
        weight: "500",
    });
    expect(metrics.verticalOffset - expectedBaseline).toBeCloseTo(2, 3);
    expect(metrics.baseline.fromSurfaceTop).toBe(metrics.verticalOffset);
    expect(metrics.baseline.fromElementTop).toBe(metrics.ink.baseline);
    expect(metrics.ink.baseline).toBeCloseTo(metrics.verticalOffset - metrics.bounds.y, 3);
    expect(metrics.fontMetrics.advanceWidth).toBeGreaterThan(0);
    expect(metrics.fontMetrics.actualBoundingBox.height).toBeGreaterThan(0);
    expect(metrics.fontMetrics.fontBoundingBox.height).toBeGreaterThan(0);
    expect(view.container.querySelector("[data-gym-baseline-probe]")).toBeNull();
});

it("measures a form-control value or placeholder against the same font baseline", async () => {
    const view = renderer().render(
        () => {
            const container = document.createElement("div");
            const common = {
                border: "0",
                boxSizing: "border-box",
                fontFamily: '"JetBrains Mono Variable"',
                fontSize: "20px",
                fontSynthesis: "none",
                fontWeight: "500",
                height: "32px",
                left: "10px",
                lineHeight: "32px",
                padding: "0",
                position: "absolute",
                width: "100px",
            } as const;

            const input = document.createElement("input");
            input.dataset.testid = "baseline-input";
            input.placeholder = "Hgx";
            Object.assign(input.style, common, { top: "8px" });

            const text = document.createElement("span");
            text.dataset.testid = "baseline-span";
            text.textContent = "Hgx";
            Object.assign(text.style, common, { display: "block", top: "48px" });
            container.append(input, text);
            return container;
        },
        { height: 100, width: 140 },
    );

    await view.ready();
    const input = view.$('[data-testid="baseline-input"]').textMetrics();
    const text = view.$('[data-testid="baseline-span"]').textMetrics();
    expect(input.text).toBe("Hgx");
    expect(input.ink.baseline).toBeCloseTo(text.ink.baseline, 3);
});

it("keeps baseline, font metrics, visible bounds, and optical center independent", async () => {
    const view = renderer().render(
        () => {
            const host = document.createElement("div");
            host.dataset.testid = "numeral-host";
            Object.assign(host.style, {
                alignItems: "center",
                display: "flex",
                height: "18px",
                justifyContent: "center",
                left: "20px",
                position: "absolute",
                top: "20px",
                width: "18px",
            });
            const text = document.createElement("span");
            text.dataset.testid = "numeral";
            text.textContent = "0";
            Object.assign(text.style, {
                display: "block",
                fontFamily: '"JetBrains Mono Variable"',
                fontSize: "11px",
                fontSynthesis: "none",
                fontWeight: "700",
                lineHeight: "18px",
            });
            host.append(text);
            return host;
        },
        { height: 60, width: 60 },
    );
    await view.ready();
    expect(document.fonts.check('700 11px "JetBrains Mono Variable"')).toBe(true);

    const host = view.$('[data-testid="numeral-host"]');
    const text = view.$('[data-testid="numeral"]');
    const layout = text.textMetrics();
    const visible = await text.visibleMetrics();
    const hostBounds = host.bounds();
    const textBounds = text.bounds();

    // Baseline is DOM layout geometry. It is not inferred from glyph pixels.
    expect(layout.baseline.fromSurfaceTop - hostBounds.y).toBeCloseTo(13, 1);
    expect(layout.baseline.fromElementTop).toBeCloseTo(13, 1);

    // Font metrics are the browser's raw Canvas TextMetrics values.
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.font = 'normal 700 11px "JetBrains Mono Variable"';
    const direct = context.measureText("0");
    expect(layout.fontMetrics.advanceWidth).toBeCloseTo(direct.width, 3);
    expect(layout.fontMetrics.actualBoundingBox.ascent).toBeCloseTo(
        direct.actualBoundingBoxAscent,
        3,
    );
    expect(layout.fontMetrics.actualBoundingBox.descent).toBeCloseTo(
        direct.actualBoundingBoxDescent,
        3,
    );

    // Visible bounds use the shared backing-pixel grid, even though the
    // centered text element itself begins at a fractional CSS coordinate.
    expect(textBounds.x % 1).not.toBe(0);
    const inkLeft = textBounds.x - hostBounds.x + visible.bounds.x;
    const inkTop = textBounds.y - hostBounds.y + visible.bounds.y;
    const inkCenterX = inkLeft + visible.bounds.width / 2;
    const inkCenterY = inkTop + visible.bounds.height / 2;
    expect(inkTop).toBe(4.5);
    expect(visible.bounds.height).toBe(9);
    expect(Math.abs(inkCenterX - 9)).toBeLessThanOrEqual(0.25);
    expect(inkCenterY).toBe(9);

    // Optical center is alpha-weighted and therefore remains a separate,
    // content-dependent number from the rectangular visible-bounds center.
    const opticalX = textBounds.x - hostBounds.x + visible.center.x;
    const opticalY = textBounds.y - hostBounds.y + visible.center.y;
    expect(Math.abs(opticalX - 9)).toBeLessThanOrEqual(0.25);
    const expectedOpticalY = server.browser === "webkit" ? -0.082 : -0.08;
    expect(Math.abs(opticalY - 9 - expectedOpticalY)).toBeLessThanOrEqual(0.005);
    expect(opticalY).not.toBe(inkCenterY);

    // Canvas boxes are outline/font metrics, not the raster bounds. Keeping
    // the values unequal is the regression guard against conflating them.
    expect(
        Math.abs(layout.fontMetrics.actualBoundingBox.width - visible.bounds.width),
    ).toBeGreaterThan(0.25);
    expect(Math.abs(layout.ink.top - visible.bounds.y)).toBeGreaterThan(0.25);
});

it("measures 0.05px font-size rasterization steps in every browser", async () => {
    const corrections = Array.from({ length: 21 }, (_, index) => 10.5 + index * 0.05);
    const modes = ["normal", "precision"] as const;
    const view = renderer().render(
        () => {
            const root = document.createElement("div");
            for (const [row, mode] of modes.entries()) {
                for (const [column, correction] of corrections.entries()) {
                    const host = document.createElement("div");
                    host.dataset.testid = `sweep-host-${mode}-${column}`;
                    Object.assign(host.style, {
                        alignItems: "center",
                        display: "flex",
                        height: "18px",
                        justifyContent: "center",
                        left: `${4 + (column % 10) * 20}px`,
                        position: "absolute",
                        top: `${4 + (Math.floor(column / 10) + row * 3) * 24}px`,
                        width: "18px",
                    });
                    const text = document.createElement("span");
                    text.dataset.testid = `sweep-${mode}-${column}`;
                    text.textContent = "0";
                    Object.assign(text.style, {
                        display: "block",
                        color: "#ffffff",
                        fontFamily: '"JetBrains Mono Variable"',
                        fontSize: `${correction}px`,
                        fontSynthesis: "none",
                        fontWeight: "700",
                        fontVariantNumeric: "lining-nums tabular-nums",
                        lineHeight: "18px",
                        textRendering: mode === "precision" ? "geometricPrecision" : "auto",
                    });
                    host.append(text);
                    root.append(host);
                }
            }
            return root;
        },
        { height: 150, width: 205 },
    );
    await view.ready();
    for (const mode of modes) {
        const values: Array<{ bounds: number; optical: number; size: number }> = [];
        for (const [column, correction] of corrections.entries()) {
            const host = view.$(`[data-testid="sweep-host-${mode}-${column}"]`).bounds();
            const text = view.$(`[data-testid="sweep-${mode}-${column}"]`);
            const textBounds = text.bounds();
            const visible = await text.visibleMetrics();
            values.push({
                size: correction,
                bounds: textBounds.y - host.y + visible.bounds.y + visible.bounds.height / 2 - 9,
                optical: textBounds.y - host.y + visible.center.y - 9,
            });
        }
        const at = (size: number) => values.find((value) => value.size === size)!;
        expect(values).toHaveLength(21);
        expect(Math.abs(at(10.75).optical - at(10.8).optical)).toBeGreaterThan(0.005);
        if (mode === "normal") {
            expect(Math.abs(at(10.8).optical)).toBeLessThan(Math.abs(at(11).optical));
        }

        const expectedOptical =
            server.browser === "webkit"
                ? -0.09
                : mode === "precision" && server.browser === "chromium"
                  ? 0.055
                  : -0.007;
        const expectedBounds = mode === "precision" && server.browser === "chromium" ? 0.25 : 0;
        expect(at(10.8).optical).toBeCloseTo(expectedOptical, 3);
        expect(at(10.8).bounds).toBeCloseTo(expectedBounds, 3);
    }
});
