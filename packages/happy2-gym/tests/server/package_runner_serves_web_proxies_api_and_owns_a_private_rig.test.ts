import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
    defaultConfig,
    startBackendHappy2,
    startStandaloneHappy2,
    startWebHappy2,
    type RunningHappy2,
    type ServerConfig,
    type StandaloneHappy2,
} from "happy2-server";
import { describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

const execute = promisify(execFile);

describe.sequential("the package runner", () => {
    it("runs the backend and web gateway independently from the same package", async () => {
        await withSigningEnvironment(async () => {
            const fixture = await createFixture(false);
            let backend: RunningHappy2 | undefined;
            let web: RunningHappy2 | undefined;
            try {
                fixture.config.server.trustedProxyHops = 1;
                backend = await startBackendHappy2(fixture.config, { logger: false });
                web = await startWebHappy2({
                    backendUrl: backend.url,
                    host: "127.0.0.1",
                    logger: false,
                    port: 0,
                    webRoot: fixture.webRoot,
                });

                const backendRoot = await fetch(backend.url);
                expect(backendRoot.status).toBe(200);
                expect(await backendRoot.json()).toEqual({ service: "happy2", status: "ok" });
                expect((await fetch(`${backend.url}/assets/fixture.txt`)).status).toBe(404);

                const webRoot = await fetch(web.url);
                expect(webRoot.status).toBe(200);
                expect(await webRoot.text()).toContain("Happy (2) packaged web fixture");
                const methods = await fetch(`${web.url}/v0/auth/methods`);
                expect(methods.status).toBe(200);
                expect(await methods.json()).toEqual({
                    role: "all",
                    method: "password",
                    devTokensEnabled: false,
                    signupEnabled: true,
                    registration: "bootstrap",
                });

                const token = await registerUser(web.url);
                const upload = await uploadLargeFile(web.url, token);
                expect(upload.status).toBe(201);
                expect(((await upload.json()) as { file: { size: number } }).file.size).toBe(
                    1_100_000,
                );
            } finally {
                await web?.close();
                await backend?.close();
                await rm(fixture.directory, { force: true, recursive: true });
            }
        });
    });

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
                    devTokensEnabled: false,
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

    it("verifies a development token at the web proxy before issuing its HttpOnly cookie", async () => {
        await withSigningEnvironment(async () => {
            const fixture = await createFixture(false);
            let backend: RunningHappy2 | undefined;
            let web: RunningHappy2 | undefined;
            try {
                fixture.config.auth.devTokens.enabled = true;
                fixture.config.server.trustedProxyHops = 1;
                backend = await startBackendHappy2(fixture.config, { logger: false });
                web = await startWebHappy2({
                    backendUrl: backend.url,
                    host: "127.0.0.1",
                    logger: false,
                    port: 0,
                    trustedProxyHops: 1,
                    webRoot: fixture.webRoot,
                });
                const missingSession = await fetch(`${web.url}/v0/auth/web/session`);
                expect(missingSession.status).toBe(401);
                expect(missingSession.headers.get("set-cookie")).toBeNull();
                const malformedSession = await fetch(`${web.url}/v0/auth/web/session`, {
                    headers: { authorization: "Bearer invalid token" },
                });
                expect(malformedSession.status).toBe(401);
                expect(malformedSession.headers.get("set-cookie")).toBeNull();
                const fallback = await fetch(`${web.url}/chats/from-web-gateway`, {
                    headers: { accept: "text/html" },
                });
                expect(fallback.status).toBe(200);
                expect(await fallback.text()).toContain("Happy (2) packaged web fixture");
                expect(
                    (
                        await fetch(`${web.url}/chats/from-web-gateway`, {
                            method: "HEAD",
                            headers: { accept: "text/html" },
                        })
                    ).status,
                ).toBe(200);
                expect((await fetch(`${web.url}/not-a-route`)).status).toBe(404);
                expect((await fetch(`${backend.url}/v0/auth/web/session`)).status).toBe(401);
                const sessionToken = await registerUser(web.url);
                const directSessionLookup = await fetch(`${web.url}/v0/me`, {
                    headers: { authorization: `Bearer ${sessionToken}` },
                });
                expect(directSessionLookup.status).toBe(200);
                expect(directSessionLookup.headers.get("set-cookie")).toBeNull();
                const backendSessionVerification = await fetch(
                    `${backend.url}/v0/auth/web/session`,
                    { headers: { authorization: `Bearer ${sessionToken}` } },
                );
                expect(backendSessionVerification.status).toBe(200);
                expect(await backendSessionVerification.json()).toMatchObject({
                    user: { username: "package_runner" },
                });
                const sessionVerified = await fetch(`${web.url}/v0/auth/web/session`, {
                    headers: { authorization: `Bearer ${sessionToken}` },
                });
                expect(sessionVerified.status).toBe(200);
                const sessionCookie = sessionVerified.headers.get("set-cookie");
                expect(sessionCookie).toBe(
                    `happy2_auth_token=${sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=34560000`,
                );
                expect(
                    (
                        await fetch(`${web.url}/v0/me`, {
                            headers: { cookie: sessionCookie! },
                        })
                    ).status,
                ).toBe(200);
                const created = await fetch(`${web.url}/v0/me/createDevToken`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${sessionToken}` },
                });
                expect(created.status).toBe(201);
                const developmentToken = ((await created.json()) as { token: string }).token;

                const directDevelopmentLookup = await fetch(`${web.url}/v0/me`, {
                    headers: { authorization: `Bearer ${developmentToken}` },
                });
                expect(directDevelopmentLookup.status).toBe(200);
                expect(directDevelopmentLookup.headers.get("set-cookie")).toBeNull();
                const verified = await fetch(`${web.url}/v0/auth/web/session`, {
                    headers: { authorization: `Bearer ${developmentToken}` },
                });
                expect(verified.status).toBe(200);
                const cookie = verified.headers.get("set-cookie");
                expect(cookie).toBe(
                    `happy2_auth_token=${developmentToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=34560000`,
                );

                const cookieAuthenticated = await fetch(`${web.url}/v0/me`, {
                    headers: { cookie: cookie! },
                });
                expect(cookieAuthenticated.status).toBe(200);

                const secureSession = await fetch(`${web.url}/v0/auth/web/session`, {
                    headers: {
                        authorization: `Bearer ${sessionToken}`,
                        "x-forwarded-proto": "https",
                    },
                });
                expect(secureSession.status).toBe(200);
                expect(secureSession.headers.get("set-cookie")).toContain("; Secure");

                await web.close();
                await web.close();
                web = undefined;
            } finally {
                await web?.close();
                await backend?.close();
                await rm(fixture.directory, { force: true, recursive: true });
            }
        });
    });

    it("rejects malformed backend origins before starting the web gateway", async () => {
        for (const backendUrl of [
            "not-an-origin",
            "ftp://example.com",
            "http://user@example.com",
            "http://user:password@example.com",
            "http://example.com/path",
            "http://example.com/?query=1",
            "http://example.com/#fragment",
        ]) {
            await expect(startWebHappy2({ backendUrl, logger: false })).rejects.toThrow(
                /absolute HTTP|HTTP\(S\) origin/,
            );
        }
    });

    it("routes preview hosts and authenticated handoffs through the split web gateway", async () => {
        const webRoot = await mkdtemp(join(tmpdir(), "happy2-web-port-sharing-"));
        await writeFile(join(webRoot, "index.html"), "<!doctype html><title>Gateway</title>\n");
        let handoffRequest:
            | { cookie: string | undefined; forwardedHost: string | undefined; url: string }
            | undefined;
        const upstream = createServer((request, response) => {
            if (request.url?.startsWith("/v0/portShares/share-123/openPortShare")) {
                handoffRequest = {
                    cookie: request.headers.cookie,
                    forwardedHost: request.headers["x-forwarded-host"] as string | undefined,
                    url: request.url,
                };
                response.statusCode = 302;
                response.setHeader("cache-control", "no-store");
                response.setHeader("referrer-policy", "no-referrer");
                response.setHeader(
                    "location",
                    "https://demo.preview.example.com/.happy2/auth/redeem?token=redemption",
                );
                response.end();
                return;
            }
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ host: request.headers.host, url: request.url }));
        });
        const upstreamWebSockets = new WebSocketServer({ server: upstream });
        upstreamWebSockets.on("connection", (socket, request) => {
            socket.on("message", (message) => {
                socket.send(`${request.headers.host}:${message.toString()}`);
            });
        });
        await new Promise<void>((resolve, reject) => {
            upstream.once("error", reject);
            upstream.listen(0, "127.0.0.1", resolve);
        });
        let web: RunningHappy2 | undefined;
        try {
            const address = upstream.address() as AddressInfo;
            web = await startWebHappy2({
                backendUrl: `http://127.0.0.1:${address.port}`,
                logger: false,
                port: 0,
                portSharingDomain: "*.Preview.Example.com.",
                webRoot,
            });
            const handoff = await fetch(
                `${web.url}/preview-link/share-123?returnTo=%2Fpreview%3Fmode%3D1`,
                {
                    headers: { cookie: "happy2_auth_token=user-bound-token" },
                    redirect: "manual",
                },
            );
            expect(handoff.status).toBe(302);
            expect(handoff.headers.get("cache-control")).toBe("no-store");
            expect(handoff.headers.get("referrer-policy")).toBe("no-referrer");
            expect(handoff.headers.get("location")).toBe(
                "https://demo.preview.example.com/.happy2/auth/redeem?token=redemption",
            );
            expect(handoffRequest).toEqual({
                cookie: "happy2_auth_token=user-bound-token",
                forwardedHost: new URL(web.url).host,
                url: "/v0/portShares/share-123/openPortShare?returnTo=%2Fpreview%3Fmode%3D1",
            });
            const proxied = await requestWithHost(
                web.url,
                "my-demo-a1b2c3.preview.example.com",
                "/demo?theme=dark",
            );
            expect(proxied.statusCode).toBe(200);
            expect(JSON.parse(proxied.body)).toEqual({
                host: "my-demo-a1b2c3.preview.example.com",
                url: "/demo?theme=dark",
            });
            const reservedPathOnPreview = await requestWithHost(
                web.url,
                "my-demo-a1b2c3.preview.example.com",
                "/preview-link/share-123?returnTo=%2Finside-preview",
            );
            expect(reservedPathOnPreview.statusCode).toBe(200);
            expect(JSON.parse(reservedPathOnPreview.body)).toEqual({
                host: "my-demo-a1b2c3.preview.example.com",
                url: "/preview-link/share-123?returnTo=%2Finside-preview",
            });
            expect(
                await websocketWithHost(
                    web.url,
                    "my-demo-a1b2c3.preview.example.com",
                    "/socket",
                    "hello",
                ),
            ).toBe("my-demo-a1b2c3.preview.example.com:hello");
            expect(
                (
                    await requestWithHost(
                        web.url,
                        "nested.my-demo-a1b2c3.preview.example.com",
                        "/demo",
                    )
                ).statusCode,
            ).toBe(404);
        } finally {
            await web?.close();
            await new Promise<void>((resolve) => upstreamWebSockets.close(() => resolve()));
            await new Promise<void>((resolve) => upstream.close(() => resolve()));
            await rm(webRoot, { force: true, recursive: true });
        }
    });

    it("rejects port sharing when the backend has no agent service", async () => {
        await withSigningEnvironment(async () => {
            const fixture = await createFixture(false);
            fixture.config.portSharing = {
                publicDomain: "preview.example.com",
                publicUrl: "https://preview.example.com",
            };
            try {
                await expect(startBackendHappy2(fixture.config, { logger: false })).rejects.toThrow(
                    "requires the agent service",
                );
            } finally {
                await rm(fixture.directory, { force: true, recursive: true });
            }
        });
    });

    it("falls back to binary content when an upstream response omits its content type", async () => {
        const webRoot = await mkdtemp(join(tmpdir(), "happy2-web-content-type-"));
        await writeFile(join(webRoot, "index.html"), "<!doctype html><title>Gateway</title>\n");
        const upstream = createServer((_request, response) => {
            response.statusCode = 418;
            response.end("upstream response");
        });
        await new Promise<void>((resolve, reject) => {
            upstream.once("error", reject);
            upstream.listen(0, "127.0.0.1", resolve);
        });
        let web: RunningHappy2 | undefined;
        try {
            const address = upstream.address() as AddressInfo;
            web = await startWebHappy2({
                backendUrl: `http://127.0.0.1:${address.port}`,
                port: 0,
                webRoot,
            });
            const response = await fetch(`${web.url}/v0/auth/web/session`);
            expect(response.status).toBe(418);
            expect(response.headers.get("content-type")).toBe("application/octet-stream");
            expect(await response.text()).toBe("upstream response");
        } finally {
            await web?.close();
            await new Promise<void>((resolve) => upstream.close(() => resolve()));
            await rm(webRoot, { force: true, recursive: true });
        }
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
                expect(await readFile(join(fixture.rigDirectory, "runtime.toml"), "utf8")).toBe(
                    `[settings]\ndurable_global_event_queue = true\nhappy_integration = false\n`,
                );
                expect((await readFile(fixture.config.agents.tokenPath, "utf8")).trim()).not.toBe(
                    "",
                );
                await running.close();
                running = undefined;
                await expect(stat(fixture.config.agents.socketPath)).rejects.toMatchObject({
                    code: "ENOENT",
                });
            } finally {
                await running?.close();
                await stopRig(fixture.config, fixture.rigDirectory);
                await rm(fixture.directory, { force: true, recursive: true });
            }
        });
    });

    it("owns a private Rig whose daemon uses short desktop endpoints", async () => {
        await withSigningEnvironment(async () => {
            const fixture = await createFixture(true);
            // Unix-domain socket paths are limited to roughly 100 bytes on macOS.
            const desktopRigEndpoints = await mkdtemp(join(tmpdir(), "h2r-"));
            const invocationsPath = join(fixture.directory, "rig-invocations.jsonl");
            const wrapperPath = join(fixture.directory, "rig-wrapper.mjs");
            const bundledRigMain = fixture.config.agents.command.replace(
                /\/main\.js$/,
                "/app/main.js",
            );
            await writeFile(
                wrapperPath,
                `#!/usr/bin/env node
import { appendFile } from "node:fs/promises";
import { main } from ${JSON.stringify(pathToFileURL(bundledRigMain).href)};
await appendFile(${JSON.stringify(invocationsPath)}, JSON.stringify({
    arguments: process.argv.slice(2),
    disableHappySync: process.env.RIG_DISABLE_HAPPY_SYNC,
    rigHome: process.env.RIG_HOME,
    socketPath: process.env.RIG_SERVER_SOCKET_PATH,
}) + "\\n");
await main(process.argv.slice(2));
`,
                { mode: 0o700 },
            );
            fixture.config.agents.socketPath = join(desktopRigEndpoints, "server.sock");
            fixture.config.agents.tokenPath = join(desktopRigEndpoints, "token");
            fixture.config.agents.command = wrapperPath;
            let running: StandaloneHappy2 | undefined;
            try {
                running = await startStandaloneHappy2(fixture.config, {
                    logger: false,
                    webRoot: fixture.webRoot,
                });

                expect(await readFile(join(fixture.rigDirectory, "runtime.toml"), "utf8")).toBe(
                    `[settings]\ndurable_global_event_queue = true\nhappy_integration = false\n`,
                );
                await expect(
                    stat(join(fixture.rigDirectory, "sessions.sqlite")),
                ).resolves.toBeDefined();
                await expect(stat(fixture.config.agents.socketPath)).resolves.toBeDefined();
                const invocations = (await readFile(invocationsPath, "utf8"))
                    .trim()
                    .split("\n")
                    .map(
                        (line) =>
                            JSON.parse(line) as {
                                arguments: string[];
                                disableHappySync?: string;
                                rigHome?: string;
                                socketPath?: string;
                            },
                    );
                expect(invocations).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            arguments: ["daemon", "start"],
                            disableHappySync: "1",
                            rigHome: fixture.rigDirectory,
                            socketPath: fixture.config.agents.socketPath,
                        }),
                        expect.objectContaining({
                            arguments: ["--server"],
                            disableHappySync: "1",
                            rigHome: fixture.rigDirectory,
                            socketPath: fixture.config.agents.socketPath,
                        }),
                    ]),
                );
                await running.close();
                running = undefined;
                const shutdownInvocations = (await readFile(invocationsPath, "utf8"))
                    .trim()
                    .split("\n")
                    .map(
                        (line) =>
                            JSON.parse(line) as {
                                arguments: string[];
                                disableHappySync?: string;
                                rigHome?: string;
                                socketPath?: string;
                            },
                    );
                expect(shutdownInvocations).toContainEqual(
                    expect.objectContaining({
                        arguments: ["daemon", "stop"],
                        disableHappySync: "1",
                        rigHome: fixture.rigDirectory,
                        socketPath: fixture.config.agents.socketPath,
                    }),
                );
            } finally {
                await running?.close();
                await stopRig(fixture.config, fixture.rigDirectory);
                await rm(desktopRigEndpoints, { force: true, recursive: true });
                await rm(fixture.directory, { force: true, recursive: true });
            }
        });
    }, 15_000);
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

async function requestWithHost(
    serverUrl: string,
    host: string,
    path: string,
): Promise<{ body: string; statusCode: number }> {
    const address = new URL(serverUrl);
    return new Promise((resolve, reject) => {
        const request = httpRequest(
            {
                host: address.hostname,
                port: Number(address.port),
                path,
                headers: { host },
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
                response.on("end", () =>
                    resolve({
                        body: Buffer.concat(chunks).toString("utf8"),
                        statusCode: response.statusCode ?? 0,
                    }),
                );
            },
        );
        request.once("error", reject);
        request.end();
    });
}

async function websocketWithHost(
    serverUrl: string,
    host: string,
    path: string,
    message: string,
): Promise<string> {
    const url = new URL(path, serverUrl);
    url.protocol = "ws:";
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { headers: { host } });
        socket.once("open", () => socket.send(message));
        socket.once("message", (reply) => {
            socket.close();
            resolve(reply.toString());
        });
        socket.once("error", reject);
    });
}

async function uploadLargeFile(baseUrl: string, token: string): Promise<Response> {
    const boundary = "happy2-package-runner-large-upload";
    return fetch(`${baseUrl}/v0/files/upload`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: Buffer.concat([
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.txt"\r\nContent-Type: text/plain\r\n\r\n`,
            ),
            Buffer.alloc(1_100_000, "x"),
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
    });
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
