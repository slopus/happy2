import { happyStateCreate } from "happy2-state";
import type { PluginArchiveDownloader } from "happy2-server";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("external plugins across happy2-state and the real server", () => {
    it("prepares a GitHub repository over SSE, installs a chosen candidate, checks for updates, and uninstalls", async () => {
        const downloader = new MutableArchiveDownloader(
            githubZip([
                { shortName: "alpha-tools", version: "1.0.0" },
                { shortName: "beta-tools", version: "1.0.0" },
            ]),
        );
        await using server = await createGymServer({ pluginArchiveDownloader: downloader });
        const admin = await server.createUser({ username: "external_state_admin" });
        const transport = await createGymStateTransport(server, admin);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        const plugins = state.plugins();
        const install = state.pluginInstall();
        await state.whenIdle();

        // Preparation streams verified GitHub candidates over the real SSE response.
        install.getState().sourceKindUpdate("github");
        install.getState().sourceUrlUpdate("https://github.com/example/toolbox");
        install.getState().prepareSubmit();
        expect(install.getState().step).toEqual({ step: "preparing" });
        await state.whenIdle();
        const chooseStep = install.getState().step;
        if (chooseStep.step !== "choose")
            throw new Error(`expected choose, got ${chooseStep.step}`);
        expect(chooseStep.candidates.map((candidate) => candidate.shortName)).toEqual([
            "alpha-tools",
            "beta-tools",
        ]);

        // Installing the chosen candidate consumes its prepared token durably and
        // reconciles the plugin surface without a manual refresh.
        install.getState().candidateChoose(chooseStep.candidates[0]!.preparedToken);
        install.getState().installSubmit({}, []);
        await state.whenIdle();
        const installedStep = install.getState().step;
        if (installedStep.step !== "installed")
            throw new Error(`expected installed, got ${installedStep.step}`);
        expect(installedStep.installation).toMatchObject({
            shortName: "alpha-tools",
            sourceKind: "github",
        });
        const pluginId = installedStep.installation.pluginId;
        const installationId = installedStep.installation.id;
        expect(plugins.getState().systemPlugins).toMatchObject({
            type: "ready",
            value: [{ id: pluginId, shortName: "alpha-tools", sourceKind: "github" }],
        });
        await expect
            .poll(
                () => {
                    const snapshot = plugins.getState().systemPlugins;
                    return snapshot.type === "ready"
                        ? snapshot.value[0]?.installations[0]?.status
                        : undefined;
                },
                { timeout: 5_000 },
            )
            .toBe("ready");

        // While the surface is watched, the remote digest change is discovered
        // automatically through the real checkForUpdate SSE stream.
        downloader.archive = githubZip([
            { shortName: "alpha-tools", version: "1.1.0" },
            { shortName: "beta-tools", version: "1.0.0" },
        ]);
        plugins.getState().updateChecksStart();
        await state.whenIdle();
        expect(plugins.getState().updateChecks.get(installationId)).toMatchObject({
            status: "checked",
            update: {
                updateAvailable: true,
                installed: { version: "1.0.0" },
                remote: { version: "1.1.0" },
            },
        });

        // Uninstalling the last installation removes the plugin durably.
        plugins.getState().installationUninstall(installationId);
        await state.whenIdle();
        expect(plugins.getState().uninstalling).toEqual([]);
        expect(plugins.getState().actionError).toBeUndefined();
        expect(plugins.getState().systemPlugins).toEqual({ type: "ready", value: [] });
        plugins.getState().updateChecksStop();
    });

    it("prepares one uploaded ZIP through the multipart boundary and installs it", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "upload_state_admin" });
        const transport = await createGymStateTransport(server, admin);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        const plugins = state.plugins();
        const install = state.pluginInstall();
        await state.whenIdle();

        const archive = zip(pluginFiles("uploaded-tools", "1.0.0", ""));
        install
            .getState()
            .archiveSelect(
                new File([new Uint8Array(archive)], "plugin.zip", { type: "application/zip" }),
            );
        install.getState().prepareSubmit();
        await state.whenIdle();
        const step = install.getState().step;
        if (step.step !== "configure") throw new Error(`expected configure, got ${step.step}`);
        expect(step.candidate).toMatchObject({
            shortName: "uploaded-tools",
            sourceKind: "upload",
            skills: [{ name: "uploaded-tools" }],
        });

        install.getState().installSubmit({}, []);
        await state.whenIdle();
        expect(install.getState().step).toMatchObject({
            step: "installed",
            installation: { shortName: "uploaded-tools", sourceKind: "upload" },
        });
        expect(plugins.getState().systemPlugins).toMatchObject({
            type: "ready",
            value: [{ shortName: "uploaded-tools", sourceKind: "upload" }],
        });
    });
});

class MutableArchiveDownloader implements PluginArchiveDownloader {
    constructor(public archive: Buffer) {}

    async download(url: string, options?: Parameters<PluginArchiveDownloader["download"]>[1]) {
        options?.onProgress?.({
            receivedBytes: this.archive.byteLength,
            totalBytes: this.archive.byteLength,
        });
        return { body: this.archive, finalUrl: url };
    }
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

function pluginFiles(shortName: string, version: string, prefix: string): Record<string, Buffer> {
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
    };
    return {
        [`${prefix}plugin.json`]: Buffer.from(JSON.stringify(manifest)),
        [`${prefix}plugin.png`]: SQUARE_PNG,
        [`${prefix}skills/${shortName}/SKILL.md`]: Buffer.from(
            `---\nname: ${shortName}\ndescription: Uses ${shortName} tools.\n---\n\n# ${displayName}\n`,
        ),
    };
}

function zip(files: Record<string, Buffer>): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const [name, body] of Object.entries(files)) {
        const filename = Buffer.from(name, "utf8");
        const checksum = crc32(body);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x800, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(body.byteLength, 18);
        local.writeUInt32LE(body.byteLength, 22);
        local.writeUInt16LE(filename.byteLength, 26);
        locals.push(local, filename, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(0x0314, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(body.byteLength, 20);
        central.writeUInt32LE(body.byteLength, 24);
        central.writeUInt16LE(filename.byteLength, 28);
        central.writeUInt32LE((0o100600 << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, filename);
        offset += local.byteLength + filename.byteLength + body.byteLength;
    }
    const centralDirectory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(files).length, 8);
    end.writeUInt16LE(Object.keys(files).length, 10);
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
