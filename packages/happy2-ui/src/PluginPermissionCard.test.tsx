import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/badge.css";
import "./styles/plugin-permission-card.css";
import { PluginPermissionCard } from "./PluginPermissionCard";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

const uiFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/* Deterministic inline 1×1 violet PNG so tests never load network assets. */
const PLUGIN_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGeoBwAChAGAgUOTOAAAAABJRU5ErkJggg==";

const REQUEST = {
    pluginName: "Chat Helper",
    shortName: "chat-helper",
    description: "Adds a safe helper skill for the chat workflow.",
    reason: "The user asked for its chat workflow.",
    source: "https://plugins.example/chat-helper.zip",
    requestedBy: "Plugin Builder",
} as const;

it("holds pending layout: amber treatment, package image, request content, and working decisions", async () => {
    const decisions: string[] = [];
    const view = createRenderer().render(
        () => (
            <div style={{ width: "600px", background: "#f5f5f5", display: "flex", padding: "0" }}>
                <PluginPermissionCard
                    {...REQUEST}
                    action="install"
                    data-testid="card"
                    imageUrl={PLUGIN_IMAGE}
                    onApprove={() => decisions.push("approve")}
                    onDeny={() => decisions.push("deny")}
                    status="pending"
                />
            </div>
        ),
        { width: 600, height: 340 },
    );
    await view.ready();

    // Root: bordered surface card capped at 560px with the pending amber hairline.
    const root = view.$('[data-testid="card"]');
    expect(root.bounds().width).toBe(560);
    expect(
        root.computedStyles([
            "background-color",
            "border-top-left-radius",
            "box-sizing",
            "color",
            "max-width",
            "overflow-x",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-top-left-radius": "10px",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        "max-width": "560px",
        "overflow-x": "hidden",
    });
    expect(root.computedStyle("font-family")).toBe(uiFamily());
    expect(root.computedStyle("border-top-color")).toBe("rgb(255, 149, 0)");
    expect(root.element.getAttribute("data-status")).toBe("pending");

    // No banner while pending; the shield chip wears the warning tone.
    expect(root.element.querySelector('[data-happy2-ui="plugin-permission-card-banner"]')).toBe(
        null,
    );
    const chip = view.$('[data-happy2-ui="plugin-permission-card-chip"]');
    expect(chip.bounds().width).toBe(26);
    expect(chip.bounds().height).toBe(26);
    expect(chip.computedStyle("color")).toBe("rgb(255, 149, 0)");

    // Type badge and the requesting agent pinned right.
    expect(view.$('[data-testid="card"] [data-happy2-ui="badge-label"]').element.textContent).toBe(
        "Plugin install",
    );
    const requester = view.$('[data-happy2-ui="plugin-permission-card-requester"]');
    expect(requester.element.textContent).toBe("Plugin Builder");
    const header = view.$('[data-happy2-ui="plugin-permission-card-header"]');
    expect(
        header.bounds().x +
            header.bounds().width -
            (requester.bounds().x + requester.bounds().width),
        "requester pinned to the header's right edge",
    ).toBeCloseTo(0, 2);

    // 48px package image slot renders the staged image.
    const image = view.$('[data-happy2-ui="plugin-permission-card-image"]');
    expect(image.bounds().width).toBe(48);
    expect(image.bounds().height).toBe(48);
    expect(image.computedStyle("border-radius")).toBe("8px");
    expect(image.element.querySelector("img")).not.toBeNull();

    // Title, mono short name, description, reason quote, and mono source well.
    const title = view.$('[data-happy2-ui="plugin-permission-card-title"]');
    expect(title.textMetrics().text).toBe("Wants to install Chat Helper");
    expect(title.textMetrics().font.size).toBe(15);
    expect(title.textMetrics().font.weight).toBe("700");
    const shortName = view.$('[data-happy2-ui="plugin-permission-card-short-name"]');
    expect(shortName.element.textContent).toBe("chat-helper");
    expect(shortName.computedStyle("font-family")).toContain("happy2 Mono");
    expect(
        view.$('[data-happy2-ui="plugin-permission-card-description"]').element.textContent,
    ).toBe(REQUEST.description);
    const reason = view.$('[data-happy2-ui="plugin-permission-card-reason"]');
    expect(reason.element.textContent).toBe(REQUEST.reason);
    expect(reason.computedStyle("font-style")).toBe("italic");
    const source = view.$('[data-happy2-ui="plugin-permission-card-source"]');
    expect(source.element.textContent).toBe(REQUEST.source);
    expect(source.computedStyle("font-family")).toContain("happy2 Mono");

    // Decisions flow through the callbacks.
    const approve = root.element.querySelector<HTMLButtonElement>('[data-action="approve"]')!;
    const deny = root.element.querySelector<HTMLButtonElement>('[data-action="deny"]')!;
    expect(approve.textContent).toContain("Approve install");
    expect(deny.textContent).toContain("Deny");
    approve.click();
    deny.click();
    expect(decisions).toEqual(["approve", "deny"]);

    await view.screenshot("PluginPermissionCard.test");
}, 120_000);

it("disables decisions while busy or processing and hides them without decision authority", async () => {
    const decisions: string[] = [];
    const view = createRenderer()
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <PluginPermissionCard
                        {...REQUEST}
                        action="install"
                        busy
                        data-testid="busy"
                        onApprove={() => decisions.push("approve")}
                        onDeny={() => decisions.push("deny")}
                        status="pending"
                    />
                </div>
            ),
            { width: 600, height: 320, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <PluginPermissionCard
                        {...REQUEST}
                        action="uninstall"
                        data-testid="processing"
                        status="processing"
                    />
                </div>
            ),
            { width: 600, height: 320, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <PluginPermissionCard
                        {...REQUEST}
                        action="install"
                        canDecide={false}
                        data-testid="member"
                        onApprove={() => decisions.push("member-approve")}
                        onDeny={() => decisions.push("member-deny")}
                        status="pending"
                    />
                </div>
            ),
            { width: 600, height: 320, padding: 0 },
        );
    await view.ready();

    // Busy: both buttons stay mounted but disabled; clicks never fire.
    const busyRoot = view.$('[data-testid="busy"]');
    const approve = busyRoot.element.querySelector<HTMLButtonElement>('[data-action="approve"]')!;
    const deny = busyRoot.element.querySelector<HTMLButtonElement>('[data-action="deny"]')!;
    expect(approve.disabled).toBe(true);
    expect(deny.disabled).toBe(true);
    approve.click();
    deny.click();
    expect(decisions).toEqual([]);

    // Processing: actions replaced by the info state line; no banner yet.
    const processing = view.$('[data-testid="processing"]');
    expect(processing.element.querySelector('[data-action="approve"]')).toBeNull();
    expect(
        processing.element.querySelector('[data-happy2-ui="plugin-permission-card-banner"]'),
    ).toBeNull();
    expect(
        processing.element.querySelector('[data-happy2-ui="plugin-permission-card-state-label"]')!
            .textContent,
    ).toBe("Uninstalling Chat Helper…");

    // A pending request without decision authority keeps the amber pending
    // treatment but replaces the actions with the approval-required state.
    const member = view.$('[data-testid="member"]');
    expect(member.element.getAttribute("data-status")).toBe("pending");
    expect(member.computedStyle("border-top-color")).toBe("rgb(255, 149, 0)");
    expect(member.element.querySelector('[data-action="approve"]')).toBeNull();
    expect(member.element.querySelector('[data-action="deny"]')).toBeNull();
    expect(member.element.querySelector("button")).toBeNull();
    const memberState = view.$(
        '[data-testid="member"] [data-happy2-ui="plugin-permission-card-state-label"]',
    );
    expect(memberState.element.textContent).toBe("Administrator approval required");
    expect(memberState.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(decisions).toEqual([]);

    await view.screenshot("PluginPermissionCard.busy.test");
}, 120_000);

it("renders clearly terminal approved, denied, and failed states", async () => {
    const view = createRenderer()
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <PluginPermissionCard
                        {...REQUEST}
                        action="install"
                        data-testid="approved"
                        status="approved"
                    />
                </div>
            ),
            { width: 600, height: 340, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <PluginPermissionCard
                        {...REQUEST}
                        action="uninstall"
                        data-testid="denied"
                        status="denied"
                    />
                </div>
            ),
            { width: 600, height: 340, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <PluginPermissionCard
                        {...REQUEST}
                        action="install"
                        data-testid="failed"
                        error="MCP initialize timed out after 20s."
                        status="failed"
                    />
                </div>
            ),
            { width: 600, height: 340, padding: 0 },
        );
    await view.ready();

    const banner = (id: string) =>
        view.$(`[data-testid="${id}"] [data-happy2-ui="plugin-permission-card-banner"]`);
    const state = (id: string) =>
        view.$(`[data-testid="${id}"] [data-happy2-ui="plugin-permission-card-state-label"]`);

    // Approved: mint banner, success state line, no action buttons.
    expect(banner("approved").element.textContent).toContain("Approved");
    expect(banner("approved").computedStyle("color")).toBe("rgb(52, 199, 89)");
    expect(banner("approved").bounds().height).toBe(32);
    expect(state("approved").element.textContent).toBe("Approved — Chat Helper was installed");
    expect(
        view.$('[data-testid="approved"]').element.querySelector('[data-action="approve"]'),
    ).toBeNull();

    // Denied: danger banner and a neutral terminal line.
    expect(banner("denied").element.textContent).toContain("Denied");
    expect(banner("denied").computedStyle("color")).toBe("rgb(255, 59, 48)");
    expect(state("denied").element.textContent).toBe("Denied — no changes were made");

    // Failed: danger banner carries the bounded diagnostic in the state line.
    expect(banner("failed").element.textContent).toContain("Failed");
    expect(state("failed").element.textContent).toBe(
        "Failed — MCP initialize timed out after 20s.",
    );

    await view.screenshot("PluginPermissionCard.resolutions.test");
}, 120_000);
