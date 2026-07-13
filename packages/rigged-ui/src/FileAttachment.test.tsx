import "./styles.css";
import type { JSX } from "solid-js";
import { expect, it } from "vitest";
import { FileAttachment } from "./FileAttachment";
import { createRenderer } from "./testing";

function stage(testid: string, children: JSX.Element) {
    return (
        <div
            data-testid={testid}
            style={{
                background: "#17161c",
                "box-sizing": "border-box",
                display: "block",
                height: "100%",
                padding: "8px",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}

it("holds FileAttachment geometry, typography, truncation, and interactivity", async () => {
    const view = createRenderer();

    view.render(
        () =>
            stage(
                "fa",
                <FileAttachment
                    name="Relay Flagship (standalone).html"
                    onOpen={() => {}}
                    size="283 KB"
                />,
            ),
        { width: 440, height: 56 },
    );
    view.render(() => stage("ro", <FileAttachment name="notes.txt" size="12 KB" />), {
        width: 440,
        height: 56,
    });
    view.render(
        () =>
            stage(
                "trunc",
                <FileAttachment
                    name="Q3-mobile-launch-readiness-review-final-FINAL-v2.pdf"
                    onOpen={() => {}}
                    size="1.7 MB"
                />,
            ),
        { width: 260, height: 56 },
    );
    await view.ready();

    /* ---- Clickable pill contract --------------------------------------- */

    const fa = view.$('[data-testid="fa"] [data-rigged-ui="file-attachment"]');
    expect(fa.element.tagName, "clickable → real button").toBe("BUTTON");
    expect(fa.element.getAttribute("type")).toBe("button");
    expect(fa.element.getAttribute("aria-label")).toBe("Open Relay Flagship (standalone).html");
    expect(fa.bounds().height).toBe(36);
    expect(
        fa.computedStyles([
            "align-items",
            "background-color",
            "border-bottom-width",
            "border-radius",
            "box-sizing",
            "display",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-bottom-width": "1px",
        "border-radius": "10px",
        "box-sizing": "border-box",
        display: "inline-flex",
    });

    /* ---- Doc glyph, name, size ----------------------------------------- */

    const icon = view.$(
        '[data-testid="fa"] [data-rigged-ui="file-attachment-icon"] [data-rigged-ui="icon"]',
    );
    expect(icon.element.getAttribute("data-name")).toBe("doc");

    const name = view.$('[data-testid="fa"] [data-rigged-ui="file-attachment-name"]');
    expect(name.element.textContent).toBe("Relay Flagship (standalone).html");
    expect(name.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(237, 234, 242)",
        "font-size": "13px",
        "font-weight": "600",
    });

    const size = view.$('[data-testid="fa"] [data-rigged-ui="file-attachment-size"]');
    expect(size.element.textContent).toBe("283 KB");
    expect(size.textMetrics().font.family).toBe("Rigged Mono, ui-monospace, monospace");
    expect(size.computedStyle("color")).toBe("rgb(117, 112, 133)");

    /* The doc glyph is optically centered in the 36px pill's vertical lane. */
    const iconInk = await icon.visibleMetrics();
    expect(iconInk.pixelCount, "doc glyph paints").toBeGreaterThan(0);
    const iconMid = icon.bounds().y - fa.bounds().y + iconInk.center.y;
    expect(Math.abs(iconMid - 18), "doc glyph vertical center").toBeLessThanOrEqual(0.75);

    /* ---- Read-only renders a static div -------------------------------- */

    const ro = view.$('[data-testid="ro"] [data-rigged-ui="file-attachment"]');
    expect(ro.element.tagName, "no onOpen → static div").toBe("DIV");

    /* ---- Long names truncate with an ellipsis; the size never shrinks --- */

    const tName = view.$('[data-testid="trunc"] [data-rigged-ui="file-attachment-name"]');
    expect(tName.computedStyle("text-overflow")).toBe("ellipsis");
    expect(tName.element.scrollWidth, "name overflows and truncates").toBeGreaterThan(
        tName.element.clientWidth,
    );
    const tSize = view.$('[data-testid="trunc"] [data-rigged-ui="file-attachment-size"]');
    expect(tSize.element.textContent, "size stays intact").toBe("1.7 MB");

    await view.screenshot("FileAttachment.test");
});
