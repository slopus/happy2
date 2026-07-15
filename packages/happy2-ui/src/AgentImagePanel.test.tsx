import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/badge.css";
import "./styles/banner.css";
import "./styles/empty-state.css";
import "./styles/modal.css";
import "./styles/text-field.css";
import "./styles/form-row.css";
import "./styles/data-table.css";
import "./styles/agent-image-panel.css";
import { AgentImagePanel, type AgentImageItem } from "./AgentImagePanel";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
type View = ReturnType<typeof createRenderer>;
const engine = () => server.browser as Engine;

const uiFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

// Symmetric glyph ink holds the tight bound; asymmetric word ink holds the
// 0.75px contract ceiling on the vertical axis. Matches the AgentDesk contract.
const ICON_TOLERANCE = 0.4;
const TEXT_TOLERANCE = 0.75;

/*
 * Alpha-weighted ink centroid of `partSelector`, offset from the center of
 * `containerSelector` (positive = right/low). Refuses blank or clipped
 * captures — the part must paint pixels and its ink may not touch the captured
 * box edges. (Same guard as DataTable.test.tsx.)
 */
async function inkDrift(view: View, containerSelector: string, partSelector: string) {
    const container = view.$(containerSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    expect(visible.bounds.y, `${partSelector} ink clipped at box top`).toBeGreaterThan(0);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${partSelector} ink clipped at box bottom`,
    ).toBeLessThan(partBounds.height);
    expect(visible.bounds.x, `${partSelector} ink clipped at box left`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${partSelector} ink clipped at box right`,
    ).toBeLessThan(partBounds.width);
    const containerBounds = container.bounds();
    return {
        dx: visible.center.x + partBounds.x - containerBounds.x - containerBounds.width / 2,
        dy: visible.center.y + partBounds.y - containerBounds.y - containerBounds.height / 2,
    };
}

const IMAGES: AgentImageItem[] = [
    {
        id: "img-default",
        name: "Daycare — full toolchain",
        status: "ready",
        builtin: true,
        isDefault: true,
        updatedLabel: "Jul 12, 2:14 PM",
    },
    {
        id: "img-minimal",
        name: "Daycare — minimal",
        status: "ready",
        builtin: true,
        updatedLabel: "Jul 12, 2:14 PM",
    },
    {
        id: "img-building",
        name: "Python + Node",
        status: "building",
        progress: 62,
        lastLogLine: "#6 [4/4] RUN pip install --no-cache-dir",
        updatedLabel: "Jul 13, 9:02 AM",
    },
    { id: "img-pending", name: "Rust nightly", status: "pending", updatedLabel: "Jul 13, 9:05 AM" },
    {
        id: "img-failed",
        name: "GPU inference base",
        status: "failed",
        error: "package cuda-toolkit-12-4 has no installation candidate",
        updatedLabel: "Jul 13, 8:47 AM",
    },
];

const CONTAINER = { width: 920, height: 360 } as const;

const row = (id: string) => `[data-happy2-ui="data-table-body"] [data-row-id="${id}"]`;
const nameCell = (id: string) => `${row(id)} [data-column-id="name"]`;
const statusCell = (id: string) => `${row(id)} [data-column-id="status"]`;
const statusBadge = (id: string) => `${statusCell(id)} [data-happy2-ui="badge"]`;
const defaultCell = (id: string) =>
    `${row(id)} [data-column-id="default"] [data-happy2-ui="data-table-cell"]`;
const actionsCell = (id: string) => `${row(id)} [data-happy2-ui="data-table-actions"]`;

it("holds AgentImagePanel layout, status mapping, the default marker, and row actions", async () => {
    const built: string[] = [];
    const promoted: string[] = [];
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "920px", height: "360px", background: "#17161c", display: "flex" }}
            >
                <AgentImagePanel
                    data-testid="panel"
                    images={IMAGES}
                    onBuildImage={(id) => built.push(id)}
                    onOpenCreate={() => undefined}
                    onSetDefaultImage={(id) => promoted.push(id)}
                    subtitle="Immutable images every server-owned agent runs inside."
                />
            </div>
        ),
        CONTAINER,
    );
    await view.ready();

    // Root: a flex column that fills the container, dark theme text + UI font.
    const root = view.$('[data-testid="panel"]');
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 920, height: 360 });
    expect(
        root.computedStyles([
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "gap",
            "position",
        ]),
    ).toEqual({
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        display: "flex",
        "flex-direction": "column",
        gap: "16px",
        position: "relative",
    });
    expect(root.computedStyle("font-family")).toBe(uiFamily());

    // Header title: 15/600 UI type; subtitle is muted.
    const title = view.$(".happy2-agent-image-panel__title");
    expect(title.textMetrics().text).toBe("Agent images");
    expect(title.textMetrics().font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: 0,
        lineHeight: 20,
        size: 15,
        weight: "600",
    });
    expect(view.$(".happy2-agent-image-panel__subtitle").computedStyle("color")).toBe(
        "rgb(117, 112, 133)",
    );

    // Header actions pin to the right edge and expose only New image — there is
    // no refresh control; the list stays live from the realtime stream.
    const actions = view.$(".happy2-agent-image-panel__actions");
    expect(Math.abs(actions.offsets().right), "header actions right-aligned").toBeLessThanOrEqual(
        0.5,
    );
    const headerButtons = actions.element.querySelectorAll("button");
    expect(Array.from(headerButtons, (button) => button.textContent)).toEqual(["New image"]);

    // Status column proves the status -> badge-variant mapping, with exact tokens.
    const statusExpectations: Array<[string, string, string, string]> = [
        ["img-pending", "info", "rgba(96, 165, 250, 0.13)", "rgb(96, 165, 250)"],
        ["img-building", "warning", "rgba(251, 191, 36, 0.13)", "rgb(252, 211, 77)"],
        ["img-minimal", "success", "rgba(52, 211, 153, 0.13)", "rgb(110, 231, 183)"],
        ["img-failed", "danger", "rgba(248, 113, 113, 0.13)", "rgb(252, 165, 165)"],
    ];
    for (const [id, variant, background, color] of statusExpectations) {
        const badge = view.$(statusBadge(id));
        expect(badge.element.getAttribute("data-variant"), `${id} variant`).toBe(variant);
        expect(badge.computedStyles(["background-color", "color"]), `${id} badge colors`).toEqual({
            "background-color": background,
            color,
        });
    }

    // Default column: the accent "Default" badge on the default row only; every
    // other row renders an em dash.
    const defaultBadge = view.$(`${defaultCell("img-default")} [data-happy2-ui="badge"]`);
    expect(defaultBadge.element.getAttribute("data-variant")).toBe("accent");
    expect(defaultBadge.element.textContent).toContain("Default");
    for (const id of ["img-minimal", "img-building", "img-pending", "img-failed"]) {
        expect(view.$(defaultCell(id)).element.textContent, `${id} default cell`).toBe("—");
        expect(
            view.$(defaultCell(id)).element.querySelector('[data-happy2-ui="badge"]'),
            `${id} has no default badge`,
        ).toBeNull();
    }

    // Row actions follow the server rules: pending/failed build, ready-non-default
    // promotes, and a ready default (or an in-flight build) offers nothing.
    const actionText = (id: string) =>
        Array.from(view.$(actionsCell(id)).element.querySelectorAll("button"), (b) =>
            b.textContent?.trim(),
        );
    expect(actionText("img-pending")).toEqual(["Build"]);
    expect(actionText("img-failed")).toEqual(["Retry build"]);
    expect(actionText("img-minimal")).toEqual(["Make default"]);
    expect(actionText("img-default")).toEqual([]);
    expect(actionText("img-building")).toEqual([]);

    // Actions report the correct id through their callbacks.
    view.$(actionsCell("img-pending")).element.querySelector("button")!.click();
    view.$(actionsCell("img-failed")).element.querySelector("button")!.click();
    view.$(actionsCell("img-minimal")).element.querySelector("button")!.click();
    expect(built).toEqual(["img-pending", "img-failed"]);
    expect(promoted).toEqual(["img-minimal"]);

    // Optical: the default badge's check glyph is centered in its 12px icon slot.
    const glyph = await inkDrift(
        view,
        `${defaultCell("img-default")} [data-happy2-ui="badge-icon"]`,
        `${defaultCell("img-default")} [data-happy2-ui="badge-icon"] svg`,
    );
    expect(Math.abs(glyph.dx), "default badge glyph dx").toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(glyph.dy), "default badge glyph dy").toBeLessThanOrEqual(TEXT_TOLERANCE);

    await view.screenshot("AgentImagePanel.test");
}, 120_000);

it("busy row actions disable while a mutation is in flight", async () => {
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "920px", height: "220px", background: "#17161c", display: "flex" }}
            >
                <AgentImagePanel
                    busyImageIds={["img-pending", "img-minimal"]}
                    data-testid="panel"
                    images={IMAGES}
                    onBuildImage={() => undefined}
                    onSetDefaultImage={() => undefined}
                />
            </div>
        ),
        { width: 920, height: 220 },
    );
    await view.ready();

    const buildButton = view.$(actionsCell("img-pending")).element.querySelector("button")!;
    const promoteButton = view.$(actionsCell("img-minimal")).element.querySelector("button")!;
    expect(buildButton.disabled, "busy build disabled").toBe(true);
    expect(promoteButton.disabled, "busy promote disabled").toBe(true);
    // A non-busy row keeps its action enabled.
    expect(
        view.$(actionsCell("img-failed")).element.querySelector("button")!.disabled,
        "idle row enabled",
    ).toBe(false);
}, 120_000);

it("shows build progress, the last log line, and opens a row on click", async () => {
    const selected: string[] = [];
    const built: string[] = [];
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "920px", height: "260px", background: "#17161c", display: "flex" }}
            >
                <AgentImagePanel
                    data-testid="panel"
                    images={IMAGES}
                    onBuildImage={(id) => built.push(id)}
                    onSelectImage={(id) => selected.push(id)}
                />
            </div>
        ),
        { width: 920, height: 260 },
    );
    await view.ready();

    // The building row carries a determinate progress bar at its percentage; the
    // fill spans 62% of the track and the tabular value reads "62%".
    const bar = view.$(`${statusCell("img-building")} [role="progressbar"]`);
    expect(bar.element.getAttribute("aria-valuenow")).toBe("62");
    const track = view.$(`${statusCell("img-building")} .happy2-agent-image-panel__progress-track`);
    const fill = view.$(`${statusCell("img-building")} .happy2-agent-image-panel__progress-fill`);
    expect(Math.abs(fill.width() - track.width() * 0.62), "fill spans 62%").toBeLessThanOrEqual(
        0.6,
    );
    expect(fill.computedStyle("background-image")).toBe(
        "linear-gradient(135deg, rgb(139, 124, 247), rgb(244, 114, 182))",
    );
    expect(
        view.$(`${statusCell("img-building")} .happy2-agent-image-panel__progress-value`).element
            .textContent,
    ).toBe("62%");
    // Only the building row shows progress.
    for (const id of ["img-default", "img-minimal", "img-pending", "img-failed"])
        expect(
            view.$(statusCell(id)).element.querySelector('[role="progressbar"]'),
            `${id} has no progress bar`,
        ).toBeNull();

    // The last build-log line shows muted under the building name; a failed row
    // shows its error in danger tone at the same slot.
    const buildingSub = view.$(`${nameCell("img-building")} .happy2-agent-image-panel__subline`);
    expect(buildingSub.element.textContent).toBe("#6 [4/4] RUN pip install --no-cache-dir");
    expect(buildingSub.element.getAttribute("data-tone")).toBe("muted");
    expect(buildingSub.computedStyle("color")).toBe("rgb(117, 112, 133)");
    const failedSub = view.$(`${nameCell("img-failed")} .happy2-agent-image-panel__subline`);
    expect(failedSub.element.textContent).toBe(
        "package cuda-toolkit-12-4 has no installation candidate",
    );
    expect(failedSub.element.getAttribute("data-tone")).toBe("danger");
    expect(failedSub.computedStyle("color")).toBe("rgb(248, 113, 113)");
    // A ready row with no log line renders no subline.
    expect(
        view.$(nameCell("img-minimal")).element.querySelector(".happy2-agent-image-panel__subline"),
        "ready row has no subline",
    ).toBeNull();

    // Clicking a row reports its id; clicking a row action does not (it opens the
    // action, not the detail).
    (view.$(row("img-default")).element as HTMLElement).click();
    view.$(actionsCell("img-pending")).element.querySelector("button")!.click();
    expect(selected, "row click opens detail; action click does not").toEqual(["img-default"]);
    expect(built).toEqual(["img-pending"]);

    await view.screenshot("AgentImagePanel.progress.test");
}, 120_000);

it("renders the create overlay with controlled inputs and submit gating", async () => {
    const closed: number[] = [];
    const submitted: number[] = [];
    const names: string[] = [];
    const view = createRenderer()
        .render(
            () => (
                <div
                    style={{
                        width: "760px",
                        height: "460px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <AgentImagePanel
                        createOpen
                        data-testid="empty-draft"
                        draftDockerfile=""
                        draftName=""
                        images={IMAGES}
                        onCloseCreate={() => closed.push(1)}
                        onDraftNameChange={(value) => names.push(value)}
                        onSubmitCreate={() => submitted.push(1)}
                    />
                </div>
            ),
            { width: 760, height: 460, padding: 0 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "760px",
                        height: "460px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <AgentImagePanel
                        createError="dockerfile exceeds the 256 KiB limit"
                        createOpen
                        data-testid="filled-draft"
                        draftDockerfile="FROM happy2/agent-base:latest"
                        draftName="Python + Node"
                        images={IMAGES}
                        onSubmitCreate={() => submitted.push(2)}
                    />
                </div>
            ),
            { width: 760, height: 460, padding: 0 },
        );
    await view.ready();

    // The overlay is a self-contained absolute scrim over the panel.
    const overlay = view.$('[data-testid="empty-draft"] .happy2-agent-image-panel__overlay');
    expect(
        overlay.computedStyles(["position", "display", "align-items", "justify-content"]),
    ).toEqual({
        position: "absolute",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
    });
    const overlayOffsets = overlay.offsets();
    expect(
        [overlayOffsets.top, overlayOffsets.right, overlayOffsets.bottom, overlayOffsets.left],
        "overlay covers the panel",
    ).toEqual([0, 0, 0, 0]);
    expect(
        overlay.element.querySelector('[data-happy2-ui="modal-dialog"]'),
        "modal present",
    ).not.toBeNull();

    // Inputs are controlled: the empty draft leaves both fields blank and gates
    // submit; the filled draft mirrors its values and enables submit.
    const emptyInputs = view
        .$('[data-testid="empty-draft"]')
        .element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    expect(Array.from(emptyInputs, (field) => field.value)).toEqual(["", ""]);
    const emptySubmit = modalSubmit(view, "empty-draft");
    expect(emptySubmit.disabled, "submit gated on empty draft").toBe(true);

    const filledInputs = view
        .$('[data-testid="filled-draft"]')
        .element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    expect(Array.from(filledInputs, (field) => field.value)).toEqual([
        "Python + Node",
        "FROM happy2/agent-base:latest",
    ]);
    const filledSubmit = modalSubmit(view, "filled-draft");
    expect(filledSubmit.disabled, "submit enabled with a full draft").toBe(false);
    filledSubmit.click();
    expect(submitted).toEqual([2]);

    // The create error surfaces inside the dialog.
    expect(
        view.$('[data-testid="filled-draft"] [data-happy2-ui="banner"]').element.textContent,
    ).toContain("dockerfile exceeds the 256 KiB limit");

    // Cancel closes via callback; the field change handler is wired.
    modalCancel(view, "empty-draft").click();
    expect(closed).toEqual([1]);
    const nameField = emptyInputs[0]!;
    nameField.value = "Rust nightly";
    nameField.dispatchEvent(new Event("input", { bubbles: true }));
    expect(names.at(-1)).toBe("Rust nightly");
}, 120_000);

it("shows loading, error, and empty affordances", async () => {
    const view = createRenderer()
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "200px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <AgentImagePanel data-testid="loading" images={[]} loading />
                </div>
            ),
            { width: 560, height: 200, padding: 0 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "200px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <AgentImagePanel
                        data-testid="error"
                        error="You must be a server administrator."
                        images={[]}
                    />
                </div>
            ),
            { width: 560, height: 200, padding: 0 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "220px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <AgentImagePanel
                        data-testid="empty"
                        images={[]}
                        onOpenCreate={() => undefined}
                    />
                </div>
            ),
            { width: 560, height: 220, padding: 0 },
        );
    await view.ready();

    // Loading: an empty-state, no table.
    expect(
        view.$('[data-testid="loading"]').element.querySelector('[data-happy2-ui="empty-state"]'),
        "loading empty-state",
    ).not.toBeNull();
    expect(
        view.$('[data-testid="loading"]').element.querySelector('[data-happy2-ui="data-table"]'),
        "no table while loading",
    ).toBeNull();

    // Error: a danger banner replaces the table entirely.
    const errorBanner = view.$('[data-testid="error"] [data-happy2-ui="banner"]');
    expect(errorBanner.element.getAttribute("data-tone")).toBe("danger");
    expect(errorBanner.element.textContent).toContain("You must be a server administrator.");
    expect(
        view.$('[data-testid="error"]').element.querySelector('[data-happy2-ui="data-table"]'),
        "no table on error",
    ).toBeNull();

    // Empty (loaded, zero images): a table whose empty slot invites the first image.
    const emptySlot = view.$('[data-testid="empty"] [data-happy2-ui="data-table-empty"]');
    expect(emptySlot.element.textContent).toContain("No agent images yet");

    await view.screenshot("AgentImagePanel.variants.test");
}, 120_000);

function modalSubmit(view: View, testId: string): HTMLButtonElement {
    return modalFooterButton(view, testId, "Create image");
}

function modalCancel(view: View, testId: string): HTMLButtonElement {
    return modalFooterButton(view, testId, "Cancel");
}

function modalFooterButton(view: View, testId: string, label: string): HTMLButtonElement {
    const buttons = view
        .$(`[data-testid="${testId}"] [data-happy2-ui="modal-footer"]`)
        .element.querySelectorAll<HTMLButtonElement>("button");
    const match = Array.from(buttons).find((button) => button.textContent?.includes(label));
    if (!match) throw new Error(`No “${label}” button in the ${testId} modal footer.`);
    return match;
}
