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
import "./styles/select.css";
import "./styles/plugin-catalog-panel.css";
import { PluginCatalogPanel, type PluginCatalogEntry } from "./PluginCatalogPanel";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
type View = ReturnType<typeof createRenderer>;
const engine = () => server.browser as Engine;

const uiFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const HELLO: PluginCatalogEntry = {
    shortName: "hello",
    displayName: "Hello",
    description: "A minimal skills-only example plugin bundled with the server.",
    version: "1.0.0",
    skills: [{ name: "hello", description: "Says hello." }],
    variables: [],
    installed: true,
    installations: [
        { id: "ins-1", version: "1.0.0", status: "ready" },
        { id: "ins-2", version: "1.0.0", status: "preparing" },
    ],
};

const PROJECT_SEARCH: PluginCatalogEntry = {
    shortName: "project-search",
    displayName: "Project Search",
    description: "Searches source code and project documentation.",
    version: "2.1.0",
    skills: [],
    mcp: { type: "remote", container: "none" },
    variables: [
        {
            key: "PROJECT_API_TOKEN",
            displayName: "API token",
            description: "Token used by the MCP server.",
            kind: "secret",
        },
        {
            key: "PROJECT_REGION",
            displayName: "Region",
            description: "Region used for project queries.",
            kind: "text",
        },
    ],
    installed: true,
    installedVersion: "2.0.0",
    updateAvailable: true,
    installations: [
        { id: "ins-3", version: "2.0.0", status: "failed", detail: "MCP initialize timed out." },
    ],
};

const RUNNER: PluginCatalogEntry = {
    shortName: "task-runner",
    displayName: "Task Runner",
    description: "Runs project automation through a stdio MCP in a selected container.",
    version: "0.4.2",
    skills: [
        { name: "run-task", description: "Runs one task." },
        { name: "list-tasks", description: "Lists tasks." },
    ],
    mcp: { type: "stdio", container: "selection_required" },
    variables: [
        {
            key: "RUNNER_TOKEN",
            displayName: "Runner token",
            description: "Token the runner uses against the project API.",
            kind: "secret",
        },
    ],
    installed: false,
    installations: [],
};

const card = (shortName: string) =>
    `.happy2-plugin-catalog-panel__card[data-plugin-short-name="${shortName}"]`;

it("holds PluginCatalogPanel layout, capability badges, installation health, and install actions", async () => {
    const opened: string[] = [];
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "980px", height: "520px", background: "#17161c", display: "flex" }}
            >
                <PluginCatalogPanel
                    data-testid="panel"
                    onOpenInstall={(shortName) => opened.push(shortName)}
                    plugins={[HELLO, PROJECT_SEARCH, RUNNER]}
                    subtitle="Packages of Agent Skills and MCP servers bundled with the server."
                />
            </div>
        ),
        { width: 980, height: 520 },
    );
    await view.ready();

    // Root: a flex column that fills the container, dark theme text + UI font.
    const root = view.$('[data-testid="panel"]');
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 980, height: 520 });
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
    const title = view.$(".happy2-plugin-catalog-panel__title");
    expect(title.textMetrics().text).toBe("Plugins");
    expect(title.textMetrics().font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: 0,
        lineHeight: 20,
        size: 15,
        weight: "600",
    });
    expect(view.$(".happy2-plugin-catalog-panel__subtitle").computedStyle("color")).toBe(
        "rgb(117, 112, 133)",
    );

    // Card row: 40px icon slot with 8px radius, body fills, action pins right.
    const icon = view.$(`${card("hello")} .happy2-plugin-catalog-panel__icon`);
    expect(icon.bounds().width).toBe(40);
    expect(icon.bounds().height).toBe(40);
    expect(icon.computedStyle("border-radius")).toBe("8px");
    const cardBox = view.$(card("hello"));
    expect(cardBox.computedStyles(["display", "align-items", "gap", "border-radius"])).toEqual({
        display: "flex",
        "align-items": "flex-start",
        gap: "12px",
        "border-radius": "10px",
    });
    // Card actions pin right inside the 16px card padding and 1px border.
    const actions = view.$(`${card("hello")} .happy2-plugin-catalog-panel__card-actions`);
    expect(actions.offsets().right, "card actions right-aligned").toBe(17);

    // Name and version: 14/600 name, mono muted version.
    const name = view.$(`${card("hello")} [data-happy2-ui="plugin-catalog-name"]`);
    expect(name.textMetrics().text).toBe("Hello");
    expect(name.textMetrics().font.size).toBe(14);
    expect(name.textMetrics().font.weight).toBe("600");
    const version = view.$(`${card("hello")} [data-happy2-ui="plugin-catalog-version"]`);
    expect(version.element.textContent).toBe("v1.0.0");
    expect(version.computedStyle("font-family")).toContain("happy2 Mono");

    // An installed package pinned to an older version shows the stored version
    // and both Installed and Update badges.
    expect(
        view.$(`${card("project-search")} [data-happy2-ui="plugin-catalog-version"]`).element
            .textContent,
    ).toBe("v2.0.0");
    const badgeLabels = (shortName: string) =>
        Array.from(
            view
                .$(`${card(shortName)} .happy2-plugin-catalog-panel__name-row`)
                .element.querySelectorAll('[data-happy2-ui="badge-label"]'),
            (node) => node.textContent,
        );
    expect(badgeLabels("hello")).toEqual(["Installed"]);
    expect(badgeLabels("project-search")).toEqual(["Installed", "Update v2.1.0"]);
    expect(badgeLabels("task-runner")).toEqual([]);

    // Capability badges: skills count and MCP mode.
    const capabilities = (shortName: string) =>
        Array.from(
            view
                .$(`${card(shortName)} .happy2-plugin-catalog-panel__capabilities`)
                .element.querySelectorAll('[data-happy2-ui="badge-label"]'),
            (node) => node.textContent,
        );
    expect(capabilities("hello")).toEqual(["1 skill"]);
    expect(capabilities("project-search")).toEqual(["MCP · remote"]);
    expect(capabilities("task-runner")).toEqual(["2 skills", "MCP · stdio"]);

    // Installations: one status badge per independent installation, with the
    // bounded diagnostic in the title attribute.
    const installations = view.$(`${card("hello")} .happy2-plugin-catalog-panel__installations`);
    expect(
        Array.from(
            installations.element.querySelectorAll('[data-happy2-ui="badge-label"]'),
            (node) => node.textContent,
        ),
    ).toEqual(["Ready", "Preparing"]);
    const failed = view.$(`${card("project-search")} [data-installation-id="ins-3"]`);
    expect(failed.element.getAttribute("title")).toBe("MCP initialize timed out.");
    expect(
        failed.element.querySelector('[data-happy2-ui="badge"]')!.getAttribute("data-variant"),
    ).toBe("danger");
    expect(
        view
            .$(card("task-runner"))
            .element.querySelector(".happy2-plugin-catalog-panel__installations"),
        "no installations row for an uninstalled package",
    ).toBeNull();

    // Install actions: primary for a first install, secondary for another
    // installation of an installed package; clicks flow through the callback.
    const button = (shortName: string) =>
        view.$(`${card(shortName)} .happy2-plugin-catalog-panel__card-actions button`);
    expect(button("task-runner").element.textContent).toContain("Install");
    expect(button("hello").element.textContent).toContain("Install again");
    (button("task-runner").element as HTMLButtonElement).click();
    (button("hello").element as HTMLButtonElement).click();
    expect(opened).toEqual(["task-runner", "hello"]);

    await view.screenshot("PluginCatalogPanel.test");
}, 120_000);

it("disables the install action while an install is in flight", async () => {
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "760px", height: "240px", background: "#17161c", display: "flex" }}
            >
                <PluginCatalogPanel
                    busyShortNames={["hello"]}
                    data-testid="panel"
                    onOpenInstall={() => undefined}
                    plugins={[HELLO, RUNNER]}
                />
            </div>
        ),
        { width: 760, height: 240 },
    );
    await view.ready();

    const button = (shortName: string) =>
        view.$(`${card(shortName)} .happy2-plugin-catalog-panel__card-actions button`)
            .element as HTMLButtonElement;
    expect(button("hello").disabled, "busy install disabled").toBe(true);
    expect(button("hello").textContent).toContain("Installing…");
    expect(button("task-runner").disabled, "idle install enabled").toBe(false);
}, 120_000);

it("renders the install overlay with masked variables, image selection, and submit gating", async () => {
    const closed: number[] = [];
    const submitted: number[] = [];
    const changes: [string, string][] = [];
    const images: string[] = [];
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
                    <PluginCatalogPanel
                        containerImageOptions={[
                            { value: "img-1", label: "daycare-full" },
                            { value: "img-2", label: "daycare-minimal" },
                        ]}
                        data-testid="empty-draft"
                        draftValues={{}}
                        installOpen="task-runner"
                        onCloseInstall={() => closed.push(1)}
                        onDraftContainerImageChange={(value) => images.push(value)}
                        onDraftValueChange={(key, value) => changes.push([key, value])}
                        onSubmitInstall={() => submitted.push(1)}
                        plugins={[RUNNER]}
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
                    <PluginCatalogPanel
                        containerImageOptions={[{ value: "img-1", label: "daycare-full" }]}
                        data-testid="filled-draft"
                        draftContainerImageId="img-1"
                        draftValues={{ RUNNER_TOKEN: "secret-value" }}
                        installOpen="task-runner"
                        onSubmitInstall={() => submitted.push(2)}
                        plugins={[RUNNER]}
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
                        height: "460px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <PluginCatalogPanel
                        data-testid="no-config"
                        installOpen="hello"
                        onSubmitInstall={() => submitted.push(3)}
                        plugins={[HELLO]}
                    />
                </div>
            ),
            { width: 760, height: 460, padding: 0 },
        );
    await view.ready();

    // The overlay is a self-contained absolute scrim over the panel.
    const overlay = view.$('[data-testid="empty-draft"] .happy2-plugin-catalog-panel__overlay');
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

    // Empty draft: the secret value field is masked, the image select empty,
    // and submit gated on both.
    const secretInput = view
        .$('[data-testid="empty-draft"]')
        .element.querySelector<HTMLInputElement>("input")!;
    expect(secretInput.value).toBe("");
    expect(secretInput.type, "secret variables are masked").toBe("password");
    expect(modalSubmit(view, "empty-draft").disabled, "submit gated on empty draft").toBe(true);
    secretInput.value = "token";
    secretInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(changes.at(-1)).toEqual(["RUNNER_TOKEN", "token"]);
    const select = view
        .$('[data-testid="empty-draft"]')
        .element.querySelector<HTMLSelectElement>("select")!;
    select.value = "img-2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(images.at(-1)).toBe("img-2");

    // Filled draft: value and image mirror the props; submit enables and fires.
    const filledSubmit = modalSubmit(view, "filled-draft");
    expect(filledSubmit.disabled, "submit enabled with a full draft").toBe(false);
    filledSubmit.click();
    expect(submitted).toEqual([2]);

    // A no-configuration package explains itself and submits immediately.
    expect(
        view.$('[data-testid="no-config"] .happy2-plugin-catalog-panel__form-note').element
            .textContent,
    ).toContain("This package needs no configuration.");
    expect(
        view
            .$('[data-testid="no-config"]')
            .element.querySelectorAll(
                '[data-happy2-ui="modal-dialog"] input, [data-happy2-ui="modal-dialog"] select',
            ).length,
        "no fields for a no-configuration package",
    ).toBe(0);
    expect(modalSubmit(view, "no-config").disabled).toBe(false);

    // Cancel closes via callback.
    modalCancel(view, "empty-draft").click();
    expect(closed).toEqual([1]);

    await view.screenshot("PluginCatalogPanel.install.test");
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
                    <PluginCatalogPanel data-testid="loading" loading plugins={[]} />
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
                    <PluginCatalogPanel
                        data-testid="error"
                        error="You must be a server administrator."
                        plugins={[]}
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
                    <PluginCatalogPanel data-testid="empty" plugins={[]} />
                </div>
            ),
            { width: 560, height: 220, padding: 0 },
        );
    await view.ready();

    // Loading: an empty-state, no cards.
    expect(
        view.$('[data-testid="loading"]').element.querySelector('[data-happy2-ui="empty-state"]'),
        "loading empty-state",
    ).not.toBeNull();
    expect(
        view
            .$('[data-testid="loading"]')
            .element.querySelector(".happy2-plugin-catalog-panel__card"),
        "no cards while loading",
    ).toBeNull();

    // Error: a danger banner replaces the list entirely.
    const errorBanner = view.$('[data-testid="error"] [data-happy2-ui="banner"]');
    expect(errorBanner.element.getAttribute("data-tone")).toBe("danger");
    expect(errorBanner.element.textContent).toContain("You must be a server administrator.");

    // Empty (loaded, zero packages): the catalog empty-state.
    expect(
        view.$('[data-testid="empty"] [data-happy2-ui="empty-state"]').element.textContent,
    ).toContain("No plugins in the catalog");

    await view.screenshot("PluginCatalogPanel.variants.test");
}, 120_000);

function modalSubmit(view: View, testId: string): HTMLButtonElement {
    return modalFooterButton(view, testId, "Install plugin");
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
