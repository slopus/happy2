import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import { AgentRunCard, type AgentRun } from "./AgentRunCard";
import "./styles.css";
import { createRenderer } from "./testing";

const reviewRun: AgentRun = {
    agent: "Forge",
    avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    branch: "feat/agent-run-card",
    files: ["AgentRunCard.tsx", "AgentRunCard.test.tsx"],
    initials: "F",
    progress: 50,
    status: "review",
    steps: [
        { label: "Build controlled component", status: "done" },
        { label: "Review visual output", status: "pending" },
    ],
    title: "Port agent run card",
};

const workingRun: AgentRun = {
    ...reviewRun,
    agent: "Scout",
    branch: "feat/browser-measurements",
    files: ["testing.ts"],
    initials: "S",
    progress: 42,
    status: "working",
    steps: [
        { label: "Capture Chromium", status: "done" },
        { label: "Capture Firefox", status: "working" },
    ],
    title: "Verify browser rendering",
};

it("holds AgentRunCard geometry, styles, optical icons, and controlled actions", async () => {
    const onExpandedChange = vi.fn();
    const onReviewedChange = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <AgentRunCard
                    data-testid="collapsed"
                    expanded={false}
                    onExpandedChange={onExpandedChange}
                    onReviewedChange={onReviewedChange}
                    reviewed={false}
                    run={workingRun}
                />
            ),
            { width: 376, height: 98, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="review"
                    expanded
                    onExpandedChange={onExpandedChange}
                    onReviewedChange={onReviewedChange}
                    reviewed={false}
                    run={reviewRun}
                />
            ),
            { width: 376, height: 230, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="reviewed"
                    expanded
                    onExpandedChange={onExpandedChange}
                    onReviewedChange={onReviewedChange}
                    reviewed
                    run={{ ...reviewRun, progress: 100 }}
                />
            ),
            { width: 376, height: 190, padding: 12 },
        );
    await view.ready();

    const collapsed = view.$('[data-testid="collapsed"]');
    const review = view.$('[data-testid="review"]');
    const reviewed = view.$('[data-testid="reviewed"]');
    expect(collapsed.bounds()).toEqual({ x: 12, y: 22, width: 352, height: 75 });
    expect(review.bounds()).toEqual({ x: 12, y: 22, width: 352, height: 207 });
    expect(reviewed.bounds()).toEqual({ x: 12, y: 22, width: 352, height: 167 });
    expect(
        review.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "font-family",
            "max-width",
            "overflow-x",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(251, 250, 252)",
        "border-radius": "10px",
        "border-top-color": "rgb(217, 210, 220)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        "font-family":
            server.browser === "webkit"
                ? "Rigged Manrope, sans-serif"
                : '"Rigged Manrope", sans-serif',
        "max-width": "680px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
        width: "352px",
    });

    expect(
        view.$('[data-testid="review"] [data-rigged-ui="agent-run-card-header"]').bounds(),
    ).toEqual({ x: 13, y: 23, width: 350, height: 38 });
    expect(
        view.$('[data-testid="review"] [data-rigged-ui="agent-run-card-details-toggle"]').bounds(),
    ).toEqual({ x: 277, y: 28, width: 74, height: 28 });
    expect(
        view.$('[data-testid="review"] [data-rigged-ui="agent-run-card-progress"]').bounds(),
    ).toEqual({ x: 25, y: 61, width: 326, height: 6 });
    expect(
        view.$('[data-testid="review"] [data-rigged-ui="agent-run-card-progress-fill"]').bounds(),
    ).toEqual({ x: 25, y: 61, width: 163, height: 6 });
    expect(
        view
            .$('[data-testid="review"] [data-rigged-ui="agent-run-card-progress-fill"]')
            .computedStyles(["background-color", "border-radius", "height", "width"]),
    ).toEqual({
        "background-color": "rgb(151, 96, 160)",
        "border-radius": "3px",
        height: "6px",
        width: "163px",
    });

    const title = view.$('[data-testid="review"] [data-rigged-ui="agent-run-card-title"]');
    expect(title.textMetrics()).toMatchObject({
        font: {
            family: "Rigged Manrope, sans-serif",
            letterSpacing: 0,
            lineHeight: 12,
            size: 11.52,
            weight: "800",
        },
        offsets: { top: 0, bottom: 0 },
        text: "Port agent run card",
    });
    expect(
        view
            .$('[data-testid="review"] [data-rigged-ui="agent-run-card-status"]')
            .computedStyles([
                "background-color",
                "border-radius",
                "color",
                "font-size",
                "font-weight",
                "height",
                "line-height",
            ]),
    ).toEqual({
        "background-color": "rgb(243, 231, 245)",
        "border-radius": "999px",
        color: "rgb(119, 59, 127)",
        "font-size": "8.96px",
        "font-weight": "800",
        height: "16px",
        "line-height": "16px",
    });

    const stepIcons = review.element.querySelectorAll<HTMLElement>(
        '[data-rigged-ui="agent-run-card-step-icon"]',
    );
    expect(stepIcons).toHaveLength(2);
    for (const icon of stepIcons) {
        const measuredIcon = view.$(
            `[data-testid="review"] [data-rigged-ui="agent-run-card-step-icon"][data-status="${icon.dataset.status}"]`,
        );
        expect(measuredIcon.bounds()).toMatchObject({ width: 16, height: 16 });
        const measuredGlyph = view.$(
            `[data-testid="review"] [data-rigged-ui="agent-run-card-step-icon"][data-status="${icon.dataset.status}"] [data-rigged-ui="agent-run-card-step-glyph"]`,
        );
        const visible = await measuredGlyph.visibleMetrics();
        expect(visible.pixelCount).toBeGreaterThan(0);
        expect(visible.bounds.width).toBeGreaterThan(0);
        expect(visible.bounds.height).toBeGreaterThan(0);
        expect(Math.round(visible.center.x * 2)).toBe(16);
        expect(Math.round(visible.center.y * 2)).toBe(16);
    }

    expect(
        view
            .$('[data-testid="review"] [data-rigged-ui="agent-run-card-review-button"]')
            .computedStyles([
                "background-color",
                "border-top-color",
                "border-top-width",
                "color",
                "height",
                "padding-left",
                "padding-right",
            ]),
    ).toEqual({
        "background-color": "rgb(118, 81, 126)",
        "border-top-color": "rgb(118, 81, 126)",
        "border-top-width": "1px",
        color: "rgb(255, 255, 255)",
        height: "28px",
        "padding-left": "12px",
        "padding-right": "12px",
    });

    (
        collapsed.element.querySelector(
            '[data-rigged-ui="agent-run-card-details-toggle"]',
        ) as HTMLButtonElement
    ).click();
    expect(onExpandedChange).toHaveBeenCalledOnce();
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(collapsed.element.querySelector('[data-rigged-ui="agent-run-card-details"]')).toBeNull();

    (
        review.element.querySelector(
            '[data-rigged-ui="agent-run-card-review-button"]',
        ) as HTMLButtonElement
    ).click();
    expect(onReviewedChange).toHaveBeenCalledOnce();
    expect(onReviewedChange).toHaveBeenCalledWith(true);
    expect(review.element.textContent).toContain("Needs review");
    expect(reviewed.element.textContent).toContain("Reviewed");
    expect(
        reviewed.element.querySelector('[data-rigged-ui="agent-run-card-review-button"]'),
    ).toBeNull();

    await view.screenshot("AgentRunCard.test");
});
