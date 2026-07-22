import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DESKTOP_LOCAL_ACCESS_TOKEN_ENV,
    type ServerProcessStart,
} from "../shared/serverProcessContract";
import { desktopServerConfigToml } from "./desktopServerConfig";
import { serverChildEnvironment } from "./serverChild";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("desktop-owned server configuration", () => {
    it("always configures a loopback embedded server with account-free capability access", () => {
        const root = "/tmp/happy2-topology-local";
        const source = desktopServerConfigToml(serverStart(root), {
            pluginHostPort: 41001,
            publicUrl: "http://127.0.0.1",
            serverPort: 0,
        });
        expect(source).toContain('[server]\nrole = "all"\nhost = "127.0.0.1"');
        expect(source).toContain('public_url = "http://127.0.0.1"');
        expect(source).toContain("trusted_proxy_hops = 0");
        expect(source).toContain(
            `[auth.local]\nenabled = true\ntoken_env = "${DESKTOP_LOCAL_ACCESS_TOKEN_ENV}"`,
        );
        expect(source).toContain("[auth.password]\nenabled = false");
        expect(source).toContain("[auth.magic_link]\nenabled = false");
        expect(source).not.toContain("cloudflare");
        expect(source).toContain("[auth.dev_tokens]\nenabled = false");
        expect(source).toContain(`url = "file:${join(root, "happy2.db")}"`);
        expect(source).toContain('daemon_mode = "managed"');
        expect(source).toContain(`directory = "${join(root, "rig")}"`);
        expect(source).toContain(`default_cwd = "${join(root, "workspaces")}"`);
        expect(source).toContain('socket_path = "/tmp/happy2-rig-private/server.sock"');
        expect(source).not.toContain('daemon_mode = "attached"');
    });

    it("places the capability only in local server child environments", () => {
        vi.stubEnv(DESKTOP_LOCAL_ACCESS_TOKEN_ENV, "ambient-value-must-not-leak");

        expect(serverChildEnvironment()[DESKTOP_LOCAL_ACCESS_TOKEN_ENV]).toBeUndefined();
        expect(
            serverChildEnvironment("generated-local-capability")[DESKTOP_LOCAL_ACCESS_TOKEN_ENV],
        ).toBe("generated-local-capability");
    });
});

function serverStart(runtimeRoot: string): ServerProcessStart {
    return {
        configPath: join(runtimeRoot, "happy2.toml"),
        errorLogPath: join(runtimeRoot, "server-errors.log"),
        rigEndpointRoot: "/tmp/happy2-rig-private",
        runtimeRoot,
        webRoot: join(runtimeRoot, "web"),
    };
}
