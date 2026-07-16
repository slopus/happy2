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
import "./styles/agent-secret-panel.css";
import { AgentSecretPanel, type AgentSecretItem } from "./AgentSecretPanel";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
type View = ReturnType<typeof createRenderer>;
const engine = () => server.browser as Engine;

const uiFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const ICON_TOLERANCE = 0.4;
const TEXT_TOLERANCE = 0.75;

/*
 * Alpha-weighted ink centroid of `partSelector`, offset from the center of
 * `containerSelector` (positive = right/low). Refuses blank or clipped
 * captures. (Same guard as AgentImagePanel.test.tsx.)
 */
async function inkDrift(view: View, containerSelector: string, partSelector: string) {
    const container = view.$(containerSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    const containerBounds = container.bounds();
    return {
        dx: visible.center.x + partBounds.x - containerBounds.x - containerBounds.width / 2,
        dy: visible.center.y + partBounds.y - containerBounds.y - containerBounds.height / 2,
    };
}

const SECRETS: AgentSecretItem[] = [
    {
        id: "service-api",
        description: "Service API credentials",
        environmentVariables: ["SERVICE_API_TOKEN", "SERVICE_API_REGION"],
        agentCount: 2,
        channelCount: 1,
    },
    {
        id: "openai",
        description: "OpenAI organization key",
        environmentVariables: [
            "OPENAI_API_KEY",
            "OPENAI_ORG_ID",
            "OPENAI_PROJECT",
            "OPENAI_BASE_URL",
            "OPENAI_TIMEOUT",
        ],
        agentCount: 5,
        channelCount: 0,
    },
    {
        id: "deploy-bot",
        description: "Deployment bot GitHub token",
        environmentVariables: ["GITHUB_TOKEN"],
        agentCount: 0,
        channelCount: 3,
    },
];

const CONTAINER = { width: 980, height: 340 } as const;

const row = (id: string) => `[data-happy2-ui="data-table-body"] [data-row-id="${id}"]`;
const secretCell = (id: string) => `${row(id)} [data-column-id="secret"]`;
const variablesCell = (id: string) => `${row(id)} [data-column-id="variables"]`;
const agentCount = (id: string) => `${row(id)} [data-happy2-ui="agent-secret-panel-agent-count"]`;
const channelCount = (id: string) =>
    `${row(id)} [data-happy2-ui="agent-secret-panel-channel-count"]`;
const actionsCell = (id: string) => `${row(id)} [data-happy2-ui="data-table-actions"]`;

it("holds AgentSecretPanel layout, variable names, attachment counts, and row actions", async () => {
    const selected: string[] = [];
    const deleted: string[] = [];
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "980px", height: "340px", background: "#17161c", display: "flex" }}
            >
                <AgentSecretPanel
                    data-testid="panel"
                    onDeleteSecret={(id) => deleted.push(id)}
                    onOpenCreate={() => undefined}
                    onSelectSecret={(id) => selected.push(id)}
                    secrets={SECRETS}
                    subtitle="Bundles of environment variables the Rig injects into agents and channels."
                />
            </div>
        ),
        CONTAINER,
    );
    await view.ready();

    // Root: a flex column that fills the container, dark theme text + UI font.
    const root = view.$('[data-testid="panel"]');
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 980, height: 340 });
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
    const title = view.$(".happy2-agent-secret-panel__title");
    expect(title.textMetrics().text).toBe("Agent secrets");
    expect(title.textMetrics().font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: 0,
        lineHeight: 20,
        size: 15,
        weight: "600",
    });
    expect(view.$(".happy2-agent-secret-panel__subtitle").computedStyle("color")).toBe(
        "rgb(117, 112, 133)",
    );

    // Header actions pin right and expose only New secret — there is no refresh
    // control; the list stays live from the realtime stream.
    const actions = view.$(".happy2-agent-secret-panel__actions");
    expect(Math.abs(actions.offsets().right), "header actions right-aligned").toBeLessThanOrEqual(
        0.5,
    );
    const headerButtons = actions.element.querySelectorAll("button");
    expect(Array.from(headerButtons, (button) => button.textContent)).toEqual(["New secret"]);

    // Secret cell shows the description and the id as a mono meta line.
    expect(
        view.$(`${secretCell("service-api")} .happy2-agent-secret-panel__description`).element
            .textContent,
    ).toBe("Service API credentials");
    const idLine = view.$(`${secretCell("service-api")} .happy2-agent-secret-panel__id`);
    expect(idLine.element.textContent).toBe("service-api");
    expect(idLine.computedStyle("font-family")).toContain("happy2 Mono");

    // Variable names render as outline badges, previewing the first four with a
    // "+N" overflow for the rest; a single-variable secret shows exactly one.
    const badgeLabels = (id: string) =>
        Array.from(
            view.$(variablesCell(id)).element.querySelectorAll('[data-happy2-ui="badge-label"]'),
            (node) => node.textContent,
        );
    expect(badgeLabels("service-api")).toEqual(["SERVICE_API_TOKEN", "SERVICE_API_REGION"]);
    expect(badgeLabels("openai")).toEqual([
        "OPENAI_API_KEY",
        "OPENAI_ORG_ID",
        "OPENAI_PROJECT",
        "OPENAI_BASE_URL",
    ]);
    expect(
        view.$(`${variablesCell("openai")} .happy2-agent-secret-panel__overflow`).element
            .textContent,
    ).toBe("+1");
    expect(
        view
            .$(variablesCell("openai"))
            .element.querySelector(".happy2-agent-secret-panel__overflow"),
        "openai overflows",
    ).not.toBeNull();
    expect(badgeLabels("deploy-bot")).toEqual(["GITHUB_TOKEN"]);
    expect(
        view
            .$(variablesCell("service-api"))
            .element.querySelector(".happy2-agent-secret-panel__overflow"),
        "two-variable secret has no overflow",
    ).toBeNull();

    // Attachment counts read the agent and channel totals.
    expect(view.$(agentCount("service-api")).element.textContent).toContain("2");
    expect(view.$(channelCount("service-api")).element.textContent).toContain("1");
    expect(view.$(agentCount("deploy-bot")).element.textContent).toContain("0");
    expect(view.$(channelCount("deploy-bot")).element.textContent).toContain("3");

    // Every row exposes a Delete action.
    for (const secret of SECRETS)
        expect(
            Array.from(
                view.$(actionsCell(secret.id)).element.querySelectorAll("button"),
                (button) => button.textContent?.trim(),
            ),
            `${secret.id} actions`,
        ).toEqual(["Delete"]);

    // A row click opens the detail; a Delete click deletes and does not select.
    (view.$(row("openai")).element as HTMLElement).click();
    view.$(actionsCell("service-api")).element.querySelector("button")!.click();
    expect(selected, "row click selects; delete click does not").toEqual(["openai"]);
    expect(deleted).toEqual(["service-api"]);

    // Optical: the Delete button's close glyph is centered in its icon slot.
    const glyph = await inkDrift(
        view,
        `${actionsCell("deploy-bot")} [data-happy2-ui="button-icon"]`,
        `${actionsCell("deploy-bot")} [data-happy2-ui="button-icon"] svg`,
    );
    expect(Math.abs(glyph.dx), "delete glyph dx").toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(glyph.dy), "delete glyph dy").toBeLessThanOrEqual(TEXT_TOLERANCE);

    await view.screenshot("AgentSecretPanel.test");
}, 120_000);

it("disables the delete action while a delete is in flight", async () => {
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "980px", height: "240px", background: "#17161c", display: "flex" }}
            >
                <AgentSecretPanel
                    busySecretIds={["service-api"]}
                    data-testid="panel"
                    onDeleteSecret={() => undefined}
                    secrets={SECRETS}
                />
            </div>
        ),
        { width: 980, height: 240 },
    );
    await view.ready();

    expect(
        view.$(actionsCell("service-api")).element.querySelector("button")!.disabled,
        "busy row delete disabled",
    ).toBe(true);
    expect(
        view.$(actionsCell("openai")).element.querySelector("button")!.disabled,
        "idle row delete enabled",
    ).toBe(false);
}, 120_000);

it("renders the create overlay with controlled, masked inputs and submit gating", async () => {
    const closed: number[] = [];
    const submitted: number[] = [];
    const ids: string[] = [];
    const added: number[] = [];
    const removed: number[] = [];
    const view = createRenderer()
        .render(
            () => (
                <div
                    style={{
                        width: "760px",
                        height: "560px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <AgentSecretPanel
                        createOpen
                        data-testid="empty-draft"
                        draftDescription=""
                        draftId=""
                        draftVariables={[{ name: "", value: "" }]}
                        onAddDraftVariable={() => added.push(1)}
                        onCloseCreate={() => closed.push(1)}
                        onDraftIdChange={(value) => ids.push(value)}
                        onRemoveDraftVariable={(index) => removed.push(index)}
                        onSubmitCreate={() => submitted.push(1)}
                        secrets={SECRETS}
                    />
                </div>
            ),
            { width: 760, height: 560, padding: 0 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "760px",
                        height: "560px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <AgentSecretPanel
                        createError="environment must not be empty"
                        createOpen
                        data-testid="filled-draft"
                        draftDescription="Service API credentials"
                        draftId="service-api"
                        draftVariables={[
                            { name: "SERVICE_API_TOKEN", value: "sk-live" },
                            { name: "SERVICE_API_REGION", value: "west" },
                        ]}
                        onRemoveDraftVariable={(index) => removed.push(index)}
                        onSubmitCreate={() => submitted.push(2)}
                        secrets={SECRETS}
                    />
                </div>
            ),
            { width: 760, height: 560, padding: 0 },
        );
    await view.ready();

    // The overlay is a self-contained absolute scrim over the panel.
    const overlay = view.$('[data-testid="empty-draft"] .happy2-agent-secret-panel__overlay');
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

    // Empty draft: id/description blank, one blank variable row whose value is
    // masked, submit gated, and its lone remove control disabled.
    const emptyInputs = view
        .$('[data-testid="empty-draft"]')
        .element.querySelectorAll<HTMLInputElement>("input");
    expect(Array.from(emptyInputs, (field) => field.value)).toEqual(["", "", "", ""]);
    const emptyValue = emptyInputs[3]!;
    expect(emptyValue.type, "the value field is masked").toBe("password");
    const emptyRows = view
        .$('[data-testid="empty-draft"]')
        .element.querySelectorAll(".happy2-agent-secret-panel__variable-row");
    expect(emptyRows.length).toBe(1);
    const emptyRemove = emptyRows[0]!.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove variable"]',
    )!;
    expect(emptyRemove.disabled, "sole variable cannot be removed").toBe(true);
    expect(modalSubmit(view, "empty-draft").disabled, "submit gated on empty draft").toBe(true);

    // Filled draft: fields mirror the props, two variable rows, submit enabled,
    // and the create error surfaces inside the dialog.
    const filledInputs = view
        .$('[data-testid="filled-draft"]')
        .element.querySelectorAll<HTMLInputElement>("input");
    expect(Array.from(filledInputs, (field) => field.value)).toEqual([
        "service-api",
        "Service API credentials",
        "SERVICE_API_TOKEN",
        "sk-live",
        "SERVICE_API_REGION",
        "west",
    ]);
    const filledSubmit = modalSubmit(view, "filled-draft");
    expect(filledSubmit.disabled, "submit enabled with a full draft").toBe(false);
    filledSubmit.click();
    expect(submitted).toEqual([2]);
    expect(
        view.$('[data-testid="filled-draft"] [data-happy2-ui="banner"]').element.textContent,
    ).toContain("environment must not be empty");

    // A second variable row can be removed; its index flows through the callback.
    const filledRows = view
        .$('[data-testid="filled-draft"]')
        .element.querySelectorAll(".happy2-agent-secret-panel__variable-row");
    expect(filledRows.length).toBe(2);
    filledRows[1]!
        .querySelector<HTMLButtonElement>('button[aria-label="Remove variable"]')!
        .click();
    expect(removed).toEqual([1]);

    // Cancel closes via callback; add + id-change handlers are wired.
    modalCancel(view, "empty-draft").click();
    expect(closed).toEqual([1]);
    view.$(
        '[data-testid="empty-draft"] .happy2-agent-secret-panel__add-variable',
    ).element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(added).toEqual([1]);
    const idField = emptyInputs[0]!;
    idField.value = "openai";
    idField.dispatchEvent(new Event("input", { bubbles: true }));
    expect(ids.at(-1)).toBe("openai");

    await view.screenshot("AgentSecretPanel.create.test");
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
                    <AgentSecretPanel data-testid="loading" loading secrets={[]} />
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
                    <AgentSecretPanel
                        data-testid="error"
                        error="You must be a server administrator."
                        secrets={[]}
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
                    <AgentSecretPanel
                        data-testid="empty"
                        onOpenCreate={() => undefined}
                        secrets={[]}
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

    // Empty (loaded, zero secrets): a table whose empty slot invites the first one.
    const emptySlot = view.$('[data-testid="empty"] [data-happy2-ui="data-table-empty"]');
    expect(emptySlot.element.textContent).toContain("No agent secrets yet");

    await view.screenshot("AgentSecretPanel.variants.test");
}, 120_000);

function modalSubmit(view: View, testId: string): HTMLButtonElement {
    return modalFooterButton(view, testId, "Create secret");
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
