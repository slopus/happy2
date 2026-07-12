import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ApprovalRequestCard, type ApprovalRequest } from "./ApprovalRequestCard";
import { createRenderer } from "./testing";
import "./styles.css";

const request: ApprovalRequest = {
    action: "workspace.write:/src/auth/session.ts",
    agent: "Forge",
    avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    impact: "Updates the session refresh path for every signed-in workspace.",
    initials: "F",
    reason: "Forge needs permission to edit a protected authentication module.",
    resources: ["session.ts", "auth tests"],
    title: "Modify authentication session handling",
    typeLabel: "File write",
};

it("holds ApprovalRequestCard geometry, controlled actions, and optical marks", async () => {
    await page.viewport(800, 1000);
    const onExpandedChange = vi.fn();
    const onResolutionChange = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <ApprovalRequestCard
                    data-testid="pending-card"
                    expanded={false}
                    onExpandedChange={onExpandedChange}
                    onResolutionChange={onResolutionChange}
                    request={request}
                    resolution="pending"
                />
            ),
            { width: 720, height: 176, padding: 20 },
        )
        .render(
            () => (
                <ApprovalRequestCard
                    data-testid="expanded-card"
                    expanded
                    onExpandedChange={onExpandedChange}
                    onResolutionChange={onResolutionChange}
                    request={request}
                    resolution="approved"
                />
            ),
            { width: 720, height: 300, padding: 20 },
        )
        .render(
            () => (
                <ApprovalRequestCard
                    data-testid="narrow-card"
                    expanded={false}
                    onExpandedChange={onExpandedChange}
                    onResolutionChange={onResolutionChange}
                    request={request}
                    resolution="denied"
                />
            ),
            { width: 560, height: 176, padding: 20 },
        );
    await view.ready();

    const pending = view.$('[data-testid="pending-card"]');
    const expanded = view.$('[data-testid="expanded-card"]');
    const narrow = view.$('[data-testid="narrow-card"]');
    expect(pending.bounds()).toEqual({ x: 20, y: 30, width: 680, height: 128 });
    expect(expanded.bounds()).toEqual({ x: 20, y: 30, width: 680, height: 234 });
    expect(narrow.bounds()).toEqual({ x: 20, y: 30, width: 520, height: 128 });
    expect(
        pending.computedStyles([
            "background-color",
            "border-left-color",
            "border-left-width",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-shadow",
            "box-sizing",
            "max-width",
            "overflow-x",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 253, 248)",
        "border-left-color": "rgb(194, 147, 63)",
        "border-left-width": "3px",
        "border-radius": "10px",
        "border-top-color": "rgb(221, 207, 172)",
        "border-top-width": "1px",
        "box-shadow":
            "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(73, 51, 20, 0.06) 0px 2px 8px 0px",
        "box-sizing": "border-box",
        "max-width": "680px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
        width: "680px",
    });
    expect(
        expanded.computedStyles(["border-left-color", "border-left-width", "border-top-color"]),
    ).toEqual({
        "border-left-color": "rgb(77, 150, 96)",
        "border-left-width": "3px",
        "border-top-color": "rgb(184, 212, 190)",
    });
    expect(
        narrow.computedStyles(["border-left-color", "border-left-width", "border-top-color"]),
    ).toEqual({
        "border-left-color": "rgb(182, 92, 92)",
        "border-left-width": "3px",
        "border-top-color": "rgb(223, 195, 195)",
    });

    expect(
        view.$('[data-testid="pending-card"] [data-rigged-ui="approval-request-summary"]').bounds(),
    ).toEqual({ x: 23, y: 31, width: 676, height: 82 });
    expect(
        view.$('[data-testid="pending-card"] [data-rigged-ui="approval-request-actions"]').bounds(),
    ).toEqual({ x: 23, y: 113, width: 676, height: 44 });
    expect(
        view
            .$('[data-testid="expanded-card"] [data-rigged-ui="approval-request-details"]')
            .bounds(),
    ).toEqual({ x: 23, y: 113, width: 676, height: 106 });

    const title = view.$('[data-testid="pending-card"] [data-rigged-ui="approval-request-title"]');
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.font).toEqual({
        family: "Rigged Manrope",
        letterSpacing: 0,
        lineHeight: 14,
        size: 11.84,
        weight: "800",
    });
    expect(title.bounds()).toMatchObject({ height: 14 });
    expect(titleMetrics.ink.width).toBeGreaterThan(190);
    expect(titleMetrics.ink.width).toBeLessThan(235);

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await view.screenshot("ApprovalRequestCard.test");

    const pendingMark = view.$(
        '[data-testid="pending-card"] [data-rigged-ui="approval-request-lock-mark"]',
    );
    expect(pendingMark.bounds()).toEqual({ x: 40, y: 48, width: 14, height: 14 });
    expect(
        pendingMark.computedStyles(["fill", "height", "stroke", "stroke-width", "width"]),
    ).toEqual({
        fill: "none",
        height: "14px",
        stroke: "rgb(138, 100, 33)",
        "stroke-width": "1.8px",
        width: "14px",
    });
    const pendingVisible = await pendingMark.visibleMetrics();
    expect(pendingVisible.pixelCount).toBeGreaterThan(80);
    expect(pendingVisible.bounds.width).toBeGreaterThan(7.5);
    expect(pendingVisible.bounds.height).toBeGreaterThan(8.5);
    expect(Math.round(pendingVisible.center.x * 2)).toBe(14);
    expect(Math.round(pendingVisible.center.y * 2)).toBe(14);

    const approvedMark = view.$(
        '[data-testid="expanded-card"] [data-rigged-ui="approval-request-approved-mark"]',
    );
    const approvedVisible = await approvedMark.visibleMetrics();
    expect(approvedMark.bounds()).toEqual({ x: 40, y: 48, width: 14, height: 14 });
    expect(approvedVisible.pixelCount).toBeGreaterThan(20);
    expect(Math.round(approvedVisible.center.x * 2)).toBe(14);
    expect(Math.round(approvedVisible.center.y * 2)).toBe(14);

    (
        view.$('[data-testid="pending-card"] [data-rigged-ui="approval-request-toggle"]')
            .element as HTMLButtonElement
    ).click();
    (
        view.$('[data-testid="pending-card"] [data-rigged-ui="approval-request-deny"]')
            .element as HTMLButtonElement
    ).click();
    (
        view.$('[data-testid="pending-card"] [data-rigged-ui="approval-request-allow"]')
            .element as HTMLButtonElement
    ).click();
    (
        view.$('[data-testid="expanded-card"] [data-rigged-ui="approval-request-undo"]')
            .element as HTMLButtonElement
    ).click();
    expect(onExpandedChange).toHaveBeenCalledOnce();
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(onResolutionChange.mock.calls).toEqual([["denied"], ["approved"], ["pending"]]);
});
