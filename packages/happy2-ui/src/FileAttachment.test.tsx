import "./styles.css";
import type { JSX } from "solid-js";
import { userEvent } from "vitest/browser";
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
    view.render(
        () =>
            stage(
                "chat",
                <FileAttachment
                    name="Relay Flagship (standalone).html"
                    onOpen={() => {}}
                    size="283 KB"
                    variant="chat"
                />,
            ),
        { width: 680, height: 80 },
    );
    view.render(
        () =>
            stage(
                "chat-narrow",
                <FileAttachment
                    name="Q3-launch-readiness-review-final-FINAL-v2.pdf"
                    onOpen={() => {}}
                    size="1.7 MB"
                    variant="chat"
                />,
            ),
        { width: 300, height: 80 },
    );
    await view.ready();

    /* ---- Clickable pill contract --------------------------------------- */

    const fa = view.$('[data-testid="fa"] [data-happy2-ui="file-attachment"]');
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
        '[data-testid="fa"] [data-happy2-ui="file-attachment-icon"] [data-happy2-ui="icon"]',
    );
    expect(icon.element.getAttribute("data-name")).toBe("doc");

    const name = view.$('[data-testid="fa"] [data-happy2-ui="file-attachment-name"]');
    expect(name.element.textContent).toBe("Relay Flagship (standalone).html");
    expect(name.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(237, 234, 242)",
        "font-size": "13px",
        "font-weight": "600",
    });

    const size = view.$('[data-testid="fa"] [data-happy2-ui="file-attachment-size"]');
    expect(size.element.textContent).toBe("283 KB");
    expect(size.textMetrics().font.family).toBe("happy2 Mono, ui-monospace, monospace");
    expect(size.computedStyle("color")).toBe("rgb(117, 112, 133)");

    /* The doc glyph is optically centered in the 36px pill's vertical lane. */
    const iconInk = await icon.visibleMetrics();
    expect(iconInk.pixelCount, "doc glyph paints").toBeGreaterThan(0);
    const iconMid = icon.bounds().y - fa.bounds().y + iconInk.center.y;
    expect(Math.abs(iconMid - 18), "doc glyph vertical center").toBeLessThanOrEqual(0.75);

    /* ---- Read-only renders a static div -------------------------------- */

    const ro = view.$('[data-testid="ro"] [data-happy2-ui="file-attachment"]');
    expect(ro.element.tagName, "no onOpen → static div").toBe("DIV");

    /* ---- Long names truncate with an ellipsis; the size never shrinks --- */

    const tName = view.$('[data-testid="trunc"] [data-happy2-ui="file-attachment-name"]');
    expect(tName.computedStyle("text-overflow")).toBe("ellipsis");
    expect(tName.element.scrollWidth, "name overflows and truncates").toBeGreaterThan(
        tName.element.clientWidth,
    );
    const tSize = view.$('[data-testid="trunc"] [data-happy2-ui="file-attachment-size"]');
    expect(tSize.element.textContent, "size stays intact").toBe("1.7 MB");

    /* ---- Chat-list card stays bounded and reveals its hover treatment --- */

    const chat = view.$('[data-testid="chat"] [data-happy2-ui="file-attachment"]');
    expect(chat.element.getAttribute("data-variant")).toBe("chat");
    expect(chat.bounds()).toEqual({ x: 8, y: 8, width: 420, height: 64 });
    expect(
        chat.computedStyles(["background-color", "border-radius", "display", "height", "width"]),
    ).toEqual({
        "background-color": "rgb(28, 27, 34)",
        "border-radius": "8px",
        display: "inline-flex",
        height: "64px",
        width: "420px",
    });

    const chatIcon = view.$('[data-testid="chat"] [data-happy2-ui="file-attachment-icon"]');
    expect(chatIcon.bounds()).toEqual({ x: 21, y: 20, width: 40, height: 40 });
    expect(chatIcon.computedStyles(["align-items", "border-radius", "justify-content"])).toEqual({
        "align-items": "center",
        "border-radius": "6px",
        "justify-content": "center",
    });

    const chatName = view.$('[data-testid="chat"] [data-happy2-ui="file-attachment-name"]');
    expect(chatName.computedStyles(["font-size", "font-weight", "line-height"])).toEqual({
        "font-size": "14px",
        "font-weight": "600",
        "line-height": "20px",
    });
    const chatMeta = view.$('[data-testid="chat"] [data-happy2-ui="file-attachment-meta"]');
    expect(chatMeta.element.textContent).toContain("HTML · 283 KB");

    const narrowChat = view.$('[data-testid="chat-narrow"] [data-happy2-ui="file-attachment"]');
    expect(narrowChat.bounds().width, "card respects a constrained message").toBe(284);
    expect(
        view.$('[data-testid="chat-narrow"] [data-happy2-ui="file-attachment-name"]').element
            .scrollWidth,
        "chat filename overflows and truncates",
    ).toBeGreaterThan(
        view.$('[data-testid="chat-narrow"] [data-happy2-ui="file-attachment-name"]').element
            .clientWidth,
    );

    const action = view.$('[data-testid="chat"] [data-happy2-ui="file-attachment-action"]');
    expect(action.computedStyle("opacity")).toBe("0");
    await userEvent.hover(chat.element);
    for (const animation of action.element.getAnimations()) animation.finish();
    expect(action.computedStyle("opacity")).toBe("1");
    expect(
        view
            .$('[data-testid="chat"] .happy2-file-attachment__meta-default')
            .computedStyle("display"),
    ).toBe("none");
    expect(
        view.$('[data-testid="chat"] .happy2-file-attachment__meta-hover').computedStyle("display"),
    ).toBe("inline");

    await view.screenshot("FileAttachment.test");
});
