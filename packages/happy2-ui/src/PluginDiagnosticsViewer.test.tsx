import { expect, it } from "vitest";
import "./theme.css";
import "./styles/badge.css";
import "./styles/plugin-diagnostics.css";
import { PluginDiagnosticsViewer } from "./PluginDiagnosticsViewer";
import { createRenderer } from "./testing";

const LONG_OUTPUT = Array.from(
    { length: 40 },
    (_, index) =>
        `[boot ${String(index).padStart(2, "0")}] initializing plugin runtime step ${index}`,
).join("\n");

it("renders inert diagnostics with output, empty, loading, and error states", async () => {
    const view = createRenderer()
        .render(
            () => (
                <div style={{ width: "560px", background: "#f5f5f5", display: "flex" }}>
                    <PluginDiagnosticsViewer
                        data-testid="failed"
                        detail="MCP initialize timed out after 20s."
                        failure="container exited 1"
                        output={"<script>alert(1)</script>\n[error] connection refused"}
                        status="failed"
                        updatedLabel="Updated 2m ago"
                    />
                </div>
            ),
            { width: 560, height: 220, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "560px", background: "#f5f5f5", display: "flex" }}>
                    <PluginDiagnosticsViewer data-testid="empty" status="ready" />
                </div>
            ),
            { width: 560, height: 120, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "560px", background: "#f5f5f5", display: "flex" }}>
                    <PluginDiagnosticsViewer data-testid="loading" loading />
                </div>
            ),
            { width: 560, height: 120, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "560px", background: "#f5f5f5", display: "flex" }}>
                    <PluginDiagnosticsViewer data-testid="error" error="Diagnostics store failed" />
                </div>
            ),
            { width: 560, height: 120, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "560px", background: "#f5f5f5", display: "flex" }}>
                    <PluginDiagnosticsViewer
                        data-testid="long"
                        output={LONG_OUTPUT}
                        status="failed"
                    />
                </div>
            ),
            { width: 560, height: 260, padding: 0 },
        );
    await view.ready();

    // Root: a bordered flex column on the inset surface, border-box, UI font.
    const root = view.$('[data-testid="failed"]');
    expect(root.computedStyles(["box-sizing", "display", "flex-direction", "gap"])).toEqual({
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        gap: "8px",
    });

    // The failure line uses the danger token and the detail line is secondary.
    expect(
        view
            .$('[data-testid="failed"] [data-happy2-ui="plugin-diagnostics-failure"]')
            .computedStyle("color"),
    ).toBe("rgb(244, 67, 54)");
    expect(
        view.$('[data-testid="failed"] [data-happy2-ui="plugin-diagnostics-detail"]').element
            .textContent,
    ).toBe("MCP initialize timed out after 20s.");

    // The captured output is inert: it lives inside <pre><code> as text, and a
    // script-like string is rendered verbatim rather than parsed into markup.
    const output = view.$('[data-testid="failed"] [data-happy2-ui="plugin-diagnostics-output"]');
    expect(output.element.tagName.toLowerCase()).toBe("pre");
    const code = output.element.querySelector("code")!;
    expect(code.textContent).toContain("<script>alert(1)</script>");
    expect(output.element.querySelector("script"), "no script element is created").toBeNull();
    expect(output.element.querySelectorAll("*")).toHaveLength(1); // only the <code>

    // The output scrollport owns scrolling edge-to-edge: overflow auto, zero
    // margin and padding (the inner <code> carries the inset).
    expect(output.computedStyles(["overflow", "margin", "padding", "white-space"])).toEqual({
        overflow: "auto",
        margin: "0px",
        padding: "0px",
        "white-space": "pre-wrap",
    });

    // Empty (ready, no output): a legible "no output" note, no output block.
    expect(
        view.$('[data-testid="empty"] [data-happy2-ui="plugin-diagnostics-empty"]').element
            .textContent,
    ).toContain("No diagnostic output was recorded");
    expect(
        view
            .$('[data-testid="empty"]')
            .element.querySelector('[data-happy2-ui="plugin-diagnostics-output"]'),
    ).toBeNull();

    // Loading and error states replace the body.
    expect(
        view
            .$('[data-testid="loading"]')
            .element.querySelector('[data-happy2-ui="plugin-diagnostics-loading"]'),
    ).not.toBeNull();
    expect(
        view.$('[data-testid="error"] [data-happy2-ui="plugin-diagnostics-error"]').element
            .textContent,
    ).toContain("Diagnostics store failed");

    // Long output stays inside the bounded 200px scrollport and overflows it.
    const long = view.$('[data-testid="long"] [data-happy2-ui="plugin-diagnostics-output"]');
    const longEl = long.element as HTMLElement;
    expect(long.computedStyle("max-height")).toBe("200px");
    expect(longEl.scrollHeight, "long output overflows the scrollport").toBeGreaterThan(
        longEl.clientHeight,
    );

    await view.screenshot("PluginDiagnosticsViewer.test");
}, 120_000);
