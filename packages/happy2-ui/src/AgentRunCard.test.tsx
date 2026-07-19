import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/agent-run-card.css";
import { AgentRunCard, type AgentRun, type AgentRunStep } from "./AgentRunCard";
import { createRenderer, type RenderedElement } from "./testing";

/**
 * Resolves a CSS color expression (e.g. a color-mix()) in the running engine
 * so token-derived tints can be asserted exactly despite engine-specific
 * computed-color serialization.
 */
function resolvedColor(value: string) {
    const probe = document.createElement("div");
    probe.style.color = value;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
}

/**
 * Absolute (surface-relative) alpha-weighted ink centroid of a rendered part.
 * Every measurement sanity-asserts pixelCount > 0 so a clipped or blank
 * capture can never pass as "centered".
 */
async function inkCenter(part: RenderedElement<Element>) {
    const metrics = await part.visibleMetrics();
    expect(metrics.pixelCount).toBeGreaterThan(0);
    const bounds = part.bounds();
    return {
        bottom: bounds.y + metrics.bounds.y + metrics.bounds.height,
        x: bounds.x + metrics.center.x,
        y: bounds.y + metrics.center.y,
    };
}

/** Vertical center of a part's own layout box in surface coordinates. */
function boxCenterY(part: RenderedElement<Element>) {
    const bounds = part.bounds();
    return bounds.y + bounds.height / 2;
}

function boxCenterX(part: RenderedElement<Element>) {
    const bounds = part.bounds();
    return bounds.x + bounds.width / 2;
}

const steps: AgentRunStep[] = [
    { label: "Reproduced flake (14/200 fails)", status: "done" },
    { label: "Rewrote refresh queue", status: "working" },
    { label: "Run device farm verification", status: "pending" },
];

const completeSteps: AgentRunStep[] = [
    { label: "Bisect 429 regression", status: "done" },
    { label: "Patch limiter middleware", status: "working" },
    {
        label: "Verify limiter behavior across the full mobile regression matrix",
        status: "pending",
    },
];

const reviewRun: AgentRun = {
    agent: "Codex",
    branch: "fix/auth-flake",
    initials: "CX",
    stats: { added: 164, files: 6, note: "tests passing", removed: 38, steps: 12 },
    status: "review",
    steps,
    title: "Fix flaky auth token refresh tests",
    tone: "mint",
};

const workingRun: AgentRun = {
    agent: "Claude",
    initials: "CL",
    progress: 50,
    stats: { note: "step 7 of 12", steps: 12 },
    status: "working",
    steps,
    title: "Draft release notes for mobile v2",
    tone: "ember",
};

/** Long-title variant: must wrap to two lines in the narrow 440 lane. */
const workingLongRun: AgentRun = {
    ...workingRun,
    title: "Migrate the payments retry pipeline to idempotent consumer groups",
};

const queuedRun: AgentRun = {
    agent: "Codex",
    initials: "CX",
    status: "queued",
    steps: [],
    title: "Weekly triage sweep",
    tone: "mint",
};

/* 4-digit and 1-digit diffstat coverage next to review's 3- and 2-digit. */
const completeRun: AgentRun = {
    agent: "Codex",
    branch: "fix/rate-limit-status",
    initials: "CX",
    stats: { added: 2521, files: 12, removed: 4 },
    status: "complete",
    steps: completeSteps,
    title: "Rate limiter returns 500 not 429",
    tone: "mint",
};

it("holds the review hero card geometry, mint treatment, and interactions at 680", async () => {
    const expandedCalls: boolean[] = [];
    const actionCalls: string[] = [];
    const view = createRenderer().render(
        () => (
            <AgentRunCard
                actions={[
                    { id: "review-diff", label: "Review diff", variant: "primary" },
                    { id: "open-channel", label: "Open in #eng-core" },
                ]}
                data-testid="run-review"
                expanded={false}
                onAction={(id) => actionCalls.push(id)}
                onExpandedChange={(next) => expandedCalls.push(next)}
                run={reviewRun}
            />
        ),
        { width: 704, height: 214, padding: 12 },
    );
    await view.ready();

    /* — mint-tinted hairline + glow over the surface tokens — */
    const review = view.$('[data-testid="run-review"]');
    expect(review.bounds()).toEqual({ x: 12, y: 12, width: 680, height: 178 });
    expect(
        review.computedStyles([
            "background-color",
            "border-top-color",
            "border-top-style",
            "border-top-width",
            "border-top-left-radius",
            "box-sizing",
            "display",
            "max-width",
            "overflow-x",
            "position",
        ]),
    ).toEqual({
        "background-color": resolvedColor(
            "color-mix(in srgb, rgb(52, 199, 89) 5%, rgb(255, 255, 255))",
        ),
        "border-top-color": resolvedColor("color-mix(in srgb, rgb(52, 199, 89) 35%, transparent)"),
        "border-top-style": "solid",
        "border-top-width": "1px",
        "border-top-left-radius": "10px",
        "box-sizing": "border-box",
        display: "block",
        "max-width": "680px",
        "overflow-x": "hidden",
        position: "relative",
    });
    expect(review.computedStyle("box-shadow")).toContain("24px");
    expect(review.computedStyle("box-shadow")).toContain("0.14");

    /* — header row: agent avatar, name, status badge, expand toggle — */
    const header = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-header"]');
    expect(header.bounds()).toEqual({ x: 29, y: 29, width: 646, height: 28 });
    const avatar = view.$('[data-testid="run-review"] [data-happy2-ui="avatar"]');
    expect(avatar.bounds()).toEqual({ x: 29, y: 29, width: 28, height: 28 });
    expect(avatar.computedStyle("border-radius")).toBe("7px");

    const agent = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-agent"]');
    const agentMetrics = agent.textMetrics();
    expect(agentMetrics.text).toBe("Codex");
    expect(agentMetrics.bounds.x).toBe(65);
    expect(agentMetrics.font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: 0,
        lineHeight: 18,
        size: 13,
        weight: "700",
    });
    expect(agent.computedStyle("color")).toBe("rgb(0, 0, 0)");
    const kind = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-kind"]');
    expect(kind.element.textContent).toBe("· run");
    expect(kind.computedStyles(["color", "font-weight"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-weight": "500",
    });

    const badge = view.$('[data-testid="run-review"] [data-happy2-ui="badge"]');
    expect(badge.element.textContent).toBe("NEEDS REVIEW");
    expect(badge.computedStyles(["background-color", "color", "height"])).toEqual({
        "background-color": "rgba(52, 199, 89, 0.14)",
        color: "rgb(36, 138, 61)",
        height: "18px",
    });
    expect(badge.offsets().top).toBe(5); /* 18px pill row-centered in the 28px header */

    const toggle = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-toggle"]');
    expect(toggle.bounds().width).toBe(24);
    expect(toggle.bounds().height).toBe(24);
    expect(toggle.offsets().right).toBe(0);
    expect(toggle.offsets().top).toBe(2);
    expect(toggle.element.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.element.tagName).toBe("BUTTON");
    expect(toggle.computedStyles(["border-radius", "color"])).toEqual({
        "border-radius": "6px",
        color: "rgb(142, 142, 147)",
    });

    /* — title and mono diffstat meta — */
    const title = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-title"]');
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.text).toBe("Fix flaky auth token refresh tests");
    expect(titleMetrics.bounds.x).toBe(29);
    expect(titleMetrics.bounds.width).toBe(646);
    expect(titleMetrics.bounds.height).toBe(20);
    /* Layout puts the line box at 65; Gecko's paint-only -0.5px ink correction
     * (agent-run-card.css) shifts the client rect without moving layout. */
    expect(Math.abs(titleMetrics.bounds.y - 65)).toBeLessThanOrEqual(0.5);
    expect(titleMetrics.font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: -0.15,
        lineHeight: 20,
        size: 15,
        weight: "700",
    });
    expect(title.computedStyle("color")).toBe("rgb(0, 0, 0)");

    const meta = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-meta"]');
    expect(meta.bounds()).toEqual({ x: 29, y: 93, width: 646, height: 16 });
    const added = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-added"]');
    const removed = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-removed"]');
    const detail = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-detail"]');
    expect(added.element.textContent).toBe("+164");
    expect(removed.element.textContent).toBe("−38");
    expect(detail.element.textContent).toBe("6 files · 12 steps · tests passing");
    expect(added.computedStyle("color")).toBe("rgb(40, 167, 69)");
    expect(removed.computedStyle("color")).toBe("rgb(220, 53, 69)");
    const detailMetrics = detail.textMetrics();
    expect(detailMetrics.font).toEqual({
        family: "happy2 Mono, ui-monospace, monospace",
        letterSpacing: 0,
        lineHeight: 16,
        size: 12,
        weight: "500",
    });
    expect(detail.computedStyle("color")).toBe("rgb(142, 142, 147)");

    /* — branch row — */
    const branch = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-branch"]');
    expect(branch.bounds()).toEqual({ x: 29, y: 117, width: 646, height: 16 });
    const branchName = view.$(
        '[data-testid="run-review"] [data-happy2-ui="agent-run-card-branch-name"]',
    );
    expect(branchName.element.textContent).toBe("fix/auth-flake");
    expect(branchName.computedStyles(["color", "font-size"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "12px",
    });
    const branchIcon = view.$(
        '[data-testid="run-review"] [data-happy2-ui="agent-run-card-branch-icon"] [data-happy2-ui="icon"]',
    );
    expect(branchIcon.bounds().width).toBe(14);
    expect(branchIcon.element.getAttribute("data-name")).toBe("branch");

    /* — actions row: small buttons from the actions prop — */
    const actions = view.$('[data-testid="run-review"] [data-happy2-ui="agent-run-card-actions"]');
    expect(actions.bounds()).toEqual({ x: 29, y: 145, width: 646, height: 28 });
    expect(actions.element.querySelectorAll('[data-happy2-ui="button"]').length).toBe(2);
    const primary = view.$(
        '[data-testid="run-review"] [data-happy2-ui="button"][data-variant="primary"]',
    );
    expect(primary.element.textContent).toBe("Review diff");
    expect(primary.bounds().height).toBe(28);
    expect(primary.computedStyle("background-color")).toBe("rgb(0, 0, 0)");
    const secondary = view.$(
        '[data-testid="run-review"] [data-happy2-ui="button"][data-variant="secondary"]',
    );
    expect(secondary.element.textContent).toBe("Open in #eng-core");
    expect(secondary.computedStyle("background-color")).toBe("rgb(240, 240, 242)");

    /* — collapsed cards hide steps and the children slot — */
    expect(review.element.querySelector('[data-happy2-ui="agent-run-card-steps"]')).toBeNull();
    expect(review.element.querySelector('[data-happy2-ui="agent-run-card-body"]')).toBeNull();

    /* — interactions: expand toggle and action clicks report upward — */
    (toggle.element as HTMLButtonElement).click();
    expect(expandedCalls).toEqual([true]);
    (primary.element as HTMLButtonElement).click();
    (secondary.element as HTMLButtonElement).click();
    expect(actionCalls).toEqual(["review-diff", "open-channel"]);

    await view.screenshot("AgentRunCard.test");
});

it("holds the working and queued status treatments at 680 and 440", async () => {
    const view = createRenderer()
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-working"
                    expanded={false}
                    onExpandedChange={() => {}}
                    run={workingRun}
                />
            ),
            { width: 704, height: 150, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-queued"
                    expanded={false}
                    onExpandedChange={() => {}}
                    run={queuedRun}
                />
            ),
            { width: 464, height: 114, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-complete"
                    expanded={false}
                    onExpandedChange={() => {}}
                    run={completeRun}
                />
            ),
            { width: 464, height: 162, padding: 12 },
        );
    await view.ready();

    /* — working card at 680: brand-gradient 3px progress strip on top — */
    const working = view.$('[data-testid="run-working"]');
    expect(working.bounds()).toEqual({ x: 12, y: 12, width: 680, height: 114 });
    expect(working.computedStyles(["border-top-color", "border-top-style"])).toEqual({
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-style": "solid",
    });
    const progress = view.$(
        '[data-testid="run-working"] [data-happy2-ui="agent-run-card-progress"]',
    );
    expect(progress.bounds()).toEqual({ x: 13, y: 13, width: 678, height: 3 });
    expect(progress.computedStyles(["background-color", "position"])).toEqual({
        "background-color": "rgb(245, 245, 245)",
        position: "absolute",
    });
    expect(progress.element.getAttribute("aria-valuenow")).toBe("50");
    const fill = view.$(
        '[data-testid="run-working"] [data-happy2-ui="agent-run-card-progress-fill"]',
    );
    expect(fill.bounds()).toEqual({ x: 13, y: 13, width: 339, height: 3 });
    expect(fill.computedStyle("background-image")).toContain("linear-gradient");
    const workingBadge = view.$('[data-testid="run-working"] [data-happy2-ui="badge"]');
    expect(workingBadge.element.textContent).toBe("RUNNING");
    expect(workingBadge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(255, 149, 0, 0.14)",
        color: "rgb(201, 52, 0)",
    });
    expect(workingBadge.offsets().top).toBe(5);

    /* — queued card at 440: dashed hairline, neutral badge, no strip — */
    const queued = view.$('[data-testid="run-queued"]');
    expect(queued.bounds()).toEqual({ x: 12, y: 12, width: 440, height: 90 });
    expect(
        queued.computedStyles(["border-top-color", "border-top-style", "border-top-width"]),
    ).toEqual({
        "border-top-color": "rgb(209, 209, 214)",
        "border-top-style": "dashed",
        "border-top-width": "1px",
    });
    const queuedBadge = view.$('[data-testid="run-queued"] [data-happy2-ui="badge"]');
    expect(queuedBadge.element.textContent).toBe("QUEUED");
    expect(queuedBadge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgb(245, 245, 245)",
        color: "rgb(142, 142, 147)",
    });
    expect(queuedBadge.offsets().top).toBe(5);
    expect(queued.element.querySelector('[data-happy2-ui="agent-run-card-progress"]')).toBeNull();

    /* — complete card at 440 collapsed: neutral hairline + mint check — */
    const complete = view.$('[data-testid="run-complete"]');
    expect(complete.bounds()).toEqual({ x: 12, y: 12, width: 440, height: 138 });
    expect(complete.computedStyles(["border-top-color", "border-top-style"])).toEqual({
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-style": "solid",
    });
    const completeBadge = view.$('[data-testid="run-complete"] [data-happy2-ui="badge"]');
    expect(completeBadge.element.textContent).toBe("COMPLETED");
    expect(completeBadge.offsets().top).toBe(5);
    const check = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-check"]');
    expect(check.computedStyle("color")).toBe("rgb(52, 199, 89)");
    expect(check.element.querySelector('[data-happy2-ui="icon"]')?.getAttribute("data-name")).toBe(
        "check-circle",
    );
    expect(complete.element.querySelector('[data-happy2-ui="agent-run-card-steps"]')).toBeNull();

    await view.screenshot("AgentRunCard.status.test");
});

it("holds the expanded complete card at 440: steps, children slot, and max-width", async () => {
    const view = createRenderer()
        .render(
            () => (
                <AgentRunCard
                    actions={[{ id: "open-channel", label: "Open in #eng-core" }]}
                    data-testid="run-complete"
                    expanded={true}
                    onExpandedChange={() => {}}
                    run={completeRun}
                >
                    <div
                        data-testid="diff-marker"
                        style={{ background: "#f6f8fa", height: "40px" }}
                    />
                </AgentRunCard>
            ),
            { width: 464, height: 346, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-wide"
                    expanded={false}
                    onExpandedChange={() => {}}
                    run={queuedRun}
                />
            ),
            { width: 760, height: 114, padding: 12 },
        );
    await view.ready();

    /* — complete card: neutral hairline, mint check, rotated chevron — */
    const complete = view.$('[data-testid="run-complete"]');
    expect(complete.bounds()).toEqual({ x: 12, y: 12, width: 440, height: 322 });
    expect(complete.computedStyles(["border-top-color", "border-top-style"])).toEqual({
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-style": "solid",
    });
    const check = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-check"]');
    expect(check.computedStyle("color")).toBe("rgb(52, 199, 89)");
    const badge = view.$('[data-testid="run-complete"] [data-happy2-ui="badge"]');
    expect(badge.element.textContent).toBe("COMPLETED");
    const toggle = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-toggle"]');
    expect(toggle.element.getAttribute("aria-expanded")).toBe("true");
    const toggleIcon = view.$(
        '[data-testid="run-complete"] [data-happy2-ui="agent-run-card-toggle-icon"]',
    );
    expect(toggleIcon.computedStyle("transform")).toBe("matrix(-1, 0, 0, -1, 0, 0)");

    /* — 4-digit / 1-digit diffstat variant — */
    const added = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-added"]');
    const removed = view.$(
        '[data-testid="run-complete"] [data-happy2-ui="agent-run-card-removed"]',
    );
    const detail = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-detail"]');
    expect(added.element.textContent).toBe("+2521");
    expect(removed.element.textContent).toBe("−4");
    expect(detail.element.textContent).toBe("12 files");
    const meta = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-meta"]');
    expect(meta.bounds()).toEqual({ x: 29, y: 93, width: 406, height: 16 });
    const branch = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-branch"]');
    expect(branch.bounds()).toEqual({ x: 29, y: 117, width: 406, height: 16 });

    /* — step checklist: 28px rows, 16px glyph column, per-status colors — */
    const stepsList = view.$(
        '[data-testid="run-complete"] [data-happy2-ui="agent-run-card-steps"]',
    );
    expect(stepsList.bounds()).toEqual({ x: 29, y: 141, width: 406, height: 84 });
    const done = view.$('[data-testid="run-complete"] [data-status="done"]');
    const workingStep = view.$('[data-testid="run-complete"] li[data-status="working"]');
    const pending = view.$('[data-testid="run-complete"] [data-status="pending"]');
    expect(done.bounds()).toEqual({ x: 29, y: 141, width: 406, height: 28 });
    expect(workingStep.bounds()).toEqual({ x: 29, y: 169, width: 406, height: 28 });
    expect(pending.bounds()).toEqual({ x: 29, y: 197, width: 406, height: 28 });

    const doneGlyph = view.$(
        '[data-testid="run-complete"] [data-status="done"] [data-happy2-ui="agent-run-card-step-glyph"]',
    );
    expect(doneGlyph.bounds().width).toBe(16);
    expect(doneGlyph.bounds().height).toBe(16);
    expect(doneGlyph.offsets().top).toBe(6);
    expect(doneGlyph.computedStyle("color")).toBe("rgb(52, 199, 89)");

    const workingDot = view.$(
        '[data-testid="run-complete"] li[data-status="working"] [data-happy2-ui="agent-run-card-step-dot"]',
    );
    expect(workingDot.bounds().width).toBe(8);
    expect(workingDot.bounds().height).toBe(8);
    expect(workingDot.computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(0, 122, 255)",
        "border-radius": "999px",
    });
    expect(workingDot.computedStyle("box-shadow")).toContain("3px");
    const pendingDot = view.$(
        '[data-testid="run-complete"] [data-status="pending"] [data-happy2-ui="agent-run-card-step-dot"]',
    );
    expect(
        pendingDot.computedStyles(["background-color", "border-top-color", "border-top-width"]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-color": "rgb(142, 142, 147)",
        "border-top-width": "1px",
    });

    const doneLabel = view.$(
        '[data-testid="run-complete"] [data-status="done"] [data-happy2-ui="agent-run-card-step-label"]',
    );
    const workingLabel = view.$(
        '[data-testid="run-complete"] li[data-status="working"] [data-happy2-ui="agent-run-card-step-label"]',
    );
    const pendingLabel = view.$(
        '[data-testid="run-complete"] [data-status="pending"] [data-happy2-ui="agent-run-card-step-label"]',
    );
    expect(doneLabel.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "13px",
        "font-weight": "500",
    });
    expect(workingLabel.computedStyles(["color", "font-weight"])).toEqual({
        color: "rgb(0, 0, 0)",
        "font-weight": "600",
    });
    expect(pendingLabel.computedStyles(["color", "font-weight"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-weight": "500",
    });
    /* Long pending label truncates inside the narrow lane instead of pushing it. */
    expect(pendingLabel.computedStyle("text-overflow")).toBe("ellipsis");
    expect(pendingLabel.bounds().x + pendingLabel.bounds().width).toBeLessThanOrEqual(435);

    /* — expanded children slot: 12px above and below neighbors — */
    const body = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-body"]');
    expect(body.bounds()).toEqual({ x: 29, y: 237, width: 406, height: 40 });
    const actions = view.$(
        '[data-testid="run-complete"] [data-happy2-ui="agent-run-card-actions"]',
    );
    expect(actions.bounds()).toEqual({ x: 29, y: 289, width: 406, height: 28 });

    /* — max-width contract: the card caps at 680 in a 736 lane — */
    const wide = view.$('[data-testid="run-wide"]');
    expect(wide.bounds()).toEqual({ x: 12, y: 12, width: 680, height: 90 });
    expect(wide.offsets().right).toBe(68); /* 12 surface padding + 56 max-width slack */

    await view.screenshot("AgentRunCard.expanded.test");
});

it("holds every status expanded, including narrow 440 title wrap", async () => {
    const view = createRenderer()
        .render(
            () => (
                <AgentRunCard
                    actions={[
                        { id: "review-diff", label: "Review diff", variant: "primary" },
                        { id: "open-channel", label: "Open in #eng-core" },
                    ]}
                    data-testid="run-review"
                    expanded={true}
                    onExpandedChange={() => {}}
                    run={reviewRun}
                >
                    <div style={{ background: "#f6f8fa", height: "40px" }} />
                </AgentRunCard>
            ),
            { width: 704, height: 346, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-working"
                    expanded={true}
                    onExpandedChange={() => {}}
                    run={workingLongRun}
                />
            ),
            { width: 464, height: 250, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-queued"
                    expanded={true}
                    onExpandedChange={() => {}}
                    run={queuedRun}
                />
            ),
            { width: 464, height: 114, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    actions={[{ id: "open-channel", label: "Open in #eng-core" }]}
                    data-testid="run-complete"
                    expanded={true}
                    onExpandedChange={() => {}}
                    run={completeRun}
                />
            ),
            { width: 464, height: 294, padding: 12 },
        );
    await view.ready();

    /* — review expanded at 680: steps + children + actions all present — */
    const review = view.$('[data-testid="run-review"]');
    expect(review.bounds()).toEqual({ x: 12, y: 12, width: 680, height: 322 });
    expect(review.element.querySelectorAll('[data-happy2-ui="agent-run-card-step"]').length).toBe(
        3,
    );
    expect(review.element.querySelector('[data-happy2-ui="agent-run-card-body"]')).not.toBeNull();

    /* — working expanded at 440: long title wraps to exactly two lines — */
    const workingTitle = view.$(
        '[data-testid="run-working"] [data-happy2-ui="agent-run-card-title"]',
    );
    const workingTitleBounds = workingTitle.bounds();
    expect(workingTitleBounds.x).toBe(29);
    expect(workingTitleBounds.width).toBe(406);
    expect(workingTitleBounds.height).toBe(40); /* two 20px lines */
    /* 65 in layout; Gecko's paint-only -0.5px correction moves the rect. */
    expect(Math.abs(workingTitleBounds.y - 65)).toBeLessThanOrEqual(0.5);
    const workingCard = view.$('[data-testid="run-working"]');
    expect(workingCard.bounds()).toEqual({ x: 12, y: 12, width: 440, height: 226 });
    expect(
        workingCard.element.querySelector('[data-happy2-ui="agent-run-card-progress"]'),
    ).not.toBeNull();

    /* — queued expanded with zero steps renders no checklist — */
    const queued = view.$('[data-testid="run-queued"]');
    expect(queued.bounds()).toEqual({ x: 12, y: 12, width: 440, height: 90 });
    expect(queued.element.querySelector('[data-happy2-ui="agent-run-card-steps"]')).toBeNull();

    /* — complete expanded at 440 — */
    const complete = view.$('[data-testid="run-complete"]');
    expect(complete.bounds()).toEqual({ x: 12, y: 12, width: 440, height: 270 });

    await view.screenshot("AgentRunCard.states.test");
});

/*
 * Optical alignment (DESIGN.md "Optical alignment"): alpha-weighted ink
 * centroids measured from true-2x element captures, asserted against the
 * untranslated row/box the ink is centered in. Word runs carry inherently
 * asymmetric ink (ascender/descender/x-height mix shifts the centroid even
 * when the line box is perfectly placed), so text asserts the vertical
 * centroid only; the horizontal axis for text is left-aligned layout, not
 * centering. Symmetric glyphs (icons, dots, chevrons) assert both axes.
 *
 * Measured drift after the engine corrections in agent-run-card.css
 * (chromium / firefox / webkit, CSS px):
 *   agent      +0.21 / +0.18 / +0.16      added     +0.02 / -0.01 / -0.05
 *   kind       +0.50 / +0.45 / +0.47      removed   -0.43 / -0.43 / -0.45
 *   title      +0.60 / +0.55 / +0.56      detail    +0.39 / +0.33 / +0.36
 *   branch     +0.03 / -0.00 / +0.02      labels    -0.05 .. +0.36
 *   icons/dots |d| <= 0.11 on both axes in every engine
 */
it("centers ink optically in every row, glyph, and counter", async () => {
    const view = createRenderer()
        .render(
            () => (
                <AgentRunCard
                    actions={[
                        { id: "review-diff", label: "Review diff", variant: "primary" },
                        { id: "open-channel", label: "Open in #eng-core" },
                    ]}
                    data-testid="run-review"
                    expanded={true}
                    onExpandedChange={() => {}}
                    run={reviewRun}
                />
            ),
            { width: 704, height: 294, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-complete"
                    expanded={false}
                    onExpandedChange={() => {}}
                    run={completeRun}
                />
            ),
            { width: 464, height: 162, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-working"
                    expanded={false}
                    onExpandedChange={() => {}}
                    run={workingRun}
                />
            ),
            { width: 464, height: 138, padding: 12 },
        )
        .render(
            () => (
                <AgentRunCard
                    data-testid="run-queued"
                    expanded={false}
                    onExpandedChange={() => {}}
                    run={queuedRun}
                />
            ),
            { width: 464, height: 114, padding: 12 },
        );
    await view.ready();

    const rv = (selector: string) => view.$(`[data-testid="run-review"] ${selector}`);

    /* — header baseline row: name run + kind run centered on the 28px row — */
    const header = rv('[data-happy2-ui="agent-run-card-header"]');
    const headerCy = boxCenterY(header);
    const agentInk = await inkCenter(rv('[data-happy2-ui="agent-run-card-agent"]'));
    expect(Math.abs(agentInk.y - headerCy)).toBeLessThanOrEqual(0.4);
    /* "· run" has no ascenders: pure x-height ink reads low; 0.75 covers it. */
    const kindInk = await inkCenter(rv('[data-happy2-ui="agent-run-card-kind"]'));
    expect(Math.abs(kindInk.y - headerCy)).toBeLessThanOrEqual(0.75);

    /* Avatar initials ink: box placement is this card's contract; the glyph
     * centering inside the box is Avatar's (its own engine corrections are
     * asserted in Avatar.test.tsx), so the row bound here is intentionally
     * loose. */
    const avatar = rv('[data-happy2-ui="avatar"]');
    expect(avatar.bounds().y).toBe(29);
    const initialsInk = await inkCenter(rv('[data-happy2-ui="avatar-initials"]'));
    expect(Math.abs(initialsInk.y - headerCy)).toBeLessThanOrEqual(1.25);

    /* Status badge: the 18px pill is row-centered exactly; the uppercase ink
     * inside the pill belongs to Badge (Badge.test.tsx), loose bound only. */
    for (const [card, label] of [
        ["run-review", "NEEDS REVIEW"],
        ["run-working", "RUNNING"],
        ["run-queued", "QUEUED"],
        ["run-complete", "COMPLETED"],
    ] as const) {
        const badge = view.$(`[data-testid="${card}"] [data-happy2-ui="badge"]`);
        expect(badge.element.textContent).toBe(label);
        expect(badge.offsets().top).toBe(5);
        const cardHeaderCy = boxCenterY(
            view.$(`[data-testid="${card}"] [data-happy2-ui="agent-run-card-header"]`),
        );
        const badgeInk = await inkCenter(
            view.$(`[data-testid="${card}"] [data-happy2-ui="badge-label"]`),
        );
        expect(Math.abs(badgeInk.y - cardHeaderCy), label).toBeLessThanOrEqual(1.25);
    }

    /* — expand chevron: symmetric glyph, both axes, expanded and collapsed — */
    const toggleExpanded = rv('[data-happy2-ui="agent-run-card-toggle"]');
    const toggleExpandedInk = await inkCenter(toggleExpanded);
    expect(Math.abs(toggleExpandedInk.x - boxCenterX(toggleExpanded))).toBeLessThanOrEqual(0.4);
    expect(Math.abs(toggleExpandedInk.y - boxCenterY(toggleExpanded))).toBeLessThanOrEqual(0.4);
    const toggleCollapsed = view.$(
        '[data-testid="run-complete"] [data-happy2-ui="agent-run-card-toggle"]',
    );
    const toggleCollapsedInk = await inkCenter(toggleCollapsed);
    expect(Math.abs(toggleCollapsedInk.x - boxCenterX(toggleCollapsed))).toBeLessThanOrEqual(0.4);
    expect(Math.abs(toggleCollapsedInk.y - boxCenterY(toggleCollapsed))).toBeLessThanOrEqual(0.4);

    /* — complete-header mint check: check-circle's check stroke keeps a small
     * engine-dependent leftward centroid (Icon.test.tsx owns the glyph); the
     * box itself is exact, so both axes assert at the 0.75 contract bound. */
    const check = view.$('[data-testid="run-complete"] [data-happy2-ui="agent-run-card-check"]');
    const checkInk = await inkCenter(check);
    expect(Math.abs(checkInk.x - boxCenterX(check))).toBeLessThanOrEqual(0.75);
    expect(Math.abs(checkInk.y - boxCenterY(check))).toBeLessThanOrEqual(0.75);

    /* — title: 20px line box sits 8px under the header; descenders in the
     * title pull the centroid low, so vertical-only at the 0.75 bound. */
    const headerBounds = header.bounds();
    const titleCy = headerBounds.y + headerBounds.height + 8 + 10;
    const titleInk = await inkCenter(rv('[data-happy2-ui="agent-run-card-title"]'));
    expect(Math.abs(titleInk.y - titleCy)).toBeLessThanOrEqual(0.75);

    /* — mono diffstat row: counters centered on the 16px row, and +/− share
     * one baseline. "−38" reads high (the minus sits at the math axis) and
     * the detail run carries descenders, hence their 0.75 bounds. */
    const metaCy = boxCenterY(rv('[data-happy2-ui="agent-run-card-meta"]'));
    const addedInk = await inkCenter(rv('[data-happy2-ui="agent-run-card-added"]'));
    expect(Math.abs(addedInk.y - metaCy)).toBeLessThanOrEqual(0.4);
    const removedInk = await inkCenter(rv('[data-happy2-ui="agent-run-card-removed"]'));
    expect(Math.abs(removedInk.y - metaCy)).toBeLessThanOrEqual(0.75);
    expect(Math.abs(addedInk.bottom - removedInk.bottom)).toBeLessThanOrEqual(0.25);
    const detailInk = await inkCenter(rv('[data-happy2-ui="agent-run-card-detail"]'));
    expect(Math.abs(detailInk.y - metaCy)).toBeLessThanOrEqual(0.75);

    /* — branch row: icon on both axes, mono name on the row center — */
    const branchCy = boxCenterY(rv('[data-happy2-ui="agent-run-card-branch"]'));
    const branchIcon = rv('[data-happy2-ui="agent-run-card-branch-icon"]');
    const branchIconInk = await inkCenter(branchIcon);
    expect(Math.abs(branchIconInk.x - boxCenterX(branchIcon))).toBeLessThanOrEqual(0.4);
    expect(Math.abs(branchIconInk.y - boxCenterY(branchIcon))).toBeLessThanOrEqual(0.4);
    const branchNameInk = await inkCenter(rv('[data-happy2-ui="agent-run-card-branch-name"]'));
    expect(Math.abs(branchNameInk.y - branchCy)).toBeLessThanOrEqual(0.4);

    /* — step rows: glyph per status on both axes, label on the row center — */
    for (const status of ["done", "working", "pending"] as const) {
        const row = rv(`li[data-status="${status}"]`);
        const glyph = rv(
            `li[data-status="${status}"] [data-happy2-ui="agent-run-card-step-glyph"]`,
        );
        const glyphInk = await inkCenter(glyph);
        expect(Math.abs(glyphInk.x - boxCenterX(glyph)), status).toBeLessThanOrEqual(0.4);
        expect(Math.abs(glyphInk.y - boxCenterY(glyph)), status).toBeLessThanOrEqual(0.4);
        const labelInk = await inkCenter(
            rv(`li[data-status="${status}"] [data-happy2-ui="agent-run-card-step-label"]`),
        );
        expect(Math.abs(labelInk.y - boxCenterY(row)), status).toBeLessThanOrEqual(0.75);
    }

    /* — action row: 28px buttons flush on one row; the label ink inside the
     * button is Button's contract (Button.test.tsx owns its corrections), so
     * the row bound here is intentionally loose. — */
    const primary = rv('[data-happy2-ui="button"][data-variant="primary"]');
    const secondary = rv('[data-happy2-ui="button"][data-variant="secondary"]');
    expect(primary.bounds().height).toBe(28);
    expect(secondary.bounds().height).toBe(28);
    expect(primary.bounds().y).toBe(secondary.bounds().y);
    const primaryLabelInk = await inkCenter(
        rv('[data-happy2-ui="button"][data-variant="primary"] [data-happy2-ui="button-label"]'),
    );
    expect(Math.abs(primaryLabelInk.y - boxCenterY(primary))).toBeLessThanOrEqual(1.25);
}, 240_000);
