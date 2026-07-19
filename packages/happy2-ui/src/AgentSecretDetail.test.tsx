import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/badge.css";
import "./styles/banner.css";
import "./styles/select.css";
import "./styles/agent-secret-detail.css";
import { AgentSecretDetail, type AgentSecretBinding } from "./AgentSecretDetail";
import { createRenderer } from "./testing";

type View = ReturnType<typeof createRenderer>;

const ICON_TOLERANCE = 0.4;
const TEXT_TOLERANCE = 0.75;

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

const AGENTS: AgentSecretBinding[] = [
    { id: "agent-1", name: "Secret Worker", secondary: "@secret_worker" },
    { id: "agent-2", name: "Deploy Bot", secondary: "@deploy_bot" },
];

const CHANNELS: AgentSecretBinding[] = [
    { id: "chan-1", name: "Deployments", secondary: "#secret-deployments" },
];

const AVAILABLE_AGENTS = [
    { value: "agent-3", label: "Release Agent (@release_agent)" },
    { value: "agent-4", label: "QA Agent (@qa_agent)" },
];

const AVAILABLE_CHANNELS = [
    { value: "chan-2", label: "Incidents (#incidents)" },
    { value: "chan-3", label: "On-call (#on-call)" },
];

function frame(view: View, render: () => any, height: number, width = 560) {
    return view.render(
        () => (
            <div style={{ width: `${width}px`, height: `${height}px`, background: "#f5f5f5" }}>
                {render()}
            </div>
        ),
        { width, height },
    );
}

const agentsSection = '[data-happy2-ui="agent-secret-detail-agents"]';
const channelsSection = '[data-happy2-ui="agent-secret-detail-channels"]';
const binding = (id: string) => `.happy2-agent-secret-detail__binding[data-binding-id="${id}"]`;

it("holds AgentSecretDetail layout, variable names, bindings, and attach/detach wiring", async () => {
    const attachedAgents: string[] = [];
    const detachedAgents: string[] = [];
    const attachedChannels: string[] = [];
    const detachedChannels: string[] = [];
    const view = createRenderer();
    frame(
        view,
        () => (
            <AgentSecretDetail
                agents={AGENTS}
                availableAgents={AVAILABLE_AGENTS}
                availableChannels={AVAILABLE_CHANNELS}
                channels={CHANNELS}
                data-testid="detail"
                environmentVariables={["SERVICE_API_TOKEN", "SERVICE_API_REGION"]}
                onAttachAgent={(id) => attachedAgents.push(id)}
                onAttachChannel={(id) => attachedChannels.push(id)}
                onDetachAgent={(id) => detachedAgents.push(id)}
                onDetachChannel={(id) => detachedChannels.push(id)}
            />
        ),
        520,
    );
    await view.ready();

    // Root: a flex column with a 20px rhythm, dark theme text.
    const root = view.$('[data-testid="detail"]');
    expect(
        root.computedStyles(["display", "flex-direction", "gap", "box-sizing", "color"]),
    ).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "20px",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
    });

    // Variables strip: one outline badge per name, plus the never-leaves note.
    const variableLabels = Array.from(
        view
            .$(".happy2-agent-secret-detail__variables")
            .element.querySelectorAll('[data-happy2-ui="badge-label"]'),
        (node) => node.textContent,
    );
    expect(variableLabels).toEqual(["SERVICE_API_TOKEN", "SERVICE_API_REGION"]);
    expect(view.$(".happy2-agent-secret-detail__note").element.textContent).toContain(
        "Values are stored in the Rig and never leave it.",
    );

    // Section counts reflect the number of bindings.
    expect(
        view.$(`${agentsSection} .happy2-agent-secret-detail__section-count`).element.textContent,
    ).toBe("2");
    expect(
        view.$(`${channelsSection} .happy2-agent-secret-detail__section-count`).element.textContent,
    ).toBe("1");

    // Agent bindings render their name and mono secondary line.
    expect(
        view.$(`${binding("agent-1")} .happy2-agent-secret-detail__binding-name`).element
            .textContent,
    ).toBe("Secret Worker");
    expect(
        view.$(`${binding("agent-1")} .happy2-agent-secret-detail__binding-secondary`).element
            .textContent,
    ).toBe("@secret_worker");
    expect(
        view.$(`${binding("chan-1")} .happy2-agent-secret-detail__binding-name`).element
            .textContent,
    ).toBe("Deployments");

    // Detach: clicking a binding's remove control reports its id.
    (
        view.$(`${binding("agent-2")} button[aria-label="Detach Deploy Bot"]`)
            .element as HTMLElement
    ).click();
    (
        view.$(`${binding("chan-1")} button[aria-label="Detach Deployments"]`)
            .element as HTMLElement
    ).click();
    expect(detachedAgents).toEqual(["agent-2"]);
    expect(detachedChannels).toEqual(["chan-1"]);

    // Attach: choosing a candidate in a section picker reports its id.
    const agentPicker = view.$(`${agentsSection} [data-happy2-ui="select-native"]`)
        .element as HTMLSelectElement;
    agentPicker.value = "agent-3";
    agentPicker.dispatchEvent(new Event("change", { bubbles: true }));
    const channelPicker = view.$(`${channelsSection} [data-happy2-ui="select-native"]`)
        .element as HTMLSelectElement;
    channelPicker.value = "chan-2";
    channelPicker.dispatchEvent(new Event("change", { bubbles: true }));
    expect(attachedAgents).toEqual(["agent-3"]);
    expect(attachedChannels).toEqual(["chan-2"]);

    // Optical: a detach button's close glyph is centered in its icon slot.
    const glyph = await inkDrift(
        view,
        `${binding("agent-1")} [data-happy2-ui="button-icon"]`,
        `${binding("agent-1")} [data-happy2-ui="button-icon"] svg`,
    );
    expect(Math.abs(glyph.dx), "detach glyph dx").toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(glyph.dy), "detach glyph dy").toBeLessThanOrEqual(TEXT_TOLERANCE);

    await view.screenshot("AgentSecretDetail.test");
}, 120_000);

it("handles unattached sections, a saturated picker, a busy detach, and an error", async () => {
    const view = createRenderer();
    frame(
        view,
        () => (
            <AgentSecretDetail
                agents={[]}
                availableAgents={AVAILABLE_AGENTS}
                availableChannels={AVAILABLE_CHANNELS}
                channels={[]}
                data-testid="unattached"
                environmentVariables={["OPENAI_API_KEY", "OPENAI_ORG_ID"]}
                onAttachAgent={() => undefined}
                onAttachChannel={() => undefined}
                onDetachAgent={() => undefined}
                onDetachChannel={() => undefined}
            />
        ),
        420,
    );
    frame(
        view,
        () => (
            <AgentSecretDetail
                agents={AGENTS}
                availableAgents={[]}
                availableChannels={[]}
                busyAgentIds={["agent-2"]}
                channels={CHANNELS}
                data-testid="busy"
                environmentVariables={["GITHUB_TOKEN"]}
                error="The agent is no longer available."
                onAttachAgent={() => undefined}
                onAttachChannel={() => undefined}
                onDetachAgent={() => undefined}
                onDetachChannel={() => undefined}
            />
        ),
        460,
    );
    await view.ready();

    // Unattached: each section shows its empty note with an enabled picker.
    const unattached = view.$('[data-testid="unattached"]');
    expect(
        Array.from(
            unattached.element.querySelectorAll(".happy2-agent-secret-detail__empty"),
            (node) => node.textContent,
        ),
    ).toEqual(["No agents attached yet.", "No channels attached yet."]);
    expect(
        unattached.element.querySelectorAll(".happy2-agent-secret-detail__binding").length,
        "no bindings when unattached",
    ).toBe(0);
    const enabledPicker = view.$(
        `[data-testid="unattached"] ${agentsSection} [data-happy2-ui="select-native"]`,
    ).element as HTMLSelectElement;
    expect(enabledPicker.disabled, "picker enabled while candidates remain").toBe(false);

    // Busy: an error banner, a saturated (disabled) picker with its own
    // placeholder, and a disabled detach for the in-flight agent only.
    const busyBanner = view.$('[data-testid="busy"] [data-happy2-ui="banner"]');
    expect(busyBanner.element.getAttribute("data-tone")).toBe("danger");
    expect(busyBanner.element.textContent).toContain("The agent is no longer available.");
    const saturated = view.$(
        `[data-testid="busy"] ${agentsSection} [data-happy2-ui="select-native"]`,
    ).element as HTMLSelectElement;
    expect(saturated.disabled, "saturated picker disabled").toBe(true);
    expect(
        view.$(`[data-testid="busy"] ${agentsSection} [data-happy2-ui="select-value"]`).element
            .textContent,
    ).toBe("Every agent is attached");
    expect(
        view
            .$(`[data-testid="busy"] ${binding("agent-2")} button`)
            .element.hasAttribute("disabled"),
        "busy detach disabled",
    ).toBe(true);
    expect(
        view
            .$(`[data-testid="busy"] ${binding("agent-1")} button`)
            .element.hasAttribute("disabled"),
        "idle detach enabled",
    ).toBe(false);

    await view.screenshot("AgentSecretDetail.variants.test");
}, 120_000);
