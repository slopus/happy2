import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/badge.css";
import "./styles/banner.css";
import "./styles/agent-image-detail.css";
import { AgentImageDetail } from "./AgentImageDetail";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
type View = ReturnType<typeof createRenderer>;
const engine = () => server.browser as Engine;

const monoFamily = () =>
    engine() === "webkit"
        ? "happy2 Mono, ui-monospace, monospace"
        : '"happy2 Mono", ui-monospace, monospace';

const DOCKERFILE = [
    "FROM happy2/agent-base:latest",
    "RUN apt-get update && apt-get install -y python3 nodejs",
].join("\n");

const BUILD_LOG = [
    "#3 [1/4] FROM docker.io/happy2/agent-base:latest",
    "#4 [2/4] RUN apt-get update && apt-get install -y python3 nodejs",
    "#6 [4/4] RUN pip install --no-cache-dir -r requirements.txt",
].join("\n");

function frame(view: View, render: () => any, height: number, width = 560) {
    return view.render(
        () => (
            <div style={{ width: `${width}px`, height: `${height}px`, background: "#17161c" }}>
                {render()}
            </div>
        ),
        { width, height },
    );
}

const codeStyles = [
    "background-color",
    "border-radius",
    "font-family",
    "font-size",
    "line-height",
    "overflow-x",
    "white-space",
] as const;

it("holds AgentImageDetail layout, progress, and the Dockerfile + build log blocks", async () => {
    const view = createRenderer();
    frame(
        view,
        () => (
            <AgentImageDetail
                buildLog={BUILD_LOG}
                buildLogTruncated
                data-testid="detail"
                dockerfile={DOCKERFILE}
                progress={62}
                status="building"
            />
        ),
        460,
    );
    await view.ready();

    // Root: flex column, 16px rhythm, dark theme text.
    const root = view.$('[data-testid="detail"]');
    expect(
        root.computedStyles(["display", "flex-direction", "gap", "box-sizing", "color"]),
    ).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "16px",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
    });

    // Status strip: a warning "Building" badge and a determinate progress bar.
    const badge = view.$('[data-testid="detail"] [data-happy2-ui="badge"]');
    expect(badge.element.getAttribute("data-variant")).toBe("warning");
    expect(badge.element.textContent).toBe("Building");
    const bar = view.$('[data-testid="detail"] [role="progressbar"]');
    expect(bar.element.getAttribute("aria-valuenow")).toBe("62");
    const track = view.$(".happy2-agent-image-detail__progress-track");
    const fill = view.$(".happy2-agent-image-detail__progress-fill");
    expect(Math.abs(fill.width() - track.width() * 0.62), "fill spans 62%").toBeLessThanOrEqual(
        0.6,
    );
    expect(fill.computedStyle("background-image")).toBe(
        "linear-gradient(135deg, rgb(139, 124, 247), rgb(244, 114, 182))",
    );
    expect(view.$(".happy2-agent-image-detail__progress-value").element.textContent).toBe("62%");

    // Dockerfile block: exact source, monospace, on the code surface (#141319).
    const dockerfile = view.$('[data-happy2-ui="agent-image-detail-dockerfile"]');
    expect(dockerfile.element.textContent).toBe(DOCKERFILE);
    expect(dockerfile.computedStyles(codeStyles)).toEqual({
        "background-color": "rgb(20, 19, 25)",
        "border-radius": "10px",
        "font-family": monoFamily(),
        "font-size": "12px",
        "line-height": "18px",
        "overflow-x": "auto",
        "white-space": "pre",
    });

    // Build log block: exact captured output + the truncation note.
    const log = view.$('[data-happy2-ui="agent-image-detail-log"]');
    expect(log.element.textContent).toBe(BUILD_LOG);
    expect(log.computedStyle("font-family")).toBe(monoFamily());
    const notes = view
        .$('[data-testid="detail"]')
        .element.querySelectorAll(".happy2-agent-image-detail__section-note");
    expect(Array.from(notes, (n) => n.textContent)).toEqual(["Showing the most recent output"]);

    await view.screenshot("AgentImageDetail.test");
}, 120_000);

it("handles failed, empty-log, loading, and error states", async () => {
    const view = createRenderer();
    frame(
        view,
        () => (
            <AgentImageDetail
                buildLog={BUILD_LOG}
                data-testid="failed"
                dockerfile={DOCKERFILE}
                lastError="package cuda-toolkit-12-4 has no installation candidate"
                status="failed"
            />
        ),
        420,
    );
    frame(
        view,
        () => (
            <AgentImageDetail
                buildLog=""
                data-testid="empty"
                dockerfile={DOCKERFILE}
                status="pending"
            />
        ),
        320,
    );
    frame(
        view,
        () => (
            <AgentImageDetail
                buildLog=""
                data-testid="loading"
                dockerfile=""
                loading
                status="building"
            />
        ),
        300,
    );
    frame(
        view,
        () => (
            <AgentImageDetail
                buildLog=""
                data-testid="error"
                dockerfile=""
                error="You must be a server administrator."
                status="ready"
            />
        ),
        220,
    );
    await view.ready();

    // Failed: danger status badge + a "Build failed" banner carrying the error.
    expect(
        view
            .$('[data-testid="failed"] [data-happy2-ui="badge"]')
            .element.getAttribute("data-variant"),
    ).toBe("danger");
    const failBanner = view.$('[data-testid="failed"] [data-happy2-ui="banner"]');
    expect(failBanner.element.getAttribute("data-tone")).toBe("danger");
    expect(failBanner.element.textContent).toContain(
        "package cuda-toolkit-12-4 has no installation candidate",
    );

    // Empty log: a placeholder instead of a log block.
    expect(
        view
            .$('[data-testid="empty"]')
            .element.querySelector('[data-happy2-ui="agent-image-detail-log"]'),
        "no log block when empty",
    ).toBeNull();
    expect(
        view.$('[data-testid="empty"] .happy2-agent-image-detail__empty').element.textContent,
    ).toBe("No build output yet.");

    // Loading: both blocks are placeholders, none rendered yet.
    const loading = view.$('[data-testid="loading"]');
    expect(
        loading.element.querySelector('[data-happy2-ui="agent-image-detail-dockerfile"]'),
    ).toBeNull();
    expect(loading.element.querySelector('[data-happy2-ui="agent-image-detail-log"]')).toBeNull();
    expect(
        Array.from(
            loading.element.querySelectorAll(".happy2-agent-image-detail__empty"),
            (n) => n.textContent,
        ),
    ).toEqual(["Loading Dockerfile…", "Loading build log…"]);

    // Error: a single banner replaces the whole body.
    const errorPanel = view.$('[data-testid="error"]');
    expect(
        errorPanel.element.querySelector('[data-happy2-ui="agent-image-detail-dockerfile"]'),
    ).toBeNull();
    const errorBanner = view.$('[data-testid="error"] [data-happy2-ui="banner"]');
    expect(errorBanner.element.getAttribute("data-tone")).toBe("danger");
    expect(errorBanner.element.textContent).toContain("You must be a server administrator.");

    await view.screenshot("AgentImageDetail.variants.test");
}, 120_000);
