import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProtocolHttpClient } from "@slopus/rig-client-runtime/dist/client/index.js";
import {
    discoveryOutputParse,
    localRigConnectorCreate,
    rigLoginEnvironmentDiscover,
    RigCommandMissingError,
    RigDaemonIncompatibleError,
    rigVersionParse,
    type RigProcessHost,
} from "./localRig";

const directories: string[] = [];
afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
});

describe("normal Rig discovery", () => {
    it("uses the login shell machine record and validates the executable directly", async () => {
        const host: RigProcessHost = {
            execFile: vi
                .fn()
                .mockResolvedValueOnce({
                    stdout: "shell banner\n__HAPPY2_RIG_PATH__=/opt/volta/bin/rig\0PATH=/opt/volta/bin:/usr/bin\0VOLTA_HOME=/opt/volta\0",
                    stderr: "",
                })
                .mockResolvedValueOnce({ stdout: "Rig 0.0.45\n", stderr: "" }),
        };

        const result = await rigLoginEnvironmentDiscover(
            host,
            { HOME: "/Users/ada", SHELL: "/bin/zsh" },
            "/bin/zsh",
        );

        expect(result).toEqual({
            command: "/opt/volta/bin/rig",
            environment: {
                PATH: "/opt/volta/bin:/usr/bin",
                VOLTA_HOME: "/opt/volta",
            },
            shell: "/bin/zsh",
            version: "0.0.45",
        });
        expect(host.execFile).toHaveBeenNthCalledWith(2, "/opt/volta/bin/rig", ["--version"], {
            env: result.environment,
        });
    });

    it("distinguishes missing, malformed-path, and malformed-version results", async () => {
        expect(() => discoveryOutputParse("__HAPPY2_RIG_PATH__=\0PATH=/usr/bin\0")).not.toThrow();
        expect(() =>
            discoveryOutputParse("__HAPPY2_RIG_PATH__=relative/rig\0PATH=/usr/bin\0"),
        ).toThrow("invalid Rig executable path");
        expect(() => rigVersionParse("rig version main")).toThrow("invalid version");

        const host: RigProcessHost = {
            execFile: vi.fn(async () => ({
                stdout: "__HAPPY2_RIG_PATH__=\0PATH=/usr/bin\0",
                stderr: "",
            })),
        };
        await expect(
            rigLoginEnvironmentDiscover(host, { SHELL: "/bin/zsh" }, "/bin/zsh"),
        ).rejects.toBeInstanceOf(RigCommandMissingError);
    });

    it("starts only an absent daemon and rejects a mismatched running version", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-local-rig-"));
        directories.push(root);
        const tokenPath = join(root, "token");
        const socketPath = join(root, "server.sock");
        const environment = {
            PATH: "/usr/local/bin:/usr/bin",
            RIG_SERVER_TOKEN_PATH: tokenPath,
            RIG_SERVER_SOCKET_PATH: socketPath,
        };
        const host: RigProcessHost = {
            execFile: vi.fn(async (executable, arguments_) => {
                if (executable === "/bin/zsh")
                    return {
                        stdout: `__HAPPY2_RIG_PATH__=/usr/local/bin/rig\0${Object.entries(
                            environment,
                        )
                            .map(([key, value]) => `${key}=${value}\0`)
                            .join("")}`,
                        stderr: "",
                    };
                if (arguments_[0] === "--version") return { stdout: "Rig 0.0.45\n", stderr: "" };
                await writeFile(tokenPath, "token\n");
                return { stdout: "Daemon is running.\n", stderr: "" };
            }),
        };
        const health = vi.fn().mockResolvedValue({
            status: "ready",
            healthy: true,
            ready: true,
            identity: { version: "0.0.45" },
            catalog: {
                defaultModelId: "model",
                defaultProviderId: "provider",
                models: [],
                providers: [],
            },
            durableGlobalEventQueue: true,
        });
        const connector = localRigConnectorCreate({
            host,
            environment: { SHELL: "/bin/zsh" },
            configuredShell: "/bin/zsh",
            wait: async () => undefined,
            clientCreate: () => ({ health }) as unknown as ProtocolHttpClient,
        });

        const connection = await connector.connect();
        connection.close();
        expect(host.execFile).toHaveBeenCalledWith("/usr/local/bin/rig", ["daemon", "start"], {
            env: environment,
        });

        health.mockRejectedValueOnce(new Error("stale socket")).mockResolvedValueOnce({
            status: "ready",
            healthy: true,
            ready: true,
            identity: { version: "0.0.45" },
            catalog: {
                defaultModelId: "model",
                defaultProviderId: "provider",
                models: [],
                providers: [],
            },
            durableGlobalEventQueue: true,
        });
        await connector.connect();
        expect(
            vi
                .mocked(host.execFile)
                .mock.calls.filter(
                    ([executable, arguments_]) =>
                        executable === "/usr/local/bin/rig" && arguments_[0] === "daemon",
                ),
        ).toHaveLength(2);

        health.mockResolvedValue({
            status: "ready",
            healthy: true,
            ready: true,
            identity: { version: "0.0.32" },
            catalog: {
                defaultModelId: "model",
                defaultProviderId: "provider",
                models: [],
                providers: [],
            },
            durableGlobalEventQueue: true,
        });
        await expect(connector.connect()).rejects.toBeInstanceOf(RigDaemonIncompatibleError);
    });
});
