import { access, readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import {
    type PluginArchiveDownloader,
    type PluginLocalCommandHandle,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { describe, expect, it } from "vitest";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("external plugin package lifecycle", () => {
    it("streams uploaded ZIP verification, installs once, mounts persistent data, and fully uninstalls", async () => {
        const runtime = new HealthyPluginRuntime();
        await using server = await createGymServer({ pluginMcpRuntime: runtime });
        const admin = await server.createUser({ username: "external_plugin_admin" });
        const member = await server.createUser({ username: "external_plugin_member" });
        const archive = pluginZip("uploaded-tools", "1.0.0", { stdio: true });
        const upload = multipartArchive(archive);

        expect(
            (
                await server.post("/v0/admin/pluginPackages/preparePlugin", upload.body, {
                    headers: { "content-type": upload.contentType },
                })
            ).statusCode,
        ).toBe(401);
        expect(
            (
                await server
                    .as(member)
                    .post("/v0/admin/pluginPackages/preparePlugin", upload.body, {
                        headers: { "content-type": upload.contentType },
                    })
            ).statusCode,
        ).toBe(403);

        const response = await server
            .as(admin)
            .post("/v0/admin/pluginPackages/preparePlugin", upload.body, {
                headers: { "content-type": upload.contentType },
            });
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/event-stream");
        const events = sseEvents(response.payload);
        expect(events.map(({ event }) => event)).toEqual(["progress", "progress", "prepared"]);
        const candidate = events.at(-1)!.data.candidates[0] as Record<string, unknown>;
        expect(candidate).toMatchObject({
            sourceKind: "upload",
            version: "1.0.0",
            shortName: "uploaded-tools",
            displayName: "Uploaded Tools",
            description: "Does useful uploaded-tools work.",
            skills: [{ name: "uploaded-tools", description: "Uses uploaded-tools tools." }],
            mcp: { type: "stdio", container: "bundled" },
            image: expect.objectContaining({ contentType: "image/png", width: 1, height: 1 }),
        });
        expect(candidate.sourceReference).toMatch(/^upload:sha256:/);

        const installed = await server.as(admin).post("/v0/admin/pluginPackages/installPlugin", {
            preparedToken: candidate.preparedToken,
        });
        expect(installed.statusCode).toBe(202);
        const installation = installed.json().installation as {
            id: string;
            pluginId: string;
            sourceKind: string;
        };
        expect(installation.sourceKind).toBe("upload");
        await waitForReady(server.as(admin), installation.id);
        expect(runtime.prepares).toHaveLength(1);
        expect(runtime.buildContextFiles).toEqual([
            expect.arrayContaining([
                "container",
                "container/Dockerfile",
                "plugin.json",
                "plugin.png",
                "skills",
                "skills/uploaded-tools",
                "skills/uploaded-tools/SKILL.md",
            ]),
        ]);
        expect(runtime.buildContextFiles[0]?.some((path) => path.startsWith("data"))).toBe(false);
        const pluginDirectory = join(server.config.plugins.directory, installation.pluginId);
        const dataDirectory = join(pluginDirectory, "data", installation.id);
        expect(runtime.prepares[0]?.workspaceDirectory).toBe(await realpath(dataDirectory));
        await access(join(pluginDirectory, "plugin.json"));
        await access(join(pluginDirectory, "plugin.png"));
        await access(join(pluginDirectory, "skills", "uploaded-tools", "SKILL.md"));
        await access(dataDirectory);
        expect(
            JSON.parse(await readFile(join(pluginDirectory, "plugin.json"), "utf8")),
        ).toMatchObject({
            shortName: "uploaded-tools",
        });

        const replay = await server.as(admin).post("/v0/admin/pluginPackages/installPlugin", {
            preparedToken: candidate.preparedToken,
        });
        expect(replay.statusCode).toBe(404);
        expect(replay.json()).toMatchObject({ error: "not_found" });

        const uninstalled = await server
            .as(admin)
            .post(`/v0/admin/systemPlugins/${installation.pluginId}/uninstallPlugin`);
        expect(uninstalled.statusCode).toBe(200);
        expect(uninstalled.json().uninstalled).toEqual({
            pluginId: installation.pluginId,
            installationIds: [installation.id],
        });
        await expect(access(pluginDirectory)).rejects.toMatchObject({ code: "ENOENT" });
        expect(runtime.removals).toContain(`happy2-plugin-${installation.id}`);
        expect((await server.as(admin).get("/v0/admin/systemPlugins")).json().plugins).toEqual([]);
    });

    it("discovers GitHub plugin folders for selection and reports when the selected remote changes", async () => {
        const downloader = new MutableArchiveDownloader(
            githubZip([
                { shortName: "alpha-tools", version: "1.0.0" },
                { shortName: "beta-tools", version: "1.0.0" },
            ]),
        );
        await using server = await createGymServer({ pluginArchiveDownloader: downloader });
        const admin = await server.createUser({ username: "github_plugin_admin" });

        const prepared = await server.as(admin).post("/v0/admin/pluginPackages/preparePlugin", {
            source: { kind: "github", url: "https://github.com/example/toolbox" },
        });
        expect(prepared.statusCode).toBe(200);
        const events = sseEvents(prepared.payload);
        expect(events.some(({ event }) => event === "progress")).toBe(true);
        const selection = events.find(({ event }) => event === "selection_required")!;
        expect(selection.data.selectionRequired).toBe(true);
        const candidates = selection.data.candidates as Array<Record<string, unknown>>;
        expect(candidates.map(({ shortName }) => shortName)).toEqual(["alpha-tools", "beta-tools"]);
        expect(candidates.every(({ preparedToken }) => typeof preparedToken === "string")).toBe(
            true,
        );
        expect(downloader.urls).toEqual(["https://github.com/example/toolbox/archive/HEAD.zip"]);

        const alpha = candidates[0]!;
        const installed = await server.as(admin).post("/v0/admin/pluginPackages/installPlugin", {
            preparedToken: alpha.preparedToken,
        });
        expect(installed.statusCode).toBe(202);
        expect(installed.json().installation).toMatchObject({
            shortName: "alpha-tools",
            sourceKind: "github",
            status: "ready",
        });
        const pluginId = installed.json().installation.pluginId as string;
        const firstInstallationId = installed.json().installation.id as string;

        const secondPrepared = await server
            .as(admin)
            .post("/v0/admin/pluginPackages/preparePlugin", {
                source: { kind: "github", url: "https://github.com/example/toolbox" },
            });
        const secondAlpha = (
            sseEvents(secondPrepared.payload).find(({ event }) => event === "selection_required")!
                .data.candidates as Array<Record<string, unknown>>
        )[0]!;
        const secondInstalled = await server
            .as(admin)
            .post("/v0/admin/pluginPackages/installPlugin", {
                preparedToken: secondAlpha.preparedToken,
            });
        expect(secondInstalled.statusCode).toBe(202);
        const secondInstallationId = secondInstalled.json().installation.id as string;
        expect(secondInstalled.json().installation.pluginId).toBe(pluginId);

        downloader.archive = githubZip([
            { shortName: "alpha-tools", version: "1.1.0" },
            { shortName: "beta-tools", version: "1.0.0" },
        ]);
        const checked = await server
            .as(admin)
            .post(`/v0/admin/pluginInstallations/${firstInstallationId}/checkForUpdate`);
        const checkEvents = sseEvents(checked.payload);
        const update = checkEvents.find(({ event }) => event === "checked")!.data.update as Record<
            string,
            unknown
        >;
        expect(update).toMatchObject({
            pluginId,
            installationId: firstInstallationId,
            updateAvailable: true,
            installed: { version: "1.0.0" },
            remote: { version: "1.1.0" },
        });

        const applied = await server
            .as(admin)
            .post(`/v0/admin/pluginInstallations/${firstInstallationId}/updatePlugin`);
        const appliedEvents = sseEvents(applied.payload);
        expect(appliedEvents.map(({ event }) => event)).toContain("progress");
        expect(appliedEvents.at(-1)).toMatchObject({
            event: "updated",
            data: {
                update: {
                    pluginId,
                    installationId: firstInstallationId,
                    previous: { version: "1.0.0" },
                    current: { version: "1.1.0" },
                },
            },
        });
        const updatedSystem = (await server.as(admin).get("/v0/admin/systemPlugins")).json()
            .plugins[0];
        expect(updatedSystem).toMatchObject({
            id: pluginId,
            sourceVersion: "1.0.0",
            installations: expect.arrayContaining([
                expect.objectContaining({ id: firstInstallationId, sourceVersion: "1.1.0" }),
                expect.objectContaining({ id: secondInstallationId, sourceVersion: "1.0.0" }),
            ]),
        });
        expect(updatedSystem.installations).toHaveLength(2);

        const current = await server
            .as(admin)
            .post(`/v0/admin/pluginInstallations/${firstInstallationId}/checkForUpdate`);
        expect(sseEvents(current.payload).at(-1)).toMatchObject({
            event: "checked",
            data: { update: { updateAvailable: false, installed: { version: "1.1.0" } } },
        });
        const siblingStillOutdated = await server
            .as(admin)
            .post(`/v0/admin/pluginInstallations/${secondInstallationId}/checkForUpdate`);
        expect(sseEvents(siblingStillOutdated.payload).at(-1)).toMatchObject({
            event: "checked",
            data: { update: { updateAvailable: true, installed: { version: "1.0.0" } } },
        });

        const changedPreparation = await server
            .as(admin)
            .post("/v0/admin/pluginPackages/preparePlugin", {
                source: { kind: "github", url: "https://github.com/example/toolbox" },
            });
        const changedAlpha = (
            sseEvents(changedPreparation.payload).find(
                ({ event }) => event === "selection_required",
            )!.data.candidates as Array<Record<string, unknown>>
        )[0]!;
        const thirdInstallation = await server
            .as(admin)
            .post("/v0/admin/pluginPackages/installPlugin", {
                preparedToken: changedAlpha.preparedToken,
            });
        expect(thirdInstallation.statusCode).toBe(202);
        expect(thirdInstallation.json().installation).toMatchObject({
            pluginId,
            sourceVersion: "1.1.0",
        });
    });

    it("prefers a GitHub root plugin over nested plugin folders", async () => {
        const downloader = new MutableArchiveDownloader(
            zip({
                ...pluginFiles("root-tools", "2.0.0", "toolbox-main/"),
                ...pluginFiles("nested-tools", "1.0.0", "toolbox-main/plugins/nested-tools/"),
            }),
        );
        await using server = await createGymServer({ pluginArchiveDownloader: downloader });
        const admin = await server.createUser({ username: "github_root_plugin_admin" });

        const response = await server.as(admin).post("/v0/admin/pluginPackages/preparePlugin", {
            source: { kind: "github", url: "https://github.com/example/toolbox" },
        });
        expect(sseEvents(response.payload).at(-1)).toMatchObject({
            event: "prepared",
            data: {
                selectionRequired: false,
                candidates: [{ shortName: "root-tools", version: "2.0.0" }],
            },
        });
    });

    it("installs one plugin from a ZIP link and checks the same URL for updates", async () => {
        const downloader = new MutableArchiveDownloader(pluginZip("linked-tools", "1.0.0"));
        await using server = await createGymServer({ pluginArchiveDownloader: downloader });
        const admin = await server.createUser({ username: "linked_plugin_admin" });
        const url = "https://downloads.example/plugins/linked-tools.zip";

        const prepared = await server.as(admin).post("/v0/admin/pluginPackages/preparePlugin", {
            source: { kind: "zip_url", url },
        });
        const candidate = sseEvents(prepared.payload).at(-1)!.data.candidates[0] as Record<
            string,
            unknown
        >;
        expect(candidate).toMatchObject({
            sourceKind: "zip_url",
            sourceReference: url,
            shortName: "linked-tools",
            version: "1.0.0",
        });
        const installed = await server.as(admin).post("/v0/admin/pluginPackages/installPlugin", {
            preparedToken: candidate.preparedToken,
        });
        expect(installed.statusCode).toBe(202);
        expect(installed.json().installation).toMatchObject({
            shortName: "linked-tools",
            sourceKind: "zip_url",
            status: "ready",
        });

        downloader.archive = pluginZip("linked-tools", "1.1.0");
        const checked = await server
            .as(admin)
            .post(
                `/v0/admin/pluginInstallations/${installed.json().installation.id}/checkForUpdate`,
            );
        expect(sseEvents(checked.payload).at(-1)).toMatchObject({
            event: "checked",
            data: {
                update: {
                    updateAvailable: true,
                    installed: { version: "1.0.0" },
                    remote: { version: "1.1.0" },
                },
            },
        });
        expect(downloader.urls).toEqual([url, url]);
    });

    it("rejects a generic ZIP URL containing more than one plugin", async () => {
        const downloader = new MutableArchiveDownloader(
            githubZip([
                { shortName: "first-tools", version: "1.0.0" },
                { shortName: "second-tools", version: "1.0.0" },
            ]),
        );
        await using server = await createGymServer({ pluginArchiveDownloader: downloader });
        const admin = await server.createUser({ username: "zip_plugin_admin" });
        const response = await server.as(admin).post("/v0/admin/pluginPackages/preparePlugin", {
            source: { kind: "zip_url", url: "https://downloads.example/plugin.zip" },
        });
        expect(sseEvents(response.payload).at(-1)).toEqual({
            event: "failed",
            data: {
                error: "invalid_package",
                message: "A plugin ZIP must contain exactly one plugin.json",
            },
        });
    });

    it("bounds actual DEFLATE output even when a ZIP lies about its uncompressed size", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "zip_bomb_admin" });
        const upload = multipartArchive(lyingDeflateZip());
        const response = await server
            .as(admin)
            .post("/v0/admin/pluginPackages/preparePlugin", upload.body, {
                headers: { "content-type": upload.contentType },
            });
        expect(sseEvents(response.payload).at(-1)).toMatchObject({
            event: "failed",
            data: {
                error: "invalid_package",
                message: expect.stringContaining("cannot be safely decompressed"),
            },
        });
    });
});

class MutableArchiveDownloader implements PluginArchiveDownloader {
    readonly urls: string[] = [];

    constructor(public archive: Buffer) {}

    async download(url: string, options?: Parameters<PluginArchiveDownloader["download"]>[1]) {
        this.urls.push(url);
        options?.onProgress?.({
            receivedBytes: this.archive.byteLength,
            totalBytes: this.archive.byteLength,
        });
        return { body: this.archive, finalUrl: url };
    }
}

class HealthyPluginRuntime implements PluginMcpRuntime {
    readonly buildContextFiles: string[][] = [];
    readonly prepares: PluginLocalPrepareInput[] = [];
    readonly opens: PluginLocalOpenInput[] = [];
    readonly removals: string[] = [];

    async prepareLocal(input: PluginLocalPrepareInput) {
        this.prepares.push(structuredClone(input));
        if (input.build)
            this.buildContextFiles.push(
                (await readdir(input.build.contextDirectory, { recursive: true })).sort(),
            );
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

    async openLocal(input: PluginLocalOpenInput) {
        this.opens.push(structuredClone(input));
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
                                      serverInfo: { name: "external-gym", version: "1.0.0" },
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

    async removeLocal(containerName: string): Promise<void> {
        this.removals.push(containerName);
    }
}

function pluginZip(shortName: string, version: string, options: { stdio?: boolean } = {}): Buffer {
    return zip(pluginFiles(shortName, version, "", options));
}

function githubZip(plugins: Array<{ shortName: string; version: string }>): Buffer {
    return zip(
        Object.fromEntries(
            plugins.flatMap(({ shortName, version }) =>
                Object.entries(
                    pluginFiles(shortName, version, `toolbox-main/plugins/${shortName}/`),
                ),
            ),
        ),
    );
}

function pluginFiles(
    shortName: string,
    version: string,
    prefix: string,
    options: { stdio?: boolean } = {},
): Record<string, Buffer> {
    const displayName = shortName
        .split("-")
        .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
        .join(" ");
    const manifest = {
        schemaVersion: 1,
        version,
        displayName,
        shortName,
        description: `Does useful ${shortName} work.`,
        variables: [],
        ...(options.stdio
            ? {
                  mcp: {
                      type: "stdio",
                      command: "/plugin/server",
                      args: [],
                      container: { dockerfile: "container/Dockerfile" },
                  },
              }
            : {}),
    };
    return {
        [`${prefix}plugin.json`]: Buffer.from(JSON.stringify(manifest)),
        [`${prefix}plugin.png`]: SQUARE_PNG,
        [`${prefix}skills/${shortName}/SKILL.md`]: Buffer.from(
            `---\nname: ${shortName}\ndescription: Uses ${shortName} tools.\n---\n\n# ${displayName}\n`,
        ),
        ...(options.stdio
            ? { [`${prefix}container/Dockerfile`]: Buffer.from("FROM scratch\n") }
            : {}),
    };
}

function multipartArchive(archive: Buffer): { body: Buffer; contentType: string } {
    const boundary = "happy2-plugin-gym-boundary";
    return {
        contentType: `multipart/form-data; boundary=${boundary}`,
        body: Buffer.concat([
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="plugin"; filename="plugin.zip"\r\nContent-Type: application/zip\r\n\r\n`,
            ),
            archive,
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
    };
}

function sseEvents(payload: string): Array<{ event: string; data: Record<string, any> }> {
    return payload
        .split("\n\n")
        .filter(Boolean)
        .map((frame) => {
            const lines = frame.split("\n");
            return {
                event: lines.find((line) => line.startsWith("event: "))!.slice(7),
                data: JSON.parse(lines.find((line) => line.startsWith("data: "))!.slice(6)),
            };
        });
}

async function waitForReady(client: GymRequestClient, installationId: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await client.get("/v0/admin/systemPlugins");
        const installation = response
            .json()
            .plugins.flatMap(
                (plugin: { installations: Array<{ id: string; status: string }> }) =>
                    plugin.installations,
            )
            .find(({ id }: { id: string }) => id === installationId);
        if (installation?.status === "ready") return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Plugin installation ${installationId} did not become ready`);
}

function zip(files: Record<string, Buffer>): Buffer {
    return encodedZip(
        Object.entries(files).map(([name, body]) => ({
            body,
            compressed: body,
            declaredSize: body.byteLength,
            method: 0,
            name,
        })),
    );
}

function lyingDeflateZip(): Buffer {
    const ordinary = Object.entries(pluginFiles("bounded-tools", "1.0.0", "")).map(
        ([name, body]) => ({
            body,
            compressed: body,
            declaredSize: body.byteLength,
            method: 0,
            name,
        }),
    );
    const body = Buffer.alloc(1024 * 1024, "a");
    return encodedZip([
        ...ordinary,
        {
            body,
            compressed: deflateRawSync(body),
            declaredSize: 1,
            method: 8,
            name: "bomb.bin",
        },
    ]);
}

function encodedZip(
    files: Array<{
        body: Buffer;
        compressed: Buffer;
        declaredSize: number;
        method: number;
        name: string;
    }>,
): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const { body, compressed, declaredSize, method, name } of files) {
        const filename = Buffer.from(name, "utf8");
        const checksum = crc32(body);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x800, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(compressed.byteLength, 18);
        local.writeUInt32LE(declaredSize, 22);
        local.writeUInt16LE(filename.byteLength, 26);
        locals.push(local, filename, compressed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(0x0314, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(compressed.byteLength, 20);
        central.writeUInt32LE(declaredSize, 24);
        central.writeUInt16LE(filename.byteLength, 28);
        central.writeUInt32LE((0o100600 << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, filename);
        offset += local.byteLength + filename.byteLength + compressed.byteLength;
    }
    const centralDirectory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralDirectory.byteLength, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralDirectory, end]);
}

let crcTable: Uint32Array | undefined;

function crc32(value: Buffer): number {
    crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
        let current = index;
        for (let bit = 0; bit < 8; bit += 1)
            current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
        return current >>> 0;
    });
    let result = 0xffffffff;
    for (const byte of value) result = crcTable[(result ^ byte) & 0xff]! ^ (result >>> 8);
    return (result ^ 0xffffffff) >>> 0;
}
