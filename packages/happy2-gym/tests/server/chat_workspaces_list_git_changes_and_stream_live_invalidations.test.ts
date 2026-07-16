import { execFile } from "node:child_process";
import { mkdir, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentDockerRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient, type GymServer } from "../../sources/index.js";

const executeFile = promisify(execFile);

interface WorkspaceResponse {
    directory?: string;
    gitStatus: Array<{ path: string; status: string }>;
    gitStatusPending: boolean;
    nextCursor?: string;
    paths: string[];
    revision: string;
    unloadedDirectories: string[];
}

describe("chat workspace files", () => {
    it("lists Trees paths and Git changes from the workspace mounted in a chat's Rig", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "workspace_owner" });
        const member = await server.createUser({ username: "workspace_member" });
        const outsider = await server.createUser({ username: "workspace_outsider" });
        const asOwner = server.as(owner);
        const connected = await createAgentWorkspace(asOwner, rig, "workspace_agent");
        const { chatId, directory: workspaceDirectory } = connected;
        const endpoint = `/v0/chats/${chatId}/workspace`;

        expect((await server.get(endpoint)).statusCode).toBe(401);
        expect((await server.as(outsider).get(endpoint)).statusCode).toBe(404);
        expect((await asOwner.get(`${endpoint}?refresh=true`)).statusCode).toBe(400);
        expect((await asOwner.get(`${endpoint}?limit=10`)).statusCode).toBe(400);

        const direct = await asOwner.post("/v0/chats/createDirectMessage", {
            userId: member.id,
        });
        const directEndpoint = `/v0/chats/${direct.json().chat.id as string}/workspace`;
        expect((await asOwner.get(directEndpoint)).statusCode).toBe(404);
        expect((await server.as(member).get(directEndpoint)).statusCode).toBe(404);

        const group = await asOwner.post("/v0/chats/createGroupDirectMessage", {
            userIds: [member.id, outsider.id],
            name: "Workspace group",
        });
        const groupEndpoint = `/v0/chats/${group.json().chat.id as string}/workspace`;
        expect((await asOwner.get(groupEndpoint)).statusCode).toBe(404);
        expect((await server.as(member).get(groupEndpoint)).statusCode).toBe(404);

        const empty = workspace(await asOwner.get(endpoint));
        expect(empty).toMatchObject({
            gitStatus: [],
            paths: [],
            revision: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.\d+\.\d+$/,
            ),
            unloadedDirectories: [],
        });

        await initializeRepository(workspaceDirectory);
        const outside = join(rig.workspaceRoot, "outside");
        await mkdir(outside);
        await writeFile(join(outside, "private.txt"), "must not be traversed\n");
        await symlink(outside, join(workspaceDirectory, "outside-link"), "dir");

        const snapshot = await waitForWorkspace(asOwner, endpoint, (candidate) => {
            return (
                !candidate.gitStatusPending &&
                candidate.paths.includes("src/deleted.ts") &&
                !candidate.paths.includes("src/renamed-old.ts") &&
                candidate.gitStatus.length === 7
            );
        });
        expect(snapshot.paths).toContain(".git/");
        expect(snapshot.paths).not.toContain(".git/HEAD");
        expect(snapshot.unloadedDirectories).toContain(".git/");
        expect(snapshot.paths.filter((path) => !path.startsWith(".git/"))).toEqual([
            ".gitignore",
            "cache/",
            "empty/",
            "outside-link",
            "src/",
            "cache/ignored.bin",
            "src/added.ts",
            "src/clean.ts",
            "src/deleted.ts",
            "src/modified.ts",
            "src/renamed.ts",
            "src/untracked.ts",
        ]);
        expect(snapshot.gitStatus).toEqual([
            { path: "cache/", status: "ignored" },
            { path: "outside-link", status: "untracked" },
            { path: "src/added.ts", status: "added" },
            { path: "src/deleted.ts", status: "deleted" },
            { path: "src/modified.ts", status: "modified" },
            { path: "src/renamed.ts", status: "renamed" },
            { path: "src/untracked.ts", status: "untracked" },
        ]);
        expect(snapshot.paths).not.toContain("outside-link/private.txt");

        const gitDirectory = workspace(
            await asOwner.get(`${endpoint}?directory=.git%2F&limit=1000`),
        );
        expect(gitDirectory).toMatchObject({ directory: ".git/" });
        expect(gitDirectory.paths).toContain(".git/HEAD");
        expect(gitDirectory.paths).toContain(".git/index");

        const publicChannel = await asOwner.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Public workspace",
            slug: "public-workspace",
        });
        const publicId = publicChannel.json().chat.id as string;
        const publicEndpoint = `/v0/chats/${publicId}/workspace`;
        expect((await server.as(outsider).get(publicEndpoint)).statusCode).toBe(404);
        expect((await server.as(outsider).post(`/v0/chats/${publicId}/join`)).statusCode).toBe(200);
        expect((await server.as(outsider).get(publicEndpoint)).statusCode).toBe(404);
    });

    it("adaptively defers expensive folders and pages their children with stale-cursor safety", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "adaptive_workspace_owner" });
        const asOwner = server.as(owner);
        const { chatId, directory } = await createAgentWorkspace(
            asOwner,
            rig,
            "adaptive_workspace_agent",
        );
        const endpoint = `/v0/chats/${chatId}/workspace`;
        await createAdaptiveTree(directory);

        await waitForWorkspace(asOwner, endpoint, (candidate) => !candidate.gitStatusPending);
        const initialResponse = await asOwner.get(endpoint);
        const initial = workspace(initialResponse);
        expect(initial.paths).toEqual([
            ".git/",
            "deep/",
            "generated/",
            "node_modules/",
            "deep/one/",
            "deep/one/two/",
        ]);
        expect(initial.unloadedDirectories).toEqual([
            ".git/",
            "deep/one/two/",
            "generated/",
            "node_modules/",
        ]);
        expect(initial.paths).not.toContain(".git/HEAD");
        expect(initial.paths).not.toContain("node_modules/package/index.js");
        expect(initial.paths).not.toContain("generated/item-000.txt");
        const etag = initialResponse.headers.etag;
        expect(etag).toBe(`"${initial.revision}"`);
        const unchanged = await asOwner.get(endpoint, {
            headers: { "if-none-match": etag! },
        });
        expect(unchanged.statusCode).toBe(304);
        expect(unchanged.body).toBe("");

        const gitPage = workspace(await asOwner.get(`${endpoint}?directory=.git%2F&limit=10`));
        expect(gitPage.paths).toEqual([".git/HEAD"]);
        const deepPage = workspace(
            await asOwner.get(`${endpoint}?directory=deep%2Fone%2Ftwo%2F&limit=10`),
        );
        expect(deepPage.paths).toEqual(["deep/one/two/three/"]);

        const firstPage = workspace(
            await asOwner.get(`${endpoint}?directory=generated%2F&limit=2`),
        );
        expect(firstPage.paths).toEqual(["generated/item-000.txt", "generated/item-001.txt"]);
        expect(firstPage.nextCursor).toEqual(expect.any(String));
        const secondPage = workspace(
            await asOwner.get(
                `${endpoint}?directory=generated%2F&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
            ),
        );
        expect(secondPage.paths).toEqual(["generated/item-002.txt", "generated/item-003.txt"]);

        await writeFile(join(directory, "generated", "item-new.txt"), "new\n");
        await waitForWorkspace(
            asOwner,
            endpoint,
            (candidate) => candidate.revision !== initial.revision,
        );
        expect(
            (
                await asOwner.get(
                    `${endpoint}?directory=generated%2F&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
                )
            ).statusCode,
        ).toBe(409);
        expect((await asOwner.get(`${endpoint}?directory=generated&limit=2`)).statusCode).toBe(404);
        expect((await asOwner.get(`${endpoint}?directory=&limit=1001`)).statusCode).toBe(400);
    });

    it("invalidates an open chat over SSE immediately after its mounted workspace changes", async () => {
        await using rig = await createMockRigDaemon();
        // A repository containing the mounted workspace must not become that workspace's repo.
        await mkdir(rig.workspaceRoot);
        await git(rig.workspaceRoot, "init", "--quiet", "--initial-branch=main");
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "live_workspace_owner" });
        const asOwner = server.as(owner);
        const connected = await createAgentWorkspace(asOwner, rig, "live_workspace_agent");
        const { chatId, directory } = connected;
        const endpoint = `/v0/chats/${chatId}/workspace`;
        const initial = await waitForWorkspace(
            asOwner,
            endpoint,
            (candidate) => !candidate.gitStatusPending,
        );

        // Cooling an old partial index must release cache memory without
        // disabling its live filesystem monitor.
        for (let index = 0; index < 8; index += 1) {
            const extra = await createAgentWorkspace(asOwner, rig, `extra_workspace_${index}`);
            const extraEndpoint = `/v0/chats/${extra.chatId}/workspace`;
            await waitForWorkspace(
                asOwner,
                extraEndpoint,
                (candidate) => !candidate.gitStatusPending,
            );
        }

        const baseUrl = await server.listen();
        const controller = new AbortController();
        const response = await fetch(`${baseUrl}/v0/sync/events`, {
            headers: { authorization: `Bearer ${owner.token}` },
            signal: controller.signal,
        });
        expect(response.status).toBe(200);
        const frames = new SseFrames(response.body!.getReader());
        expect((await frames.next()).name).toBe("ready");

        await writeFile(join(directory, "live.ts"), "export const live = true;\n");
        const changed = await frames.until(
            (frame) =>
                frame.name === "workspace.changed" &&
                (frame.data as { chatId?: string }).chatId === chatId,
        );
        expect(changed.data).toMatchObject({
            type: "workspace.changed",
            chatId,
            occurredAt: expect.any(Number),
        });
        const reconciled = await waitForWorkspace(asOwner, endpoint, (candidate) =>
            candidate.paths.includes("live.ts"),
        );
        expect(reconciled.paths).toEqual(["live.ts"]);
        expect(reconciled.gitStatus).toEqual([]);
        expect(reconciled.revision).not.toBe(initial.revision);

        controller.abort();
        await frames.cancel();
    });
});

function agentServer(rig: MockRigDaemon) {
    return createGymServer({
        agentDocker: new MockAgentDockerRuntime(),
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

async function createAgentWorkspace(
    client: GymRequestClient,
    rig: MockRigDaemon,
    username: string,
): Promise<{ chatId: string; directory: string }> {
    await configureAgentImage(client);
    const response = await client.post("/v0/chats/createAgent", {
        name: `Workspace ${username}`,
        username,
    });
    expect(response.statusCode).toBe(201);
    const directory = rig.createdCwds.at(-1);
    if (!directory) throw new Error("Rig workspace was not created");
    return { chatId: response.json().chat.id as string, directory };
}

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    if (catalog.defaultImageId) return;
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready" && image.status !== "building") {
        const requested = await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {});
        expect(requested.statusCode).toBe(202);
    }
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
        catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
        if (catalog.images.find(({ id }) => id === image.id)?.status === "ready") break;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(catalog.images.find(({ id }) => id === image.id)?.status).toBe("ready");
    const selected = await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {});
    expect(selected.statusCode).toBe(200);
}

async function initializeRepository(workspace: string): Promise<void> {
    await git(workspace, "init", "--quiet", "--initial-branch=main");
    await mkdir(join(workspace, "src"), { recursive: true });
    await Promise.all([
        writeFile(join(workspace, ".gitignore"), "cache/\n"),
        writeFile(join(workspace, "src", "clean.ts"), "export const clean = true;\n"),
        writeFile(join(workspace, "src", "deleted.ts"), "export const deleted = true;\n"),
        writeFile(join(workspace, "src", "modified.ts"), "export const modified = false;\n"),
        writeFile(join(workspace, "src", "renamed-old.ts"), "export const renamed = true;\n"),
    ]);
    await git(workspace, "add", ".");
    await git(
        workspace,
        "-c",
        "user.name=Happy Gym",
        "-c",
        "user.email=gym@happy.invalid",
        "commit",
        "--quiet",
        "-m",
        "Initial workspace",
    );

    await Promise.all([
        mkdir(join(workspace, "empty")),
        mkdir(join(workspace, "cache")),
        writeFile(join(workspace, "src", "added.ts"), "export const added = true;\n"),
        writeFile(join(workspace, "src", "modified.ts"), "export const modified = true;\n"),
        writeFile(join(workspace, "src", "untracked.ts"), "export const untracked = true;\n"),
    ]);
    await writeFile(join(workspace, "cache", "ignored.bin"), "ignored\n");
    await unlink(join(workspace, "src", "deleted.ts"));
    await rename(join(workspace, "src", "renamed-old.ts"), join(workspace, "src", "renamed.ts"));
    await git(workspace, "add", "src/added.ts", "src/renamed-old.ts", "src/renamed.ts");
}

async function createAdaptiveTree(workspace: string): Promise<void> {
    await Promise.all([
        mkdir(join(workspace, ".git"), { recursive: true }),
        mkdir(join(workspace, "node_modules", "package"), { recursive: true }),
        mkdir(join(workspace, "deep", "one", "two", "three"), { recursive: true }),
        mkdir(join(workspace, "generated"), { recursive: true }),
    ]);
    await Promise.all([
        writeFile(join(workspace, ".git", "HEAD"), "ref: refs/heads/main\n"),
        writeFile(join(workspace, "node_modules", "package", "index.js"), "module.exports = {};\n"),
        writeFile(join(workspace, "deep", "one", "two", "three", "file.txt"), "deep\n"),
        ...Array.from({ length: 401 }, (_, index) =>
            writeFile(
                join(workspace, "generated", `item-${String(index).padStart(3, "0")}.txt`),
                `${index}\n`,
            ),
        ),
    ]);
}

async function waitForWorkspace(
    client: GymRequestClient,
    endpoint: string,
    predicate: (workspace: WorkspaceResponse) => boolean,
    timeoutMs = 4_000,
): Promise<WorkspaceResponse> {
    const deadline = Date.now() + timeoutMs;
    let latest: WorkspaceResponse | undefined;
    while (Date.now() < deadline) {
        latest = workspace(await client.get(endpoint));
        if (predicate(latest)) return latest;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Workspace did not reach the expected state: ${JSON.stringify(latest)}`);
}

function workspace(response: Awaited<ReturnType<GymServer["get"]>>): WorkspaceResponse {
    expect(response.statusCode).toBe(200);
    return response.json().workspace as WorkspaceResponse;
}

async function git(cwd: string, ...arguments_: string[]): Promise<void> {
    await executeFile("git", arguments_, { cwd });
}

class SseFrames {
    private buffer = "";

    constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

    async next(): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const delimiter = this.buffer.indexOf("\n\n");
            if (delimiter >= 0) {
                const frame = this.buffer.slice(0, delimiter);
                this.buffer = this.buffer.slice(delimiter + 2);
                const name = /^event: ([^\n]+)$/m.exec(frame)?.[1];
                const rawData = /^data: (.*)$/m.exec(frame)?.[1];
                if (name && rawData) return { name, data: JSON.parse(rawData) };
                continue;
            }
            const result = await withTimeout(this.reader.read(), 3_000);
            if (result.done) throw new Error("SSE stream ended before the expected frame");
            this.buffer += new TextDecoder().decode(result.value, { stream: true });
        }
    }

    async until(
        predicate: (frame: { name: string; data: unknown }) => boolean,
    ): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const frame = await this.next();
            if (predicate(frame)) return frame;
        }
    }

    async cancel(): Promise<void> {
        await this.reader.cancel().catch(() => undefined);
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for an SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
