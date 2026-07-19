import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { parseConfig } from "./loader.js";

const base = `[server]
role = "all"
host = "127.0.0.1"
port = 3000
public_url = "https://happy2.example"

[database]
url = "file:/tmp/happy2.db"

[jwt]
issuer = "https://happy2.example"
audience = "happy2"
key_id = "test"
`;

describe("TOML config", () => {
    it("loads one selected authentication mechanism", () => {
        const config = parseConfig(`${base}
[auth.oidc.example]
enabled = true
discovery_url = "https://id.example/.well-known/openid-configuration"
client_id = "client"
client_secret_env = "OIDC_SECRET"
redirect_path = "/v0/auth/oidc/example/callback"
`);
        expect(config.auth.password.enabled).toBe(false);
        expect(config.auth.oidc.get("example")?.clientSecretEnv).toBe("OIDC_SECRET");
        expect(config.auth.devTokens.enabled).toBe(false);
        expect(config.agents).toMatchObject({
            directory: join(process.cwd(), ".happy2", "rig"),
            defaultCwd: join(process.cwd(), ".happy2", "workspaces"),
        });
        expect(config.files.directory).toBe(join(process.cwd(), ".happy2", "files"));
    });

    it("loads dev tokens independently of the selected authentication mechanism", () => {
        const config = parseConfig(`${base}
[auth.password]
enabled = true

[auth.dev_tokens]
enabled = true
`);
        expect(config.auth.password.enabled).toBe(true);
        expect(config.auth.devTokens).toEqual({ enabled: true });
    });

    it("rejects more than one enabled authentication mechanism", () => {
        expect(() =>
            parseConfig(`${base}
[auth.password]
enabled = true

[auth.magic_link]
enabled = true
redirect_url = "happy2://auth/magic-link"
`),
        ).toThrow("only one authentication method");
        expect(() =>
            parseConfig(`${base}
[auth.password]
enabled = true

[auth.cloudflare_access]
enabled = true
team_domain = "https://happy.cloudflareaccess.com"
audience = "cloudflare-access-audience"
`),
        ).toThrow("only one authentication method");
    });

    it("loads a Cloudflare Access application and rejects unsafe team domains", () => {
        const config = parseConfig(`${base}
[auth.cloudflare_access]
enabled = true
team_domain = "https://happy.cloudflareaccess.com"
audience = "cloudflare-access-audience"
`);
        expect(config.auth.cloudflareAccess).toEqual({
            enabled: true,
            teamDomain: "https://happy.cloudflareaccess.com",
            audience: "cloudflare-access-audience",
        });
        expect(() =>
            parseConfig(`${base}
[auth.cloudflare_access]
enabled = true
team_domain = "https://cloudflareaccess.com.evil.example"
audience = "cloudflare-access-audience"
`),
        ).toThrow("team_domain");
    });

    it("requires a desktop callback when magic links are enabled", () => {
        expect(() =>
            parseConfig(`${base}
[auth.magic_link]
enabled = true
`),
        ).toThrow("redirect_url");
    });

    it("loads file pipeline limits and scanner policy", () => {
        const config = parseConfig(`${base}
[files]
provider = "local"
resumable_chunk_bytes = 1048576
per_user_quota_bytes = 5368709120
server_quota_bytes = 107374182400
malware_scanner_command = "/usr/bin/scanner"
malware_scanner_arguments = ["--quiet", "{path}"]
malware_scan_failure_mode = "allow"
`);
        expect(config.files).toMatchObject({
            provider: "local",
            resumableChunkBytes: 1048576,
            perUserQuotaBytes: 5368709120,
            serverQuotaBytes: 107374182400,
            malwareScannerCommand: "/usr/bin/scanner",
            malwareScannerArguments: ["--quiet", "{path}"],
            malwareScanFailureMode: "allow",
        });
    });

    it("loads a dedicated fixed plugin host API listener", () => {
        const config = parseConfig(`${base}
[plugins]
host_api_host = "0.0.0.0"
host_api_port = 43123
`);
        expect(config.plugins).toMatchObject({
            hostApiHost: "0.0.0.0",
            hostApiPort: 43123,
        });
        expect(() =>
            parseConfig(`${base}
[plugins]
host_api_port = 3000
`),
        ).toThrow("must differ from server.port");
    });

    it("rejects unsafe file pipeline limits", () => {
        expect(() =>
            parseConfig(`${base}
[files]
resumable_chunk_bytes = 1
`),
        ).toThrow("resumable_chunk_bytes");
    });
});
