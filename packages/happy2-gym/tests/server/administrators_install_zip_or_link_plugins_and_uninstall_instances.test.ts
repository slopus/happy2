import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import yazl from "yazl";
import type { PluginPackageLinkDownloader } from "happy2-server";
import { createGymServer } from "happy2-gym";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("external Happy2 plugin packages", () => {
    it("installs validated ZIP uploads and links for administrators, then removes one installation", async () => {
        const linkedZip = await pluginZip("linked-tools", "Linked Tools");
        const downloader: PluginPackageLinkDownloader = {
            async download(url) {
                expect(url).toBe("https://plugins.example/linked-tools.zip");
                return { body: linkedZip, url };
            },
        };
        await using server = await createGymServer({ pluginPackageLinkDownloader: downloader });
        const admin = await server.createUser({ username: "external_plugin_admin" });
        const member = await server.createUser({ username: "external_plugin_member" });

        expect(
            (
                await server.as(member).post("/v0/admin/plugins/installPlugin", {
                    sourceUrl: "https://plugins.example/linked-tools.zip",
                    variables: {},
                })
            ).statusCode,
        ).toBe(403);
        const linked = await server.as(admin).post("/v0/admin/plugins/installPlugin", {
            sourceUrl: "https://plugins.example/linked-tools.zip",
            variables: {},
        });
        expect(linked.statusCode).toBe(202);
        expect(linked.json().installation).toMatchObject({
            shortName: "linked-tools",
            sourceKind: "link",
            sourceReference: "https://plugins.example/linked-tools.zip",
            status: "ready",
        });
        const secondLinked = await server.as(admin).post("/v0/admin/plugins/installPlugin", {
            sourceUrl: "https://plugins.example/linked-tools.zip",
            variables: {},
        });
        expect(secondLinked.statusCode).toBe(202);
        expect(secondLinked.json().installation.pluginId).toBe(linked.json().installation.pluginId);
        expect(secondLinked.json().installation.id).not.toBe(linked.json().installation.id);

        const uploadedZip = await pluginZip("uploaded-tools", "Uploaded Tools", true);
        const multipart = multipartArchive(uploadedZip, {});
        const uploaded = await server
            .as(admin)
            .post("/v0/admin/plugins/installPlugin", multipart.body, {
                headers: { "content-type": multipart.contentType },
            });
        expect(uploaded.statusCode).toBe(202);
        expect(uploaded.json().installation).toMatchObject({
            shortName: "uploaded-tools",
            sourceKind: "archive",
            status: "ready",
        });
        expect(uploaded.json().installation.sourceReference).toMatch(/^sha256:[a-f0-9]{64}$/);

        const systems = await server.as(admin).get("/v0/admin/systemPlugins");
        expect(systems.json().plugins).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ shortName: "linked-tools", sourceKind: "link" }),
                expect.objectContaining({ shortName: "uploaded-tools", sourceKind: "archive" }),
            ]),
        );

        const installationId = linked.json().installation.id as string;
        const secondInstallationId = secondLinked.json().installation.id as string;
        const removed = await server
            .as(admin)
            .post(`/v0/admin/pluginInstallations/${installationId}/uninstallPlugin`, {});
        expect(removed.statusCode).toBe(200);
        expect(removed.json()).toEqual({ uninstalled: true });
        const afterOne = (await server.as(admin).get("/v0/admin/systemPlugins")).json()
            .plugins as Array<{
            shortName: string;
            installations: Array<{ id: string }>;
        }>;
        expect(afterOne.map(({ shortName }) => shortName).sort()).toEqual([
            "linked-tools",
            "uploaded-tools",
        ]);
        expect(
            afterOne.find(({ shortName }) => shortName === "linked-tools")?.installations,
        ).toEqual([expect.objectContaining({ id: secondInstallationId })]);
        expect(
            (
                await server
                    .as(admin)
                    .post(`/v0/admin/pluginInstallations/${installationId}/uninstallPlugin`, {})
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await server
                    .as(admin)
                    .post(
                        `/v0/admin/pluginInstallations/${secondInstallationId}/uninstallPlugin`,
                        {},
                    )
            ).statusCode,
        ).toBe(200);
        const afterTwo = (await server.as(admin).get("/v0/admin/systemPlugins")).json()
            .plugins as Array<{ shortName: string }>;
        expect(afterTwo.map(({ shortName }) => shortName)).toEqual(["uploaded-tools"]);
    });

    it("rejects traversal entries before package validation or persistence", async () => {
        const safe = await zipEntries([
            ["evil/plugin.json", Buffer.from("{}")],
            ["plugin.png", SQUARE_PNG],
        ]);
        const unsafe = replaceAllBytes(safe, "evil/plugin.json", "../x/plugin.json");
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "unsafe_plugin_admin" });
        const multipart = multipartArchive(unsafe, {});
        const response = await server
            .as(admin)
            .post("/v0/admin/plugins/installPlugin", multipart.body, {
                headers: { "content-type": multipart.contentType },
            });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
            error: "broken_configuration",
            message: expect.stringContaining("unsafe entry path"),
        });
        expect((await server.as(admin).get("/v0/admin/systemPlugins")).json().plugins).toEqual([]);
    });

    it("keeps a linked plugin distinct from a built-in package with the same short name", async () => {
        const archive = await pluginZip("plugin-developer", "External Plugin Developer");
        const sourceUrl = "https://plugins.example/external-plugin-developer.zip";
        const downloader: PluginPackageLinkDownloader = {
            async download(url) {
                expect(url).toBe(sourceUrl);
                return { body: archive, url };
            },
        };
        await using server = await createGymServer({ pluginPackageLinkDownloader: downloader });
        const admin = await server.createUser({ username: "same_short_name_plugin_admin" });

        const external = await server
            .as(admin)
            .post("/v0/admin/plugins/installPlugin", { sourceUrl, variables: {} });
        expect(external.statusCode).toBe(202);
        const externalPluginId = external.json().installation.pluginId as string;

        const beforeBuiltin = (await server.as(admin).get("/v0/admin/plugins")).json()
            .plugins as Array<{
            shortName: string;
            systemPlugin?: { id: string; sourceKind: string };
        }>;
        expect(
            beforeBuiltin.find(({ shortName }) => shortName === "plugin-developer")?.systemPlugin,
        ).toBeUndefined();

        // Short names are a global plugin namespace, so the built-in cannot be
        // installed until the conflicting external source is removed. The
        // catalog must still never present the external package as if it were
        // the built-in package.
        const builtin = await server
            .as(admin)
            .post("/v0/admin/plugins/plugin-developer/installPlugin", {});
        expect(builtin.statusCode).toBe(409);
        expect(builtin.json()).toMatchObject({
            error: "conflict",
            message: expect.stringContaining("plugin-developer"),
        });
        const systems = (await server.as(admin).get("/v0/admin/systemPlugins")).json()
            .plugins as Array<{ id: string; shortName: string; sourceKind: string }>;
        expect(
            systems
                .filter(({ shortName }) => shortName === "plugin-developer")
                .map(({ id, sourceKind }) => ({ id, sourceKind })),
        ).toEqual(expect.arrayContaining([{ id: externalPluginId, sourceKind: "link" }]));
    });
});

async function pluginZip(shortName: string, displayName: string, nested = false): Promise<Buffer> {
    const root = nested ? `${shortName}/` : "";
    return zipEntries([
        [
            `${root}plugin.json`,
            Buffer.from(
                JSON.stringify({
                    schemaVersion: 1,
                    version: "1.0.0",
                    displayName,
                    shortName,
                    description: `${displayName} gym package.`,
                    variables: [],
                }),
            ),
        ],
        [`${root}plugin.png`, SQUARE_PNG],
        [
            `${root}skills/${shortName}/SKILL.md`,
            Buffer.from(
                `---\nname: ${shortName}\ndescription: Exercise ${displayName} in the Happy2 gym.\n---\n\nUse the plugin.\n`,
            ),
        ],
    ]);
}

function replaceAllBytes(input: Buffer, from: string, to: string): Buffer {
    if (Buffer.byteLength(from) !== Buffer.byteLength(to)) throw new Error("ZIP names must match");
    const result = Buffer.from(input);
    const needle = Buffer.from(from);
    const replacement = Buffer.from(to);
    let offset = 0;
    for (;;) {
        const index = result.indexOf(needle, offset);
        if (index < 0) return result;
        replacement.copy(result, index);
        offset = index + replacement.length;
    }
}

async function zipEntries(entries: Array<[string, Buffer]>): Promise<Buffer> {
    const zip = new yazl.ZipFile();
    for (const [name, body] of entries) zip.addBuffer(body, name);
    zip.end();
    const output = new PassThrough();
    zip.outputStream.pipe(output);
    const chunks: Buffer[] = [];
    for await (const chunk of output) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

function multipartArchive(archive: Buffer, variables: Record<string, string>) {
    const boundary = "happy2-gym-plugin-boundary";
    const chunks = [
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="variables"\r\n\r\n${JSON.stringify(variables)}\r\n`,
        ),
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="archive"; filename="plugin.zip"\r\nContent-Type: application/zip\r\n\r\n`,
        ),
        archive,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    return {
        body: Buffer.concat(chunks),
        contentType: `multipart/form-data; boundary=${boundary}`,
    };
}
