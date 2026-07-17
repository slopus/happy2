import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
    defaultConfig,
    startStandaloneHappy2,
    type ServerConfig,
    type StandaloneHappy2,
} from "happy2-server";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

describe.sequential("the package runner", () => {
    it("serves the built SPA and streams the versioned server API through one origin", async () => {
        await withSigningEnvironment(async () => {
            const fixture = await createFixture(false);
            let running: StandaloneHappy2 | undefined;
            try {
                running = await startStandaloneHappy2(fixture.config, {
                    logger: false,
                    webRoot: fixture.webRoot,
                });

                const index = await fetch(running.url, { headers: { accept: "text/html" } });
                expect(index.status).toBe(200);
                expect(await index.text()).toContain("Happy (2) packaged web fixture");

                const asset = await fetch(`${running.url}/assets/fixture.txt`);
                expect(asset.status).toBe(200);
                expect(await asset.text()).toBe("packaged asset\n");

                const fallback = await fetch(`${running.url}/chats/agent-work`, {
                    headers: { accept: "text/html" },
                });
                expect(fallback.status).toBe(200);
                expect(await fallback.text()).toContain("Happy (2) packaged web fixture");

                const methods = await fetch(`${running.url}/v0/auth/methods`);
                expect(methods.status).toBe(200);
                expect(await methods.json()).toEqual({
                    role: "all",
                    method: "password",
                    signupEnabled: true,
                    registration: "bootstrap",
                });

                const missingApi = await fetch(`${running.url}/v0/not-a-route`, {
                    headers: { accept: "text/html" },
                });
                expect(missingApi.status).toBe(404);
                expect(missingApi.headers.get("content-type")).toContain("application/json");

                const token = await registerUser(running.url);
                const abort = new AbortController();
                const events = await fetch(`${running.url}/v0/sync/events`, {
                    headers: {
                        accept: "text/event-stream",
                        authorization: `Bearer ${token}`,
                    },
                    signal: abort.signal,
                });
                expect(events.status).toBe(200);
                expect(events.headers.get("content-type")).toContain("text/event-stream");
                const firstFrame = await events.body!.getReader().read();
                abort.abort();
                expect(new TextDecoder().decode(firstFrame.value)).toContain("event: ready");
            } finally {
                await running?.close();
                await rm(fixture.directory, { force: true, recursive: true });
            }
        });
    });

    it("starts the bundled Rig daemon with package-private socket, token, and session state", async () => {
        await withSigningEnvironment(async () => {
            const fixture = await createFixture(true);
            let running: StandaloneHappy2 | undefined;
            try {
                running = await startStandaloneHappy2(fixture.config, {
                    logger: false,
                    webRoot: fixture.webRoot,
                });

                expect(fixture.config.agents.command).not.toBe("rig");
                expect(fixture.config.agents.command).toContain(
                    "node_modules/@slopus/rig/dist/main.js",
                );
                expect((await stat(fixture.rigDirectory)).mode & 0o777).toBe(0o700);
                await expect(stat(fixture.config.agents.socketPath)).resolves.toBeDefined();
                await expect(stat(fixture.config.agents.tokenPath)).resolves.toBeDefined();
                await expect(
                    stat(join(fixture.rigDirectory, "sessions.sqlite")),
                ).resolves.toBeDefined();
                expect(
                    await readFile(join(fixture.rigDirectory, "runtime.toml"), "utf8"),
                ).toContain("durable_global_event_queue = true");
                expect((await readFile(fixture.config.agents.tokenPath, "utf8")).trim()).not.toBe(
                    "",
                );
            } finally {
                await running?.close();
                await stopRig(fixture.config, fixture.rigDirectory);
                await rm(fixture.directory, { force: true, recursive: true });
            }
        });
    });
});

async function createFixture(agentsEnabled: boolean): Promise<{
    config: ServerConfig;
    directory: string;
    rigDirectory: string;
    webRoot: string;
}> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-package-runner-"));
    const webRoot = join(directory, "web");
    const rigDirectory = join(directory, "rig");
    await mkdir(join(webRoot, "assets"), { recursive: true });
    await writeFile(
        join(webRoot, "index.html"),
        "<!doctype html><title>Happy (2) packaged web fixture</title>\n",
    );
    await writeFile(join(webRoot, "assets", "fixture.txt"), "packaged asset\n");

    const config = defaultConfig();
    config.server.host = "127.0.0.1";
    config.server.port = 0;
    config.server.publicUrl = "http://127.0.0.1";
    config.database.url = `file:${join(directory, "happy2.db")}`;
    config.files.directory = join(directory, "files");
    config.jwt.issuer = "http://127.0.0.1";
    config.agents.enabled = agentsEnabled;
    config.agents.directory = rigDirectory;
    config.agents.socketPath = join(rigDirectory, "server.sock");
    config.agents.tokenPath = join(rigDirectory, "token");
    config.agents.defaultCwd = join(directory, "workspaces");
    return { config, directory, rigDirectory, webRoot };
}

async function registerUser(baseUrl: string): Promise<string> {
    const registration = await fetch(`${baseUrl}/v0/auth/password/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "runner@gym.invalid", password: "runner-password-123" }),
    });
    expect(registration.status).toBe(201);
    const temporaryToken = ((await registration.json()) as { token: string }).token;
    const profile = await fetch(`${baseUrl}/v0/me/createProfile`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${temporaryToken}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            firstName: "Package",
            username: "package_runner",
            email: "runner@gym.invalid",
        }),
    });
    expect(profile.status).toBe(201);
    return temporaryToken;
}

async function stopRig(config: ServerConfig, rigDirectory: string): Promise<void> {
    await execute(config.agents.command, ["daemon", "stop"], {
        env: {
            ...process.env,
            RIG_HOME: rigDirectory,
            RIG_SERVER_DIRECTORY: "",
            RIG_SERVER_SOCKET_PATH: config.agents.socketPath,
            RIG_SERVER_TOKEN_PATH: config.agents.tokenPath,
        },
    }).catch(() => undefined);
}

async function withSigningEnvironment<T>(run: () => Promise<T>): Promise<T> {
    const pair = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const values = {
        HAPPY2_JWT_PRIVATE_KEY_B64: Buffer.from(pair.privateKey).toString("base64"),
        HAPPY2_JWT_PUBLIC_KEY_B64: Buffer.from(pair.publicKey).toString("base64"),
        HAPPY2_PASSWORD_PEPPER: "package-runner-gym-pepper",
        HAPPY2_INTEGRATION_SECRET: Buffer.alloc(32, 7).toString("base64"),
    };
    const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.assign(process.env, values);
    try {
        return await run();
    } finally {
        for (const [key, value] of previous) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}
