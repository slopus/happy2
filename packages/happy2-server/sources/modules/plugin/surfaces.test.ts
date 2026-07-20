import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type DrizzleExecutor } from "../drizzle.js";
import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import {
    accounts,
    chatMembers,
    chats,
    pluginInstallations,
    pluginAppInstances,
    pluginContributions,
    pluginMcpAppResources,
    pluginMcpTools,
    plugins,
    users,
} from "../schema.js";
import {
    pluginAppDefinitionParse,
    pluginContributionDefinitionParse,
} from "./impl/surfaceDefinition.js";
import { pluginAppInstancePut } from "./pluginAppInstancePut.js";
import { pluginAppInstanceList } from "./pluginAppInstanceList.js";
import { pluginAppInstanceContextUpdate } from "./pluginAppInstanceContextUpdate.js";
import { pluginAppInstanceResourceGet } from "./pluginAppInstanceResourceGet.js";
import { pluginAppPreferenceUpdate } from "./pluginAppPreferenceUpdate.js";
import { pluginContributionPut } from "./pluginContributionPut.js";
import { pluginContributionList } from "./pluginContributionList.js";
import { pluginUiAssetsReplace } from "./pluginUiAssetsReplace.js";
import { pluginUiAssetGet } from "./pluginUiAssetGet.js";
import { pluginMcpCatalogReplace } from "./pluginMcpCatalogReplace.js";

const APP_RESOURCE = "ui://todos/list";

describe("plugin surface definition parser", () => {
    it("accepts the closed app and native section shapes", () => {
        expect(pluginAppDefinitionParse(appDefinition())).toMatchObject({
            instanceKey: "list-one",
            presentation: "sidebar",
        });
        expect(
            pluginContributionDefinitionParse(
                contributionDefinition("pluginSettings", {
                    kind: "section",
                    id: "settings",
                    title: "Todo settings",
                    description: "Todo display settings",
                    controls: [
                        {
                            kind: "text",
                            id: "intro",
                            title: "About",
                            description: "An introduction",
                            text: "Shared task lists stay current.",
                        },
                        {
                            kind: "checkbox",
                            id: "completed",
                            title: "Completed tasks",
                            description: "Show completed tasks",
                            checked: true,
                            action: { toolName: "toggle_completed" },
                        },
                    ],
                }),
            ).spec.kind,
        ).toBe("section");
    });

    it("rejects extension fields, misplaced text, and buttons without assets", () => {
        expect(() => pluginAppDefinitionParse({ ...appDefinition(), html: "<script/>" })).toThrow(
            "unsupported field",
        );
        expect(() =>
            pluginContributionDefinitionParse(
                contributionDefinition("chatMenu", {
                    kind: "text",
                    id: "copy",
                    title: "Copy",
                    description: "Copy",
                    text: "not allowed here",
                }),
            ),
        ).toThrow("must be buttons or menus");
        expect(() =>
            pluginContributionDefinitionParse(
                contributionDefinition("composerIcon", {
                    kind: "button",
                    id: "add",
                    title: "Add",
                    description: "Add a task",
                    action: { toolName: "add_task" },
                }),
            ),
        ).toThrow("assetId must be a string");
    });

    it("bounds nested controls, text bytes, and selected option references", () => {
        expect(() =>
            pluginContributionDefinitionParse(
                contributionDefinition("pluginSettings", {
                    kind: "section",
                    id: "settings",
                    title: "Settings",
                    description: "Settings",
                    controls: [
                        {
                            kind: "text",
                            id: "text",
                            title: "Text",
                            description: "Text",
                            text: "😀".repeat(513),
                        },
                    ],
                }),
            ),
        ).toThrow("too large");
        expect(() =>
            pluginContributionDefinitionParse(
                contributionDefinition("pluginSettings", {
                    kind: "section",
                    id: "settings",
                    title: "Settings",
                    description: "Settings",
                    controls: [
                        {
                            kind: "checkboxGroup",
                            id: "filters",
                            title: "Filters",
                            description: "Task filters",
                            options: [{ id: "open", title: "Open", description: "Open tasks" }],
                            selectedOptionIds: ["missing"],
                            action: { toolName: "set_filters" },
                        },
                    ],
                }),
            ),
        ).toThrow("reference declared options");
        expect(
            pluginContributionDefinitionParse(
                contributionDefinition("chatMenu", {
                    kind: "staticMenu",
                    id: "tasks",
                    title: "Tasks",
                    description: "Task actions",
                    items: [button("add_task")],
                }),
            ).spec.kind,
        ).toBe("staticMenu");
    });
});

describe("durable plugin surfaces", () => {
    let client: Client;
    let directory: string;
    let executor: DrizzleExecutor;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-plugin-surfaces-"));
        client = createClient({ url: `file:${join(directory, "happy2.db")}` });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
        await seed(executor);
        await pluginUiAssetsReplace(executor, "plugin-one", [asset("todo"), asset("add")]);
    });

    afterEach(async () => {
        client.close();
        await rm(directory, { recursive: true });
    });

    it("creates multiple instances, derives user ownership, and merges viewer preferences", async () => {
        await pluginAppInstancePut(executor, {
            installationId: "installation-one",
            definition: appDefinition(),
        });
        await pluginAppInstancePut(executor, {
            installationId: "installation-one",
            viewerUserId: "user-one",
            definition: {
                ...appDefinition(),
                instanceKey: "private-list",
                title: "Private list",
                audience: { scope: "user" },
                position: 2,
            },
        });
        await expect(pluginAppInstanceList(executor, "user-two")).resolves.toHaveLength(1);
        const ownerApps = await pluginAppInstanceList(executor, "user-one");
        expect(ownerApps).toHaveLength(2);
        expect(ownerApps[1]).toMatchObject({ ownerUserId: "user-one", available: true });
        await expect(
            pluginAppInstancePut(executor, {
                installationId: "installation-one",
                viewerUserId: "user-two",
                definition: {
                    ...appDefinition(),
                    instanceKey: "private-list",
                    audience: { scope: "user" },
                },
            }),
        ).rejects.toThrow("current owner");
        await pluginAppPreferenceUpdate(executor, {
            viewerUserId: "user-one",
            instanceId: ownerApps[0]!.id,
            hidden: true,
            position: 8,
        });
        expect((await pluginAppInstanceList(executor, "user-one"))[1]).toMatchObject({
            hidden: true,
            position: 8,
        });
    });

    it("increments data revisions unconditionally and enforces shape revision guards", async () => {
        const created = await pluginAppInstancePut(executor, {
            installationId: "installation-one",
            definition: appDefinition(),
        });
        await expect(
            pluginAppInstancePut(executor, {
                installationId: "installation-one",
                definition: { ...appDefinition(), revision: created.revision + 1 },
            }),
        ).rejects.toThrow("revision changed");
        await expect(
            pluginAppInstancePut(executor, {
                installationId: "installation-one",
                definition: { ...appDefinition(), revision: created.revision },
            }),
        ).resolves.toMatchObject({ dataRevision: 1, revision: 2 });
        await expect(
            pluginAppInstanceContextUpdate(executor, {
                installationId: "installation-one",
                instanceKey: "list-one",
                context: { listId: "one", changed: 1 },
            }),
        ).resolves.toMatchObject({ dataRevision: 2 });
        await expect(
            pluginAppInstanceContextUpdate(executor, {
                installationId: "installation-one",
                instanceKey: "list-one",
                context: { listId: "one", changed: 2 },
            }),
        ).resolves.toMatchObject({ dataRevision: 3 });
    });

    it("keeps executable app HTML stable until the plugin explicitly updates the instance shape", async () => {
        const created = await pluginAppInstancePut(executor, {
            installationId: "installation-one",
            definition: appDefinition(),
        });
        await pluginMcpCatalogReplace(
            executor,
            "installation-one",
            [
                catalogTool("add_task", ["app"]),
                catalogTool("toggle_completed", ["app"]),
                catalogTool("set_filters", ["app"]),
                catalogTool("model_only", ["model"]),
            ],
            [
                {
                    uri: APP_RESOURCE,
                    html: "<!doctype html><title>Changed catalog</title>",
                    contentHashSha256: "e".repeat(64),
                },
            ],
        );
        await expect(
            pluginAppInstanceResourceGet(executor, "user-one", created.id),
        ).resolves.toMatchObject({
            html: "<!doctype html><title>Todos</title>",
            contentHashSha256: "d".repeat(64),
        });
        await pluginAppInstancePut(executor, {
            installationId: "installation-one",
            definition: { ...appDefinition(), revision: created.revision },
        });
        await expect(
            pluginAppInstanceResourceGet(executor, "user-one", created.id),
        ).resolves.toMatchObject({
            html: "<!doctype html><title>Changed catalog</title>",
            contentHashSha256: "e".repeat(64),
        });
    });

    it("requires owned assets, cached resources, and app-visible tools", async () => {
        await expect(
            pluginAppInstancePut(executor, {
                installationId: "installation-one",
                definition: { ...appDefinition(), assetId: "missing" },
            }),
        ).rejects.toThrow("asset is not owned");
        await expect(
            pluginAppInstancePut(executor, {
                installationId: "installation-one",
                definition: { ...appDefinition(), resourceUri: "ui://todos/missing" },
            }),
        ).rejects.toThrow("resource is not in this installation");
        await expect(
            pluginContributionPut(executor, {
                installationId: "installation-one",
                definition: contributionDefinition("composerIcon", button("model_only")),
            }),
        ).rejects.toThrow("not visible to apps");
        await expect(pluginUiAssetGet(executor, "plugin-one", "todo")).resolves.toMatchObject({
            shortName: "todos",
            packageDigest: "digest",
            packageDirectory: "/tmp/plugin-one",
            sourceKind: "builtin",
            sourceReference: "builtin:todos",
            relativePath: "assets/todo.png",
        });
    });

    it("lists global and current-chat contributions while enforcing current membership", async () => {
        await pluginAppInstancePut(executor, {
            installationId: "installation-one",
            definition: appDefinition(),
        });
        await pluginContributionPut(executor, {
            installationId: "installation-one",
            definition: contributionDefinition("composerIcon", button("add_task")),
        });
        await pluginContributionPut(executor, {
            installationId: "installation-one",
            viewerUserId: "user-one",
            chatId: "chat-one",
            definition: {
                ...contributionDefinition("messageMenu", button("add_task")),
                externalKey: "message-add",
                audience: { scope: "user" },
            },
        });
        await expect(
            pluginContributionList(executor, { viewerUserId: "user-one", chatId: "chat-one" }),
        ).resolves.toHaveLength(2);
        await pluginUiAssetsReplace(executor, "plugin-one", [asset("todo")]);
        expect(
            (
                await pluginContributionList(executor, {
                    viewerUserId: "user-one",
                    chatId: "chat-one",
                })
            ).every((item) => item.available === false),
        ).toBe(true);
        await expect(
            pluginContributionList(executor, { viewerUserId: "user-two", chatId: "chat-one" }),
        ).rejects.toThrow("not found");
    });

    it("enforces per-installation app and contribution quotas before allocating sync state", async () => {
        await executor.insert(pluginAppInstances).values(
            Array.from({ length: 64 }, (_, index) => ({
                id: `app-${index}`,
                installationId: "installation-one",
                instanceKey: `seed-app-${index}`,
                resourceUri: APP_RESOURCE,
                resourceHtml: "<!doctype html><title>Todos</title>",
                resourceContentHashSha256: "d".repeat(64),
                title: `Seed app ${index}`,
                description: "Seed app",
                assetId: "todo",
                position: String(index).padStart(9, "0"),
                scope: "all_users",
            })),
        );
        await expect(
            pluginAppInstancePut(executor, {
                installationId: "installation-one",
                definition: appDefinition(),
            }),
        ).rejects.toThrow("64 app instance limit");
        const spec = JSON.stringify(button("add_task"));
        await executor.insert(pluginContributions).values(
            Array.from({ length: 128 }, (_, index) => ({
                id: `contribution-${index}`,
                installationId: "installation-one",
                contributionKey: `seed-contribution-${index}`,
                placement: "composerIcon",
                title: `Seed contribution ${index}`,
                description: "Seed contribution",
                specJson: spec,
                scope: "all_users",
                position: String(index).padStart(9, "0"),
            })),
        );
        await expect(
            pluginContributionPut(executor, {
                installationId: "installation-one",
                definition: contributionDefinition("composerIcon", button("add_task")),
            }),
        ).rejects.toThrow("128 contribution limit");
    });
});

function appDefinition() {
    return {
        assetId: "todo",
        audience: { scope: "all_users" },
        context: { listId: "one" },
        description: "A shared task list",
        instanceKey: "list-one",
        position: 1,
        presentation: "sidebar",
        resourceUri: APP_RESOURCE,
        title: "Todo list",
    };
}

function button(toolName: string) {
    return {
        kind: "button",
        id: "add",
        title: "Add task",
        description: "Add a task",
        assetId: "add",
        action: { toolName },
    };
}

function contributionDefinition(location: string, spec: object) {
    return {
        audience: { scope: "all_users" },
        description: "Todo contribution",
        externalKey: "todo-action",
        location,
        position: 1,
        spec,
        title: "Todo action",
    };
}

function asset(id: string) {
    return {
        id,
        path: `assets/${id}.png`,
        contentType: "image/png" as const,
        size: 100,
        width: 40 as const,
        height: 40 as const,
        checksumSha256: id === "todo" ? "a".repeat(64) : "b".repeat(64),
    };
}

async function seed(executor: DrizzleExecutor) {
    await executor.insert(accounts).values([
        { id: "account-one", email: "one@example.com", active: 1 },
        { id: "account-two", email: "two@example.com", active: 1 },
    ]);
    await executor.insert(users).values([
        {
            id: "user-one",
            accountId: "account-one",
            firstName: "One",
            username: "one",
        },
        {
            id: "user-two",
            accountId: "account-two",
            firstName: "Two",
            username: "two",
        },
    ]);
    await executor.insert(chats).values({
        id: "chat-one",
        kind: "private_channel",
        name: "Surface tests",
        createdByUserId: "user-one",
    });
    await executor.insert(chatMembers).values({
        chatId: "chat-one",
        userId: "user-one",
        membershipEpoch: "membership-one",
    });
    await executor.insert(plugins).values({
        id: "plugin-one",
        displayName: "Todos",
        shortName: "todos",
        description: "Shared task lists",
        sourceKind: "builtin",
        sourceReference: "builtin:todos",
        sourceVersion: "1.0.0",
        packageDigest: "digest",
        manifestJson: "{}",
        packageDirectory: "/tmp/plugin-one",
        imageStorageKey: "plugin-one/plugin.png",
        imageContentType: "image/png",
        imageSize: 100,
        imageWidth: 40,
        imageHeight: 40,
        imageThumbhash: "thumb",
        imageChecksumSha256: "c".repeat(64),
    });
    await executor.insert(pluginInstallations).values({
        id: "installation-one",
        pluginId: "plugin-one",
        status: "ready",
        grantedPermissionsJson: "[]",
    });
    await executor.insert(pluginMcpAppResources).values({
        installationId: "installation-one",
        uri: APP_RESOURCE,
        html: "<!doctype html><title>Todos</title>",
        contentHashSha256: "d".repeat(64),
        syncedAt: new Date().toISOString(),
    });
    await executor
        .insert(pluginMcpTools)
        .values([
            tool("add_task", ["app"]),
            tool("toggle_completed", ["app"]),
            tool("set_filters", ["app"]),
            tool("model_only", ["model"]),
        ]);
}

function tool(name: string, visibility: string[]) {
    return {
        installationId: "installation-one",
        name,
        inputSchemaJson: "{}",
        metaJson: JSON.stringify({ ui: { visibility } }),
        syncedAt: new Date().toISOString(),
    };
}

function catalogTool(name: string, visibility: string[]) {
    return {
        name,
        inputSchema: {},
        meta: { ui: { visibility } },
    };
}
