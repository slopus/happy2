import {
    adminStoreFixtureCreate,
    agentImagesStoreFixtureCreate,
    agentSecretsStoreFixtureCreate,
    pluginInstallStoreFixtureCreate,
    pluginsStoreFixtureCreate,
    rolesStoreFixtureCreate,
    callsStoreFixtureCreate,
    directoryStoreFixtureCreate,
    filesStoreFixtureCreate,
    notificationsStoreFixtureCreate,
    searchStoreFixtureCreate,
    threadsStoreFixtureCreate,
} from "happy2-state/testing";
import {
    UserError,
    type ChatSummary,
    type NotificationProjection,
    type ThreadProjection,
    type ThreadsOutput,
} from "happy2-state";
import { expect, it, onTestFinished, vi } from "vitest";
import "../styles.css";
import { createRenderer } from "../testing";
import { ActivityPage } from "./activity/ActivityPage";
import { AdminPage } from "./admin/AdminPage";
import { AgentImagesPage } from "./admin/AgentImagesPage";
import { AgentSecretsPage } from "./admin/AgentSecretsPage";
import { PluginsPage } from "./admin/PluginsPage";
import { RolesPage } from "./admin/RolesPage";
import { CallsPage } from "./calls/CallsPage";
import { FilesPage } from "./files/FilesPage";
import { HomePage } from "./home/HomePage";
import { ProfilePage } from "./profile/ProfilePage";
import { SearchPage } from "./search/SearchPage";
import { ThreadsPage } from "./threads/ThreadsPage";

function owned<Fixture extends Disposable>(fixture: Fixture): Fixture {
    onTestFinished(() => fixture[Symbol.dispose]());
    return fixture;
}

it("renders FilesPage from FilesStore input", async () => {
    const fixture = owned(filesStoreFixtureCreate());
    fixture.input({ type: "filesLoading" });
    const view = createRenderer();
    view.render(
        () => (
            <FilesPage
                filter="all"
                onFilterChange={() => undefined}
                onQueryChange={() => undefined}
                query=""
                store={fixture.store}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    expect(view.container.textContent).toContain("Loading files");
});

it("routes SearchPage query through the typed SearchStore action", async () => {
    const outputs: string[] = [];
    const fixture = owned(searchStoreFixtureCreate((event) => outputs.push(event.query)));
    const view = createRenderer();
    view.render(() => <SearchPage query="relay" store={fixture.store} />, {
        width: 1024,
        height: 704,
    });
    await view.ready();
    expect(outputs).toEqual(["relay"]);
    expect(view.container.textContent).toContain("No results");
    expect(
        view.container.querySelector('[data-happy2-ui="empty-state"]')?.getAttribute("data-size"),
    ).toBe("panel");
});

it("keeps flush SearchPage idle, searching, and no-results states inline near the top", async () => {
    const idle = owned(searchStoreFixtureCreate());
    const searching = owned(searchStoreFixtureCreate());
    searching.store.getState().queryUpdate("relay");
    searching.input({ type: "searchLoading", query: "relay" });
    const empty = owned(searchStoreFixtureCreate());
    empty.store.getState().queryUpdate("calm");
    empty.input({ type: "searchLoaded", query: "calm", results: [], files: [] });

    const view = createRenderer();
    view.render(() => <SearchPage query="" store={idle.store} variant="flush" />, {
        width: 640,
        height: 399,
    });
    view.render(() => <SearchPage query="relay" store={searching.store} variant="flush" />, {
        width: 640,
        height: 399,
    });
    view.render(() => <SearchPage query="calm" store={empty.store} variant="flush" />, {
        width: 640,
        height: 399,
    });
    await view.ready();

    const states = Array.from(
        view.container.querySelectorAll<HTMLElement>('[data-happy2-ui="empty-state"]'),
    );
    expect(states).toHaveLength(3);
    expect(states.map((state) => state.getAttribute("data-size"))).toEqual([
        "inline",
        "inline",
        "inline",
    ]);
    expect(states.map((state) => state.querySelector("h2")?.textContent)).toEqual([
        "Search Happy (2)",
        "Searching…",
        "No results",
    ]);
    for (const state of states) {
        expect(state.getBoundingClientRect().y).toBeLessThan(
            state.closest<HTMLElement>("[data-gym-surface]")!.getBoundingClientRect().y + 32,
        );
    }
});

it("renders AdminPage without materializing optional admin subpages", async () => {
    const admin = owned(adminStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    const secrets = owned(agentSecretsStoreFixtureCreate());
    const plugins = owned(pluginsStoreFixtureCreate());
    const install = owned(pluginInstallStoreFixtureCreate());
    const roles = owned(rolesStoreFixtureCreate());
    admin.input({
        type: "usersLoaded",
        users: [
            {
                id: "user-without-reset-grant",
                username: "member",
                firstName: "Workspace",
                lastName: "Member",
                role: "member",
                kind: "human",
            },
        ],
    });
    let imageAccesses = 0;
    let secretAccesses = 0;
    let pluginAccesses = 0;
    let installAccesses = 0;
    const view = createRenderer();
    view.render(
        () => (
            <AdminPage
                activeSection="users"
                agentImagesStore={() => {
                    imageAccesses += 1;
                    return images.store;
                }}
                agentSecretsStore={() => {
                    secretAccesses += 1;
                    return secrets.store;
                }}
                onSectionChange={() => undefined}
                pluginInstallStore={() => {
                    installAccesses += 1;
                    return install.store;
                }}
                pluginsStore={() => {
                    pluginAccesses += 1;
                    return plugins.store;
                }}
                rolesStore={() => roles.store}
                store={() => admin.store}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    expect(view.container.textContent).toContain("Admin");
    expect(view.container.textContent).not.toContain("Reset password");
    expect([imageAccesses, secretAccesses, pluginAccesses, installAccesses]).toEqual([0, 0, 0, 0]);
});

it("opens a generated password handoff from each authorized user row and submits its exact secret", async () => {
    const outputs: Array<{
        type: string;
        userId: string;
        submissionId: number;
        password: string;
    }> = [];
    const admin = owned(adminStoreFixtureCreate((event) => outputs.push(event)));
    const images = owned(agentImagesStoreFixtureCreate());
    const secrets = owned(agentSecretsStoreFixtureCreate());
    const plugins = owned(pluginsStoreFixtureCreate());
    const install = owned(pluginInstallStoreFixtureCreate());
    const roles = owned(rolesStoreFixtureCreate());
    admin.input({
        type: "usersLoaded",
        users: [
            {
                id: "user-ada",
                username: "ada",
                firstName: "Ada",
                lastName: "Lovelace",
                role: "member",
                kind: "human",
            },
        ],
    });
    const view = createRenderer();
    view.render(
        () => (
            <AdminPage
                activeSection="users"
                agentImagesStore={() => images.store}
                agentSecretsStore={() => secrets.store}
                canResetPasswords
                onSectionChange={() => undefined}
                pluginInstallStore={() => install.store}
                pluginsStore={() => plugins.store}
                rolesStore={() => roles.store}
                sections={["users"]}
                store={() => admin.store}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    const open = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Reset password for Ada Lovelace"]',
    )!;
    expect(open).not.toBeNull();
    open.click();
    await expect.poll(() => view.container.textContent).toContain("Generated password");
    const reset = admin.store.getState().userPasswordReset;
    expect(reset).toMatchObject({ type: "open", status: "ready", userId: "user-ada" });
    if (reset.type !== "open") throw new Error("Expected an open password reset.");
    expect(reset.password).toHaveLength(20);
    expect(view.container.textContent).toContain(reset.password);
    const dialog = view.container.querySelector('[data-testid="password-reset"]');
    admin.input({ type: "adminLoading", sections: ["users"] });
    await expect.poll(() => view.container.textContent).toContain(reset.password);
    expect(view.container.querySelector('[data-testid="password-reset"]')).toBe(dialog);

    Array.from(
        view.container.querySelectorAll<HTMLButtonElement>('[data-testid="password-reset"] button'),
    )
        .find((button) => button.textContent?.trim() === "Reset password")!
        .click();
    expect(outputs).toEqual([
        {
            type: "userPasswordResetSubmitted",
            userId: "user-ada",
            submissionId: 1,
            password: reset.password,
        },
    ]);
    expect(admin.store.getState().userPasswordReset).toMatchObject({ status: "submitting" });
});

it("renders a permission-scoped admin subpage without materializing the legacy admin store", async () => {
    const admin = owned(adminStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    const secrets = owned(agentSecretsStoreFixtureCreate());
    const plugins = owned(pluginsStoreFixtureCreate());
    const install = owned(pluginInstallStoreFixtureCreate());
    const roles = owned(rolesStoreFixtureCreate());
    images.input({ type: "imagesLoaded", images: [] });
    let adminAccesses = 0;
    const view = createRenderer();
    view.render(
        () => (
            <AdminPage
                activeSection="images"
                agentImagesStore={() => images.store}
                agentSecretsStore={() => secrets.store}
                canManageImages={false}
                onSectionChange={() => undefined}
                pluginInstallStore={() => install.store}
                pluginsStore={() => plugins.store}
                rolesStore={() => roles.store}
                sections={["images"]}
                store={() => {
                    adminAccesses += 1;
                    return admin.store;
                }}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    expect(view.container.textContent).toContain("Agent images");
    expect(
        Array.from(view.container.querySelectorAll("button")).some(
            (button) => button.textContent?.trim() === "New image",
        ),
    ).toBe(false);
    expect(adminAccesses).toBe(0);
});

function roleCatalog(supportName: string) {
    return {
        permissions: ["manageSecrets", "viewAllMembers", "manageAdminRoles"],
        roles: [
            {
                id: "role-admins",
                name: "Admins",
                builtin: "admin",
                permissions: ["manageSecrets", "viewAllMembers"],
                userIds: ["user-1"],
            },
            {
                id: "role-members",
                name: "Members",
                builtin: "member",
                permissions: [],
                userIds: ["user-1", "user-2"],
            },
            {
                id: "role-support",
                name: supportName,
                description: "Handles requests",
                builtin: null,
                permissions: ["viewAllMembers"],
                userIds: [],
            },
        ],
    } as const;
}

const roleMembers = [
    { id: "user-1", displayName: "Olive Owner", username: "olive", kind: "human" },
    { id: "user-2", displayName: "Mia Member", username: "mia", kind: "human" },
] as const;

it("keeps RolesPage role-row identity, focus, and the open editor across authoritative catalog updates", async () => {
    const outputs: string[] = [];
    const fixture = owned(rolesStoreFixtureCreate((event) => outputs.push(event.type)));
    fixture.input({ type: "catalogLoaded", catalog: roleCatalog("Support") });
    fixture.input({ type: "membersLoaded", members: roleMembers });
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", height: "100%" }}>
                <RolesPage store={fixture.store} />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    const rolesPanel = view.container.querySelector('[data-happy2-ui="roles-panel"]')!;
    expect(rolesPanel.querySelectorAll("[data-row-id]")).toHaveLength(3);
    const adminRow = rolesPanel.querySelector<HTMLElement>('[data-row-id="role-admins"]')!;
    const supportRow = rolesPanel.querySelector<HTMLElement>('[data-row-id="role-support"]')!;
    const deleteButton = supportRow.querySelector<HTMLButtonElement>(
        '[data-happy2-ui="data-table-actions"] button',
    )!;
    deleteButton.focus();
    expect(document.activeElement).toBe(deleteButton);

    fixture.input({ type: "catalogLoaded", catalog: roleCatalog("Support EMEA") });
    await vi.waitFor(() => expect(supportRow.textContent).toContain("Support EMEA"));
    expect(rolesPanel.querySelectorAll("[data-row-id]")).toHaveLength(3);
    expect(rolesPanel.querySelector('[data-row-id="role-admins"]')).toBe(adminRow);
    expect(rolesPanel.querySelector('[data-row-id="role-support"]')).toBe(supportRow);
    expect(supportRow.querySelector('[data-happy2-ui="data-table-actions"] button')).toBe(
        deleteButton,
    );
    expect(document.activeElement).toBe(deleteButton);

    supportRow.click();
    const editor = await vi.waitFor(() => {
        const value = view.container.querySelector('[data-happy2-ui="role-editor"]');
        expect(value).toBeTruthy();
        return value!;
    });
    expect(editor.querySelectorAll('[data-happy2-ui="permission-row"]')).toHaveLength(3);
    const nameInput = editor.querySelector<HTMLInputElement>("input")!;
    expect(nameInput.value).toBe("Support EMEA");
    nameInput.focus();
    nameInput.value = "Support Global";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    const draftRow = editor.querySelector<HTMLElement>('[data-permission-id="manageSecrets"]')!;
    const draftInput = draftRow.querySelector<HTMLInputElement>("input")!;
    expect(draftInput.checked).toBe(false);

    fixture.input({ type: "catalogLoaded", catalog: roleCatalog("Support") });
    await vi.waitFor(() => expect(supportRow.textContent).not.toContain("Support EMEA"));
    expect(view.container.querySelector('[data-happy2-ui="role-editor"]')).toBe(editor);
    expect(editor.querySelector("input")).toBe(nameInput);
    expect(nameInput.value).toBe("Support Global");
    expect(document.activeElement).toBe(nameInput);
    expect(editor.querySelectorAll('[data-happy2-ui="permission-row"]')).toHaveLength(3);
    expect(editor.querySelector('[data-permission-id="manageSecrets"]')).toBe(draftRow);

    draftInput.click();
    await vi.waitFor(() => expect(draftInput.checked).toBe(true));
    expect(editor.querySelector('[data-permission-id="manageSecrets"]')).toBe(draftRow);
    expect(draftRow.querySelector("input")).toBe(draftInput);
    expect(outputs).not.toContain("roleUpdateSubmitted");
});

it("keeps MemberAccessPanel rows, focus, and the open dialog across local and authoritative detail updates", async () => {
    const outputs: { type: string; permissions?: readonly string[] }[] = [];
    const fixture = owned(
        rolesStoreFixtureCreate((event) =>
            outputs.push(event as { type: string; permissions?: readonly string[] }),
        ),
    );
    fixture.input({ type: "catalogLoaded", catalog: roleCatalog("Support") });
    fixture.input({ type: "membersLoaded", members: roleMembers });
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", height: "100%" }}>
                <RolesPage store={fixture.store} />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    const membersTable = view.container.querySelector('[data-happy2-ui="roles-page-members"]')!;
    expect(membersTable.querySelectorAll("[data-row-id]")).toHaveLength(2);
    membersTable.querySelector<HTMLElement>('[data-row-id="user-2"]')!.click();
    const panel = await vi.waitFor(() => {
        const value = view.container.querySelector('[data-happy2-ui="member-access-panel"]');
        expect(value).toBeTruthy();
        return value!;
    });
    expect(panel.textContent).toContain("Loading access…");

    fixture.input({
        type: "memberDetailLoaded",
        userId: "user-2",
        detail: {
            direct: ["manageSecrets"],
            roleIds: ["role-members"],
            effective: { allowed: ["manageSecrets"], owner: false },
        },
    });
    await vi.waitFor(() =>
        expect(panel.querySelectorAll('[data-happy2-ui="permission-row"]')).toHaveLength(3),
    );
    const assignedRoleRow = panel.querySelector<HTMLElement>('[data-role-id="role-members"]')!;
    const grantRow = panel.querySelector<HTMLElement>('[data-permission-id="viewAllMembers"]')!;
    const grantInput = grantRow.querySelector<HTMLInputElement>("input")!;
    const picker = panel.querySelector<HTMLSelectElement>('[data-happy2-ui="select-native"]')!;
    expect(picker.getAttribute("aria-label")).toBe("Assign a role");
    grantInput.focus();
    expect(document.activeElement).toBe(grantInput);
    grantInput.click();
    expect(outputs.at(-1)).toMatchObject({
        type: "memberPermissionsSubmitted",
        permissions: ["manageSecrets", "viewAllMembers"],
    });

    fixture.input({
        type: "memberDetailLoaded",
        userId: "user-2",
        detail: {
            direct: ["manageSecrets", "viewAllMembers"],
            roleIds: ["role-members"],
            effective: { allowed: ["manageSecrets", "viewAllMembers"], owner: false },
        },
    });
    await vi.waitFor(() => expect(grantInput.checked).toBe(true));
    expect(view.container.querySelector('[data-happy2-ui="member-access-panel"]')).toBe(panel);
    expect(panel.querySelectorAll('[data-happy2-ui="permission-row"]')).toHaveLength(3);
    expect(panel.querySelector('[data-permission-id="viewAllMembers"]')).toBe(grantRow);
    expect(grantRow.querySelector("input")).toBe(grantInput);
    expect(panel.querySelector('[data-role-id="role-members"]')).toBe(assignedRoleRow);
    expect(document.activeElement).toBe(grantInput);

    fixture.input({
        type: "roleActionFailed",
        error: new UserError("The owner must remain an administrator"),
    });
    await vi.waitFor(() =>
        expect(panel.textContent).toContain("The owner must remain an administrator"),
    );
    expect(panel.querySelector('[data-permission-id="viewAllMembers"]')).toBe(grantRow);
    expect(panel.querySelector('[data-role-id="role-members"]')).toBe(assignedRoleRow);
    expect(document.activeElement).toBe(grantInput);
});

it("renders AgentImagesPage from its independent store", async () => {
    const fixture = owned(agentImagesStoreFixtureCreate());
    fixture.input({ type: "imagesLoading" });
    const view = createRenderer();
    view.render(() => <AgentImagesPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading");
});

it("renders AgentSecretsPage from its independent store", async () => {
    const fixture = owned(agentSecretsStoreFixtureCreate());
    fixture.input({ type: "secretsLoading" });
    const view = createRenderer();
    view.render(() => <AgentSecretsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading");
});

const PLUGIN_PERMISSIONS = [
    {
        id: "plugins" as const,
        displayName: "Plugins",
        readOnly: [
            {
                id: "plugins:list" as const,
                displayName: "View plugins",
                description: "View installed plugins and their current status.",
            },
        ],
        mutations: [
            {
                id: "plugins:install" as const,
                displayName: "Install plugins",
                description: "Install another plugin and choose the permissions granted to it.",
            },
            {
                id: "plugins:uninstall" as const,
                displayName: "Uninstall plugins",
                description: "Stop and uninstall an existing plugin installation.",
            },
        ],
    },
];

it("renders PluginsPage from its independent store and routes the typed install intent", async () => {
    const outputs: unknown[] = [];
    const fixture = owned(pluginsStoreFixtureCreate((event) => outputs.push(event)));
    const images = owned(agentImagesStoreFixtureCreate());
    const install = owned(pluginInstallStoreFixtureCreate());
    let imageAccesses = 0;
    fixture.input({ type: "pluginsLoading" });
    const view = createRenderer();
    view.render(
        () => (
            <PluginsPage
                agentImagesStore={() => {
                    imageAccesses += 1;
                    return images.store;
                }}
                installStore={() => install.store}
                store={fixture.store}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    expect(view.container.textContent).toContain("Loading plugins");

    fixture.input({
        type: "pluginsLoaded",
        plugins: [
            {
                displayName: "Project Search",
                shortName: "project-search",
                description: "Searches source code and project documentation.",
                version: "2.1.0",
                packageDigest: "digest-1",
                skills: [],
                mcp: { type: "remote", container: "none" },
                variables: [
                    {
                        key: "PROJECT_API_TOKEN",
                        displayName: "API token",
                        description: "Token used by the MCP server.",
                        kind: "secret",
                    },
                ],
                apiPermissions: PLUGIN_PERMISSIONS,
            },
        ],
    });
    await view.ready();
    const cardBefore = view.container.querySelector('[data-plugin-short-name="project-search"]')!;

    // Authoritative reconciliation must retain the card's DOM identity, and a
    // remote-MCP catalog never materializes the agent images store. The real
    // reconcile emits pluginsLoading before the fresh read lands; the ready
    // list (and its DOM) must stay put through it.
    fixture.input({ type: "pluginsLoading" });
    await view.ready();
    expect(
        view.container.querySelector('[data-plugin-short-name="project-search"]'),
        "ready catalog survives an in-flight reconcile",
    ).toBe(cardBefore);
    fixture.input({
        type: "pluginsLoaded",
        plugins: [
            {
                displayName: "Project Search",
                shortName: "project-search",
                description: "Searches source code and project documentation.",
                version: "2.1.0",
                packageDigest: "digest-1",
                skills: [],
                mcp: { type: "remote", container: "none" },
                variables: [
                    {
                        key: "PROJECT_API_TOKEN",
                        displayName: "API token",
                        description: "Token used by the MCP server.",
                        kind: "secret",
                    },
                ],
                apiPermissions: PLUGIN_PERMISSIONS,
                systemPlugin: {
                    id: "plugin-1",
                    displayName: "Project Search",
                    shortName: "project-search",
                    description: "Searches source code and project documentation.",
                    sourceKind: "builtin",
                    sourceReference: "project-search",
                    sourceVersion: "2.1.0",
                    packageDigest: "digest-1",
                    variables: [],
                    apiPermissions: PLUGIN_PERMISSIONS,
                    image: {
                        contentType: "image/png",
                        size: 10,
                        width: 1024,
                        height: 1024,
                        thumbhash: "hash",
                        checksumSha256: "checksum",
                    },
                    installedAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    updateAvailable: false,
                    installations: [
                        {
                            id: "ins-1",
                            pluginId: "plugin-1",
                            shortName: "project-search",
                            sourceVersion: "2.1.0",
                            packageDigest: "digest-1",
                            grantedPermissions: ["plugins:list"],
                            status: "ready",
                            installedAt: "2026-01-01T00:00:00.000Z",
                            updatedAt: "2026-01-01T00:00:00.000Z",
                        },
                    ],
                },
            },
        ],
    });
    await view.ready();
    const cardAfter = view.container.querySelector('[data-plugin-short-name="project-search"]')!;
    expect(cardAfter, "card DOM identity survives reconciliation").toBe(cardBefore);
    expect(cardAfter.textContent).toContain("Ready");
    expect(imageAccesses, "remote MCP never materializes agent images").toBe(0);

    // The install dialog collects the declared variable and emits one typed intent.
    view.container
        .querySelector<HTMLButtonElement>(
            '[data-plugin-short-name="project-search"] .happy2-plugin-catalog-panel__card-actions button',
        )!
        .click();
    await view.ready();
    const secretInput = view.container.querySelector<HTMLInputElement>(
        '[data-happy2-ui="modal-dialog"] input',
    )!;
    secretInput.value = "token-value";
    secretInput.dispatchEvent(new Event("input", { bubbles: true }));
    await view.ready();
    const submit = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
            '[data-happy2-ui="modal-footer"] button',
        ),
    ).find((button) => button.textContent?.includes("Install plugin"))!;
    submit.click();
    // Mounting the page also starts the automatic update-check watch.
    expect(outputs).toEqual([
        { type: "pluginUpdateChecksStarted" },
        {
            type: "pluginInstallSubmitted",
            shortName: "project-search",
            variables: { PROJECT_API_TOKEN: "token-value" },
            permissions: [],
        },
    ]);
});

it("keeps an open permission dialog across reconciliation and routes the typed permission update", async () => {
    const outputs: unknown[] = [];
    const fixture = owned(pluginsStoreFixtureCreate((event) => outputs.push(event)));
    const install = owned(pluginInstallStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    const installed = (status: "ready" | "starting") => ({
        displayName: "Project Search",
        shortName: "project-search",
        description: "Searches source code and project documentation.",
        version: "2.1.0",
        packageDigest: "digest-1",
        skills: [],
        mcp: { type: "remote" as const, container: "none" as const },
        variables: [],
        apiPermissions: PLUGIN_PERMISSIONS,
        systemPlugin: {
            id: "plugin-1",
            displayName: "Project Search",
            shortName: "project-search",
            description: "Searches source code and project documentation.",
            sourceKind: "builtin" as const,
            sourceReference: "project-search",
            sourceVersion: "2.1.0",
            packageDigest: "digest-1",
            variables: [],
            apiPermissions: PLUGIN_PERMISSIONS,
            image: {
                contentType: "image/png" as const,
                size: 10,
                width: 1024,
                height: 1024,
                thumbhash: "hash",
                checksumSha256: "checksum",
            },
            installedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            updateAvailable: false,
            installations: [
                {
                    id: "ins-1",
                    pluginId: "plugin-1",
                    shortName: "project-search",
                    sourceVersion: "2.1.0",
                    packageDigest: "digest-1",
                    grantedPermissions: ["plugins:list"] as const,
                    status,
                    installedAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        },
    });
    fixture.input({ type: "pluginsLoaded", plugins: [installed("ready")] });
    const view = createRenderer();
    view.render(
        () => (
            <PluginsPage
                agentImagesStore={() => images.store}
                installStore={() => install.store}
                store={fixture.store}
            />
        ),
        {
            width: 1024,
            height: 704,
        },
    );
    await view.ready();

    // Open the installation's permission editor; its current grant is checked.
    view.container
        .querySelector<HTMLButtonElement>('[data-installation-id="ins-1"] button')!
        .click();
    await view.ready();
    const control = (permissionId: string) =>
        view.container.querySelector<HTMLInputElement>(
            `[data-permission-id="${permissionId}"] [data-happy2-ui="checkbox-control"]`,
        )!;
    expect(control("plugins:list").checked).toBe(true);
    expect(control("plugins:install").checked).toBe(false);
    const mutateBefore = control("plugins:install");
    mutateBefore.focus();
    expect(document.activeElement).toBe(mutateBefore);

    // A realtime-hinted reconcile must keep the open dialog, the focused
    // checkbox's DOM identity, and its focus intact.
    fixture.input({ type: "pluginsLoading" });
    await view.ready();
    fixture.input({ type: "pluginsLoaded", plugins: [installed("starting")] });
    await view.ready();
    const mutateAfter = control("plugins:install");
    expect(mutateAfter, "focused checkbox DOM identity survives reconciliation").toBe(mutateBefore);
    expect(document.activeElement, "focus survives reconciliation").toBe(mutateBefore);
    expect(control("plugins:list").checked, "seeded grant survives reconciliation").toBe(true);

    // Toggle a mutation on and save: exactly one typed permission-update intent
    // in declared order.
    mutateAfter.click();
    await view.ready();
    const save = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
            '[data-happy2-ui="modal-footer"] button',
        ),
    ).find((button) => button.textContent?.includes("Save permissions"))!;
    save.click();
    expect(outputs).toEqual([
        { type: "pluginUpdateChecksStarted" },
        {
            type: "pluginPermissionsUpdateSubmitted",
            installationId: "ins-1",
            permissions: ["plugins:list", "plugins:install"],
        },
    ]);
});

it("filters the plugin catalog by skill name and description through PluginsPage", async () => {
    const fixture = owned(pluginsStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    const install = owned(pluginInstallStoreFixtureCreate());
    fixture.input({
        type: "pluginsLoaded",
        plugins: [
            {
                displayName: "Toolkit",
                shortName: "toolkit",
                description: "General project helpers.",
                version: "1.0.0",
                packageDigest: "digest-toolkit",
                skills: [
                    {
                        name: "release-check",
                        description: "Verify a release before shipping.",
                        directory: "skills/release-check",
                    },
                ],
                variables: [],
                apiPermissions: [],
            },
            {
                displayName: "Search",
                shortName: "search",
                description: "Finds code across the workspace.",
                version: "1.0.0",
                packageDigest: "digest-search",
                skills: [],
                variables: [],
                apiPermissions: [],
            },
        ],
    });
    const view = createRenderer();
    const page = (testId: string, query: string) => (
        <div data-testid={testId} style={{ display: "flex", width: "760px" }}>
            <PluginsPage
                agentImagesStore={() => images.store}
                installStore={() => install.store}
                query={query}
                store={fixture.store}
            />
        </div>
    );
    view.render(() => page("by-name", "release-check"), { width: 760, height: 360 })
        .render(() => page("by-description", "shipping"), { width: 760, height: 360 })
        .render(() => page("by-plugin", "search"), { width: 760, height: 360 })
        .render(() => page("no-match", "nonexistent-token"), { width: 760, height: 360 });
    await view.ready();

    const cards = (testId: string) =>
        Array.from(
            view
                .$(`[data-testid="${testId}"]`)
                .element.querySelectorAll("[data-plugin-short-name]"),
            (node) => node.getAttribute("data-plugin-short-name"),
        );
    // An exact skill name matches only the package that provides it.
    expect(cards("by-name")).toEqual(["toolkit"]);
    // A term found only in a skill description also surfaces its package.
    expect(cards("by-description")).toEqual(["toolkit"]);
    // Existing plugin-field matching is preserved.
    expect(cards("by-plugin")).toEqual(["search"]);
    // A term in no plugin or skill field matches nothing.
    expect(cards("no-match")).toEqual([]);
});

it("renders ActivityPage from NotificationsStore input", async () => {
    const fixture = owned(notificationsStoreFixtureCreate());
    fixture.input({ type: "notificationsLoading" });
    const view = createRenderer();
    view.render(() => <ActivityPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading activity");
});

it("keeps ActivityPage row identity and focus while reconciling authoritative activity", async () => {
    const outputs: string[] = [];
    const selected: string[] = [];
    const fixture = owned(notificationsStoreFixtureCreate((event) => outputs.push(event.type)));
    const notifications = Array.from({ length: 120 }, (_, index) => notification(index));
    fixture.input({
        type: "notificationsLoaded",
        notifications,
        nextCursor: "next-page",
    });
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", height: "100%" }}>
                <ActivityPage
                    contextLabel={() => "Launch room"}
                    onSelect={(item) => selected.push(item.id)}
                    store={fixture.store}
                />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    const before = view.container.querySelector<HTMLButtonElement>('[data-item-id="notice-0"]')!;
    before.focus();
    expect(document.activeElement).toBe(before);

    fixture.input({
        type: "notificationsLoaded",
        notifications: [{ ...notifications[0]!, kind: "reaction" }, ...notifications.slice(1)],
        nextCursor: "next-page",
    });
    await vi.waitFor(() =>
        expect(before.getAttribute("aria-label")).toContain("reacted to your message"),
    );
    expect(view.container.querySelector('[data-item-id="notice-0"]')).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(before.getAttribute("aria-label")).toContain("Launch room");

    before.click();
    expect(outputs).toContain("notificationsReadSubmitted");
    expect(selected).toEqual(["notice-0"]);
});

it("paginates ActivityPage once at the virtual-list end and surfaces terminal errors", async () => {
    const outputs: string[] = [];
    const fixture = owned(notificationsStoreFixtureCreate((event) => outputs.push(event.type)));
    fixture.input({
        type: "notificationsLoaded",
        notifications: Array.from({ length: 120 }, (_, index) => notification(index)),
        nextCursor: "next-page",
    });
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", height: "100%" }}>
                <ActivityPage store={fixture.store} />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    const list = view.container.querySelector<HTMLDivElement>(
        '[data-happy2-ui="notification-list"]',
    )!;
    expect(list.hasAttribute("data-virtualized")).toBe(true);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    for (let index = 0; index < 3; index += 1) {
        list.scrollTop = 1_000_000;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    expect(list.scrollHeight - list.scrollTop - list.clientHeight).toBeLessThanOrEqual(128);
    await vi.waitFor(() => expect(outputs).toEqual(["notificationsMoreRequested"]));
    expect(fixture.store.getState().pageLoading).toBe(true);
    expect(view.container.textContent).toContain("Loading more activity");

    fixture.input({
        type: "notificationsPageFailed",
        error: new UserError("The next activity page failed."),
    });
    await vi.waitFor(() =>
        expect(view.container.textContent).toContain("The next activity page failed."),
    );
    fixture.input({
        type: "notificationsReadFailed",
        error: new UserError("Read state failed."),
    });
    await vi.waitFor(() => expect(view.container.textContent).toContain("Read state failed."));
});

it("renders ThreadsPage from ThreadsStore input", async () => {
    const fixture = owned(threadsStoreFixtureCreate());
    fixture.input({ type: "threadsLoading" });
    const view = createRenderer();
    view.render(() => <ThreadsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading threads");
});

it("projects thread child identity, root metadata, read/follow intents, pagination, and failures", async () => {
    const outputs: ThreadsOutput[] = [];
    const fixture = owned(threadsStoreFixtureCreate((event) => outputs.push(event)));
    const threadProjection = (
        childChatId: string,
        rootMessageId: string,
        overrides: Partial<ChatSummary> = {},
    ): ThreadProjection => ({
        chat: {
            id: childChatId,
            kind: "private_channel",
            name: "Thread",
            isListed: false,
            isMain: false,
            autoJoin: false,
            isDefaultAgentConversation: false,
            retentionMode: "inherit",
            defaultExpiryMode: "none",
            defaultAfterReadScope: "any_reader",
            lifecycleVersion: "1",
            createdByUserId: "user-1",
            pts: "2",
            lastMessageSequence: "2",
            membershipEpoch: "1",
            membershipRole: "owner",
            starred: false,
            followed: true,
            lastReadSequence: "0",
            unreadCount: 2,
            mentionCount: 0,
            notificationLevel: "all",
            parentMessageId: rootMessageId,
            createdAt: "2026-07-17T12:00:00.000Z",
            updatedAt: "2026-07-17T12:02:00.000Z",
            ...overrides,
        },
        root: {
            id: rootMessageId,
            chatId: "parent-chat",
            sequence: rootMessageId,
            changePts: "1",
            kind: "user",
            audience: "people",
            agentUserIds: [],
            text: `Root ${rootMessageId}`,
            threadReplyCount: 7,
            revision: 1,
            mentions: [],
            attachments: [],
            reactions: [],
            receipts: [],
            expiryMode: "none",
            sender: {
                id: "user-1",
                displayName: "Ada Lovelace",
                username: "ada",
                kind: "human",
            },
            createdAt: "2026-07-17T12:00:00.000Z",
        },
    });
    const first = threadProjection("child-1", "root-1");
    const second = threadProjection("child-2", "root-2", {
        followed: false,
        unreadCount: 0,
    });
    fixture.input({
        type: "threadsLoaded",
        threads: [first, second],
        nextCursor: "cursor-2",
    });
    const onSelect = vi.fn();
    const view = createRenderer();
    view.render(() => <ThreadsPage onSelect={onSelect} store={fixture.store} />, {
        width: 1024,
        height: 704,
    });
    await view.ready();

    const firstRow = view.container.querySelector<HTMLElement>('[data-thread-id="child-1"]')!;
    const secondRow = view.container.querySelector<HTMLElement>('[data-thread-id="child-2"]')!;
    expect(firstRow.textContent).toContain("Root root-1");
    expect(firstRow.querySelector('[data-happy2-ui="thread-list-reply-count"]')?.textContent).toBe(
        "7",
    );
    expect(firstRow.querySelector('[data-happy2-ui="count-badge"]')?.textContent).toBe("2");
    expect(secondRow.getAttribute("data-subscribed")).toBe("false");

    firstRow.click();
    expect(outputs.at(-1)).toEqual({ type: "threadReadSubmitted", childChatId: "child-1" });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("child-1");
    Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Load more")!
        .click();
    expect(outputs.at(-1)).toEqual({ type: "threadsMoreRequested" });
    fixture.store.getState().threadFollowSet("child-2", true);
    expect(outputs.at(-1)).toEqual({
        type: "threadFollowSubmitted",
        childChatId: "child-2",
        followed: true,
    });

    fixture.input({
        type: "threadsLoaded",
        threads: [
            { ...first, root: { ...first.root, threadReplyCount: 8, changePts: "2" } },
            second,
        ],
    });
    await vi.waitFor(() =>
        expect(
            firstRow.querySelector('[data-happy2-ui="thread-list-reply-count"]')?.textContent,
        ).toBe("8"),
    );
    expect(view.container.querySelector('[data-thread-id="child-1"]')).toBe(firstRow);
    expect(view.container.querySelector('[data-thread-id="child-2"]')).toBe(secondRow);

    fixture.input({ type: "threadsPageFailed", error: new UserError("Next page failed") });
    fixture.input({ type: "threadActionFailed", error: new UserError("Follow failed") });
    await vi.waitFor(() => expect(view.container.textContent).toContain("Next page failed"));
    expect(view.container.textContent).toContain("Follow failed");
    fixture.input({ type: "threadsFailed", error: new UserError("Thread list failed") });
    await vi.waitFor(() => expect(view.container.textContent).toContain("Thread list failed"));
    Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Retry")!
        .click();
    expect(outputs.at(-1)).toEqual({ type: "threadsRefreshRequested" });
});

it("renders CallsPage from CallsStore input", async () => {
    const fixture = owned(callsStoreFixtureCreate());
    fixture.input({ type: "callsLoading" });
    const view = createRenderer();
    view.render(() => <CallsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading calls");
});

it("renders HomePage from the shared NotificationsStore", async () => {
    const fixture = owned(notificationsStoreFixtureCreate());
    fixture.input({ type: "notificationsLoaded", notifications: [] });
    const view = createRenderer();
    view.render(() => <HomePage notificationsStore={fixture.store} />, {
        width: 1024,
        height: 704,
    });
    await view.ready();
    expect(view.container.textContent).toContain("Nothing needs your attention right now.");
});

it("renders the route-addressable public profile from the live directory", async () => {
    const fixture = owned(directoryStoreFixtureCreate());
    fixture.input({
        type: "directoryLoaded",
        users: [
            {
                id: "user-2",
                displayName: "Grace Hopper",
                username: "grace",
                kind: "human",
                role: "admin",
                presence: "online",
                availability: "dnd",
                customStatusEmoji: "🚢",
                customStatusText: "Shipping compilers",
            },
        ],
        channels: [],
    });
    const view = createRenderer();
    view.render(() => <ProfilePage store={fixture.store} userId="user-2" />, {
        width: 720,
        height: 420,
        padding: 24,
    });
    await view.ready();
    expect(view.container.textContent).toContain("Grace Hopper");
    expect(view.container.textContent).toContain("Shipping compilers");
    expect(view.container.textContent).toContain("Administrator");
    expect(view.container.textContent).toContain("Do not disturb");
});

function notification(index: number): NotificationProjection {
    return {
        id: `notice-${index}`,
        kind: "mention",
        chatId: "chat-1",
        messageId: `message-${index}`,
        createdAt: "2026-07-17T12:00:00.000Z",
    };
}
