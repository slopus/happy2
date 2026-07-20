import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { createClient } from "@libsql/client";
import {
    serverSchemaMigrate,
    type PluginLocalCommandHandle,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { describe, expect, it } from "vitest";

const CURRENT_PERMISSIONS = [
    "channels:create",
    "chats:members:add",
    "chats:members:remove",
    "chats:update",
];

describe("server upgrades with legacy plugin permissions", () => {
    it("quarantines the installation without loading it or hiding the catalog", async () => {
        const databaseDirectory = await mkdtemp(join(tmpdir(), "happy2-gym-plugin-upgrade-"));
        const databaseUrl = `file:${join(databaseDirectory, "happy2.db")}`;

        try {
            const runtime = new HealthyPluginRuntime();
            await using server = await createGymServer({
                databaseUrl,
                pluginMcpRuntime: runtime,
            });
            const admin = await server.createUser({ username: "plugin_upgrade_admin" });
            const asAdmin = server.as(admin);
            const installed = await asAdmin.post(
                "/v0/admin/plugins/chat-management/installPlugin",
                { permissions: CURRENT_PERMISSIONS },
            );
            expect(installed.statusCode).toBe(202);
            const installation = installed.json().installation as {
                id: string;
                pluginId: string;
            };
            await waitForPlugin(asAdmin, installation.id, "ready");
            expect(runtime.prepares).toBe(1);

            await server.restart({
                async beforeStart() {
                    const client = createClient({ url: databaseUrl });
                    try {
                        const result = await client.execute({
                            sql: "SELECT manifest_json, package_directory FROM plugins WHERE id = ?",
                            args: [installation.pluginId],
                        });
                        const manifest = JSON.parse(String(result.rows[0]?.manifest_json));
                        const packageDirectory = String(result.rows[0]?.package_directory);
                        manifest.version = "1.1.0";
                        manifest.container.permissions = ["chats:update", "channels:manage"];
                        const packageManifest = structuredClone(manifest);
                        delete packageManifest.container.args;
                        await writeFile(
                            join(packageDirectory, "plugin.json"),
                            JSON.stringify(packageManifest),
                        );
                        await client.execute({
                            sql: `UPDATE plugins
                                  SET source_version = ?, manifest_json = ?, package_digest = ?
                                  WHERE id = ?`,
                            args: [
                                "1.1.0",
                                JSON.stringify(manifest),
                                await packageDigest(packageDirectory),
                                installation.pluginId,
                            ],
                        });
                        await client.execute({
                            sql: `UPDATE plugin_installations
                                  SET granted_permissions_json = ?, status = ?, last_error = ?
                                  WHERE id = ?`,
                            args: [
                                JSON.stringify(["chats:update", "channels:manage"]),
                                "ready",
                                null,
                                installation.id,
                            ],
                        });
                        await client.execute({
                            sql: "DELETE FROM __drizzle_migrations WHERE created_at = ?",
                            args: [1785283200000],
                        });
                        await serverSchemaMigrate(client);
                    } finally {
                        client.close();
                    }
                },
            });

            const catalog = await asAdmin.get("/v0/admin/plugins");
            expect(catalog.statusCode).toBe(200);
            const chatManagement = catalog
                .json()
                .plugins.find(
                    (plugin: { shortName: string }) => plugin.shortName === "chat-management",
                );
            expect(chatManagement.systemPlugin.installations).toEqual([
                expect.objectContaining({
                    id: installation.id,
                    grantedPermissions: [],
                    status: "broken_configuration",
                    statusDetail: "Installed plugin package must be reinstalled or updated.",
                    lastError: "Installed plugin permissions are unsupported or unreadable.",
                }),
            ]);
            expect(chatManagement.systemPlugin.updateAvailable).toBe(true);
            expect(runtime.prepares).toBe(1);

            const client = createClient({ url: databaseUrl });
            try {
                const persisted = await client.execute({
                    sql: `SELECT p.manifest_json, i.granted_permissions_json, i.status
                          FROM plugins p
                          JOIN plugin_installations i ON i.plugin_id = p.id
                          WHERE i.id = ?`,
                    args: [installation.id],
                });
                expect(JSON.parse(String(persisted.rows[0]?.manifest_json))).toMatchObject({
                    container: { permissions: ["chats:update", "channels:manage"] },
                });
                expect(JSON.parse(String(persisted.rows[0]?.granted_permissions_json))).toEqual([
                    "chats:update",
                    "channels:manage",
                ]);
                expect(persisted.rows[0]?.status).toBe("broken_configuration");
            } finally {
                client.close();
            }
        } finally {
            await rm(databaseDirectory, { force: true, recursive: true });
        }
    });
});

class HealthyPluginRuntime implements PluginMcpRuntime {
    prepares = 0;

    async prepareLocal(input: PluginLocalPrepareInput) {
        this.prepares += 1;
        return {
            containerInstanceId: input.containerInstanceId,
            imageTag: input.imageTag,
            reused: false,
        };
    }

    async startLocalCommand(): Promise<PluginLocalCommandHandle> {
        return { wait: Promise.resolve({ exitCode: 0, signal: null }), close() {} };
    }

    async monitorLocalCommand(): Promise<PluginLocalCommandHandle> {
        return { wait: Promise.resolve({ exitCode: 0, signal: null }), close() {} };
    }

    async openLocal(_input: PluginLocalOpenInput) {
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            async send(message) {
                if (
                    !("id" in message) ||
                    (typeof message.id !== "string" && typeof message.id !== "number")
                )
                    return;
                const id = message.id;
                queueMicrotask(() =>
                    transport.onmessage?.({
                        jsonrpc: "2.0",
                        id,
                        result:
                            "method" in message && message.method === "initialize"
                                ? {
                                      protocolVersion: "2025-06-18",
                                      capabilities: { tools: {} },
                                      serverInfo: { name: "plugin-upgrade-gym", version: "1.0.0" },
                                  }
                                : "method" in message && message.method === "tools/list"
                                  ? { tools: [] }
                                  : {},
                    }),
                );
            },
        };
        return transport;
    }

    async removeLocal(): Promise<void> {}
}

async function waitForPlugin(
    client: GymRequestClient,
    installationId: string,
    status: string,
): Promise<void> {
    let latest: unknown;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const catalog = await client.get("/v0/admin/plugins");
        if (catalog.statusCode === 200) {
            const installation = catalog
                .json()
                .plugins.flatMap(
                    (plugin: {
                        systemPlugin?: { installations?: Array<{ id: string; status: string }> };
                    }) => plugin.systemPlugin?.installations ?? [],
                )
                .find(({ id }: { id: string }) => id === installationId);
            latest = installation;
            if (installation?.status === status) return;
        } else {
            latest = catalog.json();
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
        `Plugin installation ${installationId} did not reach ${status}: ${JSON.stringify(latest)}`,
    );
}

async function packageDigest(directory: string): Promise<string> {
    const files = new Map<string, Buffer>();
    const visit = async (current: string): Promise<void> => {
        for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) =>
            left.name.localeCompare(right.name),
        )) {
            if (current === directory && entry.name === "data") continue;
            const path = join(current, entry.name);
            const information = await lstat(path);
            if (information.isDirectory()) await visit(path);
            else files.set(relative(directory, path).split(sep).join("/"), await readFile(path));
        }
    };
    await visit(directory);
    const hash = createHash("sha256");
    for (const [name, contents] of [...files.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
    )) {
        hash.update(name, "utf8");
        hash.update("\0");
        hash.update(String(contents.byteLength), "utf8");
        hash.update("\0");
        hash.update(contents);
    }
    return `sha256:${hash.digest("hex")}`;
}
