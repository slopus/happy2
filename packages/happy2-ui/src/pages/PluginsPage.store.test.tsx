import { useState } from "react";
import {
    agentImagesStoreFixtureCreate,
    pluginInstallStoreFixtureCreate,
    pluginsStoreFixtureCreate,
} from "happy2-state/testing";
import { UserError, type PreparedPluginSummary, type SystemPluginSummary } from "happy2-state";
import { expect, it, onTestFinished } from "vitest";
import "../styles.css";
import { createRenderer } from "../testing";
import { PluginsPage } from "./admin/PluginsPage";

function owned<Fixture extends Disposable>(fixture: Fixture): Fixture {
    onTestFinished(() => fixture[Symbol.dispose]());
    return fixture;
}

const image = {
    contentType: "image/png",
    size: 10,
    width: 1024,
    height: 1024,
    thumbhash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
    checksumSha256: "checksum",
} as const;

function systemPlugin(overrides: Partial<SystemPluginSummary> = {}): SystemPluginSummary {
    return {
        id: "plugin-repo",
        displayName: "Repo Tools",
        shortName: "repo-tools",
        description: "Release helpers installed from a GitHub repository.",
        sourceKind: "github",
        sourceReference: "github:ref",
        sourceVersion: "1.0.0",
        packageDigest: "digest-1",
        variables: [],
        apiPermissions: [],
        image,
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updateAvailable: false,
        installations: [
            {
                id: "ins-1",
                pluginId: "plugin-repo",
                shortName: "repo-tools",
                sourceVersion: "1.0.0",
                packageDigest: "digest-1",
                grantedPermissions: [],
                status: "ready",
                installedAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            },
        ],
        ...overrides,
    };
}

function candidate(overrides: Partial<PreparedPluginSummary> = {}): PreparedPluginSummary {
    return {
        preparedToken: "token-1",
        expiresAt: "2026-01-01T00:15:00.000Z",
        sourceKind: "zip_url",
        sourceReference: "https://example.com/plugin.zip",
        packageDigest: "digest-9",
        version: "2.0.0",
        displayName: "Linked Tools",
        shortName: "linked-tools",
        description: "Tools linked from a ZIP URL.",
        skills: [],
        variables: [],
        apiPermissions: [],
        image,
        ...overrides,
    };
}

it("starts automatic update checks on mount, never duplicates them, and stops on unmount", async () => {
    const outputs: string[] = [];
    const plugins = owned(pluginsStoreFixtureCreate((event) => outputs.push(event.type)));
    const install = owned(pluginInstallStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    plugins.input({ type: "pluginsLoaded", plugins: [] });
    plugins.input({ type: "systemPluginsLoaded", plugins: [systemPlugin()] });
    function Harness() {
        const [mounted, setMounted] = useState(true);
        const [query, setQuery] = useState("");
        return (
            <div style={{ display: "flex", flexDirection: "column", width: "880px" }}>
                <button data-testid="toggle" onClick={() => setMounted((value) => !value)}>
                    toggle
                </button>
                <button data-testid="query" onClick={() => setQuery("repo")}>
                    query
                </button>
                {mounted ? (
                    <PluginsPage
                        agentImagesStore={() => images.store}
                        installStore={() => install.store}
                        query={query}
                        store={plugins.store}
                    />
                ) : null}
            </div>
        );
    }
    const view = createRenderer().render(() => <Harness />, { width: 880, height: 560 });
    await view.ready();

    // Becoming visible starts the watch exactly once.
    expect(outputs).toEqual(["pluginUpdateChecksStarted"]);
    expect(plugins.store.getState().updateChecksActive).toBe(true);

    // An ordinary parent rerender keeps the same visibility lifetime.
    view.container.querySelector<HTMLButtonElement>('[data-testid="query"]')!.click();
    await view.ready();
    expect(outputs).toEqual(["pluginUpdateChecksStarted"]);

    // Authoritative reconciliation and check-progress notifications rerender
    // the page without restarting the watch or duplicating transport intent.
    plugins.input({ type: "systemPluginsLoaded", plugins: [systemPlugin()] });
    plugins.input({ type: "pluginUpdateCheckStarted", pluginId: "plugin-repo" });
    plugins.input({
        type: "pluginUpdateCheckProgressed",
        pluginId: "plugin-repo",
        progress: { stage: "downloading", detail: "Downloading", receivedBytes: 1, totalBytes: 2 },
    });
    await view.ready();
    expect(outputs).toEqual(["pluginUpdateChecksStarted"]);

    // Leaving the surface stops the watch through the ref cleanup.
    view.container.querySelector<HTMLButtonElement>('[data-testid="toggle"]')!.click();
    await view.ready();
    expect(outputs).toEqual(["pluginUpdateChecksStarted", "pluginUpdateChecksStopped"]);
    expect(plugins.store.getState().updateChecksActive).toBe(false);

    // Returning restarts it.
    view.container.querySelector<HTMLButtonElement>('[data-testid="toggle"]')!.click();
    await view.ready();
    expect(outputs).toEqual([
        "pluginUpdateChecksStarted",
        "pluginUpdateChecksStopped",
        "pluginUpdateChecksStarted",
    ]);
}, 120_000);

it("keeps row DOM identity while automatic update checks stream through their states", async () => {
    const plugins = owned(pluginsStoreFixtureCreate());
    const install = owned(pluginInstallStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    plugins.input({ type: "pluginsLoaded", plugins: [] });
    plugins.input({ type: "systemPluginsLoaded", plugins: [systemPlugin()] });
    const view = createRenderer().render(
        () => (
            <div style={{ display: "flex", width: "880px" }}>
                <PluginsPage
                    agentImagesStore={() => images.store}
                    installStore={() => install.store}
                    store={plugins.store}
                />
            </div>
        ),
        { width: 880, height: 480 },
    );
    await view.ready();

    const row = view.container.querySelector('[data-plugin-short-name="repo-tools"]')!;
    expect(row.textContent).toContain("Repo Tools");
    expect(row.textContent).toContain("GitHub");

    const updateBadge = () =>
        row.querySelector('[data-happy2-ui="plugin-catalog-update-check"]')?.textContent;
    plugins.input({ type: "pluginUpdateCheckStarted", pluginId: "plugin-repo" });
    await view.ready();
    expect(view.container.querySelector('[data-plugin-short-name="repo-tools"]')).toBe(row);
    expect(updateBadge()).toContain("Checking for update…");
    plugins.input({
        type: "pluginUpdateCheckProgressed",
        pluginId: "plugin-repo",
        progress: { stage: "downloading", detail: "Downloading remote package" },
    });
    await view.ready();
    expect(
        row.querySelector('[data-happy2-ui="plugin-catalog-update-check"]')!.getAttribute("title"),
    ).toBe("Downloading remote package");

    plugins.input({
        type: "pluginUpdateChecked",
        pluginId: "plugin-repo",
        update: {
            pluginId: "plugin-repo",
            checkedAt: "2026-01-02T00:00:00.000Z",
            updateAvailable: true,
            installed: { version: "1.0.0", packageDigest: "digest-1" },
            remote: { version: "1.1.0", packageDigest: "digest-2" },
        },
    });
    await view.ready();
    expect(view.container.querySelector('[data-plugin-short-name="repo-tools"]')).toBe(row);
    expect(updateBadge()).toContain("Update v1.1.0 available");

    plugins.input({
        type: "pluginUpdateCheckFailed",
        pluginId: "plugin-repo",
        error: new UserError("The installed plugin path no longer exists remotely"),
    });
    await view.ready();
    expect(view.container.querySelector('[data-plugin-short-name="repo-tools"]')).toBe(row);
    expect(updateBadge()).toContain("Update check failed");
    expect(
        row.querySelector('[data-happy2-ui="plugin-catalog-update-check"]')!.getAttribute("title"),
    ).toBe("The installed plugin path no longer exists remotely");

    plugins.input({
        type: "pluginUpdateChecked",
        pluginId: "plugin-repo",
        update: {
            pluginId: "plugin-repo",
            checkedAt: "2026-01-02T00:00:00.000Z",
            updateAvailable: false,
            installed: { version: "1.0.0", packageDigest: "digest-1" },
            remote: { version: "1.0.0", packageDigest: "digest-1" },
        },
    });
    await view.ready();
    expect(view.container.querySelector('[data-plugin-short-name="repo-tools"]')).toBe(row);
    expect(updateBadge()).toContain("Up to date");
}, 120_000);

it("projects a system plugin represented by the catalog once and keeps uninstall available", async () => {
    const linked = systemPlugin();
    const plugins = owned(pluginsStoreFixtureCreate());
    const install = owned(pluginInstallStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    plugins.input({
        type: "pluginsLoaded",
        plugins: [
            {
                displayName: linked.displayName,
                shortName: linked.shortName,
                description: linked.description,
                version: linked.sourceVersion,
                packageDigest: linked.packageDigest,
                skills: [],
                variables: linked.variables,
                apiPermissions: linked.apiPermissions,
                systemPlugin: linked,
            },
        ],
    });
    plugins.input({ type: "systemPluginsLoaded", plugins: [linked] });
    const view = createRenderer().render(
        () => (
            <div style={{ display: "flex", width: "880px", height: "480px" }}>
                <PluginsPage
                    agentImagesStore={() => images.store}
                    installStore={() => install.store}
                    store={plugins.store}
                />
            </div>
        ),
        { width: 880, height: 480 },
    );
    await view.ready();

    const rows = view.container.querySelectorAll('[data-plugin-short-name="repo-tools"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("GitHub");
    rows[0]!.querySelector<HTMLButtonElement>('[data-testid="plugin-catalog-uninstall"]')!.click();
    await view.ready();
    expect(
        view.container.querySelector('[data-happy2-ui="plugin-uninstall-message"]')!.textContent,
    ).toContain("Repo Tools");
}, 120_000);

it("walks the external install flow with preserved dialog identity, focus, and typed outputs", async () => {
    const flowOutputs: unknown[] = [];
    const plugins = owned(pluginsStoreFixtureCreate());
    const install = owned(pluginInstallStoreFixtureCreate((event) => flowOutputs.push(event)));
    const images = owned(agentImagesStoreFixtureCreate());
    let imageStoreRequests = 0;
    plugins.input({ type: "pluginsLoaded", plugins: [] });
    plugins.input({ type: "systemPluginsLoaded", plugins: [] });
    images.input({
        type: "imagesLoaded",
        images: [
            {
                id: "img-1",
                name: "daycare-full",
                definitionHash: "hash-1",
                dockerTag: "happy2-agent:img-1",
                status: "ready",
                buildAttempt: 1,
                buildProgress: 100,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    });
    const view = createRenderer().render(
        () => (
            <div style={{ display: "flex", width: "1024px", height: "704px" }}>
                <PluginsPage
                    agentImagesStore={() => {
                        imageStoreRequests += 1;
                        return images.store;
                    }}
                    installStore={() => install.store}
                    store={plugins.store}
                />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    // The header entry point opens the flow at the source step.
    view.container
        .querySelector<HTMLButtonElement>('[data-testid="plugin-catalog-install-external"]')!
        .click();
    await view.ready();
    const overlay = view.container.querySelector('[data-happy2-ui="modal-overlay"]')!;
    const dialog = overlay.querySelector('[data-happy2-ui="modal-dialog"]')!;
    expect(imageStoreRequests).toBeGreaterThan(0);

    // A cancelled native file picker (change without files) causes no work.
    const fileInput = view.container.querySelector<HTMLInputElement>(
        '[data-testid="plugin-install-file-input"]',
    )!;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await view.ready();
    expect(flowOutputs).toEqual([]);

    // Choose the ZIP URL source and type; the store-driven input keeps focus,
    // DOM identity, and value through every store notification.
    view.container.querySelector<HTMLButtonElement>('[data-source-kind="zip_url"]')!.click();
    await view.ready();
    const url = view.container.querySelector<HTMLInputElement>(
        '[data-happy2-ui="modal-dialog"] input[type="text"]',
    )!;
    url.focus();
    url.value = "https://example.com/plugin.zip";
    url.dispatchEvent(new Event("input", { bubbles: true }));
    await view.ready();
    expect(install.store.getState().urlDraft).toBe("https://example.com/plugin.zip");
    expect(document.activeElement).toBe(url);
    expect(view.container.querySelector('[data-happy2-ui="modal-dialog"]')).toBe(dialog);

    // An unrelated authoritative plugins notification must not disturb the
    // open dialog, its focused control, or its local value.
    plugins.input({ type: "systemPluginsLoaded", plugins: [systemPlugin()] });
    await view.ready();
    expect(view.container.querySelector('[data-happy2-ui="modal-dialog"]')).toBe(dialog);
    expect(document.activeElement).toBe(url);
    expect(url.value).toBe("https://example.com/plugin.zip");

    // Prepare emits one typed intent; progress streams into the same dialog.
    view.container
        .querySelector<HTMLButtonElement>('[data-testid="plugin-install-prepare"]')!
        .click();
    await view.ready();
    expect(flowOutputs).toEqual([
        {
            type: "pluginPrepareSubmitted",
            source: { kind: "zip_url", url: "https://example.com/plugin.zip" },
        },
    ]);
    install.input({
        type: "pluginPrepareProgressed",
        progress: {
            stage: "downloading",
            detail: "Downloading plugin archive",
            receivedBytes: 512,
            totalBytes: 1024,
        },
    });
    await view.ready();
    expect(view.container.querySelector('[data-happy2-ui="modal-dialog"]')).toBe(dialog);
    expect(dialog.textContent).toContain("Downloading package");

    // The verified candidate configures variables and the container image.
    install.input({
        type: "pluginPrepared",
        selectionRequired: false,
        candidates: [
            candidate({
                variables: [
                    {
                        key: "API_TOKEN",
                        displayName: "API token",
                        description: "Token used by the MCP server.",
                        kind: "secret",
                    },
                ],
                mcp: { type: "stdio", container: "selection_required" },
                apiPermissions: [
                    {
                        id: "plugins",
                        displayName: "Plugins",
                        readOnly: [
                            {
                                id: "plugins:list",
                                displayName: "View plugins",
                                description: "View installed plugins and their current status.",
                            },
                        ],
                        mutations: [],
                    },
                ],
            }),
        ],
    });
    await view.ready();
    expect(view.container.querySelector('[data-happy2-ui="modal-dialog"]')).toBe(dialog);
    expect(dialog.textContent).toContain("Linked Tools");
    expect(imageStoreRequests).toBeGreaterThan(0);
    const secret = dialog.querySelector<HTMLInputElement>('input[type="password"]')!;
    secret.value = "secret value";
    secret.dispatchEvent(new Event("input", { bubbles: true }));
    await view.ready();
    const select = dialog.querySelector<HTMLSelectElement>("select")!;
    select.value = "img-1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await view.ready();
    dialog
        .querySelector<HTMLInputElement>(
            '[data-permission-id="plugins:list"] [data-happy2-ui="checkbox-control"]',
        )!
        .click();
    await view.ready();
    const submit = view.container.querySelector<HTMLButtonElement>(
        '[data-testid="plugin-install-submit"]',
    )!;
    expect(submit.disabled).toBe(false);
    submit.click();
    await view.ready();
    expect(flowOutputs).toHaveLength(2);
    expect(flowOutputs[1]).toEqual({
        type: "pluginInstallPreparedSubmitted",
        preparedToken: "token-1",
        variables: { API_TOKEN: "secret value" },
        permissions: ["plugins:list"],
        containerImageId: "img-1",
    });
    expect(install.store.getState().step).toMatchObject({ step: "installing" });

    // A durable install cannot be dismissed from its backdrop while in flight.
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await view.ready();
    expect(view.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBe(overlay);
    expect(install.store.getState().step).toMatchObject({ step: "installing" });

    // The durable 202 closes the dialog; the surface list carries the lifecycle.
    install.input({
        type: "pluginInstallSucceeded",
        installation: {
            id: "ins-2",
            pluginId: "plugin-linked",
            shortName: "linked-tools",
            sourceVersion: "2.0.0",
            packageDigest: "digest-9",
            grantedPermissions: [],
            status: "preparing",
            installedAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
        },
    });
    await view.ready();
    expect(view.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull();
    expect(JSON.stringify(install.store.getState())).not.toContain("secret value");
}, 120_000);

it("confirms destructive uninstall with pending, failure, and closing on completion", async () => {
    const outputs: unknown[] = [];
    const plugins = owned(pluginsStoreFixtureCreate((event) => outputs.push(event)));
    const install = owned(pluginInstallStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    plugins.input({ type: "pluginsLoaded", plugins: [] });
    plugins.input({ type: "systemPluginsLoaded", plugins: [systemPlugin()] });
    const view = createRenderer().render(
        () => (
            <div style={{ display: "flex", width: "1024px", height: "704px" }}>
                <PluginsPage
                    agentImagesStore={() => images.store}
                    installStore={() => install.store}
                    store={plugins.store}
                />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    // The page mounted, so the watch is active before uninstalling.
    expect(outputs).toEqual([{ type: "pluginUpdateChecksStarted" }]);
    outputs.length = 0;

    // Opening the confirmation names the exact installation count.
    view.container
        .querySelector<HTMLButtonElement>('[data-testid="plugin-catalog-uninstall"]')!
        .click();
    await view.ready();
    const message = view.container.querySelector('[data-happy2-ui="plugin-uninstall-message"]')!;
    expect(message.textContent).toContain("its 1 installation");
    expect(message.textContent).toContain("Repo Tools");
    expect(message.textContent).toContain("/workspace");

    // Confirming routes the typed intent and disables the dialog while pending.
    const confirm = view.container.querySelector<HTMLButtonElement>(
        '[data-testid="plugin-uninstall-confirm"]',
    )!;
    confirm.click();
    await view.ready();
    expect(outputs).toEqual([{ type: "pluginUninstallSubmitted", pluginId: "plugin-repo" }]);
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toContain("Uninstalling…");
    // The row action mirrors the pending state.
    expect(
        view.container.querySelector<HTMLButtonElement>('[data-testid="plugin-catalog-uninstall"]')!
            .disabled,
    ).toBe(true);

    // A terminal failure re-enables the dialog and shows the displayable error.
    plugins.input({
        type: "pluginUninstallFailed",
        pluginId: "plugin-repo",
        error: new UserError("System plugin was not found"),
    });
    await view.ready();
    expect(
        view.container.querySelector('[data-testid="plugin-uninstall-error"]')!.textContent,
    ).toContain("System plugin was not found");
    expect(
        view.container.querySelector<HTMLButtonElement>('[data-testid="plugin-uninstall-confirm"]')!
            .disabled,
    ).toBe(false);

    // A successful uninstall removes the plugin and closes the confirmation.
    view.container
        .querySelector<HTMLButtonElement>('[data-testid="plugin-uninstall-confirm"]')!
        .click();
    plugins.input({ type: "pluginUninstalled", pluginId: "plugin-repo" });
    await view.ready();
    expect(view.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull();
    expect(view.container.querySelector('[data-plugin-short-name="repo-tools"]')).toBeNull();
}, 120_000);
