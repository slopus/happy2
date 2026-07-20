import { expect, it } from "vitest";
import { server } from "vitest/browser";
import type { McpAppResource } from "happy2-state";
import "./theme.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/mcp-app-shell.css";
import { McpAppShell } from "./McpAppShell";
import { createRenderer } from "./testing";

const uiFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/* A static, network-free app resource: the frame renders it with no bridge
 * round-trip, so geometry stays deterministic across captures. */
function resource(prefersBorder: boolean): McpAppResource {
    return {
        html: "<!doctype html><meta charset=utf-8><body style='margin:0;background:#101014'><main id=app></main></body>",
        contentHashSha256: (prefersBorder ? "a" : "b").repeat(64),
        meta: {
            ui: {
                csp: { connectDomains: [], resourceDomains: [] },
                ...(prefersBorder ? { prefersBorder: true } : {}),
            },
        },
    };
}

it("holds McpAppShell layout, states, chips, frame geometry, and failure actions", async () => {
    const view = createRenderer();
    let reloads = 0;

    view.render(
        () => <McpAppShell data-testid="mcp-loading" status="loading" toolName="movie_show" />,
        {
            width: 420,
            height: 120,
        },
    );
    view.render(
        () => (
            <McpAppShell
                arguments={{ query: "matrix" }}
                data-testid="mcp-running"
                resource={resource(false)}
                status="in_progress"
                toolName="movie_show"
            />
        ),
        { width: 420, height: 300 },
    );
    view.render(
        () => (
            <McpAppShell
                arguments={{ query: "matrix" }}
                data-testid="mcp-completed"
                resource={resource(true)}
                result={{ content: [{ type: "text", text: "The Matrix (1999)" }] }}
                status="completed"
                toolName="movie_show"
            />
        ),
        { width: 420, height: 300 },
    );
    view.render(
        () => (
            <McpAppShell
                data-testid="mcp-failed"
                error="This interactive app could not be loaded."
                onReload={() => (reloads += 1)}
                status="failed"
                toolName="movie_show"
            />
        ),
        { width: 420, height: 120 },
    );
    await view.ready();

    /* ---- Root: flex column card on the app surface --------------------- */
    const root = view.$('[data-testid="mcp-completed"]');
    expect(root.element.tagName).toBe("DIV");
    expect(root.element.getAttribute("data-status")).toBe("completed");
    expect(
        root.computedStyles([
            "background-color",
            "border-top-left-radius",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "overflow-x",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-top-left-radius": "10px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": uiFamily(),
        "overflow-x": "hidden",
    });

    /* ---- Header: fixed height, tool name, status chip ------------------ */
    const header = view.$('[data-testid="mcp-completed"] [data-happy2-ui="mcp-app-header"]');
    expect(header.height()).toBe(40);
    expect(
        view
            .$('[data-testid="mcp-completed"] [data-happy2-ui="mcp-app-title"]')
            .element.textContent?.trim(),
    ).toBe("movie_show");

    const chipLabel = (testid: string) =>
        view
            .$(`[data-testid="${testid}"] [data-happy2-ui="badge-label"]`)
            .element.textContent?.trim();
    expect(chipLabel("mcp-loading")).toBe("LOADING");
    expect(chipLabel("mcp-running")).toBe("RUNNING");
    expect(chipLabel("mcp-completed")).toBe("READY");
    expect(chipLabel("mcp-failed")).toBe("FAILED");
    expect(
        view
            .$('[data-testid="mcp-completed"] [data-happy2-ui="badge"] [data-happy2-ui="icon"]')
            .element.getAttribute("data-name"),
    ).toBe("check-circle");

    /* ---- Frame: double-iframe sandbox proxy, opaque origin ------------- */
    const hostFrame = view.$('[data-testid="mcp-completed"] [data-happy2-ui="mcp-app-host-frame"]');
    expect(hostFrame.element.tagName).toBe("IFRAME");
    /* The outer proxy MUST be a different (opaque) origin with allow-scripts +
       allow-same-origin: a data: URL yields an opaque origin, so allow-same-origin
       does NOT inherit Happy's origin (unlike a srcdoc proxy would). */
    expect(hostFrame.element.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    const proxySrc = (hostFrame.element as HTMLIFrameElement).src;
    expect(proxySrc.startsWith("data:text/html")).toBe(true);
    expect((hostFrame.element as HTMLIFrameElement).getAttribute("srcdoc")).toBeNull();

    /* Bordered app keeps an 8px gutter and a 1px inner radius that parallels
       the 10px card corner (verified by the renderer's rounded-corner audit). */
    const borderedFrame = view.$('[data-testid="mcp-completed"] [data-happy2-ui="mcp-app-frame"]');
    expect(borderedFrame.computedStyle("padding-left")).toBe("8px");
    expect(hostFrame.computedStyle("border-top-left-radius")).toBe("1px");

    /* Unbordered app fills its region with no gutter. */
    const runningFrame = view.$('[data-testid="mcp-running"] [data-happy2-ui="mcp-app-frame"]');
    expect(runningFrame.computedStyle("padding-left")).toBe("0px");

    /* Neither the loading nor failed states mount an iframe. */
    expect(
        view.container.querySelector('[data-testid="mcp-loading"] iframe'),
        "no iframe while loading",
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="mcp-failed"] iframe'),
        "no iframe when failed",
    ).toBeNull();

    /* ---- Loading state: static ring + copy ----------------------------- */
    const spinner = view.$('[data-testid="mcp-loading"] [data-happy2-ui="mcp-app-spinner"]');
    expect(spinner.bounds()).toMatchObject({ width: 16, height: 16 });
    expect(
        spinner.computedStyles(["border-radius", "border-top-color", "border-top-width"]),
    ).toEqual({
        "border-radius": "999px",
        "border-top-color": "rgb(0, 122, 255)",
        "border-top-width": "2px",
    });

    /* ---- Failed state: error text + retry ------------------------------ */
    const errorText = view.$('[data-testid="mcp-failed"] [data-happy2-ui="mcp-app-error-text"]');
    expect(errorText.element.textContent?.trim()).toBe("This interactive app could not be loaded.");
    expect(errorText.computedStyle("color")).toBe("rgb(255, 59, 48)");

    const retry = view.$('[data-testid="mcp-failed"] [data-happy2-ui="button"]');
    expect(
        view
            .$('[data-testid="mcp-failed"] [data-happy2-ui="button-label"]')
            .element.textContent?.trim(),
    ).toBe("Try again");
    (retry.element as HTMLButtonElement).click();
    expect(reloads).toBe(1);

    await view.screenshot("McpAppShell.test");
}, 120_000);
