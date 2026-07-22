import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { defaultConfig } from "./defaults.js";
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
    it("merges a partial config over every nested standalone default", () => {
        const defaults = defaultConfig("/srv/happy");
        const config = parseConfig(
            `[server]
host = "0.0.0.0"
port = 4100

[security.rate_limit]
writes_per_minute = 777
`,
            defaults,
        );

        expect(config).toEqual({
            ...defaults,
            server: {
                ...defaults.server,
                host: "0.0.0.0",
                port: 4100,
            },
            security: {
                ...defaults.security,
                rateLimit: {
                    ...defaults.security.rateLimit,
                    writesPerMinute: 777,
                },
            },
        });
    });

    it("loads one selected authentication mechanism", () => {
        const config = parseConfig(`${base}
[auth.password]
enabled = false

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

    it("loads explicit managed and attached Rig daemon ownership", () => {
        expect(
            parseConfig(`${base}
[agents]
daemon_mode = "attached"
directory = "/srv/private-rig"
`).agents,
        ).toMatchObject({ daemonMode: "attached", directory: "/srv/private-rig" });
        expect(() =>
            parseConfig(`${base}
[agents]
daemon_mode = "global"
`),
        ).toThrow("agents.daemon_mode");
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

    it("accepts account-free local access only on an isolated loopback server", () => {
        const config = parseConfig(`[server]
role = "all"
host = "127.0.0.1"
port = 47831
public_url = "http://127.0.0.1:47831"
trusted_proxy_hops = 0

[auth.local]
enabled = true
token_env = "HAPPY2_DESKTOP_LOCAL_TOKEN"

[auth.password]
enabled = false
`);
        expect(config.auth.local).toEqual({
            enabled: true,
            tokenEnv: "HAPPY2_DESKTOP_LOCAL_TOKEN",
        });

        for (const source of [
            `[server]
host = "0.0.0.0"
public_url = "http://127.0.0.1:47831"
[auth.local]
enabled = true
[auth.password]
enabled = false
`,
            `[server]
host = "127.0.0.1"
public_url = "https://happy.example.test"
[auth.local]
enabled = true
[auth.password]
enabled = false
`,
            `[server]
host = "127.0.0.1"
public_url = "http://127.0.0.1:47831"
[auth.local]
enabled = true
[auth.password]
enabled = true
`,
            `[server]
host = "127.0.0.1"
public_url = "http://127.0.0.1:47831"
trusted_proxy_hops = 1
[auth.local]
enabled = true
[auth.password]
enabled = false
`,
            `[server]
role = "auth"
host = "127.0.0.1"
public_url = "http://127.0.0.1:47831"
[auth.local]
enabled = true
[auth.password]
enabled = false
`,
            `[server]
host = "127.0.0.1"
public_url = "http://127.0.0.1:47831"
[auth.local]
enabled = true
[auth.password]
enabled = false
[auth.dev_tokens]
enabled = true
`,
        ])
            expect(() => parseConfig(source)).toThrow();

        expect(() =>
            parseConfig(`[server]
host = "127.0.0.1"
public_url = "http://127.0.0.1:47831"
[auth.local]
enabled = true
token_env = "invalid-token-env"
[auth.password]
enabled = false
`),
        ).toThrow("auth.local.token_env");
    });

    it("loads a Cloudflare Access application and rejects unsafe team domains", () => {
        const config = parseConfig(`${base}
[auth.password]
enabled = false

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
[auth.password]
enabled = false

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

    it("loads a wildcard port-sharing domain and infers its HTTPS public endpoint", () => {
        expect(
            parseConfig(`${base}
[port_sharing]
public_domain = "*.Preview.Example.com."
`).portSharing,
        ).toEqual({
            publicDomain: "preview.example.com",
            publicUrl: "https://preview.example.com",
        });

        const config = parseConfig(`${base}
[port_sharing]
public_domain = "preview.example.com"
public_url = "http://preview.example.com:8080"
`);
        expect(config.portSharing).toEqual({
            publicDomain: "preview.example.com",
            publicUrl: "http://preview.example.com:8080",
        });
        expect(() =>
            parseConfig(`${base}
[port_sharing]
public_url = "https://preview.example.com"
`),
        ).toThrow("public_domain is required");
        expect(() =>
            parseConfig(`${base}
[port_sharing]
public_domain = "preview.example.com"
public_url = "https://other.example.com"
`),
        ).toThrow("hostname must equal");
        expect(() =>
            parseConfig(`${base}
[port_sharing]
public_domain = "127.0.0.1"
public_url = "http://127.0.0.1"
`),
        ).toThrow("valid DNS hostname");
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
